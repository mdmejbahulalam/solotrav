import * as SQLite from 'expo-sqlite';
import type { GpsPoint } from '@solotrav/shared-types';
import { isValidFix } from '@solotrav/business-logic';

/**
 * Durable on-device journey store. Everything the tracker records lands here first, so a network drop,
 * an app restart or a crash cannot lose points. Sync is a separate step that reads from this store.
 */
export type SessionState = 'acquiring_location' | 'recording' | 'paused' | 'stopped';

export interface LocalSession {
  client_session_id: string;
  trip_id: string;
  user_id: string;
  journey_id: string | null;
  state: SessionState;
  started_at: number;
  paused_ms: number;
  paused_at: number | null;
  ended_at: number | null;
  next_seq: number;
  finished_remote: number;
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | undefined;
export function trackingDb(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= SQLite.openDatabaseAsync('solotrav-tracking.db').then(async (db) => {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS sessions (
        client_session_id TEXT PRIMARY KEY, trip_id TEXT NOT NULL, user_id TEXT NOT NULL, journey_id TEXT,
        state TEXT NOT NULL, started_at INTEGER NOT NULL, paused_ms INTEGER NOT NULL DEFAULT 0, paused_at INTEGER,
        ended_at INTEGER, next_seq INTEGER NOT NULL DEFAULT 0, finished_remote INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS points (
        session_id TEXT NOT NULL, seq INTEGER NOT NULL, t INTEGER NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL,
        acc REAL, alt REAL, spd REAL, synced INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (session_id, seq)
      );
      CREATE INDEX IF NOT EXISTS points_pending ON points (session_id, synced, seq);
      CREATE TABLE IF NOT EXISTS pending_notes (
        id TEXT PRIMARY KEY, trip_id TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL
      );
    `);
    return db;
  });
  return dbPromise;
}

export async function createSession(s: Pick<LocalSession, 'client_session_id' | 'trip_id' | 'user_id'>, now = Date.now()): Promise<LocalSession> {
  const db = await trackingDb();
  await db.runAsync(`INSERT INTO sessions (client_session_id, trip_id, user_id, state, started_at) VALUES (?, ?, ?, 'acquiring_location', ?)`, [s.client_session_id, s.trip_id, s.user_id, now]);
  return (await getSession(s.client_session_id)) as LocalSession;
}

export async function getSession(id: string): Promise<LocalSession | null> {
  const db = await trackingDb();
  return (await db.getFirstAsync<LocalSession>('SELECT * FROM sessions WHERE client_session_id = ?', [id])) ?? null;
}

/** The session that may currently collect location (at most one). */
export async function getActiveSession(): Promise<LocalSession | null> {
  const db = await trackingDb();
  return (await db.getFirstAsync<LocalSession>(`SELECT * FROM sessions WHERE state IN ('acquiring_location','recording','paused') ORDER BY started_at DESC LIMIT 1`)) ?? null;
}

export async function sessionsNeedingSync(): Promise<LocalSession[]> {
  const db = await trackingDb();
  return db.getAllAsync<LocalSession>(`SELECT * FROM sessions WHERE (state = 'stopped' AND finished_remote = 0) OR EXISTS (SELECT 1 FROM points p WHERE p.session_id = client_session_id AND p.synced = 0) ORDER BY started_at`);
}

export async function updateSession(id: string, patch: Partial<Omit<LocalSession, 'client_session_id'>>): Promise<void> {
  const db = await trackingDb();
  const keys = Object.keys(patch) as Array<keyof typeof patch>;
  if (!keys.length) return;
  await db.runAsync(`UPDATE sessions SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE client_session_id = ?`, [...keys.map((k) => patch[k] as SQLite.SQLiteBindValue), id]);
}

export interface Sample { t: number; lat: number; lng: number; acc?: number | null; alt?: number | null; spd?: number | null }

/**
 * Stores one sample if (and only if) it is valid, not a duplicate, and the session is allowed to collect.
 * Sequence numbers are allocated inside one exclusive transaction so they are strictly increasing and never reused.
 */
export async function insertPoint(sessionId: string, sample: Sample, now = Date.now()): Promise<GpsPoint | null> {
  if (!isValidFix(sample, now)) return null;
  const db = await trackingDb();
  let stored: GpsPoint | null = null;
  await db.withExclusiveTransactionAsync(async (tx) => {
    const s = await tx.getFirstAsync<{ state: SessionState; next_seq: number }>('SELECT state, next_seq FROM sessions WHERE client_session_id = ?', [sessionId]);
    if (!s || (s.state !== 'recording' && s.state !== 'acquiring_location')) return; // never store outside an active session
    const last = await tx.getFirstAsync<{ t: number; lat: number; lng: number }>('SELECT t, lat, lng FROM points WHERE session_id = ? ORDER BY seq DESC LIMIT 1', [sessionId]);
    if (last && last.t === sample.t && last.lat === sample.lat && last.lng === sample.lng) return; // duplicate callback
    await tx.runAsync('INSERT INTO points (session_id, seq, t, lat, lng, acc, alt, spd) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [sessionId, s.next_seq, sample.t, sample.lat, sample.lng, sample.acc ?? null, sample.alt ?? null, sample.spd ?? null]);
    await tx.runAsync(`UPDATE sessions SET next_seq = next_seq + 1, state = CASE WHEN state = 'acquiring_location' THEN 'recording' ELSE state END WHERE client_session_id = ?`, [sessionId]);
    stored = { seq: s.next_seq, t: sample.t, lat: sample.lat, lng: sample.lng, acc: sample.acc ?? null, alt: sample.alt ?? null, spd: sample.spd ?? null };
  });
  return stored;
}

type Row = { seq: number; t: number; lat: number; lng: number; acc: number | null; alt: number | null; spd: number | null };
const toPoint = (r: Row): GpsPoint => ({ seq: r.seq, t: r.t, lat: r.lat, lng: r.lng, acc: r.acc, alt: r.alt, spd: r.spd });

export async function pendingPoints(sessionId: string, limit = 500): Promise<GpsPoint[]> {
  const db = await trackingDb();
  return (await db.getAllAsync<Row>('SELECT seq, t, lat, lng, acc, alt, spd FROM points WHERE session_id = ? AND synced = 0 ORDER BY seq LIMIT ?', [sessionId, limit])).map(toPoint);
}

export async function allPoints(sessionId: string): Promise<GpsPoint[]> {
  const db = await trackingDb();
  return (await db.getAllAsync<Row>('SELECT seq, t, lat, lng, acc, alt, spd FROM points WHERE session_id = ? ORDER BY seq', [sessionId])).map(toPoint);
}

export async function markSynced(sessionId: string, maxSeq: number): Promise<void> {
  const db = await trackingDb();
  await db.runAsync('UPDATE points SET synced = 1 WHERE session_id = ? AND seq <= ?', [sessionId, maxSeq]);
}

export async function counts(sessionId: string): Promise<{ total: number; pending: number }> {
  const db = await trackingDb();
  const r = await db.getFirstAsync<{ total: number; pending: number }>('SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN synced = 0 THEN 1 ELSE 0 END), 0) AS pending FROM points WHERE session_id = ?', [sessionId]);
  return r ?? { total: 0, pending: 0 };
}

export async function deleteSession(id: string): Promise<void> {
  const db = await trackingDb();
  await db.runAsync('DELETE FROM points WHERE session_id = ?', [id]);
  await db.runAsync('DELETE FROM sessions WHERE client_session_id = ?', [id]);
}

// ---- notes written while offline
export async function queueNote(id: string, tripId: string, body: string): Promise<void> {
  const db = await trackingDb();
  await db.runAsync('INSERT OR IGNORE INTO pending_notes (id, trip_id, body, created_at) VALUES (?, ?, ?, ?)', [id, tripId, body, Date.now()]);
}
export async function pendingNotes(): Promise<Array<{ id: string; trip_id: string; body: string; created_at: number }>> {
  const db = await trackingDb();
  return db.getAllAsync('SELECT * FROM pending_notes ORDER BY created_at');
}
export async function deleteNote(id: string): Promise<void> {
  const db = await trackingDb();
  await db.runAsync('DELETE FROM pending_notes WHERE id = ?', [id]);
}

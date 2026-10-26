import NetInfo from '@react-native-community/netinfo';
import { backoffMs, toSyncPayload } from '@solotrav/business-logic';
import { api } from '@/lib/api';
import {
  deleteNote, markSynced, pendingNotes, pendingPoints, sessionsNeedingSync, updateSession, type LocalSession,
} from '@/tracking/store';

export type SyncOutcome = { ok: true; sent: number } | { ok: false; error: string; retryInMs: number };

let running: Promise<SyncOutcome> | null = null;
let attempt = 0;

/**
 * Pushes everything unsent to the server. Safe to call at any time and from several places: concurrent calls
 * share one run. The server de-duplicates on (journey, seq), so a retry after a timeout never doubles points.
 *  - failed batch  -> stop, keep every unsent point, back off exponentially
 *  - finished sessions are closed on the server with their real (device) end time and paused time
 */
export function syncAll(): Promise<SyncOutcome> {
  running ??= doSync().finally(() => { running = null; });
  return running;
}

async function doSync(): Promise<SyncOutcome> {
  const net = await NetInfo.fetch();
  if (!net.isConnected || net.isInternetReachable === false) return { ok: false, error: 'Offline', retryInMs: backoffMs(attempt) };
  let sent = 0;
  try {
    const a = api();
    for (const s of await sessionsNeedingSync()) sent += await syncSession(a, s);
    for (const n of await pendingNotes()) { await a.journal.add(n.trip_id, { title: 'Quick note', body: n.body }); await deleteNote(n.id); }
    attempt = 0;
    return { ok: true, sent };
  } catch (e) {
    attempt += 1;
    return { ok: false, error: e instanceof Error ? e.message : 'Sync failed', retryInMs: backoffMs(attempt) };
  }
}

async function syncSession(a: ReturnType<typeof api>, s: LocalSession): Promise<number> {
  let journeyId = s.journey_id;
  if (!journeyId) {
    // Creating the journey is idempotent on client_session_id, so a lost response is harmless on retry.
    const j = await a.journeys.start(s.trip_id, s.client_session_id, undefined, s.started_at);
    journeyId = j.id;
    await updateSession(s.client_session_id, { journey_id: journeyId });
  }
  let sent = 0;
  for (;;) {
    const batch = await pendingPoints(s.client_session_id, 500);
    if (!batch.length) break;
    await a.db.rpc('sync_journey_points', { p_journey: journeyId, p_points: batch.map(toSyncPayload) }).then(({ error }) => { if (error) throw new Error(error.message); });
    await markSynced(s.client_session_id, batch[batch.length - 1]!.seq);
    sent += batch.length;
  }
  if (s.state === 'stopped' && !s.finished_remote && s.ended_at) {
    await a.journeys.finish(journeyId, s.ended_at, s.paused_ms / 1000);
    await updateSession(s.client_session_id, { finished_remote: 1 });
  }
  return sent;
}

/** Retry loop: runs on connectivity changes and on a backoff timer while there is unsent data. */
let timer: ReturnType<typeof setTimeout> | undefined;
export function startAutoSync(onResult?: (r: SyncOutcome) => void): () => void {
  const trigger = async () => {
    clearTimeout(timer);
    const r = await syncAll();
    onResult?.(r);
    if (!r.ok) timer = setTimeout(trigger, r.retryInMs);
  };
  const unsub = NetInfo.addEventListener((state) => { if (state.isConnected) void trigger(); });
  void trigger();
  return () => { unsub(); clearTimeout(timer); };
}

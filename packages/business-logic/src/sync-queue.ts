import type { GpsPoint, SyncPointPayload } from '@solotrav/shared-types';
import { isValidFix } from './geo';

export const MAX_BATCH = 500;

/**
 * In-memory model of the on-device point buffer. The mobile app persists the same shape in SQLite;
 * this class holds the rules so they can be unit-tested without a device.
 *
 *  - sequence numbers are assigned once, locally, and never reused (idempotency key on the server)
 *  - points stay `pending` until the server acknowledges the batch containing them
 *  - a failed sync leaves everything pending, so a retry re-sends the same sequence numbers safely
 */
export class PointBuffer {
  private points = new Map<number, GpsPoint>();
  private synced = new Set<number>();
  private nextSeq: number;

  constructor(startSeq = 0) {
    this.nextSeq = startSeq;
  }

  /** Adds a sample. Returns the stored point, or null when it was rejected as invalid/duplicate. */
  add(sample: Omit<GpsPoint, 'seq'>, now = Date.now()): GpsPoint | null {
    if (!isValidFix(sample, now)) return null;
    const prev = this.last();
    // Same instant and place as the previous sample: a duplicate callback, not movement.
    if (prev && prev.t === sample.t && prev.lat === sample.lat && prev.lng === sample.lng) return null;
    const point: GpsPoint = { ...sample, seq: this.nextSeq++ };
    this.points.set(point.seq, point);
    return point;
  }

  last(): GpsPoint | undefined {
    const seq = this.nextSeq - 1;
    return this.points.get(seq);
  }

  get pendingCount(): number {
    return this.points.size - this.synced.size;
  }

  pending(): GpsPoint[] {
    return [...this.points.values()].filter((p) => !this.synced.has(p.seq)).sort((a, b) => a.seq - b.seq);
  }

  /** Splits pending points into batches no larger than `size` (server limit is 500). */
  batches(size = MAX_BATCH): GpsPoint[][] {
    const s = Math.min(Math.max(1, size), MAX_BATCH);
    const p = this.pending();
    const out: GpsPoint[][] = [];
    for (let i = 0; i < p.length; i += s) out.push(p.slice(i, i + s));
    return out;
  }

  /** Mark a batch as acknowledged by the server (inserted or reported as duplicate). */
  acknowledge(batch: readonly GpsPoint[]): void {
    for (const p of batch) this.synced.add(p.seq);
  }

  all(): GpsPoint[] {
    return [...this.points.values()].sort((a, b) => a.seq - b.seq);
  }

  /** Rehydrate from persisted rows after an app restart. */
  static restore(rows: readonly (GpsPoint & { synced?: boolean })[]): PointBuffer {
    const buf = new PointBuffer(rows.reduce((m, r) => Math.max(m, r.seq + 1), 0));
    for (const r of rows) {
      const { synced, ...p } = r;
      buf.points.set(p.seq, p);
      if (synced) buf.synced.add(p.seq);
    }
    return buf;
  }
}

export function toSyncPayload(p: GpsPoint): SyncPointPayload {
  return { seq: p.seq, t: new Date(p.t).toISOString(), lat: p.lat, lng: p.lng, acc: p.acc ?? null, alt: p.alt ?? null, spd: p.spd ?? null };
}

/** Exponential backoff with a cap, for retrying failed syncs. */
export function backoffMs(attempt: number, baseMs = 2000, capMs = 5 * 60_000): number {
  return Math.min(capMs, baseMs * 2 ** Math.max(0, attempt));
}

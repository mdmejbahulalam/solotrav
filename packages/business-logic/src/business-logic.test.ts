import { describe, expect, it } from 'vitest';
import type { GpsPoint } from '@solotrav/shared-types';
import {
  PointBuffer, activeDurationSeconds, backoffMs, buildRoutePreview, canEditTrip, canManageTrip, canTransition,
  canViewContent, canViewTrip, clampLimit, computeJourneyStats, decodeCursor, decodePolyline, defaultPostSharing,
  encodeCursor, encodePolyline, formatDistance, formatDuration, haversineMeters, isCollectingLocation, isValidFix,
  moveItem, nextStop, normalizeOrder, pageOf, proximityHint, simplify, toSyncPayload, transition, tripProgress,
  validateTripDates, InvalidTransitionError, MAX_BATCH,
} from './index';

const T0 = 1_760_000_000_000;
const pt = (seq: number, lat: number, lng: number, extra: Partial<GpsPoint> = {}): GpsPoint => ({ seq, t: T0 + seq * 5000, lat, lng, acc: 8, ...extra });

describe('distance', () => {
  it('matches known great-circle distances', () => {
    // 0.001 deg latitude is ~111.2 m
    expect(haversineMeters(23.8, 90.4, 23.801, 90.4)).toBeCloseTo(111.2, 0);
    // Dhaka -> Chattogram, roughly 215 km straight-line
    expect(haversineMeters(23.8103, 90.4125, 22.3569, 91.7832) / 1000).toBeGreaterThan(205);
    expect(haversineMeters(23.8103, 90.4125, 22.3569, 91.7832) / 1000).toBeLessThan(225);
    expect(haversineMeters(10, 10, 10, 10)).toBe(0);
  });

  it('validates fixes', () => {
    const ok = { lat: 23.8, lng: 90.4, t: T0, acc: 10 };
    expect(isValidFix(ok, T0)).toBe(true);
    expect(isValidFix({ ...ok, lat: 91 }, T0)).toBe(false);
    expect(isValidFix({ ...ok, lng: -181 }, T0)).toBe(false);
    expect(isValidFix({ ...ok, lat: Number.NaN }, T0)).toBe(false);
    expect(isValidFix({ ...ok, t: T0 + 3_600_000 }, T0)).toBe(false);
    expect(isValidFix({ ...ok, acc: -1 }, T0)).toBe(false);
    expect(isValidFix({ ...ok, lat: 0, lng: 0 }, T0)).toBe(false);
    expect(isValidFix({ ...ok, t: 'x' as unknown as number }, T0)).toBe(false);
  });

  it('treats proximity as a hint that accounts for accuracy', () => {
    expect(proximityHint(50, 10)).toBe('near');
    expect(proximityHint(120, 200)).toBe('uncertain');
    expect(proximityHint(1000, 20)).toBe('far');
    expect(proximityHint(100, null)).toBe('near');
  });
});

describe('journey stats', () => {
  it('sums genuine movement', () => {
    const s = computeJourneyStats([pt(0, 23.8, 90.4), pt(1, 23.801, 90.4), pt(2, 23.802, 90.4)]);
    expect(s.distanceM).toBeGreaterThan(220);
    expect(s.distanceM).toBeLessThan(225);
    expect(s.acceptedPoints).toBe(3);
  });

  it('ignores jitter, poor accuracy, duplicates, backwards clocks and implausible jumps', () => {
    const pts = [
      pt(0, 23.8, 90.4),
      pt(1, 23.800005, 90.4),                 // ~0.5 m: jitter
      pt(2, 23.801, 90.4, { acc: 300 }),      // inaccurate
      { ...pt(3, 23.801, 90.4), t: T0 },      // timestamp earlier than the last accepted point
      pt(4, 40, 90.4),                        // 1,800 km in 5 s
      pt(5, 23.801, 90.4),                    // genuine
    ];
    const s = computeJourneyStats(pts);
    expect(s.distanceM).toBeCloseTo(111, -1);
    expect(s.ignoredPoints).toBe(4);
  });

  it('is independent of input order (uses sequence numbers)', () => {
    const a = [pt(0, 23.8, 90.4), pt(1, 23.801, 90.4), pt(2, 23.802, 90.4)];
    expect(computeJourneyStats([...a].reverse())).toEqual(computeJourneyStats(a));
  });

  it('computes active duration without paused time and formats values', () => {
    expect(activeDurationSeconds(0, 600_000, 120)).toBe(480);
    expect(activeDurationSeconds(0, 60_000, 500)).toBe(0);
    expect(formatDuration(3725)).toBe('01:02:05');
    expect(formatDistance(842)).toBe('842 m');
    expect(formatDistance(12_340)).toBe('12.3 km');
    expect(formatDistance(Number.NaN)).toBe('–');
  });
});

describe('tracking state machine', () => {
  it('walks the happy path', () => {
    let s = transition('idle', { type: 'START' });
    expect(s).toBe('requesting_permission');
    s = transition(s, { type: 'PERMISSION_GRANTED' });
    s = transition(s, { type: 'FIRST_FIX' });
    expect(s).toBe('recording');
    s = transition(s, { type: 'PAUSE' });
    expect(s).toBe('paused');
    s = transition(s, { type: 'RESUME' });
    expect(s).toBe('acquiring_location');
    s = transition(s, { type: 'FIRST_FIX' });
    s = transition(s, { type: 'STOP' });
    s = transition(s, { type: 'STOPPED' });
    s = transition(s, { type: 'SYNC_START' });
    s = transition(s, { type: 'SYNC_FAILED' });
    expect(s).toBe('sync_error');
    s = transition(s, { type: 'RETRY' });
    s = transition(s, { type: 'SYNC_OK' });
    expect(s).toBe('idle');
  });

  it('returns to idle when permission is denied', () => {
    expect(transition('requesting_permission', { type: 'PERMISSION_DENIED' })).toBe('idle');
  });

  it('rejects illegal transitions and never collects location outside recording states', () => {
    expect(() => transition('idle', { type: 'PAUSE' })).toThrow(InvalidTransitionError);
    expect(() => transition('stopped', { type: 'RESUME' })).toThrow(InvalidTransitionError);
    expect(() => transition('syncing', { type: 'START' })).toThrow(InvalidTransitionError);
    expect(canTransition('paused', 'RESUME')).toBe(true);
    for (const s of ['idle', 'requesting_permission', 'paused', 'stopping', 'stopped', 'syncing', 'sync_error'] as const) {
      expect(isCollectingLocation(s)).toBe(false);
    }
    expect(isCollectingLocation('recording')).toBe(true);
  });

  it('revoking permission mid-journey ends collection', () => {
    expect(transition('recording', { type: 'PERMISSION_DENIED' })).toBe('stopping');
  });
});

describe('sync queue', () => {
  it('assigns monotonic sequence numbers and drops invalid or duplicate samples', () => {
    const b = new PointBuffer();
    const base = { t: T0, lat: 23.8, lng: 90.4, acc: 5 };
    expect(b.add(base, T0)?.seq).toBe(0);
    expect(b.add(base, T0)).toBeNull();                                    // duplicate callback
    expect(b.add({ ...base, lat: 123 }, T0)).toBeNull();                   // invalid
    expect(b.add({ ...base, t: T0 + 1000 }, T0 + 2000)?.seq).toBe(1);
    expect(b.pendingCount).toBe(2);
  });

  it('batches pending points, never exceeding the server limit, and resends the same seqs after failure', () => {
    const b = new PointBuffer();
    for (let i = 0; i < 1200; i++) b.add({ t: T0 + i * 1000, lat: 23.8 + i * 1e-5, lng: 90.4, acc: 5 }, T0 + 2_000_000);
    const batches = b.batches(10_000);
    expect(batches.map((x) => x.length)).toEqual([MAX_BATCH, MAX_BATCH, 200]);
    // first batch "fails": nothing acknowledged, so a retry produces identical batches
    expect(b.batches()[0]!.map((p) => p.seq)).toEqual(batches[0]!.map((p) => p.seq));
    b.acknowledge(batches[0]!);
    expect(b.pendingCount).toBe(700);
    expect(b.batches()[0]![0]!.seq).toBe(500);
  });

  it('survives an app restart without reusing sequence numbers', () => {
    const b = new PointBuffer();
    b.add({ t: T0, lat: 1, lng: 1 }, T0);
    b.add({ t: T0 + 1000, lat: 1.001, lng: 1 }, T0 + 1000);
    b.acknowledge([b.all()[0]!]);
    const restored = PointBuffer.restore(b.all().map((p) => ({ ...p, synced: p.seq === 0 })));
    expect(restored.pendingCount).toBe(1);
    expect(restored.add({ t: T0 + 2000, lat: 1.002, lng: 1 }, T0 + 2000)?.seq).toBe(2);
  });

  it('serialises to the wire format and backs off exponentially with a cap', () => {
    expect(toSyncPayload({ seq: 3, t: T0, lat: 1, lng: 2, acc: 4 })).toEqual({ seq: 3, t: new Date(T0).toISOString(), lat: 1, lng: 2, acc: 4, alt: null, spd: null });
    expect(backoffMs(0)).toBe(2000);
    expect(backoffMs(3)).toBe(16000);
    expect(backoffMs(30)).toBe(300000);
  });
});

describe('trip logic', () => {
  it('calculates progress, excluding skipped stops', () => {
    expect(tripProgress([])).toEqual({ total: 0, completed: 0, percent: 0 });
    expect(tripProgress([{ completion_status: 'completed' }, { completion_status: 'planned' }, { completion_status: 'skipped' }])).toEqual({ total: 2, completed: 1, percent: 50 });
    expect(tripProgress([{ completion_status: 'completed' }, { completion_status: 'planned' }, { completion_status: 'planned' }]).percent).toBe(33);
  });

  it('reorders stops immutably and ignores out-of-range moves', () => {
    const a = ['a', 'b', 'c', 'd'];
    expect(moveItem(a, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(a, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveItem(a, -1, 2)).toEqual(a);
    expect(moveItem(a, 1, 9)).toEqual(a);
    expect(a).toEqual(['a', 'b', 'c', 'd']);
    expect(normalizeOrder([{ stop_order: 7 }, { stop_order: 2 }]).map((s) => s.stop_order)).toEqual([0, 1]);
  });

  it('finds the next planned stop in order', () => {
    const stops = [
      { stop_order: 2, completion_status: 'planned' as const, id: 'c' },
      { stop_order: 0, completion_status: 'completed' as const, id: 'a' },
      { stop_order: 1, completion_status: 'skipped' as const, id: 'b' },
    ];
    expect(nextStop(stops)?.id).toBe('c');
    expect(nextStop([])).toBeUndefined();
  });

  it('allows trips without dates and rejects inverted ranges', () => {
    expect(validateTripDates(null, null)).toBeNull();
    expect(validateTripDates('2026-05-01', null)).toBeNull();
    expect(validateTripDates('2026-05-10', '2026-05-01')).toMatch(/end date/);
    expect(validateTripDates('May 1', null)).toMatch(/invalid/);
  });
});

describe('visibility and permissions', () => {
  const owner = { id: 'o', accountVisibility: 'public' as const, accountStatus: 'active' as const };
  const stranger = { id: 's', followsOwner: false, blocked: false };
  const follower = { id: 'f', followsOwner: true, blocked: false };
  const anon = { id: null, followsOwner: false, blocked: false };

  it('applies the visibility matrix', () => {
    expect(canViewContent(anon, owner, 'public')).toBe(true);
    expect(canViewContent(anon, owner, 'followers')).toBe(false);
    expect(canViewContent(stranger, owner, 'followers')).toBe(false);
    expect(canViewContent(follower, owner, 'followers')).toBe(true);
    expect(canViewContent(follower, owner, 'private')).toBe(false);
    expect(canViewContent({ id: 'o', followsOwner: false, blocked: false }, owner, 'private')).toBe(true);
  });

  it('is most restrictive of content and account visibility, and honours blocks and suspension', () => {
    const priv = { ...owner, accountVisibility: 'private' as const };
    expect(canViewContent(stranger, priv, 'public')).toBe(false);
    expect(canViewContent(follower, priv, 'public')).toBe(true);
    expect(canViewContent({ ...follower, blocked: true }, owner, 'public')).toBe(false);
    expect(canViewContent(anon, { ...owner, accountStatus: 'suspended' }, 'public')).toBe(false);
  });

  it('only shows published trips to non-members; members always see theirs', () => {
    expect(canViewTrip(anon, owner, { visibility: 'public', status: 'draft' }, null)).toBe(false);
    expect(canViewTrip(anon, owner, { visibility: 'public', status: 'planned' }, null)).toBe(true);
    expect(canViewTrip(stranger, owner, { visibility: 'private', status: 'planned' }, null)).toBe(false);
    expect(canViewTrip(stranger, owner, { visibility: 'private', status: 'draft' }, 'viewer')).toBe(true);
  });

  it('separates edit and manage permissions', () => {
    expect(canEditTrip('owner') && canEditTrip('editor')).toBe(true);
    expect(canEditTrip('viewer')).toBe(false);
    expect(canEditTrip(null)).toBe(false);
    expect(canManageTrip('editor')).toBe(false);
    expect(canManageTrip('owner')).toBe(true);
  });

  it('never defaults to sharing precise location', () => {
    expect(defaultPostSharing().includePreciseLocation).toBe(false);
  });
});

describe('polyline and route preview', () => {
  it('round-trips the reference example from the Google documentation', () => {
    const pts: Array<[number, number]> = [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]];
    expect(encodePolyline(pts)).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual(pts);
  });

  it('simplifies collinear points and keeps corners', () => {
    const line: Array<[number, number]> = [];
    for (let i = 0; i <= 50; i++) line.push([23.8 + i * 0.0001, 90.4]);
    expect(simplify(line, 5)).toHaveLength(2);
    const corner: Array<[number, number]> = [[23.8, 90.4], [23.81, 90.4], [23.81, 90.41]];
    expect(simplify(corner, 5)).toHaveLength(3);
  });

  it('builds a coarse public preview that does not contain the raw start point or precise coordinates', () => {
    const raw: Array<[number, number]> = [];
    for (let i = 0; i < 300; i++) raw.push([23.8 + i * 0.0003, 90.4 + Math.sin(i / 10) * 0.002]);
    const decoded = decodePolyline(buildRoutePreview(raw));
    expect(decoded.length).toBeGreaterThan(2);
    expect(decoded.length).toBeLessThan(raw.length);
    const start = raw[0]!;
    expect(decoded.every(([la, ln]) => haversineMeters(la, ln, start[0], start[1]) >= 250)).toBe(true);
    expect(decoded.every(([la, ln]) => Math.abs(la * 1000 - Math.round(la * 1000)) < 1e-6 && Math.abs(ln * 1000 - Math.round(ln * 1000)) < 1e-6)).toBe(true);
  });
});

describe('pagination', () => {
  it('round-trips cursors and rejects garbage', () => {
    const c = { t: '2026-01-01T00:00:00.000Z', id: '3f8a2b1c-0d4e-4f5a-9b6c-7d8e9f0a1b2c' };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
    expect(decodeCursor('%%%')).toBeNull();
    expect(decodeCursor(encodeCursor({ t: 'nope', id: c.id }))).toBeNull();
    expect(decodeCursor(encodeCursor({ t: c.t, id: "1'; drop table posts;--" }))).toBeNull();
    expect(decodeCursor(null)).toBeNull();
  });

  it('clamps limits and builds pages with a next cursor only when more rows exist', () => {
    expect(clampLimit(undefined)).toBe(20);
    expect(clampLimit(1000)).toBe(50);
    expect(clampLimit(-3)).toBe(20);
    const rows = Array.from({ length: 4 }, (_, i) => ({ id: `3f8a2b1c-0d4e-4f5a-9b6c-7d8e9f0a1b2${i}`, created_at: `2026-01-0${4 - i}T00:00:00.000Z` }));
    const p = pageOf(rows, 3);
    expect(p.items).toHaveLength(3);
    expect(decodeCursor(p.nextCursor)?.id).toBe(rows[2]!.id);
    expect(pageOf(rows.slice(0, 3), 3).nextCursor).toBeNull();
  });
});

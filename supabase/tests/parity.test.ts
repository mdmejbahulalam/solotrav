import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { computeJourneyStats, DEFAULT_STATS_SETTINGS, haversineMeters } from '../../packages/business-logic/src';
import type { GpsPoint } from '../../packages/shared-types/src';
import { as, createDb, createUser } from './harness';

let db: PGlite;
let user: string;

beforeAll(async () => {
  db = await createDb();
  user = await createUser(db, 'walker');
});
afterAll(async () => db.close());

// deterministic pseudo-random generator so failures are reproducible
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

describe('TypeScript and SQL implementations agree', () => {
  it('haversine matches within a millimetre', async () => {
    const r = await db.query<{ d: number }>('select public.haversine_m(23.8103, 90.4125, 22.3569, 91.7832) as d');
    expect(r.rows[0]!.d).toBeCloseTo(haversineMeters(23.8103, 90.4125, 22.3569, 91.7832), 3);
  });

  it('journey distance matches on a noisy synthetic walk with jitter, poor fixes and jumps', async () => {
    const rand = rng(42);
    const now = Date.now();
    const pts: GpsPoint[] = [];
    let lat = 23.8;
    let lng = 90.4;
    for (let i = 0; i < 300; i++) {
      lat += 0.00008 + (rand() - 0.5) * 0.00002;
      lng += (rand() - 0.5) * 0.00006;
      const jitterLat = (rand() - 0.5) * 0.00004; // roughly +-2 m
      const acc = rand() < 0.1 ? 80 + rand() * 50 : 4 + rand() * 25;
      const jump = rand() < 0.02 ? 0.5 : 0; // occasional wild jump
      pts.push({ seq: i, t: now - 3_000_000 + i * 5000, lat: lat + jitterLat + jump, lng, acc: Math.round(acc * 10) / 10 });
    }
    // stable-precision acc so JS and SQL see identical float values (real = float4)
    for (const p of pts) p.acc = Math.fround(p.acc as number);

    const j = await as(db, user, async (q) => {
      const t = await q.one<{ id: string }>(`insert into public.trips (owner_id, title) values ($1, 'Parity trip') returning id`, [user]);
      return q.one<{ id: string }>('select * from public.start_journey($1, gen_random_uuid())', [t.id]);
    });
    // place the session window around the synthetic samples
    await db.exec('alter table public.journeys disable trigger journeys_bw');
    await db.query(`update public.journeys set started_at = now() - interval '2 hours' where id = $1`, [j.id]);
    await db.exec('alter table public.journeys enable trigger journeys_bw');

    const payload = pts.map((p) => ({ seq: p.seq, t: new Date(p.t).toISOString(), lat: p.lat, lng: p.lng, acc: p.acc }));
    const res = await as(db, user, (q) => q.one<{ r: { inserted: number; distance_meters: number } }>('select public.sync_journey_points($1, $2::jsonb) as r', [j.id, JSON.stringify(payload)]));
    expect(res.r.inserted).toBe(300);

    const ts = computeJourneyStats(pts, DEFAULT_STATS_SETTINGS);
    expect(ts.distanceM).toBeGreaterThan(1000);
    expect(ts.ignoredPoints).toBeGreaterThan(10);
    // real/float4 storage of acc/lat can differ by a hair; allow 1 m (0.1%)
    expect(Math.abs(res.r.distance_meters - ts.distanceM)).toBeLessThanOrEqual(Math.max(1, ts.distanceM * 0.001));
  });
});

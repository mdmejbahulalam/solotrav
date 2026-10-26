import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, createDb, createUser, grantRole, rejects } from './harness';

let db: PGlite;
let alice: string, bob: string, admin: string, superAdmin: string, moderator: string;
let trip: string;

const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();
// ~111 m per 0.001 deg latitude
const pt = (seq: number, lat: number, lng: number, extra: Record<string, unknown> = {}, offsetMs = seq * 5000) => ({ seq, t: iso(offsetMs), lat, lng, acc: 8, ...extra });

beforeAll(async () => {
  db = await createDb();
  alice = await createUser(db, 'alice');
  bob = await createUser(db, 'bob');
  admin = await createUser(db, 'admin1');
  superAdmin = await createUser(db, 'root1');
  moderator = await createUser(db, 'mod1');
  await grantRole(db, admin, 'administrator');
  await grantRole(db, superAdmin, 'super_administrator');
  await grantRole(db, moderator, 'content_moderator');
  trip = (await as(db, alice, (q) => q.one<{ id: string }>(`insert into public.trips (owner_id, title, status, visibility) values ($1, 'Tracked trip', 'planned', 'public') returning id`, [alice]))).id;
});
afterAll(async () => db.close());

describe('journeys', () => {
  let journey: string;
  const session = '11111111-1111-4111-8111-111111111111';

  it('starts a journey idempotently and marks the trip as actively tracked', async () => {
    const a = await as(db, alice, (q) => q.one<{ id: string; status: string }>('select * from public.start_journey($1, $2)', [trip, session]));
    const b = await as(db, alice, (q) => q.one<{ id: string }>('select * from public.start_journey($1, $2)', [trip, session]));
    expect(b.id).toBe(a.id);
    journey = a.id;
    expect(a.status).toBe('recording');
    const t = await db.query<{ tracking_status: string; status: string }>('select tracking_status, status from public.trips where id = $1', [trip]);
    expect(t.rows[0]).toEqual({ tracking_status: 'recording', status: 'active' }); // starting a journey activates the trip
  });

  it('refuses journeys on trips the caller cannot edit and enforces one active journey per user', async () => {
    expect(await rejects(as(db, bob, (q) => q.query('select * from public.start_journey($1, gen_random_uuid())', [trip])))).toMatch(/Not allowed|row-level/i);
    expect(await rejects(as(db, alice, (q) => q.query('select * from public.start_journey($1, gen_random_uuid())', [trip])))).toMatch(/journeys_one_active_per_user|duplicate/i);
  });

  it('syncs batches idempotently: retries produce duplicates, never double points', async () => {
    const batch = [pt(0, 23.8, 90.4), pt(1, 23.801, 90.4), pt(2, 23.802, 90.4)];
    const r1 = await as(db, alice, (q) => q.one<{ r: { inserted: number; duplicates: number; rejected: number } }>('select public.sync_journey_points($1, $2::jsonb) as r', [journey, JSON.stringify(batch)]));
    expect(r1.r).toMatchObject({ inserted: 3, duplicates: 0, rejected: 0 });
    const r2 = await as(db, alice, (q) => q.one<{ r: { inserted: number; duplicates: number } }>('select public.sync_journey_points($1, $2::jsonb) as r', [journey, JSON.stringify(batch)]));
    expect(r2.r).toMatchObject({ inserted: 0, duplicates: 3 });
    const n = await db.query<{ n: string }>('select count(*)::text n from public.journey_points where journey_id = $1', [journey]);
    expect(n.rows[0]!.n).toBe('3');
  });

  it('rejects malformed, out-of-range and future points individually', async () => {
    const batch = [pt(10, 91, 0), pt(11, 10, 181), pt(12, 10, 10, { acc: -5 }), pt(13, 10, 10, {}, 3_600_000), { seq: 14, t: 'not-a-date', lat: 1, lng: 1 }, pt(15, 23.803, 90.4)];
    const r = await as(db, alice, (q) => q.one<{ r: { inserted: number; rejected: number } }>('select public.sync_journey_points($1, $2::jsonb) as r', [journey, JSON.stringify(batch)]));
    expect(r.r).toMatchObject({ inserted: 1, rejected: 5 });
  });

  it('computes server-side distance with documented filters (jitter ignored, jumps ignored, poor accuracy ignored)', async () => {
    const batch = [
      pt(20, 23.8030, 90.4001),            // ~10 m east: counted
      pt(21, 23.80301, 90.40011),          // ~1.5 m: jitter, ignored
      pt(22, 23.8040, 90.4001, { acc: 200 }), // inaccurate sample: ignored
      pt(23, 40.0, 90.4001, {}, 20 * 5000 + 1000), // teleport 1000 km in 1 s: implausible, ignored
    ];
    const r = await as(db, alice, (q) => q.one<{ r: { distance_meters: number } }>('select public.sync_journey_points($1, $2::jsonb) as r', [journey, JSON.stringify(batch)]));
    // seq 0->1->2 (222 m) + 2->15 (111 m) + ~10 m for seq 20
    expect(r.r.distance_meters).toBeGreaterThan(330);
    expect(r.r.distance_meters).toBeLessThan(360);
  });

  it('keeps pause time out of active duration and forbids resuming a stopped journey', async () => {
    await as(db, alice, (q) => q.query(`update public.journeys set status = 'paused' where id = $1`, [journey]));
    await db.exec('alter table public.journeys disable trigger journeys_bw');
    await db.query(`update public.journeys set paused_at = now() - interval '120 seconds', started_at = now() - interval '600 seconds' where id = $1`, [journey]);
    await db.exec('alter table public.journeys enable trigger journeys_bw');
    await as(db, alice, (q) => q.query(`update public.journeys set status = 'recording' where id = $1`, [journey]));
    const s = await as(db, alice, (q) => q.one<{ paused_seconds: number }>(`update public.journeys set status = 'stopped' where id = $1 returning paused_seconds`, [journey]));
    expect(s.paused_seconds).toBeGreaterThanOrEqual(120);
    const j = await db.query<{ duration_seconds: number; ended_at: string }>('select duration_seconds, ended_at from public.journeys where id = $1', [journey]);
    expect(j.rows[0]!.duration_seconds).toBeGreaterThan(400);
    expect(j.rows[0]!.duration_seconds).toBeLessThanOrEqual(480);
    expect(await rejects(as(db, alice, (q) => q.query(`update public.journeys set status = 'recording' where id = $1`, [journey])))).toMatch(/cannot be resumed/);
    const t = await db.query<{ tracking_status: string }>('select tracking_status from public.trips where id = $1', [trip]);
    expect(t.rows[0]!.tracking_status).toBe('stopped');
  });

  it('ignores client-supplied stats on update', async () => {
    const r = await as(db, alice, (q) => q.one<{ distance_meters: number }>(`update public.journeys set distance_meters = 999999 where id = $1 returning distance_meters`, [journey]));
    expect(r.distance_meters).toBeLessThan(1000);
  });

  it('accepts late sync shortly after stop but not points outside the session window', async () => {
    const late = await as(db, alice, (q) => q.one<{ r: { inserted: number } }>('select public.sync_journey_points($1, $2::jsonb) as r', [journey, JSON.stringify([pt(30, 23.81, 90.4, {}, -10_000)])]));
    expect(late.r.inserted).toBe(1);
    const way = await as(db, alice, (q) => q.one<{ r: { inserted: number; rejected: number } }>('select public.sync_journey_points($1, $2::jsonb) as r', [journey, JSON.stringify([pt(31, 23.81, 90.4, {}, 600_000)])]));
    expect(way.r).toMatchObject({ inserted: 0, rejected: 1 });
  });

  it('User B cannot read, write or sync User A\'s GPS history', async () => {
    expect(await as(db, bob, (q) => q.query('select id from public.journey_points'))).toHaveLength(0);
    expect(await as(db, bob, (q) => q.query('select id from public.journeys'))).toHaveLength(0);
    expect(await rejects(as(db, bob, (q) => q.query('select public.sync_journey_points($1, $2::jsonb)', [journey, JSON.stringify([pt(1, 1, 1)])])))).toMatch(/not found|row-level|42501/i);
    expect(await as(db, bob, (q) => q.query('delete from public.journey_points where journey_id = $1 returning id', [journey]))).toHaveLength(0);
  });

  it('public readers of a public trip still cannot see raw points; only an owner-published preview is public', async () => {
    expect(await as(db, null, (q) => q.query('select id from public.journey_points'))).toHaveLength(0);
    const pub = await as(db, null, (q) => q.one<{ j: { route_preview: unknown; stops: unknown[] } }>(`select public.get_public_trip((select slug from public.trips where id = '${trip}')) as j`));
    expect(pub.j.route_preview).toBeNull();
    expect(JSON.stringify(pub.j)).not.toMatch(/journey|latitude":\s*23\.80/);
    expect(await rejects(as(db, bob, (q) => q.query(`insert into public.trip_route_previews (trip_id, encoded_polyline, published_by) values ($1, 'abc', $2)`, [trip, bob])))).toMatch(/row-level security/i);
    await as(db, alice, (q) => q.query(`insert into public.trip_route_previews (trip_id, encoded_polyline, published_by) values ($1, '_p~iF~ps|U_ulLnnqC', $2)`, [trip, alice]));
    const pub2 = await as(db, null, (q) => q.one<{ j: { route_preview: { encoded_polyline: string } } }>(`select public.get_public_trip((select slug from public.trips where id = '${trip}')) as j`));
    expect(pub2.j.route_preview.encoded_polyline).toBe('_p~iF~ps|U_ulLnnqC');
  });

  it('shares with collaborators only when the owner explicitly turns it on', async () => {
    await as(db, alice, (q) => q.query(`insert into public.trip_members (trip_id, user_id, role) values ($1, $2, 'viewer')`, [trip, bob]));
    await as(db, bob, (q) => q.query(`update public.trip_members set invitation_status = 'accepted' where trip_id = $1 and user_id = $2`, [trip, bob]));
    expect(await as(db, bob, (q) => q.query('select id from public.journey_points'))).toHaveLength(0);
    await as(db, alice, (q) => q.query(`update public.journeys set share_with_collaborators = true where id = $1`, [journey]));
    expect((await as(db, bob, (q) => q.query('select id from public.journey_points'))).length).toBeGreaterThan(0);
    await as(db, alice, (q) => q.query(`update public.journeys set share_with_collaborators = false where id = $1`, [journey]));
    expect(await as(db, bob, (q) => q.query('select id from public.journey_points'))).toHaveLength(0);
  });
});

describe('staff access to location data', () => {
  let journey: string;
  beforeAll(async () => {
    const r = await db.query<{ id: string }>('select id from public.journeys limit 1');
    journey = r.rows[0]!.id;
  });

  it('ordinary administrators and moderators cannot read raw points directly', async () => {
    expect(await as(db, admin, (q) => q.query('select id from public.journey_points'))).toHaveLength(0);
    expect(await as(db, moderator, (q) => q.query('select id from public.journeys'))).toHaveLength(0);
  });

  it('refuses the exceptional-access function without the permission', async () => {
    expect(await rejects(as(db, admin, (q) => q.query('select * from public.staff_read_journey_points($1, $2)', [journey, 'A sufficiently long justification text'])))).toMatch(/Missing permission/);
    expect(await rejects(as(db, alice, (q) => q.query('select * from public.staff_read_journey_points($1, $2)', [journey, 'A sufficiently long justification text'])))).toMatch(/Missing permission/);
  });

  it('requires a detailed justification and writes an audit record', async () => {
    expect(await rejects(as(db, superAdmin, (q) => q.query('select * from public.staff_read_journey_points($1, $2)', [journey, 'because'])))).toMatch(/justification/);
    const rows = await as(db, superAdmin, (q) => q.query('select * from public.staff_read_journey_points($1, $2)', [journey, 'Legal request #4821: court-ordered safety check']));
    expect(rows.length).toBeGreaterThan(0);
    const log = await db.query<{ action: string; reason: string }>(`select action, reason from public.audit_logs where action = 'sensitive.location.read'`);
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0]!.reason).toContain('court-ordered');
  });
});

describe('offline journeys keep their real times', () => {
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

  it('accepts a journey that started hours ago and points recorded back then', async () => {
    const t = (await as(db, alice, (q) => q.one<{ id: string }>(`insert into public.trips (owner_id, title, status) values ($1, 'Offline trip', 'planned') returning id`, [alice]))).id;
    const sid = '22222222-2222-4222-8222-222222222222';
    const j = await as(db, alice, (q) => q.one<{ id: string; started_at: string }>('select * from public.start_journey($1, $2, null, $3::timestamptz)', [t, sid, hoursAgo(3)]));
    expect(Date.now() - Date.parse(j.started_at)).toBeGreaterThan(2.9 * 3_600_000);
    const base = Date.now() - 3 * 3_600_000 + 60_000;
    const pts = Array.from({ length: 6 }, (_, i) => ({ seq: i, t: new Date(base + i * 5000).toISOString(), lat: 23.8 + i * 0.001, lng: 90.4, acc: 6 }));
    const r = await as(db, alice, (q) => q.one<{ r: { inserted: number; rejected: number } }>('select public.sync_journey_points($1, $2::jsonb) as r', [j.id, JSON.stringify(pts)]));
    expect(r.r).toMatchObject({ inserted: 6, rejected: 0 });
    const done = await as(db, alice, (q) => q.one<{ status: string; duration_seconds: number; paused_seconds: number; ended_at: string }>('select * from public.finish_journey($1, $2::timestamptz, 600)', [j.id, hoursAgo(1)]));
    expect(done.status).toBe('stopped');
    expect(done.paused_seconds).toBe(600);
    expect(done.duration_seconds).toBeGreaterThan(2 * 3600 - 700);
    expect(done.duration_seconds).toBeLessThan(2 * 3600 - 500);
    expect(done.ended_at).toBeTruthy();
  });

  it('is idempotent and rejects impossible times', async () => {
    const t = (await as(db, alice, (q) => q.one<{ id: string }>(`insert into public.trips (owner_id, title, status) values ($1, 'Bounds trip', 'planned') returning id`, [alice]))).id;
    expect(await rejects(as(db, alice, (q) => q.query('select * from public.start_journey($1, gen_random_uuid(), null, $2::timestamptz)', [t, new Date(Date.now() + 3_600_000).toISOString()])))).toMatch(/future/);
    expect(await rejects(as(db, alice, (q) => q.query('select * from public.start_journey($1, gen_random_uuid(), null, $2::timestamptz)', [t, new Date(Date.now() - 9 * 86_400_000).toISOString()])))).toMatch(/too old/);
    const j = await as(db, alice, (q) => q.one<{ id: string }>('select * from public.start_journey($1, gen_random_uuid(), null, $2::timestamptz)', [t, hoursAgo(2)]));
    expect(await rejects(as(db, alice, (q) => q.query('select * from public.finish_journey($1, $2::timestamptz, 0)', [j.id, hoursAgo(5)])))).toMatch(/precedes/);
    expect(await rejects(as(db, alice, (q) => q.query('select * from public.finish_journey($1, $2::timestamptz, 99999)', [j.id, hoursAgo(1)])))).toMatch(/paused time/);
    expect(await rejects(as(db, alice, (q) => q.query('select * from public.finish_journey($1, $2::timestamptz, 0)', [j.id, new Date(Date.now() + 3_600_000).toISOString()])))).toMatch(/future/);
    const a = await as(db, alice, (q) => q.one<{ ended_at: string }>('select * from public.finish_journey($1, $2::timestamptz, 0)', [j.id, hoursAgo(1)]));
    const b = await as(db, alice, (q) => q.one<{ ended_at: string }>('select * from public.finish_journey($1, $2::timestamptz, 0)', [j.id, hoursAgo(0.5)]));
    expect(new Date(b.ended_at).getTime()).toBe(new Date(a.ended_at).getTime());
  });

  it('does not let another user finish or read the journey', async () => {
    const j = await db.query<{ id: string }>('select id from public.journeys limit 1');
    expect(await rejects(as(db, bob, (q) => q.query('select * from public.finish_journey($1, now(), 0)', [j.rows[0]!.id])))).toMatch(/not found/i);
  });
});

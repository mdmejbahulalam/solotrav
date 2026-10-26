import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, createDb, createUser, rejects } from './harness';

let db: PGlite;
let alice: string, bob: string, carol: string, dave: string;

beforeAll(async () => {
  db = await createDb();
  alice = await createUser(db, 'alice');
  bob = await createUser(db, 'bob');
  carol = await createUser(db, 'carol');
  dave = await createUser(db, 'dave');
});
afterAll(async () => db.close());

describe('profiles', () => {
  it('creates a profile from the signup trigger with a safe unique username', async () => {
    const dup = await createUser(db, 'alice'); // same desired username
    const p = await db.query<{ username: string }>('select username from public.profiles where id = $1', [dup]);
    expect(p.rows[0]!.username).toBe('alice1');
  });

  it('lets users edit only their own profile', async () => {
    await as(db, alice, (q) => q.query(`update public.profiles set bio = 'hi' where id = $1`, [alice]));
    const other = await as(db, alice, (q) => q.query(`update public.profiles set bio = 'pwned' where id = $1 returning id`, [bob]));
    expect(other).toHaveLength(0);
    const bio = await db.query<{ bio: string }>('select bio from public.profiles where id = $1', [bob]);
    expect(bio.rows[0]!.bio).toBe('');
  });

  it('prevents users from changing their own account status or id', async () => {
    await as(db, bob, (q) => q.query(`update public.profiles set account_status = 'suspended' where id = $1`, [bob]));
    const r = await db.query<{ account_status: string }>('select account_status from public.profiles where id = $1', [bob]);
    expect(r.rows[0]!.account_status).toBe('active');
  });

  it('validates username format', async () => {
    const msg = await rejects(as(db, alice, (q) => q.query(`update public.profiles set username = 'Bad Name!' where id = $1`, [alice])));
    expect(msg).toMatch(/username_format|violates check/i);
  });

  it('exposes username availability to anonymous callers without exposing profiles', async () => {
    expect(await as(db, null, (q) => q.one<{ username_available: boolean }>(`select public.username_available('alice') as username_available`))).toEqual({ username_available: false });
    expect((await as(db, null, (q) => q.one<{ username_available: boolean }>(`select public.username_available('zed_new') as username_available`))).username_available).toBe(true);
  });

  it('hides private accounts from non-followers but still offers a minimal card', async () => {
    await as(db, carol, (q) => q.query(`update public.profiles set account_visibility = 'private' where id = $1`, [carol]));
    expect(await as(db, bob, (q) => q.query('select id from public.profiles where id = $1', [carol]))).toHaveLength(0);
    expect(await as(db, null, (q) => q.query('select id from public.profiles where id = $1', [carol]))).toHaveLength(0);
    const card = await as(db, bob, (q) => q.query(`select * from public.get_profile_card('carol')`));
    expect(card).toHaveLength(1);
    expect(Object.keys(card[0]!).sort()).toEqual(['account_visibility', 'avatar_url', 'display_name', 'id', 'username']);
    await as(db, carol, (q) => q.query(`update public.profiles set account_visibility = 'public' where id = $1`, [carol]));
  });
});

describe('follows', () => {
  it('follows a public account immediately and notifies them', async () => {
    const r = await as(db, bob, (q) => q.one<{ status: string }>(`insert into public.follows (follower_id, following_id) values ($1, $2) returning status`, [bob, alice]));
    expect(r.status).toBe('accepted');
    const n = await as(db, alice, (q) => q.query(`select notification_type from public.notifications`));
    expect(n.map((x) => (x as { notification_type: string }).notification_type)).toContain('follow');
  });

  it('ignores a client-supplied status (cannot self-approve on a private account)', async () => {
    await as(db, dave, (q) => q.query(`update public.profiles set account_visibility = 'private' where id = $1`, [dave]));
    const r = await as(db, bob, (q) => q.one<{ status: string }>(`insert into public.follows (follower_id, following_id, status) values ($1, $2, 'accepted') returning status`, [bob, dave]));
    expect(r.status).toBe('pending');
  });

  it('lets only the target approve a request', async () => {
    const self = await as(db, bob, (q) => q.query(`update public.follows set status = 'accepted' where follower_id = $1 and following_id = $2 returning id`, [bob, dave]));
    expect(self).toHaveLength(0);
    const ok = await as(db, dave, (q) => q.query(`update public.follows set status = 'accepted' where follower_id = $1 and following_id = $2 returning id`, [bob, dave]));
    expect(ok).toHaveLength(1);
  });

  it('rejects self-follows, duplicates and impersonation', async () => {
    expect(await rejects(as(db, alice, (q) => q.query(`insert into public.follows (follower_id, following_id) values ($1, $1)`, [alice])))).toMatch(/violates|follows_no_self/i);
    expect(await rejects(as(db, bob, (q) => q.query(`insert into public.follows (follower_id, following_id) values ($1, $2)`, [bob, alice])))).toMatch(/duplicate|unique/i);
    expect(await rejects(as(db, bob, (q) => q.query(`insert into public.follows (follower_id, following_id) values ($1, $2)`, [alice, carol])))).toMatch(/row-level security/i);
  });

  it('blocking removes follows and prevents following again', async () => {
    await as(db, alice, (q) => q.query(`insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)`, [alice, bob]));
    const rel = await db.query('select 1 from public.follows where follower_id = $1 and following_id = $2', [bob, alice]);
    expect(rel.rows).toHaveLength(0);
    expect(await rejects(as(db, bob, (q) => q.query(`insert into public.follows (follower_id, following_id) values ($1, $2)`, [bob, alice])))).toMatch(/Cannot follow/);
    // and bob can no longer see alice's profile
    expect(await as(db, bob, (q) => q.query('select id from public.profiles where id = $1', [alice]))).toHaveLength(0);
    await as(db, alice, (q) => q.query(`delete from public.user_blocks where blocker_id = $1`, [alice]));
  });
});

describe('trips', () => {
  let privateTrip: string, publicTrip: string, draftPublic: string, followersTrip: string;

  beforeAll(async () => {
    await as(db, alice, async (q) => {
      privateTrip = (await q.one<{ id: string }>(`insert into public.trips (owner_id, title, status) values ($1, 'Private plan', 'planned') returning id`, [alice])).id;
      publicTrip = (await q.one<{ id: string }>(`insert into public.trips (owner_id, title, status, visibility) values ($1, 'Public journey', 'planned', 'public') returning id`, [alice])).id;
      draftPublic = (await q.one<{ id: string }>(`insert into public.trips (owner_id, title, status, visibility) values ($1, 'Unfinished public', 'draft', 'public') returning id`, [alice])).id;
      followersTrip = (await q.one<{ id: string }>(`insert into public.trips (owner_id, title, status, visibility) values ($1, 'Followers trip', 'planned', 'followers') returning id`, [alice])).id;
    });
    await as(db, carol, (q) => q.query(`insert into public.follows (follower_id, following_id) values ($1, $2)`, [carol, alice]));
  });

  it('User A cannot see User B\'s private or draft trip; public trips are visible to anyone', async () => {
    const asBob = (await as(db, bob, (q) => q.query<{ id: string }>('select id from public.trips'))).map((r) => r.id);
    expect(asBob).toContain(publicTrip);
    expect(asBob).not.toContain(privateTrip);
    expect(asBob).not.toContain(draftPublic);
    expect(asBob).not.toContain(followersTrip);
    const anon = (await as(db, null, (q) => q.query<{ id: string }>('select id from public.trips'))).map((r) => r.id);
    expect(anon).toEqual([publicTrip]);
  });

  it('followers-only trips require an accepted follow', async () => {
    const asCarol = (await as(db, carol, (q) => q.query<{ id: string }>('select id from public.trips'))).map((r) => r.id);
    expect(asCarol).toContain(followersTrip);
    expect(asCarol).not.toContain(privateTrip);
  });

  it('User A cannot modify or delete User B\'s trip', async () => {
    const upd = await as(db, bob, (q) => q.query(`update public.trips set title = 'hijacked' where id = $1 returning id`, [publicTrip]));
    expect(upd).toHaveLength(0);
    const del = await as(db, bob, (q) => q.query(`delete from public.trips where id = $1 returning id`, [publicTrip]));
    expect(del).toHaveLength(0);
    expect(await rejects(as(db, bob, (q) => q.query(`insert into public.trips (owner_id, title) values ($1, 'as alice')`, [alice])))).toMatch(/row-level security/i);
  });

  it('validates dates and title length', async () => {
    expect(await rejects(as(db, alice, (q) => q.query(`insert into public.trips (owner_id, title, start_date, end_date) values ($1, 'Backwards', '2026-05-10', '2026-05-01')`, [alice])))).toMatch(/trips_dates/);
    expect(await rejects(as(db, alice, (q) => q.query(`insert into public.trips (owner_id, title) values ($1, 'ab')`, [alice])))).toMatch(/trips_title_len/);
    const ok = await as(db, alice, (q) => q.one(`insert into public.trips (owner_id, title) values ($1, 'No dates at all') returning id`, [alice]));
    expect(ok).toBeTruthy();
  });

  it('generates a slug, sets published_at on publication and ignores client tracking_status', async () => {
    const t = await as(db, alice, (q) => q.one<{ slug: string; published_at: string | null; tracking_status: string }>(
      `insert into public.trips (owner_id, title, status, tracking_status, slug) values ($1, 'Slug Test!', 'planned', 'recording', 'evil') returning slug, published_at, tracking_status`, [alice]));
    expect(t.slug).toMatch(/^slug-test-[0-9a-f]{8}$/);
    expect(t.published_at).not.toBeNull();
    expect(t.tracking_status).toBe('idle');
  });

  it('supports owner/editor/viewer collaboration with invitation flow', async () => {
    await as(db, alice, (q) => q.query(`insert into public.trip_members (trip_id, user_id, role) values ($1, $2, 'editor')`, [privateTrip, bob]));
    // invited users can see the trip but cannot edit before accepting
    expect(await as(db, bob, (q) => q.query('select id from public.trips where id = $1', [privateTrip]))).toHaveLength(1);
    expect(await as(db, bob, (q) => q.query(`update public.trips set description = 'x' where id = $1 returning id`, [privateTrip]))).toHaveLength(0);
    // cannot self-promote while answering
    expect(await rejects(as(db, bob, (q) => q.query(`update public.trip_members set role = 'owner', invitation_status = 'accepted' where trip_id = $1 and user_id = $2`, [privateTrip, bob])))).toMatch(/own role|owner/i);
    await as(db, bob, (q) => q.query(`update public.trip_members set invitation_status = 'accepted' where trip_id = $1 and user_id = $2`, [privateTrip, bob]));
    // editor can edit content but not publish or change visibility
    const e = await as(db, bob, (q) => q.one<{ visibility: string; description: string }>(`update public.trips set description = 'added by bob', visibility = 'public', status = 'completed' where id = $1 returning visibility, description`, [privateTrip]));
    expect(e.description).toBe('added by bob');
    expect(e.visibility).toBe('private');
    // viewer cannot edit
    await as(db, alice, (q) => q.query(`insert into public.trip_members (trip_id, user_id, role) values ($1, $2, 'viewer')`, [privateTrip, carol]));
    await as(db, carol, (q) => q.query(`update public.trip_members set invitation_status = 'accepted' where trip_id = $1 and user_id = $2`, [privateTrip, carol]));
    expect(await as(db, carol, (q) => q.query(`update public.trips set description = 'nope' where id = $1 returning id`, [privateTrip]))).toHaveLength(0);
    expect(await as(db, carol, (q) => q.query('select id from public.trips where id = $1', [privateTrip]))).toHaveLength(1);
    // non-owner cannot invite
    expect(await rejects(as(db, bob, (q) => q.query(`insert into public.trip_members (trip_id, user_id, role) values ($1, $2, 'viewer')`, [privateTrip, dave])))).toMatch(/row-level security/i);
  });
});

describe('stops, ordering and progress', () => {
  let trip: string, destA: string, destB: string, destC: string;
  let stops: string[];

  beforeAll(async () => {
    const mk = async (name: string, slug: string, lat: number, lng: number) => (await db.query<{ id: string }>(
      `insert into public.destinations (source, slug, name, latitude, longitude, category) values ('curated', $1, $2, $3, $4, 'beaches') returning id`, [slug, name, lat, lng])).rows[0]!.id;
    destA = await mk("Cox's Bazar", 'coxs-bazar', 21.4272, 92.0058);
    destB = await mk('Sajek Valley', 'sajek-valley', 23.38, 92.293);
    destC = await mk('Sylhet', 'sylhet', 24.8949, 91.8687);
    trip = (await as(db, alice, (q) => q.one<{ id: string }>(`insert into public.trips (owner_id, title, status) values ($1, 'Stops trip', 'planned') returning id`, [alice]))).id;
    stops = [];
    for (const d of [destA, destB, destC]) {
      stops.push((await as(db, alice, (q) => q.one<{ id: string }>(`insert into public.trip_stops (trip_id, destination_id, stop_order) values ($1, $2, -1) returning id`, [trip, d]))).id);
    }
  });

  it('auto-assigns sequential order when none is given', async () => {
    const r = await as(db, alice, (q) => q.query<{ stop_order: number }>('select stop_order from public.trip_stops where trip_id = $1 order by stop_order', [trip]));
    expect(r.map((x) => x.stop_order)).toEqual([0, 1, 2]);
  });

  it('reorders atomically and rejects id sets that do not match', async () => {
    await as(db, alice, (q) => q.query('select public.reorder_trip_stops($1, $2)', [trip, [stops[2], stops[0], stops[1]]]));
    const r = await as(db, alice, (q) => q.query<{ id: string }>('select id from public.trip_stops where trip_id = $1 order by stop_order', [trip]));
    expect(r.map((x) => x.id)).toEqual([stops[2], stops[0], stops[1]]);
    expect(await rejects(as(db, alice, (q) => q.query('select public.reorder_trip_stops($1, $2)', [trip, [stops[0], stops[1]]])))).toMatch(/match the trip stops/);
    expect(await rejects(as(db, bob, (q) => q.query('select public.reorder_trip_stops($1, $2)', [trip, [stops[0], stops[1], stops[2]]])))).toMatch(/Not allowed/);
  });

  it('rejects duplicate stop_order values at commit', async () => {
    expect(await rejects(as(db, alice, (q) => q.query('update public.trip_stops set stop_order = 0 where id = $1', [stops[1]])))).toMatch(/trip_stops_order|duplicate/i);
  });

  it('completes a stop, records the method, logs the check-in and updates progress', async () => {
    const r = await as(db, alice, (q) => q.one<{ completion_status: string; completion_method: string; completed_at: string }>(
      `update public.trip_stops set completion_status = 'completed', completion_method = 'gps_assisted', completion_distance_m = 42 where id = $1 returning completion_status, completion_method, completed_at`, [stops[0]]));
    expect(r.completion_status).toBe('completed');
    expect(r.completion_method).toBe('gps_assisted');
    expect(r.completed_at).toBeTruthy();
    const p = await as(db, alice, (q) => q.one<{ total: number; completed: number; percent: number }>('select * from public.trip_progress($1)', [trip]));
    expect(p).toEqual({ total: 3, completed: 1, percent: 33 });
    const ev = await as(db, alice, (q) => q.query('select method, distance_m from public.check_in_events'));
    expect(ev).toEqual([{ method: 'gps_assisted', distance_m: 42 }]);
  });

  it('defaults to manual completion and un-completing clears the evidence', async () => {
    const r = await as(db, alice, (q) => q.one<{ completion_method: string }>(`update public.trip_stops set completion_status = 'completed' where id = $1 returning completion_method`, [stops[1]]));
    expect(r.completion_method).toBe('manual');
    const u = await as(db, alice, (q) => q.one<{ completed_at: string | null; completion_method: string | null }>(`update public.trip_stops set completion_status = 'planned' where id = $1 returning completed_at, completion_method`, [stops[1]]));
    expect(u).toEqual({ completed_at: null, completion_method: null });
  });

  it('prevents non-editors from touching stops', async () => {
    expect(await as(db, bob, (q) => q.query(`update public.trip_stops set notes = 'x' where id = $1 returning id`, [stops[0]]))).toHaveLength(0);
    expect(await rejects(as(db, bob, (q) => q.query(`insert into public.trip_stops (trip_id, destination_id) values ($1, $2)`, [trip, destA])))).toMatch(/row-level security/i);
  });
});

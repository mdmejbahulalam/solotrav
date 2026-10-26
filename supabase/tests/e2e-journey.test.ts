import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, createDb, createUser } from './harness';
import { PointBuffer, buildRoutePreview, computeJourneyStats, toSyncPayload, tripProgress } from '../../packages/business-logic/src';
import { buildStoragePath } from '../../packages/validation/src';

/**
 * End-to-end flows at the data layer, driven the same way the apps drive them (same RPCs and tables, same
 * business-logic package). GPS is simulated with mocked coordinates; no physical journey is needed.
 */
let db: PGlite;
beforeAll(async () => { db = await createDb(); });
afterAll(async () => db.close());

async function seedDestinations() {
  const mk = async (slug: string, name: string, lat: number, lng: number, cat: string) =>
    (await db.query<{ id: string }>(`insert into public.destinations (source, slug, name, latitude, longitude, category) values ('curated', $1, $2, $3, $4, $5) returning id`, [slug, name, lat, lng, cat])).rows[0]!.id;
  return [await mk('coxs-bazar', "Cox's Bazar", 21.4272, 92.0058, 'beaches'), await mk('sajek-valley', 'Sajek Valley', 23.38, 92.293, 'mountains'), await mk('sylhet', 'Sylhet', 24.8949, 91.8687, 'nature')];
}

describe('Register → Create Trip → Add Destinations → Publish → Track → Complete → Post → Progress', () => {
  it('works end to end for one traveler', async () => {
    const dests = await seedDestinations();
    const anika = await createUser(db, 'anika', { display_name: 'Anika R.' });                 // register (profile created by trigger)
    const profile = await db.query<{ username: string; onboarded_at: string | null }>('select username, onboarded_at from public.profiles where id = $1', [anika]);
    expect(profile.rows[0]).toMatchObject({ username: 'anika', onboarded_at: null });
    await as(db, anika, (q) => q.query(`update public.profiles set travel_interests = array['Mountains','Photography'], onboarded_at = now() where id = $1`, [anika]));

    const trip = await as(db, anika, (q) => q.one<{ id: string; status: string }>(`insert into public.trips (owner_id, title, visibility) values ($1, 'Hill Escape', 'public') returning id, status`, [anika]));
    expect(trip.status).toBe('draft');                                                          // create (draft, no dates)
    const stopIds: string[] = [];
    for (const d of dests) stopIds.push((await as(db, anika, (q) => q.one<{ id: string }>(`insert into public.trip_stops (trip_id, destination_id, stop_order) values ($1, $2, -1) returning id`, [trip.id, d]))).id);
    await as(db, anika, (q) => q.query('select public.reorder_trip_stops($1, $2)', [trip.id, [stopIds[1], stopIds[0], stopIds[2]]]));   // reorder
    await as(db, anika, (q) => q.query(`update public.trips set status = 'planned' where id = $1`, [trip.id]));                           // publish
    expect((await as(db, null, (q) => q.query('select id from public.trips'))).length).toBe(1);                                          // visible to the public

    // start tracking with simulated GPS: buffer on-device, then sync in batches
    const sessionId = '33333333-3333-4333-8333-333333333333';
    const t0 = Date.now() - 20 * 60_000;   // the journey was started 20 minutes ago on the device (recorded offline)
    const journey = await as(db, anika, (q) => q.one<{ id: string }>('select * from public.start_journey($1, $2, null, $3::timestamptz)', [trip.id, sessionId, new Date(t0 - 1000).toISOString()]));
    const buf = new PointBuffer();
    for (let i = 0; i < 120; i++) buf.add({ t: t0 + i * 5000, lat: 23.38 + i * 0.0002, lng: 92.293 + Math.sin(i / 7) * 0.0003, acc: 5 + (i % 7) }, t0 + 700_000);
    expect(buf.pendingCount).toBe(120);
    let inserted = 0;
    for (const batch of buf.batches(50)) {
      const r = await as(db, anika, (q) => q.one<{ r: { inserted: number } }>('select public.sync_journey_points($1, $2::jsonb) as r', [journey.id, JSON.stringify(batch.map(toSyncPayload))]));
      inserted += r.r.inserted; buf.acknowledge(batch);
    }
    expect(inserted).toBe(120);
    expect(buf.pendingCount).toBe(0);

    // a retry of an already-acknowledged batch changes nothing
    const again = await as(db, anika, (q) => q.one<{ r: { inserted: number; duplicates: number } }>('select public.sync_journey_points($1, $2::jsonb) as r', [journey.id, JSON.stringify(buf.all().slice(0, 50).map(toSyncPayload))]));
    expect(again.r).toMatchObject({ inserted: 0, duplicates: 50 });

    // complete a destination (GPS-assisted) and write a travel post for it
    await as(db, anika, (q) => q.query(`update public.trip_stops set completion_status = 'completed', completion_method = 'gps_assisted', completion_distance_m = 35 where id = $1`, [stopIds[1]]));
    const post = await as(db, anika, (q) => q.one<{ id: string }>(`insert into public.posts (author_id, trip_id, destination_id, post_type, caption, visibility) values ($1, $2, $3, 'checkin', 'Made it! #sajek', 'public') returning id`, [anika, trip.id, dests[1]]));
    const path = buildStoragePath(anika, 'jpg');
    await as(db, anika, (q) => q.query(`insert into public.post_media (post_id, storage_path, media_type, width, height) values ($1, $2, 'image', 800, 600)`, [post.id, path]));

    // stop, and the server stats match the client's own calculation
    await as(db, anika, (q) => q.query(`select * from public.finish_journey($1, now(), 0)`, [journey.id]));
    const j = await db.query<{ status: string; distance_meters: number }>('select status, distance_meters from public.journeys where id = $1', [journey.id]);
    expect(j.rows[0]!.status).toBe('stopped');
    expect(Math.abs(j.rows[0]!.distance_meters - computeJourneyStats(buf.all()).distanceM)).toBeLessThanOrEqual(2);

    // updated trip progress
    const stops = await as(db, anika, (q) => q.query<{ completion_status: 'planned' | 'completed' | 'skipped' }>('select completion_status from public.trip_stops where trip_id = $1', [trip.id]));
    expect(tripProgress(stops)).toEqual({ total: 3, completed: 1, percent: 33 });
    const sql = await as(db, anika, (q) => q.one<{ percent: number }>('select * from public.trip_progress($1)', [trip.id]));
    expect(sql.percent).toBe(33);

    // share: a deliberately published, coarse route preview; the raw trace is never exposed
    const preview = buildRoutePreview(buf.all().map((p) => [p.lat, p.lng] as [number, number]));
    await as(db, anika, (q) => q.query(`insert into public.trip_route_previews (trip_id, encoded_polyline, published_by) values ($1, $2, $3)`, [trip.id, preview, anika]));
    const pub = await as(db, null, (q) => q.one<{ j: { trip: { slug: string }; stops: Array<{ order: number }>; progress: { percent: number }; route_preview: { encoded_polyline: string } } }>(`select public.get_public_trip((select slug from public.trips where id = '${trip.id}')) as j`));
    expect(pub.j.stops.map((s) => s.order)).toEqual([0, 1, 2]);
    expect(pub.j.progress.percent).toBe(33);
    expect(pub.j.route_preview.encoded_polyline).toBe(preview);
    expect(await as(db, null, (q) => q.query('select 1 from public.journey_points'))).toHaveLength(0);
  });
});

describe('User A creates a public trip → User B discovers it → saves it → creates their own trip from it', () => {
  it('works across two users and respects visibility', async () => {
    const [d1, d2] = (await db.query<{ id: string }>('select id from public.destinations order by slug limit 2')).rows.map((r) => r.id) as [string, string];
    const a = await createUser(db, 'usera');
    const b = await createUser(db, 'userb');
    const tripA = await as(db, a, (q) => q.one<{ id: string; slug: string }>(`insert into public.trips (owner_id, title, status, visibility) values ($1, 'Coast and Hills', 'planned', 'public') returning id, slug`, [a]));
    const secret = await as(db, a, (q) => q.one<{ id: string }>(`insert into public.trips (owner_id, title, status, visibility) values ($1, 'Private surprise', 'planned', 'private') returning id`, [a]));
    for (const d of [d1, d2]) await as(db, a, (q) => q.query(`insert into public.trip_stops (trip_id, destination_id, stop_order, notes) values ($1, $2, -1, 'note')`, [tripA.id, d]));

    // B discovers it via search and the trending list, but never the private one
    const found = await as(db, b, (q) => q.query<{ kind: string; handle: string }>(`select kind, handle from public.search_all('coast', 'trip')`));
    expect(found).toEqual([{ kind: 'trip', handle: tripA.slug }]);
    expect((await as(db, b, (q) => q.query('select * from public.trending_public_trips(10)'))).length).toBe(2); // both public trips; never the private one
    expect(await as(db, b, (q) => q.query('select id from public.trips where id = $1', [secret.id]))).toHaveLength(0);

    // B saves it
    await as(db, b, (q) => q.query(`insert into public.saved_items (user_id, item_type, item_id) values ($1, 'trip', $2)`, [b, tripA.id]));
    expect(await as(db, b, (q) => q.query(`select 1 from public.saved_items where item_type = 'trip'`))).toHaveLength(1);

    // B creates their own trip from the saved plan (what "Make my own copy" does)
    const pub = await as(db, b, (q) => q.one<{ j: { stops: Array<{ destination: { id: string }; notes: string }> } }>('select public.get_public_trip($1) as j', [tripA.slug]));
    const mine = await as(db, b, (q) => q.one<{ id: string; status: string; visibility: string }>(`insert into public.trips (owner_id, title) values ($1, 'Coast and Hills (copy)') returning id, status, visibility`, [b]));
    expect(mine).toMatchObject({ status: 'draft', visibility: 'private' });
    for (const s of pub.j.stops) await as(db, b, (q) => q.query(`insert into public.trip_stops (trip_id, destination_id, stop_order, notes) values ($1, $2, -1, $3)`, [mine.id, s.destination.id, s.notes]));
    expect(await as(db, b, (q) => q.query('select id from public.trip_stops where trip_id = $1', [mine.id]))).toHaveLength(2);

    // the copy is private to B; A cannot see it, and B cannot edit A's original
    expect(await as(db, a, (q) => q.query('select id from public.trips where id = $1', [mine.id]))).toHaveLength(0);
    expect(await as(db, b, (q) => q.query(`update public.trips set title = 'mine now' where id = $1 returning id`, [tripA.id]))).toHaveLength(0);

    // social interactions: follow, like, comment, save
    await as(db, b, (q) => q.query('insert into public.follows (follower_id, following_id) values ($1, $2)', [b, a]));
    const post = await as(db, a, (q) => q.one<{ id: string }>(`insert into public.posts (author_id, caption, visibility) values ($1, 'Fresh #coast photos', 'public') returning id`, [a]));
    await as(db, b, (q) => q.query('insert into public.reactions (user_id, post_id) values ($1, $2)', [b, post.id]));
    await as(db, b, (q) => q.query(`insert into public.comments (post_id, author_id, body) values ($1, $2, 'Lovely!')`, [post.id, b]));
    await as(db, b, (q) => q.query(`insert into public.saved_items (user_id, item_type, item_id) values ($1, 'post', $2)`, [b, post.id]));
    const notes = await as(db, a, (q) => q.query<{ notification_type: string }>('select notification_type from public.notifications order by created_at'));
    expect(notes.map((n) => n.notification_type).sort()).toEqual(['comment', 'follow', 'like']);
    const feed = await as(db, b, (q) => q.query<{ post_id: string; like_count: string; liked_by_me: boolean }>(`select post_id, like_count, liked_by_me from public.get_home_feed('following', 10)`));
    expect(feed[0]).toMatchObject({ post_id: post.id, liked_by_me: true });
  });
});

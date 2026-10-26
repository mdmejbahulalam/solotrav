import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, createDb, createUser, rejects } from './harness';

let db: PGlite;
let alice: string, bob: string, trip: string;

beforeAll(async () => {
  db = await createDb();
  alice = await createUser(db, 'alice');
  bob = await createUser(db, 'bob');
  trip = (await as(db, alice, (q) => q.one<{ id: string }>(`insert into public.trips (owner_id, title, status, visibility) values ($1, 'Journal trip', 'planned', 'public') returning id`, [alice]))).id;
});
afterAll(async () => db.close());

describe('journal', () => {
  it('is private by default, even on a public trip', async () => {
    await as(db, alice, (q) => q.query(`insert into public.journal_entries (trip_id, user_id, title, body) values ($1, $2, 'Day 1', 'Secret thoughts')`, [trip, alice]));
    expect(await as(db, bob, (q) => q.query('select id from public.journal_entries'))).toHaveLength(0);
    expect(await as(db, null, (q) => q.query('select id from public.journal_entries'))).toHaveLength(0);
    expect(await as(db, alice, (q) => q.query('select id from public.journal_entries'))).toHaveLength(1);
  });

  it('only exposes entries the owner explicitly opts in', async () => {
    await as(db, alice, (q) => q.query(`insert into public.journal_entries (trip_id, user_id, title, visibility, is_highlight) values ($1, $2, 'Highlight', 'public', true)`, [trip, alice]));
    const titles = (await as(db, bob, (q) => q.query<{ title: string }>('select title from public.journal_entries'))).map((r) => r.title);
    expect(titles).toEqual(['Highlight']);
  });

  it('refuses entries on trips the user does not belong to or for other users', async () => {
    expect(await rejects(as(db, bob, (q) => q.query(`insert into public.journal_entries (trip_id, user_id, title) values ($1, $2, 'intruder')`, [trip, bob])))).toMatch(/not a member/i);
    expect(await rejects(as(db, bob, (q) => q.query(`insert into public.journal_entries (trip_id, user_id, title) values ($1, $2, 'forged')`, [trip, alice])))).toMatch(/row-level security|caller/i);
    expect(await as(db, bob, (q) => q.query(`update public.journal_entries set body = 'hijack' returning id`))).toHaveLength(0);
  });

  it('rejects empty entries', async () => {
    expect(await rejects(as(db, alice, (q) => q.query(`insert into public.journal_entries (trip_id, user_id) values ($1, $2)`, [trip, alice])))).toMatch(/journal_not_empty/);
  });
});

describe('google place caching rules', () => {
  it('stores Place IDs and a 30-day cache window, and de-duplicates by Place ID', async () => {
    const a = await as(db, alice, (q) => q.one<{ id: string }>(`select public.ensure_destination('ChIJexample12345', 'Sajek Valley', 23.38, 92.293, 'Bangladesh', 'Rangamati', 'mountains') as id`));
    const b = await as(db, bob, (q) => q.one<{ id: string }>(`select public.ensure_destination('ChIJexample12345', 'Sajek Valley (renamed)', 23.381, 92.294) as id`));
    expect(b.id).toBe(a.id);
    const row = await db.query<{ source: string; cache_expires_at: string; name: string }>('select source, cache_expires_at, name from public.destinations where id = $1', [a.id]);
    expect(row.rows[0]!.source).toBe('google_place');
    expect(Date.parse(row.rows[0]!.cache_expires_at) - Date.now()).toBeGreaterThan(29 * 86_400_000);
    expect(row.rows[0]!.name).toBe('Sajek Valley (renamed)');
  });

  it('validates inputs and requires authentication', async () => {
    expect(await rejects(as(db, null, (q) => q.query(`select public.ensure_destination('ChIJanonymous1', 'X', 1, 1)`)))).toMatch(/Not authenticated/);
    expect(await rejects(as(db, alice, (q) => q.query(`select public.ensure_destination('ChIJbadcoords1', 'X', 95, 1)`)))).toMatch(/coordinates/);
    expect(await rejects(as(db, alice, (q) => q.query(`select public.ensure_destination('x', 'X', 1, 1)`)))).toMatch(/place id/i);
  });

  it('blanks expired cached fields but keeps the Place ID', async () => {
    await db.query(`update public.destinations set cache_expires_at = now() - interval '1 day' where google_place_id = 'ChIJexample12345'`);
    const n = await db.query<{ n: number }>('select public.expire_google_place_cache() as n');
    expect(n.rows[0]!.n).toBe(1);
    const row = await db.query<{ google_place_id: string; name: string | null; latitude: number | null }>(`select google_place_id, name, latitude from public.destinations where google_place_id = 'ChIJexample12345'`);
    expect(row.rows[0]).toEqual({ google_place_id: 'ChIJexample12345', name: null, latitude: null });
    // expired rows never leak as blank search results
    const found = await as(db, bob, (q) => q.query(`select * from public.search_all('sajek', 'destination')`));
    expect(found).toHaveLength(0);
  });

  it('cannot be written to directly by clients', async () => {
    expect(await rejects(as(db, alice, (q) => q.query(`insert into public.destinations (source, slug, name, latitude, longitude) values ('curated', 'x', 'X', 1, 1)`)))).toMatch(/row-level security/i);
  });
});

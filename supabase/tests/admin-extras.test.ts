import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, createDb, createUser, grantRole, rejects } from './harness';

let db: PGlite;
let alice: string, bob: string, mod: string, manager: string, admin: string, support: string;

beforeAll(async () => {
  db = await createDb();
  [alice, bob, mod, manager, admin, support] = await Promise.all(['alice', 'bob', 'mod', 'manager', 'admin', 'support'].map((n) => createUser(db, n))) as [string, string, string, string, string, string];
  await grantRole(db, mod, 'content_moderator');
  await grantRole(db, manager, 'content_manager');
  await grantRole(db, admin, 'administrator');
  await grantRole(db, support, 'support');
  await as(db, alice, (q) => q.query(`insert into public.posts (author_id, caption, visibility) values ($1, 'public #tag1', 'public'), ($1, 'secret #tag2', 'private')`, [alice]));
  await as(db, alice, (q) => q.query(`insert into public.trips (owner_id, title, status, visibility) values ($1, 'Public trip', 'planned', 'public'), ($1, 'Hidden trip', 'planned', 'private')`, [alice]));
});
afterAll(async () => db.close());

describe('role matrix', () => {
  it('limits each role to its own permissions', async () => {
    await expect(as(db, support, (q) => q.query(`select * from public.admin_report_queue('open')`))).resolves.toBeDefined();
    expect(await rejects(as(db, support, (q) => q.query('select * from public.admin_list_public_posts()')))).toMatch(/Missing permission/);
    expect(await rejects(as(db, support, (q) => q.query('select public.admin_overview_stats()')))).toMatch(/Missing permission/);
    await expect(as(db, manager, (q) => q.query('select public.admin_overview_stats()'))).resolves.toBeDefined();
    expect(await rejects(as(db, manager, (q) => q.query(`select public.admin_remove_post(gen_random_uuid(), 'not allowed to')`)))).toMatch(/Missing permission/);
    expect(await rejects(as(db, mod, (q) => q.query(`select public.admin_update_setting('upload_max_image_mb', '5', 'because')`)))).toMatch(/Missing permission/);
    expect(await rejects(as(db, mod, (q) => q.query('select * from public.admin_list_hashtags()')))).toMatch(/Missing permission/);
    expect(await rejects(as(db, bob, (q) => q.query('select * from public.admin_list_users()')))).toMatch(/Missing permission/);
  });
});

describe('content lists expose only public content', () => {
  it('lists public posts and public trips, never private ones', async () => {
    const posts = await as(db, mod, (q) => q.query<{ caption: string }>('select caption from public.admin_list_public_posts()'));
    expect(posts.map((p) => p.caption)).toEqual(['public #tag1']);
    const trips = await as(db, mod, (q) => q.query<{ title: string }>('select title from public.admin_list_public_trips()'));
    expect(trips.map((t) => t.title)).toEqual(['Public trip']);
  });

  it('shows previews only for reported items in the queue', async () => {
    const post = await db.query<{ id: string }>(`select id from public.posts where visibility = 'private'`);
    await as(db, bob, (q) => q.query(`insert into public.reports (reporter_id, target_type, target_id, reason) values ($1, 'post', $2, 'other')`, [bob, post.rows[0]!.id]));
    const q = await as(db, mod, (c) => c.query<{ preview: string; reporter_username: string }>(`select preview, reporter_username from public.admin_report_queue('open')`));
    expect(q).toHaveLength(1);
    expect(q[0]!.preview).toContain('secret'); // staff may review what was explicitly reported
    expect(q[0]!.reporter_username).toBe('bob');
  });
});

describe('hashtags, settings, analytics', () => {
  it('blocks a hashtag with an audited reason and hides it from search', async () => {
    await as(db, manager, (q) => q.query(`select public.admin_set_hashtag_blocked('tag1', true, 'Used for spam campaign')`));
    expect(await as(db, bob, (q) => q.query(`select * from public.search_all('tag1', 'hashtag')`))).toHaveLength(0);
    expect((await db.query(`select 1 from public.audit_logs where action = 'hashtag.block'`)).rows).toHaveLength(1);
    expect(await rejects(as(db, manager, (q) => q.query(`select public.admin_set_hashtag_blocked('tag1', false, 'x')`)))).toMatch(/reason/);
  });

  it('updates settings only with permission and reason, and rejects unknown keys', async () => {
    await as(db, admin, (q) => q.query(`select public.admin_update_setting('upload_max_image_mb', '8', 'Raising limit for photographers')`));
    const v = await db.query<{ value: unknown }>(`select value from public.feature_settings where key = 'upload_max_image_mb'`);
    expect(v.rows[0]!.value).toBe(8);
    expect(await rejects(as(db, admin, (q) => q.query(`select public.admin_update_setting('nope', '1', 'testing unknown')`)))).toMatch(/Unknown setting/);
  });

  it('returns aggregate analytics without user ids or properties', async () => {
    await as(db, bob, (q) => q.query(`select public.track_event('trip_created', '{"platform":"web"}')`));
    const s = await as(db, manager, (q) => q.query('select * from public.admin_analytics_series(7)'));
    expect(s).toHaveLength(1);
    expect(Object.keys(s[0]!).sort()).toEqual(['day', 'event_name', 'events']);
  });
});

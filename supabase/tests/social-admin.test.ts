import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, createDb, createUser, grantRole, rejects } from './harness';

let db: PGlite;
let alice: string, bob: string, carol: string, dave: string, mod: string, support: string, admin: string, root: string;
const ids: Record<string, string> = {};

const newPost = (who: string, caption: string, visibility = 'public', extra = '') =>
  as(db, who, (q) => q.one<{ id: string }>(`insert into public.posts (author_id, caption, visibility${extra ? ', ' + extra.split('=')[0] : ''}) values ($1, $2, $3${extra ? ', ' + extra.split('=')[1] : ''}) returning id`, [who, caption, visibility])).then((r) => r.id);

beforeAll(async () => {
  db = await createDb();
  [alice, bob, carol, dave, mod, support, admin, root] = await Promise.all(
    ['alice', 'bob', 'carol', 'dave', 'mod', 'support', 'admin', 'root'].map((n) => createUser(db, n)),
  ) as [string, string, string, string, string, string, string, string];
  await grantRole(db, mod, 'content_moderator');
  await grantRole(db, support, 'support');
  await grantRole(db, admin, 'administrator');
  await grantRole(db, root, 'super_administrator');
  // carol follows alice; bob follows nobody; dave is blocked by alice
  await as(db, carol, (q) => q.query('insert into public.follows (follower_id, following_id) values ($1, $2)', [carol, alice]));
  await as(db, alice, (q) => q.query('insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)', [alice, dave]));
  ids.pub = await newPost(alice, 'Public #sajek view with @bob');
  ids.fol = await newPost(alice, 'Followers only #secretspot', 'followers');
  ids.priv = await newPost(alice, 'Private note', 'private');
});
afterAll(async () => db.close());

const visible = async (who: string | null) => (await as(db, who, (q) => q.query<{ id: string }>('select id from public.posts order by created_at'))).map((r) => r.id);

describe('post visibility', () => {
  it('shows public posts to everyone, follower posts to followers, private posts only to the author', async () => {
    expect(await visible(null)).toEqual([ids.pub]);
    expect(await visible(bob)).toEqual([ids.pub]);
    expect((await visible(carol)).sort()).toEqual([ids.pub, ids.fol].sort());
    expect((await visible(alice)).sort()).toEqual([ids.pub, ids.fol, ids.priv].sort());
  });

  it('lists the posts of one profile through the same visibility rules', async () => {
    const ids_ = async (who: string | null) => (await as(db, who, (q) => q.query<{ post_id: string }>('select post_id from public.get_profile_posts($1, 20)', [alice]))).map((r) => r.post_id);
    expect(await ids_(null)).toEqual([ids.pub]);
    expect((await ids_(carol)).sort()).toEqual([ids.pub, ids.fol].sort());
    expect(await ids_(dave)).toEqual([]);
    expect((await ids_(alice)).sort()).toEqual([ids.pub, ids.fol, ids.priv].sort());
  });

  it('hides everything from a blocked user', async () => {
    expect(await visible(dave)).toEqual([]);
  });

  it('treats public posts of a private account as follower-only', async () => {
    await as(db, alice, (q) => q.query(`update public.profiles set account_visibility = 'private' where id = $1`, [alice]));
    expect(await visible(bob)).toEqual([]);
    expect(await visible(null)).toEqual([]);
    expect(await visible(carol)).toContain(ids.pub);
    await as(db, alice, (q) => q.query(`update public.profiles set account_visibility = 'public' where id = $1`, [alice]));
  });

  it('keeps private content out of the home feed, discovery feed and search', async () => {
    const feed = await as(db, bob, (q) => q.query<{ post_id: string }>(`select post_id from public.get_home_feed('discover', 20)`));
    expect(feed.map((f) => f.post_id)).toEqual([ids.pub]);
    const s = await as(db, bob, (q) => q.query<{ kind: string; title: string }>(`select kind, title from public.search_all('secretspot')`));
    expect(JSON.stringify(s)).not.toMatch(/Followers only|secretspot/);
    const s2 = await as(db, null, (q) => q.query<{ kind: string }>(`select kind from public.search_all('Private note')`));
    expect(s2).toHaveLength(0);
    const own = await as(db, alice, (q) => q.query<{ post_id: string }>(`select post_id from public.get_home_feed('following', 20)`));
    expect(own.map((f) => f.post_id)).toContain(ids.priv);
  });

  it('prevents authoring as someone else and un-removing moderated posts', async () => {
    expect(await rejects(as(db, bob, (q) => q.query(`insert into public.posts (author_id, caption) values ($1, 'forged')`, [alice])))).toMatch(/row-level security|Author must be/i);
    await as(db, mod, (q) => q.query(`select public.admin_remove_post($1, 'Violates community guidelines')`, [ids.pub]));
    const r = await as(db, alice, (q) => q.one<{ publication_status: string }>(`update public.posts set publication_status = 'published', caption = 'x' where id = $1 returning publication_status`, [ids.pub]));
    expect(r.publication_status).toBe('removed');
    expect(await visible(bob)).toEqual([]);
    await db.query(`update public.posts set publication_status = 'published', caption = 'Public #sajek view with @bob' where id = $1`, [ids.pub]);
  });

  it('indexes hashtags from captions and ignores HTML entities', async () => {
    const tags = await db.query<{ tag: string }>(`select h.tag from public.hashtags h join public.post_hashtags ph on ph.hashtag_id = h.id where ph.post_id = $1`, [ids.pub]);
    expect(tags.rows.map((t) => t.tag)).toEqual(['sajek']);
  });

  it('never stores coordinates on a post', async () => {
    const cols = await db.query<{ column_name: string }>(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'posts'`);
    expect(cols.rows.map((c) => c.column_name).join(',')).not.toMatch(/lat|lng|lon|coord|geo/);
  });
});

describe('comments, reactions and notifications', () => {
  it('enforces one reaction per user and notifies the author once', async () => {
    await as(db, bob, (q) => q.query(`insert into public.reactions (user_id, post_id) values ($1, $2)`, [bob, ids.pub]));
    expect(await rejects(as(db, bob, (q) => q.query(`insert into public.reactions (user_id, post_id) values ($1, $2)`, [bob, ids.pub])))).toMatch(/reactions_one_per_user|duplicate/);
    const n = await as(db, alice, (q) => q.query(`select notification_type from public.notifications where notification_type = 'like'`));
    expect(n).toHaveLength(1);
  });

  it('cannot react to or comment on content the user cannot see', async () => {
    expect(await rejects(as(db, bob, (q) => q.query(`insert into public.reactions (user_id, post_id) values ($1, $2)`, [bob, ids.priv])))).toMatch(/row-level security/i);
    expect(await rejects(as(db, bob, (q) => q.query(`insert into public.comments (post_id, author_id, body) values ($1, $2, 'hi')`, [ids.fol, bob])))).toMatch(/row-level security/i);
  });

  it('supports one level of replies and mentions', async () => {
    const c1 = await as(db, bob, (q) => q.one<{ id: string }>(`insert into public.comments (post_id, author_id, body) values ($1, $2, 'Nice! cc @carol') returning id`, [ids.pub, bob]));
    const c2 = await as(db, carol, (q) => q.one<{ id: string }>(`insert into public.comments (post_id, author_id, body, parent_comment_id) values ($1, $2, 'reply', $3) returning id`, [ids.pub, carol, c1.id]));
    expect(await rejects(as(db, alice, (q) => q.query(`insert into public.comments (post_id, author_id, body, parent_comment_id) values ($1, $2, 'too deep', $3)`, [ids.pub, alice, c2.id])))).toMatch(/one level/);
    const mention = await as(db, carol, (q) => q.query(`select notification_type from public.notifications where notification_type = 'mention'`));
    expect(mention).toHaveLength(1);
    ids.comment = c1.id;
  });

  it('stops a user from restoring a comment hidden by moderators', async () => {
    await as(db, mod, (q) => q.query(`select public.admin_moderate_comment($1, 'hidden', 'Spam link')`, [ids.comment]));
    await as(db, bob, (q) => q.query(`update public.comments set status = 'visible', body = 'edited' where id = $1`, [ids.comment]));
    const s = await db.query<{ status: string }>('select status from public.comments where id = $1', [ids.comment]);
    expect(s.rows[0]!.status).toBe('hidden');
    expect(await as(db, carol, (q) => q.query('select id from public.comments where id = $1', [ids.comment]))).toHaveLength(0);
    expect(await as(db, bob, (q) => q.query('select id from public.comments where id = $1', [ids.comment]))).toHaveLength(1); // own hidden comment still visible to author
  });

  it('keeps notifications private, server-created and read-only except read_at', async () => {
    expect(await as(db, bob, (q) => q.query('select id from public.notifications where recipient_id = $1', [alice]))).toHaveLength(0);
    expect(await rejects(as(db, bob, (q) => q.query(`insert into public.notifications (recipient_id, actor_id, notification_type, entity_type) values ($1, $2, 'like', 'post')`, [alice, bob])))).toMatch(/row-level security/i);
    const row = await as(db, alice, (q) => q.one<{ id: string }>('select id from public.notifications limit 1'));
    await as(db, alice, (q) => q.query(`update public.notifications set read_at = now(), recipient_id = $2, notification_type = 'follow' where id = $1`, [row.id, bob]));
    const after = await db.query<{ recipient_id: string; notification_type: string; read_at: string | null }>('select recipient_id, notification_type, read_at from public.notifications where id = $1', [row.id]);
    expect(after.rows[0]!.recipient_id).toBe(alice);
    expect(after.rows[0]!.notification_type).not.toBe('follow');
    expect(after.rows[0]!.read_at).not.toBeNull();
  });

  it('respects notification preferences and never notifies across a block', async () => {
    await as(db, alice, (q) => q.query(`update public.profiles set notification_prefs = '{"likes":false}' where id = $1`, [alice]));
    await as(db, carol, (q) => q.query(`insert into public.reactions (user_id, post_id) values ($1, $2)`, [carol, ids.pub]));
    expect(await as(db, alice, (q) => q.query(`select 1 from public.notifications where notification_type = 'like'`))).toHaveLength(1); // only bob's earlier like
    await as(db, alice, (q) => q.query(`update public.profiles set notification_prefs = '{}' where id = $1`, [alice]));
  });

  it('stores no coordinates or text bodies in notifications', async () => {
    const cols = await db.query<{ column_name: string }>(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'notifications'`);
    expect(cols.rows.map((c) => c.column_name).join(',')).not.toMatch(/lat|lng|coord|body|text/);
  });
});

describe('media and storage', () => {
  it('requires generated storage paths owned by the post author', async () => {
    const uuid = '3f8a2b1c-0d4e-4f5a-9b6c-7d8e9f0a1b2c';
    expect(await rejects(as(db, alice, (q) => q.query(`insert into public.post_media (post_id, storage_path, media_type) values ($1, 'vacation.jpg', 'image')`, [ids.pub])))).toMatch(/Invalid storage path/);
    expect(await rejects(as(db, alice, (q) => q.query(`insert into public.post_media (post_id, storage_path, media_type) values ($1, $2, 'image')`, [ids.pub, `${bob}/${uuid}.jpg`])))).toMatch(/Invalid storage path/);
    expect(await rejects(as(db, alice, (q) => q.query(`insert into public.post_media (post_id, storage_path, media_type) values ($1, $2, 'image')`, [ids.pub, `${alice}/${uuid}.exe`])))).toMatch(/Invalid storage path/);
    expect(await rejects(as(db, bob, (q) => q.query(`insert into public.post_media (post_id, storage_path, media_type) values ($1, $2, 'image')`, [ids.pub, `${bob}/${uuid}.jpg`])))).toMatch(/row-level security|Invalid storage path/i);
    await as(db, alice, (q) => q.query(`insert into public.post_media (post_id, storage_path, media_type) values ($1, $2, 'image')`, [ids.pub, `${alice}/${uuid}.jpg`]));
    await as(db, alice, (q) => q.query(`insert into public.post_media (post_id, storage_path, media_type) values ($1, $2, 'image')`, [ids.priv, `${alice}/4f8a2b1c-0d4e-4f5a-9b6c-7d8e9f0a1b2c.png`]));
    await db.query(`insert into storage.objects (bucket_id, name) values ('post-media', $1), ('post-media', $2)`, [`${alice}/${uuid}.jpg`, `${alice}/4f8a2b1c-0d4e-4f5a-9b6c-7d8e9f0a1b2c.png`]);
  });

  it('serves private bucket objects only when the owning post is visible', async () => {
    const names = async (who: string | null) => (await as(db, who, (q) => q.query<{ name: string }>(`select name from storage.objects where bucket_id = 'post-media'`))).map((r) => r.name);
    expect(await names(alice)).toHaveLength(2);
    expect(await names(bob)).toHaveLength(1);       // public post's media only
    expect(await names(null)).toHaveLength(1);
    expect(await names(dave)).toHaveLength(0);      // blocked
  });

  it('only lets users write to their own storage folder', async () => {
    expect(await rejects(as(db, bob, (q) => q.query(`insert into storage.objects (bucket_id, name) values ('post-media', $1)`, [`${alice}/5f8a2b1c-0d4e-4f5a-9b6c-7d8e9f0a1b2c.jpg`])))).toMatch(/row-level security/i);
    await as(db, bob, (q) => q.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${bob}/6f8a2b1c-0d4e-4f5a-9b6c-7d8e9f0a1b2c.png`]));
    const bucket = await db.query<{ public: boolean; file_size_limit: string }>(`select public, file_size_limit::text from storage.buckets where id = 'post-media'`);
    expect(bucket.rows[0]!.public).toBe(false);
  });
});

describe('saved items and collections', () => {
  it('only saves items the user can access', async () => {
    expect(await rejects(as(db, bob, (q) => q.query(`insert into public.saved_items (user_id, item_type, item_id) values ($1, 'post', $2)`, [bob, ids.priv])))).toMatch(/not found or not accessible/);
    expect(await rejects(as(db, bob, (q) => q.query(`insert into public.saved_items (user_id, item_type, item_id) values ($1, 'trip', gen_random_uuid())`, [bob])))).toMatch(/not found or not accessible/);
    await as(db, bob, (q) => q.query(`insert into public.saved_items (user_id, item_type, item_id) values ($1, 'post', $2)`, [bob, ids.pub]));
    expect(await as(db, carol, (q) => q.query('select id from public.saved_items'))).toHaveLength(0);
  });

  it('keeps collections private by default and validates ownership', async () => {
    const col = await as(db, bob, (q) => q.one<{ id: string }>(`insert into public.collections (owner_id, title) values ($1, 'Winter ideas') returning id`, [bob]));
    expect(await as(db, carol, (q) => q.query('select id from public.collections where id = $1', [col.id]))).toHaveLength(0);
    expect(await rejects(as(db, carol, (q) => q.query(`insert into public.saved_items (user_id, item_type, item_id, collection_id) values ($1, 'post', $2, $3)`, [carol, ids.pub, col.id])))).toMatch(/Collection not found/);
  });
});

describe('messaging', () => {
  let conv: string;
  it('creates one direct conversation per pair and only members can read or write', async () => {
    conv = (await as(db, bob, (q) => q.one<{ c: string }>('select public.create_direct_conversation($1) as c', [carol]))).c;
    const again = await as(db, carol, (q) => q.one<{ c: string }>('select public.create_direct_conversation($1) as c', [bob]));
    expect(again.c).toBe(conv);
    await as(db, bob, (q) => q.query(`insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'secret plans')`, [conv, bob]));
    expect(await as(db, carol, (q) => q.query('select body from public.messages'))).toHaveLength(1);
    expect(await as(db, alice, (q) => q.query('select body from public.messages'))).toHaveLength(0);
    expect(await as(db, alice, (q) => q.query('select id from public.conversations'))).toHaveLength(0);
    expect(await rejects(as(db, alice, (q) => q.query(`insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'intrude')`, [conv, alice])))).toMatch(/row-level security|Not a member/i);
    expect(await rejects(as(db, bob, (q) => q.query(`insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'spoof')`, [conv, carol])))).toMatch(/row-level security|Sender/i);
  });

  it('refuses conversations and messages across a block', async () => {
    expect(await rejects(as(db, dave, (q) => q.query('select public.create_direct_conversation($1)', [alice])))).toMatch(/cannot message/i);
    expect(await rejects(as(db, alice, (q) => q.query('select public.create_direct_conversation($1)', [dave])))).toMatch(/cannot message/i);
    await as(db, carol, (q) => q.query('insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)', [carol, bob]));
    expect(await rejects(as(db, bob, (q) => q.query(`insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'still there?')`, [conv, bob])))).toMatch(/cannot message/i);
  });
});

describe('reports and moderation', () => {
  let reportId: string;
  it('lets users report, see only their own reports, and blocks duplicate open reports', async () => {
    reportId = (await as(db, bob, (q) => q.one<{ id: string }>(`insert into public.reports (reporter_id, target_type, target_id, reason) values ($1, 'post', $2, 'spam') returning id`, [bob, ids.fol]))).id;
    expect(await rejects(as(db, bob, (q) => q.query(`insert into public.reports (reporter_id, target_type, target_id, reason) values ($1, 'post', $2, 'spam')`, [bob, ids.fol])))).toMatch(/reports_one_open|duplicate/);
    expect(await as(db, carol, (q) => q.query('select id from public.reports'))).toHaveLength(0);
    expect(await as(db, bob, (q) => q.query('select id from public.reports'))).toHaveLength(1);
  });

  it('gives staff access to reported content only, not to arbitrary private posts', async () => {
    const seen = (await as(db, mod, (q) => q.query<{ id: string }>('select id from public.posts'))).map((r) => r.id);
    expect(seen).toContain(ids.fol);      // reported followers-only post
    expect(seen).not.toContain(ids.priv); // unreported private post stays hidden
    expect(await as(db, mod, (q) => q.query('select id from public.reports'))).toHaveLength(1);
  });

  it('enforces role permissions on admin operations', async () => {
    expect(await rejects(as(db, bob, (q) => q.query(`select public.admin_remove_post($1, 'because I want to')`, [ids.fol])))).toMatch(/Missing permission/);
    expect(await rejects(as(db, support, (q) => q.query(`select public.admin_remove_post($1, 'support cannot remove')`, [ids.fol])))).toMatch(/Missing permission/);
    expect(await rejects(as(db, support, (q) => q.query(`select public.admin_resolve_report($1, 'resolved', 'x')`, [reportId])))).toMatch(/Missing permission/);
    expect(await rejects(as(db, mod, (q) => q.query(`select public.admin_set_account_status($1, 'suspended', 'moderators cannot suspend')`, [bob])))).toMatch(/Missing permission/);
    expect(await rejects(as(db, admin, (q) => q.query(`select public.admin_grant_role($1, 'administrator', 'admins cannot grant roles')`, [bob])))).toMatch(/Missing permission/);
  });

  it('resolves a report with a note and writes moderation + audit records', async () => {
    await as(db, mod, (q) => q.query(`select public.admin_resolve_report($1, 'resolved', 'Checked: acceptable, no action')`, [reportId]));
    const r = await db.query<{ status: string; resolved_by: string }>('select status, resolved_by from public.reports where id = $1', [reportId]);
    expect(r.rows[0]).toEqual({ status: 'resolved', resolved_by: mod });
    expect((await db.query('select 1 from public.moderation_actions where report_id = $1', [reportId])).rows).toHaveLength(1);
    expect((await db.query(`select 1 from public.audit_logs where action = 'report.resolved'`)).rows).toHaveLength(1);
  });

  it('users cannot grant themselves roles or read staff tables', async () => {
    expect(await rejects(as(db, bob, (q) => q.query(`insert into public.role_assignments (user_id, role) values ($1, 'super_administrator')`, [bob])))).toMatch(/row-level security|permission denied/i);
    expect(await as(db, bob, (q) => q.query('select * from public.role_assignments'))).toHaveLength(0);
    expect(await as(db, bob, (q) => q.query('select * from public.audit_logs'))).toHaveLength(0);
    expect(await as(db, mod, (q) => q.query('select * from public.audit_logs'))).toHaveLength(0);   // moderator lacks audit.read
    expect((await as(db, admin, (q) => q.query('select * from public.audit_logs'))).length).toBeGreaterThan(0);
    expect(await rejects(as(db, bob, (q) => q.query('select public.admin_overview_stats()')))).toMatch(/Missing permission/);
  });

  it('suspends and restores accounts, hiding content while suspended', async () => {
    await as(db, admin, (q) => q.query(`select public.admin_set_account_status($1, 'suspended', 'Repeated spam after warning')`, [alice]));
    expect(await visible(bob)).toEqual([]);
    expect(await as(db, bob, (q) => q.query('select id from public.profiles where id = $1', [alice]))).toHaveLength(0);
    expect(await rejects(as(db, admin, (q) => q.query(`select public.admin_set_account_status($1, 'suspended', 'nope nope')`, [root])))).toMatch(/super administrator/);
    expect(await rejects(as(db, admin, (q) => q.query(`select public.admin_set_account_status($1, 'active', 'x')`, [alice])))).toMatch(/reason/);
    await as(db, admin, (q) => q.query(`select public.admin_set_account_status($1, 'active', 'Appeal accepted by team')`, [alice]));
    expect((await visible(bob)).length).toBeGreaterThan(0);
  });

  it('exposes aggregate stats and user listing to authorised staff only', async () => {
    const s = await as(db, admin, (q) => q.one<{ s: { registered_users: number; open_reports: number } }>('select public.admin_overview_stats() as s'));
    expect(s.s.registered_users).toBe(8);
    const users = await as(db, support, (q) => q.query('select * from public.admin_list_users($1, 3, 0)', ['']));
    expect(users).toHaveLength(3);
    expect(Object.keys(users[0]!)).not.toContain('email');
  });
});

describe('abuse protection', () => {
  it('rate-limits posting', async () => {
    let failed = '';
    for (let i = 0; i < 40; i++) {
      try {
        await as(db, dave, (q) => q.query(`insert into public.posts (author_id, caption) values ($1, 'spam ' || $2::text)`, [dave, i]));
      } catch (e) {
        failed = (e as Error).message;
        break;
      }
    }
    expect(failed).toMatch(/Rate limit exceeded/);
    const n = await db.query<{ n: string }>('select count(*)::text n from public.posts where author_id = $1', [dave]);
    expect(Number(n.rows[0]!.n)).toBe(30);
  });

  it('keeps privileged maintenance functions out of client reach', async () => {
    for (const fn of ['purge_expired_journey_points(30)', 'finalize_account_deletions()', 'expire_google_place_cache()', 'purge_analytics(1)']) {
      expect(await rejects(as(db, bob, (q) => q.query(`select public.${fn}`)))).toMatch(/permission denied|Not allowed/i);
    }
    expect(await rejects(as(db, bob, (q) => q.query(`select public.create_notification($1, $2, 'like', 'post', null)`, [alice, bob])))).toMatch(/permission denied/i);
    expect(await rejects(as(db, bob, (q) => q.query(`select public.write_audit('x', 'y', 'z', 'forged')`)))).toMatch(/permission denied/i);
    expect(await rejects(as(db, bob, (q) => q.query(`select public.raise_privileged()`)))).toMatch(/permission denied/i);
    expect(await as(db, bob, (q) => q.query('select * from public.rate_limit_events'))).toHaveLength(0); // RLS with no policy: invisible
  });

  it('records only allow-listed analytics events and strips coordinate-like properties', async () => {
    await as(db, bob, (q) => q.query(`select public.track_event('journey_started', '{"lat": 23.8, "longitude": 90.4, "platform": "android", "note": "secret"}')`));
    const e = await db.query<{ props: Record<string, unknown> }>(`select props from public.analytics_events where event_name = 'journey_started'`);
    expect(e.rows[0]!.props).toEqual({ platform: 'android' });
    expect(await rejects(as(db, bob, (q) => q.query(`select public.track_event('arbitrary_event')`)))).toMatch(/Unknown analytics event/);
  });
});

describe('account lifecycle', () => {
  it('hides content immediately on deletion request and removes everything at finalisation', async () => {
    const eve = await createUser(db, 'eve');
    const post = await newPost(eve, 'Eve was here');
    expect(await visible(bob)).toContain(post);
    await as(db, eve, (q) => q.query('select public.request_account_deletion()'));
    expect(await visible(bob)).not.toContain(post);
    // a restored account shows content again
    await as(db, eve, (q) => q.query('select public.cancel_account_deletion()'));
    expect(await visible(bob)).toContain(post);
    await as(db, eve, (q) => q.query('select public.request_account_deletion()'));
    await db.query(`update public.account_deletion_requests set scheduled_for = now() - interval '1 minute' where user_id = $1 and cancelled_at is null`, [eve]);
    const n = await db.query<{ finalize_account_deletions: number }>('select public.finalize_account_deletions()');
    expect(n.rows[0]!.finalize_account_deletions).toBe(1);
    expect((await db.query('select 1 from public.posts where author_id = $1', [eve])).rows).toHaveLength(0);
    expect((await db.query('select 1 from public.profiles where id = $1', [eve])).rows).toHaveLength(0);
  });

  it('exports only the caller\'s own data', async () => {
    const r = await as(db, bob, (q) => q.one<{ d: { profile: { id: string }; posts: unknown[]; messages_sent: unknown[]; journey_points: unknown[] } }>('select public.export_my_data() as d'));
    expect(r.d.profile.id).toBe(bob);
    expect(JSON.stringify(r.d)).not.toContain('Private note');
    expect(r.d.messages_sent).toHaveLength(1);
  });
});

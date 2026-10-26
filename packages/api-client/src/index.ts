import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  Destination, Journey, Page, Profile, SyncResult, Trip, TripStop, GpsPoint, JourneyStatus, CompletionMethod, StopStatus,
} from '@solotrav/shared-types';
import {
  PointBuffer, decodeCursor, pageOf, toSyncPayload,
} from '@solotrav/business-logic';
import {
  buildStoragePath, commentInputSchema, postInputSchema, profileUpdateSchema, reportInputSchema, searchQuerySchema,
  signInSchema, signUpSchema, stopInputSchema, tripInputSchema, validateUpload,
  type ProfileUpdateInput, type TripInput, type UploadKind,
} from '@solotrav/validation';

export type Db = SupabaseClient;

export class ApiError extends Error {
  constructor(message: string, public readonly code?: string, public readonly status?: number) {
    super(message);
    this.name = 'ApiError';
  }
  get isRateLimited() { return this.code === 'P0429'; }
  get isForbidden() { return this.code === '42501'; }
}

/** Maps database errors to messages that are safe and useful to show. */
function fail(error: { message: string; code?: string }): never {
  const known: Record<string, string> = {
    '42501': 'You do not have permission to do that.',
    P0429: 'You are doing that too often. Please wait a few minutes and try again.',
    '23505': 'That already exists.',
    '23514': 'Some of the information is not valid.',
  };
  throw new ApiError(known[error.code ?? ''] ?? error.message, error.code);
}
async function run<T>(p: PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) fail(error);
  return data as T;
}

export interface ClientConfig {
  url: string | undefined;
  anonKey: string | undefined;
  /** supply a platform storage adapter on React Native (SecureStore-backed) */
  auth?: Record<string, unknown>;
}

/** Fails loudly and actionably when Supabase is not configured, instead of pretending to work. */
export function createSolotravClient(cfg: ClientConfig): Db {
  if (!cfg.url || !cfg.anonKey) {
    throw new ApiError('Supabase is not configured. Set the Supabase URL and anon key (see .env.example and docs/SETUP.md).', 'CONFIG_MISSING');
  }
  return createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, ...(cfg.auth ?? {}) } });
}

// ---------------------------------------------------------------- auth
export const auth = (db: Db) => ({
  async signUp(input: unknown, redirectTo?: string) {
    const v = signUpSchema.parse(input);
    const { data, error } = await db.auth.signUp({
      email: v.email, password: v.password,
      options: { emailRedirectTo: redirectTo, data: { username: v.username, display_name: v.displayName } },
    });
    if (error) fail(error);
    return data;
  },
  async signIn(input: unknown) {
    const v = signInSchema.parse(input);
    const { data, error } = await db.auth.signInWithPassword(v);
    if (error) fail(error);
    return data;
  },
  /** Requires the Google provider to be configured in Supabase Auth (see docs/SETUP.md). */
  async signInWithGoogle(redirectTo: string) {
    const { data, error } = await db.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: false } });
    if (error) fail(error);
    return data;
  },
  async signOut() {
    const { error } = await db.auth.signOut();
    if (error) fail(error);
  },
  async sendPasswordReset(email: string, redirectTo: string) {
    const { error } = await db.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
    if (error) fail(error);
  },
  async updatePassword(password: string) {
    const { error } = await db.auth.updateUser({ password });
    if (error) fail(error);
  },
  async usernameAvailable(username: string): Promise<boolean> {
    const { data, error } = await db.rpc('username_available', { p_username: username.trim().toLowerCase() });
    if (error) fail(error);
    return Boolean(data);
  },
  async requestAccountDeletion(): Promise<string> {
    const { data, error } = await db.rpc('request_account_deletion');
    if (error) fail(error);
    return data as string;
  },
  async cancelAccountDeletion() {
    const { error } = await db.rpc('cancel_account_deletion');
    if (error) fail(error);
  },
  async exportMyData() {
    const { data, error } = await db.rpc('export_my_data');
    if (error) fail(error);
    return data as Record<string, unknown>;
  },
});

// ---------------------------------------------------------------- profiles
export const profiles = (db: Db) => ({
  async me(): Promise<Profile | null> {
    const { data: u } = await db.auth.getUser();
    if (!u.user) return null;
    return (await run(db.from('profiles').select('*').eq('id', u.user.id).maybeSingle())) as Profile | null;
  },
  async byUsername(username: string): Promise<Profile | null> {
    return (await run(db.from('profiles').select('*').ilike('username', username).maybeSingle())) as Profile | null;
  },
  async update(input: ProfileUpdateInput): Promise<Profile> {
    const patch = profileUpdateSchema.parse(input);
    const { data: u } = await db.auth.getUser();
    if (!u.user) throw new ApiError('Not signed in', '42501');
    return (await run(db.from('profiles').update(patch).eq('id', u.user.id).select('*').single())) as Profile;
  },
  async completeOnboarding(interests: string[], visibility: 'public' | 'private') {
    const patch = profileUpdateSchema.parse({ travel_interests: interests, account_visibility: visibility });
    const { data: u } = await db.auth.getUser();
    await run(db.from('profiles').update({ ...patch, onboarded_at: new Date().toISOString() }).eq('id', u.user!.id));
  },
  async card(username: string) {
    const rows = await run(db.rpc('get_profile_card', { p_username: username }));
    return (rows as Array<Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url' | 'account_visibility'>>)[0] ?? null;
  },
  async follow(userId: string) {
    const { data: u } = await db.auth.getUser();
    await run(db.from('follows').insert({ follower_id: u.user!.id, following_id: userId }).select('status').single());
  },
  async unfollow(userId: string) {
    const { data: u } = await db.auth.getUser();
    await run(db.from('follows').delete().eq('follower_id', u.user!.id).eq('following_id', userId));
  },
  async respondToFollowRequest(followerId: string, accept: boolean) {
    const { data: u } = await db.auth.getUser();
    const q = db.from('follows');
    if (accept) await run(q.update({ status: 'accepted' }).eq('follower_id', followerId).eq('following_id', u.user!.id));
    else await run(q.delete().eq('follower_id', followerId).eq('following_id', u.user!.id));
  },
  async block(userId: string) {
    const { data: u } = await db.auth.getUser();
    await run(db.from('user_blocks').insert({ blocker_id: u.user!.id, blocked_id: userId }));
  },
  async unblock(userId: string) {
    const { data: u } = await db.auth.getUser();
    await run(db.from('user_blocks').delete().eq('blocker_id', u.user!.id).eq('blocked_id', userId));
  },
  async suggestions(limit = 10) {
    return (await run(db.rpc('suggest_users', { p_limit: limit }))) as Array<Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'> & { shared_interests: number }>;
  },
});

// ---------------------------------------------------------------- destinations
export const destinations = (db: Db) => ({
  async search(query: string, category?: string, limit = 20): Promise<Destination[]> {
    let q = db.from('destinations').select('*').eq('is_published', true).not('name', 'is', null).limit(limit);
    if (query.trim()) q = q.ilike('normalized_name', `%${query.trim().toLowerCase().replace(/[%_]/g, '')}%`);
    if (category) q = q.eq('category', category);
    return (await run(q.order('is_featured', { ascending: false }).order('name'))) as Destination[];
  },
  async bySlug(slug: string): Promise<Destination | null> {
    return (await run(db.from('destinations').select('*').eq('slug', slug).maybeSingle())) as Destination | null;
  },
  async categories() {
    return (await run(db.from('destination_categories').select('*').order('sort_order'))) as Array<{ slug: string; label: string }>;
  },
  /** Persists a Google Place the user picked. Only the Place ID is permanent; other fields are a 30-day cache. */
  async ensureFromPlace(p: { placeId: string; name: string; lat: number; lng: number; country?: string; region?: string; category?: string }): Promise<string> {
    const { data, error } = await db.rpc('ensure_destination', {
      p_place_id: p.placeId, p_name: p.name, p_lat: p.lat, p_lng: p.lng, p_country: p.country ?? null, p_region: p.region ?? null, p_category: p.category ?? null,
    });
    if (error) fail(error);
    return data as string;
  },
});

// ---------------------------------------------------------------- trips
export const trips = (db: Db) => ({
  async create(input: unknown): Promise<Trip> {
    const v: TripInput = tripInputSchema.parse(input);
    const { data: u } = await db.auth.getUser();
    return (await run(db.from('trips').insert({ ...v, owner_id: u.user!.id }).select('*').single())) as Trip;
  },
  async publish(tripId: string, status: 'planned' | 'active' = 'planned'): Promise<Trip> {
    return (await run(db.from('trips').update({ status }).eq('id', tripId).select('*').single())) as Trip;
  },
  async update(tripId: string, patch: Partial<TripInput> & { status?: Trip['status'] }): Promise<Trip> {
    return (await run(db.from('trips').update(patch).eq('id', tripId).select('*').single())) as Trip;
  },
  async mine(): Promise<Trip[]> {
    return (await run(db.from('trips').select('*').order('created_at', { ascending: false }))) as Trip[];
  },
  async get(tripId: string) {
    const trip = (await run(db.from('trips').select('*').eq('id', tripId).maybeSingle())) as Trip | null;
    if (!trip) return null;
    const stops = (await run(db.from('trip_stops').select('*, destination:destinations(id,slug,name,region,country,latitude,longitude,category,image_path)').eq('trip_id', tripId).order('stop_order'))) as Array<TripStop & { destination: Destination | null }>;
    const members = (await run(db.from('trip_members').select('*, profile:profiles!trip_members_user_id_fkey(username,display_name,avatar_url)').eq('trip_id', tripId))) as Array<{ user_id: string; role: string; invitation_status: string; profile: { username: string } }>;
    return { trip, stops, members };
  },
  /** One RLS-filtered call for the public page. Never contains raw GPS. Safe to call without a session. */
  async getPublic(slug: string) {
    const { data, error } = await db.rpc('get_public_trip', { p_slug: slug });
    if (error) fail(error);
    return data as null | {
      trip: Pick<Trip, 'id' | 'slug' | 'title' | 'description' | 'cover_image_url' | 'start_date' | 'end_date' | 'status' | 'visibility' | 'published_at'>;
      owner: { username: string; display_name: string; avatar_url: string | null };
      stops: Array<{ id: string; order: number; notes: string; status: StopStatus; destination: Partial<Destination> & { name?: string } }>;
      route_preview: { encoded_polyline: string; distance_m: number | null } | null;
      progress: { total: number; completed: number; percent: number };
    };
  },
  async trending(limit = 10) {
    return (await run(db.rpc('trending_public_trips', { p_limit: limit }))) as Array<{ id: string; slug: string; title: string; owner_username: string; saves: number }>;
  },
  async addStop(tripId: string, input: unknown): Promise<TripStop> {
    const v = stopInputSchema.parse(input);
    return (await run(db.from('trip_stops').insert({ ...v, trip_id: tripId, stop_order: -1 }).select('*').single())) as TripStop;
  },
  async updateStop(stopId: string, patch: Partial<Pick<TripStop, 'notes' | 'planned_arrival_at' | 'planned_departure_at' | 'target_minutes'>>) {
    return (await run(db.from('trip_stops').update(patch).eq('id', stopId).select('*').single())) as TripStop;
  },
  async removeStop(stopId: string) {
    await run(db.from('trip_stops').delete().eq('id', stopId));
  },
  /** Atomic server-side reorder. `orderedIds` must contain every stop of the trip. */
  async reorderStops(tripId: string, orderedIds: string[]) {
    const { error } = await db.rpc('reorder_trip_stops', { p_trip: tripId, p_ordered_ids: orderedIds });
    if (error) fail(error);
  },
  /** Proximity (gps_assisted) is only a hint; the caller decides which method to record. */
  async completeStop(stopId: string, o: { method: CompletionMethod; rating?: number | null; tip?: string | null; distanceM?: number | null }) {
    return (await run(db.from('trip_stops').update({
      completion_status: 'completed', completion_method: o.method, rating: o.rating ?? null, tip: o.tip ?? null, completion_distance_m: o.distanceM ?? null,
    }).eq('id', stopId).select('*').single())) as TripStop;
  },
  async uncompleteStop(stopId: string) {
    await run(db.from('trip_stops').update({ completion_status: 'planned' }).eq('id', stopId));
  },
  async invite(tripId: string, userId: string, role: 'editor' | 'viewer') {
    const { data: u } = await db.auth.getUser();
    await run(db.from('trip_members').insert({ trip_id: tripId, user_id: userId, role, invited_by: u.user!.id }));
  },
  async respondToInvite(tripId: string, accept: boolean) {
    const { data: u } = await db.auth.getUser();
    await run(db.from('trip_members').update({ invitation_status: accept ? 'accepted' : 'declined' }).eq('trip_id', tripId).eq('user_id', u.user!.id));
  },
  /** Publishing a route preview is a deliberate act and stores only a simplified, trimmed polyline. */
  async publishRoutePreview(tripId: string, encodedPolyline: string, distanceM?: number) {
    const { data: u } = await db.auth.getUser();
    await run(db.from('trip_route_previews').upsert({ trip_id: tripId, encoded_polyline: encodedPolyline, distance_m: distanceM ?? null, published_by: u.user!.id }));
  },
  async unpublishRoutePreview(tripId: string) {
    await run(db.from('trip_route_previews').delete().eq('trip_id', tripId));
  },
});

// ---------------------------------------------------------------- journeys / GPS sync
export const journeys = (db: Db) => ({
  /** Idempotent: calling twice with the same clientSessionId returns the same journey. */
  async start(tripId: string, clientSessionId: string, settings?: Record<string, number>, startedAtMs?: number): Promise<Journey> {
    const { data, error } = await db.rpc('start_journey', {
      p_trip: tripId, p_client_session_id: clientSessionId, p_settings: settings ?? null, p_started_at: startedAtMs ? new Date(startedAtMs).toISOString() : null,
    });
    if (error) fail(error);
    return data as Journey;
  },
  /** Closes a journey with the times measured on the device (valid after offline recording). Idempotent. */
  async finish(journeyId: string, endedAtMs: number, pausedSeconds: number): Promise<Journey> {
    const { data, error } = await db.rpc('finish_journey', { p_journey: journeyId, p_ended_at: new Date(endedAtMs).toISOString(), p_paused_seconds: Math.max(0, Math.round(pausedSeconds)) });
    if (error) fail(error);
    return data as Journey;
  },
  async setStatus(journeyId: string, status: JourneyStatus): Promise<Journey> {
    return (await run(db.from('journeys').update({ status }).eq('id', journeyId).select('*').single())) as Journey;
  },
  async forTrip(tripId: string): Promise<Journey[]> {
    return (await run(db.from('journeys').select('*').eq('trip_id', tripId).order('started_at', { ascending: false }))) as Journey[];
  },
  async setSharing(journeyId: string, share: boolean) {
    await run(db.from('journeys').update({ share_with_collaborators: share }).eq('id', journeyId));
  },
  async points(journeyId: string): Promise<Array<{ sequence_number: number; recorded_at: string; latitude: number; longitude: number }>> {
    return (await run(db.from('journey_points').select('sequence_number,recorded_at,latitude,longitude').eq('journey_id', journeyId).order('sequence_number'))) as never;
  },
  /** Sends one batch (<= 500). Safe to retry: the server de-duplicates on (journey, seq). */
  async syncBatch(journeyId: string, points: readonly GpsPoint[]): Promise<SyncResult> {
    const { data, error } = await db.rpc('sync_journey_points', { p_journey: journeyId, p_points: points.map(toSyncPayload) });
    if (error) fail(error);
    return data as SyncResult;
  },
  /**
   * Drains a PointBuffer. Stops at the first failed batch and reports it, leaving unsent points pending,
   * so the caller can schedule a retry with backoff. Never loses data.
   */
  async syncBuffer(journeyId: string, buffer: PointBuffer): Promise<{ ok: boolean; sent: number; error?: ApiError }> {
    let sent = 0;
    for (const batch of buffer.batches()) {
      try {
        await this.syncBatch(journeyId, batch);
        buffer.acknowledge(batch);
        sent += batch.length;
      } catch (e) {
        return { ok: false, sent, error: e instanceof ApiError ? e : new ApiError((e as Error).message) };
      }
    }
    return { ok: true, sent };
  },
});

// ---------------------------------------------------------------- posts & social
export interface FeedItem {
  post_id: string; author_id: string; username: string; display_name: string; avatar_url: string | null;
  post_type: string; caption: string; destination_id: string | null; trip_id: string | null; created_at: string;
  like_count: number; comment_count: number; liked_by_me: boolean; saved_by_me: boolean;
}

export const posts = (db: Db) => ({
  async feed(scope: 'following' | 'discover', cursor?: string | null, limit = 20): Promise<Page<FeedItem & { id: string }>> {
    const c = decodeCursor(cursor);
    const rows = (await run(db.rpc('get_home_feed', { p_scope: scope, p_limit: limit + 1, p_before: c?.t ?? null, p_before_id: c?.id ?? null }))) as FeedItem[];
    const withId = rows.map((r) => ({ ...r, id: r.post_id }));
    return pageOf(withId, limit);
  },
  async create(input: unknown, media: Array<{ path: string; type: 'image' | 'video'; width?: number; height?: number; alt?: string }> = [], publish = true) {
    const v = postInputSchema.parse({ ...(input as object), mediaCount: media.length });
    const { data: u } = await db.auth.getUser();
    const { mediaCount: _m, ...row } = v;
    const post = await run<{ id: string }>(db.from('posts').insert({ ...row, author_id: u.user!.id, publication_status: publish ? 'published' : 'draft' }).select('*').single());
    if (media.length) {
      await run(db.from('post_media').insert(media.map((m, i) => ({ post_id: post.id, storage_path: m.path, media_type: m.type, width: m.width, height: m.height, alt_text: m.alt ?? '', sort_order: i }))));
    }
    return post;
  },
  async get(postId: string) {
    return await run(db.from('posts').select('*, author:profiles(username,display_name,avatar_url), media:post_media(*), destination:destinations(slug,name)').eq('id', postId).maybeSingle());
  },
  async like(postId: string) {
    const { data: u } = await db.auth.getUser();
    await run(db.from('reactions').insert({ user_id: u.user!.id, post_id: postId, reaction_type: 'like' }));
  },
  async unlike(postId: string) {
    const { data: u } = await db.auth.getUser();
    await run(db.from('reactions').delete().eq('user_id', u.user!.id).eq('post_id', postId));
  },
  async comments(postId: string) {
    return await run(db.from('comments').select('*, author:profiles(username,display_name,avatar_url)').eq('post_id', postId).order('created_at'));
  },
  async comment(input: unknown) {
    const v = commentInputSchema.parse(input);
    const { data: u } = await db.auth.getUser();
    return await run(db.from('comments').insert({ ...v, author_id: u.user!.id }).select('*').single());
  },
  async remove(postId: string) {
    await run(db.from('posts').delete().eq('id', postId));
  },
  async mediaUrl(path: string, expiresInSeconds = 3600): Promise<string> {
    const { data, error } = await db.storage.from('post-media').createSignedUrl(path, expiresInSeconds);
    if (error) fail(error);
    return data.signedUrl;
  },
});

export const saved = (db: Db) => ({
  async save(type: 'destination' | 'trip' | 'post', id: string, collectionId?: string) {
    const { data: u } = await db.auth.getUser();
    await run(db.from('saved_items').insert({ user_id: u.user!.id, item_type: type, item_id: id, collection_id: collectionId ?? null }));
  },
  async unsave(type: 'destination' | 'trip' | 'post', id: string) {
    const { data: u } = await db.auth.getUser();
    await run(db.from('saved_items').delete().eq('user_id', u.user!.id).eq('item_type', type).eq('item_id', id));
  },
  async list(type?: 'destination' | 'trip' | 'post') {
    let q = db.from('saved_items').select('*').order('created_at', { ascending: false });
    if (type) q = q.eq('item_type', type);
    return await run(q);
  },
  async createCollection(title: string, visibility: 'public' | 'followers' | 'private' = 'private') {
    const { data: u } = await db.auth.getUser();
    return await run(db.from('collections').insert({ owner_id: u.user!.id, title, visibility }).select('*').single());
  },
});

export const social = (db: Db) => ({
  async report(input: unknown) {
    const v = reportInputSchema.parse(input);
    const { data: u } = await db.auth.getUser();
    await run(db.from('reports').insert({ ...v, reporter_id: u.user!.id }));
  },
  async search(query: string, kind: 'all' | 'profile' | 'destination' | 'trip' | 'post' | 'hashtag' = 'all', limit = 10, offset = 0) {
    const q = searchQuerySchema.parse(query);
    return (await run(db.rpc('search_all', { p_query: q, p_kind: kind, p_limit: limit, p_offset: offset }))) as Array<{ kind: string; id: string; title: string; subtitle: string | null; handle: string | null; score: number }>;
  },
  async notifications(limit = 30) {
    return await run(db.from('notifications').select('*, actor:profiles!notifications_actor_id_fkey(username,display_name,avatar_url)').order('created_at', { ascending: false }).limit(limit));
  },
  async markNotificationsRead(ids?: string[]) {
    const { data, error } = await db.rpc('mark_notifications_read', { p_ids: ids ?? null });
    if (error) fail(error);
    return data as number;
  },
  async openConversation(userId: string): Promise<string> {
    const { data, error } = await db.rpc('create_direct_conversation', { p_other: userId });
    if (error) fail(error);
    return data as string;
  },
  async sendMessage(conversationId: string, body: string) {
    const { data: u } = await db.auth.getUser();
    return await run(db.from('messages').insert({ conversation_id: conversationId, sender_id: u.user!.id, body }).select('*').single());
  },
  async messages(conversationId: string, limit = 50) {
    return await run(db.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(limit));
  },
  async track(event: string, props: Record<string, string | number | boolean> = {}) {
    // fire-and-forget; analytics must never break the product
    await db.rpc('track_event', { p_name: event, p_props: props }).then(() => undefined, () => undefined);
  },
  async registerPushToken(token: string, platform: 'android' | 'ios' | 'web') {
    const { data: u } = await db.auth.getUser();
    await run(db.from('push_tokens').upsert({ user_id: u.user!.id, token, platform, last_seen_at: new Date().toISOString() }, { onConflict: 'token' }));
  },
});

// ---------------------------------------------------------------- media uploads
export interface UploadOptions {
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

const BUCKET: Record<UploadKind, string> = {
  avatar: 'avatars', cover: 'covers', 'post-image': 'post-media', 'post-video': 'post-media', 'message-image': 'message-media',
};

/**
 * Validates, then uploads to a generated path (never the user's filename).
 * supabase-js has no progress events, so progress is reported as 0 -> 1 around the request.
 * Retries are the caller's choice: uploads use upsert=false so a retry cannot overwrite another object.
 */
export const media = (db: Db) => ({
  async upload(file: Blob & { name: string; type: string; size: number }, kind: UploadKind, o: UploadOptions = {}) {
    const check = validateUpload(file, kind);
    if (!check.ok) throw new ApiError(check.error ?? 'Invalid file', 'INVALID_UPLOAD');
    const { data: u } = await db.auth.getUser();
    if (!u.user) throw new ApiError('Not signed in', '42501');
    if (o.signal?.aborted) throw new ApiError('Upload cancelled', 'ABORTED');
    const path = buildStoragePath(u.user.id, check.ext as string);
    o.onProgress?.(0);
    const { error } = await db.storage.from(BUCKET[kind]).upload(path, file, { contentType: file.type, upsert: false });
    if (o.signal?.aborted) {
      await db.storage.from(BUCKET[kind]).remove([path]);
      throw new ApiError('Upload cancelled', 'ABORTED');
    }
    if (error) throw new ApiError(error.message, 'UPLOAD_FAILED');
    o.onProgress?.(1);
    return { path, bucket: BUCKET[kind] };
  },
  publicUrl(bucket: 'avatars' | 'covers', path: string): string {
    return db.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  },
});


// ---------------------------------------------------------------- journal (private by default)
export interface JournalEntry { id: string; trip_id: string; user_id: string; title: string; body: string; place_name: string | null; entry_at: string; is_highlight: boolean; visibility: 'public' | 'followers' | 'private' }
export const journal = (db: Db) => ({
  async list(tripId: string): Promise<JournalEntry[]> {
    return (await run(db.from('journal_entries').select('*').eq('trip_id', tripId).order('entry_at', { ascending: false }))) as JournalEntry[];
  },
  async add(tripId: string, e: { title?: string; body?: string; place_name?: string | null; is_highlight?: boolean; visibility?: JournalEntry['visibility'] }): Promise<JournalEntry> {
    const { data: u } = await db.auth.getUser();
    return (await run(db.from('journal_entries').insert({ trip_id: tripId, user_id: u.user!.id, visibility: 'private', ...e }).select('*').single())) as JournalEntry;
  },
  async remove(id: string) {
    await run(db.from('journal_entries').delete().eq('id', id));
  },
});

// ---------------------------------------------------------------- admin (every call is permission-checked in the database)
export const admin = (db: Db) => ({
  async stats() {
    const { data, error } = await db.rpc('admin_overview_stats');
    if (error) fail(error);
    return data as Record<string, number>;
  },
  async listUsers(search = '', limit = 25, offset = 0) {
    const { data, error } = await db.rpc('admin_list_users', { p_search: search, p_limit: limit, p_offset: offset });
    if (error) fail(error);
    return data as Array<{ id: string; username: string; display_name: string; account_status: string; created_at: string; roles: string[] }>;
  },
  async setAccountStatus(userId: string, status: 'active' | 'suspended', reason: string) {
    const { error } = await db.rpc('admin_set_account_status', { p_user: userId, p_status: status, p_reason: reason });
    if (error) fail(error);
  },
  async removePost(postId: string, reason: string) {
    const { error } = await db.rpc('admin_remove_post', { p_post: postId, p_reason: reason });
    if (error) fail(error);
  },
  async moderateComment(commentId: string, status: 'visible' | 'hidden' | 'removed', reason: string) {
    const { error } = await db.rpc('admin_moderate_comment', { p_comment: commentId, p_status: status, p_reason: reason });
    if (error) fail(error);
  },
  async resolveReport(reportId: string, status: 'reviewing' | 'resolved' | 'dismissed', note: string) {
    const { error } = await db.rpc('admin_resolve_report', { p_report: reportId, p_status: status, p_note: note });
    if (error) fail(error);
  },
  async setFeatured(type: 'destination' | 'trip', id: string, active: boolean) {
    const { error } = await db.rpc('admin_set_featured', { p_type: type, p_item: id, p_active: active, p_position: 0 });
    if (error) fail(error);
  },
  async saveDestination(data: Record<string, unknown>) {
    const { data: id, error } = await db.rpc('admin_save_destination', { p_data: data });
    if (error) fail(error);
    return id as string;
  },
  async grantRole(userId: string, role: string, reason: string) {
    const { error } = await db.rpc('admin_grant_role', { p_user: userId, p_role: role, p_reason: reason });
    if (error) fail(error);
  },
  async revokeRole(userId: string, role: string, reason: string) {
    const { error } = await db.rpc('admin_revoke_role', { p_user: userId, p_role: role, p_reason: reason });
    if (error) fail(error);
  },
  async reports(status = 'open') {
    return await run(db.from('reports').select('*').eq('status', status).order('created_at'));
  },
  async auditLogs(limit = 50) {
    return await run(db.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(limit));
  },
  async myPermissions(): Promise<string[]> {
    const { data: u } = await db.auth.getUser();
    if (!u.user) return [];
    const roles = (await run(db.from('role_assignments').select('role').eq('user_id', u.user.id))) as Array<{ role: string }>;
    if (!roles.length) return [];
    const perms = (await run(db.from('role_permissions').select('permission').in('role', roles.map((r) => r.role)))) as Array<{ permission: string }>;
    return [...new Set(perms.map((p) => p.permission))];
  },
});

export { PointBuffer };

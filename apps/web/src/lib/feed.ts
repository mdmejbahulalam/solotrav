import type { SupabaseClient } from '@supabase/supabase-js';
import type { PostCardData } from '@/components/PostCard';

type FeedRow = {
  post_id: string; author_id: string; username: string; display_name: string; avatar_url: string | null; post_type: string; caption: string;
  destination_id: string | null; trip_id: string | null; created_at: string; like_count: number; comment_count: number; liked_by_me: boolean; saved_by_me: boolean;
};

/** Adds destination, trip and (signed) media URLs to feed rows. All reads go through RLS. */
export async function enrichPosts(db: SupabaseClient, rows: FeedRow[], currentUserId?: string | null): Promise<PostCardData[]> {
  if (!rows.length) return [];
  const postIds = rows.map((r) => r.post_id);
  const destIds = [...new Set(rows.map((r) => r.destination_id).filter(Boolean))] as string[];
  const tripIds = [...new Set(rows.map((r) => r.trip_id).filter(Boolean))] as string[];

  const [media, dests, trips] = await Promise.all([
    db.from('post_media').select('post_id,storage_path,media_type,alt_text,sort_order').in('post_id', postIds).order('sort_order'),
    destIds.length ? db.from('destinations').select('id,slug,name,category').in('id', destIds) : Promise.resolve({ data: [] as never[] }),
    tripIds.length ? db.from('trips').select('id,title').in('id', tripIds) : Promise.resolve({ data: [] as never[] }),
  ]);

  const mediaRows = (media.data ?? []) as Array<{ post_id: string; storage_path: string; media_type: 'image' | 'video'; alt_text: string }>;
  const signed = mediaRows.length
    ? await db.storage.from('post-media').createSignedUrls(mediaRows.map((m) => m.storage_path), 3600)
    : { data: [] as Array<{ path: string | null; signedUrl: string }> };
  const urlByPath = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));

  const destById = new Map(((dests.data ?? []) as Array<{ id: string; slug: string | null; name: string | null; category: string | null }>).map((d) => [d.id, d]));
  const tripById = new Map(((trips.data ?? []) as Array<{ id: string; title: string }>).map((t) => [t.id, t]));

  return rows.map((r) => ({
    id: r.post_id, author_id: r.author_id, username: r.username, display_name: r.display_name, avatar_url: r.avatar_url, post_type: r.post_type,
    caption: r.caption, created_at: r.created_at, like_count: Number(r.like_count), comment_count: Number(r.comment_count), liked_by_me: r.liked_by_me, saved_by_me: r.saved_by_me,
    destination: r.destination_id ? (destById.get(r.destination_id) ?? null) : null,
    trip: r.trip_id ? (tripById.get(r.trip_id) ?? null) : null,
    isOwn: currentUserId ? r.author_id === currentUserId : false,
    mediaUrls: mediaRows.filter((m) => m.post_id === r.post_id).flatMap((m) => {
      const url = urlByPath.get(m.storage_path);
      return url ? [{ url, type: m.media_type, alt: m.alt_text }] : [];
    }),
  }));
}

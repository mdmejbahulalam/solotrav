import { api } from '@/lib/api';

export interface FeedPost {
  id: string; author_id: string; username: string; display_name: string; post_type: string; caption: string; created_at: string;
  like_count: number; comment_count: number; liked_by_me: boolean; saved_by_me: boolean;
  destination: { slug: string | null; name: string | null } | null; images: string[];
}

type Row = { post_id: string; author_id: string; username: string; display_name: string; post_type: string; caption: string; destination_id: string | null; created_at: string; like_count: number; comment_count: number; liked_by_me: boolean; saved_by_me: boolean };

/** Adds destination names and signed image URLs to feed rows (all reads go through RLS). */
export async function enrich(rows: Row[]): Promise<FeedPost[]> {
  if (!rows.length) return [];
  const { db } = api();
  const ids = rows.map((r) => r.post_id);
  const destIds = [...new Set(rows.map((r) => r.destination_id).filter(Boolean))] as string[];
  const [media, dests] = await Promise.all([
    db.from('post_media').select('post_id,storage_path,media_type').in('post_id', ids).eq('media_type', 'image').order('sort_order'),
    destIds.length ? db.from('destinations').select('id,slug,name').in('id', destIds) : Promise.resolve({ data: [] as never[] }),
  ]);
  const m = (media.data ?? []) as Array<{ post_id: string; storage_path: string }>;
  const signed = m.length ? await db.storage.from('post-media').createSignedUrls(m.map((x) => x.storage_path), 3600) : { data: [] as Array<{ path: string | null; signedUrl: string }> };
  const url = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));
  const dm = new Map(((dests.data ?? []) as Array<{ id: string; slug: string | null; name: string | null }>).map((d) => [d.id, d]));
  return rows.map((r) => ({
    id: r.post_id, author_id: r.author_id, username: r.username, display_name: r.display_name, post_type: r.post_type, caption: r.caption, created_at: r.created_at,
    like_count: Number(r.like_count), comment_count: Number(r.comment_count), liked_by_me: r.liked_by_me, saved_by_me: r.saved_by_me,
    destination: r.destination_id ? (dm.get(r.destination_id) ?? null) : null,
    images: m.filter((x) => x.post_id === r.post_id).flatMap((x) => { const u = url.get(x.storage_path); return u ? [u] : []; }),
  }));
}

export function ago(iso: string): string {
  const d = (Date.now() - Date.parse(iso)) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  if (d < 604800) return `${Math.floor(d / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
}

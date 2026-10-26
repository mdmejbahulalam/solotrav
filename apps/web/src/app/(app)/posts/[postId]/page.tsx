import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PostCard } from '@/components/PostCard';
import { ConfigNotice } from '@/components/ui';
import { supabaseConfigured } from '@/lib/env';
import { enrichPosts } from '@/lib/feed';
import { createAnonSupabase, createServerSupabase, getUser } from '@/lib/supabase/server';
import { Comments } from './Comments';
import { OwnerPostControls } from './OwnerPostControls';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type P = { params: Promise<{ postId: string }> };

/** Metadata comes from the anonymous client, so only genuinely public posts get titles/descriptions. */
export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { postId } = await params;
  if (!supabaseConfigured || !UUID.test(postId)) return { title: 'Post', robots: { index: false } };
  const { data } = await createAnonSupabase().from('posts').select('caption,author:profiles(username)').eq('id', postId).maybeSingle();
  if (!data) return { title: 'Post', robots: { index: false, follow: false } };
  const who = (data.author as unknown as { username: string } | null)?.username ?? 'a traveler';
  return { title: `Post by @${who}`, description: (data.caption || 'A travel post on SoloTrav').slice(0, 160), alternates: { canonical: `/posts/${postId}` } };
}

export default async function PostPage({ params }: P) {
  const { postId } = await params;
  if (!supabaseConfigured) return <ConfigNotice what="Supabase" vars={['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']} />;
  if (!UUID.test(postId)) notFound();
  const db = await createServerSupabase();
  const user = await getUser();

  const { data: raw } = await db.from('posts').select('id,author_id,post_type,caption,destination_id,trip_id,created_at,publication_status,visibility,author:profiles(username,display_name,avatar_url)').eq('id', postId).maybeSingle();
  if (!raw) notFound(); // RLS hides private / follower-only / blocked posts: identical to "does not exist"
  const [likes, comments, liked, saved] = await Promise.all([
    db.from('reactions').select('id', { count: 'exact', head: true }).eq('post_id', postId),
    db.from('comments').select('id,post_id,author_id,parent_comment_id,body,status,created_at,author:profiles(username,display_name,avatar_url)').eq('post_id', postId).order('created_at'),
    user ? db.from('reactions').select('id').eq('post_id', postId).eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
    user ? db.from('saved_items').select('id').eq('item_type', 'post').eq('item_id', postId).eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const a = raw.author as unknown as { username: string; display_name: string; avatar_url: string | null };
  const [card] = await enrichPosts(db, [{
    post_id: raw.id, author_id: raw.author_id, username: a.username, display_name: a.display_name, avatar_url: a.avatar_url, post_type: raw.post_type, caption: raw.caption,
    destination_id: raw.destination_id, trip_id: raw.trip_id, created_at: raw.created_at, like_count: likes.count ?? 0,
    comment_count: (comments.data ?? []).filter((c) => c.status === 'visible').length, liked_by_me: Boolean(liked.data), saved_by_me: Boolean(saved.data),
  }], user?.id);
  const isOwn = user?.id === raw.author_id;

  return (
    <div className="mx-auto max-w-2xl">
      {raw.publication_status !== 'published' && <p className="mb-3 rounded-xl bg-warn/15 p-3 text-sm font-semibold">This post is a {raw.publication_status}. Only you can see it.</p>}
      {card && <PostCard post={card} signedIn={Boolean(user)} />}
      {isOwn && <OwnerPostControls postId={postId} status={raw.publication_status} visibility={raw.visibility} caption={raw.caption} />}
      <Comments postId={postId} userId={user?.id ?? null} postAuthorId={raw.author_id} initial={(comments.data ?? []).map((c) => ({ ...c, author: c.author as unknown as { username: string; display_name: string; avatar_url: string | null } }))} />
    </div>
  );
}

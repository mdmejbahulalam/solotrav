'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Avatar, Card, Icon, Pill } from '@/components/ui';
import { Scene } from '@/components/Scene';
import { api, errorMessage } from '@/lib/api';

export interface PostCardData {
  id: string;
  author_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  post_type: string;
  caption: string;
  created_at: string;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  saved_by_me: boolean;
  destination?: { slug: string | null; name: string | null; category: string | null } | null;
  trip?: { title: string; id: string } | null;
  mediaUrls?: Array<{ url: string; type: 'image' | 'video'; alt: string }>;
  isOwn?: boolean;
}

function ago(iso: string): string {
  const d = (Date.now() - Date.parse(iso)) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  if (d < 604800) return `${Math.floor(d / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Renders hashtags as links without ever using dangerouslySetInnerHTML (XSS-safe). */
function Caption({ text }: { text: string }) {
  const parts = text.split(/((?:^|(?<=\s))#[\p{L}\p{N}_]{1,50})/u);
  return (
    <p className="whitespace-pre-wrap break-words">
      {parts.map((p, i) => p.startsWith('#') ? <Link key={i} href={`/search?q=${encodeURIComponent(p)}`} className="font-semibold text-primary">{p}</Link> : <span key={i}>{p}</span>)}
    </p>
  );
}

export function PostCard({ post, signedIn = true }: { post: PostCardData; signedIn?: boolean }) {
  const [liked, setLiked] = useState(post.liked_by_me);
  const [likes, setLikes] = useState(post.like_count);
  const [saved, setSaved] = useState(post.saved_by_me);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function toggleLike() {
    if (!signedIn) { window.location.href = '/login'; return; }
    if (pending) return;
    const was = liked;
    setPending(true); setLiked(!was); setLikes((n) => n + (was ? -1 : 1)); setError(null); // optimistic
    try {
      const a = api().posts;
      if (was) await a.unlike(post.id); else await a.like(post.id);
    } catch (e) {
      setLiked(was); setLikes((n) => n + (was ? 1 : -1)); setError(errorMessage(e)); // rolled back
    } finally { setPending(false); }
  }

  async function toggleSave() {
    if (!signedIn) { window.location.href = '/login'; return; }
    const was = saved;
    setSaved(!was); setError(null);
    try {
      if (was) await api().saved.unsave('post', post.id); else await api().saved.save('post', post.id);
    } catch (e) { setSaved(was); setError(errorMessage(e)); }
  }

  async function share() {
    const url = `${window.location.origin}/posts/${post.id}`;
    if (navigator.share) { try { await navigator.share({ url }); } catch { /* cancelled */ } }
    else { await navigator.clipboard?.writeText(url); setError('Link copied'); setTimeout(() => setError(null), 1800); }
  }

  return (
    <Card className="mb-4">
      <article aria-label={`Post by ${post.username}`}>
        <div className="flex items-center gap-3 p-3.5">
          <Link href={`/u/${post.username}`}><Avatar name={post.display_name} src={post.avatar_url} size={36} /></Link>
          <div className="min-w-0 flex-1">
            <Link href={`/u/${post.username}`} className="text-sm font-bold">{post.username}</Link>
            <div className="truncate text-xs text-muted">
              {post.destination?.name && <><Link href={`/destinations/${post.destination.slug}`}>{post.destination.name}</Link> · </>}
              <Link href={`/posts/${post.id}`}>{ago(post.created_at)}</Link>
              {post.trip && <> · <Link href={`/trips/${post.trip.id}`}>{post.trip.title}</Link></>}
            </div>
          </div>
          {post.post_type === 'tip' && <Pill tone="teal">Tip</Pill>}
          {post.post_type === 'checkin' && <Pill tone="ok"><Icon name="check" size={12} /> Destination completed</Pill>}
        </div>
        {post.mediaUrls && post.mediaUrls.length > 0 ? (
          <div className={post.mediaUrls.length > 1 ? 'grid grid-cols-2 gap-0.5' : ''}>
            {post.mediaUrls.map((m) => m.type === 'video'
              ? <video key={m.url} src={m.url} controls preload="metadata" playsInline className="max-h-[420px] w-full bg-black" aria-label={m.alt || 'Travel video'} />
              : <img key={m.url} src={m.url} alt={m.alt || 'Travel photo'} loading="lazy" className="max-h-[420px] w-full object-cover" />)}
          </div>
        ) : post.post_type !== 'text' ? <Scene category={post.destination?.category} className="h-56" /> : null}
        <div className="px-3.5 pt-1 pb-3.5">
          <div className="-mx-2 flex items-center">
            <button type="button" onClick={toggleLike} aria-pressed={liked} aria-label={liked ? 'Unlike' : 'Like'} className={`flex min-h-11 items-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold hover:bg-primary-soft ${liked ? 'text-coral-text' : 'text-muted'}`}><Icon name="heart" size={22} fill={liked} /> <span className="tabular">{likes}</span></button>
            <Link href={`/posts/${post.id}#comments`} aria-label={`${post.comment_count} comments`} className="flex min-h-11 items-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold text-muted hover:bg-primary-soft"><Icon name="chat" size={22} /> <span className="tabular">{post.comment_count}</span></Link>
            <button type="button" onClick={share} aria-label="Share" className="flex min-h-11 items-center rounded-xl px-2.5 text-muted hover:bg-primary-soft"><Icon name="share" size={22} /></button>
            <button type="button" onClick={toggleSave} aria-pressed={saved} aria-label={saved ? 'Remove from saved' : 'Save'} className={`ml-auto flex min-h-11 items-center rounded-xl px-2.5 hover:bg-primary-soft ${saved ? 'text-primary' : 'text-muted'}`}><Icon name="bookmark" size={22} fill={saved} /></button>
            {signedIn && !post.isOwn && <Link href={`/report?type=post&id=${post.id}`} aria-label="Report post" className="flex min-h-11 items-center rounded-xl px-2.5 text-muted hover:bg-primary-soft"><Icon name="flag" size={20} /></Link>}
          </div>
          {post.caption && <div className="mt-1"><b className="mr-1">{post.username}</b><Caption text={post.caption} /></div>}
          {error && <p role="status" className="mt-2 text-sm text-bad">{error}</p>}
        </div>
      </article>
    </Card>
  );
}

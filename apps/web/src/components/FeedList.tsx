'use client';

import { useState } from 'react';
import { Button, EmptyState, Notice, Skeleton } from '@/components/ui';
import { PostCard, type PostCardData } from '@/components/PostCard';
import { api, errorMessage } from '@/lib/api';
import { enrichPosts } from '@/lib/feed';

export function FeedList({ initial, initialCursor, scope, userId, emptyAction }: {
  initial: PostCardData[]; initialCursor: string | null; scope: 'following' | 'discover'; userId?: string | null; emptyAction?: React.ReactNode;
}) {
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function more() {
    if (loading || !cursor) return;
    setLoading(true); setError(null);
    try {
      const { db, posts } = api();
      const page = await posts.feed(scope, cursor);
      const enriched = await enrichPosts(db, page.items as never, userId);
      setItems((prev) => [...prev, ...enriched.filter((e) => !prev.some((p) => p.id === e.id))]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError(errorMessage(e));
    } finally { setLoading(false); }
  }

  if (!items.length) return <EmptyState title="Nothing here yet" action={emptyAction}>Follow travelers or share your first post.</EmptyState>;
  return (
    <div>
      {items.map((p) => <PostCard key={p.id} post={p} />)}
      {loading && <Skeleton className="h-64 w-full" />}
      {error && <Notice tone="error">{error} <button className="font-bold underline" onClick={more}>Retry</button></Notice>}
      {cursor && !loading && <div className="text-center"><Button variant="secondary" onClick={more}>Load more</Button></div>}
    </div>
  );
}

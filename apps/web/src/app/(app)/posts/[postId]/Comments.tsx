'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Avatar, Button, Notice, inputClass } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

interface C { id: string; post_id: string; author_id: string; parent_comment_id: string | null; body: string; status: string; created_at: string; author: { username: string; display_name: string; avatar_url: string | null } }

export function Comments({ postId, userId, postAuthorId, initial }: { postId: string; userId: string | null; postAuthorId: string; initial: C[] }) {
  const router = useRouter();
  const [items] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const visible = items.filter((c) => c.status === 'visible' || c.author_id === userId);
  const top = visible.filter((c) => !c.parent_comment_id);
  const repliesOf = (id: string) => visible.filter((c) => c.parent_comment_id === id);

  async function submit(e: FormEvent<HTMLFormElement>, parent: string | null) {
    e.preventDefault();
    const body = String(new FormData(e.currentTarget).get('body') ?? '');
    setBusy(true); setError(null);
    try { await api().posts.comment({ post_id: postId, parent_comment_id: parent, body }); setReplyTo(null); (e.target as HTMLFormElement).reset(); router.refresh(); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  async function del(id: string) {
    if (!confirm('Delete this comment?')) return;
    try { const { error: er } = await api().db.from('comments').delete().eq('id', id); if (er) throw new Error(er.message); router.refresh(); } catch (err) { setError(errorMessage(err)); }
  }

  const Item = ({ c, nested }: { c: C; nested?: boolean }) => (
    <li className={nested ? 'ml-10 border-l-2 border-line pl-3' : ''}>
      <div className="flex gap-3 py-3">
        <Avatar name={c.author.display_name} src={c.author.avatar_url} size={32} />
        <div className="min-w-0 flex-1">
          <Link href={`/u/${c.author.username}`} className="font-bold">{c.author.username}</Link> <span className="text-xs text-muted">{new Date(c.created_at).toLocaleString()}</span>
          {c.status !== 'visible' && <span className="ml-2 rounded bg-warn/15 px-1.5 text-xs">hidden by moderators</span>}
          <p className="break-words whitespace-pre-wrap">{c.body}</p>
          <div className="flex gap-3 text-xs font-semibold text-muted">
            {userId && !nested && <button type="button" onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}>Reply</button>}
            {userId && (c.author_id === userId || postAuthorId === userId) && <button type="button" className="text-bad" onClick={() => del(c.id)}>Delete</button>}
            {userId && c.author_id !== userId && <Link href={`/report?type=comment&id=${c.id}`}>Report</Link>}
          </div>
          {replyTo === c.id && (
            <form onSubmit={(e) => submit(e, c.id)} className="mt-2 flex gap-2"><input name="body" aria-label="Reply" maxLength={1000} required className={inputClass} placeholder={`Reply to ${c.author.username}`} /><Button type="submit" loading={busy}>Reply</Button></form>
          )}
        </div>
      </div>
      {!nested && <ul>{repliesOf(c.id).map((r) => <Item key={r.id} c={r} nested />)}</ul>}
    </li>
  );

  return (
    <section id="comments" aria-labelledby="ch" className="rounded-2xl border border-line bg-surface p-4">
      <h2 id="ch" className="mb-1 text-lg font-bold text-navy">Comments</h2>
      {error && <div className="my-2"><Notice tone="error">{error}</Notice></div>}
      {top.length === 0 ? <p className="py-3 text-sm text-muted">No comments yet.</p> : <ul className="divide-y divide-line">{top.map((c) => <Item key={c.id} c={c} />)}</ul>}
      {userId ? (
        <form onSubmit={(e) => submit(e, null)} className="mt-3 flex gap-2"><input name="body" aria-label="Add a comment" maxLength={1000} required className={inputClass} placeholder="Add a comment" /><Button type="submit" loading={busy}>Post</Button></form>
      ) : <p className="mt-3 text-sm"><Link className="font-bold text-primary" href={`/login?next=/posts/${postId}`}>Log in</Link> to comment.</p>}
    </section>
  );
}

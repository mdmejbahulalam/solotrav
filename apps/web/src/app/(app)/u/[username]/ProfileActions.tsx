'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Notice } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

type RelState = 'none' | 'pending' | 'following';

export function ProfileActions({ targetId, username, initialState, isPrivate }: { targetId: string; username: string; initialState: RelState; isPrivate: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<RelState>(initialState);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy('follow'); setError(null);
    const prev = state;
    try {
      if (state === 'none') { await api().profiles.follow(targetId); setState(isPrivate ? 'pending' : 'following'); void api().social.track('user_followed', { platform: 'web' }); }
      else { await api().profiles.unfollow(targetId); setState('none'); }
      router.refresh();
    } catch (e) { setState(prev); setError(errorMessage(e)); } finally { setBusy(null); }
  }
  async function message() {
    setBusy('msg'); setError(null);
    try { const id = await api().social.openConversation(targetId); router.push(`/messages/${id}`); } catch (e) { setError(errorMessage(e)); setBusy(null); }
  }
  async function block() {
    if (!confirm(`Block @${username}? They won't be able to see your content, follow you or message you.`)) return;
    setBusy('block'); setError(null);
    try { await api().profiles.block(targetId); router.replace('/home'); router.refresh(); } catch (e) { setError(errorMessage(e)); setBusy(null); }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant={state === 'none' ? 'primary' : 'secondary'} loading={busy === 'follow'} onClick={toggle}>{state === 'none' ? 'Follow' : state === 'pending' ? 'Requested' : 'Following'}</Button>
      <Button variant="secondary" loading={busy === 'msg'} onClick={message}>Message</Button>
      <details className="relative"><summary className="flex size-11 cursor-pointer list-none items-center justify-center rounded-xl hover:bg-primary-soft" aria-label="More options">⋯</summary>
        <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-line bg-surface p-1.5 shadow-lg">
          <Link href={`/report?type=profile&id=${targetId}`} className="block rounded-lg px-3 py-2 text-sm hover:bg-primary-soft">Report</Link>
          <button type="button" onClick={block} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-bad hover:bg-primary-soft">Block @{username}</button>
        </div></details>
      {error && <div className="w-full"><Notice tone="error">{error}</Notice></div>}
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Notice, inputClass } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

export function OwnerPostControls({ postId, status, visibility, caption }: { postId: string; status: string; visibility: string; caption: string }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(caption);
  const [vis, setVis] = useState(visibility);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run(label: string, fn: () => Promise<void>, after: () => void) {
    setBusy(label); setError(null);
    try { await fn(); after(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(null); }
  }
  const upd = async (patch: Record<string, unknown>) => { const { error: er } = await api().db.from('posts').update(patch).eq('id', postId); if (er) throw new Error(er.message); };
  return (
    <div className="mb-4 rounded-2xl border border-line bg-surface p-4">
      {error && <div className="mb-2"><Notice tone="error">{error}</Notice></div>}
      <div className="flex flex-wrap gap-2">
        {status === 'draft' && <Button loading={busy === 'pub'} onClick={() => run('pub', () => upd({ publication_status: 'published' }), () => router.refresh())}>Publish</Button>}
        <Button variant="secondary" onClick={() => setEdit((v) => !v)}>{edit ? 'Close editor' : 'Edit'}</Button>
        <Button variant="ghost" className="text-bad" loading={busy === 'del'} onClick={() => { if (confirm('Delete this post? This cannot be undone.')) void run('del', async () => { const { error: er } = await api().db.from('posts').delete().eq('id', postId); if (er) throw new Error(er.message); }, () => { router.replace('/home'); router.refresh(); }); }}>Delete</Button>
      </div>
      {edit && (
        <div className="mt-3 space-y-3">
          <textarea aria-label="Caption" value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={2000} className={`${inputClass} py-3`} />
          <select aria-label="Audience" value={vis} onChange={(e) => setVis(e.target.value)} className={inputClass}><option value="public">Public</option><option value="followers">Followers</option><option value="private">Only me</option></select>
          <Button loading={busy === 'save'} onClick={() => run('save', () => upd({ caption: text, visibility: vis }), () => { setEdit(false); router.refresh(); })}>Save changes</Button>
        </div>
      )}
    </div>
  );
}

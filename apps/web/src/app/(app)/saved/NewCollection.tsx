'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Notice, inputClass } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

export function NewCollection() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setError(null);
    try { await api().saved.createCollection(String(f.get('title') ?? '').trim(), (String(f.get('vis')) as 'public' | 'followers' | 'private') || 'private'); setOpen(false); router.refresh(); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  if (!open) return <Button variant="secondary" onClick={() => setOpen(true)}>+ New collection</Button>;
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input name="title" aria-label="Collection name" required maxLength={80} placeholder="Collection name" className={`${inputClass} w-48`} />
      <select name="vis" aria-label="Visibility" className={`${inputClass} w-32`}><option value="private">Private</option><option value="followers">Followers</option><option value="public">Public</option></select>
      <Button type="submit" loading={busy}>Create</Button><Button variant="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Button>
      {error && <div className="w-full"><Notice tone="error">{error}</Notice></div>}
    </form>
  );
}

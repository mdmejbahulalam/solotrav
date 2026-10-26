'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Field, Notice, Pill, inputClass } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import type { JournalEntry } from '@solotrav/api-client';

export function JournalPanel({ tripId, entries }: { tripId: string; entries: JournalEntry[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const title = String(f.get('title') ?? '').trim(); const body = String(f.get('body') ?? '').trim();
    if (!title && !body) { setError('Write a title or some notes first.'); return; }
    setBusy(true); setError(null);
    try {
      await api().journal.add(tripId, { title, body, place_name: String(f.get('place') ?? '').trim() || null, is_highlight: f.get('highlight') === 'on', visibility: f.get('share') === 'on' ? 'followers' : 'private' });
      (e.target as HTMLFormElement).reset(); router.refresh();
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (!confirm('Delete this journal entry? This cannot be undone.')) return;
    try { await api().journal.remove(id); router.refresh(); } catch (err) { setError(errorMessage(err)); }
  }

  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-teal-soft p-3 text-sm">🔒 Journal entries are private by default. Only you can read them unless you choose to share an entry with followers.</p>
      <form onSubmit={add} className="rounded-xl border border-line bg-surface p-4">
        {error && <div className="mb-3"><Notice tone="error">{error}</Notice></div>}
        <Field label="Title" htmlFor="jt"><input id="jt" name="title" maxLength={140} className={inputClass} /></Field>
        <Field label="Place (optional)" htmlFor="jp"><input id="jp" name="place" maxLength={120} className={inputClass} /></Field>
        <Field label="Notes" htmlFor="jb"><textarea id="jb" name="body" rows={4} maxLength={10000} className={`${inputClass} py-3`} /></Field>
        <div className="mb-3 flex flex-wrap gap-5 text-sm"><label className="flex items-center gap-2"><input type="checkbox" name="highlight" className="size-5 accent-primary" /> Highlight</label><label className="flex items-center gap-2"><input type="checkbox" name="share" className="size-5 accent-primary" /> Share with followers</label></div>
        <Button type="submit" loading={busy}>Save entry</Button>
      </form>
      {entries.length === 0 ? <p className="text-sm text-muted">No entries yet.</p> : (
        <ol className="space-y-3">
          {entries.map((j) => (
            <li key={j.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted">{new Date(j.entry_at).toLocaleString()}{j.place_name && <> · {j.place_name}</>}{j.is_highlight && <Pill tone="coral">★ Highlight</Pill>}<Pill>{j.visibility === 'private' ? 'Private' : 'Shared'}</Pill></div>
              {j.title && <h3 className="mt-1 font-bold text-navy">{j.title}</h3>}
              <p className="whitespace-pre-wrap">{j.body}</p>
              <button type="button" onClick={() => remove(j.id)} className="mt-2 text-sm font-semibold text-bad">Delete</button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Avatar, Notice, inputClass } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

type Result = { id: string; title: string; handle: string | null };

export function NewMessage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function search(v: string) {
    setQ(v); setError(null);
    if (v.trim().length < 2) { setResults([]); return; }
    try { setResults((await api().social.search(v, 'profile', 5)) as Result[]); } catch (e) { setError(errorMessage(e)); }
  }
  async function open(id: string) {
    try { router.push(`/messages/${await api().social.openConversation(id)}`); } catch (e) { setError(errorMessage(e)); }
  }
  return (
    <div className="relative mb-4">
      <label htmlFor="people" className="sr-only">Find a traveler to message</label>
      <input id="people" type="search" value={q} onChange={(e) => search(e.target.value)} placeholder="Find a traveler to message" className={inputClass} autoComplete="off" />
      {error && <div className="mt-2"><Notice tone="error">{error}</Notice></div>}
      {results.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
          {results.map((r) => <li key={r.id}><button type="button" onClick={() => open(r.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-primary-soft"><Avatar name={r.title} size={32} /><span><b>{r.title}</b> <span className="text-sm text-muted">@{r.handle}</span></span></button></li>)}
        </ul>
      )}
    </div>
  );
}

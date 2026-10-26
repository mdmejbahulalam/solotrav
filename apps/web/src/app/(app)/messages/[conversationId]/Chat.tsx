'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Notice, inputClass } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

type M = { id: string; sender_id: string; body: string; created_at: string };

export function Chat({ conversationId, userId, initial }: { conversationId: string; userId: string; initial: M[] }) {
  const [msgs, setMsgs] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [msgs.length]);

  // Realtime: one narrowly-filtered channel for this conversation only (RLS also applies to realtime).
  useEffect(() => {
    const { db } = api();
    const channel = db.channel(`conv:${conversationId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload: { new: unknown }) => setMsgs((cur) => (cur.some((m) => m.id === (payload.new as M).id) ? cur : [...cur, payload.new as M]))).subscribe();
    return () => { void db.removeChannel(channel); };
  }, [conversationId]);

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = String(new FormData(form).get('body') ?? '').trim();
    if (!body) return;
    setBusy(true); setError(null);
    try { const m = (await api().social.sendMessage(conversationId, body)) as unknown as M; setMsgs((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m])); form.reset(); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="flex min-h-72 flex-col gap-2 rounded-2xl border border-line bg-surface p-3" role="log" aria-live="polite">
        {msgs.length === 0 && <p className="text-sm text-muted">Say hello 👋</p>}
        {msgs.map((m) => (
          <div key={m.id} className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${m.sender_id === userId ? 'self-end bg-primary text-white' : 'self-start border border-line bg-bg'}`}>
            <p className="break-words whitespace-pre-wrap">{m.body}</p><time className="block text-[11px] opacity-70" dateTime={m.created_at}>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      {error && <div className="mt-2"><Notice tone="error">{error}</Notice></div>}
      <form onSubmit={send} className="mt-3 flex gap-2"><input name="body" aria-label="Message" maxLength={2000} required autoComplete="off" placeholder="Write a message" className={inputClass} /><Button type="submit" loading={busy}>Send</Button></form>
    </div>
  );
}

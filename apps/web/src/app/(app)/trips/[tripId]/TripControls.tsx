'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Notice } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

export function TripOwnerControls({ tripId, status, slug, visibility }: { tripId: string; status: string; slug: string; visibility: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(label: string, fn: () => Promise<unknown>, after?: () => void) {
    setBusy(label); setMsg(null);
    try { await fn(); if (after) after(); else router.refresh(); } catch (e) { setMsg(errorMessage(e)); } finally { setBusy(null); }
  }
  async function share() {
    const url = `${window.location.origin}/trips/${slug}`;
    if (visibility !== 'public') { setMsg('Only public trips have a shareable page. Set the trip to Public (Edit) first.'); return; }
    if (navigator.share) { try { await navigator.share({ url, title: 'My SoloTrav trip' }); } catch { /* cancelled */ } }
    else { await navigator.clipboard?.writeText(url); setMsg('Share link copied.'); }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === 'draft' && <Button loading={busy === 'pub'} onClick={() => run('pub', () => api().trips.publish(tripId, 'planned'))}>Publish</Button>}
      {status === 'planned' && <Button variant="coral" loading={busy === 'start'} onClick={() => run('start', () => api().trips.publish(tripId, 'active'))}>Start trip</Button>}
      {status === 'active' && <Button variant="secondary" loading={busy === 'done'} onClick={() => run('done', () => api().trips.update(tripId, { status: 'completed' }))}>Mark trip completed</Button>}
      <Button variant="ghost" onClick={share}>↗ Share</Button>
      <Button variant="ghost" className="text-bad" loading={busy === 'del'} onClick={() => { if (confirm('Delete this trip? Its stops, journeys and journal entries are removed permanently.')) void run('del', async () => { const { error } = await api().db.from('trips').delete().eq('id', tripId); if (error) throw new Error(error.message); }, () => { router.replace('/trips'); router.refresh(); }); }}>Delete</Button>
      {msg && <div className="w-full"><Notice>{msg}</Notice></div>}
    </div>
  );
}

/** Save / copy for visitors of a public trip page. Anonymous visitors are sent to log in. */
export function PublicTripActions({ tripId, slug, title, stops }: { tripId: string; slug: string; title: string; stops: Array<{ destinationId: string; notes: string }> }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);

  async function guard<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(label); setMsg(null);
    try {
      const { data } = await api().db.auth.getUser();
      if (!data.user) { router.push(`/login?next=${encodeURIComponent(`/trips/${slug}`)}`); return undefined; }
      return await fn();
    } catch (e) { setMsg({ tone: 'error', text: errorMessage(e) }); return undefined; } finally { setBusy(null); }
  }

  async function save() {
    const ok = await guard('save', async () => { await api().saved.save('trip', tripId); void api().social.track('itinerary_saved', { platform: 'web' }); return true; });
    if (ok) setMsg({ tone: 'ok', text: 'Saved to Trips → Saved itineraries.' });
  }
  async function copy() {
    const id = await guard('copy', async () => {
      const a = api();
      const t = await a.trips.create({ title: `${title}`.slice(0, 130) + ' (copy)', visibility: 'private' });
      for (const s of stops) await a.trips.addStop(t.id, { destination_id: s.destinationId, notes: s.notes });
      return t.id;
    });
    if (id) { router.push(`/trips/${id}/edit`); router.refresh(); }
  }
  async function share() {
    const url = `${window.location.origin}/trips/${slug}`;
    if (navigator.share) { try { await navigator.share({ url, title }); } catch { /* cancelled */ } } else { await navigator.clipboard?.writeText(url); setMsg({ tone: 'info', text: 'Link copied.' }); }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" loading={busy === 'save'} onClick={save}>☆ Save itinerary</Button>
        <Button loading={busy === 'copy'} onClick={copy}>Make my own copy</Button>
        <Button variant="ghost" onClick={share}>↗ Share</Button>
      </div>
      {msg && <Notice tone={msg.tone === 'error' ? 'error' : msg.tone === 'ok' ? 'ok' : 'info'}>{msg.text}</Notice>}
    </div>
  );
}

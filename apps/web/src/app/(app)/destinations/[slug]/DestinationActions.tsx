'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Icon, Notice, inputClass } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

export function DestinationActions({ destinationId, slug, saved: initialSaved, trips }: { destinationId: string; slug: string; saved: boolean; trips: Array<{ id: string; title: string }> }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [tripId, setTripId] = useState(trips[0]?.id ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  async function toggleSave() {
    setBusy('save'); setMsg(null);
    const was = saved; setSaved(!was);
    try { if (was) await api().saved.unsave('destination', destinationId); else await api().saved.save('destination', destinationId); }
    catch (e) { setSaved(was); setMsg({ tone: 'error', text: errorMessage(e) }); } finally { setBusy(null); }
  }
  async function addToTrip() {
    setBusy('add'); setMsg(null);
    try { await api().trips.addStop(tripId, { destination_id: destinationId }); setMsg({ tone: 'ok', text: 'Added to your trip.' }); router.refresh(); }
    catch (e) { setMsg({ tone: 'error', text: errorMessage(e) }); } finally { setBusy(null); }
  }

  return (
    <div className="flex flex-col gap-3 sm:items-end">
      <div className="flex flex-wrap items-center gap-2.5">
        <Button variant="secondary" loading={busy === 'save'} aria-pressed={saved} onClick={toggleSave}><Icon name="bookmark" size={18} fill={saved} />{saved ? 'Saved' : 'Save'}</Button>
        <Button onClick={() => router.push(`/trips/new?dest=${destinationId}`)}>Plan a trip here</Button>
      </div>
      {trips.length > 0 && (
        <div className="flex w-full max-w-md items-center gap-2">
          <label htmlFor="trip" className="sr-only">Add to a trip</label>
          <select id="trip" value={tripId} onChange={(e) => setTripId(e.target.value)} className={`${inputClass} h-11`}>{trips.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select>
          <Button variant="secondary" className="h-11 shrink-0" loading={busy === 'add'} onClick={addToTrip}>Add to trip</Button>
        </div>
      )}
      <div role="status" aria-live="polite" className="w-full">{msg && <Notice tone={msg.tone}>{msg.text}</Notice>}</div>
      <span className="sr-only">{slug}</span>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useRef, useState } from 'react';
import { MapView, type MapMarker } from '@/components/maps/MapView';
import { PlaceSearch, type PickedPlace } from '@/components/maps/PlaceSearch';
import { RouteEstimate } from '@/components/maps/RouteEstimate';
import { SortableStops, type StopRow } from '@/components/SortableStops';
import { Button, Field, Notice, inputClass } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { validateTripDates } from '@solotrav/business-logic';
import type { Destination, Trip, TripStop } from '@solotrav/shared-types';

type ServerStop = TripStop & { destination: Destination | null };

const toRow = (s: ServerStop): StopRow & { lat: number | null; lng: number | null } => ({
  id: s.id, name: s.destination?.name ?? s.custom_name ?? 'Stop', region: s.destination?.region ?? null, notes: s.notes,
  date: s.planned_arrival_at?.slice(0, 10) ?? '', minutes: s.target_minutes != null ? String(s.target_minutes) : '', completed: s.completion_status === 'completed',
  lat: s.destination?.latitude ?? s.custom_latitude, lng: s.destination?.longitude ?? s.custom_longitude,
});

/** Desktop-friendly planning workspace: itinerary sidebar + live map. Every change persists immediately and rolls back on error. */
export function TripWorkspace({ trip, initialStops, isOwner }: { trip: Trip; initialStops: ServerStop[]; isOwner: boolean }) {
  const router = useRouter();
  const [stops, setStops] = useState(() => initialStops.map(toRow));
  const [title, setTitle] = useState(trip.title);
  const [description, setDescription] = useState(trip.description);
  const [start, setStart] = useState(trip.start_date ?? '');
  const [end, setEnd] = useState(trip.end_date ?? '');
  const [visibility, setVisibility] = useState(trip.visibility);
  const [invite, setInvite] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const markers: MapMarker[] = useMemo(() => stops.filter((s) => s.lat != null && s.lng != null).map((s, i) => ({ id: s.id, lat: s.lat as number, lng: s.lng as number, kind: s.completed ? 'completed' as const : 'planned' as const, label: String(i + 1), title: s.name })), [stops]);
  const path = useMemo(() => markers.map((m) => [m.lat, m.lng] as [number, number]), [markers]);
  const points = useMemo(() => markers.map((m) => ({ lat: m.lat, lng: m.lng })), [markers]);

  const fail = (e: unknown) => setMsg({ tone: 'error', text: errorMessage(e) });

  const reorder = useCallback(async (ids: string[]) => {
    const before = stops;
    setStops(ids.map((id) => before.find((s) => s.id === id) as (typeof before)[number])); // optimistic
    try { await api().trips.reorderStops(trip.id, ids); setMsg(null); } catch (e) { setStops(before); fail(e); } // rollback
  }, [stops, trip.id]);

  function change(id: string, patch: Partial<Pick<StopRow, 'notes' | 'date' | 'minutes'>>) {
    setStops((cur) => cur.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(async () => {
      setStops((cur) => {
        const row = cur.find((r) => r.id === id);
        if (row) {
          api().trips.updateStop(id, { notes: row.notes, planned_arrival_at: row.date ? `${row.date}T00:00:00Z` : null, target_minutes: row.minutes ? Number(row.minutes) : null }).then(() => setMsg({ tone: 'info', text: 'Saved' })).catch(fail);
        }
        return cur;
      });
    }, 700);
  }

  async function remove(id: string) {
    const before = stops;
    setStops((cur) => cur.filter((s) => s.id !== id));
    try { await api().trips.removeStop(id); } catch (e) { setStops(before); fail(e); }
  }

  async function add(p: PickedPlace) {
    try {
      await api().trips.addStop(trip.id, { destination_id: p.destinationId });
      const fresh = await api().trips.get(trip.id);
      if (fresh) setStops(fresh.stops.map(toRow));
      setMsg({ tone: 'ok', text: `${p.name} added.` });
    } catch (e) { fail(e); }
  }

  async function saveDetails(publish = false) {
    const dateErr = validateTripDates(start || null, end || null);
    if (title.trim().length < 3) { setMsg({ tone: 'error', text: 'Give your trip a name (at least 3 characters).' }); return; }
    if (dateErr) { setMsg({ tone: 'error', text: dateErr }); return; }
    if (publish && stops.length === 0) { setMsg({ tone: 'error', text: 'Add at least one destination before publishing.' }); return; }
    setSaving(true);
    try {
      await api().trips.update(trip.id, { title: title.trim(), description, start_date: start || null, end_date: end || null, ...(isOwner ? { visibility } : {}), ...(publish && trip.status === 'draft' ? { status: 'planned' as const } : {}) });
      setMsg({ tone: 'ok', text: publish ? 'Trip published.' : 'Details saved.' });
      router.refresh();
    } catch (e) { fail(e); } finally { setSaving(false); }
  }

  async function sendInvite() {
    const username = invite.replace(/^@/, '').trim().toLowerCase();
    if (!username) return;
    try {
      const card = await api().profiles.card(username);
      if (!card) { setMsg({ tone: 'error', text: 'No traveler found with that username.' }); return; }
      await api().trips.invite(trip.id, card.id, 'editor');
      setInvite(''); setMsg({ tone: 'ok', text: `Invitation sent to @${card.username}.` });
    } catch (e) { fail(e); }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between"><h1 className="text-2xl font-extrabold text-navy">Planning workspace</h1><Link className="text-sm font-semibold text-primary" href={`/trips/${trip.id}`}>← Back to trip</Link></div>
      {msg && <div className="mb-4" aria-live="polite"><Notice tone={msg.tone === 'error' ? 'error' : msg.tone === 'ok' ? 'ok' : 'info'}>{msg.text}</Notice></div>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div className="space-y-5">
          <PlaceSearch onPick={add} label="Add a destination" />
          <section aria-labelledby="stops-h">
            <h2 id="stops-h" className="mb-2 font-bold">Stops ({stops.length})</h2>
            {stops.length === 0 ? <p className="rounded-xl bg-bg p-4 text-sm text-muted">No stops yet.</p> : <SortableStops stops={stops} onReorder={reorder} onChange={change} onRemove={remove} />}
          </section>
          <section className="rounded-2xl border border-line bg-surface p-4">
            <h2 className="mb-3 font-bold">Trip details</h2>
            <Field label="Name" htmlFor="t"><input id="t" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} maxLength={140} /></Field>
            <Field label="Description" htmlFor="d"><textarea id="d" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={`${inputClass} py-3`} maxLength={2000} /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Start" htmlFor="s"><input id="s" type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} /></Field><Field label="End" htmlFor="e"><input id="e" type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} className={inputClass} /></Field></div>
            <p className="-mt-2 mb-3 text-xs text-muted">Leave the dates empty for a trip with no fixed schedule.</p>
            {isOwner && (
              <Field label="Visibility" htmlFor="v"><select id="v" value={visibility} onChange={(e) => setVisibility(e.target.value as Trip['visibility'])} className={inputClass}><option value="private">Private</option><option value="followers">Followers</option><option value="public">Public</option></select></Field>
            )}
            <div className="flex flex-wrap gap-2"><Button variant="secondary" loading={saving} onClick={() => saveDetails(false)}>Save {trip.status === 'draft' ? 'draft' : 'changes'}</Button>{isOwner && trip.status === 'draft' && <Button loading={saving} onClick={() => saveDetails(true)}>Publish</Button>}</div>
          </section>
          {isOwner && (
            <section className="rounded-2xl border border-line bg-surface p-4">
              <h2 className="mb-2 font-bold">Collaborators</h2>
              <div className="flex gap-2"><input value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="username" aria-label="Username to invite" className={inputClass} /><Button variant="secondary" onClick={sendInvite}>Invite</Button></div>
              <p className="mt-1 text-xs text-muted">Invited people can edit the itinerary after they accept. Only you can change visibility.</p>
            </section>
          )}
        </div>
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <MapView markers={markers} path={path} dashedPath className="h-[420px] max-lg:h-[300px]" />
          <RouteEstimate points={points} />
        </div>
      </div>
    </div>
  );
}

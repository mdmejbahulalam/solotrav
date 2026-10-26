'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapView, type MapMarker } from '@/components/maps/MapView';
import { PlaceSearch, type PickedPlace } from '@/components/maps/PlaceSearch';
import { RouteEstimate } from '@/components/maps/RouteEstimate';
import { SortableStops, type StopRow } from '@/components/SortableStops';
import { Button, Field, Notice, inputClass } from '@/components/ui';
import { api, errorMessage, fieldErrors } from '@/lib/api';
import { validateTripDates } from '@solotrav/business-logic';
import { tripInputSchema } from '@solotrav/validation';

const STEPS = ['Trip details', 'Destinations', 'Route', 'Privacy & collaboration', 'Review'] as const;
const STYLES = ['Backpacking', 'Adventure', 'Couple', 'Family', 'Photography', 'Road trip', 'Luxury', 'Budget'];
type Stop = StopRow & { destinationId: string; lat?: number | null; lng?: number | null };
type Visibility = 'public' | 'followers' | 'private';

export function TripWizard({ initialDestinationId }: { initialDestinationId?: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [noDates, setNoDates] = useState(true);
  const [style, setStyle] = useState('Backpacking');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [invites, setInvites] = useState('');
  const [stops, setStops] = useState<Stop[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'draft' | 'publish' | 'start'>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // pre-fill from /destinations/x "Create a new trip"
  useEffect(() => {
    if (!initialDestinationId) return;
    void (async () => {
      const { data } = await api().db.from('destinations').select('id,name,region,latitude,longitude').eq('id', initialDestinationId).maybeSingle();
      if (data) setStops((s) => s.length ? s : [{ id: crypto.randomUUID(), destinationId: data.id as string, name: (data.name as string | null) ?? 'Destination', region: data.region as string | null, lat: data.latitude as number | null, lng: data.longitude as number | null, notes: '', date: '', minutes: '' }]);
    })();
  }, [initialDestinationId]);

  useEffect(() => { headingRef.current?.focus(); }, [step]);

  const markers: MapMarker[] = useMemo(() => stops.filter((s) => s.lat != null && s.lng != null).map((s, i) => ({ id: s.id, lat: s.lat as number, lng: s.lng as number, kind: 'planned' as const, label: String(i + 1), title: s.name })), [stops]);
  const path = useMemo(() => markers.map((m) => [m.lat, m.lng] as [number, number]), [markers]);

  function addPlace(p: PickedPlace) {
    if (stops.some((s) => s.destinationId === p.destinationId)) { setError(`${p.name} is already in this trip.`); return; }
    setError(null);
    setStops((s) => [...s, { id: crypto.randomUUID(), destinationId: p.destinationId, name: p.name, region: p.region, lat: p.lat, lng: p.lng, notes: '', date: '', minutes: '' }]);
  }

  function validateStep(n: number): boolean {
    if (n === 0) {
      const e: Record<string, string> = {};
      if (title.trim().length < 3) e.title = 'Give your trip a name (at least 3 characters).';
      const d = noDates ? null : validateTripDates(start || null, end || null);
      if (d) e.dates = d;
      setErrors(e);
      return Object.keys(e).length === 0;
    }
    return true;
  }
  const next = () => { if (validateStep(step)) setStep((s) => Math.min(s + 1, STEPS.length - 1)); };

  async function save(mode: 'draft' | 'publish' | 'start') {
    if (!validateStep(0)) { setStep(0); return; }
    if (mode !== 'draft' && stops.length === 0) { setStep(1); setError('Add at least one destination before publishing.'); return; }
    setBusy(mode); setError(null);
    const a = api();
    let tripId: string | null = null;
    try {
      const parsed = tripInputSchema.parse({ title, description, start_date: noDates ? null : start || null, end_date: noDates ? null : end || null, visibility, travel_style: style });
      const trip = await a.trips.create(parsed);
      tripId = trip.id;
      for (const s of stops) {
        await a.trips.addStop(trip.id, {
          destination_id: s.destinationId, notes: s.notes,
          planned_arrival_at: s.date ? `${s.date}T00:00:00Z` : null, target_minutes: s.minutes ? Number(s.minutes) : null,
        });
      }
      const failed: string[] = [];
      for (const raw of invites.split(/[\s,]+/).map((x) => x.replace(/^@/, '').trim()).filter(Boolean)) {
        try {
          const card = await a.profiles.card(raw);
          if (!card) { failed.push(raw); continue; }
          await a.trips.invite(trip.id, card.id, 'editor');
        } catch { failed.push(raw); }
      }
      if (mode !== 'draft') await a.trips.publish(trip.id, mode === 'start' ? 'active' : 'planned');
      void a.social.track(mode === 'draft' ? 'trip_created' : 'trip_published', { platform: 'web' });
      router.push(`/trips/${trip.id}${failed.length ? `?invite_failed=${encodeURIComponent(failed.join(','))}` : ''}`);
      router.refresh();
    } catch (e) {
      const fe = fieldErrors(e);
      if (Object.keys(fe).length) { setErrors(fe); setStep(0); }
      // a half-created trip stays as a draft the user can finish; tell them instead of hiding it
      setError(tripId ? `Your trip was created as a draft, but a later step failed: ${errorMessage(e)}` : errorMessage(e));
      if (tripId) router.push(`/trips/${tripId}/edit`);
    } finally { setBusy(null); }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex gap-1.5" aria-hidden>{STEPS.map((_, i) => <i key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-primary' : 'bg-line'}`} />)}</div>
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-extrabold text-navy outline-none">{STEPS[step]}</h1>
      <p className="mb-4 text-sm text-muted">Step {step + 1} of {STEPS.length}</p>
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}

      {step === 0 && (
        <section>
          <Field label="Trip name" htmlFor="title" error={errors.title}><input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} className={inputClass} aria-invalid={Boolean(errors.title)} /></Field>
          <Field label="Description (optional)" htmlFor="desc"><textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={4} className={`${inputClass} py-3`} /></Field>
          <label className="mb-3 flex items-center gap-3 text-sm"><input type="checkbox" checked={noDates} onChange={(e) => setNoDates(e.target.checked)} className="size-5 accent-primary" /> I don&apos;t have fixed dates yet</label>
          {!noDates && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Start date" htmlFor="start"><input id="start" type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} /></Field>
              <Field label="End date" htmlFor="end" error={errors.dates ?? errors.end_date}><input id="end" type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} className={inputClass} /></Field>
            </div>
          )}
          <Field label="Travel style" htmlFor="style"><select id="style" value={style} onChange={(e) => setStyle(e.target.value)} className={inputClass}>{STYLES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        </section>
      )}

      {step === 1 && (
        <section>
          <PlaceSearch onPick={addPlace} />
          <h2 className="mt-5 mb-2 text-base font-bold">Your stops ({stops.length})</h2>
          {stops.length === 0 ? <p className="rounded-xl bg-bg p-4 text-sm text-muted">No stops yet. Search above to add your first destination. You can also save the trip as a draft without stops.</p> : (
            <SortableStops stops={stops} onReorder={(ids) => setStops((cur) => ids.map((id) => cur.find((s) => s.id === id) as Stop))}
              onChange={(id, patch) => setStops((cur) => cur.map((s) => (s.id === id ? { ...s, ...patch } : s)))} onRemove={(id) => setStops((cur) => cur.filter((s) => s.id !== id))} />
          )}
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <MapView markers={markers} path={path} dashedPath className="h-[360px]" />
          <RouteEstimate points={markers.map((m) => ({ lat: m.lat, lng: m.lng }))} />
        </section>
      )}

      {step === 3 && (
        <section>
          <h2 className="mb-2 text-base font-bold">Who can see this trip?</h2>
          {([['public', 'Public', 'Anyone can find and view the planned itinerary once published.'], ['followers', 'Followers', 'Only people who follow you.'], ['private', 'Private', 'Only you and collaborators you invite.']] as const).map(([v, l, d]) => (
            <label key={v} className="mb-2.5 flex cursor-pointer items-start gap-3 rounded-xl border-[1.5px] border-line p-4 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
              <input type="radio" name="vis" checked={visibility === v} onChange={() => setVisibility(v)} className="mt-1 size-5 accent-primary" /><span><b>{l}</b><br /><span className="text-sm text-muted">{d}</span></span>
            </label>
          ))}
          <Field label="Invite collaborators (optional)" htmlFor="inv" hint="Usernames, separated by commas. They can edit the itinerary after accepting."><input id="inv" value={invites} onChange={(e) => setInvites(e.target.value)} placeholder="e.g. tania, rafi_roams" className={inputClass} /></Field>
        </section>
      )}

      {step === 4 && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-xl font-extrabold text-navy">{title || 'Untitled trip'}</h2>
            <p className="text-sm text-muted">{noDates ? 'Flexible dates' : `${start || '?'} → ${end || '?'}`} · {style} · {visibility}</p>
            {description && <p className="mt-2">{description}</p>}
            <ol className="mt-3 list-decimal space-y-1 pl-5">{stops.map((s) => <li key={s.id}>{s.name}{s.date ? ` · ${s.date}` : ''}</li>)}</ol>
            {stops.length === 0 && <p className="mt-3 text-sm text-warn">No destinations yet: you can save a draft, but publishing needs at least one stop.</p>}
          </div>
          <Notice>Starting a trip does not turn on GPS. Tracking only begins when you press Start in the Android app and allow location.</Notice>
          <div className="grid gap-2 sm:grid-cols-3">
            <Button variant="secondary" loading={busy === 'draft'} disabled={busy !== null} onClick={() => save('draft')}>Save draft</Button>
            <Button loading={busy === 'publish'} disabled={busy !== null} onClick={() => save('publish')}>Publish trip</Button>
            <Button variant="coral" loading={busy === 'start'} disabled={busy !== null} onClick={() => save('start')}>Start trip now</Button>
          </div>
        </section>
      )}

      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Back</Button>
        {step < STEPS.length - 1 && <Button onClick={next}>Continue</Button>}
      </div>
    </div>
  );
}


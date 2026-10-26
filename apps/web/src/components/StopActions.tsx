'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Notice, inputClass } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { formatDistance, haversineMeters, proximityHint } from '@solotrav/business-logic';

/**
 * Completes a stop. Manual completion always works and needs no location.
 * "Check my distance" is optional: it uses the browser position once, keeps only the computed distance,
 * and records the completion as GPS-assisted only when the user is within the threshold. Proximity is a hint, not proof.
 */
export function StopActions({ stopId, completed, lat, lng, canEdit }: { stopId: string; completed: boolean; lat: number | null; lng: number | null; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [tip, setTip] = useState('');
  const [prox, setProx] = useState<{ distance: number; hint: 'near' | 'uncertain' | 'far' } | null>(null);
  const [locMsg, setLocMsg] = useState<string | null>(null);

  if (!canEdit) return null;

  async function finish(method: 'manual' | 'gps_assisted') {
    setBusy(true); setError(null);
    try {
      await api().trips.completeStop(stopId, { method, rating, tip: tip.trim() || null, distanceM: method === 'gps_assisted' && prox ? Math.round(prox.distance) : null });
      void api().social.track('destination_completed', { method, platform: 'web' });
      setOpen(false);
      router.refresh();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }

  function check() {
    setLocMsg(null);
    if (lat == null || lng == null) { setLocMsg('This stop has no coordinates to compare against.'); return; }
    if (!('geolocation' in navigator)) { setLocMsg('Location is not available in this browser. You can still mark it complete manually.'); return; }
    setLocMsg('Waiting for your browser to share your location…');
    navigator.geolocation.getCurrentPosition(
      (p) => { const d = haversineMeters(p.coords.latitude, p.coords.longitude, lat, lng); setProx({ distance: d, hint: proximityHint(d, p.coords.accuracy) }); setLocMsg(null); },
      (e) => setLocMsg(e.code === e.PERMISSION_DENIED ? 'Location permission is off, so distance cannot be checked. You can still complete manually.' : 'Could not get your location. You can still complete manually.'),
      { enableHighAccuracy: true, timeout: 12_000 },
    );
  }

  if (completed) {
    return <Button variant="ghost" className="min-h-9 text-sm" loading={busy} onClick={async () => { setBusy(true); try { await api().trips.uncompleteStop(stopId); router.refresh(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }}>Undo completion</Button>;
  }
  return (
    <div>
      {!open ? <Button className="min-h-9 text-sm" onClick={() => setOpen(true)}>✓ Mark completed</Button> : (
        <div className="mt-2 rounded-xl border border-line bg-bg p-4">
          <fieldset className="mb-3"><legend className="mb-1 text-sm font-semibold">Rating (optional)</legend>
            <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-label={`${n} star${n > 1 ? 's' : ''}`} aria-pressed={rating === n} onClick={() => setRating(rating === n ? null : n)} className={`size-10 rounded-lg text-xl ${rating && n <= rating ? 'text-warn' : 'text-line'}`}>★</button>)}</div></fieldset>
          <label className="mb-1 block text-sm font-semibold" htmlFor={`tip-${stopId}`}>Travel tip (optional)</label>
          <input id={`tip-${stopId}`} value={tip} maxLength={400} onChange={(e) => setTip(e.target.value)} className={inputClass} placeholder="One useful tip for the next traveler" />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="secondary" className="min-h-9 text-sm" onClick={check}>Check my distance (optional)</Button>
            {prox && <span className="text-sm">{formatDistance(prox.distance)} away — {prox.hint === 'near' ? 'close enough to confirm' : prox.hint === 'uncertain' ? 'location accuracy is too low to be sure' : 'not at this place yet'}</span>}
          </div>
          {locMsg && <p role="status" className="mt-2 text-sm text-muted">{locMsg}</p>}
          {error && <div className="mt-2"><Notice tone="error">{error}</Notice></div>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button className="min-h-10" loading={busy} onClick={() => finish('manual')}>Complete manually</Button>
            {prox?.hint === 'near' && <Button variant="coral" className="min-h-10" loading={busy} onClick={() => finish('gps_assisted')}>Complete with GPS confirmation</Button>}
            <Button variant="ghost" className="min-h-10" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}
      {!open && error && <p className="mt-1 text-sm text-bad">{error}</p>}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { Notice } from '@/components/ui';
import { formatDistance } from '@solotrav/business-logic';

export interface Estimate { distanceMeters: number; durationSeconds: number; encodedPolyline: string | null }

/** Real road distance/duration from the server-side Routes API. Shows an explicit state when unavailable, never a made-up number. */
export function RouteEstimate({ points, onResult }: { points: Array<{ lat: number; lng: number }>; onResult?: (e: Estimate | null) => void }) {
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'ok' | 'unavailable' | 'error'; est?: Estimate; message?: string }>({ status: 'idle' });
  const key = points.map((p) => `${p.lat},${p.lng}`).join('|');

  useEffect(() => {
    if (points.length < 2) { setState({ status: 'idle' }); onResult?.(null); return; }
    const ctrl = new AbortController();
    setState({ status: 'loading' });
    fetch('/api/route-estimate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ points }), signal: ctrl.signal })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (r.ok) { setState({ status: 'ok', est: j }); onResult?.(j); }
        else if (j.error === 'not_configured') { setState({ status: 'unavailable', message: 'Route estimates need a Google Routes API key on the server (GOOGLE_MAPS_SERVER_KEY).' }); onResult?.(null); }
        else { setState({ status: 'error', message: j.error === 'rate_limited' ? 'Too many estimate requests. Try again in a minute.' : 'The route estimate could not be loaded. You can continue without it.' }); onResult?.(null); }
      })
      .catch((e) => { if (e.name !== 'AbortError') { setState({ status: 'error', message: 'The route estimate could not be loaded. You can continue without it.' }); onResult?.(null); } });
    return () => ctrl.abort();
    // Re-run only when the stops change: `points` is covered by `key`, and the callback's identity must not retrigger billable requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (state.status === 'idle') return <p className="text-sm text-muted">Add at least two stops to see a route estimate.</p>;
  if (state.status === 'loading') return <p className="text-sm text-muted" aria-busy>Calculating route…</p>;
  if (state.status === 'ok' && state.est) {
    const h = state.est.durationSeconds / 3600;
    return (
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-bg p-3"><div className="text-xs font-semibold text-muted">Driving distance</div><div className="text-xl font-extrabold text-navy">{formatDistance(state.est.distanceMeters)}</div></div>
        <div className="rounded-xl bg-bg p-3"><div className="text-xs font-semibold text-muted">Estimated drive time</div><div className="text-xl font-extrabold text-navy">{h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h`}</div></div>
        <p className="col-span-2 text-xs text-muted">Estimates from Google Routes without live traffic. Actual times vary.</p>
      </div>
    );
  }
  return <Notice tone="warn">{state.message}</Notice>;
}

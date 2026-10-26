'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, Notice } from '@/components/ui';
import { formatDistance, haversineMeters } from '@solotrav/business-logic';

type Place = { slug: string; name: string; lat: number; lng: number };

/**
 * Nearby recommendations. Location permission is requested only when the user presses the button,
 * the position is used once in the browser to sort a list, and is never sent to the server.
 */
export function NearbyButton({ places }: { places: Place[] }) {
  const [state, setState] = useState<'idle' | 'asking' | 'done' | 'denied' | 'error'>('idle');
  const [list, setList] = useState<Array<Place & { d: number }>>([]);

  function ask() {
    if (!('geolocation' in navigator)) { setState('error'); return; }
    setState('asking');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const near = places.map((p) => ({ ...p, d: haversineMeters(pos.coords.latitude, pos.coords.longitude, p.lat, p.lng) })).sort((a, b) => a.d - b.d).slice(0, 5);
        setList(near); setState('done');
      },
      (err) => setState(err.code === err.PERMISSION_DENIED ? 'denied' : 'error'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-[20px] border border-dashed border-control bg-surface p-[18px]">
      <h2 className="text-[15px] font-extrabold">Nearby places</h2>
      {state === 'idle' && (<>
        <p className="text-[13px] leading-[19px] text-body">This is off until you allow your browser to share location. Searching by name always works without it.</p>
        <Button variant="secondary" onClick={ask} className="h-11 text-sm font-bold">Use my location</Button>
      </>)}
      {state === 'asking' && <Notice>Waiting for your browser&apos;s location permission…</Notice>}
      {state === 'denied' && <Notice tone="warn">Location permission is off, so nearby places can&apos;t be shown. You can enable it in your browser&apos;s site settings, or keep browsing without it.</Notice>}
      {state === 'error' && <Notice tone="warn">Your location couldn&apos;t be determined. Try again, or keep browsing without it.</Notice>}
      {state === 'done' && (
        <div>
          <p className="mb-2 text-xs text-muted">Nearest destinations. Your location stays in your browser.</p>
          <ul className="space-y-1.5">{list.map((p) => <li key={p.slug} className="text-sm"><Link className="font-bold text-primary" href={`/destinations/${p.slug}`}>{p.name}</Link> <span className="text-muted">· {formatDistance(p.d)} (straight-line)</span></li>)}</ul>
        </div>
      )}
    </div>
  );
}

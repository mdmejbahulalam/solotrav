'use client';

import { AdvancedMarker, APIProvider, Map, Pin, useMap } from '@vis.gl/react-google-maps';
import { useEffect, useMemo, useState } from 'react';
import { ConfigNotice } from '@/components/ui';
import { env, mapsConfigured } from '@/lib/env';
import { mapColors } from '@solotrav/ui-tokens';

export type MarkerKind = 'planned' | 'completed' | 'saved' | 'destination';
export interface MapMarker { id: string; lat: number; lng: number; kind: MarkerKind; label?: string; title: string; onSelect?: () => void }

const COLOR: Record<MarkerKind, string> = { planned: mapColors.planned, completed: mapColors.completed, saved: mapColors.saved, destination: mapColors.destination };

function Polyline({ path, color, dashed }: { path: Array<[number, number]>; color: string; dashed?: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!map || path.length < 2) return;
    const line = new google.maps.Polyline({
      map, path: path.map(([lat, lng]) => ({ lat, lng })), strokeColor: color, strokeWeight: 4, strokeOpacity: dashed ? 0 : 0.9,
      icons: dashed ? [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, strokeColor: color, scale: 3 }, offset: '0', repeat: '12px' }] : undefined,
    });
    return () => line.setMap(null);
  }, [map, path, color, dashed]);
  return null;
}

function Fit({ points }: { points: Array<[number, number]> }) {
  const map = useMap();
  useEffect(() => {
    if (!map || points.length === 0) return;
    if (points.length === 1) { map.setCenter({ lat: points[0]![0], lng: points[0]![1] }); map.setZoom(11); return; }
    const b = new google.maps.LatLngBounds();
    points.forEach(([lat, lng]) => b.extend({ lat, lng }));
    map.fitBounds(b, 56);
  }, [map, points]);
  return null;
}

function Recenter({ onLocate }: { onLocate: (ll: [number, number]) => void }) {
  const map = useMap();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="absolute top-2 right-2 flex flex-col items-end gap-2">
      <button type="button" aria-label="Show my location" className="flex size-12 items-center justify-center rounded-xl border border-line bg-surface shadow" onClick={() => {
        if (!('geolocation' in navigator)) { setMsg('Location is not available in this browser.'); return; }
        navigator.geolocation.getCurrentPosition(
          (p) => { const ll: [number, number] = [p.coords.latitude, p.coords.longitude]; onLocate(ll); map?.panTo({ lat: ll[0], lng: ll[1] }); map?.setZoom(14); setMsg(null); },
          (e) => setMsg(e.code === e.PERMISSION_DENIED ? 'Location permission is off. Enable it in your browser settings to use this.' : 'Could not get your location.'),
          { timeout: 10_000 },
        );
      }}>◎</button>
      {msg && <p role="status" className="max-w-56 rounded-lg bg-surface p-2 text-xs shadow">{msg}</p>}
    </div>
  );
}

export function MapUnavailable({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line bg-surface p-5">
      <ConfigNotice what="Google Maps" vars={['NEXT_PUBLIC_GOOGLE_MAPS_WEB_KEY']} />
      {children}
    </div>
  );
}

/**
 * Real Google Map. If the key is missing it shows an actionable configuration notice instead of a fake map.
 * Attribution (Google logo/copyright) is rendered by Google Maps itself and must not be hidden.
 */
export function MapView({ markers, path, dashedPath, route, className = 'h-[380px]', showLocate = false, fallback }: {
  markers: MapMarker[]; path?: Array<[number, number]>; dashedPath?: boolean; route?: Array<[number, number]>; className?: string; showLocate?: boolean; fallback?: React.ReactNode;
}) {
  const [me, setMe] = useState<[number, number] | null>(null);
  const pts = useMemo(() => markers.map((m) => [m.lat, m.lng] as [number, number]), [markers]);
  if (!mapsConfigured) return <MapUnavailable>{fallback}</MapUnavailable>;
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-line ${className}`}>
      <APIProvider apiKey={env.googleMapsKey as string} libraries={['places']}>
        <Map mapId={process.env.NEXT_PUBLIC_GOOGLE_MAP_ID ?? 'DEMO_MAP_ID'} defaultCenter={{ lat: 23.8, lng: 90.4 }} defaultZoom={7} gestureHandling="greedy" disableDefaultUI zoomControl clickableIcons={false}>
          {markers.map((m) => (
            <AdvancedMarker key={m.id} position={{ lat: m.lat, lng: m.lng }} title={m.title} onClick={m.onSelect}>
              <Pin background={COLOR[m.kind]} borderColor="#fff" glyphColor="#fff" glyph={m.label} />
            </AdvancedMarker>
          ))}
          {me && <AdvancedMarker position={{ lat: me[0], lng: me[1] }} title="Your current location"><div className="size-4 rounded-full border-[3px] border-white bg-[#1769FF] shadow-[0_0_0_8px_rgba(23,105,255,.25)]" /></AdvancedMarker>}
          {path && <Polyline path={path} color={mapColors.planned} dashed={dashedPath} />}
          {route && <Polyline path={route} color={mapColors.route} />}
          <Fit points={pts} />
          {showLocate && <Recenter onLocate={setMe} />}
        </Map>
      </APIProvider>
    </div>
  );
}

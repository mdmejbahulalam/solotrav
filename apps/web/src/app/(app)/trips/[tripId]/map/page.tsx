import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MapView, type MapMarker } from '@/components/maps/MapView';
import { createServerSupabase, requireUser } from '@/lib/supabase/server';
import { decodePolyline } from '@solotrav/business-logic';
import { trips as tripsApi } from '@solotrav/api-client';

export const metadata = { title: 'Trip map', robots: { index: false } };

export default async function TripMapPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  await requireUser(`/trips/${tripId}/map`);
  if (!/^[0-9a-f-]{36}$/i.test(tripId)) notFound();
  const db = await createServerSupabase();
  const data = await tripsApi(db).get(tripId);
  if (!data) notFound();
  const { data: preview } = await db.from('trip_route_previews').select('encoded_polyline').eq('trip_id', tripId).maybeSingle();
  const markers: MapMarker[] = data.stops.flatMap((s, i) => {
    const lat = s.destination?.latitude ?? s.custom_latitude; const lng = s.destination?.longitude ?? s.custom_longitude;
    return lat != null && lng != null ? [{ id: s.id, lat, lng, kind: (s.completion_status === 'completed' ? 'completed' : 'planned') as MapMarker['kind'], label: String(i + 1), title: s.destination?.name ?? s.custom_name ?? 'Stop' }] : [];
  });
  return (
    <div>
      <div className="mb-3 flex items-center justify-between"><h1 className="text-xl font-extrabold text-navy">{data.trip.title}: map</h1><Link href={`/trips/${tripId}`} className="text-sm font-semibold text-primary">← Back to trip</Link></div>
      <MapView markers={markers} path={markers.map((m) => [m.lat, m.lng] as [number, number])} dashedPath route={preview ? decodePolyline(preview.encoded_polyline) : undefined} className="h-[70vh]" showLocate />
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted"><span>🔵 Planned</span><span>🟢 Completed</span><span>🟠 Published route preview</span><span>Your location is shown only if you tap ◎ and allow it.</span></div>
    </div>
  );
}

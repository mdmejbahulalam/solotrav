import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/supabase/server';

/**
 * Server-side route estimate via the Google Routes API. The server key never reaches the browser.
 * Never invents numbers: if the key is missing or Google fails, the client gets an explicit error.
 */
const body = z.object({ points: z.array(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })).min(2).max(27) });

const hits = new Map<string, number[]>();
function limited(userId: string, max = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (hits.get(userId) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(userId, arr);
  return arr.length > max;
}
const cache = new Map<string, { at: number; value: unknown }>();

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (limited(user.id)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) return NextResponse.json({ error: 'not_configured', message: 'Route estimates need GOOGLE_MAPS_SERVER_KEY (Routes API).' }, { status: 503 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const pts = parsed.data.points;

  const ck = pts.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|');
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < 10 * 60_000) return NextResponse.json(hit.value);

  const wp = (p: { lat: number; lng: number }) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline' },
      body: JSON.stringify({ origin: wp(pts[0]!), destination: wp(pts[pts.length - 1]!), intermediates: pts.slice(1, -1).map(wp), travelMode: 'DRIVE' }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return NextResponse.json({ error: 'upstream_error', status: res.status }, { status: 502 });
    const json = (await res.json()) as { routes?: Array<{ distanceMeters?: number; duration?: string; polyline?: { encodedPolyline?: string } }> };
    const r = json.routes?.[0];
    if (!r || r.distanceMeters == null || !r.duration) return NextResponse.json({ error: 'no_route' }, { status: 404 });
    const value = { distanceMeters: r.distanceMeters, durationSeconds: parseInt(r.duration, 10), encodedPolyline: r.polyline?.encodedPolyline ?? null };
    cache.set(ck, { at: Date.now(), value });
    return NextResponse.json(value);
  } catch {
    return NextResponse.json({ error: 'upstream_error' }, { status: 502 });
  }
}

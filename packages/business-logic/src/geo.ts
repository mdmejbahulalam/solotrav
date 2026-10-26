/**
 * Geographic distance.
 *
 * Method: haversine great-circle distance on a sphere of mean Earth radius 6,371,008.8 m (IUGG).
 * Error versus the WGS-84 ellipsoid is up to ~0.5%, which is far below typical consumer GPS error.
 * Results are approximate and must never be presented as surveyed-grade.
 *
 * This is mirrored by public.haversine_m in the database; keep both in sync.
 */
export const EARTH_RADIUS_M = 6_371_008.8;

const rad = (deg: number) => (deg * Math.PI) / 180;

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function isValidLatitude(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= -90 && v <= 90;
}
export function isValidLongitude(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= -180 && v <= 180;
}

export interface RawFix {
  lat: unknown;
  lng: unknown;
  t: unknown;
  acc?: unknown;
}

/** Rejects malformed samples before they reach storage or distance maths. (0,0) with no accuracy is a classic bad fix. */
export function isValidFix(f: RawFix, now = Date.now()): boolean {
  if (!isValidLatitude(f.lat) || !isValidLongitude(f.lng)) return false;
  if (typeof f.t !== 'number' || !Number.isFinite(f.t) || f.t <= 0) return false;
  if (f.t > now + 5 * 60_000) return false; // future timestamps (clock errors)
  if (f.acc != null && (typeof f.acc !== 'number' || !Number.isFinite(f.acc) || f.acc < 0 || f.acc > 10_000)) return false;
  if (f.lat === 0 && f.lng === 0) return false;
  return true;
}

/** Hint (not proof) that a user is at a place: within the threshold, widened by the reported accuracy. */
export function proximityHint(distanceM: number, accuracyM: number | null | undefined, thresholdM = 150): 'near' | 'uncertain' | 'far' {
  const acc = accuracyM != null && accuracyM >= 0 ? accuracyM : 0;
  if (distanceM <= thresholdM && acc <= thresholdM) return 'near';
  if (distanceM - acc <= thresholdM) return 'uncertain';
  return 'far';
}

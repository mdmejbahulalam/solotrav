import { haversineMeters } from './geo';

export type LatLng = [lat: number, lng: number];

/** Google "Encoded Polyline Algorithm Format" (precision 5). */
export function encodePolyline(points: readonly LatLng[]): string {
  let lastLat = 0;
  let lastLng = 0;
  let out = '';
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (n >= 0x20) {
      s += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    return s + String.fromCharCode(n + 63);
  };
  for (const [lat, lng] of points) {
    const la = Math.round(lat * 1e5);
    const ln = Math.round(lng * 1e5);
    out += enc(la - lastLat) + enc(ln - lastLng);
    lastLat = la;
    lastLng = ln;
  }
  return out;
}

export function decodePolyline(str: string): LatLng[] {
  const out: LatLng[] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = str.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < str.length) {
    lat += next();
    lng += next();
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}

function perpendicularDistanceM(p: LatLng, a: LatLng, b: LatLng): number {
  // equirectangular projection around the segment: fine for the short spans of a route preview
  const k = Math.cos((a[0] * Math.PI) / 180);
  const toXY = (q: LatLng): [number, number] => [q[1] * k * 111_320, q[0] * 110_540];
  const [px, py] = toXY(p);
  const [ax, ay] = toXY(a);
  const [bx, by] = toXY(b);
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return haversineMeters(p[0], p[1], a[0], a[1]);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Douglas-Peucker simplification (iterative to avoid deep recursion on long routes). */
export function simplify(points: readonly LatLng[], toleranceM: number): LatLng[] {
  if (points.length <= 2) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop() as [number, number];
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpendicularDistanceM(points[i] as LatLng, points[s] as LatLng, points[e] as LatLng);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx !== -1 && maxD > toleranceM) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

/**
 * Builds the representation that may be published on a public trip page. It is deliberately coarse
 * (simplified, coordinates rounded to ~100 m, start/end trimmed) so a public preview is NOT the raw GPS trace.
 */
export function buildRoutePreview(points: readonly LatLng[], opts: { toleranceM?: number; trimM?: number; maxPoints?: number } = {}): string {
  const { toleranceM = 50, trimM = 300, maxPoints = 400 } = opts;
  let pts = points.map(([la, ln]) => [Math.round(la * 1000) / 1000, Math.round(ln * 1000) / 1000] as LatLng);
  // trim the first/last trimM metres so home/lodging is not disclosed
  const trim = (arr: LatLng[]) => {
    if (arr.length < 3) return arr;
    const origin = arr[0] as LatLng;
    let i = 0;
    while (i < arr.length - 1 && haversineMeters(origin[0], origin[1], (arr[i] as LatLng)[0], (arr[i] as LatLng)[1]) < trimM) i++;
    return arr.slice(i);
  };
  pts = trim(pts);
  pts = trim([...pts].reverse()).reverse();
  let tol = toleranceM;
  let simp = simplify(pts, tol);
  while (simp.length > maxPoints) {
    tol *= 1.5;
    simp = simplify(pts, tol);
  }
  return encodePolyline(simp);
}

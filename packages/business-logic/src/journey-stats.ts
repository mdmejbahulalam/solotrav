import type { GpsPoint } from '@solotrav/shared-types';
import { haversineMeters } from './geo';

export interface StatsSettings {
  /** Samples with a worse (larger) accuracy radius than this are ignored. */
  maxAccuracyM: number;
  /** Movement smaller than this (or half the accuracy radius) is treated as GPS jitter. */
  minMoveM: number;
  /** Segments implying a faster speed are treated as GPS jumps. 70 m/s = 252 km/h. */
  maxSpeedMps: number;
}
export const DEFAULT_STATS_SETTINGS: StatsSettings = { maxAccuracyM: 50, minMoveM: 5, maxSpeedMps: 70 };

export interface JourneyStats {
  distanceM: number;
  acceptedPoints: number;
  ignoredPoints: number;
}

/**
 * Approximate travelled distance. Mirrors public.recompute_journey_stats exactly:
 *  1. iterate points by sequence number
 *  2. ignore poor-accuracy samples
 *  3. ignore non-increasing timestamps (duplicates, clock changes)
 *  4. ignore movement below max(minMove, accuracy/2) relative to the last ACCEPTED point (jitter)
 *  5. ignore implausible speeds (jumps)
 */
export function computeJourneyStats(points: readonly GpsPoint[], settings: StatsSettings = DEFAULT_STATS_SETTINGS): JourneyStats {
  const sorted = [...points].sort((a, b) => a.seq - b.seq);
  let total = 0;
  let last: GpsPoint | null = null;
  let accepted = 0;
  let ignored = 0;
  for (const p of sorted) {
    if (p.acc != null && p.acc > settings.maxAccuracyM) { ignored++; continue; }
    if (!last) { last = p; accepted++; continue; }
    const dt = (p.t - last.t) / 1000;
    if (dt <= 0) { ignored++; continue; }
    const d = haversineMeters(last.lat, last.lng, p.lat, p.lng);
    if (d < Math.max(settings.minMoveM, (p.acc ?? 0) * 0.5)) { ignored++; continue; }
    if (d / dt > settings.maxSpeedMps) { ignored++; continue; }
    total += d;
    last = p;
    accepted++;
  }
  return { distanceM: Math.round(total), acceptedPoints: accepted, ignoredPoints: ignored };
}

/** Active duration excludes paused time. All inputs in seconds/epoch-ms; never negative. */
export function activeDurationSeconds(startedAtMs: number, endedAtMs: number, pausedSeconds: number): number {
  return Math.max(0, Math.round((endedAtMs - startedAtMs) / 1000) - Math.max(0, pausedSeconds));
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '–';
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

import type { StopStatus } from '@solotrav/shared-types';

export interface ProgressInput {
  completion_status: StopStatus;
}

export interface TripProgress {
  total: number;
  completed: number;
  percent: number;
}

/** Skipped stops are excluded from the denominator (mirrors public.trip_progress). */
export function tripProgress(stops: readonly ProgressInput[]): TripProgress {
  const counted = stops.filter((s) => s.completion_status !== 'skipped');
  const completed = counted.filter((s) => s.completion_status === 'completed').length;
  return { total: counted.length, completed, percent: counted.length ? Math.round((100 * completed) / counted.length) : 0 };
}

/** Move one item and return the new id order (pure; the server applies it atomically via reorder_trip_stops). */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) return [...items];
  const copy = [...items];
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved as T);
  return copy;
}

/** Re-number stops 0..n-1 in their current array order. */
export function normalizeOrder<T extends { stop_order: number }>(stops: readonly T[]): T[] {
  return stops.map((s, i) => ({ ...s, stop_order: i }));
}

/** First stop that is not completed or skipped (the "next destination"). */
export function nextStop<T extends { completion_status: StopStatus; stop_order: number }>(stops: readonly T[]): T | undefined {
  return [...stops].sort((a, b) => a.stop_order - b.stop_order).find((s) => s.completion_status === 'planned');
}

/** Trips may have no fixed dates. If both exist, the end must not precede the start. */
export function validateTripDates(start: string | null | undefined, end: string | null | undefined): string | null {
  if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) return 'Start date is invalid';
  if (end && !/^\d{4}-\d{2}-\d{2}$/.test(end)) return 'End date is invalid';
  if (start && end && end < start) return 'The end date must be on or after the start date';
  return null;
}

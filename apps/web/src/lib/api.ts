'use client';

import { admin, auth, destinations, journal, journeys, media, posts, profiles, saved, social, trips, ApiError } from '@solotrav/api-client';
import { getBrowserSupabase } from '@/lib/supabase/client';

/** All client-side data access goes through here so RLS (not the UI) is the security boundary. */
export function api() {
  const db = getBrowserSupabase();
  return {
    db,
    auth: auth(db),
    profiles: profiles(db),
    destinations: destinations(db),
    trips: trips(db),
    journeys: journeys(db),
    journal: journal(db),
    posts: posts(db),
    saved: saved(db),
    social: social(db),
    media: media(db),
    admin: admin(db),
  };
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e && typeof e === 'object' && 'issues' in e && Array.isArray((e as { issues: unknown[] }).issues)) {
    const first = (e as { issues: Array<{ message: string }> }).issues[0];
    return first?.message ?? 'Please check the form.';
  }
  return e instanceof Error ? e.message : 'Something went wrong. Please try again.';
}

/** Per-field errors from a zod error, for form display. */
export function fieldErrors(e: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const issues = (e as { issues?: Array<{ path: Array<string | number>; message: string }> })?.issues;
  if (Array.isArray(issues)) for (const i of issues) out[String(i.path[0] ?? '_')] ??= i.message;
  return out;
}

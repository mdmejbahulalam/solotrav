import { admin, auth, destinations, journal, journeys, media, posts, profiles, saved, social, trips, ApiError } from '@solotrav/api-client';
import { getDb } from '@/lib/supabase';

export function api() {
  const db = getDb();
  return { db, auth: auth(db), profiles: profiles(db), destinations: destinations(db), trips: trips(db), journeys: journeys(db), journal: journal(db), posts: posts(db), saved: saved(db), social: social(db), media: media(db), admin: admin(db) };
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  const issues = (e as { issues?: Array<{ message: string }> })?.issues;
  if (Array.isArray(issues) && issues[0]) return issues[0].message;
  return e instanceof Error ? e.message : 'Something went wrong. Please try again.';
}

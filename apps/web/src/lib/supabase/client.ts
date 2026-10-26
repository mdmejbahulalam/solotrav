'use client';

import { createBrowserClient } from '@supabase/ssr';
import { env } from '@/lib/env';

let client: ReturnType<typeof createBrowserClient> | undefined;

/** Browser client (cookie-based session shared with the server). Throws an actionable error when unconfigured. */
export function getBrowserSupabase() {
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }
  client ??= createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
  return client;
}

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { env, supabaseConfigured } from '@/lib/env';

/** Session-aware client for Server Components / Route Handlers. RLS applies as the signed-in user. */
export async function createServerSupabase() {
  if (!supabaseConfigured) throw new Error('SUPABASE_NOT_CONFIGURED');
  const store = await cookies();
  return createServerClient(env.supabaseUrl!, env.supabaseAnonKey!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // called from a Server Component: the proxy refreshes the session instead
        }
      },
    },
  });
}

/**
 * Stateless anonymous client for PUBLIC pages (trip pages, destinations, metadata).
 * It has no cookies and no session, so nothing private can ever be rendered or cached through it.
 */
export function createAnonSupabase() {
  if (!supabaseConfigured) throw new Error('SUPABASE_NOT_CONFIGURED');
  return createClient(env.supabaseUrl!, env.supabaseAnonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function getUser() {
  if (!supabaseConfigured) return null;
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser(); // validates the JWT with Supabase Auth (not just the cookie)
  return data.user;
}

export async function requireUser(next?: string) {
  const user = await getUser();
  if (!user) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  return user;
}

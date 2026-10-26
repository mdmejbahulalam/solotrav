import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getDb, supabaseConfigured } from '@/lib/supabase';

type Ctx = { session: Session | null; loading: boolean };
const SessionContext = createContext<Ctx>({ session: null, loading: true });

/** Keeps the Supabase session in React state. Session expiry is handled by refresh; a failed refresh signs the user out. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(supabaseConfigured);

  useEffect(() => {
    if (!supabaseConfigured) return;
    const db = getDb();
    db.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); }).catch(() => setLoading(false));
    const { data: sub } = db.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return <SessionContext.Provider value={{ session, loading }}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);

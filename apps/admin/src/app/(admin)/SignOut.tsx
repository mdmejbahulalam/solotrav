'use client';

import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/client';

export function SignOut() {
  const router = useRouter();
  return <button type="button" className="mt-2 font-bold text-[#8eb6ff] hover:underline" onClick={async () => { await getBrowserSupabase().auth.signOut(); router.replace('/login'); router.refresh(); }}>Sign out</button>;
}

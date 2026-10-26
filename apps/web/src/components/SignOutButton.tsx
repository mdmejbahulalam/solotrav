'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getBrowserSupabase } from '@/lib/supabase/client';

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className="block w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-primary-soft"
      onClick={async () => {
        setBusy(true);
        await getBrowserSupabase().auth.signOut();
        router.replace('/');
        router.refresh();
      }}
    >
      {busy ? 'Signing out…' : 'Log out'}
    </button>
  );
}

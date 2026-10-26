'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui';
import { getBrowserSupabase } from '@/lib/supabase/client';

/** One-click staff action without a free-text reason (the database still checks the permission and audits it). */
export function QuickRpc({ rpc, args, label, variant = 'secondary' }: { rpc: string; args: Record<string, unknown>; label: string; variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span>
      <Button variant={variant} className="min-h-9 px-3 text-sm" loading={busy} onClick={async () => {
        setBusy(true); setErr(null);
        const { error } = await getBrowserSupabase().rpc(rpc, args);
        setBusy(false);
        if (error) setErr(error.code === '42501' ? 'Not permitted' : error.message); else router.refresh();
      }}>{label}</Button>
      {err && <span role="alert" className="ml-2 text-xs text-bad">{err}</span>}
    </span>
  );
}

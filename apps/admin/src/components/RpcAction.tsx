'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Notice, inputClass } from '@/components/ui';
import { getBrowserSupabase } from '@/lib/supabase/client';

/**
 * A staff action: asks for a written reason (required, min 5 chars), calls a permission-checked database
 * function, and refreshes. The database re-checks the permission and writes the audit record, so hiding
 * this button is a convenience, not the security boundary.
 */
export function RpcAction({ rpc, args, reasonArg, label, variant = 'secondary', title, extra, size = 'sm' }: {
  rpc: string; args: Record<string, unknown>; reasonArg: string; label: string; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; title?: string;
  extra?: Record<string, unknown>; size?: 'sm' | 'md';
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (reason.trim().length < 5) { setError('Please write a reason (at least 5 characters). It is recorded in the audit log.'); return; }
    setBusy(true); setError(null);
    try {
      const { error: e } = await getBrowserSupabase().rpc(rpc, { ...args, ...extra, [reasonArg]: reason.trim() });
      if (e) throw new Error(e.code === '42501' ? 'You do not have permission to do that.' : e.message);
      setOpen(false); setReason(''); router.refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <Button variant={variant} className={size === 'sm' ? 'min-h-9 px-3 text-sm' : ''} onClick={() => setOpen(true)}>{label}</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="rpc-title">
          <div className="w-full max-w-md rounded-2xl bg-surface p-5">
            <h2 id="rpc-title" className="text-lg font-bold text-navy">{title ?? label}</h2>
            <label htmlFor="reason" className="mt-3 mb-1 block text-sm font-semibold">Reason (required, audited)</label>
            <textarea id="reason" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={400} className={`${inputClass} py-3`} />
            {error && <div className="mt-2"><Notice tone="error">{error}</Notice></div>}
            <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={() => { setOpen(false); setError(null); }}>Cancel</Button><Button variant={variant === 'secondary' ? 'primary' : variant} loading={busy} onClick={run}>Confirm</Button></div>
          </div>
        </div>
      )}
    </>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Notice, inputClass } from '@/components/ui';
import { getBrowserSupabase } from '@/lib/supabase/client';

export function GrantRole({ roles }: { roles: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const username = String(f.get('username')).trim().replace(/^@/, '').toLowerCase();
    const reason = String(f.get('reason')).trim();
    if (reason.length < 5) { setMsg({ tone: 'error', text: 'A reason is required (at least 5 characters).' }); return; }
    setBusy(true); setMsg(null);
    const db = getBrowserSupabase();
    const { data: card } = await db.rpc('get_profile_card', { p_username: username });
    const target = (card as Array<{ id: string }> | null)?.[0];
    if (!target) { setBusy(false); setMsg({ tone: 'error', text: 'No user with that username.' }); return; }
    const { error } = await db.rpc('admin_grant_role', { p_user: target.id, p_role: String(f.get('role')), p_reason: reason });
    setBusy(false);
    if (error) setMsg({ tone: 'error', text: error.code === '42501' ? 'Only a super administrator can grant roles.' : error.message });
    else { setMsg({ tone: 'ok', text: `Role granted to @${username}.` }); form.reset(); router.refresh(); }
  }

  return (
    <form onSubmit={submit} className="grid max-w-2xl gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2">
      {msg && <div className="sm:col-span-2"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      <div><label htmlFor="username" className="mb-1 block text-sm font-semibold">Username</label><input id="username" name="username" required className={inputClass} /></div>
      <div><label htmlFor="role" className="mb-1 block text-sm font-semibold">Role</label><select id="role" name="role" className={inputClass}>{roles.map((r) => <option key={r}>{r}</option>)}</select></div>
      <div className="sm:col-span-2"><label htmlFor="reason" className="mb-1 block text-sm font-semibold">Reason (audited)</label><input id="reason" name="reason" required maxLength={300} className={inputClass} /></div>
      <div className="sm:col-span-2"><Button type="submit" loading={busy}>Grant role</Button></div>
    </form>
  );
}

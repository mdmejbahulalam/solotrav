'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Notice, inputClass } from '@/components/ui';
import { getBrowserSupabase } from '@/lib/supabase/client';

export function SettingRow({ k, value, description, updatedAt }: { k: string; value: unknown; description: string; updatedAt: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    let parsed: unknown;
    try { parsed = JSON.parse(String(f.get('value'))); } catch { setMsg({ tone: 'error', text: 'Value must be valid JSON (e.g. 30 or "text").' }); return; }
    if (String(f.get('reason')).trim().length < 5) { setMsg({ tone: 'error', text: 'A reason is required.' }); return; }
    setBusy(true); setMsg(null);
    const { error } = await getBrowserSupabase().rpc('admin_update_setting', { p_key: k, p_value: parsed, p_reason: String(f.get('reason')).trim() });
    setBusy(false);
    if (error) setMsg({ tone: 'error', text: error.message }); else { setMsg({ tone: 'ok', text: 'Saved.' }); router.refresh(); }
  }
  return (
    <form onSubmit={submit} className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><code className="font-bold">{k}</code><span className="text-xs text-muted">updated {new Date(updatedAt).toLocaleDateString()}</span></div>
      <p className="mb-2 text-sm text-muted">{description}</p>
      <div className="flex flex-wrap gap-2"><input name="value" aria-label={`${k} value`} defaultValue={JSON.stringify(value)} className={`${inputClass} max-w-40`} /><input name="reason" aria-label="Reason" placeholder="Reason for change" className={`${inputClass} flex-1 min-w-48`} /><Button type="submit" variant="secondary" loading={busy}>Save</Button></div>
      {msg && <div className="mt-2"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
    </form>
  );
}

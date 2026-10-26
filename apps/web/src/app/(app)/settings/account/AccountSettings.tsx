'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Field, Notice, inputClass } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { passwordSchema } from '@solotrav/validation';

export function AccountSettings({ email, deletionScheduledFor }: { email: string; deletionScheduledFor: string | null }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [scheduled, setScheduled] = useState(deletionScheduledFor);
  const [confirmText, setConfirmText] = useState('');

  async function changePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const pw = String(new FormData(form).get('password') ?? '');
    const c = passwordSchema.safeParse(pw);
    if (!c.success) { setMsg({ tone: 'error', text: c.error.issues[0]?.message ?? 'Invalid password' }); return; }
    setBusy('pw'); setMsg(null);
    try { await api().auth.updatePassword(pw); form.reset(); setMsg({ tone: 'ok', text: 'Password updated.' }); } catch (err) { setMsg({ tone: 'error', text: errorMessage(err) }); } finally { setBusy(null); }
  }

  async function exportData() {
    setBusy('export'); setMsg(null);
    try {
      const data = await api().auth.exportMyData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = 'solotrav-export.json'; a.click(); URL.revokeObjectURL(url);
      setMsg({ tone: 'ok', text: 'Export downloaded. It contains your profile, trips, posts, comments, saved items, journeys and messages you sent. Uploaded media files are not included in this export.' });
    } catch (err) { setMsg({ tone: 'error', text: errorMessage(err) }); } finally { setBusy(null); }
  }

  async function requestDelete() {
    setBusy('del'); setMsg(null);
    try { const at = await api().auth.requestAccountDeletion(); setScheduled(at); setMsg({ tone: 'ok', text: 'Deletion requested. Your content is hidden now and will be permanently deleted after the grace period.' }); router.refresh(); } catch (err) { setMsg({ tone: 'error', text: errorMessage(err) }); } finally { setBusy(null); }
  }
  async function cancelDelete() {
    setBusy('cancel'); setMsg(null);
    try { await api().auth.cancelAccountDeletion(); setScheduled(null); setMsg({ tone: 'ok', text: 'Deletion cancelled. Your account is active again.' }); router.refresh(); } catch (err) { setMsg({ tone: 'error', text: errorMessage(err) }); } finally { setBusy(null); }
  }

  return (
    <div className="space-y-6">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <section className="rounded-2xl border border-line bg-surface p-5"><h2 className="font-bold text-navy">Sign-in</h2><p className="mb-3 text-sm text-muted">Signed in as <b>{email}</b>. To change your email address, contact support (email change confirmation is handled by Supabase Auth).</p>
        <form onSubmit={changePassword}><Field label="New password" htmlFor="password" hint="At least 8 characters."><input id="password" name="password" type="password" autoComplete="new-password" className={inputClass} /></Field><Button type="submit" variant="secondary" loading={busy === 'pw'}>Update password</Button></form></section>

      <section className="rounded-2xl border border-line bg-surface p-5"><h2 className="font-bold text-navy">Your data</h2><p className="mb-3 text-sm text-muted">Download a JSON copy of the data we hold about you. Limitation: media files stored in Storage are not bundled; raw GPS points are included.</p><Button variant="secondary" loading={busy === 'export'} onClick={exportData}>Export my data</Button></section>

      <section className="rounded-2xl border border-bad/40 bg-surface p-5"><h2 className="font-bold text-bad">Delete account</h2>
        {scheduled ? (
          <><p className="my-2 text-sm">Your account is scheduled for permanent deletion on <b>{new Date(scheduled).toLocaleDateString()}</b>. Your content is already hidden.</p><Button variant="secondary" loading={busy === 'cancel'} onClick={cancelDelete}>Cancel deletion</Button></>
        ) : (
          <><p className="my-2 text-sm text-muted">Your profile, trips, posts, journals, recorded routes and messages will be permanently deleted after a 14-day grace period. Content is hidden immediately. This cannot be undone after the grace period.</p>
            <label htmlFor="confirm" className="mb-1 block text-sm font-semibold">Type DELETE to confirm</label><input id="confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className={`${inputClass} mb-3 max-w-xs`} />
            <Button variant="danger" disabled={confirmText !== 'DELETE'} loading={busy === 'del'} onClick={requestDelete}>Request deletion</Button></>
        )}
      </section>
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Field, Notice, inputClass } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

const REASONS: Array<[string, string]> = [['spam', 'Spam or scam'], ['harassment', 'Harassment or hate'], ['unsafe', 'Dangerous or illegal'], ['inappropriate', 'Inappropriate content'], ['private_location', "Shares someone's private location"], ['other', 'Something else']];

export function ReportForm({ type, id }: { type: 'post' | 'comment' | 'profile' | 'trip' | 'message'; id: string }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!reason) { setError('Choose a reason.'); return; }
    setBusy(true); setError(null);
    try { await api().social.report({ target_type: type, target_id: id, reason, detail: String(new FormData(e.currentTarget).get('detail') ?? '') }); setDone(true); }
    catch (err) { setError(/duplicate|unique|already/i.test(errorMessage(err)) ? 'You have already reported this. Our moderators will review it.' : errorMessage(err)); } finally { setBusy(false); }
  }

  if (done) return <div className="mx-auto max-w-md"><Notice tone="ok"><p className="font-bold">Thanks for letting us know.</p><p>Our moderators will review this. They won&apos;t tell the person who reported them.</p></Notice><Button className="mt-4" variant="secondary" onClick={() => router.back()}>Go back</Button></div>;
  return (
    <form onSubmit={submit} className="mx-auto max-w-md">
      <h1 className="mb-1 text-2xl font-extrabold text-navy">Report {type}</h1><p className="mb-4 text-sm text-muted">Reports are reviewed by moderators.</p>
      {error && <div className="mb-3"><Notice tone="error">{error}</Notice></div>}
      <fieldset className="mb-3"><legend className="sr-only">Reason</legend>{REASONS.map(([v, l]) => <label key={v} className="mb-2 flex cursor-pointer items-center gap-3 rounded-xl border-[1.5px] border-line p-3.5 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"><input type="radio" name="reason" value={v} checked={reason === v} onChange={() => setReason(v)} className="size-5 accent-primary" />{l}</label>)}</fieldset>
      <Field label="Details (optional)" htmlFor="detail"><textarea id="detail" name="detail" rows={3} maxLength={500} className={`${inputClass} py-3`} /></Field>
      <div className="flex gap-2"><Button type="submit" variant="danger" loading={busy}>Submit report</Button><Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button></div>
    </form>
  );
}

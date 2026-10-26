'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { AuthShell } from '@/components/AuthShell';
import { Button, Field, Notice, inputClass } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { env } from '@/lib/env';

export default function ForgotPassword() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const email = String(new FormData(e.currentTarget).get('email') ?? '');
    try {
      await api().auth.sendPasswordReset(email, `${env.siteUrl}/auth/callback?next=/reset-password`);
      setSent(true); // same message whether or not the address exists (no account enumeration)
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a link.">
      {sent ? (
        <Notice tone="ok">If an account exists for that address, a reset link is on its way. It may take a few minutes.</Notice>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
          <Field label="Email" htmlFor="email"><input id="email" name="email" type="email" required autoComplete="email" className={inputClass} /></Field>
          <Button type="submit" loading={busy} className="w-full">Send reset link</Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm"><Link className="font-bold text-primary" href="/login">Back to log in</Link></p>
    </AuthShell>
  );
}

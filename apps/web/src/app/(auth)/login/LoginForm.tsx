'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Field, Notice, inputClass } from '@/components/ui';
import { api, errorMessage, fieldErrors } from '@/lib/api';
import { env } from '@/lib/env';
import { safeNext } from '@/lib/safe-redirect';

export function LoginForm({ next, authError }: { next?: string; authError?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(authError ? 'Sign-in could not be completed. Please try again.' : null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setErrors({});
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api().auth.signIn({ email: form.get('email'), password: form.get('password') });
      router.replace(safeNext(next));
      router.refresh();
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) setErrors(fe);
      else setError(/invalid login/i.test(errorMessage(err)) ? 'Email or password is incorrect.' : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError(null);
    try {
      await api().auth.signInWithGoogle(`${env.siteUrl}/auth/callback?next=${encodeURIComponent(safeNext(next))}`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      <button type="button" onClick={google} className="mb-4 flex h-[52px] w-full items-center justify-center gap-2.5 rounded-xl border border-control bg-surface text-[15px] font-semibold hover:bg-fill">
        <span aria-hidden className="flex size-6 items-center justify-center rounded-full border-2 border-primary text-[13px] font-extrabold text-primary">G</span>Continue with Google
      </button>
      <div className="my-4 flex items-center gap-3 text-sm text-muted"><span className="h-px flex-1 bg-line" />or use email<span className="h-px flex-1 bg-line" /></div>
      <Field label="Email" htmlFor="email" error={errors.email}>
        <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined} />
      </Field>
      <Field label="Password" htmlFor="password" error={errors.password}>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={inputClass} aria-invalid={Boolean(errors.password)} />
      </Field>
      <Button type="submit" loading={busy} className="h-14 w-full rounded-2xl text-[17px] font-bold">Log in</Button>
      <p className="mt-4 text-center text-sm text-muted"><Link className="font-bold text-primary" href="/forgot-password">Forgot password?</Link> · New here? <Link className="font-bold text-primary" href="/signup">Create an account</Link></p>
    </form>
  );
}

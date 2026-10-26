'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Field, Notice, inputClass } from '@/components/ui';
import { api, errorMessage, fieldErrors } from '@/lib/api';
import { env } from '@/lib/env';
import { USERNAME_RE } from '@solotrav/validation';

export function SignupForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [needsEmail, setNeedsEmail] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [avail, setAvail] = useState<'idle' | 'checking' | 'ok' | 'taken' | 'invalid' | 'error'>('idle');
  const seq = useRef(0);

  // debounced username availability check (cancels stale responses)
  useEffect(() => {
    const u = username.trim().toLowerCase();
    if (!u) { setAvail('idle'); return; }
    if (!USERNAME_RE.test(u)) { setAvail('invalid'); return; }
    setAvail('checking');
    const id = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const ok = await api().auth.usernameAvailable(u);
        if (id === seq.current) setAvail(ok ? 'ok' : 'taken');
      } catch {
        if (id === seq.current) setAvail('error');
      }
    }, 350);
    return () => clearTimeout(t);
  }, [username]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setErrors({});
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const data = await api().auth.signUp(
        { email: f.get('email'), password: f.get('password'), username: f.get('username'), displayName: f.get('displayName'), acceptTerms: f.get('terms') === 'on' },
        `${env.siteUrl}/auth/callback?next=/onboarding`,
      );
      if (data.session) { router.replace('/onboarding'); router.refresh(); }
      else setNeedsEmail(String(f.get('email')));
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) setErrors(fe);
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (needsEmail) {
    return (
      <Notice tone="ok">
        <p className="font-bold">Check your email</p>
        <p className="mt-1">We sent a confirmation link to <b>{needsEmail}</b>. Open it to finish creating your account. Didn&apos;t get it? Check spam, or <Link className="font-semibold text-primary" href="/login">try logging in</Link>.</p>
      </Notice>
    );
  }

  const hint = { idle: 'Letters, numbers and underscores.', checking: 'Checking…', ok: 'Available', taken: undefined, invalid: undefined, error: 'Could not check right now. You can still continue.' }[avail];
  const usernameError = errors.username ?? (avail === 'taken' ? 'That username is taken.' : avail === 'invalid' ? 'Use 3–30 lowercase letters, numbers or underscores.' : undefined);

  return (
    <form onSubmit={onSubmit} noValidate>
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      <Field label="Display name" htmlFor="displayName" error={errors.displayName}>
        <input id="displayName" name="displayName" autoComplete="name" required className={inputClass} aria-invalid={Boolean(errors.displayName)} />
      </Field>
      <Field label="Username" htmlFor="username" error={usernameError} hint={hint}>
        <input id="username" name="username" autoCapitalize="none" autoComplete="username" required value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} aria-invalid={Boolean(usernameError)} aria-describedby="username-error" />
      </Field>
      <Field label="Email" htmlFor="email" error={errors.email}>
        <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} aria-invalid={Boolean(errors.email)} />
      </Field>
      <Field label="Password" htmlFor="password" error={errors.password} hint="At least 8 characters.">
        <input id="password" name="password" type="password" autoComplete="new-password" required className={inputClass} aria-invalid={Boolean(errors.password)} />
      </Field>
      <label className="mb-1 flex items-start gap-3 text-sm">
        <input type="checkbox" name="terms" className="mt-0.5 size-5 accent-primary" />
        <span>I agree to the <Link className="font-semibold text-primary" href="/terms" target="_blank">Terms</Link> and <Link className="font-semibold text-primary" href="/privacy" target="_blank">Privacy Policy</Link>.</span>
      </label>
      {errors.acceptTerms && <p role="alert" className="mb-3 text-sm font-medium text-bad">{errors.acceptTerms}</p>}
      <Button type="submit" loading={busy} className="mt-3 w-full" disabled={avail === 'taken'}>Create account</Button>
      <p className="mt-4 rounded-xl bg-teal-soft p-3 text-sm">📍 Location is optional. SoloTrav only asks when you use a feature that needs it.</p>
    </form>
  );
}

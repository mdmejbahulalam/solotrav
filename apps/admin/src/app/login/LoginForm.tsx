'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Field, Notice, inputClass } from '@/components/ui';
import { getBrowserSupabase } from '@/lib/supabase/client';

export function LoginForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setError(null);
    try {
      const { error: err } = await getBrowserSupabase().auth.signInWithPassword({ email: String(f.get('email')).trim().toLowerCase(), password: String(f.get('password')) });
      if (err) throw new Error('Email or password is incorrect.');
      router.replace('/'); router.refresh();
    } catch (e2) { setError((e2 as Error).message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={onSubmit}>
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      <Field label="Email" htmlFor="email"><input id="email" name="email" type="email" autoComplete="username" required className={inputClass} /></Field>
      <Field label="Password" htmlFor="password"><input id="password" name="password" type="password" autoComplete="current-password" required className={inputClass} /></Field>
      <Button type="submit" loading={busy} className="w-full">Sign in</Button>
    </form>
  );
}

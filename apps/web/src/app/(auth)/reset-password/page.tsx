'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AuthShell } from '@/components/AuthShell';
import { Button, Field, Notice, inputClass } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { passwordSchema } from '@solotrav/validation';

export default function ResetPassword() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const pw = String(new FormData(e.currentTarget).get('password') ?? '');
    const check = passwordSchema.safeParse(pw);
    if (!check.success) { setError(check.error.issues[0]?.message ?? 'Invalid password'); return; }
    setBusy(true);
    try {
      await api().auth.updatePassword(pw); // requires the recovery session created by /auth/callback
      router.replace('/home');
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Choose a new password">
      <form onSubmit={onSubmit} noValidate>
        {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
        <Field label="New password" htmlFor="password" hint="At least 8 characters."><input id="password" name="password" type="password" required autoComplete="new-password" className={inputClass} /></Field>
        <Button type="submit" loading={busy} className="w-full">Update password</Button>
      </form>
    </AuthShell>
  );
}

import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { AuthLink, AuthShell } from '@/ui/auth';
import { Button, Field, Notice } from '@/ui/kit';

export default function Forgot() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setBusy(true); setError(null);
    try { await api().auth.sendPasswordReset(email, Linking.createURL('/')); setSent(true); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return (
    <AuthShell title="Reset your password" subtitle="We will email you a reset link."
      footer={sent ? <Button title="Back to log in" size="lg" fullWidth onPress={() => router.replace('/(auth)/login')} /> : <>
        <Button title="Send reset link" size="lg" fullWidth onPress={submit} loading={busy} disabled={!email} />
        <AuthLink prefix="Remembered it?" link="Log in" href="/(auth)/login" />
      </>}>
      {sent ? <Notice tone="ok">If an account exists for that email, a reset link is on its way.</Notice> : (<>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      </>)}
    </AuthShell>
  );
}

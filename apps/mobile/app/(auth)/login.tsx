import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { api, errorMessage } from '@/lib/api';
import { AuthLink, AuthShell, GoogleButton, OrDivider, PasswordField, Segmented } from '@/ui/auth';
import { Button, Field, Notice, Text } from '@/ui/kit';

WebBrowser.maybeCompleteAuthSession();

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true); setError(null);
    try { await api().auth.signIn({ email, password }); } // the session listener in the root layout navigates on success
    catch (e) { const m = errorMessage(e); setError(/invalid login/i.test(m) ? 'Email or password is incorrect.' : /not confirmed/i.test(m) ? 'Confirm your email first: open the link we sent you, then log in.' : m); }
    finally { setBusy(false); }
  }

  /** Google sign-in via Supabase OAuth + system browser. Requires the Google provider configured in Supabase (see docs/SETUP.md). */
  async function google() {
    setError(null);
    try {
      const redirectTo = Linking.createURL('/auth-callback');
      const { db } = api();
      const { data, error: err } = await db.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });
      if (err || !data.url) throw new Error(err?.message ?? 'Google sign-in is not available.');
      const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (res.type === 'success') {
        const code = new URL(res.url).searchParams.get('code');
        if (code) { const { error: ex } = await db.auth.exchangeCodeForSession(code); if (ex) throw ex; }
      }
    } catch (e) { setError(errorMessage(e)); }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Log in to continue your journey."
      footer={<View style={{ gap: 12 }}>
        <Button title="Log in" size="lg" fullWidth onPress={signIn} loading={busy} disabled={!email || !password} />
        <AuthLink prefix="New to SoloTrav?" link="Create an account" href="/(auth)/signup" />
      </View>}>
      <Segmented options={[{ key: 'signup', label: 'Sign up' }, { key: 'login', label: 'Log in' }]} value="login" onChange={(k) => { if (k === 'signup') router.replace('/(auth)/signup'); }} />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <GoogleButton onPress={google} />
      <OrDivider />
      <View>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
        <PasswordField value={password} onChangeText={setPassword} autoComplete="password" textContentType="password" />
        <Pressable accessibilityRole="link" onPress={() => router.push('/(auth)/forgot')} style={{ minHeight: 44, justifyContent: 'center', marginTop: -10 }}>
          <Text size="label" weight="bold" tone="primary">Forgot password?</Text>
        </Pressable>
      </View>
    </AuthShell>
  );
}

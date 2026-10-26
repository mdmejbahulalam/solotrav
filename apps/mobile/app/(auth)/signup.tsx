import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { api, errorMessage } from '@/lib/api';
import { AuthLink, AuthShell, Checkbox, PasswordField, Segmented } from '@/ui/auth';
import { Icon } from '@/ui/icons';
import { Button, Field, Notice, Text } from '@/ui/kit';
import { useTheme } from '@/ui/theme';
import { USERNAME_RE } from '@solotrav/validation';

export default function Signup() {
  const router = useRouter();
  const { c } = useTheme();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [avail, setAvail] = useState<'idle' | 'checking' | 'ok' | 'taken' | 'invalid'>('idle');
  const seq = useRef(0);

  useEffect(() => {
    const u = username.trim().toLowerCase();
    if (!u) { setAvail('idle'); return; }
    if (!USERNAME_RE.test(u)) { setAvail('invalid'); return; }
    setAvail('checking');
    const id = ++seq.current;
    const t = setTimeout(async () => {
      try { const ok = await api().auth.usernameAvailable(u); if (id === seq.current) setAvail(ok ? 'ok' : 'taken'); } catch { if (id === seq.current) setAvail('idle'); }
    }, 350);
    return () => clearTimeout(t);
  }, [username]);

  async function submit() {
    setBusy(true); setError(null);
    try {
      const data = await api().auth.signUp({ email, password, username, displayName, acceptTerms: terms }, Linking.createURL('/'));
      if (!data.session) setSent(true); // email confirmation required; otherwise the session listener navigates
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }

  if (sent) {
    return (
      <AuthShell title="Check your email" subtitle={`We sent a confirmation link to ${email}. Open it, then come back and log in.`}
        footer={<Button title="Back to log in" size="lg" fullWidth onPress={() => router.replace('/(auth)/login')} />}>
        <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Icon name="mail" size={32} color={c.primary} /></View>
        <Notice tone="info">Didn't get it? Check your spam folder. The link works once and confirms this email address.</Notice>
      </AuthShell>
    );
  }

  const uErr = avail === 'taken' ? 'That username is taken.' : avail === 'invalid' ? 'Use 3–30 lowercase letters, numbers or underscores.' : null;
  return (
    <AuthShell title="Create your account" subtitle="Plan, track and share trips. Location is never requested here."
      footer={<View style={{ gap: 12 }}>
        <Button title="Create account" size="lg" fullWidth onPress={submit} loading={busy} disabled={!terms || !displayName || !email || password.length < 8 || avail === 'taken' || avail === 'invalid' || !username} />
        <AuthLink prefix="Already a member?" link="Log in" href="/(auth)/login" />
      </View>}>
      <Segmented options={[{ key: 'signup', label: 'Sign up' }, { key: 'login', label: 'Log in' }]} value="signup" onChange={(k) => { if (k === 'login') router.replace('/(auth)/login'); }} />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <View>
        <Field label="Display name" value={displayName} onChangeText={setDisplayName} autoComplete="name" />
        <Field label="Username" value={username} onChangeText={(t) => setUsername(t.toLowerCase())} autoCapitalize="none" error={uErr}
          hint={avail === 'ok' ? 'Available' : avail === 'checking' ? 'Checking…' : '3 to 30 characters: letters, numbers and underscores.'} />
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <PasswordField value={password} onChangeText={setPassword} meter autoComplete="new-password" textContentType="newPassword" />
        <Checkbox checked={terms} onChange={setTerms}>
          <Text size="sm" tone="muted" style={{ lineHeight: 18 }}>I agree to the <Text size="sm" weight="bold" tone="primary">Terms of Service</Text> and <Text size="sm" weight="bold" tone="primary">Privacy Policy</Text>.</Text>
        </Checkbox>
      </View>
      <Pressable accessibilityRole="none" style={{ flexDirection: 'row', gap: 10, backgroundColor: c.background, borderRadius: 12, padding: 12 }}>
        <Icon name="lock" size={20} color={c.text} />
        <Text size="sm" style={{ flex: 1, lineHeight: 18 }}>Your name and username are public. Your location is never public unless you choose to share it.</Text>
      </Pressable>
    </AuthShell>
  );
}

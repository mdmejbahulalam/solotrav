import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, View } from 'react-native';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, errorMessage } from '@/lib/api';
import { stopJourney } from '@/tracking/controller';
import { getActiveSession } from '@/tracking/store';
import type { Profile } from '@solotrav/shared-types';
import { Icon } from '@/ui/icons';
import { Button, Card, Field, Notice, Text, ToggleRow, TopBar } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

export default function Settings() {
  const router = useRouter();
  const { c } = useTheme();
  const [p, setP] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [perm, setPerm] = useState<string>('unknown');
  const [active, setActive] = useState(false);

  useEffect(() => {
    api().profiles.me().then((m) => { setP(m); setName(m?.display_name ?? ''); setBio(m?.bio ?? ''); });
    Location.getForegroundPermissionsAsync().then((r) => setPerm(r.status));
    void getActiveSession().then((s) => setActive(Boolean(s)));
  }, []);

  async function save(patch: Parameters<ReturnType<typeof api>['profiles']['update']>[0]) {
    try { const next = await api().profiles.update(patch); setP(next); setMsg({ tone: 'ok', text: 'Saved.' }); } catch (e) { setMsg({ tone: 'error', text: errorMessage(e) }); }
  }
  async function exportData() {
    try { const d = await api().auth.exportMyData(); Alert.alert('Export ready', `Your export contains ${Object.keys(d).length} sections (${JSON.stringify(d).length} characters). Use the website (Settings → Account) to download the file.`); } catch (e) { setMsg({ tone: 'error', text: errorMessage(e) }); }
  }
  function deleteAccount() {
    Alert.alert('Delete your account?', 'Your content is hidden immediately and permanently deleted after a 14-day grace period. You can cancel from the website during that time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Request deletion', style: 'destructive', onPress: async () => { try { const a = await getActiveSession(); if (a) await stopJourney(a.client_session_id); await api().auth.requestAccountDeletion(); await api().auth.signOut(); } catch (e) { setMsg({ tone: 'error', text: errorMessage(e) }); } } },
    ]);
  }

  const heading = (t: string) => <Text size="xs" weight="bold" tone="muted" style={{ letterSpacing: 0.8, marginTop: 6 }}>{t.toUpperCase()}</Text>;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <TopBar title="Settings" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        {p ? (<>
          {heading('Profile')}
          <Card style={{ padding: 14 }}>
            <Field label="Display name" value={name} onChangeText={setName} maxLength={80} />
            <Field label="Bio" optional value={bio} onChangeText={setBio} multiline maxLength={300} />
            <Button title="Save profile" onPress={() => void save({ display_name: name, bio })} />
          </Card>

          {heading('Privacy')}
          <Card style={{ padding: 14, gap: 4 }}>
            <Text weight="bold" size="md">Who can see your profile</Text>
            {([['public', 'Public', 'Anyone can see your profile and public posts.', 'globe'], ['private', 'Private', 'People must be approved to follow you.', 'lock']] as const).map(([v, l, h, icon]) => (
              <Pressable key={v} accessibilityRole="radio" accessibilityState={{ selected: p.account_visibility === v }} onPress={() => void save({ account_visibility: v })}
                style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: p.account_visibility === v ? 2 : 1, borderColor: p.account_visibility === v ? c.primary : c.controlBorder, backgroundColor: p.account_visibility === v ? c.primarySoft : c.surface, marginTop: 6 }}>
                <Icon name={icon} size={22} color={c.text} />
                <View style={{ flex: 1 }}><Text weight="bold" size="label">{l}</Text><Text size="xs" tone="muted">{h}</Text></View>
              </Pressable>))}
          </Card>

          {heading('Location')}
          <Card style={{ padding: 14, gap: 8 }}>
            <Text size="sm" tone="muted" style={{ lineHeight: 18 }}>Permission: <Text weight="bold" size="sm">{perm === 'granted' ? 'Allowed' : perm === 'denied' ? 'Not allowed' : perm}</Text>. SoloTrav asks only when you start tracking or use a location feature.</Text>
            <ToggleRow title="Allow live sharing with followers" helper="Off by default. Nothing is shared unless you start a share." value={p.live_location_sharing === 'followers'} onChange={(on) => void save({ live_location_sharing: on ? 'followers' : 'off' })} />
            {active ? <Button title="Stop active tracking now" variant="danger" iconName="stop" onPress={() => void getActiveSession().then((s) => s && stopJourney(s.client_session_id)).then(() => { setActive(false); setMsg({ tone: 'ok', text: 'Tracking stopped. Your route is saved on this device and will sync.' }); })} /> : <Text size="sm" tone="muted">No journey is recording.</Text>}
            <Button title="Open system location settings" variant="secondary" onPress={() => void Linking.openSettings()} />
            <Notice tone="warn">Recording while the screen is off uses a visible foreground notification and depends on your battery settings. SoloTrav cannot track you after you stop or revoke permission.</Notice>
          </Card>

          {heading('Your data')}
          <Card style={{ padding: 14, gap: 10 }}>
            <Button title="Export my data" variant="secondary" onPress={() => void exportData()} />
            <Button title="Delete my account" variant="danger" onPress={deleteAccount} />
          </Card>
          <View style={{ height: 8 }} />
        </>) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

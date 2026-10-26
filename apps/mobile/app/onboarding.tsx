import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, errorMessage } from '@/lib/api';
import { setNeedsOnboarding } from '@/lib/onboardingState';
import { ArtThumb, type ArtKind } from '@/ui/Art';
import { Icon, type IconName } from '@/ui/icons';
import { ActionBar, Button, Notice, Text } from '@/ui/kit';
import { FONT, useTheme } from '@/ui/theme';

const INTERESTS: Array<[string, ArtKind]> = [
  ['Beaches', 'beach'], ['Hills', 'hills'], ['Tea gardens', 'forest'], ['Food', 'city'], ['Culture', 'city'], ['History', 'city'],
  ['Photography', 'hills'], ['Adventure', 'hills'], ['Wildlife', 'forest'], ['Budget travel', 'beach'], ['Hiking', 'forest'], ['Solo travel', 'beach'],
];
type Vis = 'public' | 'private';
const VIS: Array<[Vis, string, string, IconName]> = [['public', 'Public', 'Anyone can see your profile and public posts.', 'globe'], ['private', 'Private', 'People must be approved to follow you.', 'lock']];

/** Shown once after the first sign-in: interests (shape Home and Explore) and profile visibility. Location is not requested here. */
export default function Onboarding() {
  const router = useRouter();
  const { c } = useTheme();
  const [picked, setPicked] = useState<string[]>([]);
  const [vis, setVis] = useState<Vis>('public');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (n: string) => setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : p.length >= 12 ? p : [...p, n]));
  async function done() {
    setBusy(true); setErr(null);
    try { await api().profiles.completeOnboarding(picked, vis); setNeedsOnboarding(false); router.replace('/(tabs)/home'); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 32, gap: 10, paddingBottom: 24 }}>
        <View>
          <RNText style={{ fontFamily: FONT.bold, fontSize: 12, letterSpacing: 1, color: c.primary }}>WELCOME TO SOLOTRAV</RNText>
          <Text weight="extrabold" accessibilityRole="header" style={{ fontSize: 28, lineHeight: 34, color: c.navy, marginTop: 4 }}>What do you love?</Text>
          <Text size="label" tone="muted" style={{ marginTop: 4 }}>Pick a few. We use them to shape Explore and Home. You can change them later.</Text>
        </View>
        {err ? <Notice tone="error">{err}</Notice> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {INTERESTS.map(([name, kind]) => {
            const on = picked.includes(name);
            return (
              <Pressable key={name} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggle(name)}
                style={{ width: '48.5%', height: 76, borderRadius: 16, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: on ? c.primarySoft : c.surface, borderWidth: on ? 2.5 : 1, borderColor: on ? c.primary : c.border }}>
                <ArtThumb kind={kind} size={44} radius={12} />
                <RNText numberOfLines={2} style={{ flex: 1, fontFamily: FONT.bold, fontSize: 14, color: on ? c.primaryPressed : c.text }}>{name}</RNText>
                {on ? <Icon name="check" size={18} color={c.primaryPressed} strokeWidth={2.5} /> : null}
              </Pressable>
            );
          })}
        </View>
        <Text size="label" weight="bold" style={{ marginTop: 10 }}>Who can see your profile</Text>
        {VIS.map(([v, label, helper, icon]) => (
          <Pressable key={v} accessibilityRole="radio" accessibilityState={{ selected: vis === v }} onPress={() => setVis(v)}
            style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: vis === v ? 2 : 1, borderColor: vis === v ? c.primary : c.controlBorder, backgroundColor: vis === v ? c.primarySoft : c.surface }}>
            <Icon name={icon} size={22} color={c.text} />
            <View style={{ flex: 1 }}><Text size="label" weight="bold">{label}</Text><Text size="xs" tone="muted">{helper}</Text></View>
          </Pressable>
        ))}
        <Notice tone="ok">Your location is never requested here. SoloTrav asks only when you start tracking a journey.</Notice>
      </ScrollView>
      <ActionBar>
        <Button title="Skip" variant="tertiary" size="lg" onPress={() => void done()} disabled={busy} style={{ minWidth: 0 }} />
        <Button title={picked.length ? `Continue (${picked.length})` : 'Continue'} size="lg" iconName="chevR" onPress={() => void done()} loading={busy} style={{ flex: 1 }} />
      </ActionBar>
    </SafeAreaView>
  );
}

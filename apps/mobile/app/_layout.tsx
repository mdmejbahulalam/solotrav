import '@/tracking/task'; // registers the background location task at startup (must be before anything else runs)
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { api } from '@/lib/api';
import { setNeedsOnboarding, useNeedsOnboarding } from '@/lib/onboardingState';
import { SessionProvider, useSession } from '@/lib/session';
import { hasSeenWelcome } from '@/lib/welcome';
import { supabaseConfigured } from '@/lib/supabase';
import { reconcileOnLaunch } from '@/tracking/controller';
import { startAutoSync } from '@/tracking/sync';
import { Notice, Text } from '@/ui/kit';
import { FONT_FILES, useTheme } from '@/ui/theme';

void SplashScreen.preventAutoHideAsync();

function Gate() {
  const { session, loading } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const { c, dark } = useTheme();
  const [fontsLoaded] = useFonts(FONT_FILES);
  const [welcomeSeen, setWelcomeSeen] = useState<boolean | null>(null);
  const needsOnboarding = useNeedsOnboarding();
  const uid = session?.user.id;

  useEffect(() => { void hasSeenWelcome().then(setWelcomeSeen); }, []);
  // Onboarding is needed until the profile has an onboarded_at timestamp.
  useEffect(() => {
    if (!uid) { setNeedsOnboarding(null); return; }
    api().profiles.me().then((m) => setNeedsOnboarding(Boolean(m) && !m!.onboarded_at)).catch(() => setNeedsOnboarding(false));
  }, [uid]);

  useEffect(() => {
    if (loading || !fontsLoaded || welcomeSeen === null) return;
    void SplashScreen.hideAsync();
    const first = segments[0];
    const inAuth = first === '(auth)';
    if (!session) { if (!inAuth) router.replace(welcomeSeen ? '/(auth)/login' : '/(auth)/welcome'); return; }
    if (needsOnboarding === null) return;
    if (needsOnboarding) { if (first !== 'onboarding') router.replace('/onboarding'); return; }
    if (inAuth || first === 'onboarding') router.replace('/(tabs)/home');
  }, [session, loading, fontsLoaded, welcomeSeen, needsOnboarding, segments, router]);

  // Tracking housekeeping: reconcile after OS kills, then keep syncing whenever connectivity allows.
  useEffect(() => {
    if (!session) return;
    void reconcileOnLaunch();
    return startAutoSync();
  }, [session]);

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: c.background }} />;
  if (!supabaseConfigured) {
    return <View style={{ flex: 1, padding: 24, justifyContent: 'center', backgroundColor: c.background }}><Notice tone="warn"><Text weight="bold">Supabase is not configured</Text><Text size="sm">Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY and rebuild the app (see docs/ANDROID.md).</Text></Notice></View>;
  }
  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }}>
        <Stack.Screen name="trip/track" options={{ gestureEnabled: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return <SafeAreaProvider><SessionProvider><Gate /></SessionProvider></SafeAreaProvider>;
}

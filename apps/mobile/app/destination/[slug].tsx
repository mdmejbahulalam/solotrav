import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Share, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, errorMessage } from '@/lib/api';
import type { Destination } from '@solotrav/shared-types';
import { Art, artKindForCategory } from '@/ui/Art';
import { Icon } from '@/ui/icons';
import { ActionBar, Button, Notice, Pill, Screen, Skeleton, Text } from '@/ui/kit';
import { TripMap } from '@/ui/Map';
import { shadow, useTheme } from '@/ui/theme';

export default function DestinationScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const [d, setD] = useState<Destination | null | undefined>();
  const [saved, setSaved] = useState(false);
  const [trips, setTrips] = useState<Array<{ id: string; title: string }>>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const a = api();
        const dest = await a.destinations.bySlug(String(slug)); setD(dest);
        if (dest) {
          const [s, t] = await Promise.all([a.db.from('saved_items').select('id').eq('item_type', 'destination').eq('item_id', dest.id).maybeSingle(), a.db.from('trips').select('id,title').in('status', ['draft', 'planned', 'active']).order('created_at', { ascending: false })]);
          setSaved(Boolean(s.data)); setTrips((t.data ?? []) as Array<{ id: string; title: string }>);
        }
      } catch (e) { setErr(errorMessage(e)); setD((x) => x ?? null); }
    })();
  }, [slug]);

  if (d === undefined) return <Screen><Skeleton height={200} /></Screen>;
  if (!d) return <Screen><Notice tone="error">{err ?? 'Destination not found.'}</Notice><Button title="Back" onPress={() => router.back()} /></Screen>;

  async function toggleSave() {
    const was = saved; setSaved(!was);
    try { if (was) await api().saved.unsave('destination', d!.id); else await api().saved.save('destination', d!.id); } catch (e) { setSaved(was); setErr(errorMessage(e)); }
  }
  async function addTo() {
    if (!trips.length) { router.push({ pathname: '/trip/new', params: { dest: d!.id } }); return; }
    Alert.alert('Add to trip', 'Choose a trip', [...trips.slice(0, 5).map((t) => ({ text: t.title, onPress: async () => { try { await api().trips.addStop(t.id, { destination_id: d!.id }); Alert.alert('Added', `${d!.name} was added to “${t.title}”.`); } catch (e) { Alert.alert('Could not add', errorMessage(e)); } } })), { text: 'New trip with this place', onPress: () => router.push({ pathname: '/trip/new', params: { dest: d!.id } }) }, { text: 'Cancel', style: 'cancel' as const }]);
  }

  const round = { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow[2] } as const;
  const label = d.category ? d.category[0]!.toUpperCase() + d.category.slice(1) : 'Destination';
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View>
          <Art kind={artKindForCategory(d.category)} height={200} />
          <View style={{ position: 'absolute', left: 12, top: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/explore'))} style={round}><Icon name="back" size={22} color={c.text} /></Pressable>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable accessibilityRole="button" accessibilityLabel={saved ? 'Remove from saved' : 'Save destination'} onPress={() => void toggleSave()} style={round}><Icon name="bookmark" size={22} color={saved ? c.primary : c.text} fill={saved ? c.primary : undefined} /></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Share" onPress={() => void Share.share({ message: `${d.name} on SoloTrav` })} style={round}><Icon name="share" size={22} color={c.text} /></Pressable>
            </View>
          </View>
        </View>
        <View style={{ padding: 16, gap: 10 }}>
          <Pill label={label} tone="blue" />
          <View>
            <Text weight="extrabold" accessibilityRole="header" style={{ fontSize: 24, lineHeight: 32, color: c.navy }}>{d.name}</Text>
            <Text tone="muted">{[d.region, d.country].filter(Boolean).join(', ')}</Text>
          </View>
          {err ? <Notice tone="error">{err}</Notice> : null}
          <Text size="md" weight="bold" accessibilityRole="header">About</Text>
          <Text style={{ lineHeight: 22 }}>{d.description || 'No description yet.'}</Text>
          {d.latitude != null && d.longitude != null ? (
            <>
              <TripMap pins={[{ id: d.id, lat: d.latitude, lng: d.longitude, kind: 'destination', title: d.name ?? 'Destination' }]} height={200} />
              <Button title="Navigate" variant="secondary" iconName="locate" onPress={() => void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${d.latitude},${d.longitude}`)} />
            </>
          ) : null}
        </View>
      </ScrollView>
      <ActionBar>
        <Button title={saved ? 'Saved' : 'Save'} variant="secondary" size="lg" iconName="bookmark" onPress={() => void toggleSave()} style={{ minWidth: 120 }} />
        <Button title="Add to a trip" size="lg" iconName="plus" onPress={() => void addTo()} style={{ flex: 1 }} />
      </ActionBar>
    </SafeAreaView>
  );
}

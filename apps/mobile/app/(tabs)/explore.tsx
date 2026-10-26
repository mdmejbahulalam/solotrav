import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, errorMessage } from '@/lib/api';
import { formatDistance, haversineMeters } from '@solotrav/business-logic';
import type { Destination } from '@solotrav/shared-types';
import { Art, ArtThumb, artKindForCategory } from '@/ui/Art';
import { Icon } from '@/ui/icons';
import { Card, Chip, EmptyState, Notice, Pill, Skeleton, Text } from '@/ui/kit';
import { TripMap } from '@/ui/Map';
import { FONT, useTheme } from '@/ui/theme';

type Dest = Destination & { distance?: number };
type Trending = { id: string; slug: string; title: string; owner_username: string; saves: number };

export default function Explore() {
  const router = useRouter();
  const { c } = useTheme();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | undefined>();
  const [cats, setCats] = useState<Array<{ slug: string; label: string }>>([]);
  const [items, setItems] = useState<Dest[]>([]);
  const [trending, setTrending] = useState<Trending[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [near, setNear] = useState<{ state: 'off' | 'asking' | 'on' | 'denied' | 'error'; msg?: string }>({ state: 'off' });

  useEffect(() => { api().destinations.categories().then(setCats).catch(() => undefined); api().trips.trending(6).then((r) => setTrending(r as unknown as Trending[])).catch(() => undefined); }, []);
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true); setError(null);
      try { const r = await api().destinations.search(q, cat, 40); if (!cancelled) setItems(r); }
      catch (e) { if (!cancelled) setError(errorMessage(e)); } finally { if (!cancelled) setLoading(false); }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, cat]);

  /** Nearby sorting: permission is requested only now, the position is used once on-device and never uploaded. */
  async function nearby() {
    setNear({ state: 'asking' });
    try {
      let p = await Location.getForegroundPermissionsAsync();
      if (p.status !== 'granted') p = await Location.requestForegroundPermissionsAsync();
      if (p.status !== 'granted') { setNear({ state: 'denied', msg: 'Location permission is off, so nearby places cannot be shown. You can keep browsing without it.' }); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setItems((cur) => [...cur].map((d) => ({ ...d, distance: d.latitude != null && d.longitude != null ? haversineMeters(pos.coords.latitude, pos.coords.longitude, d.latitude, d.longitude) : undefined })).sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity)));
      setNear({ state: 'on' });
    } catch { setNear({ state: 'error', msg: 'Could not get your location. Try again outdoors.' }); }
  }

  const pins = useMemo(() => items.filter((d) => d.latitude != null && d.longitude != null).map((d) => ({ id: d.id, lat: d.latitude as number, lng: d.longitude as number, kind: 'destination' as const, title: d.name ?? 'Destination', onPress: () => router.push(`/destination/${d.slug}`) })), [items, router]);
  const browsing = !q && !cat;
  const popular = items.filter((d) => d.is_featured).slice(0, 8);

  const open = (slug: string | null | undefined) => slug && router.push({ pathname: '/destination/[slug]', params: { slug } });
  const sub = (d: Dest) => [d.region, d.country].filter(Boolean).join(', ');

  const header = (
    <View style={{ gap: 10, paddingBottom: 8 }}>
      <View style={{ height: 48, borderRadius: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.controlBorder, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="search" size={20} color={c.textSecondary} />
        <TextInput accessibilityLabel="Search destinations" value={q} onChangeText={setQ} placeholder="Search places, regions" placeholderTextColor={c.textSecondary} returnKeyType="search" style={{ flex: 1, fontFamily: FONT.regular, fontSize: 15, color: c.text, height: 46 }} />
        {q ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQ('')} hitSlop={8}><Icon name="close" size={20} color={c.textSecondary} /></Pressable> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
        <Chip label="All" selected={!cat} onPress={() => setCat(undefined)} />
        {cats.map((x) => <Chip key={x.slug} label={x.label} selected={cat === x.slug} onPress={() => setCat(cat === x.slug ? undefined : x.slug)} />)}
      </ScrollView>
      {near.state !== 'on' ? (
        <View style={{ backgroundColor: c.surface, borderWidth: 1, borderStyle: 'dashed', borderColor: c.controlBorder, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name="pin" size={22} color={c.primary} />
          <Text size="sm" style={{ flex: 1, lineHeight: 17 }}><Text size="sm" weight="bold">Nearby places are off.</Text> Allow location only if you want them.</Text>
          <Pressable accessibilityRole="button" onPress={nearby} style={{ height: 36, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: c.primary, justifyContent: 'center' }}><Text size="sm" weight="bold" tone="primary">{near.state === 'asking' ? '…' : 'Turn on'}</Text></Pressable>
        </View>
      ) : null}
      {near.msg ? <Notice tone="warn">{near.msg}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {browsing && popular.length ? (
        <View style={{ gap: 10 }}>
          <Text size="md" weight="bold" accessibilityRole="header">Popular destinations</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {popular.map((d) => (
              <Card key={d.id} onPress={() => open(d.slug)} style={{ width: 150 }}>
                <Art kind={artKindForCategory(d.category)} height={100} />
                <View style={{ paddingVertical: 8, paddingHorizontal: 10 }}>
                  <Text size="label" weight="bold" numberOfLines={1}>{d.name}</Text>
                  <Text size="xs" tone="muted" numberOfLines={1}>{d.region ?? d.country}</Text>
                </View>
              </Card>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {browsing && trending.length ? (
        <View style={{ gap: 10, marginTop: 4 }}>
          <Text size="md" weight="bold" accessibilityRole="header">Trending itineraries</Text>
          {trending.map((t) => (
            <Card key={t.id} onPress={() => router.push({ pathname: '/trip/[id]', params: { id: t.id } })} style={{ padding: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <ArtThumb kind="hills" size={64} radius={12} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text weight="bold" numberOfLines={1}>{t.title}</Text>
                <Text size="xs" tone="muted" style={{ marginTop: 2 }}>by @{t.owner_username}{t.saves ? ` · ${t.saves} saves` : ''}</Text>
              </View>
              <Icon name="chevR" size={20} color={c.textSecondary} />
            </Card>
          ))}
        </View>
      ) : null}
      <Text size="md" weight="bold" accessibilityRole="header" style={{ marginTop: 4 }}>{browsing ? 'All destinations' : 'Results'}</Text>
      {loading ? <><Skeleton height={140} /><Skeleton height={140} /></> : null}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text weight="extrabold" accessibilityRole="header" style={{ fontSize: 24, lineHeight: 32, color: c.navy }}>Explore</Text>
        <View style={{ flexDirection: 'row', backgroundColor: c.border, borderRadius: 10, padding: 3 }}>
          {(['list', 'map'] as const).map((v) => (
            <Pressable key={v} accessibilityRole="button" accessibilityState={{ selected: view === v }} onPress={() => setView(v)} style={{ height: 34, paddingHorizontal: 14, borderRadius: 8, justifyContent: 'center', backgroundColor: view === v ? c.surface : 'transparent' }}>
              <Text size="sm" weight={view === v ? 'bold' : 'semibold'} tone={view === v ? 'default' : 'muted'}>{v === 'list' ? 'List' : 'Map'}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {view === 'map' ? <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0 }}>{header}<TripMap pins={pins} height={420} /></ScrollView> : (
        <FlatList data={items} keyExtractor={(d) => d.id} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          ListHeaderComponent={header}
          ListEmptyComponent={loading ? undefined : <EmptyState title="No destinations match" body="Try a different search or clear the filters." />}
          renderItem={({ item }) => (
            <Card onPress={() => open(item.slug)} style={{ marginBottom: 12 }}>
              <Art kind={artKindForCategory(item.category)} height={110} />
              <View style={{ padding: 12, gap: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text weight="bold" size="md" style={{ flex: 1 }}>{item.name}</Text>{item.is_featured ? <Pill label="Featured" tone="coral" /> : null}</View>
                <Text size="sm" tone="muted">{sub(item)}</Text>
                {item.distance != null ? <Text size="xs" tone="muted">{formatDistance(item.distance)} from you (straight-line)</Text> : null}
              </View>
            </Card>
          )} />
      )}
    </SafeAreaView>
  );
}

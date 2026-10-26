import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, errorMessage } from '@/lib/api';
import { Art, ArtThumb, artKindForCategory, type ArtKind } from '@/ui/Art';
import { Icon } from '@/ui/icons';
import { Card, Chip, EmptyState, Notice, Skeleton, Text, TopBar } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

type Tab = 'destination' | 'trip' | 'post';
type Row = { id: string; title: string; subtitle?: string; kind: ArtKind; go: () => void };

export default function Saved() {
  const router = useRouter();
  const { c } = useTheme();
  const [tab, setTab] = useState<Tab>('destination');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    setRows(null);
    (async () => {
      try {
        const { db, saved } = api();
        const items = (await saved.list(tab)) as Array<{ item_id: string }>;
        const ids = items.map((i) => i.item_id);
        if (!ids.length) { setRows([]); return; }
        if (tab === 'destination') setRows(((await db.from('destinations').select('id,slug,name,region,category').in('id', ids)).data ?? []).map((d) => ({ id: d.id, title: d.name ?? 'Destination', subtitle: d.region ?? '', kind: artKindForCategory(d.category), go: () => router.push({ pathname: '/destination/[slug]', params: { slug: d.slug } }) })));
        else if (tab === 'trip') setRows(((await db.from('trips').select('id,title,visibility').in('id', ids)).data ?? []).map((t) => ({ id: t.id, title: t.title, subtitle: t.visibility, kind: 'hills' as const, go: () => router.push({ pathname: '/trip/[id]', params: { id: t.id } }) })));
        else setRows(((await db.from('posts').select('id,caption').in('id', ids)).data ?? []).map((p) => ({ id: p.id, title: p.caption.slice(0, 80) || 'Post', kind: 'forest' as const, go: () => router.push({ pathname: '/post/[id]', params: { id: p.id } }) })));
      } catch (e) { setErr(errorMessage(e)); setRows([]); }
    })();
  }, [tab, router]));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <TopBar title="Saved" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 48 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>{([['destination', 'Places'], ['trip', 'Trips'], ['post', 'Posts']] as const).map(([k, l]) => <Chip key={k} label={l} selected={tab === k} onPress={() => setTab(k)} />)}</View>
        {err ? <Notice tone="error">{err}</Notice> : null}
        {rows === null ? <><Skeleton /><Skeleton /></> : rows.length === 0 ? <EmptyState icon="bookmark" title="Nothing saved yet" body="Tap the bookmark on places, trips and posts to keep them here." /> : tab === 'destination' ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {rows.map((r) => (
              <Card key={r.id} onPress={r.go} style={{ width: '48%' }}>
                <View><Art kind={r.kind} height={100} label={false} />
                  <View style={{ position: 'absolute', right: 6, top: 6, width: 32, height: 32, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}><Icon name="bookmark" size={18} color={c.primary} fill={c.primary} /></View>
                </View>
                <View style={{ paddingVertical: 8, paddingHorizontal: 10 }}><Text size="label" weight="bold" numberOfLines={1}>{r.title}</Text>{r.subtitle ? <Text size="xs" tone="muted" numberOfLines={1}>{r.subtitle}</Text> : null}</View>
              </Card>
            ))}
          </View>
        ) : rows.map((r) => (
          <Card key={r.id} onPress={r.go} style={{ padding: 8, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14 }}>
            <ArtThumb kind={r.kind} size={56} radius={10} />
            <View style={{ flex: 1 }}><Text size="label" weight="bold" numberOfLines={2}>{r.title}</Text>{r.subtitle ? <Text size="xs" tone="muted">{r.subtitle}</Text> : null}</View>
            <Icon name="chevR" size={20} color={c.textSecondary} />
          </Card>
        ))}
        <Text size="xs" tone="muted" style={{ marginTop: 8 }}>Saving is private; only you see this list.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

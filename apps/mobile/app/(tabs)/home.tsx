import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { api, errorMessage } from '@/lib/api';
import { enrich, type FeedPost } from '@/lib/feed';
import { useSession } from '@/lib/session';
import { Art, artKindForCategory } from '@/ui/Art';
import { AppHeader, Avatar, Button, Card, EmptyState, Notice, SectionTitle, Skeleton, Text } from '@/ui/kit';
import { PostCard } from '@/ui/PostCard';
import { useTheme } from '@/ui/theme';

const PAGE = 10;
type Dest = { id: string; slug: string | null; name: string | null; region: string | null; category: string | null };
type Traveler = { id: string; username: string; display_name: string };

export default function Home() {
  const router = useRouter();
  const { c } = useTheme();
  const { session } = useSession();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [scope, setScope] = useState<'following' | 'discover'>('following');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<{ username: string; display_name: string } | null>(null);
  const [unread, setUnread] = useState(0);
  const [dests, setDests] = useState<Dest[]>([]);
  const [people, setPeople] = useState<Traveler[]>([]);

  const load = useCallback(async (reset: boolean) => {
    setError(null);
    try {
      const { posts: p } = api();
      let sc = reset ? 'following' as const : scope;
      let page = await p.feed(sc, reset ? null : cursor, PAGE);
      if (reset && page.items.length === 0) { sc = 'discover'; page = await p.feed('discover', null, PAGE); }
      const enriched = await enrich(page.items as never);
      setScope(sc);
      setPosts((prev) => (reset ? enriched : [...prev, ...enriched.filter((e) => !prev.some((x) => x.id === e.id))]));
      setCursor(page.nextCursor);
    } catch (e) { setError(errorMessage(e)); }
  }, [cursor, scope]);

  const loadSide = useCallback(async () => {
    try {
      const a = api();
      const [profile, notes, d, sug] = await Promise.all([a.profiles.me(), a.social.notifications(30), a.destinations.search('', undefined, 8), a.profiles.suggestions(10)]);
      if (profile) setMe({ username: profile.username, display_name: profile.display_name });
      setUnread((notes as unknown as Array<{ read_at: string | null }>).filter((n) => !n.read_at).length);
      setDests(d as unknown as Dest[]);
      setPeople(sug as unknown as Traveler[]);
    } catch { /* side panels are optional; the feed shows its own error */ }
  }, []);

  useEffect(() => { void Promise.all([load(true), loadSide()]).finally(() => setLoading(false)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const header = (
    <View style={{ gap: 20, paddingBottom: 8 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Your profile" onPress={() => router.push('/(tabs)/profile')} style={{ width: 64, alignItems: 'center', gap: 6 }}>
          <Avatar name={me?.display_name ?? '?'} size={64} ring="dashed" />
          <Text size="xs" numberOfLines={1}>You</Text>
        </Pressable>
        {people.map((p) => (
          <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Open ${p.username}`} onPress={() => router.push(`/user/${p.username}`)} style={{ width: 64, alignItems: 'center', gap: 6 }}>
            <Avatar name={p.display_name} size={64} ring="plain" />
            <Text size="xs" numberOfLines={1}>{p.username}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={{ backgroundColor: c.navy, borderRadius: 20, padding: 20, gap: 6, overflow: 'hidden' }}>
        <Svg width={120} height={120} viewBox="0 0 120 120" style={{ position: 'absolute', right: -10, top: -10, opacity: 0.35 }}>
          <Path d="M10 100 C 30 40, 70 110, 110 20" fill="none" stroke="#19B5A5" strokeWidth={5} strokeDasharray="2 10" strokeLinecap="round" />
          <Circle cx={110} cy={20} r={8} fill="#FF7657" />
        </Svg>
        <Text size="xs" weight="bold" style={{ color: '#7FE0D4', letterSpacing: 1 }}>YOUR NEXT JOURNEY</Text>
        <Text weight="extrabold" tone="inverse" style={{ fontSize: 22, lineHeight: 28 }}>Plan it, track it, share it.</Text>
        <Text size="label" style={{ color: '#D5DCE6', maxWidth: 250 }}>Add stops, preview the route, then record the real journey. Location stays off until you choose.</Text>
        <Button title="Create a trip" variant="coral" iconName="plus" onPress={() => router.push('/trip/new')} style={{ alignSelf: 'flex-start', marginTop: 10 }} />
      </View>

      {dests.length > 0 ? (
        <View>
          <SectionTitle action="See all" onAction={() => router.push('/(tabs)/explore')}>Suggested for you</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
            {dests.map((d) => (
              <Card key={d.id} onPress={() => d.slug && router.push({ pathname: '/destination/[slug]', params: { slug: d.slug } })} style={{ width: 220 }}>
                <Art kind={artKindForCategory(d.category)} height={120} />
                <View style={{ paddingTop: 10, paddingHorizontal: 12, paddingBottom: 12 }}>
                  <Text size="md" weight="bold" numberOfLines={1}>{d.name}</Text>
                  <Text size="sm" tone="muted" numberOfLines={1}>{[d.region, d.category ? d.category[0]!.toUpperCase() + d.category.slice(1) : null].filter(Boolean).join(' · ')}</Text>
                </View>
              </Card>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {error ? <Notice tone="error">{error} Pull down to retry.</Notice> : null}
      {posts.length ? <SectionTitle>{scope === 'following' ? 'From travelers you follow' : 'Popular travel posts'}</SectionTitle> : null}
      {loading ? <><Skeleton height={300} /></> : null}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.background }}>
      <AppHeader unread={unread} name={me?.display_name ?? session?.user.email ?? '?'} />
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await Promise.all([load(true), loadSide()]); setRefreshing(false); }} />}
        onEndReachedThreshold={0.5}
        onEndReached={async () => { if (cursor && !more) { setMore(true); await load(false); setMore(false); } }}
        ListHeaderComponent={header}
        renderItem={({ item }) => <PostCard post={item} ownId={session?.user.id} />}
        ListEmptyComponent={loading ? undefined : <EmptyState title="Nothing here yet" body="Follow travelers or share your first post." action={<Button title="Create a post" onPress={() => router.push('/post/new')} />} />}
        ListFooterComponent={more ? <Skeleton height={120} /> : undefined}
      />
    </SafeAreaView>
  );
}

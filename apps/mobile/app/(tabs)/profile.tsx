import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, errorMessage } from '@/lib/api';
import { enrich, type FeedPost } from '@/lib/feed';
import { getActiveSession } from '@/tracking/store';
import type { Profile } from '@solotrav/shared-types';
import { ArtThumb } from '@/ui/Art';
import type { IconName } from '@/ui/icons';
import { Avatar, Button, Card, Divider, EmptyState, ListRow, Notice, Text } from '@/ui/kit';
import { PostCard } from '@/ui/PostCard';
import { useTheme } from '@/ui/theme';

type MyTrip = { id: string; title: string; status: string; visibility: string; stops: Array<{ completion_status: string }> };
const VIS = { public: { label: 'Public', bg: '#EAF1FF', fg: '#0B43AD' }, followers: { label: 'Followers', bg: '#E4F4F2', fg: '#0B5E55' }, private: { label: 'Private', bg: '#F1F4F8', fg: '#3B4658' } } as const;

export default function ProfileTab() {
  const router = useRouter();
  const { c } = useTheme();
  const [p, setP] = useState<Profile | null>(null);
  const [counts, setCounts] = useState({ followers: 0, following: 0, trips: 0 });
  const [trips, setTrips] = useState<MyTrip[]>([]);
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [tab, setTab] = useState<'trips' | 'posts'>('trips');
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    (async () => {
      try {
        const a = api();
        const me = await a.profiles.me(); setP(me);
        if (me) {
          const [f1, f2, t] = await Promise.all([
            a.db.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', me.id).eq('status', 'accepted'),
            a.db.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', me.id).eq('status', 'accepted'),
            a.db.from('trips').select('id,title,status,visibility,stops:trip_stops(completion_status)').eq('owner_id', me.id).order('created_at', { ascending: false }),
          ]);
          setCounts({ followers: f1.count ?? 0, following: f2.count ?? 0, trips: t.data?.length ?? 0 });
          setTrips((t.data ?? []) as unknown as MyTrip[]);
        }
      } catch (e) { setError(errorMessage(e)); }
    })();
  }, []));

  async function showPosts() {
    setTab('posts');
    if (posts !== null || !p) return;
    try {
      const { data, error: err } = await api().db.rpc('get_profile_posts', { p_user: p.id, p_limit: 20 });
      if (err) throw err;
      setPosts(await enrich((data ?? []) as never));
    } catch (e) { setError(errorMessage(e)); setPosts([]); }
  }

  async function logout() {
    const active = await getActiveSession();
    if (active) { Alert.alert('A journey is still recording', 'Stop the journey before logging out.'); return; }
    await api().auth.signOut();
  }

  const links: Array<[IconName, string, string]> = [['bookmark', 'Saved', '/saved'], ['bell', 'Notifications', '/notifications'], ['chat', 'Messages', '/messages'], ['settings', 'Privacy and settings', '/settings']];
  const tabBtn = (key: 'trips' | 'posts', label: string, onPress: () => void) => (
    <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} onPress={onPress} style={{ paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 3, borderBottomColor: tab === key ? c.primary : 'transparent' }}>
      <Text size="sm" weight="bold" tone={tab === key ? 'primary' : 'muted'}>{label}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
        <LinearGradient colors={['#A9C9E8', '#3F7A5F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 110 }} />
        <View style={{ paddingHorizontal: 16, marginTop: -40, gap: 8 }}>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {p ? (
            <>
              <View style={{ width: 88, height: 88, borderRadius: 44, borderWidth: 4, borderColor: c.background, backgroundColor: c.background }}><Avatar name={p.display_name} size={80} gradient /></View>
              <View>
                <Text weight="extrabold" accessibilityRole="header" style={{ fontSize: 22, lineHeight: 28, color: c.navy }}>{p.display_name}</Text>
                <Text size="sm" tone="muted">@{p.username}{p.home_region ? ` · ${p.home_region}` : ''}{p.account_visibility === 'private' ? ' · Private account' : ''}</Text>
              </View>
              {p.bio ? <Text size="label" style={{ lineHeight: 20 }}>{p.bio}</Text> : null}
              {p.travel_interests.length ? <Text size="xs" tone="muted">Interests: {p.travel_interests.join(', ')}</Text> : null}
              <View style={{ flexDirection: 'row', backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 14, paddingVertical: 10 }}>
                {([['Trips', counts.trips], ['Followers', counts.followers], ['Following', counts.following]] as const).map(([l, n]) => (
                  <View key={l} style={{ flex: 1, alignItems: 'center' }}><Text size="lg" weight="extrabold" tabular>{n}</Text><Text size="xs" tone="muted">{l}</Text></View>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title="Edit profile" size="sm" onPress={() => router.push('/settings')} style={{ flex: 1, height: 44 }} />
                <Button title="Share profile" size="sm" variant="secondary" onPress={() => void Share.share({ message: `@${p.username} on SoloTrav` })} style={{ flex: 1, height: 44 }} />
              </View>

              <Card style={{ marginTop: 4 }}>
                {links.map(([icon, label, href], i) => (
                  <View key={label}>{i > 0 ? <Divider /> : null}<ListRow icon={icon} value={label} onPress={() => router.push(href as never)} /></View>
                ))}
              </Card>

              <View style={{ flexDirection: 'row', gap: 6, borderBottomWidth: 1, borderBottomColor: c.border, marginTop: 8 }}>
                {tabBtn('trips', 'Trips', () => setTab('trips'))}
                {tabBtn('posts', 'Posts', () => void showPosts())}
              </View>

              {tab === 'trips' ? (trips.length === 0 ? <EmptyState icon="trips" title="No trips yet" body="Trips you create show up here." action={<Button title="Create a trip" iconName="plus" onPress={() => router.push('/trip/new')} />} /> : trips.map((t) => {
                const counted = t.stops.filter((s) => s.completion_status !== 'skipped');
                const done = counted.filter((s) => s.completion_status === 'completed').length;
                const v = VIS[(t.visibility as keyof typeof VIS)] ?? VIS.private;
                const state = t.status === 'draft' ? 'draft' : t.status === 'completed' ? 'done' : 'in progress';
                return (
                  <Card key={t.id} onPress={() => router.push(`/trip/${t.id}`)} style={{ borderRadius: 14, padding: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <ArtThumb kind="hills" size={56} radius={10} />
                    <View style={{ flex: 1 }}>
                      <Text size="label" weight="bold" numberOfLines={1}>{t.title}</Text>
                      <Text size="xs" tone="muted">{counted.length} stops · {state}{counted.length ? ` · ${done} done` : ''}</Text>
                    </View>
                    <View style={{ backgroundColor: v.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}><Text size="xs" weight="bold" style={{ color: v.fg, fontSize: 11 }}>{v.label}</Text></View>
                  </Card>
                );
              })) : posts === null ? <Text tone="muted">Loading…</Text> : posts.length === 0 ? <EmptyState icon="image" title="No posts yet" body="Share a place, tip or story." action={<Button title="New post" iconName="plus" onPress={() => router.push('/post/new')} />} /> : posts.map((x) => <PostCard key={x.id} post={x} />)}

              <Button title="Log out" variant="tertiary" onPress={logout} style={{ marginTop: 8 }} iconName="logout" />
            </>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

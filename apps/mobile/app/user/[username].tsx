import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, errorMessage } from '@/lib/api';
import { enrich, type FeedPost } from '@/lib/feed';
import { useSession } from '@/lib/session';
import type { Profile } from '@solotrav/shared-types';
import { Icon } from '@/ui/icons';
import { Avatar, Button, EmptyState, Notice, Screen, Skeleton, Text } from '@/ui/kit';
import { PostCard } from '@/ui/PostCard';
import { shadow, useTheme } from '@/ui/theme';

type Rel = 'none' | 'pending' | 'following';

export default function UserScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const { session } = useSession();
  const [p, setP] = useState<Profile | null | undefined>();
  const [card, setCard] = useState<{ id: string; display_name: string } | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [rel, setRel] = useState<Rel>('none');
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [err, setErr] = useState<string | null>(null);
  const own = p && session?.user.id === p.id;

  useEffect(() => {
    (async () => {
      try {
        const a = api();
        const prof = await a.profiles.byUsername(String(username));
        setP(prof);
        if (!prof) { const cd = await a.profiles.card(String(username)); setCard(cd ? { id: cd.id, display_name: cd.display_name } : null); return; }
        const [f1, f2, r, rows] = await Promise.all([
          a.db.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', prof.id).eq('status', 'accepted'),
          a.db.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', prof.id).eq('status', 'accepted'),
          session && session.user.id !== prof.id ? a.db.from('follows').select('status').eq('follower_id', session.user.id).eq('following_id', prof.id).maybeSingle() : Promise.resolve({ data: null }),
          a.db.rpc('get_profile_posts', { p_user: prof.id, p_limit: 20 }),
        ]);
        setCounts({ followers: f1.count ?? 0, following: f2.count ?? 0 });
        setRel(!r.data ? 'none' : (r.data as { status: string }).status === 'pending' ? 'pending' : 'following');
        setPosts(await enrich((rows.data ?? []) as never));
      } catch (e) { setErr(errorMessage(e)); setP((x) => x ?? null); }
    })();
  }, [username, session]);

  async function toggleFollow() {
    const target = p?.id ?? card?.id; if (!target) return;
    const prev = rel;
    try {
      if (rel === 'none') { await api().profiles.follow(target); setRel((p?.account_visibility ?? 'private') === 'private' ? 'pending' : 'following'); void api().social.track('user_followed', { platform: 'android' }); }
      else { await api().profiles.unfollow(target); setRel('none'); }
    } catch (e) { setRel(prev); setErr(errorMessage(e)); }
  }
  async function message() { const t = p?.id ?? card?.id; if (!t) return; try { const id = await api().social.openConversation(t); router.push({ pathname: '/messages/[id]', params: { id } }); } catch (e) { setErr(errorMessage(e)); } }
  function more() {
    const t = p?.id ?? card?.id; if (!t) return;
    Alert.alert('More', undefined, [
      { text: 'Report', onPress: () => Alert.alert('Report this profile?', 'Moderators will review it.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Report', style: 'destructive', onPress: () => void api().social.report({ target_type: 'profile', target_id: t, reason: 'other', detail: '' }).then(() => Alert.alert('Thanks', 'Our moderators will review this.'), (e) => Alert.alert('Could not report', errorMessage(e))) }]) },
      { text: 'Block', style: 'destructive', onPress: () => Alert.alert('Block this user?', 'They will not be able to see your content, follow you or message you.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Block', style: 'destructive', onPress: () => void api().profiles.block(t).then(() => router.replace('/(tabs)/home'), (e) => Alert.alert('Could not block', errorMessage(e))) }]) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  if (p === undefined) return <Screen><Skeleton height={140} /></Screen>;
  if (p === null && !card) return <Screen><Notice tone="error">{err ?? 'This traveler does not exist or is unavailable.'}</Notice><Button title="Back" onPress={() => router.back()} /></Screen>;

  const back = (
    <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/home'))} style={{ position: 'absolute', left: 12, top: 12, width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow[2] }}><Icon name="back" size={22} color={c.text} /></Pressable>
  );
  const cover = <View><LinearGradient colors={['#A9C9E8', '#3F7A5F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 110 }} />{back}</View>;

  if (p === null && card) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.background }}>
        {cover}
        <View style={{ padding: 16, marginTop: -40, alignItems: 'center', gap: 8 }}>
          <View style={{ borderWidth: 4, borderColor: c.background, borderRadius: 44 }}><Avatar name={card.display_name} size={80} gradient /></View>
          <Text weight="extrabold" style={{ fontSize: 22, lineHeight: 28, color: c.navy }}>{card.display_name}</Text>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><Icon name="lock" size={16} color={c.textSecondary} /><Text tone="muted">This account is private. Follow to see their trips and posts.</Text></View>
          <Button title={rel === 'none' ? 'Request to follow' : 'Requested'} variant={rel === 'none' ? 'primary' : 'secondary'} onPress={() => void toggleFollow()} />
        </View>
      </SafeAreaView>
    );
  }

  const prof = p as Profile;
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
        {cover}
        <View style={{ paddingHorizontal: 16, marginTop: -40, gap: 8 }}>
          <View style={{ width: 88, height: 88, borderRadius: 44, borderWidth: 4, borderColor: c.background, backgroundColor: c.background }}><Avatar name={prof.display_name} size={80} gradient /></View>
          <View>
            <Text weight="extrabold" accessibilityRole="header" style={{ fontSize: 22, lineHeight: 28, color: c.navy }}>{prof.display_name}</Text>
            <Text size="sm" tone="muted">@{prof.username}{prof.home_region ? ` · ${prof.home_region}` : ''}</Text>
          </View>
          {prof.bio ? <Text size="label" style={{ lineHeight: 20 }}>{prof.bio}</Text> : null}
          {prof.travel_interests.length ? <Text size="xs" tone="muted">Interests: {prof.travel_interests.join(', ')}</Text> : null}
          <View style={{ flexDirection: 'row', backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 14, paddingVertical: 10 }}>
            {([['Posts', posts.length], ['Followers', counts.followers], ['Following', counts.following]] as const).map(([l, n]) => <View key={l} style={{ flex: 1, alignItems: 'center' }}><Text size="lg" weight="extrabold" tabular>{n}</Text><Text size="xs" tone="muted">{l}</Text></View>)}
          </View>
          {err ? <Notice tone="error">{err}</Notice> : null}
          {own ? <Button title="Edit profile and settings" variant="secondary" onPress={() => router.push('/settings')} /> : (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title={rel === 'none' ? 'Follow' : rel === 'pending' ? 'Requested' : 'Following'} variant={rel === 'none' ? 'primary' : 'secondary'} iconName={rel === 'following' ? 'check' : undefined} onPress={() => void toggleFollow()} style={{ flex: 1, height: 44 }} />
              <Button title="Message" variant="secondary" onPress={() => void message()} style={{ flex: 1, height: 44 }} />
              <Button title="More" variant="tertiary" onPress={more} style={{ minWidth: 72, height: 44, paddingHorizontal: 8 }} />
            </View>
          )}
          <Text size="lg" weight="bold" style={{ marginTop: 8 }}>Posts</Text>
          {posts.length === 0 ? <EmptyState icon="image" title="No posts yet" /> : posts.map((x) => <PostCard key={x.id} post={x} ownId={session?.user.id} />)}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

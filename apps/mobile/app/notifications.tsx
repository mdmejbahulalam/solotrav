import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, errorMessage } from '@/lib/api';
import { ago } from '@/lib/feed';
import { Avatar, Chip, EmptyState, Notice, Skeleton, Text, TopBar } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

const TEXT: Record<string, string> = { follow: 'started following you.', follow_request: 'requested to follow you.', follow_accepted: 'accepted your follow request.', like: 'liked your post.', comment: 'commented on your post.', mention: 'mentioned you.', trip_invite: 'invited you to collaborate on a trip.', trip_update: 'updated a shared trip.', message: 'sent you a message.' };
const TRIP_TYPES = new Set(['trip_invite', 'trip_update']);
type N = { id: string; notification_type: string; entity_type: string; entity_id: string | null; read_at: string | null; created_at: string; actor: { username: string; display_name: string } | null };

export default function Notifications() {
  const router = useRouter();
  const { c } = useTheme();
  const [items, setItems] = useState<N[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'trips' | 'people'>('all');
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => { try { setItems((await api().social.notifications(60)) as unknown as N[]); } catch (e) { setErr(errorMessage(e)); setItems((x) => x ?? []); } }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  function go(n: N) {
    if (!n.entity_id) return;
    if (n.entity_type === 'post') router.push({ pathname: '/post/[id]', params: { id: n.entity_id } });
    else if (n.entity_type === 'trip') router.push(n.notification_type === 'trip_invite' ? '/(tabs)/trips' : { pathname: '/trip/[id]', params: { id: n.entity_id } });
    else if (n.entity_type === 'conversation') router.push({ pathname: '/messages/[id]', params: { id: n.entity_id } });
    else if (n.actor) router.push({ pathname: '/user/[username]', params: { username: n.actor.username } });
  }
  const shown = (items ?? []).filter((n) => filter === 'all' ? true : filter === 'trips' ? TRIP_TYPES.has(n.notification_type) : !TRIP_TYPES.has(n.notification_type));
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <TopBar title="Notifications" right={<Pressable accessibilityRole="button" onPress={() => void api().social.markNotificationsRead().then(load)} hitSlop={8}><Text size="sm" weight="bold" tone="primary">Mark all read</Text></Pressable>} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 48 }}>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
          {(['all', 'trips', 'people'] as const).map((f) => <Chip key={f} label={f[0]!.toUpperCase() + f.slice(1)} selected={filter === f} onPress={() => setFilter(f)} />)}
        </View>
        {err ? <Notice tone="error">{err}</Notice> : null}
        {items === null ? <><Skeleton height={64} /><Skeleton height={64} /></> : shown.length === 0 ? <EmptyState icon="bell" title="You're all caught up" body="Likes, comments, follows and trip invitations show up here." /> : shown.map((n) => (
          <Pressable key={n.id} accessibilityRole="button" onPress={() => go(n)} style={{ flexDirection: 'row', gap: 10, padding: 10, borderRadius: 14, backgroundColor: n.read_at ? c.surface : c.primarySoft, borderWidth: 1, borderColor: c.border, alignItems: 'flex-start' }}>
            <Avatar name={n.actor?.display_name ?? 'ST'} size={40} />
            <View style={{ flex: 1 }}>
              <Text size="sm" style={{ lineHeight: 18 }}><Text size="sm" weight="bold">{n.actor ? `@${n.actor.username}` : 'SoloTrav'}</Text> {TEXT[n.notification_type] ?? 'sent a notification.'}</Text>
              <Text size="xs" tone="muted" style={{ marginTop: 2 }}>{ago(n.created_at)}</Text>
            </View>
            <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: n.read_at ? 'transparent' : c.primary }} />
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

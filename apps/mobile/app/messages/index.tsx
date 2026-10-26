import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, errorMessage } from '@/lib/api';
import { ago } from '@/lib/feed';
import { useSession } from '@/lib/session';
import { Icon } from '@/ui/icons';
import { Avatar, EmptyState, Notice, Skeleton, Text, TopBar } from '@/ui/kit';
import { FONT, useTheme } from '@/ui/theme';

type Conv = { id: string; last_message_at: string | null; members: Array<{ user_id: string; profile: { username: string; display_name: string } }> };

export default function Messages() {
  const router = useRouter();
  const { c } = useTheme();
  const { session } = useSession();
  const [convs, setConvs] = useState<Conv[] | null>(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Array<{ id: string; title: string; handle: string | null }>>([]);
  const [err, setErr] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    (async () => {
      try {
        const { data, error } = await api().db.from('conversations').select('id,last_message_at,members:conversation_members(user_id,profile:profiles(username,display_name))').order('last_message_at', { ascending: false, nullsFirst: false });
        if (error) throw error; setConvs((data ?? []) as unknown as Conv[]);
      } catch (e) { setErr(errorMessage(e)); setConvs((x) => x ?? []); }
    })();
  }, []));

  async function search(v: string) {
    setQ(v);
    if (v.trim().length < 2) { setFound([]); return; }
    try { setFound((await api().social.search(v, 'profile', 5)) as never); } catch (e) { setErr(errorMessage(e)); }
  }
  async function open(userId: string) { try { const id = await api().social.openConversation(userId); router.push({ pathname: '/messages/[id]', params: { id } }); } catch (e) { setErr(errorMessage(e)); } }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <TopBar title="Messages" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {err ? <Notice tone="error">{err}</Notice> : null}
        <View style={{ height: 44, borderRadius: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.controlBorder, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="search" size={20} color={c.textSecondary} />
          <TextInput accessibilityLabel="Find a traveler" value={q} onChangeText={(v) => void search(v)} placeholder="Search people" placeholderTextColor={c.textSecondary} style={{ flex: 1, fontFamily: FONT.regular, fontSize: 14, color: c.text, height: 42 }} />
        </View>
        {found.map((f) => (
          <Pressable key={f.id} accessibilityRole="button" onPress={() => void open(f.id)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <Avatar name={f.title} size={48} /><View style={{ flex: 1 }}><Text weight="bold">{f.title}</Text><Text size="sm" tone="muted">@{f.handle}</Text></View>
          </Pressable>
        ))}
        {convs === null ? <Skeleton /> : convs.length === 0 && found.length === 0 ? <EmptyState icon="chat" title="No conversations yet" body="Search for a traveler above, or open a profile and tap Message." /> : convs.map((cv) => {
          const other = cv.members.find((m) => m.user_id !== session?.user.id)?.profile;
          return other ? (
            <Pressable key={cv.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/messages/[id]', params: { id: cv.id } })} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Avatar name={other.display_name} size={48} />
              <View style={{ flex: 1, minWidth: 0 }}><Text weight="bold" numberOfLines={1}>{other.display_name}</Text><Text size="sm" tone="muted" numberOfLines={1}>@{other.username}</Text></View>
              {cv.last_message_at ? <Text size="xs" tone="muted">{ago(cv.last_message_at)}</Text> : null}
            </Pressable>
          ) : null;
        })}
        <View style={{ marginTop: 12 }}><Notice>Messages are between you and the people you pick. Location is never sent unless you attach a place.</Notice></View>
      </ScrollView>
    </SafeAreaView>
  );
}

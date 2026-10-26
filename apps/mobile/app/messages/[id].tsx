import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Icon } from '@/ui/icons';
import { Notice, Text, TopBar } from '@/ui/kit';
import { FONT, useTheme } from '@/ui/theme';

type M = { id: string; sender_id: string; body: string; created_at: string };

export default function Conversation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { session } = useSession();
  const [msgs, setMsgs] = useState<M[]>([]);
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('Conversation');
  const list = useRef<FlatList<M>>(null);

  useEffect(() => {
    const { db, social } = api();
    social.messages(String(id), 60).then((r) => setMsgs((r as unknown as M[]).slice().reverse())).catch((e) => setErr(errorMessage(e)));
    db.from('conversation_members').select('user_id,profile:profiles(display_name)').eq('conversation_id', String(id)).then(({ data }) => {
      const other = ((data ?? []) as unknown as Array<{ user_id: string; profile: { display_name: string } | null }>).find((m) => m.user_id !== session?.user.id);
      if (other?.profile) setTitle(other.profile.display_name);
    });
    // one narrowly filtered realtime channel (RLS applies to realtime too)
    const ch = db.channel(`conv:${id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, (p: { new: unknown }) => setMsgs((cur) => (cur.some((m) => m.id === (p.new as M).id) ? cur : [...cur, p.new as M]))).subscribe();
    return () => { void db.removeChannel(ch); };
  }, [id, session?.user.id]);

  async function send() {
    const text = body.trim(); if (!text) return;
    setBusy(true); setErr(null);
    try { const m = (await api().social.sendMessage(String(id), text)) as unknown as M; setMsgs((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m])); setBody(''); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TopBar title={title} />
        <FlatList ref={list} data={msgs} keyExtractor={(m) => m.id} contentContainerStyle={{ padding: 16, gap: 10 }} onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          ListHeaderComponent={<Notice>Messages never include your live location. Sharing a place or trip is always a deliberate action.</Notice>}
          renderItem={({ item }) => {
            const mine = item.sender_id === session?.user.id;
            return (
              <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '76%', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 16, backgroundColor: mine ? c.primary : c.surface, borderWidth: mine ? 0 : 1, borderColor: c.border }}>
                <Text size="label" tone={mine ? 'inverse' : 'default'} style={{ lineHeight: 20 }}>{item.body}</Text>
                <Text size="xs" style={{ color: mine ? '#DDE8FF' : c.textSecondary, marginTop: 2 }}>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
            );
          }} />
        {err ? <View style={{ paddingHorizontal: 16 }}><Notice tone="error">{err}</Notice></View> : null}
        <View style={{ minHeight: 72, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TextInput accessibilityLabel="Write a message" value={body} onChangeText={setBody} maxLength={2000} placeholder="Write a message" placeholderTextColor={c.textSecondary} style={{ flex: 1, height: 48, borderRadius: 24, backgroundColor: c.mutedFill, paddingHorizontal: 16, fontFamily: FONT.regular, fontSize: 14, color: c.text }} />
          <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={busy || !body.trim()} onPress={() => void send()} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: !body.trim() ? c.border : c.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="send" size={20} color={!body.trim() ? '#7A8598' : '#fff'} strokeWidth={2.25} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

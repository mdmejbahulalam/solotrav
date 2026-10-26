import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, errorMessage } from '@/lib/api';
import { ago, enrich, type FeedPost } from '@/lib/feed';
import { useSession } from '@/lib/session';
import { Icon } from '@/ui/icons';
import { Avatar, Button, Notice, Screen, Skeleton, Text, TopBar } from '@/ui/kit';
import { PostCard } from '@/ui/PostCard';
import { FONT, useTheme } from '@/ui/theme';

type C = { id: string; author_id: string; body: string; created_at: string; status: string; author: { username: string; display_name: string } };

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const { session } = useSession();
  const [post, setPost] = useState<FeedPost | null | undefined>();
  const [comments, setComments] = useState<C[]>([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { db, posts } = api();
      const row = await posts.get(String(id)) as { id: string; author_id: string; post_type: string; caption: string; destination_id: string | null; created_at: string; author: { username: string; display_name: string } } | null;
      if (!row) { setPost(null); return; }
      const [likes, cm] = await Promise.all([db.from('reactions').select('id,user_id').eq('post_id', row.id), posts.comments(row.id) as Promise<C[]>]);
      const uid = session?.user.id;
      const [card] = await enrich([{ post_id: row.id, author_id: row.author_id, username: row.author.username, display_name: row.author.display_name, post_type: row.post_type, caption: row.caption, destination_id: row.destination_id, created_at: row.created_at, like_count: (likes.data ?? []).length, comment_count: (cm ?? []).filter((x) => x.status === 'visible').length, liked_by_me: (likes.data ?? []).some((l) => (l as { user_id: string }).user_id === uid), saved_by_me: false }]);
      setPost(card ?? null); setComments(cm ?? []);
    } catch (e) { setErr(errorMessage(e)); setPost((p) => p ?? null); }
  }, [id, session?.user.id]);
  useEffect(() => { void load(); }, [load]);

  async function send() {
    setBusy(true); setErr(null);
    try { await api().posts.comment({ post_id: String(id), parent_comment_id: null, body }); setBody(''); await load(); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  }

  if (post === undefined) return <Screen><Skeleton height={320} /></Screen>;
  if (post === null) return <Screen><Notice tone="error">{err ?? 'This post is not available.'}</Notice><Button title="Back" onPress={() => router.back()} /></Screen>;
  const visible = comments.filter((x) => x.status === 'visible');
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TopBar title="Post" />
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          <PostCard post={post} ownId={session?.user.id} />
          <Text size="lg" weight="bold" accessibilityRole="header" style={{ marginBottom: 10 }}>Comments</Text>
          {err ? <Notice tone="error">{err}</Notice> : null}
          {visible.map((x) => (
            <View key={x.id} style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              <Avatar name={x.author.username} size={36} />
              <View style={{ flex: 1 }}>
                <Text size="label"><Text size="label" weight="bold">{x.author.username}</Text>  <Text size="xs" tone="muted">{ago(x.created_at)}</Text></Text>
                <Text size="base">{x.body}</Text>
              </View>
            </View>
          ))}
          {visible.length === 0 ? <Text tone="muted">No comments yet. Say something kind.</Text> : null}
        </ScrollView>
        <View style={{ minHeight: 72, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TextInput accessibilityLabel="Add a comment" value={body} onChangeText={setBody} maxLength={1000} placeholder="Add a comment" placeholderTextColor={c.textSecondary} style={{ flex: 1, height: 48, borderRadius: 24, backgroundColor: c.mutedFill, paddingHorizontal: 16, fontFamily: FONT.regular, fontSize: 14, color: c.text }} />
          <Pressable accessibilityRole="button" accessibilityLabel="Post comment" disabled={busy || !body.trim()} onPress={() => void send()} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: !body.trim() ? c.border : c.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="send" size={20} color={!body.trim() ? '#7A8598' : '#fff'} strokeWidth={2.25} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

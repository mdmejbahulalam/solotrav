import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { api, errorMessage } from '@/lib/api';
import { ago, type FeedPost } from '@/lib/feed';
import { Icon } from '@/ui/icons';
import { Avatar, Card, Pill, Text } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

export function PostCard({ post }: { post: FeedPost; ownId?: string }) {
  const router = useRouter();
  const { c } = useTheme();
  const [liked, setLiked] = useState(post.liked_by_me);
  const [likes, setLikes] = useState(post.like_count);
  const [saved, setSaved] = useState(post.saved_by_me);
  const [err, setErr] = useState<string | null>(null);

  async function like() {
    const was = liked; setLiked(!was); setLikes((n) => n + (was ? -1 : 1)); setErr(null);
    try { if (was) await api().posts.unlike(post.id); else await api().posts.like(post.id); }
    catch (e) { setLiked(was); setLikes((n) => n + (was ? 1 : -1)); setErr(errorMessage(e)); }
  }
  async function save() {
    const was = saved; setSaved(!was); setErr(null);
    try { if (was) await api().saved.unsave('post', post.id); else await api().saved.save('post', post.id); } catch (e) { setSaved(was); setErr(errorMessage(e)); }
  }
  const act = { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 } as const;
  const meta = [post.destination?.name, ago(post.created_at)].filter(Boolean).join(' · ');
  return (
    <Card style={{ marginBottom: 14 }}>
      <Pressable onPress={() => router.push(`/user/${post.username}`)} accessibilityRole="button" accessibilityLabel={`Open profile of ${post.username}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14 }}>
        <Avatar name={post.username} size={36} />
        <View style={{ flex: 1 }}>
          <Text size="label" weight="bold">{post.username}</Text>
          <Text size="xs" tone="muted" numberOfLines={1}>{meta}</Text>
        </View>
        {post.post_type === 'tip' ? <Pill label="Tip" tone="blue" /> : post.post_type === 'checkin' ? <Pill label="Completed" tone="ok" /> : null}
      </Pressable>
      {post.images.map((u) => <Image key={u} source={{ uri: u }} accessibilityLabel={`Photo by ${post.username}`} style={{ width: '100%', height: 260, backgroundColor: c.border }} resizeMode="cover" />)}
      <View style={{ paddingHorizontal: 14, paddingBottom: 12, paddingTop: post.images.length ? 4 : 0 }}>
        {post.caption ? <Text size="base" style={{ marginBottom: 4 }}><Text weight="bold">{post.username} </Text>{post.caption}</Text> : null}
        <View style={{ flexDirection: 'row', marginLeft: -10 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={liked ? 'Unlike' : 'Like'} accessibilityState={{ selected: liked }} onPress={like} style={act}>
            <Icon name="heart" size={22} color={liked ? c.coralText : c.textSecondary} fill={liked ? c.coral : undefined} /><Text size="sm" weight="semibold" tone="muted" tabular>{likes}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`${post.comment_count} comments`} onPress={() => router.push(`/post/${post.id}`)} style={act}>
            <Icon name="chat" size={22} color={c.textSecondary} /><Text size="sm" weight="semibold" tone="muted" tabular>{post.comment_count}</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable accessibilityRole="button" accessibilityLabel={saved ? 'Remove from saved' : 'Save'} accessibilityState={{ selected: saved }} onPress={save} style={act}>
            <Icon name="bookmark" size={22} color={saved ? c.primary : c.textSecondary} fill={saved ? c.primary : undefined} />
          </Pressable>
        </View>
        {err ? <Text size="sm" tone="error" style={{ marginTop: 2 }}>{err}</Text> : null}
      </View>
    </Card>
  );
}

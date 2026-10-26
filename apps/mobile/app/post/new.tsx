import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, errorMessage } from '@/lib/api';
import { uploadFile, UploadError, type UploadHandle } from '@/lib/upload';
import { postInputSchema } from '@solotrav/validation';
import { Icon } from '@/ui/icons';
import { ActionBar, Button, Chip, Field, Notice, Text, TopBar } from '@/ui/kit';
import { FONT, useTheme } from '@/ui/theme';

type Item = { id: string; uri: string; name: string; mime: string; size: number; kind: 'image' | 'video'; width?: number; height?: number; status: 'ready' | 'uploading' | 'done' | 'error'; progress: number; error?: string; path?: string; handle?: UploadHandle };
type Vis = 'public' | 'followers' | 'private';

export default function NewPost() {
  const router = useRouter();
  const { c } = useTheme();
  const { trip } = useLocalSearchParams<{ trip?: string }>();
  const [caption, setCaption] = useState('');
  const [vis, setVis] = useState<Vis>('public');
  const [type, setType] = useState<'auto' | 'tip'>('auto');
  const [items, setItems] = useState<Item[]>([]);
  const [trips, setTrips] = useState<Array<{ id: string; title: string }>>([]);
  const [tripId, setTripId] = useState<string>(trip ? String(trip) : '');
  const [busy, setBusy] = useState<null | 'draft' | 'publish'>(null);
  const [err, setErr] = useState<string | null>(null);
  const n = useRef(0);

  useEffect(() => { api().db.from('trips').select('id,title').order('created_at', { ascending: false }).then(({ data }) => setTrips((data ?? []) as Array<{ id: string; title: string }>)); }, []);
  const patch = (id: string, p: Partial<Item>) => setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...p } : i)));

  async function add(source: 'library' | 'camera') {
    setErr(null);
    // Permission is asked only now, when the user chooses to add media.
    const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setErr(source === 'camera' ? 'Camera permission is off. You can still choose photos from your library.' : 'Photo access is off. You can enable it in system settings, or take a photo with the camera instead.'); return; }
    const res = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, selectionLimit: 10, quality: 0.8, videoMaxDuration: 120 });
    if (res.canceled) return;
    const next: Item[] = [];
    for (const a of res.assets) {
      const isVideo = a.type === 'video';
      if (isVideo && (items.some((i) => i.kind === 'video') || next.some((i) => i.kind === 'video'))) { setErr('Only one video per post.'); continue; }
      if (items.length + next.length >= 10) { setErr('You can attach up to 10 files.'); break; }
      const mime = a.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg');
      const ext = mime.split('/')[1]?.replace('jpeg', 'jpg').replace('quicktime', 'mov') ?? 'jpg';
      next.push({ id: `m${n.current++}`, uri: a.uri, name: a.fileName ?? `file.${ext}`, mime, size: a.fileSize ?? 1, kind: isVideo ? 'video' : 'image', width: a.width, height: a.height, status: 'ready', progress: 0 });
    }
    setItems((cur) => [...cur, ...next]);
  }

  function upload(it: Item): Promise<string> {
    const h = uploadFile({ uri: it.uri, name: it.name.includes('.') ? it.name : `${it.name}.${it.mime.split('/')[1] === 'jpeg' ? 'jpg' : it.mime.split('/')[1]}`, mimeType: it.mime, size: it.size }, it.kind === 'video' ? 'post-video' : 'post-image', (p) => patch(it.id, { progress: p }));
    patch(it.id, { status: 'uploading', progress: 0, error: undefined, handle: h });
    return h.promise.then((r) => { patch(it.id, { status: 'done', path: r.path, handle: undefined }); return r.path; }, (e) => { patch(it.id, { status: 'error', error: e instanceof UploadError && e.code === 'ABORTED' ? 'Cancelled' : errorMessage(e), handle: undefined }); throw e; });
  }

  async function submit(mode: 'draft' | 'publish') {
    setErr(null);
    if (!caption.trim() && items.length === 0) { setErr('Add a caption or at least one photo or video.'); return; }
    setBusy(mode);
    try {
      const paths = new Map<string, string>();
      for (const it of items) paths.set(it.id, it.status === 'done' && it.path ? it.path : await upload(it));
      const media = items.map((i) => ({ path: paths.get(i.id) as string, type: i.kind, width: i.width, height: i.height }));
      const post_type = type === 'tip' ? 'tip' : media.some((m) => m.type === 'video') ? 'video' : media.length ? 'image' : 'text';
      postInputSchema.parse({ caption, visibility: vis, post_type, trip_id: tripId || null, mediaCount: media.length });
      const post = await api().posts.create({ caption, visibility: vis, post_type, trip_id: tripId || null }, media, mode === 'publish');
      if (mode === 'publish') void api().social.track('post_published', { platform: 'android' });
      router.replace(mode === 'publish' ? { pathname: '/post/[id]', params: { id: post.id } } : '/(tabs)/home');
    } catch (e) { setErr(e instanceof UploadError && e.code === 'ABORTED' ? 'Upload cancelled.' : errorMessage(e)); } finally { setBusy(null); }
  }

  const tile = { width: 112, height: 112, borderRadius: 12, overflow: 'hidden' } as const;
  const dashed = { ...tile, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.controlBorder, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', gap: 4 } as const;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <TopBar title="New post" close right={<Pressable accessibilityRole="button" onPress={() => void submit('draft')} disabled={busy !== null} style={{ height: 44, justifyContent: 'center', paddingHorizontal: 8 }}><RNText style={{ color: c.primary, fontFamily: FONT.semibold, fontSize: 15 }}>Save draft</RNText></Pressable>} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 12, gap: 10, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        {err ? <Notice tone="error">{err}</Notice> : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {items.map((it) => (
            <View key={it.id} style={tile}>
              {it.kind === 'image' ? <Image source={{ uri: it.uri }} accessibilityLabel="Selected photo" style={{ width: '100%', height: '100%' }} /> : <View style={{ flex: 1, backgroundColor: c.border, alignItems: 'center', justifyContent: 'center' }}><Icon name="play" size={28} color={c.text} /></View>}
              {it.status === 'uploading' ? (
                <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(16,42,67,0.55)', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <RNText style={{ color: '#fff', fontFamily: FONT.extrabold, fontSize: 18, fontVariant: ['tabular-nums'] }}>{Math.round(it.progress * 100)}%</RNText>
                  <View style={{ width: 64, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)' }}><View style={{ width: `${Math.round(it.progress * 100)}%`, height: 6, borderRadius: 3, backgroundColor: '#fff' }} /></View>
                  <Pressable accessibilityRole="button" accessibilityLabel="Cancel upload" onPress={() => void it.handle?.cancel()} hitSlop={8}><RNText style={{ color: '#fff', fontFamily: FONT.semibold, fontSize: 12 }}>Cancel</RNText></Pressable>
                </View>
              ) : null}
              {it.status === 'error' ? (
                <Pressable accessibilityRole="button" onPress={() => void upload(it).catch(() => undefined)} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(194,53,53,0.85)', alignItems: 'center', justifyContent: 'center', padding: 6 }}>
                  <RNText numberOfLines={3} style={{ color: '#fff', fontFamily: FONT.semibold, fontSize: 12, textAlign: 'center' }}>{it.error}{'\n'}Tap to retry</RNText>
                </Pressable>
              ) : null}
              {it.status === 'done' ? <View style={{ position: 'absolute', left: 6, bottom: 6, backgroundColor: c.successFill, borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={14} color="#fff" strokeWidth={2.5} /></View> : null}
              <Pressable accessibilityRole="button" accessibilityLabel="Remove" onPress={() => { void it.handle?.cancel(); setItems((cur) => cur.filter((x) => x.id !== it.id)); }} style={{ position: 'absolute', right: 4, top: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' }}><Icon name="close" size={14} color={c.text} /></Pressable>
            </View>
          ))}
          <Pressable accessibilityRole="button" accessibilityLabel="Add photos or video" onPress={() => void add('library')} style={dashed}><Icon name="plus" size={26} color={c.primary} /><RNText style={{ color: c.primary, fontFamily: FONT.semibold, fontSize: 13 }}>Add media</RNText></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Take a photo" onPress={() => void add('camera')} style={dashed}><Icon name="camera" size={26} color={c.primary} /><RNText style={{ color: c.primary, fontFamily: FONT.semibold, fontSize: 13 }}>Camera</RNText></Pressable>
        </ScrollView>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="Post" selected={type === 'auto'} onPress={() => setType('auto')} />
          <Chip label="Travel tip" selected={type === 'tip'} onPress={() => setType('tip')} />
        </View>

        <View>
          <Field label="Caption" value={caption} onChangeText={setCaption} multiline maxLength={2000} placeholder="What happened here? #hashtags help people find it." />
          <Text size="xs" tone="muted" style={{ textAlign: 'right', marginTop: -10 }} tabular>{caption.length} / 2,000</Text>
        </View>

        {trips.length > 0 ? (
          <View style={{ gap: 6 }}>
            <Text size="label" weight="semibold">Attach to a trip <Text size="label" tone="muted">(optional)</Text></Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {[{ id: '', title: 'None' }, ...trips].map((t) => <Chip key={t.id || 'none'} label={t.title} selected={tripId === t.id} onPress={() => setTripId(t.id)} />)}
            </View>
          </View>
        ) : null}

        <View style={{ gap: 6 }}>
          <Text size="label" weight="semibold">Who can see this post</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {([['private', 'Only me'], ['followers', 'Followers'], ['public', 'Public']] as const).map(([v, l]) => (
              <Pressable key={v} accessibilityRole="radio" accessibilityState={{ selected: vis === v }} onPress={() => setVis(v)} style={{ flex: 1, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: vis === v ? 2 : 1, borderColor: vis === v ? c.primary : c.controlBorder, backgroundColor: vis === v ? c.primarySoft : c.surface }}>
                <RNText style={{ fontFamily: vis === v ? FONT.bold : FONT.semibold, fontSize: 14, color: vis === v ? c.primaryPressed : c.text }}>{l}</RNText>
              </Pressable>
            ))}
          </View>
        </View>

        <Notice tone="ok"><Text size="sm" style={{ lineHeight: 18 }}><Text size="sm" weight="bold">Precise location is not included.</Text> Followers see the place name only, never exact coordinates.</Text></Notice>
      </ScrollView>
      <ActionBar>
        <Button title="Publish post" size="lg" iconName="send" onPress={() => void submit('publish')} loading={busy === 'publish'} disabled={busy !== null} style={{ flex: 1 }} />
      </ActionBar>
    </SafeAreaView>
  );
}

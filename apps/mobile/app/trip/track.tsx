import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { stopJourney } from '@/tracking/controller';
import { queueNote } from '@/tracking/store';
import { syncAll } from '@/tracking/sync';
import { useTracking } from '@/tracking/useTracking';
import { formatDistance, formatDuration, TRACKING_LABELS, nextStop } from '@solotrav/business-logic';
import { Icon, type IconName } from '@/ui/icons';
import { Button, Field, Notice, Text } from '@/ui/kit';
import { TripMap, type MapPin } from '@/ui/Map';
import { FONT, shadow, useTheme } from '@/ui/theme';

type Stop = { id: string; completion_status: 'planned' | 'completed' | 'skipped'; stop_order: number; name: string; lat: number | null; lng: number | null };

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <RNText style={{ fontFamily: FONT.bold, fontSize: 12, letterSpacing: 0.7, color: c.textSecondary }}>{label}</RNText>
      <RNText style={{ fontFamily: FONT.extrabold, fontSize: 28, lineHeight: 34, color: c.text, fontVariant: ['tabular-nums'] }}>{value}{unit ? <RNText style={{ fontFamily: FONT.semibold, fontSize: 14, color: c.textSecondary }}> {unit}</RNText> : null}</RNText>
    </View>
  );
}

export default function Track() {
  const { id: tripId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const { view, start, pause, resume, stop, retrySync } = useTracking(String(tripId), userId);
  const [stops, setStops] = useState<Stop[]>([]);
  const [title, setTitle] = useState('');
  const [liveShare, setLiveShare] = useState<'off' | 'followers' | 'selected'>('off');
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const a = api();
      const t = await a.trips.get(String(tripId));
      if (t) {
        setTitle(t.trip.title);
        setStops(t.stops.map((s) => ({ id: s.id, completion_status: s.completion_status, stop_order: s.stop_order, name: s.destination?.name ?? s.custom_name ?? 'Stop', lat: s.destination?.latitude ?? s.custom_latitude, lng: s.destination?.longitude ?? s.custom_longitude })));
      }
      const me = await a.profiles.me(); if (me) setLiveShare(me.live_location_sharing);
    })().catch(() => undefined);
  }, [tripId]);

  const next = nextStop(stops);
  const nextIndex = next ? stops.findIndex((x) => x.id === next.id) : -1;
  const doneCount = stops.filter((x) => x.completion_status === 'completed').length;
  const pins: MapPin[] = stops.filter((x) => x.lat != null && x.lng != null).map((x, i) => ({ id: x.id, lat: x.lat as number, lng: x.lng as number, kind: x.completion_status === 'completed' ? 'completed' : 'planned', title: `${i + 1}. ${x.name}` }));
  const s = view.state;
  const active = s === 'recording' || s === 'acquiring_location' || s === 'paused';

  const label = view.signalLost ? 'GPS signal lost' : !view.online && (s === 'recording') ? 'Recording offline' : s === 'idle' ? 'Not recording' : s === 'recording' ? 'REC · Recording' : TRACKING_LABELS[s];
  const tone = s === 'recording' && !view.signalLost && view.online ? 'rec' : view.signalLost || s === 'sync_error' ? 'bad' : s === 'paused' || (!view.online && active) ? 'warn' : s === 'acquiring_location' || s === 'requesting_permission' || s === 'syncing' || s === 'stopping' ? 'info' : 'idle';
  const barBg = { rec: '#FBE7E7', bad: '#FBE7E7', warn: '#FFF3DC', info: c.primarySoft, idle: c.surface }[tone];
  const barFg = { rec: '#8F2222', bad: '#8F2222', warn: '#7A5200', info: c.primaryPressed, idle: c.text }[tone];

  function confirmStop() {
    Alert.alert('Stop this journey?', 'Recording ends now and your route is saved to this trip. SoloTrav stops using your location immediately. You can start a new recording later.', [
      { text: 'Keep recording', style: 'cancel' }, { text: 'Stop and save', style: 'destructive', onPress: () => void stop() },
    ]);
  }

  async function saveNote() {
    const body = note.trim(); if (!body) return;
    await queueNote(Crypto.randomUUID(), String(tripId), body); // stored locally first, so it works offline
    void syncAll();
    setNote(''); setNoteOpen(false); setMsg('Note saved to your private journal.');
  }

  const round = { width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow[2] } as const;
  const action = (icon: IconName, text: string, onPress: () => void, primary?: boolean, disabled?: boolean) => (
    <Pressable key={text} accessibilityRole="button" accessibilityLabel={text} disabled={disabled} onPress={onPress}
      style={{ flex: 1, height: 52, borderRadius: 12, borderWidth: primary ? 1.5 : 1, borderColor: primary ? c.primary : c.controlBorder, backgroundColor: primary ? c.primarySoft : c.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: disabled ? 0.5 : 1 }}>
      <Icon name={icon} size={20} color={primary ? c.primaryPressed : c.text} />
      <RNText style={{ fontFamily: primary ? FONT.bold : FONT.semibold, fontSize: 14, color: primary ? c.primaryPressed : c.text }}>{text}</RNText>
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#E8EEF4' }}>
      <View style={{ flex: 1 }}>
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, padding: 12, paddingTop: 72 }}>
          <TripMap pins={pins} route={view.route} line={undefined} me={view.last ? { latitude: view.last.lat, longitude: view.last.lng } : null} height={360} />
        </View>
        <View style={{ position: 'absolute', left: 12, right: 12, top: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to trip" onPress={() => router.back()} style={round}><Icon name="back" size={24} color={c.text} /></Pressable>
          <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ height: 44, paddingHorizontal: 16, borderRadius: 22, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: barBg, borderWidth: tone === 'idle' ? 1.5 : 0, borderColor: c.controlBorder, ...shadow[2] }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tone === 'idle' ? 'transparent' : barFg, borderWidth: tone === 'idle' ? 2 : 0, borderColor: c.textSecondary }} />
            <RNText style={{ fontFamily: FONT.bold, fontSize: 14, color: barFg }}>{label}</RNText>
          </View>
          {active ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Tracking off" onPress={() => void stopJourney(view.session!.client_session_id).then(() => setMsg('Tracking stopped. Your route is saved on this device and will sync.'))} style={{ ...round, backgroundColor: c.error }}><Icon name="stop" size={20} color="#fff" strokeWidth={2.25} fill="#fff" /></Pressable>
          ) : <View style={{ width: 48 }} />}
        </View>
      </View>

      <View style={{ backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '66%', ...shadow[3] }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 20, gap: 10 }} keyboardShouldPersistTaps="handled">
          {title ? <Text size="label" weight="bold" tone="muted" numberOfLines={1}>{title}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Stat label="ELAPSED" value={formatDuration(view.elapsedMs / 1000)} />
            <Stat label="DISTANCE" value={formatDistance(view.distanceM)} />
            <Stat label="STOPS DONE" value={String(doneCount)} unit={`/ ${stops.length}`} />
          </View>

          {view.permissionError ? (
            <Notice tone="warn">
              <Text weight="bold" size="sm">Location access is needed to track</Text>
              <Text size="sm">{view.permissionError.message} You can still plan this trip and mark places visited manually without location.</Text>
              {view.permissionError.reason !== 'denied' || !view.permissionError.canAskAgain ? <Button title="Open settings" variant="secondary" size="sm" onPress={() => void Linking.openSettings()} style={{ marginTop: 8 }} /> : null}
            </Notice>
          ) : null}
          {view.error ? <Notice tone="error">{view.error}</Notice> : null}
          {view.syncError ? <Notice tone="warn">{view.syncError}</Notice> : null}
          {view.signalLost ? <Notice tone="warn">No GPS fix for a while. Move to open sky; points already recorded are safe.</Notice> : null}
          {msg ? <Notice tone="ok">{msg}</Notice> : null}
          {view.pendingCount > 0 ? <Text size="xs" tone="muted">{view.pendingCount} points waiting to sync.</Text> : null}

          {next ? (
            <View style={{ backgroundColor: c.background, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.surface, borderWidth: 2.5, borderColor: c.primary, alignItems: 'center', justifyContent: 'center' }}><RNText style={{ fontFamily: FONT.bold, fontSize: 13, color: c.primary }}>{nextIndex + 1}</RNText></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <RNText style={{ fontFamily: FONT.bold, fontSize: 12, color: c.textSecondary }}>NEXT STOP</RNText>
                <RNText numberOfLines={1} style={{ fontFamily: FONT.bold, fontSize: 15, color: c.text }}>{next.name}</RNText>
              </View>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 8 }}>
            {action('camera', 'Photo', () => router.push({ pathname: '/post/new', params: { trip: String(tripId) } }), false, !active)}
            {action('edit', 'Note', () => setNoteOpen(true), false, !active)}
            {action('pin', 'Check in', () => router.push({ pathname: '/trip/[id]', params: { id: String(tripId) } }), true)}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="lock" size={18} color={c.text} />
            <Text size="sm" weight="semibold" style={{ flex: 1 }}>{liveShare === 'off' ? 'Route private · Live location sharing off' : 'Live sharing allowed in settings, nothing is shared unless you start a share'}</Text>
          </View>
          <Text size="xs" tone="muted" style={{ lineHeight: 16 }}>Distance is approximate: poor-accuracy points, tiny movements and impossible jumps are ignored. GPS accuracy and recording with the screen off depend on your device permissions, battery settings and network. SoloTrav records only while the status says REC, and shows a notification while it does.</Text>

          {s === 'idle' || s === 'requesting_permission' ? <Button title="Start tracking" size="lg" fullWidth iconName="play" onPress={() => void start()} loading={s === 'requesting_permission'} /> : null}
          {s === 'acquiring_location' || s === 'recording' ? <View style={{ flexDirection: 'row', gap: 10 }}><Button title="Pause" variant="secondary" size="lg" iconName="pause" onPress={() => void pause()} style={{ flex: 1 }} /><Button title="Stop" variant="danger" size="lg" iconName="stop" onPress={confirmStop} style={{ flex: 1 }} /></View> : null}
          {s === 'paused' ? <View style={{ flexDirection: 'row', gap: 10 }}><Button title="Resume" size="lg" iconName="play" onPress={() => void resume()} style={{ flex: 1 }} /><Button title="Stop" variant="danger" size="lg" iconName="stop" onPress={confirmStop} style={{ flex: 1 }} /></View> : null}
          {s === 'stopping' || s === 'syncing' ? <Button title={s === 'stopping' ? 'Stopping…' : 'Syncing route…'} size="lg" fullWidth onPress={() => undefined} loading disabled /> : null}
          {s === 'sync_error' ? <Button title="Retry sync" size="lg" fullWidth onPress={() => void retrySync()} /> : null}
          <Button title="Privacy settings" variant="tertiary" size="sm" onPress={() => router.push('/settings')} style={{ alignSelf: 'flex-start' }} />
        </ScrollView>
      </View>

      <Modal visible={noteOpen} transparent animationType="slide" onRequestClose={() => setNoteOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16,42,67,.55)' }}>
          <View style={{ backgroundColor: c.surface, padding: 16, paddingTop: 10, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 8 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: c.controlBorder, alignSelf: 'center', marginBottom: 6 }} />
            <Text size="xl" weight="bold">Travel note</Text>
            <Field label="Note" value={note} onChangeText={setNote} multiline maxLength={2000} placeholder="What is happening right now?" hint="Saved to your private journal. Works offline." />
            <View style={{ flexDirection: 'row', gap: 10 }}><Button title="Cancel" variant="tertiary" onPress={() => setNoteOpen(false)} style={{ flex: 1 }} /><Button title="Save note" onPress={() => void saveNote()} disabled={!note.trim()} style={{ flex: 1 }} /></View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

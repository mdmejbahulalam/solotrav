import * as Location from 'expo-location';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, Share, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, errorMessage } from '@/lib/api';
import { formatDistance, haversineMeters, proximityHint, tripProgress } from '@solotrav/business-logic';
import { Art, artKindForCategory } from '@/ui/Art';
import { Icon } from '@/ui/icons';
import { Button, Card, Chip, EmptyState, Field, Notice, Pill, Screen, Segments, Skeleton, Text } from '@/ui/kit';
import { TripMap, type MapPin } from '@/ui/Map';
import { shadow, useTheme } from '@/ui/theme';

type StopRow = { id: string; completion_status: 'planned' | 'completed' | 'skipped'; completion_method: string | null; stop_order: number; notes: string; completed_at: string | null; rating: number | null; destination: { slug: string | null; name: string | null; latitude: number | null; longitude: number | null; region: string | null; category?: string | null } | null; custom_name: string | null; custom_latitude: number | null; custom_longitude: number | null };
type Tab = 'overview' | 'itinerary' | 'map' | 'journal';
type Entry = { id: string; title: string; body: string; entry_at: string; place_name: string | null };

const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export default function TripDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const [data, setData] = useState<Awaited<ReturnType<ReturnType<typeof api>['trips']['get']>> | undefined>();
  const [owner, setOwner] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('itinerary');
  const [journal, setJournal] = useState<Entry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sheet, setSheet] = useState<StopRow | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [tip, setTip] = useState('');
  const [prox, setProx] = useState<{ d: number; hint: 'near' | 'uncertain' | 'far' } | null>(null);
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api().trips.get(String(id));
      setData(d); setErr(null);
      if (d) {
        const { data: p } = await api().db.from('profiles').select('username').eq('id', d.trip.owner_id).maybeSingle();
        setOwner((p as { username: string } | null)?.username ?? null);
      }
    } catch (e) { setErr(errorMessage(e)); }
  }, [id]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function openJournal() {
    setTab('journal');
    if (journal !== null) return;
    try { setJournal((await api().journal.list(String(id))) as unknown as Entry[]); } catch (e) { setErr(errorMessage(e)); setJournal([]); }
  }

  if (data === undefined) return <Screen><Skeleton height={180} /><Skeleton /><Skeleton /></Screen>;
  if (data === null) return <Screen><Notice tone="error">This trip is not available.</Notice><Button title="Back" onPress={() => router.back()} /></Screen>;
  const { trip, members } = data;
  const stops = data.stops as unknown as StopRow[];
  const progress = tripProgress(stops);
  const nm = (s: StopRow) => s.destination?.name ?? s.custom_name ?? 'Stop';
  const pos = (s: StopRow) => ({ lat: s.destination?.latitude ?? s.custom_latitude, lng: s.destination?.longitude ?? s.custom_longitude });
  const pins: MapPin[] = stops.flatMap((s, i) => { const p = pos(s); return p.lat != null && p.lng != null ? [{ id: s.id, lat: p.lat, lng: p.lng, kind: (s.completion_status === 'completed' ? 'completed' : 'planned') as MapPin['kind'], title: `${i + 1}. ${nm(s)}` }] : []; });
  const canEdit = members.some((m) => (m.role === 'owner' || m.role === 'editor') && m.invitation_status === 'accepted');
  const nextIdx = stops.findIndex((s) => s.completion_status === 'planned');
  const next = nextIdx >= 0 ? stops[nextIdx] : undefined;

  function open(s: StopRow) { setSheet(s); setRating(null); setTip(''); setProx(null); setLocMsg(null); }

  async function checkDistance() {
    if (!sheet) return;
    const p = pos(sheet);
    if (p.lat == null || p.lng == null) { setLocMsg('This stop has no coordinates.'); return; }
    setLocMsg('Getting your location…');
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted') perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') { setLocMsg('Location permission is off, so distance cannot be checked. You can still complete manually.'); return; }
      const here = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const d = haversineMeters(here.coords.latitude, here.coords.longitude, p.lat, p.lng);
      setProx({ d, hint: proximityHint(d, here.coords.accuracy) }); setLocMsg(null);
    } catch { setLocMsg('Could not get your location. You can still complete manually.'); }
  }

  async function complete(method: 'manual' | 'gps_assisted') {
    if (!sheet) return;
    setBusy(true);
    try { await api().trips.completeStop(sheet.id, { method, rating, tip: tip.trim() || null, distanceM: method === 'gps_assisted' && prox ? Math.round(prox.d) : null }); setSheet(null); await load(); }
    catch (e) { Alert.alert('Could not complete', errorMessage(e)); } finally { setBusy(false); }
  }
  async function undo(s: StopRow) { try { await api().trips.uncompleteStop(s.id); await load(); } catch (e) { Alert.alert('Could not undo', errorMessage(e)); } }

  const circle = { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow[2] } as const;
  const visLabel = trip.visibility === 'public' ? 'Public' : trip.visibility === 'followers' ? 'Followers' : 'Private';
  const heroKind = artKindForCategory(stops.find((s) => s.destination?.category)?.destination?.category ?? 'mountains');

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
        <View>
          <Art kind={heroKind} height={180} label={false} />
          <View style={{ position: 'absolute', left: 12, top: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/trips'))} style={circle}><Icon name="back" size={22} color={c.text} /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Share trip" onPress={() => void Share.share({ message: trip.visibility === 'public' ? `${trip.title} on SoloTrav` : `${trip.title} (private trip)` })} style={circle}><Icon name="share" size={22} color={c.text} /></Pressable>
          </View>
        </View>

        <View style={{ padding: 16, paddingTop: 12, gap: 10 }}>
          <View>
            <Text weight="extrabold" accessibilityRole="header" style={{ fontSize: 22, lineHeight: 28, letterSpacing: -0.2, color: c.navy }}>{trip.title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              <Text size="sm" tone="muted">{owner ? `by @${owner}` : ''}{owner ? ' · ' : ''}{trip.start_date ? `${fmtDate(trip.start_date)}${trip.end_date ? ` to ${fmtDate(trip.end_date)}` : ''}` : 'Flexible dates'}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 }}><Icon name={trip.visibility === 'public' ? 'globe' : trip.visibility === 'followers' ? 'users' : 'lock'} size={12} color={c.text} /><Text size="xs" weight="semibold">{visLabel}</Text></View>
              {trip.tracking_status === 'recording' ? <Pill label="Recording" tone="bad" /> : null}
            </View>
          </View>
          {err ? <Notice tone="error">{err}</Notice> : null}

          <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text weight="extrabold" tabular style={{ fontSize: 40, lineHeight: 44 }}>{progress.completed}</Text>
                <Text size="xl" weight="semibold" tone="muted" tabular>/ {progress.total}</Text>
                <Text size="sm" tone="muted">stops completed</Text>
              </View>
              <Text weight="extrabold" tabular style={{ fontSize: 22, color: c.success }}>{progress.percent}%</Text>
            </View>
            {progress.total > 0 ? <Segments total={progress.total} done={progress.completed} current={next ? nextIdx : undefined} height={8} label="Trip progress" /> : null}
            <Text size="xs" tone="muted">{next ? `Next: ${nm(next)}` : progress.total ? 'All stops are complete.' : 'No stops yet.'}</Text>
          </View>

          {canEdit && trip.status !== 'completed' ? <Button title={trip.tracking_status === 'recording' || trip.tracking_status === 'paused' || trip.status === 'active' ? 'Open tracking' : 'Start trip'} variant="coral" size="lg" fullWidth iconName="record" onPress={() => router.push({ pathname: '/trip/track', params: { id: trip.id } })} /> : null}

          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: c.border }}>
            {([['overview', 'Overview'], ['itinerary', 'Itinerary'], ['map', 'Map'], ['journal', 'Journal']] as const).map(([k, l]) => (
              <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} onPress={() => (k === 'journal' ? void openJournal() : setTab(k))} style={{ flex: 1, height: 44, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: tab === k ? c.primary : 'transparent' }}>
                <Text size="label" weight={tab === k ? 'bold' : 'semibold'} tone={tab === k ? 'primary' : 'muted'}>{l}</Text>
              </Pressable>
            ))}
          </View>

          {tab === 'overview' ? (
            <View style={{ gap: 10 }}>
              {trip.description ? <Text>{trip.description}</Text> : <Text tone="muted">No description yet.</Text>}
              <Text size="label" weight="bold">Travelers</Text>
              {members.filter((m) => m.invitation_status === 'accepted').map((m) => <Text key={m.user_id} size="sm" tone="muted">{m.role === 'owner' ? 'Owner' : m.role === 'editor' ? 'Can edit' : 'Can view'}{m.user_id === trip.owner_id && owner ? ` · @${owner}` : ''}</Text>)}
            </View>
          ) : null}

          {tab === 'map' ? <TripMap pins={pins} height={320} /> : null}

          {tab === 'journal' ? (journal === null ? <Skeleton height={80} /> : journal.length === 0 ? <EmptyState icon="edit" title="No journal entries" body="Private notes for this trip appear here." /> : journal.map((j) => (
            <Card key={j.id} style={{ padding: 12, gap: 2 }}><Text weight="bold">{j.title || 'Entry'}</Text><Text size="xs" tone="muted">{new Date(j.entry_at).toLocaleDateString()}{j.place_name ? ` · ${j.place_name}` : ''}</Text><Text size="sm" style={{ marginTop: 4 }}>{j.body}</Text></Card>
          ))) : null}

          {tab === 'itinerary' ? (stops.length === 0 ? <Text tone="muted">No stops yet.</Text> : (
            <View>
              {stops.map((s, i) => {
                const done = s.completion_status === 'completed'; const isNext = i === nextIdx; const p = pos(s);
                const last = i === stops.length - 1;
                return (
                  <View key={s.id} style={{ flexDirection: 'row', gap: 12, minHeight: 56 }}>
                    <View style={{ alignItems: 'center', width: 28 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? c.success : c.surface, borderWidth: done ? 0 : isNext ? 3 : 2, borderColor: isNext ? c.primary : c.controlBorder }}>
                        {done ? <Icon name="check" size={16} color="#fff" strokeWidth={2.5} /> : <Text size="sm" weight="bold" tabular style={{ color: isNext ? c.primary : c.textSecondary }}>{i + 1}</Text>}
                      </View>
                      {!last ? <View style={{ width: 2, flex: 1, marginVertical: 2, backgroundColor: done ? c.success : c.border }} /> : null}
                    </View>
                    <View style={{ flex: 1, minWidth: 0, paddingBottom: 14 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                        <Text weight="bold" numberOfLines={1} style={{ flex: 1 }}>{nm(s)}</Text>
                        <Text size="xs" weight="bold" style={{ color: done ? c.success : isNext ? c.primary : c.textSecondary }}>{done ? 'Completed' : s.completion_status === 'skipped' ? 'Skipped' : isNext ? 'Next stop' : 'Upcoming'}</Text>
                      </View>
                      <Text size="xs" tone="muted">{[s.destination?.region, done ? (s.completion_method === 'gps_assisted' ? 'GPS-assisted' : 'marked manually') : null, done && s.rating ? `rated ${s.rating} of 5` : null].filter(Boolean).join(' · ')}</Text>
                      {s.notes ? <Text size="sm" style={{ marginTop: 4 }}>{s.notes}</Text> : null}
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        {p.lat != null && p.lng != null && !done ? <Button title="Navigate" size="sm" variant="secondary" iconName="locate" onPress={() => void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`)} /> : null}
                        {canEdit && !done ? <Button title="Mark completed" size="sm" iconName="check" onPress={() => open(s)} /> : null}
                        {canEdit && done ? <Button title="Undo" size="sm" variant="tertiary" onPress={() => void undo(s)} /> : null}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )) : null}
        </View>
      </ScrollView>

      <Modal visible={sheet !== null} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16,42,67,.55)' }}>
          <ScrollView style={{ maxHeight: '88%', backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20 }} contentContainerStyle={{ padding: 16, paddingTop: 10, gap: 12 }} keyboardShouldPersistTaps="handled">
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: c.controlBorder, alignSelf: 'center' }} />
            {sheet ? <Art kind={artKindForCategory(sheet.destination?.category)} height={96} radius={16} /> : null}
            <View>
              <Text size="xl" weight="bold" style={{ lineHeight: 26 }}>{sheet ? nm(sheet) : ''}</Text>
              <Text size="sm" tone="muted">Mark this destination as completed. You do not need GPS to do this.</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }} accessibilityLabel="Rating">
              {[1, 2, 3, 4, 5].map((n) => <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} stars`} onPress={() => setRating(rating === n ? null : n)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="star" size={28} color={rating && n <= rating ? '#E6A23C' : c.controlBorder} fill={rating && n <= rating ? '#E6A23C' : undefined} /></Pressable>)}
            </View>
            <Field label="Travel tip" optional value={tip} onChangeText={setTip} maxLength={400} placeholder="Go before 8 a.m. for fewer visitors." />
            <Button title="Check my distance (optional)" variant="secondary" iconName="pin" onPress={() => void checkDistance()} />
            {prox ? <Notice tone={prox.hint === 'near' ? 'ok' : 'info'}><Text size="sm">{formatDistance(prox.d)} away. {prox.hint === 'near' ? 'Close enough to confirm.' : prox.hint === 'uncertain' ? 'Accuracy is too low to be sure.' : 'Not at this place yet.'} This is a hint from your phone's GPS, not proof of a visit.</Text></Notice> : null}
            {locMsg ? <Text size="sm" tone="muted">{locMsg}</Text> : null}
            <Button title="Mark as completed" variant="success" size="lg" fullWidth iconName="check" onPress={() => void complete('manual')} loading={busy} />
            {prox?.hint === 'near' ? <Button title="Complete with GPS confirmation" variant="secondary" fullWidth onPress={() => void complete('gps_assisted')} loading={busy} /> : null}
            <Button title="Cancel" variant="tertiary" fullWidth onPress={() => setSheet(null)} />
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, errorMessage } from '@/lib/api';
import { haversineMeters, moveItem, validateTripDates } from '@solotrav/business-logic';
import type { Destination } from '@solotrav/shared-types';
import { Art, ArtThumb, artKindForCategory } from '@/ui/Art';
import { Icon, type IconName } from '@/ui/icons';
import { ActionBar, Button, Chip, Field, Notice, Segments, Text, ToggleRow, TopBar } from '@/ui/kit';
import { FONT, useTheme } from '@/ui/theme';

const STEPS = ['Trip basics', 'Destinations', 'Privacy and review'] as const;
const STYLES = ['Solo', 'Couple', 'Family', 'Backpacking', 'Adventure', 'Budget'] as const;
type Vis = 'public' | 'followers' | 'private';
type StopDraft = { key: string; destination: Destination; notes: string };

const VIS: Array<[Vis, string, string, IconName]> = [
  ['public', 'Public', 'Anyone with the link', 'globe'],
  ['followers', 'Followers', 'People who follow you', 'users'],
  ['private', 'Private', 'Only you (and people you invite)', 'lock'],
];

/** Mobile trip wizard: basics -> destinations (add, reorder, notes) -> privacy and review -> save draft / publish / start. Dates are optional. */
export default function NewTrip() {
  const router = useRouter();
  const { c } = useTheme();
  const params = useLocalSearchParams<{ dest?: string }>();
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [noDates, setNoDates] = useState(false);
  const [style, setStyle] = useState<string | null>('Solo');
  const [vis, setVis] = useState<Vis>('private');
  const [stops, setStops] = useState<StopDraft[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Destination[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'draft' | 'publish' | 'start'>(null);
  const counter = useRef(0);

  useEffect(() => {
    if (!params.dest) return;
    api().db.from('destinations').select('*').eq('id', params.dest).maybeSingle().then(({ data }) => { if (data) setStops([{ key: `k${counter.current++}`, destination: data as Destination, notes: '' }]); });
  }, [params.dest]);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => { api().destinations.search(q, undefined, 6).then(setResults).catch((e) => setErr(errorMessage(e))); }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const s0 = noDates ? '' : start; const e0 = noDates ? '' : end;
  const dateErr = s0 || e0 ? validateTripDates(s0 || null, e0 || null) : null;
  const km = useMemo(() => {
    let m = 0;
    for (let i = 1; i < stops.length; i++) { const a = stops[i - 1]!.destination, b = stops[i]!.destination; if (a.latitude != null && a.longitude != null && b.latitude != null && b.longitude != null) m += haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude); }
    return Math.round(m / 1000);
  }, [stops]);
  const days = s0 && e0 && !dateErr ? Math.round((Date.parse(e0) - Date.parse(s0)) / 86400000) + 1 : null;

  function next() {
    setErr(null);
    if (step === 0) { if (title.trim().length < 3) { setErr('Give your trip a name (at least 3 characters).'); return; } if (dateErr) { setErr(dateErr); return; } }
    setStep((s) => Math.min(2, s + 1));
  }

  async function save(mode: 'draft' | 'publish' | 'start') {
    if (mode !== 'draft' && stops.length === 0) { setStep(1); setErr('Add at least one destination before publishing.'); return; }
    setBusy(mode); setErr(null);
    let tripId: string | null = null;
    try {
      const a = api();
      const t = await a.trips.create({ title, description, start_date: s0 || null, end_date: e0 || null, visibility: vis, travel_style: style });
      tripId = t.id;
      for (const s of stops) await a.trips.addStop(t.id, { destination_id: s.destination.id, notes: s.notes });
      if (mode !== 'draft') await a.trips.publish(t.id, mode === 'start' ? 'active' : 'planned');
      void a.social.track(mode === 'draft' ? 'trip_created' : 'trip_published', { platform: 'android' });
      router.replace(mode === 'start' ? { pathname: '/trip/track', params: { id: t.id } } : { pathname: '/trip/[id]', params: { id: t.id } });
    } catch (e) {
      setErr(tripId ? `Saved as a draft, but a later step failed: ${errorMessage(e)}` : errorMessage(e));
      if (tripId) router.replace({ pathname: '/trip/[id]', params: { id: tripId } });
    } finally { setBusy(null); }
  }

  const footer = (
    <ActionBar height={step === 2 ? 128 : 84}>
      {step === 0 ? (<>
        <Button title="Save draft" variant="tertiary" size="lg" onPress={() => void save('draft')} loading={busy === 'draft'} disabled={busy !== null || title.trim().length < 3} style={{ minWidth: 0 }} />
        <Button title="Continue" size="lg" iconName="chevR" onPress={next} style={{ flex: 1 }} />
      </>) : step === 1 ? (<>
        <Text size="sm" tone="muted" style={{ width: 84, lineHeight: 16 }}>{stops.length} stop{stops.length === 1 ? '' : 's'}</Text>
        <Button title="Continue" size="lg" iconName="chevR" onPress={next} style={{ flex: 1 }} />
      </>) : (
        <View style={{ flex: 1, gap: 8 }}>
          <Button title="Publish trip" size="lg" fullWidth iconName="globe" onPress={() => void save('publish')} loading={busy === 'publish'} disabled={busy !== null} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Save draft" variant="secondary" size="sm" onPress={() => void save('draft')} loading={busy === 'draft'} disabled={busy !== null} style={{ flex: 1, height: 44 }} />
            <Button title="Start trip now" variant="secondary" size="sm" onPress={() => void save('start')} loading={busy === 'start'} disabled={busy !== null} style={{ flex: 1, height: 44 }} />
          </View>
        </View>
      )}
    </ActionBar>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <TopBar title="Create trip" right={`${step + 1} of 3`} onBack={() => (step === 0 ? router.back() : setStep(step - 1))} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 14, gap: 12, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 6 }}>
          <Segments total={3} done={step + 1} doneColor={c.primary} label={`Step ${step + 1} of 3`} />
          <Text size="xs" weight="semibold" tone="muted">{STEPS.join(' · ')}</Text>
        </View>
        {err ? <Notice tone="error">{err}</Notice> : null}

        {step === 0 && (<>
          <Art kind="hills" height={112} radius={16} />
          <Field label="Trip name" value={title} onChangeText={setTitle} maxLength={140} placeholder="e.g. Bangladesh Highlights" />
          <Field label="Description" optional value={description} onChangeText={setDescription} multiline maxLength={2000} />
          {!noDates ? (
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}><Field label="Start date" value={start} onChangeText={setStart} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" error={dateErr} /></View>
              <View style={{ flex: 1 }}><Field label="End date" value={end} onChangeText={setEnd} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" /></View>
            </View>
          ) : null}
          <ToggleRow title="Dates not decided yet" helper="Plan without fixed dates and add them later." value={noDates} onChange={setNoDates} />
          <View style={{ gap: 6 }}>
            <Text size="label" weight="semibold">Travel style</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{STYLES.map((s) => <Chip key={s} label={s} selected={style === s} onPress={() => setStyle(style === s ? null : s)} />)}</View>
          </View>
        </>)}

        {step === 1 && (<>
          <View style={{ gap: 6 }}>
            <View style={{ height: 48, borderRadius: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.controlBorder, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 }}>
              <Icon name="search" size={20} color={c.textSecondary} />
              <TextInput accessibilityLabel="Search places to add" value={q} onChangeText={setQ} placeholder="Search places to add" placeholderTextColor={c.textSecondary} style={{ flex: 1, fontFamily: FONT.regular, fontSize: 15, color: c.text, height: 46 }} />
            </View>
            <Text size="xs" tone="muted" style={{ lineHeight: 16 }}>Searches SoloTrav destinations. Google Places search needs a Maps key (see docs).</Text>
          </View>
          {results.map((d) => (
            <Pressable key={d.id} accessibilityRole="button" accessibilityLabel={`Add ${d.name}`} onPress={() => { if (stops.some((s) => s.destination.id === d.id)) { setErr(`${d.name} is already in this trip.`); return; } setErr(null); setStops((s) => [...s, { key: `k${counter.current++}`, destination: d, notes: '' }]); setQ(''); }}
              style={{ minHeight: 56, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <ArtThumb kind={artKindForCategory(d.category)} size={40} />
              <View style={{ flex: 1 }}><Text weight="bold">{d.name}</Text><Text size="xs" tone="muted">{[d.region, d.country].filter(Boolean).join(', ')}</Text></View>
              <Icon name="plus" size={22} color={c.primary} />
            </Pressable>
          ))}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text weight="bold">{stops.length} stop{stops.length === 1 ? '' : 's'}</Text>
            <Text size="xs" tone="muted">Use the arrows to reorder</Text>
          </View>
          {stops.length === 0 ? <Text tone="muted">No stops yet. You can save a draft without any.</Text> : stops.map((s, i) => {
            const sel = open === s.key;
            return (
              <View key={s.key} style={{ backgroundColor: c.surface, borderRadius: 12, borderWidth: sel ? 2 : 1, borderColor: sel ? c.primary : c.border, overflow: 'hidden' }}>
                <View style={{ minHeight: 64, paddingLeft: 8, paddingRight: 4, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 24, alignItems: 'center' }}>
                    <Pressable accessibilityLabel={`Move ${s.destination.name} up`} disabled={i === 0} onPress={() => setStops((x) => moveItem(x, i, i - 1))} hitSlop={6} style={{ opacity: i === 0 ? 0.25 : 1, transform: [{ rotate: '180deg' }] }}><Icon name="chevD" size={20} color={c.controlBorder} /></Pressable>
                    <Pressable accessibilityLabel={`Move ${s.destination.name} down`} disabled={i === stops.length - 1} onPress={() => setStops((x) => moveItem(x, i, i + 1))} hitSlop={6} style={{ opacity: i === stops.length - 1 ? 0.25 : 1 }}><Icon name="chevD" size={20} color={c.controlBorder} /></Pressable>
                  </View>
                  <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}><Text size="sm" weight="bold" tone="inverse" tabular>{i + 1}</Text></View>
                  <ArtThumb kind={artKindForCategory(s.destination.category)} size={40} />
                  <Pressable accessibilityRole="button" accessibilityLabel={`Edit note for ${s.destination.name}`} onPress={() => setOpen(sel ? null : s.key)} style={{ flex: 1, minWidth: 0, paddingVertical: 8 }}>
                    <Text weight="bold" numberOfLines={1}>{s.destination.name}</Text>
                    <Text size="xs" tone="muted" numberOfLines={1}>{s.notes || [s.destination.region, s.destination.country].filter(Boolean).join(', ')}</Text>
                  </Pressable>
                  <Pressable accessibilityLabel={`Remove ${s.destination.name}`} onPress={() => setStops((x) => x.filter((y) => y.key !== s.key))} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><Icon name="close" size={20} color={c.textSecondary} /></Pressable>
                </View>
                {sel ? (
                  <View style={{ paddingHorizontal: 12, paddingBottom: 12, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 }}>
                    <Field label="Note" optional value={s.notes} onChangeText={(t) => setStops((x) => x.map((y) => (y.key === s.key ? { ...y, notes: t } : y)))} maxLength={600} />
                  </View>
                ) : null}
              </View>
            );
          })}
        </>)}

        {step === 2 && (<>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {([[String(stops.length), stops.length === 1 ? 'stop' : 'stops'], [days ? String(days) : '—', days ? 'days' : 'flexible dates'], [km ? `~${km}` : '—', 'km, straight-line']] as const).map(([n, l]) => (
              <View key={l} style={{ flex: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 }}>
                <Text weight="extrabold" tabular style={{ fontSize: 22, lineHeight: 28 }}>{n}</Text>
                <Text size="xs" tone="muted">{l}</Text>
              </View>
            ))}
          </View>
          <Text size="xs" tone="muted" style={{ lineHeight: 16 }}>Distance is a straight-line estimate between stops. Real road routes and times need Google Maps.</Text>
          <View style={{ gap: 6 }}>
            <Text size="label" weight="bold">Who can see this trip</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {VIS.map(([v, label, helper, icon]) => (
                <Pressable key={v} accessibilityRole="radio" accessibilityState={{ selected: vis === v }} onPress={() => setVis(v)}
                  style={{ width: '48.5%', minHeight: 56, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', gap: 10, alignItems: 'center', borderWidth: vis === v ? 2 : 1, borderColor: vis === v ? c.primary : c.controlBorder, backgroundColor: vis === v ? c.primarySoft : c.surface }}>
                  <Icon name={icon} size={22} color={c.text} />
                  <View style={{ flex: 1 }}><Text size="label" weight="bold">{label}</Text><Text size="xs" tone="muted" style={{ lineHeight: 14 }}>{helper}</Text></View>
                </Pressable>
              ))}
            </View>
          </View>
          <Notice icon="lock">Starting a trip does not turn on GPS. Tracking begins only when you press Start on the tracking screen and allow location.</Notice>
        </>)}
      </ScrollView>
      {footer}
    </SafeAreaView>
  );
}

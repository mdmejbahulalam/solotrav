import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native';
import { api, errorMessage } from '@/lib/api';
import { Button, Card, EmptyState, Notice, Pill, Segments, Skeleton, Text } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

type T = { id: string; title: string; status: string; visibility: string; start_date: string | null; end_date: string | null; stops: Array<{ completion_status: string }> };

const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export default function Trips() {
  const router = useRouter();
  const { c } = useTheme();
  const [trips, setTrips] = useState<T[] | null>(null);
  const [invites, setInvites] = useState<Array<{ trip_id: string; role: string; title: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { db } = api();
      const { data: u } = await db.auth.getUser();
      const uid = u.user?.id;
      const [t, inv] = await Promise.all([
        db.from('trips').select('id,title,status,visibility,start_date,end_date,stops:trip_stops(completion_status)').order('created_at', { ascending: false }),
        db.from('trip_members').select('trip_id,role,trip:trips(title)').eq('user_id', uid ?? '').eq('invitation_status', 'invited'),
      ]);
      if (t.error) throw t.error;
      setTrips((t.data ?? []) as unknown as T[]);
      setInvites(((inv.data ?? []) as unknown as Array<{ trip_id: string; role: string; trip: { title: string } | null }>).map((i) => ({ trip_id: i.trip_id, role: i.role, title: i.trip?.title ?? 'a trip' })));
    } catch (e) { setError(errorMessage(e)); setTrips((x) => x ?? []); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function respond(id: string, accept: boolean) {
    try { await api().trips.respondToInvite(id, accept); await load(); } catch (e) { setError(errorMessage(e)); }
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text weight="extrabold" accessibilityRole="header" style={{ fontSize: 24, lineHeight: 32, color: c.navy }}>Trips</Text>
        <Button title="New trip" iconName="plus" size="sm" onPress={() => router.push('/trip/new')} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 48 }}>
        {error ? <Notice tone="error">{error}</Notice> : null}
        {invites.map((i) => (
          <Notice key={i.trip_id} icon="users"><Text size="sm">You are invited to collaborate on <Text weight="bold" size="sm">{i.title}</Text> as {i.role}.</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}><Button title="Accept" size="sm" onPress={() => respond(i.trip_id, true)} style={{ flex: 1 }} /><Button title="Decline" size="sm" variant="secondary" onPress={() => respond(i.trip_id, false)} style={{ flex: 1 }} /></View></Notice>
        ))}
        {trips === null ? <><Skeleton height={110} /><Skeleton height={110} /></> : trips.length === 0 ? <EmptyState icon="trips" title="No trips yet" body="Plan your first journey. Dates are optional." action={<Button title="Create a trip" iconName="plus" onPress={() => router.push('/trip/new')} />} /> : trips.map((t) => {
          const counted = t.stops.filter((s) => s.completion_status !== 'skipped'); const done = counted.filter((s) => s.completion_status === 'completed').length;
          const pct = counted.length ? Math.round((100 * done) / counted.length) : 0;
          const dates = t.start_date ? `${fmt(t.start_date)}${t.end_date ? ` to ${fmt(t.end_date)}` : ''}` : 'Flexible dates';
          return (
            <Card key={t.id} onPress={() => router.push(`/trip/${t.id}`)} style={{ padding: 14, marginBottom: 12, gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <Text size="lg" weight="bold" style={{ flex: 1 }}>{t.title}</Text>
                <Pill label={t.status[0]!.toUpperCase() + t.status.slice(1)} tone={t.status === 'active' ? 'coral' : t.status === 'completed' ? 'ok' : t.status === 'draft' ? 'warn' : 'blue'} />
              </View>
              <Text size="sm" tone="muted">{dates} · {t.visibility === 'public' ? 'Public' : t.visibility === 'followers' ? 'Followers' : 'Private'}</Text>
              {counted.length ? <Segments total={counted.length} done={done} current={done < counted.length ? done : undefined} height={8} label={`${t.title}: ${done} of ${counted.length} stops`} /> : null}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text size="xs" tone="muted" tabular>{done} / {counted.length} stops completed</Text>
                <Text size="xs" weight="bold" style={{ color: c.success }} tabular>{pct}%</Text>
              </View>
            </Card>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

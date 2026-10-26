import Link from 'next/link';
import { Card, EmptyState, LinkButton, Pill, ProgressBar } from '@/components/ui';
import { Scene } from '@/components/Scene';
import { createServerSupabase, requireUser } from '@/lib/supabase/server';
import { InviteResponder } from './InviteResponder';

export const metadata = { title: 'Trips' };

type TripRow = { id: string; title: string; status: string; visibility: string; start_date: string | null; end_date: string | null; owner_id: string; stops: Array<{ completion_status: string }> };

export default async function TripsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser('/trips');
  const sp = await searchParams;
  const tab = sp.tab === 'shared' || sp.tab === 'saved' ? sp.tab : 'mine';
  const db = await createServerSupabase();

  const { data: invites } = await db.from('trip_members').select('trip_id, role, trip:trips(title)').eq('user_id', user.id).eq('invitation_status', 'invited');

  let trips: TripRow[] = [];
  if (tab === 'mine') {
    trips = ((await db.from('trips').select('id,title,status,visibility,start_date,end_date,owner_id,stops:trip_stops(completion_status)').eq('owner_id', user.id).order('created_at', { ascending: false })).data ?? []) as TripRow[];
  } else if (tab === 'shared') {
    const { data: m } = await db.from('trip_members').select('trip_id').eq('user_id', user.id).eq('invitation_status', 'accepted').neq('role', 'owner');
    const ids = (m ?? []).map((x) => x.trip_id);
    if (ids.length) trips = ((await db.from('trips').select('id,title,status,visibility,start_date,end_date,owner_id,stops:trip_stops(completion_status)').in('id', ids)).data ?? []) as TripRow[];
  } else {
    const { data: s } = await db.from('saved_items').select('item_id').eq('user_id', user.id).eq('item_type', 'trip').order('created_at', { ascending: false });
    const ids = (s ?? []).map((x) => x.item_id);
    if (ids.length) trips = ((await db.from('trips').select('id,title,status,visibility,start_date,end_date,owner_id,slug,stops:trip_stops(completion_status)').in('id', ids)).data ?? []) as TripRow[];
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between"><h1 className="text-2xl font-extrabold text-navy">Trips</h1><LinkButton href="/trips/new">+ New trip</LinkButton></div>
      <div className="mb-4 flex gap-1 border-b border-line" role="tablist" aria-label="Trip lists">
        {([['mine', 'My trips'], ['shared', 'Shared with me'], ['saved', 'Saved itineraries']] as const).map(([k, l]) => (
          <Link key={k} href={`/trips?tab=${k}`} role="tab" aria-selected={tab === k} className={`border-b-[3px] px-4 py-3 font-semibold ${tab === k ? 'border-primary text-primary' : 'border-transparent text-muted'}`}>{l}</Link>
        ))}
      </div>
      {(invites ?? []).map((i) => <InviteResponder key={i.trip_id} tripId={i.trip_id} title={(i.trip as unknown as { title: string } | null)?.title ?? 'a trip'} role={i.role} />)}
      {trips.length === 0 ? (
        <EmptyState title={tab === 'mine' ? 'No trips yet' : 'Nothing here yet'} action={tab === 'mine' ? <LinkButton href="/trips/new">Create a trip</LinkButton> : <LinkButton href="/explore" variant="secondary">Explore trips</LinkButton>}>
          {tab === 'mine' ? 'Plan your first journey. Dates are optional.' : tab === 'shared' ? 'Trips you are invited to edit appear here.' : 'Save public itineraries to reuse them.'}
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((t) => {
            const counted = t.stops.filter((s) => s.completion_status !== 'skipped');
            const done = counted.filter((s) => s.completion_status === 'completed').length;
            const pct = counted.length ? Math.round((100 * done) / counted.length) : 0;
            return (
              <li key={t.id}>
                <Link href={`/trips/${t.id}`}>
                  <Card className="transition hover:border-primary">
                    <Scene category="hills" className="h-28" label={false} />
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2"><h2 className="font-bold text-navy">{t.title}</h2><Pill tone={t.status === 'active' ? 'coral' : t.status === 'completed' ? 'ok' : t.status === 'draft' ? 'warn' : 'blue'}>{t.status}</Pill></div>
                      <p className="text-sm text-muted">{t.start_date ? `${t.start_date}${t.end_date ? ` → ${t.end_date}` : ''}` : 'Flexible dates'} · {t.visibility}</p>
                      <div className="mt-3 flex items-center gap-3"><div className="flex-1"><ProgressBar percent={pct} label={`${t.title} progress`} /></div><span className="text-sm font-bold">{done}/{counted.length}</span></div>
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

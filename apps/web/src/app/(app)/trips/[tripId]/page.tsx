import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { JourneyPanel } from '@/components/JourneyPanel';
import { JournalPanel } from '@/components/JournalPanel';
import { MapView, type MapMarker } from '@/components/maps/MapView';
import { StopActions } from '@/components/StopActions';
import { Scene } from '@/components/Scene';
import { Avatar, ConfigNotice, Icon, LinkButton, Notice, Pill, ProgressBar, Segments } from '@/components/ui';
import { supabaseConfigured } from '@/lib/env';
import { createAnonSupabase, createServerSupabase, requireUser } from '@/lib/supabase/server';
import { decodePolyline, tripProgress } from '@solotrav/business-logic';
import { journal as journalApi, journeys as journeysApi, trips as tripsApi } from '@solotrav/api-client';
import { PublicTripActions, TripOwnerControls } from './TripControls';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Params = { params: Promise<{ tripId: string }>; searchParams: Promise<{ tab?: string; invite_failed?: string }> };

const panel = 'rounded-[20px] border border-line bg-surface p-6';
const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const range = (a: string | null, b: string | null) => (a ? `${fmt(a)}${b ? ` to ${fmt(b)}` : ''}` : 'Flexible dates');

/** SEO metadata only ever comes from the anonymous client: private trips cannot leak into <head>. */
export async function generateMetadata({ params }: Pick<Params, 'params'>): Promise<Metadata> {
  const { tripId } = await params;
  if (UUID.test(tripId) || !supabaseConfigured) return { title: 'Trip', robots: { index: false, follow: false } };
  const pub = await tripsApi(createAnonSupabase()).getPublic(tripId).catch(() => null);
  if (!pub) return { title: 'Trip not found', robots: { index: false } };
  const desc = pub.trip.description || `A trip by @${pub.owner.username} on SoloTrav.`;
  return { title: pub.trip.title, description: desc.slice(0, 160), alternates: { canonical: `/trips/${pub.trip.slug}` }, openGraph: { title: pub.trip.title, description: desc.slice(0, 160), type: 'article' } };
}

export default async function TripPage(props: Params) {
  const { tripId } = await props.params;
  if (!supabaseConfigured) return <ConfigNotice what="Supabase" vars={['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']} />;
  return UUID.test(tripId) ? <PrivateTrip id={tripId} {...props} /> : <PublicTrip slug={tripId} />;
}

function StatusPill({ done, next, skipped }: { done: boolean; next?: boolean; skipped?: boolean }) {
  return done ? <Pill tone="ok">Completed</Pill> : skipped ? <Pill>Skipped</Pill> : next ? <Pill tone="blue">Next</Pill> : <Pill>Planned</Pill>;
}

function StopNumber({ n, done, next }: { n: number; done: boolean; next?: boolean }) {
  return (
    <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${done ? 'bg-ok text-white' : next ? 'bg-primary text-white' : 'border-2 border-control bg-surface text-body'}`}>
      {done ? <Icon name="check" size={16} /> : n}
    </span>
  );
}

// --------------------------------------------------------------------- public page (slug)
async function PublicTrip({ slug }: { slug: string }) {
  const pub = await tripsApi(createAnonSupabase()).getPublic(slug); // anon client: only deliberately public data
  if (!pub) notFound();
  const stops = pub.stops;
  const markers: MapMarker[] = stops.flatMap((s, i) => s.destination.latitude != null && s.destination.longitude != null
    ? [{ id: s.id, lat: s.destination.latitude as number, lng: s.destination.longitude as number, kind: (s.status === 'completed' ? 'completed' : 'planned') as MapMarker['kind'], label: String(i + 1), title: s.destination.name ?? 'Stop' }] : []);
  const route = pub.route_preview ? decodePolyline(pub.route_preview.encoded_polyline) : undefined;
  const nextIdx = stops.findIndex((s) => s.status === 'planned');
  return (
    <article className="grid items-start gap-8 lg:grid-cols-[1fr_360px]">
      <div className="flex min-w-0 flex-col gap-5">
        <Scene category="hills" className="h-[200px] rounded-[28px] lg:h-60" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2"><span className="rounded-full bg-ok-soft px-2.5 py-1 text-xs font-bold text-[#0b5a3e]">Public trip</span></div>
            <h1 className="mt-2 text-[28px] leading-tight font-extrabold text-navy lg:text-4xl">{pub.trip.title}</h1>
            <Link href={`/u/${pub.owner.username}`} className="mt-2 flex items-center gap-2.5 text-sm text-body">
              <Avatar name={pub.owner.display_name} src={pub.owner.avatar_url} size={32} gradient /> <span>by <b>{pub.owner.display_name}</b> · {range(pub.trip.start_date, pub.trip.end_date)} · {stops.length} stops</span>
            </Link>
          </div>
          <PublicTripActions tripId={pub.trip.id} slug={pub.trip.slug} title={pub.trip.title} stops={stops.flatMap((s) => (s.destination.id ? [{ destinationId: s.destination.id, notes: s.notes }] : []))} />
        </div>
        {pub.trip.description && <p className="whitespace-pre-wrap text-[15px] leading-6 text-body">{pub.trip.description}</p>}

        <section className={panel} aria-label="Progress">
          <h2 className="text-xl font-extrabold">Progress</h2>
          <p className="mb-3 text-sm text-muted">{pub.progress.completed} of {pub.progress.total} stops completed, as marked by the traveler</p>
          <ProgressBar percent={pub.progress.percent} />
          <p className="mt-3 text-xs text-muted">Stops are marked by the traveler. They are not verified by location.</p>
        </section>

        <section className={panel} aria-label="Itinerary">
          <h2 className="mb-3 text-xl font-extrabold">Itinerary</h2>
          <ol>
            {stops.map((s, i) => (
              <li key={s.id} className="flex items-center gap-3.5 border-t border-line py-3 first:border-0">
                <StopNumber n={i + 1} done={s.status === 'completed'} next={i === nextIdx} />
                <Scene category="hills" className="size-14 shrink-0 rounded-xl" label={false} />
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-bold">{s.destination.slug ? <Link href={`/destinations/${s.destination.slug}`}>{s.destination.name}</Link> : s.destination.name}</div>
                  <div className="text-xs text-muted">{[s.destination.region, s.destination.country].filter(Boolean).join(', ')}</div>
                  {s.notes && <p className="mt-0.5 text-sm text-body">{s.notes}</p>}
                </div>
                <StatusPill done={s.status === 'completed'} next={i === nextIdx} skipped={s.status === 'skipped'} />
              </li>
            ))}
          </ol>
        </section>
      </div>

      <aside aria-label="About this trip" className="flex flex-col gap-4 lg:sticky lg:top-24">
        <div className="flex flex-col gap-2.5 rounded-[20px] border border-line bg-surface p-5">
          <h2 className="text-base font-extrabold">What you can see</h2>
          <p className="text-sm leading-[21px] text-body">Stops, dates and posts the traveler chose to share.</p>
          <p className="text-sm leading-[21px] text-body">You cannot see exact locations, live position or private journal entries.</p>
        </div>
        <MapView markers={markers} route={route} path={markers.map((m) => [m.lat, m.lng] as [number, number])} dashedPath className="h-[240px] rounded-[20px]" />
        {route && <p className="text-xs text-muted">The orange line is a simplified route preview the traveler chose to publish. It is not their exact recorded path.</p>}
        <div className="flex flex-col gap-2.5 rounded-[20px] border border-line bg-surface p-5">
          <h2 className="text-sm font-extrabold">Something wrong?</h2>
          <LinkButton href={`/report?type=trip&id=${pub.trip.id}`} variant="secondary" className="h-11 border-control text-ink hover:bg-fill">Report this trip</LinkButton>
        </div>
        <Notice>This page shows only the planned itinerary the owner chose to make public. Recorded GPS data and private posts are never included.</Notice>
      </aside>
    </article>
  );
}

// --------------------------------------------------------------------- owner / member page (uuid)
async function PrivateTrip({ id, searchParams }: { id: string } & Params) {
  const user = await requireUser(`/trips/${id}`);
  const sp = await searchParams;
  const db = await createServerSupabase();
  const data = await tripsApi(db).get(id);
  if (!data) notFound();
  const { trip, stops, members } = data;
  const me = members.find((m) => m.user_id === user.id);
  const isOwner = trip.owner_id === user.id;
  const canEdit = isOwner || me?.role === 'editor';
  const tab = ['itinerary', 'map', 'journeys', 'posts', 'journal', 'people'].includes(sp.tab ?? '') ? (sp.tab as string) : 'itinerary';
  const progress = tripProgress(stops);

  const [journeys, entries, preview, tripPosts] = await Promise.all([
    journeysApi(db).forTrip(id),
    isOwner || me ? journalApi(db).list(id).then((e) => e.filter((x) => x.user_id === user.id)) : Promise.resolve([]),
    db.from('trip_route_previews').select('encoded_polyline').eq('trip_id', id).maybeSingle(),
    db.from('posts').select('id,caption,post_type,created_at,author:profiles(username)').eq('trip_id', id).eq('publication_status', 'published').order('created_at', { ascending: false }).limit(20),
  ]);
  const markers: MapMarker[] = stops.flatMap((s, i) => {
    const lat = s.destination?.latitude ?? s.custom_latitude; const lng = s.destination?.longitude ?? s.custom_longitude;
    return lat != null && lng != null ? [{ id: s.id, lat, lng, kind: (s.completion_status === 'completed' ? 'completed' : 'planned') as MapMarker['kind'], label: String(i + 1), title: s.destination?.name ?? s.custom_name ?? 'Stop' }] : [];
  });
  const owner = members.find((m) => m.role === 'owner');
  const tabs = [['itinerary', 'Itinerary'], ['map', 'Map'], ['journeys', 'Journeys'], ['posts', 'Posts'], ['journal', 'Journal'], ['people', 'People']] as const;
  const nextIdx = stops.findIndex((s) => s.completion_status === 'planned');
  const nextStop = nextIdx >= 0 ? stops[nextIdx] : undefined;
  const visLabel = trip.visibility === 'public' ? 'Public' : trip.visibility === 'followers' ? 'Followers' : 'Private';

  return (
    <div className="mx-auto max-w-5xl">
      {sp.invite_failed && <div className="mb-3"><Notice tone="warn">Some collaborators could not be invited: {sp.invite_failed}. Check the usernames and invite them from Edit.</Notice></div>}
      <Scene category="mountains" className="h-[180px] rounded-[28px]" label={false} />
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2"><Pill tone={trip.status === 'active' ? 'coral' : trip.status === 'completed' ? 'ok' : trip.status === 'draft' ? 'warn' : 'blue'}>{trip.status[0]!.toUpperCase() + trip.status.slice(1)}</Pill><Pill><Icon name={trip.visibility === 'public' ? 'globe' : trip.visibility === 'followers' ? 'users' : 'lock'} size={12} /> {visLabel}</Pill>{trip.tracking_status === 'recording' && <Pill tone="bad">● Recording</Pill>}</div>
          <h1 className="mt-2 text-[28px] leading-tight font-extrabold tracking-tight text-navy">{trip.title}</h1>
          <p className="text-[13px] text-muted">by @{owner?.profile.username ?? 'unknown'} · {range(trip.start_date, trip.end_date)}</p>
        </div>
        <div className="flex flex-wrap gap-2">{canEdit && <LinkButton href={`/trips/${id}/edit`} variant="secondary">Edit itinerary</LinkButton>}{isOwner && <TripOwnerControls tripId={id} status={trip.status} slug={trip.slug} visibility={trip.visibility} />}</div>
      </div>
      {trip.description && <p className="mt-3 whitespace-pre-wrap text-[15px] leading-6 text-body">{trip.description}</p>}

      <div className="mt-5 flex flex-col gap-2 rounded-2xl border border-line bg-surface px-4 py-3.5">
        <div className="flex items-end justify-between">
          <div className="flex items-baseline gap-2"><span className="tabular text-[40px] leading-[44px] font-extrabold">{progress.completed}</span><span className="tabular text-xl font-semibold text-muted">/ {progress.total}</span><span className="text-[13px] text-muted">stops completed</span></div>
          <div className="tabular text-[22px] font-extrabold text-ok">{progress.percent}%</div>
        </div>
        {progress.total > 0 ? <Segments total={progress.total} done={progress.completed} current={nextIdx >= 0 ? nextIdx : undefined} label="Trip progress" /> : <ProgressBar percent={0} label="Trip progress" />}
        <p className="text-xs text-muted">{nextStop ? `Next: ${nextStop.destination?.name ?? nextStop.custom_name ?? 'Stop'}` : progress.total ? 'All stops are complete.' : 'No stops yet.'}</p>
      </div>

      <nav className="mt-5 flex gap-1 overflow-x-auto border-b border-line" aria-label="Trip sections">{tabs.map(([k, l]) => <Link key={k} href={`/trips/${id}?tab=${k}`} aria-current={tab === k ? 'page' : undefined} className={`border-b-[3px] px-4 py-3 text-sm whitespace-nowrap ${tab === k ? 'border-primary font-bold text-primary' : 'border-transparent font-semibold text-muted'}`}>{l}</Link>)}</nav>

      <div className="mt-5">
        {tab === 'itinerary' && (
          stops.length === 0 ? <p className="rounded-2xl bg-bg p-4 text-muted">No stops yet. {canEdit && <Link className="font-semibold text-primary" href={`/trips/${id}/edit`}>Add destinations</Link>}</p> :
          <ol>{stops.map((s, i) => {
            const done = s.completion_status === 'completed';
            const isNext = i === nextIdx;
            const name = s.destination?.name ?? s.custom_name ?? 'Stop'; const lat = s.destination?.latitude ?? s.custom_latitude; const lng = s.destination?.longitude ?? s.custom_longitude;
            return (
              <li key={s.id} className="flex gap-3.5">
                <div className="flex w-8 flex-col items-center">
                  <StopNumber n={i + 1} done={done} next={isNext} />
                  {i < stops.length - 1 && <span aria-hidden className={`my-0.5 w-0.5 flex-1 ${done ? 'bg-ok' : 'bg-line'}`} />}
                </div>
                <div className="min-w-0 flex-1 pb-5">
                  <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-[15px]">{s.destination?.slug ? <Link href={`/destinations/${s.destination.slug}`}>{name}</Link> : name}</b>
                    <span className={`text-xs font-bold ${done ? 'text-ok' : isNext ? 'text-primary' : 'text-muted'}`}>{done ? 'Completed' : s.completion_status === 'skipped' ? 'Skipped' : isNext ? 'Next stop' : 'Upcoming'}</span></div>
                  <p className="text-xs text-muted">{[s.destination?.region, s.destination?.country].filter(Boolean).join(', ')}{s.planned_arrival_at ? ` · planned ${s.planned_arrival_at.slice(0, 10)}` : ''}{done && s.completed_at ? ` · completed ${s.completed_at.slice(0, 10)}` : ''}{done ? ` · ${s.completion_method === 'gps_assisted' ? 'GPS-assisted' : 'marked manually'}` : ''}</p>
                  {s.notes && <p className="mt-1 text-sm text-body">{s.notes}</p>}
                  {done && s.rating && <p className="text-warn" aria-label={`${s.rating} stars`}>{'★'.repeat(s.rating)}{'☆'.repeat(5 - s.rating)}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {lat != null && lng != null && <a className="text-sm font-semibold text-primary" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`}>Navigate ↗</a>}
                    <StopActions stopId={s.id} completed={done} lat={lat ?? null} lng={lng ?? null} canEdit={canEdit} />
                  </div>
                </div>
              </li>
            );
          })}</ol>
        )}
        {tab === 'map' && <MapView markers={markers} path={markers.map((m) => [m.lat, m.lng] as [number, number])} dashedPath route={preview.data ? decodePolyline(preview.data.encoded_polyline) : undefined} className="h-[480px] rounded-[20px]" showLocate />}
        {tab === 'journeys' && <JourneyPanel tripId={id} journeys={journeys} hasPreview={Boolean(preview.data)} isOwner={isOwner} />}
        {tab === 'posts' && (
          <div>{canEdit && <LinkButton href={`/posts/new?trip=${id}`} className="mb-3">+ Post about this trip</LinkButton>}
            {(tripPosts.data ?? []).length === 0 ? <p className="text-muted">No posts for this trip yet.</p> : <ul className="space-y-2">{(tripPosts.data ?? []).map((p) => <li key={p.id}><Link className="block rounded-2xl border border-line bg-surface p-3.5 hover:border-primary" href={`/posts/${p.id}`}>{p.caption.slice(0, 140) || `(${p.post_type})`}</Link></li>)}</ul>}</div>
        )}
        {tab === 'journal' && (isOwner || me ? <JournalPanel tripId={id} entries={entries} /> : <p className="text-muted">The journal is available to trip members.</p>)}
        {tab === 'people' && (
          <ul className="space-y-2">{members.map((m) => <li key={m.user_id} className="flex items-center justify-between rounded-2xl border border-line bg-surface p-3.5"><Link href={`/u/${m.profile.username}`} className="font-semibold">@{m.profile.username}</Link><span className="flex gap-2"><Pill>{m.role}</Pill>{m.invitation_status !== 'accepted' && <Pill tone="warn">{m.invitation_status}</Pill>}</span></li>)}</ul>
        )}
      </div>
    </div>
  );
}

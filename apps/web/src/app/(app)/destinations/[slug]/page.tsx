import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MapView } from '@/components/maps/MapView';
import { PostCard } from '@/components/PostCard';
import { Scene } from '@/components/Scene';
import { ConfigNotice, LinkButton } from '@/components/ui';
import { supabaseConfigured } from '@/lib/env';
import { enrichPosts } from '@/lib/feed';
import { createAnonSupabase, createServerSupabase, getUser } from '@/lib/supabase/server';
import { DestinationActions } from './DestinationActions';

type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { slug } = await params;
  if (!supabaseConfigured) return { title: 'Destination' };
  const { data } = await createAnonSupabase().from('destinations').select('name,description,region,country').eq('slug', slug).eq('is_published', true).maybeSingle();
  if (!data?.name) return { title: 'Destination not found', robots: { index: false } };
  return { title: data.name, description: (data.description || `Explore ${data.name} on SoloTrav.`).slice(0, 160), alternates: { canonical: `/destinations/${slug}` } };
}

const panel = 'rounded-[20px] border border-line bg-surface p-6';
const cap = (s: string | null) => (s ? s[0]!.toUpperCase() + s.slice(1) : '');

export default async function DestinationPage({ params }: P) {
  const { slug } = await params;
  if (!supabaseConfigured) return <ConfigNotice what="Supabase" vars={['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']} />;
  const db = await createServerSupabase();
  const user = await getUser();
  const { data: d } = await db.from('destinations').select('*').eq('slug', slug).eq('is_published', true).maybeSingle();
  if (!d || !d.name) notFound();

  const [{ data: feedRows }, saved, myTrips, planning, tips] = await Promise.all([
    db.rpc('get_home_feed', { p_scope: 'discover', p_limit: 50 }),
    user ? db.from('saved_items').select('id').eq('user_id', user.id).eq('item_type', 'destination').eq('item_id', d.id).maybeSingle() : Promise.resolve({ data: null }),
    user ? db.from('trips').select('id,title').eq('owner_id', user.id).in('status', ['draft', 'planned', 'active']).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    db.from('trip_stops').select('trip_id', { count: 'exact', head: true }).eq('destination_id', d.id),
    db.from('trip_stops').select('tip,trip:trips(owner_id)').eq('destination_id', d.id).not('tip', 'is', null).limit(5),
  ]);
  const here = ((feedRows ?? []) as Array<{ destination_id: string | null }>).filter((r) => r.destination_id === d.id).slice(0, 6);
  const posts = await enrichPosts(db, here as never, user?.id);
  const markers = d.latitude != null && d.longitude != null ? [{ id: d.id, lat: d.latitude, lng: d.longitude, kind: 'destination' as const, title: d.name }] : [];

  return (
    <article>
      <nav aria-label="Breadcrumb" className="mb-3 text-[13px] text-muted"><Link href="/explore" className="font-semibold text-primary">Explore</Link> / {d.country ?? 'Destinations'}{d.region ? ` / ${d.region}` : ''}</nav>
      <Scene category={d.category} className="h-[240px] rounded-[28px] lg:h-80" />
      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-4xl leading-tight font-extrabold text-navy">{d.name}</h1>
              <p className="mt-1 text-[15px] text-muted">{[cap(d.category), d.region, d.country].filter(Boolean).join(' · ')}</p>
            </div>
            {user ? <DestinationActions destinationId={d.id} slug={slug} saved={Boolean(saved.data)} trips={(myTrips.data ?? []) as Array<{ id: string; title: string }>} /> : <LinkButton href={`/login?next=/destinations/${slug}`}>Log in to save or plan</LinkButton>}
          </header>

          <section className={panel}><h2 className="mb-2 text-xl font-extrabold">About</h2><p className="text-[15px] leading-6 text-body">{d.description || 'No description yet.'}</p></section>

          {(tips.data ?? []).length > 0 && (
            <section className={panel}><h2 className="mb-3 text-xl font-extrabold">Traveler tips</h2><ul className="space-y-2">{(tips.data ?? []).map((t, i) => <li key={i} className="border-t border-line pt-2 text-sm leading-[21px] text-body first:border-0 first:pt-0">“{t.tip}”</li>)}</ul></section>
          )}

          <section className={panel}>
            <h2 className="mb-3 text-xl font-extrabold">Traveler posts</h2>
            {posts.length === 0 ? <p className="text-muted">No posts about this place yet.</p> : <div className="space-y-4">{posts.map((p) => <PostCard key={p.id} post={p} signedIn={Boolean(user)} />)}</div>}
          </section>
        </div>

        <aside aria-label="Destination facts" className="flex flex-col gap-4 lg:sticky lg:top-24">
          <div className="flex flex-col gap-2.5 rounded-[20px] border border-line bg-surface p-5">
            <h2 className="text-base font-extrabold">At a glance</h2>
            {([['Travelers planning', String(planning.count ?? 0)], ['Category', cap(d.category) || '—'], ['Source', d.source === 'curated' ? 'SoloTrav' : 'Google Places']] as const).map(([k, v]) => (
              <div key={k} className="flex justify-between border-t border-line pt-2.5 text-sm"><span className="text-muted">{k}</span><b>{v}</b></div>
            ))}
          </div>
          {markers.length > 0 && (
            <>
              <MapView markers={markers} className="h-[200px] rounded-[20px]" />
              <a className="text-sm font-semibold text-primary" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${d.latitude},${d.longitude}`}>Open in Google Maps ↗</a>
            </>
          )}
          <div className="rounded-2xl border border-ok bg-ok-soft p-3.5 text-[13px] leading-[19px]"><b>About tracking.</b> Visiting a place never records you. Tracking starts only when you start it in a trip.</div>
        </aside>
      </div>
    </article>
  );
}

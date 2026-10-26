import Link from 'next/link';
import { Card, ConfigNotice, EmptyState, Icon, Pill } from '@/components/ui';
import { Scene } from '@/components/Scene';
import { supabaseConfigured } from '@/lib/env';
import { createServerSupabase, getUser } from '@/lib/supabase/server';
import { NearbyButton } from './NearbyButton';

export const metadata = { title: 'Explore' };

const cap = (s: string | null) => (s ? s[0]!.toUpperCase() + s.slice(1) : '');

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string }> }) {
  const sp = await searchParams;
  if (!supabaseConfigured) return <ConfigNotice what="Supabase" vars={['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']} />;
  const db = await createServerSupabase();
  const user = await getUser();
  const q = (sp.q ?? '').trim().slice(0, 100).replace(/[%_]/g, '');

  let query = db.from('destinations').select('id,slug,name,region,country,category,latitude,longitude,is_featured,description').eq('is_published', true).not('name', 'is', null).limit(60);
  if (q) query = query.ilike('normalized_name', `%${q.toLowerCase()}%`);
  if (sp.cat) query = query.eq('category', sp.cat);
  const [dests, cats, trending] = await Promise.all([
    query.order('is_featured', { ascending: false }).order('name'),
    db.from('destination_categories').select('slug,label').order('sort_order'),
    db.rpc('trending_public_trips', { p_limit: 5 }),
  ]);
  const hrefFor = (o: { q?: string; cat?: string }) => { const p = new URLSearchParams(); const nq = 'q' in o ? o.q : q; const nc = 'cat' in o ? o.cat : sp.cat; if (nq) p.set('q', nq); if (nc) p.set('cat', nc); return `/explore${p.size ? `?${p}` : ''}`; };
  const chip = (on: boolean) => `inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold whitespace-nowrap ${on ? 'border-[1.5px] border-primary bg-primary-soft text-primary-pressed' : 'border border-control bg-surface text-ink hover:bg-fill'}`;
  const trips = (trending.data ?? []) as Array<{ id: string; slug: string; title: string; owner_username: string; saves: number }>;

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[1fr_320px]">
      <div className="flex min-w-0 flex-col gap-6">
        <div>
          <h1 className="text-[32px] leading-10 font-extrabold text-navy">{q ? `Results for “${q}”` : 'Explore'}</h1>
          <p className="mt-1 text-[15px] text-muted">Destinations and trips from travelers. Search by name; location is never needed.</p>
        </div>
        <form role="search" className="flex gap-2 lg:hidden">
          {sp.cat && <input type="hidden" name="cat" value={sp.cat} />}
          <input name="q" defaultValue={q} type="search" placeholder="Search destinations or regions" aria-label="Search destinations" className="h-12 flex-1 rounded-xl border border-control bg-surface px-4 outline-none focus:border-primary focus:ring-4 focus:ring-primary/20" />
        </form>
        <div className="flex flex-wrap items-center gap-2.5" role="group" aria-label="Categories">
          <Link href={hrefFor({ cat: undefined })} aria-current={!sp.cat ? 'true' : undefined} className={chip(!sp.cat)}>{!sp.cat && <Icon name="check" size={16} />}All</Link>
          {(cats.data ?? []).map((c) => (
            <Link key={c.slug} href={hrefFor({ cat: c.slug })} aria-current={sp.cat === c.slug ? 'true' : undefined} className={chip(sp.cat === c.slug)}>{sp.cat === c.slug && <Icon name="check" size={16} />}{c.label}</Link>
          ))}
        </div>

        {dests.error ? <p role="alert" className="text-bad">Could not load destinations. Please try again.</p>
          : dests.data?.length === 0 ? <EmptyState title="No destinations match">Try a different search or clear the filters.</EmptyState> : (
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {dests.data?.map((d) => (
              <li key={d.id}>
                <Link href={`/destinations/${d.slug}`} className="block">
                  <Card className="transition hover:border-primary">
                    <div className="relative">
                      <Scene category={d.category} className="h-40" />
                      <span aria-hidden className="absolute top-2.5 right-2.5 flex size-9 items-center justify-center rounded-full bg-white text-[#182230]"><Icon name="bookmark" size={18} /></span>
                    </div>
                    <div className="p-3.5">
                      <div className="flex items-start justify-between gap-2"><h2 className="text-[17px] font-extrabold">{d.name}</h2>{d.is_featured && <Pill tone="coral">Featured</Pill>}</div>
                      <p className="mt-0.5 text-[13px] text-muted">{[cap(d.category), d.region].filter(Boolean).join(' · ')}</p>
                      {d.description ? <p className="mt-2 line-clamp-2 text-[13px] leading-[18px] text-body">{d.description}</p> : null}
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <aside aria-label="Trending itineraries" className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px]">
          <h2 className="text-base font-extrabold">Trending itineraries</h2>
          {trips.length === 0 ? <p className="text-sm text-muted">No public trips yet. Be the first to publish one.</p> : trips.map((t) => (
            <Link key={t.id} href={`/trips/${t.slug}`} className="flex items-center gap-3">
              <Scene category="mountains" className="size-14 shrink-0 rounded-xl" label={false} />
              <span><span className="block text-sm font-bold">{t.title}</span><span className="block text-xs text-muted">by @{t.owner_username}{t.saves ? ` · ${t.saves} saves` : ''}</span></span>
            </Link>
          ))}
        </div>
        <NearbyButton places={(dests.data ?? []).filter((d) => d.latitude != null).map((d) => ({ slug: d.slug as string, name: d.name as string, lat: d.latitude as number, lng: d.longitude as number }))} />
        <Link href={user ? '/trips/new' : '/signup'} className="block rounded-[20px] bg-navy p-[18px] text-white">
          <span className="block text-base font-extrabold">Plan your next trip</span>
          <span className="mt-1 block text-[13px] leading-[19px] text-[#d6e2f0]">Save places, then turn them into an itinerary.</span>
        </Link>
      </aside>
    </div>
  );
}

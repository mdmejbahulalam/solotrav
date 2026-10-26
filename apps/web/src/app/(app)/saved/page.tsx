import Link from 'next/link';
import { EmptyState, LinkButton } from '@/components/ui';
import { Scene } from '@/components/Scene';
import { Card } from '@/components/ui';
import { createServerSupabase, requireUser } from '@/lib/supabase/server';
import { NewCollection } from './NewCollection';
import { UnsaveButton } from './UnsaveButton';

export const metadata = { title: 'Saved' };

export default async function SavedPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser('/saved');
  const sp = await searchParams;
  const tab = sp.tab === 'trip' || sp.tab === 'post' ? sp.tab : 'destination';
  const db = await createServerSupabase();
  const [{ data: items }, { data: collections }] = await Promise.all([
    db.from('saved_items').select('id,item_id,collection_id,created_at').eq('user_id', user.id).eq('item_type', tab).order('created_at', { ascending: false }).limit(60),
    db.from('collections').select('id,title,visibility').eq('owner_id', user.id).order('created_at', { ascending: false }),
  ]);
  const ids = (items ?? []).map((i) => i.item_id);
  let rows: Array<{ id: string; title: string; subtitle?: string; href: string; category?: string | null }> = [];
  if (ids.length) {
    if (tab === 'destination') rows = ((await db.from('destinations').select('id,slug,name,region,category').in('id', ids)).data ?? []).map((d) => ({ id: d.id, title: d.name ?? 'Destination', subtitle: d.region ?? '', href: `/destinations/${d.slug}`, category: d.category }));
    else if (tab === 'trip') rows = ((await db.from('trips').select('id,slug,title,visibility').in('id', ids)).data ?? []).map((t) => ({ id: t.id, title: t.title, subtitle: t.visibility, href: `/trips/${t.visibility === 'public' ? t.slug : t.id}` }));
    else rows = ((await db.from('posts').select('id,caption').in('id', ids)).data ?? []).map((p) => ({ id: p.id, title: p.caption.slice(0, 80) || 'Post', href: `/posts/${p.id}` }));
  }
  // saved items whose target is no longer accessible simply don't resolve (RLS) and are listed as unavailable
  const missing = ids.length - rows.length;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between"><h1 className="text-2xl font-extrabold text-navy">Saved</h1><NewCollection /></div>
      {(collections ?? []).length > 0 && <div className="mb-4 flex flex-wrap gap-2">{(collections ?? []).map((c) => <Link key={c.id} href={`/collections/${c.id}`} className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold hover:border-primary">📁 {c.title}</Link>)}</div>}
      <div className="mb-4 flex gap-1 border-b border-line" role="tablist">{([['destination', 'Destinations'], ['trip', 'Trips & itineraries'], ['post', 'Posts']] as const).map(([k, l]) => <Link key={k} href={`/saved?tab=${k}`} role="tab" aria-selected={tab === k} className={`border-b-[3px] px-4 py-3 font-semibold ${tab === k ? 'border-primary text-primary' : 'border-transparent text-muted'}`}>{l}</Link>)}</div>
      {rows.length === 0 ? <EmptyState title="Nothing saved yet" action={<LinkButton href="/explore" variant="secondary">Explore</LinkButton>}>Tap the star on destinations, trips and posts to keep them here.</EmptyState> : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <li key={r.id}><Card>{tab === 'destination' && <Scene category={r.category} className="h-24" label={false} />}<div className="flex items-center justify-between gap-2 p-3"><Link href={r.href} className="min-w-0"><b className="block truncate text-navy">{r.title}</b>{r.subtitle && <span className="text-sm text-muted">{r.subtitle}</span>}</Link><UnsaveButton type={tab} id={r.id} /></div></Card></li>
          ))}
        </ul>
      )}
      {missing > 0 && <p className="mt-3 text-sm text-muted">{missing} saved item{missing > 1 ? 's are' : ' is'} no longer available.</p>}
    </div>
  );
}

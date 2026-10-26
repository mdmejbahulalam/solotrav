import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState, Pill } from '@/components/ui';
import { createServerSupabase, getUser } from '@/lib/supabase/server';

export const metadata = { title: 'Collection' };

export default async function CollectionPage({ params }: { params: Promise<{ collectionId: string }> }) {
  const { collectionId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(collectionId)) notFound();
  const db = await createServerSupabase();
  const user = await getUser();
  const { data: c } = await db.from('collections').select('id,owner_id,title,description,visibility').eq('id', collectionId).maybeSingle();
  if (!c) notFound(); // RLS: private collections of other people look like they don't exist
  const isOwner = user?.id === c.owner_id;
  const { data: items } = isOwner ? await db.from('saved_items').select('id,item_type,item_id').eq('collection_id', collectionId) : { data: [] };

  const byType = (t: string) => (items ?? []).filter((i) => i.item_type === t).map((i) => i.item_id);
  const [dest, trips, posts] = await Promise.all([
    byType('destination').length ? db.from('destinations').select('id,slug,name,region').in('id', byType('destination')) : { data: [] },
    byType('trip').length ? db.from('trips').select('id,slug,title,visibility').in('id', byType('trip')) : { data: [] },
    byType('post').length ? db.from('posts').select('id,caption').in('id', byType('post')) : { data: [] },
  ]);

  return (
    <div>
      <div className="mb-1 flex items-center gap-2"><h1 className="text-2xl font-extrabold text-navy">{c.title}</h1><Pill>{c.visibility}</Pill></div>
      {c.description && <p className="mb-4 text-muted">{c.description}</p>}
      {!isOwner ? <p className="text-sm text-muted">Items inside a collection are only listed for its owner.</p> : (dest.data?.length || trips.data?.length || posts.data?.length) ? (
        <ul className="space-y-2">
          {(dest.data ?? []).map((d) => <li key={d.id}><Link className="block rounded-xl border border-line bg-surface p-3 hover:border-primary" href={`/destinations/${d.slug}`}>◎ <b>{d.name}</b> <span className="text-sm text-muted">{d.region}</span></Link></li>)}
          {(trips.data ?? []).map((t) => <li key={t.id}><Link className="block rounded-xl border border-line bg-surface p-3 hover:border-primary" href={`/trips/${t.visibility === 'public' ? t.slug : t.id}`}>⇢ <b>{t.title}</b></Link></li>)}
          {(posts.data ?? []).map((p) => <li key={p.id}><Link className="block rounded-xl border border-line bg-surface p-3 hover:border-primary" href={`/posts/${p.id}`}>✎ {p.caption.slice(0, 80) || 'Post'}</Link></li>)}
        </ul>
      ) : <EmptyState title="This collection is empty">Items you save can be filed into collections from your Saved page.</EmptyState>}
    </div>
  );
}

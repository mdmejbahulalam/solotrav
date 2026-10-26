import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MapView } from '@/components/maps/MapView';
import { PostCard } from '@/components/PostCard';
import { Scene } from '@/components/Scene';
import { Avatar, Card, ConfigNotice, EmptyState, LinkButton, Pill } from '@/components/ui';
import { supabaseConfigured } from '@/lib/env';
import { enrichPosts } from '@/lib/feed';
import { createAnonSupabase, createServerSupabase, getUser } from '@/lib/supabase/server';
import { ProfileActions } from './ProfileActions';

type P = { params: Promise<{ username: string }>; searchParams: Promise<{ tab?: string }> };

export async function generateMetadata({ params }: Pick<P, 'params'>): Promise<Metadata> {
  const { username } = await params;
  if (!supabaseConfigured) return { title: `@${username}` };
  // anon client: private accounts are invisible, so they get no metadata and are not indexed
  const { data } = await createAnonSupabase().from('profiles').select('display_name,bio,account_visibility').ilike('username', username).maybeSingle();
  if (!data) return { title: `@${username}`, robots: { index: false, follow: false } };
  return { title: `${data.display_name} (@${username})`, description: (data.bio || `${data.display_name} on SoloTrav`).slice(0, 160), alternates: { canonical: `/u/${username}` } };
}

export default async function ProfilePage({ params, searchParams }: P) {
  const { username } = await params;
  const sp = await searchParams;
  if (!supabaseConfigured) return <ConfigNotice what="Supabase" vars={['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']} />;
  const db = await createServerSupabase();
  const viewer = await getUser();
  if (!/^[a-z0-9_]{3,30}$/i.test(username)) notFound();

  const { data: p } = await db.from('profiles').select('*').ilike('username', username).maybeSingle();
  if (!p) {
    // A private account is not readable, but a minimal card lets people send a follow request.
    const { data: card } = await db.rpc('get_profile_card', { p_username: username });
    const c = (card as Array<{ id: string; username: string; display_name: string; avatar_url: string | null }> | null)?.[0];
    if (!c) notFound();
    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <Avatar name={c.display_name} src={c.avatar_url} size={80} /><h1 className="mt-3 text-2xl font-extrabold text-navy">{c.display_name}</h1><p className="text-muted">@{c.username}</p>
        <p className="my-4 text-sm text-muted">🔒 This account is private. Follow to see their trips and posts.</p>
        {viewer ? <ProfileActions targetId={c.id} username={c.username} initialState="none" isPrivate /> : <LinkButton href={`/login?next=/u/${c.username}`}>Log in to follow</LinkButton>}
      </div>
    );
  }

  const isOwn = viewer?.id === p.id;
  const [followers, following, rel, tripsRes, postsRes, visited] = await Promise.all([
    db.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', p.id).eq('status', 'accepted'),
    db.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', p.id).eq('status', 'accepted'),
    viewer && !isOwn ? db.from('follows').select('status').eq('follower_id', viewer.id).eq('following_id', p.id).maybeSingle() : Promise.resolve({ data: null }),
    db.from('trips').select('id,slug,title,status,visibility,start_date').eq('owner_id', p.id).in('status', ['planned', 'active', 'completed']).order('created_at', { ascending: false }).limit(12),
    db.from('posts').select('id').eq('author_id', p.id).eq('publication_status', 'published').order('created_at', { ascending: false }).limit(20),
    db.from('trip_stops').select('id,completed_at,destination:destinations(slug,name,region,latitude,longitude,category),trip:trips!inner(owner_id,visibility)').eq('completion_status', 'completed').eq('trip.owner_id', p.id).order('completed_at', { ascending: false }).limit(60),
  ]);

  const tab = ['posts', 'trips', 'visited'].includes(sp.tab ?? '') ? (sp.tab as string) : 'posts';
  const postIds = (postsRes.data ?? []).map((x) => x.id);
  let posts: Awaited<ReturnType<typeof enrichPosts>> = [];
  if (tab === 'posts' && postIds.length) {
    const { data: rows } = await db.rpc('get_profile_posts', { p_user: p.id, p_limit: 20 });
    posts = await enrichPosts(db, (rows ?? []) as never, viewer?.id);
  }
  const visitedRows = (visited.data ?? []) as unknown as Array<{ id: string; completed_at: string; destination: { slug: string | null; name: string | null; region: string | null; latitude: number | null; longitude: number | null; category: string | null } | null; trip: { visibility: string } }>;
  // Visited places are shown publicly only for trips the owner made public/visible to this viewer (RLS already filters the trip rows).
  const visitedPlaces = visitedRows.filter((v) => v.destination?.name);
  const relState = !rel.data ? 'none' : (rel.data as { status: string }).status === 'pending' ? 'pending' : 'following';

  return (
    <div>
      <Scene category="hills" className="h-36 rounded-2xl" label={false} />
      <div className="relative -mt-10 px-4"><div className="flex flex-wrap items-end justify-between gap-3">
        <div className="rounded-full border-4 border-bg bg-bg"><Avatar name={p.display_name} src={p.avatar_url} size={84} /></div>
        {isOwn ? <LinkButton href="/settings" variant="secondary">Edit profile &amp; settings</LinkButton> : viewer ? <ProfileActions targetId={p.id} username={p.username} initialState={relState} isPrivate={p.account_visibility === 'private'} /> : <LinkButton href={`/login?next=/u/${p.username}`}>Log in to follow</LinkButton>}
      </div></div>
      <div className="mt-3 px-4">
        <h1 className="text-2xl font-extrabold text-navy">{p.display_name}</h1>
        <p className="text-muted">@{p.username}{p.home_region ? ` · 📍 ${p.home_region}` : ''}{p.account_visibility === 'private' ? ' · 🔒 Private' : ''}</p>
        {p.bio && <p className="mt-2">{p.bio}</p>}
        {p.travel_interests.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{p.travel_interests.map((i: string) => <Pill key={i} tone="blue">{i}</Pill>)}</div>}
        <div className="mt-4 grid max-w-md grid-cols-4 gap-2 text-center">
          {[['Posts', postIds.length], ['Followers', followers.count ?? 0], ['Following', following.count ?? 0], ['Places', visitedPlaces.length]].map(([l, n]) => <Card key={String(l)} className="p-2"><div className="text-lg font-extrabold text-navy">{n}</div><div className="text-xs text-muted">{l}</div></Card>)}
        </div>
        <p className="mt-2 text-xs text-muted">“Places” counts destinations the owner marked as completed. These are self-reported, not verified visits.</p>
      </div>

      <nav className="mt-5 flex gap-1 border-b border-line" aria-label="Profile sections">{([['posts', 'Posts'], ['trips', 'Trips'], ['visited', 'Visited places']] as const).map(([k, l]) => <Link key={k} href={`/u/${p.username}?tab=${k}`} aria-current={tab === k ? 'page' : undefined} className={`border-b-[3px] px-4 py-3 font-semibold ${tab === k ? 'border-primary text-primary' : 'border-transparent text-muted'}`}>{l}</Link>)}</nav>
      <div className="mt-5">
        {tab === 'posts' && (posts.length ? <div className="max-w-2xl">{posts.map((x) => <PostCard key={x.id} post={x} signedIn={Boolean(viewer)} />)}</div> : <EmptyState title="No posts yet">{isOwn ? 'Share your first travel moment.' : 'Nothing posted yet.'}</EmptyState>)}
        {tab === 'trips' && ((tripsRes.data ?? []).length ? <ul className="grid gap-3 sm:grid-cols-2">{(tripsRes.data ?? []).map((t) => <li key={t.id}><Link href={`/trips/${t.visibility === 'public' ? t.slug : t.id}`} className="block rounded-2xl border border-line bg-surface p-4 hover:border-primary"><b className="text-navy">{t.title}</b><br /><span className="text-sm text-muted">{t.status} · {t.visibility}</span></Link></li>)}</ul> : <EmptyState title="No visible trips">{isOwn ? 'Create and publish a trip to show it here.' : 'No public trips yet.'}</EmptyState>)}
        {tab === 'visited' && (visitedPlaces.length ? (
          <div className="space-y-4"><MapView markers={visitedPlaces.filter((v) => v.destination?.latitude != null).map((v) => ({ id: v.id, lat: v.destination!.latitude as number, lng: v.destination!.longitude as number, kind: 'completed' as const, title: v.destination!.name as string }))} className="h-[360px]" />
            <ul className="grid gap-2 sm:grid-cols-2">{visitedPlaces.map((v) => <li key={v.id}><Link className="block rounded-xl border border-line bg-surface p-3 hover:border-primary" href={`/destinations/${v.destination!.slug}`}><b>{v.destination!.name}</b><br /><span className="text-sm text-muted">{v.destination!.region} · completed {v.completed_at.slice(0, 10)}</span></Link></li>)}</ul></div>
        ) : <EmptyState title="No visited places yet">Completed destinations appear here.</EmptyState>)}
      </div>
    </div>
  );
}

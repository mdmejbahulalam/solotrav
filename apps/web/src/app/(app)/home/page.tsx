import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Avatar, Card, ConfigNotice, LinkButton } from '@/components/ui';
import { FeedList } from '@/components/FeedList';
import { Scene } from '@/components/Scene';
import { supabaseConfigured } from '@/lib/env';
import { enrichPosts } from '@/lib/feed';
import { createServerSupabase, requireUser } from '@/lib/supabase/server';
import { pageOf } from '@solotrav/business-logic';

export const metadata = { title: 'Home' };

export default async function HomePage() {
  const user = await requireUser('/home');
  if (!supabaseConfigured) return <ConfigNotice what="Supabase" vars={['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']} />;
  const db = await createServerSupabase();

  const { data: me } = await db.from('profiles').select('onboarded_at, travel_interests').eq('id', user.id).single();
  if (me && !me.onboarded_at) redirect('/onboarding');

  const LIMIT = 10;
  let scope: 'following' | 'discover' = 'following';
  let { data: rows } = await db.rpc('get_home_feed', { p_scope: scope, p_limit: LIMIT + 1 });
  if (!rows?.length) { scope = 'discover'; ({ data: rows } = await db.rpc('get_home_feed', { p_scope: scope, p_limit: LIMIT + 1 })); }
  const page = pageOf(((rows ?? []) as Array<{ post_id: string; created_at: string }>).map((r) => ({ ...r, id: r.post_id })), LIMIT);
  const posts = await enrichPosts(db, page.items as never, user.id);

  const [suggest, destinations, trending] = await Promise.all([
    db.rpc('suggest_users', { p_limit: 4 }),
    db.from('destinations').select('id,slug,name,region,category').eq('is_published', true).not('name', 'is', null).order('is_featured', { ascending: false }).limit(6),
    db.rpc('trending_public_trips', { p_limit: 4 }),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        <section className="relative mb-6 overflow-hidden rounded-[20px] bg-[#102a43] p-6 text-white">
          <svg aria-hidden width="120" height="120" viewBox="0 0 120 120" className="absolute -top-2.5 -right-2.5 opacity-35"><path d="M10 100 C 30 40, 70 110, 110 20" fill="none" stroke="#19B5A5" strokeWidth="5" strokeDasharray="2 10" strokeLinecap="round" /><circle cx="110" cy="20" r="8" fill="#FF7657" /></svg>
          <p className="text-xs font-bold tracking-[.08em] text-[#7fe0d4]">YOUR NEXT JOURNEY</p>
          <h1 className="mt-1.5 text-[22px] leading-7 font-extrabold">Plan it, track it, share it.</h1>
          <p className="mt-1.5 mb-4 max-w-md text-sm leading-5 text-[#d5dce6]">Add stops, preview the route, then record the real journey in the Android app. Location stays off until you choose.</p>
          <LinkButton href="/trips/new" variant="coral">+ Create a trip</LinkButton>
        </section>

        <section aria-labelledby="sugg-dest">
          <div className="mb-2.5 flex items-baseline justify-between"><h2 id="sugg-dest" className="text-[17px] font-bold">Suggested for you</h2><Link href="/explore" className="text-[13px] font-semibold text-primary">See all</Link></div>
          <div className="mb-6 flex gap-3 overflow-x-auto pb-2">
            {(destinations.data ?? []).map((d) => (
              <Link key={d.id} href={`/destinations/${d.slug}`} className="w-56 shrink-0">
                <Card className="rounded-2xl"><Scene category={d.category} className="h-[120px]" /><div className="px-3 pt-2.5 pb-3"><b className="text-base">{d.name}</b><div className="text-[13px] text-muted">{[d.region, d.category ? d.category[0]!.toUpperCase() + d.category.slice(1) : null].filter(Boolean).join(' · ')}</div></div></Card>
              </Link>
            ))}
          </div>
        </section>

        <h2 className="mb-2.5 text-[17px] font-bold">{scope === 'following' ? 'From travelers you follow' : 'Popular travel posts'}</h2>
        <FeedList initial={posts} initialCursor={page.nextCursor} scope={scope} userId={user.id} emptyAction={<LinkButton href="/posts/new">Create a post</LinkButton>} />
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start" aria-label="Suggestions">
        <Card>
          <h2 className="px-4 pt-4 text-base font-bold text-navy">People to follow</h2>
          {(suggest.data as Array<{ id: string; username: string; display_name: string; avatar_url: string | null }> | null ?? []).length === 0 && <p className="p-4 text-sm text-muted">No suggestions right now.</p>}
          <ul>
            {(suggest.data as Array<{ id: string; username: string; display_name: string; avatar_url: string | null }> | null ?? []).map((p) => (
              <li key={p.id}><Link href={`/u/${p.username}`} className="flex items-center gap-3 px-4 py-3 hover:bg-primary-soft"><Avatar name={p.display_name} src={p.avatar_url} /><span><b>{p.display_name}</b><br /><span className="text-sm text-muted">@{p.username}</span></span></Link></li>
            ))}
          </ul>
        </Card>
        <Card className="p-4">
          <h2 className="mb-2 text-base font-bold text-navy">Trending public trips</h2>
          {(trending.data as Array<{ id: string; slug: string; title: string; owner_username: string }> | null ?? []).map((t) => (
            <Link key={t.id} href={`/trips/${t.slug}`} className="block rounded-lg py-2 hover:text-primary"><b>{t.title}</b><br /><span className="text-sm text-muted">by @{t.owner_username}</span></Link>
          ))}
          {!(trending.data as unknown[] | null)?.length && <p className="text-sm text-muted">No public trips yet.</p>}
        </Card>
      </aside>
    </div>
  );
}

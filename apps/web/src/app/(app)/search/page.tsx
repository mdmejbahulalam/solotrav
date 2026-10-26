import Link from 'next/link';
import { Avatar, ConfigNotice, EmptyState, Notice } from '@/components/ui';
import { supabaseConfigured } from '@/lib/env';
import { createServerSupabase } from '@/lib/supabase/server';
import { searchQuerySchema } from '@solotrav/validation';

export const metadata = { title: 'Search' };

type Hit = { kind: string; id: string; title: string; subtitle: string | null; handle: string | null; score: number };
const KINDS = [['all', 'All'], ['destination', 'Destinations'], ['trip', 'Trips'], ['profile', 'Travelers'], ['post', 'Posts'], ['hashtag', 'Hashtags']] as const;

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string; page?: string }> }) {
  const sp = await searchParams;
  const kind = KINDS.some(([k]) => k === sp.kind) ? (sp.kind as string) : 'all';
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const parsed = searchQuerySchema.safeParse(sp.q ?? '');
  const PER = 15;

  let hits: Hit[] = []; let failed = false;
  if (parsed.success && supabaseConfigured) {
    const db = await createServerSupabase();
    const { data, error } = await db.rpc('search_all', { p_query: parsed.data, p_kind: kind, p_limit: PER + 1, p_offset: page * PER });
    if (error) failed = true; else hits = (data ?? []) as Hit[]; // visibility and blocks are enforced by RLS inside search_all
  }
  const more = hits.length > PER; hits = hits.slice(0, PER);
  const href = (o: { kind?: string; page?: number }) => `/search?q=${encodeURIComponent(parsed.success ? parsed.data : sp.q ?? '')}&kind=${o.kind ?? kind}&page=${o.page ?? 0}`;
  const link = (h: Hit) => h.kind === 'destination' ? `/destinations/${h.handle}` : h.kind === 'trip' ? `/trips/${h.handle}` : h.kind === 'profile' ? `/u/${h.handle}` : h.kind === 'post' ? `/posts/${h.id}` : `/search?q=${encodeURIComponent('#' + h.handle)}&kind=post`;

  return (
    <div>
      <h1 className="mb-3 text-2xl font-extrabold text-navy">Search</h1>
      {!supabaseConfigured && <ConfigNotice what="Supabase" vars={['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']} />}
      <form role="search" className="mb-3 flex gap-2"><input name="q" defaultValue={sp.q ?? ''} type="search" aria-label="Search" placeholder="Destinations, trips, travelers, #tags" className="min-h-11 flex-1 rounded-xl border-[1.5px] border-line bg-surface px-4 outline-none focus:border-primary" /><button className="min-h-11 rounded-xl bg-primary px-5 font-bold text-white">Search</button></form>
      <div className="mb-4 flex gap-2 overflow-x-auto">{KINDS.map(([k, l]) => <Link key={k} href={href({ kind: k })} className={`rounded-full border-[1.5px] px-4 py-2 text-sm font-semibold whitespace-nowrap ${kind === k ? 'border-primary bg-primary text-white' : 'border-line bg-surface'}`}>{l}</Link>)}</div>
      {!sp.q ? <EmptyState title="Search SoloTrav">Find destinations, public trips, travelers and hashtags. Type at least 2 characters.</EmptyState>
        : !parsed.success ? <Notice>Type at least 2 characters.</Notice>
        : failed ? <Notice tone="error">Search is temporarily unavailable. Please try again.</Notice>
        : hits.length === 0 ? <EmptyState title={`No results for “${parsed.data}”`}>Check the spelling or try a broader search.</EmptyState> : (
        <>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {hits.map((h) => (
              <li key={`${h.kind}-${h.id}`}><Link href={link(h)} className="flex items-center gap-3 px-4 py-3 hover:bg-primary-soft">
                {h.kind === 'profile' ? <Avatar name={h.title} size={36} /> : <span aria-hidden className="flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary">{h.kind === 'destination' ? '◎' : h.kind === 'trip' ? '⇢' : h.kind === 'hashtag' ? '#' : '✎'}</span>}
                <span className="min-w-0"><b className="block truncate">{h.title}</b><span className="text-sm text-muted">{h.kind}{h.subtitle ? ` · ${h.subtitle}` : ''}</span></span>
              </Link></li>
            ))}
          </ul>
          <div className="mt-4 flex justify-between text-sm font-semibold">{page > 0 ? <Link className="text-primary" href={href({ page: page - 1 })}>← Previous</Link> : <span />}{more && <Link className="text-primary" href={href({ page: page + 1 })}>Next →</Link>}</div>
        </>
      )}
    </div>
  );
}

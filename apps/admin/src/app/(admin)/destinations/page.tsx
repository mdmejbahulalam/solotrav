import { Pill } from '@/components/ui';
import { PAGE, Pager, Table, Td, pageOf } from '@/components/Table';
import { requireStaff } from '@/lib/supabase/server';
import { DestinationForm, type DestRow } from './DestinationForm';

export const metadata = { title: 'Destinations' };

export default async function DestinationsPage({ searchParams }: { searchParams: Promise<{ page?: string; edit?: string; q?: string }> }) {
  const sp = await searchParams;
  const { db } = await requireStaff('destinations.manage');
  const page = pageOf(sp.page);
  let q = db.from('destinations').select('id,slug,name,description,country,region,latitude,longitude,category,is_published,is_featured,source').order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE);
  if (sp.q) q = q.ilike('normalized_name', `%${sp.q.toLowerCase().replace(/[%_]/g, '')}%`);
  const [{ data }, { data: cats }] = await Promise.all([q, db.from('destination_categories').select('slug,label').order('sort_order')]);
  const rows = (data ?? []) as DestRow[];
  const editing = sp.edit ? rows.find((r) => r.id === sp.edit) ?? null : null;
  return (
    <div>
      <h1 className="mb-3 text-2xl font-extrabold text-navy">Destinations</h1>
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div>
          <form role="search" className="mb-3 flex gap-2"><input name="q" defaultValue={sp.q ?? ''} aria-label="Search destinations" placeholder="Search" className="min-h-11 flex-1 rounded-xl border-[1.5px] border-line bg-surface px-4" /><button className="min-h-11 rounded-xl bg-primary px-5 font-bold text-white">Search</button></form>
          <Table head={['Destination', 'Category', 'Status', '']} empty="No destinations.">
            {rows.slice(0, PAGE).map((d) => (
              <tr key={d.id}><Td><b>{d.name ?? <i className="text-muted">cache expired</i>}</b><div className="text-muted">{[d.region, d.country].filter(Boolean).join(', ')}</div></Td><Td>{d.category ?? '—'}</Td>
                <Td><span className="flex flex-wrap gap-1"><Pill tone={d.is_published ? 'ok' : 'warn'}>{d.is_published ? 'published' : 'hidden'}</Pill>{d.is_featured && <Pill tone="coral">featured</Pill>}<Pill>{d.source === 'curated' ? 'curated' : 'google'}</Pill></span></Td>
                <Td>{d.source === 'curated' && <a className="font-semibold text-primary" href={`/destinations?edit=${d.id}`}>Edit</a>}</Td></tr>
            ))}
          </Table>
          <Pager base={`/destinations?q=${encodeURIComponent(sp.q ?? '')}`} page={page} hasMore={rows.length > PAGE} />
        </div>
        <DestinationForm key={editing?.id ?? 'new'} initial={editing} categories={(cats ?? []) as Array<{ slug: string; label: string }>} />
      </div>
    </div>
  );
}

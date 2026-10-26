import { Notice, Pill } from '@/components/ui';
import { PAGE, Pager, Table, Td, pageOf } from '@/components/Table';
import { requireStaff } from '@/lib/supabase/server';

export const metadata = { title: 'Trips' };

export default async function TripsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  const { db } = await requireStaff('content.remove');
  const page = pageOf(sp.page);
  const { data } = await db.rpc('admin_list_public_trips', { p_limit: PAGE + 1, p_offset: page * PAGE });
  const rows = (data ?? []) as Array<{ id: string; slug: string; title: string; owner_username: string; status: string; stops: number; published_at: string | null }>;
  return (
    <div>
      <h1 className="mb-3 text-2xl font-extrabold text-navy">Trips</h1>
      <div className="mb-4"><Notice>Only public, published trips are listed. Private, followers-only and draft trips, journals and recorded routes are not available to staff.</Notice></div>
      <Table head={['Trip', 'Owner', 'Status', 'Stops', 'Published']} empty="No public trips.">
        {rows.slice(0, PAGE).map((t) => (
          <tr key={t.id}><Td><b>{t.title}</b><div className="text-xs text-muted">/trips/{t.slug}</div></Td><Td>@{t.owner_username}</Td><Td><Pill tone="blue">{t.status}</Pill></Td><Td>{t.stops}</Td><Td>{t.published_at ? new Date(t.published_at).toLocaleDateString() : '—'}</Td></tr>
        ))}
      </Table>
      <Pager base="/trips" page={page} hasMore={rows.length > PAGE} />
    </div>
  );
}

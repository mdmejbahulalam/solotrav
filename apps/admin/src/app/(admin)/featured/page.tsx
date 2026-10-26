import { Pill } from '@/components/ui';
import { QuickRpc } from '@/components/QuickRpc';
import { Table, Td } from '@/components/Table';
import { requireStaff } from '@/lib/supabase/server';

export const metadata = { title: 'Featured content' };

export default async function FeaturedPage() {
  const { db } = await requireStaff('featured.manage');
  const { data } = await db.from('destinations').select('id,name,region,is_featured,is_published').eq('source', 'curated').order('is_featured', { ascending: false }).order('name').limit(100);
  return (
    <div>
      <h1 className="mb-1 text-2xl font-extrabold text-navy">Featured content</h1>
      <p className="mb-4 text-sm text-muted">Featured destinations appear first on Explore and on the landing page.</p>
      <Table head={['Destination', 'Status', 'Featured', '']} empty="No curated destinations.">
        {(data ?? []).map((d) => <tr key={d.id}><Td><b>{d.name}</b><div className="text-muted">{d.region}</div></Td><Td><Pill tone={d.is_published ? 'ok' : 'warn'}>{d.is_published ? 'published' : 'hidden'}</Pill></Td><Td>{d.is_featured ? <Pill tone="coral">featured</Pill> : '—'}</Td>
          <Td><QuickRpc rpc="admin_set_featured" args={{ p_type: 'destination', p_item: d.id, p_active: !d.is_featured, p_position: 0 }} label={d.is_featured ? 'Remove from featured' : 'Feature'} variant={d.is_featured ? 'ghost' : 'primary'} /></Td></tr>)}
      </Table>
    </div>
  );
}

import { Pill } from '@/components/ui';
import { RpcAction } from '@/components/RpcAction';
import { Table, Td } from '@/components/Table';
import { requireStaff } from '@/lib/supabase/server';

export const metadata = { title: 'Hashtags' };

export default async function HashtagsPage() {
  const { db } = await requireStaff('hashtags.manage');
  const { data } = await db.rpc('admin_list_hashtags', { p_limit: 100 });
  const rows = (data ?? []) as Array<{ tag: string; uses: number; is_blocked: boolean }>;
  return (
    <div>
      <h1 className="mb-1 text-2xl font-extrabold text-navy">Hashtags</h1>
      <p className="mb-4 text-sm text-muted">Blocked hashtags disappear from search and suggestions. Counts only; no post content is shown here.</p>
      <Table head={['Hashtag', 'Posts', 'Status', 'Actions']} empty="No hashtags yet.">
        {rows.map((h) => <tr key={h.tag}><Td><b>#{h.tag}</b></Td><Td>{h.uses}</Td><Td><Pill tone={h.is_blocked ? 'bad' : 'ok'}>{h.is_blocked ? 'blocked' : 'active'}</Pill></Td>
          <Td>{h.is_blocked ? <RpcAction rpc="admin_set_hashtag_blocked" args={{ p_tag: h.tag }} extra={{ p_blocked: false }} reasonArg="p_reason" label="Unblock" title={`Unblock #${h.tag}`} /> : <RpcAction rpc="admin_set_hashtag_blocked" args={{ p_tag: h.tag }} extra={{ p_blocked: true }} reasonArg="p_reason" label="Block" variant="danger" title={`Block #${h.tag}`} />}</Td></tr>)}
      </Table>
    </div>
  );
}

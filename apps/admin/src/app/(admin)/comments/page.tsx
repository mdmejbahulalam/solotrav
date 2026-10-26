import { Pill } from '@/components/ui';
import { RpcAction } from '@/components/RpcAction';
import { PAGE, Pager, Table, Td, pageOf } from '@/components/Table';
import { requireStaff } from '@/lib/supabase/server';

export const metadata = { title: 'Comments' };

export default async function CommentsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  const { db } = await requireStaff('comments.moderate');
  const page = pageOf(sp.page);
  const { data } = await db.rpc('admin_list_recent_comments', { p_limit: PAGE + 1, p_offset: page * PAGE });
  const rows = (data ?? []) as Array<{ id: string; author_username: string; body: string; status: string; created_at: string }>;
  return (
    <div>
      <h1 className="mb-3 text-2xl font-extrabold text-navy">Comments</h1>
      <Table head={['Comment', 'Author', 'Status', 'Date', 'Actions']} empty="No comments on public posts.">
        {rows.slice(0, PAGE).map((c) => (
          <tr key={c.id}>
            <Td className="max-w-md break-words">{c.body}</Td><Td>@{c.author_username}</Td><Td><Pill tone={c.status === 'visible' ? 'ok' : 'warn'}>{c.status}</Pill></Td><Td>{new Date(c.created_at).toLocaleDateString()}</Td>
            <Td>
              <span className="flex gap-2">
                {c.status === 'visible'
                  ? <RpcAction rpc="admin_moderate_comment" args={{ p_comment: c.id }} extra={{ p_status: 'hidden' }} reasonArg="p_reason" label="Hide" title="Hide comment" />
                  : <RpcAction rpc="admin_moderate_comment" args={{ p_comment: c.id }} extra={{ p_status: 'visible' }} reasonArg="p_reason" label="Restore" title="Restore comment" />}
                {c.status !== 'removed' && <RpcAction rpc="admin_moderate_comment" args={{ p_comment: c.id }} extra={{ p_status: 'removed' }} reasonArg="p_reason" label="Remove" variant="danger" title="Remove comment" />}
              </span>
            </Td>
          </tr>
        ))}
      </Table>
      <Pager base="/comments" page={page} hasMore={rows.length > PAGE} />
    </div>
  );
}

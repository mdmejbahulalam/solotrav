import { Pill } from '@/components/ui';
import { RpcAction } from '@/components/RpcAction';
import { PAGE, Pager, Table, Td, pageOf } from '@/components/Table';
import { requireStaff } from '@/lib/supabase/server';

export const metadata = { title: 'Posts' };

export default async function PostsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  const { db } = await requireStaff('content.remove');
  const page = pageOf(sp.page);
  const { data } = await db.rpc('admin_list_public_posts', { p_limit: PAGE + 1, p_offset: page * PAGE });
  const rows = (data ?? []) as Array<{ id: string; author_username: string; caption: string; publication_status: string; created_at: string }>;
  return (
    <div>
      <h1 className="mb-1 text-2xl font-extrabold text-navy">Posts</h1>
      <p className="mb-4 text-sm text-muted">Only public posts are listed. Private and followers-only posts are visible to staff only when they have been reported.</p>
      <Table head={['Post', 'Author', 'Status', 'Date', 'Actions']} empty="No public posts.">
        {rows.slice(0, PAGE).map((p) => (
          <tr key={p.id}>
            <Td className="max-w-md">{p.caption || <span className="text-muted">(media only)</span>}</Td><Td>@{p.author_username}</Td>
            <Td><Pill tone={p.publication_status === 'published' ? 'ok' : 'bad'}>{p.publication_status}</Pill></Td><Td>{new Date(p.created_at).toLocaleDateString()}</Td>
            <Td>{p.publication_status === 'published' && <RpcAction rpc="admin_remove_post" args={{ p_post: p.id }} reasonArg="p_reason" label="Remove" variant="danger" title="Remove post" />}</Td>
          </tr>
        ))}
      </Table>
      <Pager base="/posts" page={page} hasMore={rows.length > PAGE} />
    </div>
  );
}

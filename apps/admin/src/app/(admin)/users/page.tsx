import { Pill } from '@/components/ui';
import { RpcAction } from '@/components/RpcAction';
import { PAGE, Pager, Table, Td, pageOf } from '@/components/Table';
import { requireStaff } from '@/lib/supabase/server';

export const metadata = { title: 'Users' };

type U = { id: string; username: string; display_name: string; account_status: string; created_at: string; roles: string[] };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const sp = await searchParams;
  const { staff, db } = await requireStaff('users.read');
  const page = pageOf(sp.page);
  const { data, error } = await db.rpc('admin_list_users', { p_search: (sp.q ?? '').slice(0, 60), p_limit: PAGE + 1, p_offset: page * PAGE });
  const rows = (data ?? []) as U[];
  const canSuspend = staff.permissions.includes('users.suspend');
  return (
    <div>
      <h1 className="mb-3 text-2xl font-extrabold text-navy">Users</h1>
      <form role="search" className="mb-4 flex gap-2">
        <input name="q" defaultValue={sp.q ?? ''} aria-label="Search users" placeholder="Search username or display name" className="min-h-11 flex-1 rounded-xl border-[1.5px] border-line bg-surface px-4 outline-none focus:border-primary" />
        <button className="min-h-11 rounded-xl bg-primary px-5 font-bold text-white">Search</button>
      </form>
      {error && <p role="alert" className="text-bad">Could not load users: {error.message}</p>}
      <Table head={['User', 'Roles', 'Status', 'Joined', 'Actions']} empty="No users match your search.">
        {rows.slice(0, PAGE).map((u) => (
          <tr key={u.id}>
            <Td><b>{u.display_name}</b><div className="text-muted">@{u.username}</div></Td>
            <Td>{u.roles.length ? u.roles.map((r) => <Pill key={r} tone="blue">{r}</Pill>) : <span className="text-muted">—</span>}</Td>
            <Td><Pill tone={u.account_status === 'active' ? 'ok' : 'bad'}>{u.account_status}</Pill></Td>
            <Td>{new Date(u.created_at).toLocaleDateString()}</Td>
            <Td>
              {canSuspend && u.id !== staff.id && (u.account_status === 'active'
                ? <RpcAction rpc="admin_set_account_status" args={{ p_user: u.id }} extra={{ p_status: 'suspended' }} reasonArg="p_reason" label="Suspend" variant="danger" title={`Suspend @${u.username}`} />
                : u.account_status === 'suspended'
                  ? <RpcAction rpc="admin_set_account_status" args={{ p_user: u.id }} extra={{ p_status: 'active' }} reasonArg="p_reason" label="Restore" title={`Restore @${u.username}`} />
                  : null)}
            </Td>
          </tr>
        ))}
      </Table>
      <Pager base={`/users?q=${encodeURIComponent(sp.q ?? '')}`} page={page} hasMore={rows.length > PAGE} />
    </div>
  );
}

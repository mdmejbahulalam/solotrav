import { Pill } from '@/components/ui';
import { RpcAction } from '@/components/RpcAction';
import { Table, Td } from '@/components/Table';
import { requireStaff } from '@/lib/supabase/server';
import { GrantRole } from './GrantRole';

export const metadata = { title: 'Roles & permissions' };

const ROLE_DESC: Record<string, string> = {
  support: 'Read users and reports. Cannot change anything.',
  content_moderator: 'Review reports, remove posts and moderate comments.',
  content_manager: 'Manage destinations, featured content, hashtags and read analytics.',
  administrator: 'Moderation plus suspensions, platform settings and audit log access.',
  super_administrator: 'Everything, including role assignment and audited access to sensitive location data.',
};

export default async function RolesPage() {
  const { staff, db } = await requireStaff('roles.manage');
  const [{ data: assigns }, { data: perms }] = await Promise.all([
    db.from('role_assignments').select('user_id,role,created_at,profile:profiles!role_assignments_user_id_fkey(username,display_name)').order('created_at'),
    db.from('role_permissions').select('role,permission').order('permission'),
  ]);
  const rows = (assigns ?? []) as unknown as Array<{ user_id: string; role: string; created_at: string; profile: { username: string; display_name: string } | null }>;
  const byRole = new Map<string, string[]>();
  for (const p of (perms ?? []) as Array<{ role: string; permission: string }>) byRole.set(p.role, [...(byRole.get(p.role) ?? []), p.permission]);
  return (
    <div className="space-y-8">
      <div><h1 className="mb-1 text-2xl font-extrabold text-navy">Roles &amp; permissions</h1><p className="text-sm text-muted">Roles live in the database and are enforced by it. Granting and revoking are audited and need a reason.</p></div>
      <section><h2 className="mb-2 text-lg font-bold text-navy">Staff</h2>
        <Table head={['Staff member', 'Role', 'Since', '']} empty="No staff assigned.">
          {rows.map((r) => <tr key={`${r.user_id}${r.role}`}><Td><b>{r.profile?.display_name}</b><div className="text-muted">@{r.profile?.username}</div></Td><Td><Pill tone="blue">{r.role}</Pill></Td><Td>{new Date(r.created_at).toLocaleDateString()}</Td>
            <Td>{!(r.user_id === staff.id && r.role === 'super_administrator') && <RpcAction rpc="admin_revoke_role" args={{ p_user: r.user_id }} extra={{ p_role: r.role }} reasonArg="p_reason" label="Revoke" variant="danger" title={`Revoke ${r.role} from @${r.profile?.username}`} />}</Td></tr>)}
        </Table></section>
      <section><h2 className="mb-2 text-lg font-bold text-navy">Grant a role</h2><GrantRole roles={Object.keys(ROLE_DESC)} /></section>
      <section><h2 className="mb-2 text-lg font-bold text-navy">Role definitions</h2>
        <div className="grid gap-3 md:grid-cols-2">{Object.entries(ROLE_DESC).map(([r, d]) => <div key={r} className="rounded-2xl border border-line bg-surface p-4"><b className="text-navy">{r}</b><p className="text-sm text-muted">{d}</p><p className="mt-2 flex flex-wrap gap-1">{(byRole.get(r) ?? []).map((p) => <code key={p} className="rounded bg-bg px-1.5 py-0.5 text-xs">{p}</code>)}</p></div>)}</div></section>
    </div>
  );
}

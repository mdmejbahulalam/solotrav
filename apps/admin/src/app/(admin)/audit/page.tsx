import { PAGE, Pager, Table, Td, pageOf } from '@/components/Table';
import { requireStaff } from '@/lib/supabase/server';

export const metadata = { title: 'Audit logs' };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string; action?: string }> }) {
  const sp = await searchParams;
  const { db } = await requireStaff('audit.read');
  const page = pageOf(sp.page);
  let q = db.from('audit_logs').select('id,action,target_type,target_id,reason,created_at,actor:profiles(username)').order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE);
  if (sp.action) q = q.ilike('action', `${sp.action.replace(/[%_]/g, '')}%`);
  const { data } = await q;
  const rows = (data ?? []) as unknown as Array<{ id: number; action: string; target_type: string | null; target_id: string | null; reason: string | null; created_at: string; actor: { username: string } | null }>;
  return (
    <div>
      <h1 className="mb-1 text-2xl font-extrabold text-navy">Audit logs</h1>
      <p className="mb-3 text-sm text-muted">Every staff action and any exceptional access to sensitive data is recorded here. Entries cannot be edited from this app.</p>
      <form className="mb-4 flex gap-2"><input name="action" defaultValue={sp.action ?? ''} aria-label="Filter by action prefix" placeholder="Filter by action, e.g. account. or sensitive." className="min-h-11 flex-1 rounded-xl border-[1.5px] border-line bg-surface px-4" /><button className="min-h-11 rounded-xl bg-primary px-5 font-bold text-white">Filter</button></form>
      <Table head={['When', 'Staff', 'Action', 'Target', 'Reason']} empty="No audit entries.">
        {rows.slice(0, PAGE).map((l) => <tr key={l.id}><Td>{new Date(l.created_at).toLocaleString()}</Td><Td>@{l.actor?.username ?? 'unknown'}</Td><Td><code>{l.action}</code></Td><Td>{l.target_type}{l.target_id ? `: ${l.target_id.slice(0, 18)}` : ''}</Td><Td className="max-w-xs break-words">{l.reason}</Td></tr>)}
      </Table>
      <Pager base={`/audit?action=${encodeURIComponent(sp.action ?? '')}`} page={page} hasMore={rows.length > PAGE} />
    </div>
  );
}

import Link from 'next/link';
import { Pill } from '@/components/ui';
import { RpcAction } from '@/components/RpcAction';
import { PAGE, Pager, Table, Td, pageOf } from '@/components/Table';
import { requireStaff } from '@/lib/supabase/server';

export const metadata = { title: 'Reports & moderation' };

type R = { id: string; target_type: string; target_id: string; reason: string; detail: string; status: string; created_at: string; reporter_username: string | null; preview: string | null; resolution_note: string | null };
const STATUSES = ['open', 'reviewing', 'resolved', 'dismissed'] as const;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const sp = await searchParams;
  const { staff, db } = await requireStaff('reports.read');
  const status = (STATUSES as readonly string[]).includes(sp.status ?? '') ? (sp.status as string) : 'open';
  const page = pageOf(sp.page);
  const { data } = await db.rpc('admin_report_queue', { p_status: status, p_limit: PAGE + 1, p_offset: page * PAGE });
  const rows = (data ?? []) as R[];
  const canResolve = staff.permissions.includes('reports.resolve');
  const canRemove = staff.permissions.includes('content.remove');
  return (
    <div>
      <h1 className="text-[26px] leading-8 font-extrabold text-navy">Moderation queue</h1>
      <p className="mt-0.5 mb-4 text-[13px] text-muted">Every action is written to the audit log with your reason.</p>
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Report status">{STATUSES.map((s) => <Link key={s} href={`/reports?status=${s}`} aria-current={status === s ? 'true' : undefined} className={`inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold capitalize ${status === s ? 'border-[1.5px] border-primary bg-primary-soft text-primary-pressed' : 'border border-control bg-surface'}`}>{s}</Link>)}</nav>
      <div className="mb-4 rounded-xl border border-ok bg-ok-soft p-3 text-xs leading-[17px]"><b>Privacy boundary.</b> Moderators see the reported item and basic account status. Location history and private journals are not available here.</div>
      <Table head={['Reported', 'Reason', 'Reporter', 'Date', 'Note / actions']} empty={`No ${status} reports.`}>
        {rows.slice(0, PAGE).map((r) => (
          <tr key={r.id}>
            <Td className="max-w-sm"><Pill tone="coral">{r.target_type}</Pill><p className="mt-1 break-words">{r.preview ?? <span className="text-muted">(content no longer available)</span>}</p></Td>
            <Td><b>{r.reason.replace('_', ' ')}</b>{r.detail && <p className="text-muted">{r.detail}</p>}</Td>
            <Td>@{r.reporter_username ?? 'deleted'}</Td><Td>{new Date(r.created_at).toLocaleDateString()}</Td>
            <Td>
              {r.resolution_note && <p className="mb-1 text-muted">Note: {r.resolution_note}</p>}
              {canResolve && (r.status === 'open' || r.status === 'reviewing') && (
                <span className="flex flex-wrap gap-2">
                  {r.status === 'open' && <RpcAction rpc="admin_resolve_report" args={{ p_report: r.id }} extra={{ p_status: 'reviewing' }} reasonArg="p_note" label="Start review" title="Start review" variant="ghost" />}
                  {canRemove && r.target_type === 'post' && <RpcAction rpc="admin_remove_post" args={{ p_post: r.target_id }} reasonArg="p_reason" label="Remove post" variant="danger" title="Remove reported post" />}
                  {canRemove && r.target_type === 'comment' && <RpcAction rpc="admin_moderate_comment" args={{ p_comment: r.target_id }} extra={{ p_status: 'removed' }} reasonArg="p_reason" label="Remove comment" variant="danger" title="Remove reported comment" />}
                  <RpcAction rpc="admin_resolve_report" args={{ p_report: r.id }} extra={{ p_status: 'resolved' }} reasonArg="p_note" label="Resolve" title="Resolve report" variant="primary" />
                  <RpcAction rpc="admin_resolve_report" args={{ p_report: r.id }} extra={{ p_status: 'dismissed' }} reasonArg="p_note" label="Dismiss" title="Dismiss report" />
                </span>
              )}
            </Td>
          </tr>
        ))}
      </Table>
      <Pager base={`/reports?status=${status}`} page={page} hasMore={rows.length > PAGE} />
    </div>
  );
}

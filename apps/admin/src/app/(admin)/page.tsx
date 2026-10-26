import Link from 'next/link';
import { Notice } from '@/components/ui';
import { requireStaff } from '@/lib/supabase/server';

export const metadata = { title: 'Overview' };

const LABELS: Array<[string, string]> = [
  ['registered_users', 'Registered users'], ['public_trips', 'Public trips'], ['open_reports', 'Open reports'], ['new_users_7d', 'New registrations (7 days)'],
  ['active_users_7d', 'Active users (7 days)'], ['published_posts', 'Published posts'], ['journeys_started', 'Journey sessions'], ['journeys_completed', 'Journeys completed'],
];
const KIND_STYLE: Record<string, string> = { post: 'bg-[#fde8e2] text-[#9a3412]', comment: 'bg-[#fde8e2] text-[#9a3412]', profile: 'bg-[#fff4d6] text-[#8a5a00]', trip: 'bg-primary-soft text-primary-pressed', message: 'bg-[#fff4d6] text-[#8a5a00]' };

function ago(iso: string) {
  const h = (Date.now() - Date.parse(iso)) / 3_600_000;
  return h < 1 ? 'now' : h < 24 ? `${Math.floor(h)} h` : `${Math.floor(h / 24)} d`;
}

export default async function Overview({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const sp = await searchParams;
  const { staff, db } = await requireStaff();
  const canStats = staff.permissions.includes('analytics.read');
  const stats = canStats ? ((await db.rpc('admin_overview_stats')).data as Record<string, number> | null) : null;
  const series = canStats ? (((await db.rpc('admin_analytics_series', { p_days: 14 })).data ?? []) as Array<{ day: string; event_name: string; events: number }>) : [];
  const queue = staff.permissions.includes('reports.read')
    ? (((await db.rpc('admin_report_queue', { p_status: 'open', p_limit: 5 })).data ?? []) as Array<{ id: string; target_type: string; reason: string; preview: string | null; created_at: string }>)
    : [];

  const perDay = new Map<string, number>();
  for (const r of series) perDay.set(r.day, (perDay.get(r.day) ?? 0) + Number(r.events));
  const days = [...perDay.keys()].sort();
  const max = Math.max(1, ...perDay.values());

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] leading-8 font-extrabold text-navy">Overview</h1>
          <p className="mt-0.5 text-[13px] text-muted">Live counts from the database. Journey figures are session counts only; staff cannot see routes or locations.</p>
        </div>
      </div>
      {sp.denied && <Notice tone="warn">Your role does not include that section.</Notice>}

      {stats ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {LABELS.map(([k, l]) => (
            <div key={k} className="rounded-2xl border border-line bg-surface p-4">
              <div className="text-[13px] text-muted">{l}</div>
              <div className="tabular mt-1 text-[28px] leading-9 font-extrabold text-navy">{(stats[k] ?? 0).toLocaleString()}</div>
            </div>
          ))}
        </div>
      ) : <Notice>Your role does not include platform statistics.</Notice>}

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        {canStats && (
          <section className="rounded-2xl border border-line bg-surface p-5" aria-label="Activity">
            <h2 className="text-base font-extrabold">Product events per day</h2>
            <p className="mb-3 text-xs text-muted">Last 14 days. Aggregate counts only; events never carry coordinates or free text.</p>
            {days.length === 0 ? <p className="py-8 text-center text-sm text-muted">No events recorded in this period yet.</p> : (
              <>
                <div role="img" aria-label="Bar chart of product events per day" className="flex h-[170px] items-end gap-2.5 border-b border-line">
                  {days.map((d) => { const v = perDay.get(d) ?? 0; return (
                    <div key={d} className="flex h-full flex-1 flex-col items-center justify-end gap-1"><span className="tabular text-[11px] text-muted">{v}</span><div className="w-full rounded-t-md bg-primary" style={{ height: `${Math.max(3, (v / max) * 130)}px` }} /></div>
                  ); })}
                </div>
                <div className="mt-1.5 flex gap-2.5">{days.map((d) => <div key={d} className="flex-1 text-center text-[11px] text-muted">{d.slice(5)}</div>)}</div>
              </>
            )}
          </section>
        )}
        {staff.permissions.includes('reports.read') && (
          <section className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-5" aria-label="Needs attention">
            <h2 className="text-base font-extrabold">Needs attention</h2>
            {queue.length === 0 ? <p className="py-4 text-sm text-muted">No open reports. Nice.</p> : queue.map((r) => (
              <Link key={r.id} href="/reports" className="flex items-center gap-2.5 border-t border-line pt-2.5">
                <span className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold capitalize ${KIND_STYLE[r.target_type] ?? 'bg-fill text-body'}`}>{r.target_type}</span>
                <span className="min-w-0 flex-1 truncate text-[13px]">{r.preview ?? r.reason.replace('_', ' ')}</span>
                <span className="text-xs text-muted">{ago(r.created_at)}</span>
              </Link>
            ))}
            <Link href="/reports" className="mt-auto flex h-11 items-center justify-center rounded-xl bg-primary text-sm font-bold text-white hover:bg-primary-pressed">Open moderation queue</Link>
          </section>
        )}
      </div>
    </>
  );
}

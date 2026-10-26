import { Notice } from '@/components/ui';
import { requireStaff } from '@/lib/supabase/server';

export const metadata = { title: 'Analytics' };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const sp = await searchParams;
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const { db } = await requireStaff('analytics.read');
  const { data } = await db.rpc('admin_analytics_series', { p_days: days });
  const rows = (data ?? []) as Array<{ day: string; event_name: string; events: number }>;
  const events = [...new Set(rows.map((r) => r.event_name))].sort();
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.event_name, (totals.get(r.event_name) ?? 0) + Number(r.events));
  const dayList = [...new Set(rows.map((r) => r.day))].sort();
  const max = Math.max(1, ...rows.map((r) => Number(r.events)));
  const cell = (d: string, e: string) => Number(rows.find((r) => r.day === d && r.event_name === e)?.events ?? 0);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-extrabold text-navy">Analytics</h1>
      <p className="mb-3 text-sm text-muted">Aggregate product events from the database. Events never contain coordinates, names or free text. Retention is set in Platform settings (default 400 days).</p>
      <div className="mb-4 flex gap-2">{[7, 30, 90].map((d) => <a key={d} href={`/analytics?days=${d}`} className={`rounded-full border-[1.5px] px-4 py-2 text-sm font-semibold ${days === d ? 'border-primary bg-primary text-white' : 'border-line bg-surface'}`}>{d} days</a>)}</div>
      {rows.length === 0 ? <Notice>No analytics events recorded in this period yet.</Notice> : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">{events.map((e) => <div key={e} className="rounded-2xl border border-line bg-surface p-4"><div className="text-2xl font-extrabold text-navy">{totals.get(e)}</div><div className="text-sm text-muted">{e.replace(/_/g, ' ')}</div></div>)}</div>
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full text-sm"><caption className="sr-only">Events per day</caption>
              <thead><tr className="bg-bg text-left text-xs text-muted uppercase"><th scope="col" className="px-3 py-2">Day</th>{events.map((e) => <th key={e} scope="col" className="px-3 py-2">{e.replace(/_/g, ' ')}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">{dayList.map((d) => <tr key={d}><th scope="row" className="px-3 py-2 text-left font-medium">{d}</th>{events.map((e) => { const v = cell(d, e); return <td key={e} className="px-3 py-2"><span className="inline-block h-2 rounded bg-primary align-middle" style={{ width: `${Math.max(2, (v / max) * 60)}px`, opacity: v ? 1 : 0.15 }} /> <span className="ml-1">{v}</span></td>; })}</tr>)}</tbody></table>
          </div>
        </>
      )}
    </div>
  );
}

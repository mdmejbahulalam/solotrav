import Link from 'next/link';
import type { ReactNode } from 'react';

export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: string }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full text-sm">
        <thead><tr className="bg-bg text-left text-xs font-bold tracking-[.06em] text-muted uppercase">{head.map((h) => <th key={h} scope="col" className="px-4 py-3">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{hasRows ? children : <tr><td colSpan={head.length} className="px-4 py-10 text-center text-muted">{empty ?? 'Nothing to show.'}</td></tr>}</tbody>
      </table>
    </div>
  );
}
export const Td = ({ children, className = '' }: { children: ReactNode; className?: string }) => <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;

export function Pager({ base, page, hasMore }: { base: string; page: number; hasMore: boolean }) {
  const href = (p: number) => `${base}${base.includes('?') ? '&' : '?'}page=${p}`;
  return (
    <nav className="mt-4 flex items-center justify-between text-sm font-semibold" aria-label="Pagination">
      {page > 0 ? <Link className="text-primary" href={href(page - 1)}>← Previous</Link> : <span />}
      <span className="text-muted">Page {page + 1}</span>
      {hasMore ? <Link className="text-primary" href={href(page + 1)}>Next →</Link> : <span />}
    </nav>
  );
}
export const PAGE = 20;
export const pageOf = (v: string | undefined) => Math.max(0, Number(v ?? 0) || 0);

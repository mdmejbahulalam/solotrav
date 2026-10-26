import type { ReactNode } from 'react';

export function StaticPage({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-2xl space-y-4 leading-relaxed">
      <h1 className="text-3xl font-extrabold text-navy">{title}</h1>
      {updated && <p className="text-sm text-muted">Last updated {updated}</p>}
      {children}
    </article>
  );
}
export const H2 = ({ children }: { children: ReactNode }) => <h2 className="pt-2 text-xl font-bold text-navy">{children}</h2>;

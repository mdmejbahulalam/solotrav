'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Sidebar links: the current section is a blue pill, the rest are light text on navy. */
export function AdminNav({ items }: { items: Array<{ href: string; label: string }> }) {
  const path = usePathname();
  const on = (href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`));
  return (
    <nav aria-label="Admin sections" className="flex gap-1 overflow-x-auto lg:flex-col">
      {items.map((s) => (
        <Link key={s.href} href={s.href} aria-current={on(s.href) ? 'page' : undefined} className={`flex h-11 shrink-0 items-center rounded-[10px] px-3 text-sm font-semibold whitespace-nowrap ${on(s.href) ? 'bg-primary text-white' : 'text-[#d6e2f0] hover:bg-white/10'}`}>
          {s.label}
        </Link>
      ))}
    </nav>
  );
}

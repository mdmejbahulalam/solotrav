'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from '@/components/ui';

const active = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

/** Desktop top navigation: the current section is blue and bold, others are secondary text. */
export function TopNav({ items }: { items: Array<{ href: string; label: string }> }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="hidden items-center gap-7 text-[15px] lg:flex">
      {items.map((n) => (
        <Link key={n.href} href={n.href} aria-current={active(path, n.href) ? 'page' : undefined} className={active(path, n.href) ? 'font-extrabold text-primary' : 'font-semibold text-muted hover:text-ink'}>
          {n.label}
        </Link>
      ))}
    </nav>
  );
}

/** Mobile bottom bar: five equal cells with the coral Create button in the centre. */
export function BottomNav({ profileHref }: { profileHref: string }) {
  const path = usePathname();
  const cell = (href: string, label: string, icon: IconName) => (
    <Link href={href} aria-current={active(path, href) ? 'page' : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${active(path, href) ? 'text-primary' : 'text-muted'}`}>
      <Icon name={icon} size={24} />
      {label}
    </Link>
  );
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid h-[72px] grid-cols-5 items-center border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Primary">
      {cell('/home', 'Home', 'home')}
      {cell('/explore', 'Explore', 'explore')}
      <Link href="/create" aria-label="Create" className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-coral text-[#102A43]"><Icon name="plus" size={26} /></Link>
      {cell('/trips', 'Trips', 'trips')}
      {cell(profileHref, 'Profile', 'user')}
    </nav>
  );
}

import Link from 'next/link';
import type { ReactNode } from 'react';
import { BottomNav, TopNav } from '@/components/NavLinks';
import { Avatar, buttonClass, Icon } from '@/components/ui';
import { Logo } from '@/components/Logo';
import { SignOutButton } from '@/components/SignOutButton';
import { supabaseConfigured } from '@/lib/env';
import { createServerSupabase, getUser } from '@/lib/supabase/server';

const NAV = [
  { href: '/home', label: 'Home' },
  { href: '/explore', label: 'Explore' },
  { href: '/trips', label: 'Trips' },
  { href: '/saved', label: 'Saved' },
  { href: '/messages', label: 'Messages' },
];

/** Design-system web shell: 72 px top bar (logo, section links, search, create + account) and a bottom bar on phones. */
export async function Shell({ children }: { children: ReactNode }) {
  const user = await getUser();
  let profile: { username: string; display_name: string; avatar_url: string | null } | null = null;
  let unread = 0;
  if (user && supabaseConfigured) {
    const supabase = await createServerSupabase();
    const [p, n] = await Promise.all([
      supabase.from('profiles').select('username,display_name,avatar_url').eq('id', user.id).maybeSingle(),
      supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null),
    ]);
    profile = p.data;
    unread = n.count ?? 0;
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 flex h-[72px] items-center gap-4 border-b border-line bg-surface px-4 lg:gap-8 lg:px-16">
        <Link href={user ? '/home' : '/'} className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight text-navy">
          <Logo size={32} /> SoloTrav
        </Link>
        {user && <TopNav items={NAV} />}
        <form action="/search" role="search" className="ml-auto hidden h-11 w-full max-w-[420px] items-center gap-2 rounded-xl border border-control bg-surface px-3.5 text-sm focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/20 md:flex lg:ml-0 lg:flex-1">
          <Icon name="search" size={18} className="shrink-0 text-muted" />
          <input name="q" type="search" placeholder="Search places, trips, people" aria-label="Search" className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted" />
        </form>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Link href="/search" aria-label="Search" className="flex size-11 items-center justify-center rounded-xl hover:bg-primary-soft md:hidden"><Icon name="search" /></Link>
          {user && profile ? (
            <>
              <Link href="/trips/new" className={buttonClass('primary', 'hidden h-11 px-[18px] text-sm font-bold lg:inline-flex')}>Create trip</Link>
              <Link href="/notifications" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} className="relative flex size-11 items-center justify-center rounded-xl hover:bg-primary-soft">
                <Icon name="bell" />
                {unread > 0 && <span className="absolute top-1.5 right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-surface bg-bad px-1 text-[11px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
              </Link>
              <details className="relative">
                <summary className="flex cursor-pointer list-none items-center" aria-label="Account menu"><Avatar name={profile.display_name} src={profile.avatar_url} size={40} gradient /></summary>
                <div className="absolute top-12 right-0 z-40 w-56 rounded-2xl border border-line bg-surface p-1.5 shadow-[0_8px_24px_rgba(16,42,67,.18)]">
                  <Link className="block rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-primary-soft" href={`/u/${profile.username}`}>Profile</Link>
                  <Link className="block rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-primary-soft" href="/posts/new">New post</Link>
                  <Link className="block rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-primary-soft" href="/messages">Messages</Link>
                  <Link className="block rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-primary-soft" href="/settings">Settings &amp; privacy</Link>
                  <Link className="block rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-primary-soft" href="/help">Help</Link>
                  <SignOutButton />
                </div>
              </details>
            </>
          ) : (
            <>
              <Link href="/login" className="flex h-11 items-center px-3 text-[15px] font-semibold">Log in</Link>
              <Link href="/signup" className={buttonClass('primary', 'h-11 px-5 text-[15px] font-bold')}>Sign up free</Link>
            </>
          )}
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[1400px] px-4 pt-6 pb-28 lg:px-16 lg:pt-8 lg:pb-14">{children}</main>
      {user && <BottomNav profileHref={profile ? `/u/${profile.username}` : '/settings'} />}
    </div>
  );
}

import Link from 'next/link';
import { createServerSupabase, requireUser } from '@/lib/supabase/server';
import { AccountSettings } from './AccountSettings';

export const metadata = { title: 'Account settings' };

export default async function AccountPage() {
  const user = await requireUser('/settings/account');
  const db = await createServerSupabase();
  const { data: del } = await db.from('account_deletion_requests').select('scheduled_for').is('cancelled_at', null).is('completed_at', null).maybeSingle();
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-extrabold text-navy">Settings</h1>
      <nav className="mb-5 flex gap-1 border-b border-line" aria-label="Settings sections">
        {[['/settings', 'Profile'], ['/settings/privacy', 'Privacy & notifications'], ['/settings/account', 'Account']].map(([h, l]) => <Link key={h} href={h as string} aria-current={h === '/settings/account' ? 'page' : undefined} className={`border-b-[3px] px-4 py-3 font-semibold ${h === '/settings/account' ? 'border-primary text-primary' : 'border-transparent text-muted'}`}>{l}</Link>)}
      </nav>
      <AccountSettings email={user.email ?? ''} deletionScheduledFor={del?.scheduled_for ?? null} />
    </div>
  );
}

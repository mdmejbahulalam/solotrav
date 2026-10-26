import Link from 'next/link';
import { createServerSupabase, requireUser } from '@/lib/supabase/server';
import { ProfileSettings } from './ProfileSettings';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const user = await requireUser('/settings');
  const db = await createServerSupabase();
  const { data: p } = await db.from('profiles').select('*').eq('id', user.id).single();
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-extrabold text-navy">Settings</h1>
      <nav className="mb-5 flex gap-1 border-b border-line" aria-label="Settings sections">
        {[['/settings', 'Profile'], ['/settings/privacy', 'Privacy & notifications'], ['/settings/account', 'Account']].map(([h, l]) => <Link key={h} href={h as string} aria-current={h === '/settings' ? 'page' : undefined} className={`border-b-[3px] px-4 py-3 font-semibold ${h === '/settings' ? 'border-primary text-primary' : 'border-transparent text-muted'}`}>{l}</Link>)}
      </nav>
      {p && <ProfileSettings profile={p} />}
    </div>
  );
}

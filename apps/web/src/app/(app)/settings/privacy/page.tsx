import Link from 'next/link';
import { createServerSupabase, requireUser } from '@/lib/supabase/server';
import { PrivacySettings } from './PrivacySettings';

export const metadata = { title: 'Privacy & notifications' };

export default async function PrivacyPage() {
  const user = await requireUser('/settings/privacy');
  const db = await createServerSupabase();
  const [{ data: p }, { data: blocks }, { data: requests }] = await Promise.all([
    db.from('profiles').select('account_visibility,live_location_sharing,notification_prefs').eq('id', user.id).single(),
    db.from('user_blocks').select('blocked_id,blocked:profiles!user_blocks_blocked_id_fkey(username)').eq('blocker_id', user.id),
    db.from('follows').select('follower_id,follower:profiles!follows_follower_id_fkey(username,display_name)').eq('following_id', user.id).eq('status', 'pending'),
  ]);
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-extrabold text-navy">Settings</h1>
      <nav className="mb-5 flex gap-1 border-b border-line" aria-label="Settings sections">
        {[['/settings', 'Profile'], ['/settings/privacy', 'Privacy & notifications'], ['/settings/account', 'Account']].map(([h, l]) => <Link key={h} href={h as string} aria-current={h === '/settings/privacy' ? 'page' : undefined} className={`border-b-[3px] px-4 py-3 font-semibold ${h === '/settings/privacy' ? 'border-primary text-primary' : 'border-transparent text-muted'}`}>{l}</Link>)}
      </nav>
      {p && <PrivacySettings
        initial={{ visibility: p.account_visibility, live: p.live_location_sharing, prefs: p.notification_prefs as Record<string, boolean> }}
        blocked={(blocks ?? []).map((b) => ({ id: b.blocked_id, username: (b.blocked as unknown as { username: string } | null)?.username ?? 'unknown' }))}
        requests={(requests ?? []).map((r) => ({ id: r.follower_id, username: (r.follower as unknown as { username: string; display_name: string } | null)?.username ?? 'unknown' }))} />}
    </div>
  );
}

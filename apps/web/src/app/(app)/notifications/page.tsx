import Link from 'next/link';
import { Avatar, EmptyState } from '@/components/ui';
import { createServerSupabase, requireUser } from '@/lib/supabase/server';
import { MarkAllRead } from './MarkAllRead';

export const metadata = { title: 'Notifications' };

const TEXT: Record<string, string> = {
  follow: 'started following you', follow_request: 'requested to follow you', follow_accepted: 'accepted your follow request', like: 'liked your post',
  comment: 'commented on your post', mention: 'mentioned you', trip_invite: 'invited you to collaborate on a trip', trip_update: 'updated a shared trip', message: 'sent you a message',
};

function href(n: { entity_type: string; entity_id: string | null; notification_type: string }): string {
  if (!n.entity_id) return '/notifications';
  if (n.entity_type === 'post') return `/posts/${n.entity_id}`;
  if (n.entity_type === 'trip') return n.notification_type === 'trip_invite' ? '/trips' : `/trips/${n.entity_id}`;
  if (n.entity_type === 'conversation') return `/messages/${n.entity_id}`;
  return '/notifications';
}

export default async function NotificationsPage() {
  await requireUser('/notifications');
  const db = await createServerSupabase();
  const { data } = await db.from('notifications').select('id,notification_type,entity_type,entity_id,read_at,created_at,actor:profiles!notifications_actor_id_fkey(username,display_name,avatar_url)').order('created_at', { ascending: false }).limit(80);
  const items = data ?? [];
  const unread = items.filter((n) => !n.read_at).length;

  const groups = new Map<string, typeof items>();
  const today = new Date().toDateString(); const yest = new Date(Date.now() - 86_400_000).toDateString();
  for (const n of items) { const d = new Date(n.created_at).toDateString(); const g = d === today ? 'Today' : d === yest ? 'Yesterday' : 'Earlier'; groups.set(g, [...(groups.get(g) ?? []), n]); }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3 flex items-center justify-between"><h1 className="text-2xl font-extrabold text-navy">Notifications</h1>{unread > 0 && <MarkAllRead />}</div>
      {items.length === 0 ? <EmptyState title="You're all caught up">Likes, comments, follows and trip invitations will show up here.</EmptyState> : [...groups.entries()].map(([g, list]) => (
        <section key={g} className="mb-5" aria-label={g}><h2 className="mb-1.5 text-xs font-bold tracking-wide text-muted uppercase">{g}</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {list.map((n) => {
              const a = n.actor as unknown as { username: string; display_name: string; avatar_url: string | null } | null;
              return <li key={n.id}><Link href={href(n)} className={`flex items-start gap-3 px-4 py-3 hover:bg-primary-soft ${n.read_at ? '' : 'bg-primary-soft/60'}`}><Avatar name={a?.display_name ?? '?'} src={a?.avatar_url} size={40} /><span className="min-w-0 flex-1"><b>{a ? `@${a.username}` : 'Someone'}</b> {TEXT[n.notification_type] ?? 'sent a notification'}<br /><time className="text-xs text-muted" dateTime={n.created_at}>{new Date(n.created_at).toLocaleString()}</time></span>{!n.read_at && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-white">New</span>}</Link></li>;
            })}
          </ul></section>
      ))}
      <p className="mt-6 text-sm text-muted">Manage which notifications you receive in <Link className="font-semibold text-primary" href="/settings/privacy">Settings → Notifications</Link>. Push notifications need the mobile app with push configured.</p>
    </div>
  );
}

import Link from 'next/link';
import { Avatar, EmptyState } from '@/components/ui';
import { createServerSupabase, requireUser } from '@/lib/supabase/server';
import { NewMessage } from './NewMessage';

export const metadata = { title: 'Messages' };

export default async function MessagesPage() {
  const user = await requireUser('/messages');
  const db = await createServerSupabase();
  const { data: convs } = await db.from('conversations').select('id,last_message_at,members:conversation_members(user_id,last_read_at,profile:profiles(username,display_name,avatar_url))').order('last_message_at', { ascending: false, nullsFirst: false });

  const rows = (convs ?? []).map((c) => {
    const members = c.members as unknown as Array<{ user_id: string; last_read_at: string | null; profile: { username: string; display_name: string; avatar_url: string | null } }>;
    const other = members.find((m) => m.user_id !== user.id);
    const mine = members.find((m) => m.user_id === user.id);
    return { id: c.id, other: other?.profile, last: c.last_message_at, unread: Boolean(c.last_message_at && (!mine?.last_read_at || mine.last_read_at < c.last_message_at)) };
  }).filter((r) => r.other);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3 flex items-center justify-between"><h1 className="text-2xl font-extrabold text-navy">Messages</h1></div>
      <NewMessage />
      {rows.length === 0 ? <EmptyState title="No conversations yet">Find a traveler above, or open a profile and tap Message.</EmptyState> : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {rows.map((r) => (
            <li key={r.id}><Link href={`/messages/${r.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-primary-soft"><Avatar name={r.other!.display_name} src={r.other!.avatar_url} size={44} /><span className="min-w-0 flex-1"><b className={r.unread ? 'text-navy' : ''}>{r.other!.display_name}</b><br /><span className="text-sm text-muted">@{r.other!.username}{r.last ? ` · ${new Date(r.last).toLocaleDateString()}` : ''}</span></span>{r.unread && <span aria-label="Unread" className="size-2.5 rounded-full bg-primary" />}</Link></li>
          ))}
        </ul>
      )}
    </div>
  );
}

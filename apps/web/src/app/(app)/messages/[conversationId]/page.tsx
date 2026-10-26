import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerSupabase, requireUser } from '@/lib/supabase/server';
import { Chat } from './Chat';

export const metadata = { title: 'Conversation', robots: { index: false } };

export default async function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const user = await requireUser(`/messages/${conversationId}`);
  if (!/^[0-9a-f-]{36}$/i.test(conversationId)) notFound();
  const db = await createServerSupabase();
  const { data: members } = await db.from('conversation_members').select('user_id,profile:profiles(username,display_name)').eq('conversation_id', conversationId);
  if (!members?.length) notFound(); // RLS: non-members see nothing
  const other = members.find((m) => m.user_id !== user.id)?.profile as unknown as { username: string; display_name: string } | undefined;
  const { data: msgs } = await db.from('messages').select('id,sender_id,body,created_at').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(50);
  await db.from('conversation_members').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', conversationId).eq('user_id', user.id);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3 flex items-center gap-3"><Link href="/messages" aria-label="Back to messages" className="flex size-11 items-center justify-center rounded-xl hover:bg-primary-soft">←</Link><h1 className="text-xl font-extrabold text-navy">{other?.display_name ?? 'Conversation'}</h1>{other && <Link href={`/u/${other.username}`} className="text-sm text-muted">@{other.username}</Link>}</div>
      <p className="mb-3 rounded-xl bg-teal-soft p-3 text-xs">Messages never include your live location. Sharing a place or trip link is always a deliberate action.</p>
      <Chat conversationId={conversationId} userId={user.id} initial={(msgs ?? []).slice().reverse()} />
    </div>
  );
}

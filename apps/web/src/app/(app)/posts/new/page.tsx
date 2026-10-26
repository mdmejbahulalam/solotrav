import { createServerSupabase, requireUser } from '@/lib/supabase/server';
import { Composer } from './Composer';

export const metadata = { title: 'New post' };

export default async function NewPostPage({ searchParams }: { searchParams: Promise<{ trip?: string; dest?: string }> }) {
  const user = await requireUser('/posts/new');
  const sp = await searchParams;
  const db = await createServerSupabase();
  const { data: trips } = await db.from('trips').select('id,title').eq('owner_id', user.id).neq('status', 'archived').order('created_at', { ascending: false });
  return <Composer trips={(trips ?? []) as Array<{ id: string; title: string }>} initialTrip={sp.trip && /^[0-9a-f-]{36}$/i.test(sp.trip) ? sp.trip : ''} />;
}

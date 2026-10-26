import Link from 'next/link';
import { Card } from '@/components/ui';
import { requireUser } from '@/lib/supabase/server';

export const metadata = { title: 'Create' };

export default async function CreatePage() {
  await requireUser('/create');
  const items = [['/trips/new', '⇢', 'New trip', 'Plan stops, dates and who can see it'], ['/posts/new', '📷', 'New post', 'Photos, video, a tip or a story'], ['/trips', '◎', 'Check in', 'Open a trip and mark a destination completed']] as const;
  return (
    <div className="mx-auto max-w-md"><h1 className="mb-1 text-2xl font-extrabold text-navy">Create</h1><p className="mb-4 text-muted">What would you like to share or plan?</p>
      <ul className="space-y-3">{items.map(([h, i, t, d]) => <li key={h}><Link href={h}><Card className="flex items-center gap-4 p-4 transition hover:border-primary"><span aria-hidden className="flex size-12 items-center justify-center rounded-xl bg-primary-soft text-2xl text-primary">{i}</span><span className="flex-1"><b className="text-navy">{t}</b><br /><span className="text-sm text-muted">{d}</span></span>›</Card></Link></li>)}</ul></div>
  );
}

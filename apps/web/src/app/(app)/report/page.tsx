import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/supabase/server';
import { ReportForm } from './ReportForm';

export const metadata = { title: 'Report', robots: { index: false } };

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ type?: string; id?: string }> }) {
  const sp = await searchParams;
  await requireUser(`/report?type=${sp.type ?? ''}&id=${sp.id ?? ''}`);
  if (!['post', 'comment', 'profile', 'trip', 'message'].includes(sp.type ?? '') || !/^[0-9a-f-]{36}$/i.test(sp.id ?? '')) notFound();
  return <ReportForm type={sp.type as 'post'} id={sp.id as string} />;
}

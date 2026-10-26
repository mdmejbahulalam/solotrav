import { requireUser } from '@/lib/supabase/server';
import { TripWizard } from './TripWizard';

export const metadata = { title: 'Create a trip' };

export default async function NewTripPage({ searchParams }: { searchParams: Promise<{ dest?: string }> }) {
  await requireUser('/trips/new');
  const sp = await searchParams;
  return <TripWizard initialDestinationId={sp.dest && /^[0-9a-f-]{36}$/i.test(sp.dest) ? sp.dest : undefined} />;
}

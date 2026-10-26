import { notFound } from 'next/navigation';
import { createServerSupabase, requireUser } from '@/lib/supabase/server';
import { trips as tripsApi } from '@solotrav/api-client';
import { TripWorkspace } from './TripWorkspace';

export const metadata = { title: 'Edit itinerary', robots: { index: false } };

export default async function EditTripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const user = await requireUser(`/trips/${tripId}/edit`);
  if (!/^[0-9a-f-]{36}$/i.test(tripId)) notFound();
  const data = await tripsApi(await createServerSupabase()).get(tripId);
  if (!data) notFound();
  const role = data.members.find((m) => m.user_id === user.id)?.role;
  if (role !== 'owner' && role !== 'editor') notFound(); // viewers and strangers get no editor
  return <TripWorkspace trip={data.trip} initialStops={data.stops} isOwner={role === 'owner'} />;
}

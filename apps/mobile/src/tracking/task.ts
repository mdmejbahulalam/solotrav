import type * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { getActiveSession, insertPoint } from '@/tracking/store';

/**
 * Background location task. MUST be imported at app start (app/_layout.tsx) so it is registered even when the
 * OS wakes the app only to deliver locations. The task persists samples to SQLite and nothing else: it does not
 * touch the network, React state or navigation.
 */
export const LOCATION_TASK = 'solotrav-journey-location';

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const session = await getActiveSession();
  // Only an active, non-paused session may store anything. If the user stopped or paused, samples are dropped.
  if (!session || (session.state !== 'recording' && session.state !== 'acquiring_location')) return;
  for (const l of data.locations) {
    await insertPoint(session.client_session_id, {
      t: l.timestamp, lat: l.coords.latitude, lng: l.coords.longitude, acc: l.coords.accuracy, alt: l.coords.altitude, spd: l.coords.speed != null && l.coords.speed >= 0 ? l.coords.speed : null,
    });
  }
});

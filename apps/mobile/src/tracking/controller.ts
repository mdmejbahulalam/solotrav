import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import { LOCATION_TASK } from '@/tracking/task';
import { createSession, getActiveSession, getSession, updateSession, type LocalSession } from '@/tracking/store';

export type PermissionResult =
  | { ok: true; approximate: boolean }
  | { ok: false; reason: 'denied' | 'blocked' | 'services_off'; canAskAgain: boolean };

/**
 * Foreground location permission only. The foreground service (persistent notification) keeps recording
 * while the screen is off, so ACCESS_BACKGROUND_LOCATION is deliberately NOT requested (least privilege).
 */
export async function ensureLocationPermission(): Promise<PermissionResult> {
  if (!(await Location.hasServicesEnabledAsync())) return { ok: false, reason: 'services_off', canAskAgain: true };
  let p = await Location.getForegroundPermissionsAsync();
  if (p.status !== 'granted') p = await Location.requestForegroundPermissionsAsync();
  if (p.status !== 'granted') return { ok: false, reason: p.canAskAgain ? 'denied' : 'blocked', canAskAgain: p.canAskAgain };
  // Android 12+: the user may grant only "approximate" location. Route recording needs precise.
  const approximate = Boolean((p as unknown as { android?: { accuracy?: string } }).android?.accuracy === 'coarse');
  return { ok: true, approximate };
}

const UPDATE_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.High,
  distanceInterval: 5,       // metres: skip tiny movements to save battery and avoid jitter
  timeInterval: 5000,
  pausesUpdatesAutomatically: false,
  showsBackgroundLocationIndicator: true,
  foregroundService: {
    notificationTitle: 'SoloTrav is recording your journey',
    notificationBody: 'Tap to open. Press Stop in the app to end recording.',
    notificationColor: '#1769FF',
    killServiceOnDestroy: false,
  },
};

async function startUpdates() {
  if (!(await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))) await Location.startLocationUpdatesAsync(LOCATION_TASK, UPDATE_OPTIONS);
}
export async function stopUpdates() {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
}

const uuid = () => Crypto.randomUUID();

/** Starts a journey. Throws a descriptive Error when permission is missing so the UI can explain it. */
export async function startJourney(tripId: string, userId: string): Promise<LocalSession> {
  const existing = await getActiveSession();
  if (existing) throw new Error('A journey is already in progress. Stop it before starting another.');
  const perm = await ensureLocationPermission();
  if (!perm.ok) throw new PermissionError(perm.reason, perm.canAskAgain);
  const session = await createSession({ client_session_id: uuid(), trip_id: tripId, user_id: userId });
  try {
    await startUpdates();
  } catch (e) {
    await updateSession(session.client_session_id, { state: 'stopped', ended_at: Date.now(), finished_remote: 1 });
    throw e;
  }
  return session;
}

export class PermissionError extends Error {
  constructor(public readonly reason: 'denied' | 'blocked' | 'services_off', public readonly canAskAgain: boolean) {
    super(reason === 'services_off' ? 'Location services are turned off on this device.' : reason === 'blocked' ? 'Location permission is blocked. Enable it in system settings.' : 'Location permission was not granted.');
  }
}

export async function pauseJourney(sessionId: string): Promise<void> {
  const s = await getSession(sessionId);
  if (!s || s.state === 'paused' || s.state === 'stopped') return;
  await updateSession(sessionId, { state: 'paused', paused_at: Date.now() });
  await stopUpdates();
}

export async function resumeJourney(sessionId: string): Promise<void> {
  const s = await getSession(sessionId);
  if (!s || s.state !== 'paused') return;
  const perm = await ensureLocationPermission();
  if (!perm.ok) throw new PermissionError(perm.reason, perm.canAskAgain);
  await updateSession(sessionId, { state: 'acquiring_location', paused_ms: s.paused_ms + (s.paused_at ? Math.max(0, Date.now() - s.paused_at) : 0), paused_at: null });
  await startUpdates();
}

/** Stops collection immediately (location updates + foreground service). Safe to call repeatedly; also the emergency stop. */
export async function stopJourney(sessionId: string): Promise<LocalSession | null> {
  await stopUpdates(); // first: nothing may keep collecting even if the DB write below fails
  const s = await getSession(sessionId);
  if (!s) return null;
  if (s.state !== 'stopped') {
    const now = Date.now();
    await updateSession(sessionId, { state: 'stopped', ended_at: now, paused_ms: s.paused_ms + (s.state === 'paused' && s.paused_at ? Math.max(0, now - s.paused_at) : 0), paused_at: null });
  }
  return getSession(sessionId);
}

/**
 * Called on app start. If the database believes a journey is recording but the OS killed the location task
 * (force stop, battery optimisation, reboot), we do NOT pretend it kept recording: it is marked paused so the
 * user can resume or stop it. Points already stored are kept.
 */
export async function reconcileOnLaunch(): Promise<LocalSession | null> {
  const s = await getActiveSession();
  if (!s) { await stopUpdates(); return null; }
  const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
  if (!running && (s.state === 'recording' || s.state === 'acquiring_location')) {
    await updateSession(s.client_session_id, { state: 'paused', paused_at: Date.now() });
    return getSession(s.client_session_id);
  }
  return s;
}

export function activeElapsedMs(s: LocalSession, now = Date.now()): number {
  const end = s.ended_at ?? now;
  const pausedNow = s.state === 'paused' && s.paused_at ? Math.max(0, end - s.paused_at) : 0;
  return Math.max(0, end - s.started_at - s.paused_ms - pausedNow);
}

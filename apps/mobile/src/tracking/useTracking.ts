import NetInfo from '@react-native-community/netinfo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { computeJourneyStats, isCollectingLocation, transition, type TrackingEvent } from '@solotrav/business-logic';
import type { GpsPoint, TrackingState } from '@solotrav/shared-types';
import { activeElapsedMs, pauseJourney, PermissionError, resumeJourney, startJourney, stopJourney } from '@/tracking/controller';
import { allPoints, counts, getActiveSession, type LocalSession } from '@/tracking/store';
import { syncAll } from '@/tracking/sync';

export interface TrackingView {
  state: TrackingState;
  session: LocalSession | null;
  elapsedMs: number;
  distanceM: number;
  pointCount: number;
  pendingCount: number;
  lastFixAgeMs: number | null;
  lastAccuracy: number | null;
  last: { lat: number; lng: number } | null;
  route: Array<{ latitude: number; longitude: number }>;
  online: boolean;
  signalLost: boolean;
  syncError: string | null;
  permissionError: PermissionError | null;
  error: string | null;
}

const initial: TrackingView = { state: 'idle', session: null, elapsedMs: 0, distanceM: 0, pointCount: 0, pendingCount: 0, lastFixAgeMs: null, lastAccuracy: null, last: null, route: [], online: true, signalLost: false, syncError: null, permissionError: null, error: null };

/**
 * Drives the tracking screen. The SQLite store is the source of truth; this hook mirrors it into React state
 * and applies the documented state machine (business-logic/tracking-machine) to the transient UI states.
 */
export function useTracking(tripId: string, userId: string) {
  const [v, setV] = useState<TrackingView>(initial);
  const transient = useRef<TrackingState | null>(null); // requesting_permission | stopping | syncing | sync_error
  const lastPoints = useRef<GpsPoint[]>([]);

  const apply = useCallback((s: TrackingState) => { transient.current = s; }, []);
  const fire = useCallback((from: TrackingState, ev: TrackingEvent) => transition(from, ev), []);

  const refresh = useCallback(async () => {
    const s = await getActiveSession();
    const mine = s && s.trip_id === tripId ? s : null;
    const online = (await NetInfo.fetch()).isConnected !== false;
    if (!mine) {
      setV((p) => ({ ...p, session: null, state: transient.current ?? 'idle', elapsedMs: 0, online, signalLost: false }));
      return;
    }
    const c = await counts(mine.client_session_id);
    if (c.total !== lastPoints.current.length) lastPoints.current = await allPoints(mine.client_session_id);
    const pts = lastPoints.current;
    const last = pts[pts.length - 1];
    const stats = computeJourneyStats(pts);
    const age = last ? Date.now() - last.t : null;
    const base: TrackingState = mine.state === 'acquiring_location' ? 'acquiring_location' : mine.state === 'recording' ? 'recording' : mine.state === 'paused' ? 'paused' : 'stopped';
    setV((p) => ({
      ...p, session: mine, state: transient.current && base !== 'stopped' && transient.current === 'stopping' ? 'stopping' : base, elapsedMs: activeElapsedMs(mine), distanceM: stats.distanceM, pointCount: c.total, pendingCount: c.pending,
      lastFixAgeMs: age, lastAccuracy: last?.acc ?? null, last: last ? { lat: last.lat, lng: last.lng } : null,
      route: pts.map((x) => ({ latitude: x.lat, longitude: x.lng })), online, signalLost: base === 'recording' && age != null && age > 45_000,
    }));
  }, [tripId]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 1000);
    const unsub = NetInfo.addEventListener((n) => setV((p) => ({ ...p, online: n.isConnected !== false })));
    return () => { clearInterval(id); unsub(); };
  }, [refresh]);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setV((p) => ({ ...p, error: null, permissionError: null }));
    try { await fn(); } catch (e) {
      if (e instanceof PermissionError) setV((p) => ({ ...p, permissionError: e, state: 'idle' }));
      else setV((p) => ({ ...p, error: e instanceof Error ? e.message : 'Something went wrong.' }));
    }
    await refresh();
  }, [refresh]);

  const start = useCallback(() => run(async () => {
    setV((p) => ({ ...p, state: fire('idle', { type: 'START' }) }));
    await startJourney(tripId, userId);
    apply('acquiring_location'); transient.current = null;
  }), [run, fire, tripId, userId, apply]);

  const pause = useCallback(() => run(async () => { if (v.session) await pauseJourney(v.session.client_session_id); }), [run, v.session]);
  const resume = useCallback(() => run(async () => { if (v.session) await resumeJourney(v.session.client_session_id); }), [run, v.session]);

  const stop = useCallback(() => run(async () => {
    if (!v.session) return;
    transient.current = 'stopping';
    setV((p) => ({ ...p, state: 'stopping' }));
    await stopJourney(v.session.client_session_id);
    transient.current = 'syncing';
    setV((p) => ({ ...p, state: 'syncing' }));
    const r = await syncAll();
    if (r.ok) { transient.current = null; setV((p) => ({ ...p, syncError: null })); }
    else { transient.current = 'sync_error'; setV((p) => ({ ...p, state: 'sync_error', syncError: r.error === 'Offline' ? 'You are offline. Your route is saved on this device and will sync automatically.' : r.error })); }
  }), [run, v.session]);

  const retrySync = useCallback(() => run(async () => {
    transient.current = 'syncing'; setV((p) => ({ ...p, state: 'syncing' }));
    const r = await syncAll();
    if (r.ok) { transient.current = null; setV((p) => ({ ...p, syncError: null })); } else { transient.current = 'sync_error'; setV((p) => ({ ...p, state: 'sync_error', syncError: r.error })); }
  }), [run]);

  return { view: v, start, pause, resume, stop, retrySync, collecting: isCollectingLocation(v.state) };
}

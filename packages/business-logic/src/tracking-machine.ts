import type { TrackingState } from '@solotrav/shared-types';

export type TrackingEvent =
  | { type: 'START' }
  | { type: 'PERMISSION_GRANTED' }
  | { type: 'PERMISSION_DENIED' }
  | { type: 'FIRST_FIX' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'STOP' }
  | { type: 'STOPPED' }
  | { type: 'SYNC_START' }
  | { type: 'SYNC_OK' }
  | { type: 'SYNC_FAILED' }
  | { type: 'RETRY' }
  | { type: 'RESET' };

type Table = { [S in TrackingState]?: { [E in TrackingEvent['type']]?: TrackingState } };

/**
 * Tracking lifecycle (documented in docs/TRACKING.md).
 *
 *  idle -> requesting_permission -> acquiring_location -> recording <-> paused
 *  recording|paused -> stopping -> stopped -> syncing -> idle
 *                                              syncing -> sync_error -> syncing (retry)
 *
 * Location collection is only allowed in `recording` (and `acquiring_location` while waiting for the first fix).
 * Any denial returns to idle: the app stays useful without location.
 */
const TABLE: Table = {
  idle: { START: 'requesting_permission' },
  requesting_permission: { PERMISSION_GRANTED: 'acquiring_location', PERMISSION_DENIED: 'idle', STOP: 'idle' },
  acquiring_location: { FIRST_FIX: 'recording', STOP: 'idle', PERMISSION_DENIED: 'idle' },
  recording: { PAUSE: 'paused', STOP: 'stopping', PERMISSION_DENIED: 'stopping' },
  paused: { RESUME: 'acquiring_location', STOP: 'stopping' },
  stopping: { STOPPED: 'stopped' },
  stopped: { SYNC_START: 'syncing', RESET: 'idle' },
  syncing: { SYNC_OK: 'idle', SYNC_FAILED: 'sync_error' },
  sync_error: { RETRY: 'syncing', RESET: 'idle' },
};

export function transition(state: TrackingState, event: TrackingEvent): TrackingState {
  const next = TABLE[state]?.[event.type];
  if (!next) throw new InvalidTransitionError(state, event.type);
  return next;
}

export function canTransition(state: TrackingState, eventType: TrackingEvent['type']): boolean {
  return Boolean(TABLE[state]?.[eventType]);
}

export class InvalidTransitionError extends Error {
  constructor(public readonly state: TrackingState, public readonly event: string) {
    super(`Invalid tracking transition: ${event} while ${state}`);
    this.name = 'InvalidTransitionError';
  }
}

/** True only while the device may be collecting location samples. */
export function isCollectingLocation(state: TrackingState): boolean {
  return state === 'recording' || state === 'acquiring_location';
}

/** UI copy for each state, so web/mobile say the same thing. */
export const TRACKING_LABELS: Record<TrackingState, string> = {
  idle: 'Not tracking',
  requesting_permission: 'Waiting for location permission',
  acquiring_location: 'Waiting for GPS signal',
  recording: 'Recording',
  paused: 'Paused',
  stopping: 'Stopping',
  stopped: 'Stopped',
  syncing: 'Syncing route',
  sync_error: 'Sync failed. Your route is saved on this device.',
};

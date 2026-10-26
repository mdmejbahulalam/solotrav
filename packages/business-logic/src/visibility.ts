import type { AccountVisibility, ContentVisibility, MemberRole, TripStatus } from '@solotrav/shared-types';

/**
 * Client-side mirror of the database visibility rules. The database (RLS) is the authority;
 * this exists so UIs can decide what to render/offer and so the rules are unit-tested.
 */
export interface Viewer {
  id: string | null;
  followsOwner: boolean;
  blocked: boolean;
}

export interface Owner {
  id: string;
  accountVisibility: AccountVisibility;
  accountStatus: 'active' | 'suspended' | 'deleted';
}

export function canViewContent(viewer: Viewer, owner: Owner, visibility: ContentVisibility): boolean {
  if (viewer.id && viewer.id === owner.id) return true;
  if (owner.accountStatus !== 'active') return false;
  if (viewer.blocked) return false;
  if (visibility === 'private') return false;
  if (visibility === 'followers') return viewer.id !== null && viewer.followsOwner;
  if (owner.accountVisibility === 'private') return viewer.id !== null && viewer.followsOwner;
  return true;
}

const PUBLISHED_TRIP: readonly TripStatus[] = ['planned', 'active', 'completed'];

export function canViewTrip(
  viewer: Viewer,
  owner: Owner,
  trip: { visibility: ContentVisibility; status: TripStatus },
  memberRole: MemberRole | null,
): boolean {
  if (viewer.id && viewer.id === owner.id) return true;
  if (memberRole) return true;
  if (!PUBLISHED_TRIP.includes(trip.status)) return false;
  return canViewContent(viewer, owner, trip.visibility);
}

export function canEditTrip(memberRole: MemberRole | null): boolean {
  return memberRole === 'owner' || memberRole === 'editor';
}

/** Only the owner can change visibility, status or membership. */
export function canManageTrip(memberRole: MemberRole | null): boolean {
  return memberRole === 'owner';
}

/** Precise coordinates must never be attached to a public post by default. */
export function defaultPostSharing(): { includePreciseLocation: false; visibility: ContentVisibility } {
  return { includePreciseLocation: false, visibility: 'public' };
}

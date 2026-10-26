/** Domain types shared by web, admin and mobile. They mirror the Postgres enums in supabase/migrations. */
export const CONTENT_VISIBILITIES = ['public', 'followers', 'private'] as const;
export type ContentVisibility = (typeof CONTENT_VISIBILITIES)[number];
export type AccountVisibility = 'public' | 'private';
export type AccountStatus = 'active' | 'suspended' | 'deleted';
export type FollowStatus = 'pending' | 'accepted';
export type TripStatus = 'draft' | 'planned' | 'active' | 'completed' | 'archived';
export type TrackingStatus = 'idle' | 'recording' | 'paused' | 'stopped';
export type MemberRole = 'owner' | 'editor' | 'viewer';
export type InvitationStatus = 'invited' | 'accepted' | 'declined';
export type StopStatus = 'planned' | 'completed' | 'skipped';
export type CompletionMethod = 'manual' | 'gps_assisted';
export type JourneyStatus = 'recording' | 'paused' | 'stopped';
export type PostType = 'text' | 'image' | 'video' | 'checkin' | 'tip';
export type PublicationStatus = 'draft' | 'published' | 'removed';
export type AppRole =
  | 'support'
  | 'content_moderator'
  | 'content_manager'
  | 'administrator'
  | 'super_administrator';

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  cover_image_url: string | null;
  bio: string;
  home_region: string | null;
  travel_interests: string[];
  account_visibility: AccountVisibility;
  account_status: AccountStatus;
  live_location_sharing: 'off' | 'followers' | 'selected';
  notification_prefs: Record<string, boolean>;
  onboarded_at: string | null;
  created_at: string;
}

export interface Destination {
  id: string;
  source: 'curated' | 'google_place';
  google_place_id: string | null;
  slug: string | null;
  name: string | null;
  description: string;
  country: string | null;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  category: string | null;
  image_path: string | null;
  is_featured: boolean;
}

export interface Trip {
  id: string;
  owner_id: string;
  title: string;
  slug: string;
  description: string;
  cover_image_url: string | null;
  start_date: string | null;
  end_date: string | null;
  status: TripStatus;
  visibility: ContentVisibility;
  tracking_status: TrackingStatus;
  travel_style: string | null;
  published_at: string | null;
  created_at: string;
}

export interface TripStop {
  id: string;
  trip_id: string;
  destination_id: string | null;
  custom_name: string | null;
  custom_latitude: number | null;
  custom_longitude: number | null;
  stop_order: number;
  planned_arrival_at: string | null;
  planned_departure_at: string | null;
  target_minutes: number | null;
  notes: string;
  completion_status: StopStatus;
  completed_at: string | null;
  completion_method: CompletionMethod | null;
  completion_distance_m: number | null;
  rating: number | null;
  tip: string | null;
}

export interface Journey {
  id: string;
  trip_id: string;
  user_id: string;
  client_session_id: string;
  status: JourneyStatus;
  started_at: string;
  ended_at: string | null;
  paused_seconds: number;
  distance_meters: number;
  duration_seconds: number;
  share_with_collaborators: boolean;
}

/** A GPS sample as recorded on a device. `seq` is the stable idempotency key within a journey. */
export interface GpsPoint {
  seq: number;
  /** epoch milliseconds */
  t: number;
  lat: number;
  lng: number;
  /** horizontal accuracy radius in metres */
  acc?: number | null;
  alt?: number | null;
  spd?: number | null;
}

/** Wire format accepted by public.sync_journey_points */
export interface SyncPointPayload {
  seq: number;
  t: string;
  lat: number;
  lng: number;
  acc?: number | null;
  alt?: number | null;
  spd?: number | null;
}

export interface SyncResult {
  inserted: number;
  duplicates: number;
  rejected: number;
  distance_meters: number;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export type TrackingState =
  | 'idle'
  | 'requesting_permission'
  | 'acquiring_location'
  | 'recording'
  | 'paused'
  | 'stopping'
  | 'stopped'
  | 'syncing'
  | 'sync_error';

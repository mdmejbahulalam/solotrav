-- 0001: extensions, enums, shared utilities
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

create type public.account_visibility as enum ('public', 'private');
create type public.content_visibility as enum ('public', 'followers', 'private');
create type public.account_status as enum ('active', 'suspended', 'deleted');
create type public.follow_status as enum ('pending', 'accepted');
create type public.trip_status as enum ('draft', 'planned', 'active', 'completed', 'archived');
create type public.tracking_status as enum ('idle', 'recording', 'paused', 'stopped');
create type public.member_role as enum ('owner', 'editor', 'viewer');
create type public.invitation_status as enum ('invited', 'accepted', 'declined');
create type public.stop_status as enum ('planned', 'completed', 'skipped');
create type public.completion_method as enum ('manual', 'gps_assisted');
create type public.journey_status as enum ('recording', 'paused', 'stopped');
create type public.post_type as enum ('text', 'image', 'video', 'checkin', 'tip');
create type public.publication_status as enum ('draft', 'published', 'removed');
create type public.media_type as enum ('image', 'video');
create type public.reaction_type as enum ('like', 'love');
create type public.comment_status as enum ('visible', 'hidden', 'removed');
create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');
create type public.report_target as enum ('post', 'comment', 'profile', 'trip', 'message');
create type public.notification_type as enum (
  'follow', 'follow_request', 'follow_accepted', 'like', 'comment', 'mention',
  'trip_invite', 'trip_update', 'message'
);
create type public.saved_item_type as enum ('destination', 'trip', 'post');
create type public.app_role as enum (
  'support', 'content_moderator', 'content_manager', 'administrator', 'super_administrator'
);

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- True for trusted contexts: direct DB sessions (migrations, cron), the service role, or inside a staff/server
-- function that raised the transaction-local flag. Authenticated/anon API requests are never privileged.
-- (current_user is NOT used: inside SECURITY DEFINER functions it is the function owner.)
create or replace function public.is_privileged_context() returns boolean
language sql stable as $$
  select coalesce(current_setting('role', true), 'none') in ('none', 'postgres', 'service_role', 'supabase_admin')
      or coalesce(current_setting('solotrav.privileged', true), '') = '1';
$$;
create or replace function public.raise_privileged() returns void
language sql volatile as $$ select set_config('solotrav.privileged', '1', true)::text; $$;
revoke all on function public.raise_privileged() from public, anon, authenticated;

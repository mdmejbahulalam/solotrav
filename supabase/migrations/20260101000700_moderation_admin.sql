-- 0007: reports, moderation, audit, rate limits, analytics, settings, check-ins, account lifecycle, staff RPCs

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type public.report_target not null,
  target_id uuid not null,
  reason text not null check (reason in ('spam', 'harassment', 'unsafe', 'inappropriate', 'private_location', 'other')),
  detail text not null default '' check (char_length(detail) <= 500),
  status public.report_status not null default 'open',
  assigned_to uuid references public.profiles (id) on delete set null,
  resolution_note text,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index reports_one_open on public.reports (reporter_id, target_type, target_id) where status in ('open', 'reviewing');
create index reports_queue_idx on public.reports (status, created_at);

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid not null,
  report_id uuid references public.reports (id) on delete set null,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index moderation_actions_target_idx on public.moderation_actions (target_type, target_id);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  reason text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);

create or replace function public.write_audit(p_action text, p_target_type text, p_target_id text, p_reason text, p_meta jsonb default '{}') returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs (actor_id, action, target_type, target_id, reason, metadata)
  values (auth.uid(), p_action, p_target_type, p_target_id, p_reason, coalesce(p_meta, '{}'));
end $$;
revoke all on function public.write_audit(text, text, text, text, jsonb) from public, anon, authenticated;

create table public.feature_settings (
  key text primary key,
  value jsonb not null,
  description text not null default '',
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.feature_settings (key, value, description) values
  ('journey_points_retention_days', '365', 'Raw GPS points older than this (stopped journeys) are purged'),
  ('analytics_retention_days', '400', 'Analytics events older than this are purged'),
  ('account_deletion_grace_days', '14', 'Days between deletion request and permanent deletion'),
  ('upload_max_image_mb', '10', 'Maximum image upload size'),
  ('upload_max_video_mb', '100', 'Maximum video upload size');

-- ---------- rate limiting (database-level, per user and action) ----------
create table public.rate_limit_events (
  user_id uuid not null,
  action text not null,
  created_at timestamptz not null default now()
);
create index rate_limit_idx on public.rate_limit_events (user_id, action, created_at desc);

create or replace function public.enforce_rate_limit(p_user uuid, p_action text, p_max int, p_window interval) returns void
language plpgsql security definer set search_path = public as $$
declare c int;
begin
  if p_user is null then return; end if;
  select count(*) into c from public.rate_limit_events where user_id = p_user and action = p_action and created_at > now() - p_window;
  if c >= p_max then raise exception 'Rate limit exceeded for %', p_action using errcode = 'P0429'; end if;
  insert into public.rate_limit_events (user_id, action) values (p_user, p_action);
end $$;
revoke all on function public.enforce_rate_limit(uuid, text, int, interval) from public, anon, authenticated;

create or replace function public.rl_posts() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.enforce_rate_limit(new.author_id, 'post', 30, interval '1 hour'); return new; end $$;
create or replace function public.rl_comments() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.enforce_rate_limit(new.author_id, 'comment', 60, interval '1 hour'); return new; end $$;
create or replace function public.rl_messages() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.enforce_rate_limit(new.sender_id, 'message', 200, interval '1 hour'); return new; end $$;
create or replace function public.rl_reports() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.enforce_rate_limit(new.reporter_id, 'report', 20, interval '1 hour'); return new; end $$;
create or replace function public.rl_follows() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.enforce_rate_limit(new.follower_id, 'follow', 200, interval '1 hour'); return new; end $$;
create trigger posts_rl before insert on public.posts for each row execute function public.rl_posts();
create trigger comments_rl before insert on public.comments for each row execute function public.rl_comments();
create trigger messages_rl before insert on public.messages for each row execute function public.rl_messages();
create trigger reports_rl before insert on public.reports for each row execute function public.rl_reports();
create trigger follows_rl before insert on public.follows for each row execute function public.rl_follows();

-- ---------- check-in events (append-only log of destination completions) ----------
create table public.check_in_events (
  id uuid primary key default gen_random_uuid(),
  stop_id uuid not null references public.trip_stops (id) on delete cascade,
  user_id uuid not null,
  method public.completion_method not null,
  distance_m int,
  created_at timestamptz not null default now()
  -- Deliberately no coordinates. Proximity is a hint, not proof of presence.
);
create index check_in_events_stop_idx on public.check_in_events (stop_id);

create or replace function public.log_check_in() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.completion_status = 'completed' and old.completion_status <> 'completed' then
    insert into public.check_in_events (stop_id, user_id, method, distance_m) values (new.id, auth.uid(), new.completion_method, new.completion_distance_m);
  end if;
  return new;
end $$;
create trigger trip_stops_checkin after update of completion_status on public.trip_stops for each row execute function public.log_check_in();

-- ---------- recent searches ----------
create table public.search_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  query text not null check (char_length(query) between 1 and 100),
  created_at timestamptz not null default now()
);
create index search_history_user_idx on public.search_history (user_id, created_at desc);

-- ---------- analytics (aggregate-friendly, coordinate-free) ----------
create table public.analytics_events (
  id bigint generated always as identity primary key,
  event_name text not null,
  user_id uuid,
  props jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index analytics_name_idx on public.analytics_events (event_name, created_at desc);

create or replace function public.track_event(p_name text, p_props jsonb default '{}') returns void
language plpgsql security definer set search_path = public as $$
declare clean jsonb := '{}'; k text;
begin
  if p_name not in ('account_registered', 'trip_created', 'trip_published', 'journey_started', 'journey_completed', 'destination_completed', 'post_published', 'user_followed', 'itinerary_saved') then
    raise exception 'Unknown analytics event' using errcode = '22023';
  end if;
  -- never accept anything that could be a coordinate or free text
  for k in select jsonb_object_keys(coalesce(p_props, '{}')) loop
    -- allow-list of property keys: nothing free-form, nothing that could carry a coordinate or personal data
    if k in ('platform', 'app_version', 'source', 'method', 'visibility', 'category', 'status', 'count', 'role', 'has_dates')
       and jsonb_typeof(p_props -> k) in ('string', 'number', 'boolean') and char_length((p_props ->> k)) <= 40 then
      clean := clean || jsonb_build_object(k, p_props -> k);
    end if;
  end loop;
  insert into public.analytics_events (event_name, user_id, props) values (p_name, auth.uid(), clean);
end $$;

create or replace function public.purge_analytics(p_days int default 400) returns int
language plpgsql security definer set search_path = public as $$
declare c int;
begin
  if not public.is_privileged_context() then raise exception 'Not allowed' using errcode = '42501'; end if;
  delete from public.analytics_events where created_at < now() - make_interval(days => p_days);
  get diagnostics c = row_count;
  return c;
end $$;
revoke all on function public.purge_analytics(int) from public, anon, authenticated;

-- ---------- account lifecycle ----------
create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,        -- intentionally no FK: survives the account for audit of the request itself
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz not null,
  cancelled_at timestamptz,
  completed_at timestamptz
);
create unique index account_deletion_one_pending on public.account_deletion_requests (user_id) where cancelled_at is null and completed_at is null;

create or replace function public.request_account_deletion() returns timestamptz
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); grace int; at timestamptz;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  perform public.raise_privileged();
  select coalesce((value #>> '{}')::int, 14) into grace from public.feature_settings where key = 'account_deletion_grace_days';
  at := now() + make_interval(days => coalesce(grace, 14));
  insert into public.account_deletion_requests (user_id, scheduled_for) values (me, at) on conflict do nothing;
  update public.profiles set account_status = 'deleted' where id = me;   -- immediately hides all content
  return at;
end $$;

create or replace function public.cancel_account_deletion() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.raise_privileged();
  update public.account_deletion_requests set cancelled_at = now() where user_id = auth.uid() and cancelled_at is null and completed_at is null;
  update public.profiles set account_status = 'active' where id = auth.uid() and account_status = 'deleted';
end $$;

-- Run by a scheduled job with the service role (see docs/DEPLOYMENT.md).
create or replace function public.finalize_account_deletions() returns int
language plpgsql security definer set search_path = public as $$
declare r record; c int := 0;
begin
  if not public.is_privileged_context() then raise exception 'Not allowed' using errcode = '42501'; end if;
  for r in select * from public.account_deletion_requests where cancelled_at is null and completed_at is null and scheduled_for <= now() loop
    delete from auth.users where id = r.user_id;      -- cascades to profiles and all owned data
    update public.account_deletion_requests set completed_at = now() where id = r.id;
    c := c + 1;
  end loop;
  return c;
end $$;
revoke all on function public.finalize_account_deletions() from public, anon, authenticated;

create or replace function public.export_my_data() returns jsonb
language plpgsql stable security invoker as $$
declare me uuid := auth.uid();
begin
  return jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = me),
    'trips', coalesce((select jsonb_agg(to_jsonb(t)) from public.trips t where t.owner_id = me), '[]'),
    'trip_stops', coalesce((select jsonb_agg(to_jsonb(s)) from public.trip_stops s join public.trips t on t.id = s.trip_id where t.owner_id = me), '[]'),
    'journeys', coalesce((select jsonb_agg(to_jsonb(j)) from public.journeys j where j.user_id = me), '[]'),
    'journey_points', coalesce((select jsonb_agg(to_jsonb(jp)) from public.journey_points jp join public.journeys j on j.id = jp.journey_id where j.user_id = me), '[]'),
    'posts', coalesce((select jsonb_agg(to_jsonb(p)) from public.posts p where p.author_id = me), '[]'),
    'comments', coalesce((select jsonb_agg(to_jsonb(c)) from public.comments c where c.author_id = me), '[]'),
    'saved_items', coalesce((select jsonb_agg(to_jsonb(s)) from public.saved_items s where s.user_id = me), '[]'),
    'messages_sent', coalesce((select jsonb_agg(to_jsonb(m)) from public.messages m where m.sender_id = me), '[]')
  );
end $$;

-- ---------- staff operations: every one checks a DB permission and writes the audit log ----------
create or replace function public.require_permission(p_permission text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_permission(p_permission) then raise exception 'Missing permission: %', p_permission using errcode = '42501'; end if;
end $$;

create or replace function public.admin_set_account_status(p_user uuid, p_status public.account_status, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_permission('users.suspend');
  perform public.raise_privileged();
  if p_status = 'deleted' then raise exception 'Use account deletion workflow' using errcode = '22023'; end if;
  if char_length(coalesce(p_reason, '')) < 5 then raise exception 'A reason is required' using errcode = '22023'; end if;
  if p_user = auth.uid() then raise exception 'You cannot change your own status' using errcode = '42501'; end if;
  if exists (select 1 from public.role_assignments where user_id = p_user and role = 'super_administrator') and not exists (select 1 from public.role_assignments where user_id = auth.uid() and role = 'super_administrator') then
    raise exception 'Only a super administrator can change this account' using errcode = '42501';
  end if;
  update public.profiles set account_status = p_status where id = p_user;
  insert into public.moderation_actions (actor_id, action, target_type, target_id, note) values (auth.uid(), 'account_' || p_status, 'profile', p_user, p_reason);
  perform public.write_audit('account.' || p_status, 'profile', p_user::text, p_reason);
end $$;

create or replace function public.admin_remove_post(p_post uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_permission('content.remove');
  perform public.raise_privileged();
  if char_length(coalesce(p_reason, '')) < 5 then raise exception 'A reason is required' using errcode = '22023'; end if;
  update public.posts set publication_status = 'removed' where id = p_post;
  insert into public.moderation_actions (actor_id, action, target_type, target_id, note) values (auth.uid(), 'post_removed', 'post', p_post, p_reason);
  perform public.write_audit('post.remove', 'post', p_post::text, p_reason);
end $$;

create or replace function public.admin_moderate_comment(p_comment uuid, p_status public.comment_status, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_permission('comments.moderate');
  perform public.raise_privileged();
  if char_length(coalesce(p_reason, '')) < 5 then raise exception 'A reason is required' using errcode = '22023'; end if;
  update public.comments set status = p_status where id = p_comment;
  insert into public.moderation_actions (actor_id, action, target_type, target_id, note) values (auth.uid(), 'comment_' || p_status, 'comment', p_comment, p_reason);
  perform public.write_audit('comment.' || p_status, 'comment', p_comment::text, p_reason);
end $$;

create or replace function public.admin_resolve_report(p_report uuid, p_status public.report_status, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_permission('reports.resolve');
  if p_status not in ('reviewing', 'resolved', 'dismissed') then raise exception 'Invalid status' using errcode = '22023'; end if;
  update public.reports set status = p_status, resolution_note = p_note, resolved_by = case when p_status = 'reviewing' then null else auth.uid() end,
    resolved_at = case when p_status = 'reviewing' then null else now() end, assigned_to = coalesce(assigned_to, auth.uid()) where id = p_report;
  insert into public.moderation_actions (actor_id, action, target_type, target_id, report_id, note)
  select auth.uid(), 'report_' || p_status, target_type::text, target_id, id, coalesce(p_note, '') from public.reports where id = p_report;
  perform public.write_audit('report.' || p_status, 'report', p_report::text, p_note);
end $$;

create or replace function public.admin_set_featured(p_type text, p_item uuid, p_active boolean, p_position int default 0) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_permission('featured.manage');
  insert into public.featured_items (item_type, item_id, position, is_active, created_by) values (p_type, p_item, p_position, p_active, auth.uid())
  on conflict (item_type, item_id) do update set is_active = excluded.is_active, position = excluded.position;
  if p_type = 'destination' then update public.destinations set is_featured = p_active where id = p_item; end if;
  perform public.write_audit('featured.set', p_type, p_item::text, null, jsonb_build_object('active', p_active));
end $$;

create or replace function public.admin_grant_role(p_user uuid, p_role public.app_role, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_permission('roles.manage');
  if char_length(coalesce(p_reason, '')) < 5 then raise exception 'A reason is required' using errcode = '22023'; end if;
  insert into public.role_assignments (user_id, role, granted_by) values (p_user, p_role, auth.uid()) on conflict do nothing;
  perform public.write_audit('role.grant', 'profile', p_user::text, p_reason, jsonb_build_object('role', p_role));
end $$;

create or replace function public.admin_revoke_role(p_user uuid, p_role public.app_role, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_permission('roles.manage');
  if p_user = auth.uid() and p_role = 'super_administrator' then raise exception 'You cannot revoke your own super administrator role' using errcode = '42501'; end if;
  delete from public.role_assignments where user_id = p_user and role = p_role;
  perform public.write_audit('role.revoke', 'profile', p_user::text, p_reason, jsonb_build_object('role', p_role));
end $$;

create or replace function public.admin_save_destination(p_data jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare did uuid := nullif(p_data ->> 'id', '')::uuid;
begin
  perform public.require_permission('destinations.manage');
  if did is null then
    insert into public.destinations (source, slug, name, description, country, region, latitude, longitude, category, is_published, is_featured, created_by)
    values ('curated', p_data ->> 'slug', p_data ->> 'name', coalesce(p_data ->> 'description', ''), p_data ->> 'country', p_data ->> 'region',
            (p_data ->> 'latitude')::double precision, (p_data ->> 'longitude')::double precision, p_data ->> 'category',
            coalesce((p_data ->> 'is_published')::boolean, true), false, auth.uid()) returning id into did;
  else
    update public.destinations set name = coalesce(p_data ->> 'name', name), description = coalesce(p_data ->> 'description', description),
      country = coalesce(p_data ->> 'country', country), region = coalesce(p_data ->> 'region', region),
      latitude = coalesce((p_data ->> 'latitude')::double precision, latitude), longitude = coalesce((p_data ->> 'longitude')::double precision, longitude),
      category = coalesce(p_data ->> 'category', category), is_published = coalesce((p_data ->> 'is_published')::boolean, is_published)
    where id = did;
  end if;
  perform public.write_audit('destination.save', 'destination', did::text, null);
  return did;
end $$;

-- Exceptional, justified, audited access to a user's raw route. Ordinary staff cannot call this.
create or replace function public.staff_read_journey_points(p_journey uuid, p_reason text)
returns table (sequence_number int, recorded_at timestamptz, latitude double precision, longitude double precision)
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_permission('sensitive.location.read');
  if char_length(coalesce(trim(p_reason), '')) < 20 then raise exception 'A detailed justification (20+ characters) is required' using errcode = '22023'; end if;
  perform public.write_audit('sensitive.location.read', 'journey', p_journey::text, p_reason);
  return query select jp.sequence_number, jp.recorded_at, jp.latitude, jp.longitude from public.journey_points jp where jp.journey_id = p_journey order by jp.sequence_number;
end $$;

create or replace function public.admin_overview_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_permission('analytics.read');
  return jsonb_build_object(
    'registered_users', (select count(*) from public.profiles),
    'active_users_7d', (select count(distinct user_id) from public.analytics_events where created_at > now() - interval '7 days' and user_id is not null),
    'published_posts', (select count(*) from public.posts where publication_status = 'published'),
    'public_trips', (select count(*) from public.trips where visibility = 'public' and status in ('planned', 'active', 'completed')),
    'journeys_started', (select count(*) from public.journeys),
    'journeys_completed', (select count(*) from public.journeys where status = 'stopped'),
    'open_reports', (select count(*) from public.reports where status = 'open'),
    'new_users_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days')
  );
end $$;

create or replace function public.admin_list_users(p_search text default '', p_limit int default 25, p_offset int default 0)
returns table (id uuid, username text, display_name text, account_status public.account_status, created_at timestamptz, roles public.app_role[])
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_permission('users.read');
  return query
    select p.id, p.username, p.display_name, p.account_status, p.created_at,
           coalesce((select array_agg(ra.role) from public.role_assignments ra where ra.user_id = p.id), '{}')
    from public.profiles p
    where p_search = '' or p.username ilike '%' || p_search || '%' or p.display_name ilike '%' || p_search || '%'
    order by p.created_at desc limit least(p_limit, 100) offset greatest(p_offset, 0);
end $$;

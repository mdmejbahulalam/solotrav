-- 0008: Row Level Security. Default is deny; every table below is explicitly opened.

-- ---------- column guards (things RLS cannot express) ----------
create or replace function public.profiles_guard() returns trigger language plpgsql as $$
begin
  new.id := old.id;
  if not public.is_privileged_context() then
    new.account_status := old.account_status;   -- only moderation / deletion functions change this
  end if;
  return new;
end $$;
create trigger profiles_bu_guard before update on public.profiles for each row execute function public.profiles_guard();

create or replace function public.trips_guard() returns trigger language plpgsql as $$
begin
  if auth.uid() is distinct from old.owner_id and not public.is_privileged_context() then
    new.visibility := old.visibility; new.status := old.status;     -- collaborators cannot publish/unpublish
  end if;
  return new;
end $$;
create trigger trips_bu_guard before update on public.trips for each row execute function public.trips_guard();

create or replace function public.notifications_guard() returns trigger language plpgsql as $$
begin
  new.id := old.id; new.recipient_id := old.recipient_id; new.actor_id := old.actor_id;
  new.notification_type := old.notification_type; new.entity_type := old.entity_type; new.entity_id := old.entity_id; new.created_at := old.created_at;
  return new;
end $$;
create trigger notifications_bu_guard before update on public.notifications for each row execute function public.notifications_guard();

create or replace function public.can_read_journey(p_journey uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.journeys j
    where j.id = p_journey and (
      j.user_id = auth.uid()
      or (j.share_with_collaborators and public.trip_access_role(j.trip_id) is not null)
    )
  );
$$;

-- Minimal card so a private account can still receive follow requests (excluded from search)
create or replace function public.get_profile_card(p_username text)
returns table (id uuid, username text, display_name text, avatar_url text, account_visibility public.account_visibility)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.account_visibility
  from public.profiles p
  where lower(p.username) = lower(p_username) and p.account_status = 'active'
    and (auth.uid() is null or not public.blocked_between(auth.uid(), p.id));
$$;

-- ---------- enable RLS everywhere ----------
alter table public.profiles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.role_assignments enable row level security;
alter table public.follows enable row level security;
alter table public.user_blocks enable row level security;
alter table public.destination_categories enable row level security;
alter table public.destinations enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_stops enable row level security;
alter table public.trip_route_previews enable row level security;
alter table public.journeys enable row level security;
alter table public.journey_points enable row level security;
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.reactions enable row level security;
alter table public.comments enable row level security;
alter table public.hashtags enable row level security;
alter table public.post_hashtags enable row level security;
alter table public.collections enable row level security;
alter table public.saved_items enable row level security;
alter table public.featured_items enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_media enable row level security;
alter table public.notifications enable row level security;
alter table public.push_tokens enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.feature_settings enable row level security;
alter table public.rate_limit_events enable row level security;
alter table public.check_in_events enable row level security;
alter table public.search_history enable row level security;
alter table public.analytics_events enable row level security;
alter table public.account_deletion_requests enable row level security;

-- ---------- profiles ----------
create policy profiles_select on public.profiles for select to authenticated, anon using (
  id = auth.uid()
  or public.has_permission('users.read')
  or (account_status = 'active' and (auth.uid() is null or not public.blocked_between(auth.uid(), id))
      and (account_visibility = 'public' or public.is_accepted_follower(id)))
);
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---------- roles (read-only to the user; writes only via admin_grant_role) ----------
create policy role_permissions_staff_read on public.role_permissions for select to authenticated using (public.is_staff());
create policy role_assignments_read on public.role_assignments for select to authenticated using (user_id = auth.uid() or public.has_permission('roles.manage'));

-- ---------- follows / blocks ----------
create policy follows_select on public.follows for select to authenticated, anon using (
  follower_id = auth.uid() or following_id = auth.uid()
  or (status = 'accepted' and public.can_view_content(following_id, 'public'))
);
create policy follows_insert on public.follows for insert to authenticated with check (follower_id = auth.uid());
create policy follows_update on public.follows for update to authenticated using (following_id = auth.uid()) with check (following_id = auth.uid());
create policy follows_delete on public.follows for delete to authenticated using (follower_id = auth.uid() or following_id = auth.uid());

create policy blocks_select on public.user_blocks for select to authenticated using (blocker_id = auth.uid());
create policy blocks_insert on public.user_blocks for insert to authenticated with check (blocker_id = auth.uid());
create policy blocks_delete on public.user_blocks for delete to authenticated using (blocker_id = auth.uid());

-- ---------- destinations ----------
create policy categories_select on public.destination_categories for select to authenticated, anon using (true);
create policy destinations_select on public.destinations for select to authenticated, anon using (is_published or public.has_permission('destinations.manage'));

-- ---------- trips ----------
create policy trips_select on public.trips for select to authenticated, anon using (owner_id = auth.uid() or public.can_view_trip(id));
create policy trips_insert on public.trips for insert to authenticated with check (owner_id = auth.uid());
create policy trips_update on public.trips for update to authenticated using (public.can_edit_trip(id)) with check (public.can_edit_trip(id));
create policy trips_delete on public.trips for delete to authenticated using (owner_id = auth.uid());

create policy trip_members_select on public.trip_members for select to authenticated using (user_id = auth.uid() or public.trip_access_role(trip_id) is not null);
create policy trip_members_insert on public.trip_members for insert to authenticated with check (exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid()));
create policy trip_members_update on public.trip_members for update to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid()))
  with check (user_id = auth.uid() or exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid()));
create policy trip_members_delete on public.trip_members for delete to authenticated
  using (role <> 'owner' and (user_id = auth.uid() or exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid())));

create policy trip_stops_select on public.trip_stops for select to authenticated, anon using (public.can_view_trip(trip_id));
create policy trip_stops_insert on public.trip_stops for insert to authenticated with check (public.can_edit_trip(trip_id));
create policy trip_stops_update on public.trip_stops for update to authenticated using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id));
create policy trip_stops_delete on public.trip_stops for delete to authenticated using (public.can_edit_trip(trip_id));

create policy route_previews_select on public.trip_route_previews for select to authenticated, anon using (public.can_view_trip(trip_id));
create policy route_previews_write on public.trip_route_previews for all to authenticated
  using (exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid()))
  with check (published_by = auth.uid() and exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid()));

-- ---------- journeys: raw GPS is private to the recorder (and collaborators only if explicitly shared) ----------
create policy journeys_select on public.journeys for select to authenticated using (user_id = auth.uid() or public.can_read_journey(id));
create policy journeys_insert on public.journeys for insert to authenticated with check (user_id = auth.uid());
create policy journeys_update on public.journeys for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy journeys_delete on public.journeys for delete to authenticated using (user_id = auth.uid());

create policy journey_points_select on public.journey_points for select to authenticated using (public.can_read_journey(journey_id));
create policy journey_points_insert on public.journey_points for insert to authenticated with check (exists (select 1 from public.journeys j where j.id = journey_id and j.user_id = auth.uid()));
create policy journey_points_delete on public.journey_points for delete to authenticated using (exists (select 1 from public.journeys j where j.id = journey_id and j.user_id = auth.uid()));
-- NOTE: there is intentionally no staff policy. Staff must use staff_read_journey_points() (justified + audited).

-- ---------- posts & engagement ----------
create policy posts_select on public.posts for select to authenticated, anon using (
  author_id = auth.uid() or public.can_view_post(id)
  or (public.has_permission('reports.read') and exists (select 1 from public.reports r where r.target_type = 'post' and r.target_id = posts.id))
);
create policy posts_insert on public.posts for insert to authenticated with check (author_id = auth.uid());
create policy posts_update on public.posts for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy posts_delete on public.posts for delete to authenticated using (author_id = auth.uid());

create policy post_media_select on public.post_media for select to authenticated, anon using (
  public.can_view_post(post_id)
  or (public.has_permission('reports.read') and exists (select 1 from public.reports r where r.target_type = 'post' and r.target_id = post_media.post_id))
);
create policy post_media_insert on public.post_media for insert to authenticated with check (exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()));
create policy post_media_delete on public.post_media for delete to authenticated using (exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()));

create policy reactions_select on public.reactions for select to authenticated, anon using (public.can_view_post(post_id));
create policy reactions_insert on public.reactions for insert to authenticated with check (user_id = auth.uid() and public.can_view_post(post_id));
create policy reactions_delete on public.reactions for delete to authenticated using (user_id = auth.uid());

create policy comments_select on public.comments for select to authenticated, anon using (
  (public.can_view_post(post_id) and (status = 'visible' or author_id = auth.uid()) and (auth.uid() is null or not public.blocked_between(auth.uid(), author_id)))
  or (public.has_permission('reports.read') and exists (select 1 from public.reports r where r.target_type = 'comment' and r.target_id = comments.id))
);
create policy comments_insert on public.comments for insert to authenticated with check (author_id = auth.uid() and public.can_view_post(post_id));
create policy comments_update on public.comments for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy comments_delete on public.comments for delete to authenticated using (
  author_id = auth.uid() or exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
);

-- a tag is only discoverable if the caller can see at least one post using it (post_hashtags is itself RLS-filtered)
create policy hashtags_select on public.hashtags for select to authenticated, anon using (
  not is_blocked and exists (select 1 from public.post_hashtags ph where ph.hashtag_id = hashtags.id)
);
create policy post_hashtags_select on public.post_hashtags for select to authenticated, anon using (public.can_view_post(post_id));

create policy collections_select on public.collections for select to authenticated, anon using (owner_id = auth.uid() or public.can_view_content(owner_id, visibility));
create policy collections_insert on public.collections for insert to authenticated with check (owner_id = auth.uid());
create policy collections_update on public.collections for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy collections_delete on public.collections for delete to authenticated using (owner_id = auth.uid());

create policy saved_items_all on public.saved_items for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy featured_select on public.featured_items for select to authenticated, anon using (is_active);

-- ---------- messaging ----------
create policy conversations_select on public.conversations for select to authenticated using (public.is_conversation_member(id));
create policy conv_members_select on public.conversation_members for select to authenticated using (public.is_conversation_member(conversation_id));
create policy conv_members_update on public.conversation_members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy messages_select on public.messages for select to authenticated using (public.is_conversation_member(conversation_id));
create policy messages_insert on public.messages for insert to authenticated with check (sender_id = auth.uid() and public.is_conversation_member(conversation_id));
create policy messages_delete on public.messages for delete to authenticated using (sender_id = auth.uid());
create policy message_media_select on public.message_media for select to authenticated using (exists (select 1 from public.messages m where m.id = message_id and public.is_conversation_member(m.conversation_id)));
create policy message_media_insert on public.message_media for insert to authenticated with check (exists (select 1 from public.messages m where m.id = message_id and m.sender_id = auth.uid()));

-- ---------- notifications & tokens (rows are created only by server-side functions) ----------
create policy notifications_select on public.notifications for select to authenticated using (recipient_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (recipient_id = auth.uid());
create policy push_tokens_all on public.push_tokens for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- moderation & admin ----------
create policy reports_select on public.reports for select to authenticated using (reporter_id = auth.uid() or public.has_permission('reports.read'));
create policy reports_insert on public.reports for insert to authenticated with check (reporter_id = auth.uid() and status = 'open');
create policy moderation_actions_select on public.moderation_actions for select to authenticated using (public.has_permission('reports.read'));
create policy audit_logs_select on public.audit_logs for select to authenticated using (public.has_permission('audit.read'));
create policy feature_settings_select on public.feature_settings for select to authenticated using (true);
-- rate_limit_events: no policies => unreadable/unwritable for clients
create policy check_in_events_select on public.check_in_events for select to authenticated using (user_id = auth.uid());
create policy search_history_all on public.search_history for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy analytics_select on public.analytics_events for select to authenticated using (public.has_permission('analytics.read'));
create policy deletion_requests_select on public.account_deletion_requests for select to authenticated using (user_id = auth.uid());

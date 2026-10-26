-- 0003: destinations, trips, members, stops, published route previews

create table public.destination_categories (
  slug text primary key,
  label text not null,
  sort_order int not null default 0
);
insert into public.destination_categories (slug, label, sort_order) values
  ('beaches', 'Beaches', 1), ('mountains', 'Mountains', 2), ('cities', 'Cities', 3),
  ('historical', 'Historical sites', 4), ('restaurants', 'Restaurants', 5), ('nature', 'Nature', 6),
  ('adventure', 'Adventure', 7), ('hidden-gems', 'Hidden gems', 8), ('weekend', 'Weekend trips', 9);

create table public.destinations (
  id uuid primary key default gen_random_uuid(),
  -- 'curated' rows are SoloTrav-owned content. 'google_place' rows hold a Place ID (storable indefinitely)
  -- plus cached fields that must be refreshed within cache_expires_at per Google Maps Platform terms.
  source text not null default 'curated' check (source in ('curated', 'google_place')),
  google_place_id text,
  slug text,
  name text,
  normalized_name text,
  description text not null default '',
  country text,
  region text,
  latitude double precision,
  longitude double precision,
  category text references public.destination_categories (slug),
  image_path text,
  image_credit text,
  is_featured boolean not null default false,
  is_published boolean not null default true,
  cached_at timestamptz,
  cache_expires_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint destinations_coords check (
    (latitude is null or latitude between -90 and 90) and (longitude is null or longitude between -180 and 180)
  ),
  constraint destinations_curated_complete check (
    source <> 'curated' or (name is not null and latitude is not null and longitude is not null and slug is not null)
  ),
  constraint destinations_place_id check (source <> 'google_place' or google_place_id is not null)
);
create unique index destinations_place_id_key on public.destinations (google_place_id) where google_place_id is not null;
create unique index destinations_slug_key on public.destinations (slug) where slug is not null;
create index destinations_norm_trgm on public.destinations using gin (normalized_name extensions.gin_trgm_ops);
create index destinations_category_idx on public.destinations (category) where is_published;
create index destinations_featured_idx on public.destinations (is_featured) where is_featured and is_published;
create trigger destinations_updated before update on public.destinations for each row execute function public.set_updated_at();

create or replace function public.destinations_normalize() returns trigger
language plpgsql as $$
begin
  new.normalized_name := lower(coalesce(new.name, ''));
  return new;
end $$;
create trigger destinations_norm before insert or update of name on public.destinations
  for each row execute function public.destinations_normalize();

-- ---------- trips ----------
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  slug text not null,
  description text not null default '',
  cover_image_url text,
  start_date date,
  end_date date,
  status public.trip_status not null default 'draft',
  visibility public.content_visibility not null default 'private',
  tracking_status public.tracking_status not null default 'idle',
  travel_style text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trips_title_len check (char_length(title) between 3 and 140),
  constraint trips_dates check (start_date is null or end_date is null or end_date >= start_date)
);
create unique index trips_slug_key on public.trips (slug);
create index trips_owner_idx on public.trips (owner_id, created_at desc);
create index trips_public_idx on public.trips (published_at desc) where visibility = 'public' and status in ('planned', 'active', 'completed');
create index trips_title_trgm on public.trips using gin (title extensions.gin_trgm_ops);
create trigger trips_updated before update on public.trips for each row execute function public.set_updated_at();

create or replace function public.trips_before_write() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.slug := coalesce(nullif(trim(both '-' from lower(regexp_replace(left(new.title, 40), '[^a-zA-Z0-9]+', '-', 'g'))), ''), 'trip')
                || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    new.tracking_status := 'idle';
  else
    new.slug := old.slug;
    new.owner_id := old.owner_id;
    -- tracking_status is maintained by journey triggers only
    if not public.is_privileged_context() then new.tracking_status := old.tracking_status; end if;
  end if;
  if new.status in ('planned', 'active', 'completed') and new.published_at is null then new.published_at := now(); end if;
  if new.status = 'draft' then new.published_at := null; end if;
  return new;
end $$;
create trigger trips_bw before insert or update on public.trips for each row execute function public.trips_before_write();

-- ---------- members ----------
create table public.trip_members (
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'viewer',
  invitation_status public.invitation_status not null default 'invited',
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);
create index trip_members_user_idx on public.trip_members (user_id, invitation_status);

create or replace function public.trips_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.trip_members (trip_id, user_id, role, invitation_status, invited_by)
  values (new.id, new.owner_id, 'owner', 'accepted', new.owner_id);
  return new;
end $$;
create trigger trips_ai after insert on public.trips for each row execute function public.trips_after_insert();

create or replace function public.trip_access_role(p_trip uuid) returns public.member_role
language sql stable security definer set search_path = public as $$
  select tm.role from public.trip_members tm
  where tm.trip_id = p_trip and tm.user_id = auth.uid() and tm.invitation_status = 'accepted';
$$;

create or replace function public.can_edit_trip(p_trip uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.trip_access_role(p_trip) in ('owner', 'editor'), false);
$$;

create or replace function public.can_view_trip(p_trip uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.trips t
    where t.id = p_trip and (
      t.owner_id = auth.uid()
      or exists (select 1 from public.trip_members m where m.trip_id = t.id and m.user_id = auth.uid() and m.invitation_status <> 'declined')
      or (t.status in ('planned', 'active', 'completed') and public.can_view_content(t.owner_id, t.visibility))
    )
  );
$$;

create or replace function public.trip_members_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare t_owner uuid;
begin
  select owner_id into t_owner from public.trips where id = new.trip_id;
  if tg_op = 'INSERT' then
    if new.role = 'owner' and new.user_id <> t_owner then raise exception 'Only the trip owner can be owner' using errcode = '42501'; end if;
    if new.user_id <> t_owner then
      if public.blocked_between(t_owner, new.user_id) then raise exception 'Cannot invite this user' using errcode = '42501'; end if;
      new.invitation_status := 'invited';
    end if;
  else
    if new.trip_id <> old.trip_id or new.user_id <> old.user_id then raise exception 'Immutable' using errcode = '42501'; end if;
    if auth.uid() = old.user_id and auth.uid() <> t_owner then
      -- invitee may only answer the invitation
      if new.role <> old.role then raise exception 'Cannot change own role' using errcode = '42501'; end if;
      if old.invitation_status <> 'invited' then raise exception 'Invitation already answered' using errcode = '42501'; end if;
    end if;
    if old.role = 'owner' and (new.role <> 'owner') then raise exception 'Owner role is fixed' using errcode = '42501'; end if;
  end if;
  return new;
end $$;
create trigger trip_members_bw before insert or update on public.trip_members for each row execute function public.trip_members_before_write();

-- ---------- stops ----------
create table public.trip_stops (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  destination_id uuid references public.destinations (id) on delete restrict,
  custom_name text,
  custom_latitude double precision,
  custom_longitude double precision,
  stop_order int not null,
  planned_arrival_at timestamptz,
  planned_departure_at timestamptz,
  target_minutes int check (target_minutes is null or target_minutes between 0 and 14400),
  notes text not null default '',
  completion_status public.stop_status not null default 'planned',
  completed_at timestamptz,
  completion_method public.completion_method,
  completion_distance_m int check (completion_distance_m is null or completion_distance_m >= 0),
  rating smallint check (rating is null or rating between 1 and 5),
  tip text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_stops_place check (
    destination_id is not null or (custom_name is not null and custom_latitude between -90 and 90 and custom_longitude between -180 and 180)
  ),
  constraint trip_stops_times check (planned_arrival_at is null or planned_departure_at is null or planned_departure_at >= planned_arrival_at),
  constraint trip_stops_completed check (
    (completion_status = 'completed' and completed_at is not null and completion_method is not null)
    or (completion_status <> 'completed' and completed_at is null)
  ),
  constraint trip_stops_notes_len check (char_length(notes) <= 600),
  constraint trip_stops_order unique (trip_id, stop_order) deferrable initially deferred
);
create index trip_stops_trip_idx on public.trip_stops (trip_id, stop_order);
create index trip_stops_destination_idx on public.trip_stops (destination_id);
create trigger trip_stops_updated before update on public.trip_stops for each row execute function public.set_updated_at();

create or replace function public.trip_stops_before_write() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if new.stop_order is null or new.stop_order < 0 then
      select coalesce(max(stop_order) + 1, 0) into new.stop_order from public.trip_stops where trip_id = new.trip_id;
    end if;
    new.completion_status := 'planned'; new.completed_at := null; new.completion_method := null;
  else
    new.trip_id := old.trip_id;
    if new.completion_status = 'completed' and old.completion_status <> 'completed' then
      new.completed_at := coalesce(new.completed_at, now());
      new.completion_method := coalesce(new.completion_method, 'manual');
    elsif new.completion_status <> 'completed' then
      new.completed_at := null; new.completion_method := null; new.completion_distance_m := null;
    end if;
  end if;
  return new;
end $$;
create trigger trip_stops_bw before insert or update on public.trip_stops for each row execute function public.trip_stops_before_write();

-- Transactional reorder: p_ordered_ids must be exactly the trip's stop ids.
create or replace function public.reorder_trip_stops(p_trip uuid, p_ordered_ids uuid[]) returns void
language plpgsql security invoker as $$
declare existing uuid[]; i int;
begin
  if not public.can_edit_trip(p_trip) then raise exception 'Not allowed' using errcode = '42501'; end if;
  select array_agg(id order by id) into existing from public.trip_stops where trip_id = p_trip;
  if coalesce(existing, '{}') is distinct from (select coalesce(array_agg(x order by x), '{}') from unnest(p_ordered_ids) x) then
    raise exception 'Ordered ids must match the trip stops exactly' using errcode = '22023';
  end if;
  for i in 1 .. coalesce(array_length(p_ordered_ids, 1), 0) loop
    update public.trip_stops set stop_order = i - 1 where id = p_ordered_ids[i] and trip_id = p_trip;
  end loop;
end $$;

-- Progress as a view-friendly function (RLS applies to the underlying table)
create or replace function public.trip_progress(p_trip uuid) returns table (total int, completed int, percent int)
language sql stable as $$
  select count(*)::int,
         count(*) filter (where completion_status = 'completed')::int,
         case when count(*) = 0 then 0 else round(100.0 * count(*) filter (where completion_status = 'completed') / count(*))::int end
  from public.trip_stops where trip_id = p_trip and completion_status <> 'skipped';
$$;

-- ---------- deliberately published route preview (never raw GPS) ----------
create table public.trip_route_previews (
  trip_id uuid primary key references public.trips (id) on delete cascade,
  encoded_polyline text not null check (char_length(encoded_polyline) <= 20000),
  distance_m int check (distance_m is null or distance_m >= 0),
  published_by uuid not null references public.profiles (id) on delete cascade,
  published_at timestamptz not null default now()
);

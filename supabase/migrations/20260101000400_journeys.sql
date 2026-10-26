-- 0004: journeys (GPS sessions) and journey points, with idempotent batch sync and server-side stats

create table public.journeys (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  client_session_id uuid not null,
  status public.journey_status not null default 'recording',
  started_at timestamptz not null default now(),
  paused_at timestamptz,
  resumed_at timestamptz,
  ended_at timestamptz,
  paused_seconds int not null default 0 check (paused_seconds >= 0),
  distance_meters int not null default 0 check (distance_meters >= 0),
  duration_seconds int not null default 0 check (duration_seconds >= 0),
  recording_settings jsonb not null default '{"max_accuracy_m":50,"min_move_m":5,"max_speed_mps":70}',
  share_with_collaborators boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journeys_session_unique unique (user_id, client_session_id)
);
create index journeys_trip_idx on public.journeys (trip_id, started_at desc);
create unique index journeys_one_active_per_user on public.journeys (user_id) where status in ('recording', 'paused');
create trigger journeys_updated before update on public.journeys for each row execute function public.set_updated_at();

create table public.journey_points (
  id bigint generated always as identity primary key,
  journey_id uuid not null references public.journeys (id) on delete cascade,
  sequence_number int not null check (sequence_number >= 0),
  recorded_at timestamptz not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_meters real check (accuracy_meters is null or (accuracy_meters >= 0 and accuracy_meters <= 10000)),
  altitude real,
  speed_meters_per_second real check (speed_meters_per_second is null or speed_meters_per_second >= 0),
  created_at timestamptz not null default now(),
  constraint journey_points_idempotent unique (journey_id, sequence_number)
);
create index journey_points_time_idx on public.journey_points (journey_id, recorded_at);

-- ---------- geographic distance (documented: haversine, mean Earth radius 6,371,008.8 m) ----------
create or replace function public.haversine_m(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
returns double precision language sql immutable parallel safe as $$
  select 2 * 6371008.8 * asin(least(1.0, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)
  )));
$$;

-- ---------- state transitions ----------
create or replace function public.journeys_before_write() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.user_id <> auth.uid() then raise exception 'Journey must belong to the caller' using errcode = '42501'; end if;
    if not public.can_edit_trip(new.trip_id) then raise exception 'Not allowed to track this trip' using errcode = '42501'; end if;
    new.status := 'recording'; new.started_at := now(); new.paused_at := null; new.resumed_at := null; new.ended_at := null;
    new.paused_seconds := 0; new.distance_meters := 0; new.duration_seconds := 0;
    return new;
  end if;
  -- immutable identity
  new.trip_id := old.trip_id; new.user_id := old.user_id; new.client_session_id := old.client_session_id; new.started_at := old.started_at;
  -- stats are server-computed only
  if not public.is_privileged_context() then
    new.distance_meters := old.distance_meters; new.duration_seconds := old.duration_seconds; new.paused_seconds := old.paused_seconds;
  end if;
  if old.status = 'stopped' then
    if new.status <> 'stopped' then raise exception 'A stopped journey cannot be resumed; start a new one' using errcode = '22023'; end if;
    new.ended_at := old.ended_at; new.paused_at := old.paused_at;
    return new;
  end if;
  if new.status = old.status then return new; end if;
  if old.status = 'recording' and new.status = 'paused' then
    new.paused_at := now();
  elsif old.status = 'paused' and new.status = 'recording' then
    new.paused_seconds := old.paused_seconds + greatest(0, extract(epoch from now() - old.paused_at))::int;
    new.resumed_at := now(); new.paused_at := null;
  elsif new.status = 'stopped' then
    new.ended_at := now();
    if old.status = 'paused' then
      new.paused_seconds := old.paused_seconds + greatest(0, extract(epoch from now() - old.paused_at))::int;
    end if;
    new.duration_seconds := greatest(0, extract(epoch from new.ended_at - old.started_at)::int - new.paused_seconds);
    new.paused_at := null;
  end if;
  return new;
end $$;
create trigger journeys_bw before insert or update on public.journeys for each row execute function public.journeys_before_write();

-- Keep trips.tracking_status in sync (runs as owner so the trips guard allows it)
create or replace function public.journeys_after_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.raise_privileged();
  update public.trips set tracking_status =
    case new.status when 'recording' then 'recording'::public.tracking_status
                    when 'paused' then 'paused'::public.tracking_status
                    else 'stopped'::public.tracking_status end,
    status = case when new.status in ('recording', 'paused') and status in ('draft', 'planned') then 'active'::public.trip_status else status end
  where id = new.trip_id;
  return new;
end $$;
create trigger journeys_aw after insert or update of status on public.journeys for each row execute function public.journeys_after_write();

-- ---------- point validation: no collection outside an authorised session ----------
create or replace function public.journey_points_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare j public.journeys;
begin
  select * into j from public.journeys where id = new.journey_id;
  if j.id is null or (j.user_id is distinct from auth.uid() and not public.is_privileged_context()) then
    raise exception 'Journey not found' using errcode = '42501';
  end if;
  if new.recorded_at < j.started_at - interval '1 minute' then raise exception 'Point predates journey' using errcode = '22023'; end if;
  if j.status = 'stopped' and (new.recorded_at > j.ended_at + interval '1 minute' or now() > j.ended_at + interval '7 days') then
    raise exception 'Journey is closed to new points' using errcode = '22023';
  end if;
  if new.recorded_at > now() + interval '5 minutes' then raise exception 'Point is in the future' using errcode = '22023'; end if;
  return new;
end $$;
create trigger journey_points_bi before insert on public.journey_points for each row execute function public.journey_points_before_insert();

-- ---------- stats (mirrors packages/business-logic computeJourneyStats) ----------
create or replace function public.recompute_journey_stats(p_journey uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  j public.journeys;
  r record;
  max_acc double precision; min_move double precision; max_speed double precision;
  last_lat double precision; last_lon double precision; last_ts timestamptz;
  total double precision := 0; d double precision; dt double precision;
begin
  select * into j from public.journeys where id = p_journey;
  if j.id is null then raise exception 'Journey not found' using errcode = '42501'; end if;
  if j.user_id is distinct from auth.uid() and not public.is_privileged_context() then raise exception 'Not allowed' using errcode = '42501'; end if;
  max_acc := coalesce((j.recording_settings ->> 'max_accuracy_m')::double precision, 50);
  min_move := coalesce((j.recording_settings ->> 'min_move_m')::double precision, 5);
  max_speed := coalesce((j.recording_settings ->> 'max_speed_mps')::double precision, 70);
  for r in select latitude, longitude, accuracy_meters, recorded_at from public.journey_points where journey_id = p_journey order by sequence_number loop
    if r.accuracy_meters is not null and r.accuracy_meters > max_acc then continue; end if;
    if last_ts is null then last_lat := r.latitude; last_lon := r.longitude; last_ts := r.recorded_at; continue; end if;
    dt := extract(epoch from r.recorded_at - last_ts);
    if dt <= 0 then continue; end if;                      -- duplicate / clock went backwards
    d := public.haversine_m(last_lat, last_lon, r.latitude, r.longitude);
    if d < greatest(min_move, coalesce(r.accuracy_meters, 0) * 0.5) then continue; end if;   -- jitter
    if d / dt > max_speed then continue; end if;           -- implausible jump
    total := total + d; last_lat := r.latitude; last_lon := r.longitude; last_ts := r.recorded_at;
  end loop;
  perform public.raise_privileged();
  update public.journeys set distance_meters = round(total)::int where id = p_journey;
  return round(total)::int;
end $$;

-- ---------- idempotent batch sync ----------
-- p_points: [{ "seq": int, "t": iso8601, "lat": num, "lng": num, "acc": num?, "alt": num?, "spd": num? }, ...]
create or replace function public.sync_journey_points(p_journey uuid, p_points jsonb) returns jsonb
language plpgsql security invoker as $$
declare
  p jsonb; n_ins int := 0; n_dup int := 0; n_rej int := 0; c int; dist int;
begin
  if jsonb_typeof(p_points) <> 'array' then raise exception 'points must be an array' using errcode = '22023'; end if;
  if jsonb_array_length(p_points) > 500 then raise exception 'Batch too large (max 500)' using errcode = '22023'; end if;
  for p in select * from jsonb_array_elements(p_points) loop
    begin
      insert into public.journey_points (journey_id, sequence_number, recorded_at, latitude, longitude, accuracy_meters, altitude, speed_meters_per_second)
      values (p_journey, (p ->> 'seq')::int, (p ->> 't')::timestamptz, (p ->> 'lat')::double precision, (p ->> 'lng')::double precision,
              (p ->> 'acc')::real, (p ->> 'alt')::real, (p ->> 'spd')::real)
      on conflict (journey_id, sequence_number) do nothing;
      get diagnostics c = row_count;
      if c = 1 then n_ins := n_ins + 1; else n_dup := n_dup + 1; end if;
    exception when others then
      if sqlstate = '42501' then raise; end if;   -- authorisation errors abort the whole batch
      n_rej := n_rej + 1;                         -- malformed point: rejected individually
    end;
  end loop;
  dist := public.recompute_journey_stats(p_journey);
  return jsonb_build_object('inserted', n_ins, 'duplicates', n_dup, 'rejected', n_rej, 'distance_meters', dist);
end $$;

-- ---------- idempotent start ----------
create or replace function public.start_journey(p_trip uuid, p_client_session_id uuid, p_settings jsonb default null) returns public.journeys
language plpgsql security invoker as $$
declare j public.journeys;
begin
  select * into j from public.journeys where user_id = auth.uid() and client_session_id = p_client_session_id;
  if found then return j; end if;
  insert into public.journeys (trip_id, user_id, client_session_id, recording_settings)
  values (p_trip, auth.uid(), p_client_session_id, coalesce(p_settings, '{"max_accuracy_m":50,"min_move_m":5,"max_speed_mps":70}'::jsonb))
  returning * into j;
  return j;
end $$;

-- ---------- retention for raw location data ----------
create or replace function public.purge_expired_journey_points(p_retention_days int default 365) returns int
language plpgsql security definer set search_path = public as $$
declare c int;
begin
  if not public.is_privileged_context() then raise exception 'Not allowed' using errcode = '42501'; end if;
  delete from public.journey_points jp using public.journeys j
  where jp.journey_id = j.id and j.status = 'stopped' and j.ended_at < now() - make_interval(days => p_retention_days);
  get diagnostics c = row_count;
  return c;
end $$;
revoke all on function public.purge_expired_journey_points(int) from public, anon, authenticated;

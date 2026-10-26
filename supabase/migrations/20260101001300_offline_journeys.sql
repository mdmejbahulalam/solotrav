-- 0013: journeys recorded offline must keep their real start/end times when they sync later.
-- The client may supply started_at (start_journey) and ended_at/paused_seconds (finish_journey), but only within
-- strict bounds: never in the future, never older than 7 days at sync time, and consistent with each other.

create or replace function public.journeys_before_write() returns trigger
language plpgsql as $$
declare
  want_start timestamptz := nullif(current_setting('solotrav.journey_started_at', true), '')::timestamptz;
  want_end timestamptz := nullif(current_setting('solotrav.journey_ended_at', true), '')::timestamptz;
  want_paused int := nullif(current_setting('solotrav.journey_paused_seconds', true), '')::int;
begin
  if tg_op = 'INSERT' then
    if new.user_id <> auth.uid() then raise exception 'Journey must belong to the caller' using errcode = '42501'; end if;
    if not public.can_edit_trip(new.trip_id) then raise exception 'Not allowed to track this trip' using errcode = '42501'; end if;
    new.status := 'recording'; new.paused_at := null; new.resumed_at := null; new.ended_at := null;
    new.paused_seconds := 0; new.distance_meters := 0; new.duration_seconds := 0;
    new.started_at := now();
    if want_start is not null then
      if want_start > now() + interval '1 minute' then raise exception 'Start time is in the future' using errcode = '22023'; end if;
      if want_start < now() - interval '7 days' then raise exception 'Journey is too old to sync' using errcode = '22023'; end if;
      new.started_at := want_start;
    end if;
    return new;
  end if;
  new.trip_id := old.trip_id; new.user_id := old.user_id; new.client_session_id := old.client_session_id; new.started_at := old.started_at;
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
    if want_end is not null then
      if want_end > now() + interval '1 minute' then raise exception 'End time is in the future' using errcode = '22023'; end if;
      if want_end < old.started_at then raise exception 'End time precedes the start' using errcode = '22023'; end if;
      new.ended_at := want_end;
    end if;
    if want_paused is not null then
      if want_paused < 0 or want_paused > greatest(0, extract(epoch from new.ended_at - old.started_at)::int) then raise exception 'Invalid paused time' using errcode = '22023'; end if;
      new.paused_seconds := want_paused;
    elsif old.status = 'paused' then
      new.paused_seconds := old.paused_seconds + greatest(0, extract(epoch from new.ended_at - old.paused_at))::int;
    end if;
    new.duration_seconds := greatest(0, extract(epoch from new.ended_at - old.started_at)::int - new.paused_seconds);
    new.paused_at := null;
  end if;
  return new;
end $$;

drop function if exists public.start_journey(uuid, uuid, jsonb);
create or replace function public.start_journey(p_trip uuid, p_client_session_id uuid, p_settings jsonb default null, p_started_at timestamptz default null) returns public.journeys
language plpgsql security invoker as $$
declare j public.journeys;
begin
  select * into j from public.journeys where user_id = auth.uid() and client_session_id = p_client_session_id;
  if found then return j; end if;
  perform set_config('solotrav.journey_started_at', coalesce(p_started_at::text, ''), true);
  insert into public.journeys (trip_id, user_id, client_session_id, recording_settings)
  values (p_trip, auth.uid(), p_client_session_id, coalesce(p_settings, '{"max_accuracy_m":50,"min_move_m":5,"max_speed_mps":70}'::jsonb))
  returning * into j;
  perform set_config('solotrav.journey_started_at', '', true);
  return j;
end $$;

-- Finish a journey with the times measured on the device (works after offline recording).
create or replace function public.finish_journey(p_journey uuid, p_ended_at timestamptz, p_paused_seconds int default 0) returns public.journeys
language plpgsql security invoker as $$
declare j public.journeys;
begin
  select * into j from public.journeys where id = p_journey and user_id = auth.uid();
  if not found then raise exception 'Journey not found' using errcode = '42501'; end if;
  if j.status = 'stopped' then return j; end if;           -- idempotent
  perform set_config('solotrav.journey_ended_at', p_ended_at::text, true);
  perform set_config('solotrav.journey_paused_seconds', coalesce(p_paused_seconds, 0)::text, true);
  update public.journeys set status = 'stopped' where id = p_journey returning * into j;
  perform set_config('solotrav.journey_ended_at', '', true);
  perform set_config('solotrav.journey_paused_seconds', '', true);
  -- the stored distance is recomputed from the synced points
  perform public.recompute_journey_stats(p_journey);
  select * into j from public.journeys where id = p_journey;
  return j;
end $$;

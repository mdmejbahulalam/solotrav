-- 0010: private travel journal (per trip). Private by default; entries can be opted into followers/public visibility.

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 140),
  body text not null default '' check (char_length(body) <= 10000),
  place_name text check (place_name is null or char_length(place_name) <= 120),
  entry_at timestamptz not null default now(),
  is_highlight boolean not null default false,
  visibility public.content_visibility not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journal_not_empty check (char_length(title) > 0 or char_length(body) > 0)
);
create index journal_trip_idx on public.journal_entries (trip_id, entry_at desc);
create index journal_user_idx on public.journal_entries (user_id, entry_at desc);
create trigger journal_updated before update on public.journal_entries for each row execute function public.set_updated_at();

create or replace function public.journal_before_write() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.user_id is distinct from auth.uid() then raise exception 'Entry must belong to the caller' using errcode = '42501'; end if;
    if not public.can_edit_trip(new.trip_id) and public.trip_access_role(new.trip_id) is null then
      raise exception 'You are not a member of this trip' using errcode = '42501';
    end if;
  else
    new.trip_id := old.trip_id; new.user_id := old.user_id;
  end if;
  return new;
end $$;
create trigger journal_bw before insert or update on public.journal_entries for each row execute function public.journal_before_write();

alter table public.journal_entries enable row level security;
create policy journal_select on public.journal_entries for select to authenticated, anon using (
  user_id = auth.uid()
  or (visibility <> 'private' and public.can_view_trip(trip_id) and public.can_view_content(user_id, visibility))
);
create policy journal_insert on public.journal_entries for insert to authenticated with check (user_id = auth.uid());
create policy journal_update on public.journal_entries for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy journal_delete on public.journal_entries for delete to authenticated using (user_id = auth.uid());

-- 0002: profiles, staff roles/permissions, follows, blocks, access helper functions

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  display_name text not null,
  avatar_url text,
  cover_image_url text,
  bio text not null default '',
  home_region text,
  travel_interests text[] not null default '{}',
  account_visibility public.account_visibility not null default 'public',
  account_status public.account_status not null default 'active',
  live_location_sharing text not null default 'off' check (live_location_sharing in ('off', 'followers', 'selected')),
  notification_prefs jsonb not null default '{"likes":true,"comments":true,"follows":true,"messages":true,"trip_updates":true}',
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,30}$'),
  constraint profiles_display_name_len check (char_length(display_name) between 1 and 80),
  constraint profiles_bio_len check (char_length(bio) <= 300),
  constraint profiles_interests_len check (cardinality(travel_interests) <= 12)
);
create unique index profiles_username_key on public.profiles (lower(username));
create index profiles_username_trgm on public.profiles using gin (username extensions.gin_trgm_ops);
create index profiles_display_name_trgm on public.profiles using gin (display_name extensions.gin_trgm_ops);
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();

-- ---------- staff roles & permissions (never client-writable) ----------
create table public.role_permissions (
  role public.app_role not null,
  permission text not null,
  primary key (role, permission)
);
create table public.role_assignments (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

insert into public.role_permissions (role, permission) values
  ('support', 'users.read'),
  ('support', 'reports.read'),
  ('content_moderator', 'users.read'),
  ('content_moderator', 'reports.read'),
  ('content_moderator', 'reports.resolve'),
  ('content_moderator', 'content.remove'),
  ('content_moderator', 'comments.moderate'),
  ('content_manager', 'destinations.manage'),
  ('content_manager', 'featured.manage'),
  ('content_manager', 'hashtags.manage'),
  ('content_manager', 'analytics.read'),
  ('administrator', 'users.read'),
  ('administrator', 'users.suspend'),
  ('administrator', 'reports.read'),
  ('administrator', 'reports.resolve'),
  ('administrator', 'content.remove'),
  ('administrator', 'comments.moderate'),
  ('administrator', 'destinations.manage'),
  ('administrator', 'featured.manage'),
  ('administrator', 'hashtags.manage'),
  ('administrator', 'analytics.read'),
  ('administrator', 'audit.read'),
  ('administrator', 'settings.manage'),
  ('super_administrator', 'users.read'),
  ('super_administrator', 'users.suspend'),
  ('super_administrator', 'reports.read'),
  ('super_administrator', 'reports.resolve'),
  ('super_administrator', 'content.remove'),
  ('super_administrator', 'comments.moderate'),
  ('super_administrator', 'destinations.manage'),
  ('super_administrator', 'featured.manage'),
  ('super_administrator', 'hashtags.manage'),
  ('super_administrator', 'analytics.read'),
  ('super_administrator', 'audit.read'),
  ('super_administrator', 'settings.manage'),
  ('super_administrator', 'roles.manage'),
  ('super_administrator', 'sensitive.location.read');

create or replace function public.has_permission(p_permission text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.role_assignments ra
    join public.role_permissions rp on rp.role = ra.role
    where ra.user_id = auth.uid() and rp.permission = p_permission
  );
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.role_assignments where user_id = auth.uid());
$$;

-- ---------- follows ----------
create table public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  status public.follow_status not null default 'accepted',
  created_at timestamptz not null default now(),
  constraint follows_no_self check (follower_id <> following_id),
  constraint follows_unique unique (follower_id, following_id)
);
create index follows_following_idx on public.follows (following_id, status);
create index follows_follower_idx on public.follows (follower_id, status);

-- ---------- blocks ----------
create table public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_no_self check (blocker_id <> blocked_id)
);
create index user_blocks_blocked_idx on public.user_blocks (blocked_id);

-- ---------- access helpers (SECURITY DEFINER so policies do not recurse) ----------
create or replace function public.blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

create or replace function public.is_accepted_follower(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.follows
    where follower_id = auth.uid() and following_id = p_owner and status = 'accepted'
  );
$$;

create or replace function public.is_active_profile(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = p_user and account_status = 'active');
$$;

-- Effective visibility = most restrictive of the content's visibility and the author's account visibility.
create or replace function public.can_view_content(p_owner uuid, p_visibility public.content_visibility) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  acct public.account_visibility;
  st public.account_status;
begin
  if me is not null and me = p_owner then return true; end if;
  select account_visibility, account_status into acct, st from public.profiles where id = p_owner;
  if st is distinct from 'active' then return false; end if;
  if me is not null and public.blocked_between(me, p_owner) then return false; end if;
  if p_visibility = 'private' then return false; end if;
  if p_visibility = 'followers' then return me is not null and public.is_accepted_follower(p_owner); end if;
  -- content marked public
  if acct = 'private' then return me is not null and public.is_accepted_follower(p_owner); end if;
  return true;
end $$;

-- ---------- new-user hook: creates a profile from signup metadata ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base text;
  candidate text;
  n int := 0;
begin
  base := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1), 'traveler'), '[^a-zA-Z0-9_]', '', 'g'));
  if char_length(base) < 3 then base := 'traveler' || substr(replace(new.id::text, '-', ''), 1, 6); end if;
  base := substr(base, 1, 24);
  candidate := base;
  while exists (select 1 from public.profiles where lower(username) = candidate) loop
    n := n + 1;
    candidate := base || n::text;
  end loop;
  insert into public.profiles (id, username, display_name)
  values (new.id, candidate, coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), candidate));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Username availability (callable by anon during signup; reveals existence of a username only)
create or replace function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_username ~ '^[a-z0-9_]{3,30}$' and not exists (select 1 from public.profiles where lower(username) = lower(p_username));
$$;

-- ---------- follow rules ----------
create or replace function public.follows_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare acct public.account_visibility; st public.account_status;
begin
  select account_visibility, account_status into acct, st from public.profiles where id = new.following_id;
  if st is distinct from 'active' then raise exception 'Cannot follow this account' using errcode = '42501'; end if;
  if public.blocked_between(new.follower_id, new.following_id) then
    raise exception 'Cannot follow this account' using errcode = '42501';
  end if;
  -- the client can never choose the status
  new.status := case when acct = 'private' then 'pending' else 'accepted' end;
  return new;
end $$;
create trigger follows_bi before insert on public.follows for each row execute function public.follows_before_insert();

create or replace function public.follows_before_update() returns trigger
language plpgsql as $$
begin
  if new.follower_id <> old.follower_id or new.following_id <> old.following_id then
    raise exception 'Immutable columns' using errcode = '42501';
  end if;
  if old.status = 'accepted' and new.status = 'pending' then
    raise exception 'Invalid transition' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger follows_bu before update on public.follows for each row execute function public.follows_before_update();

-- Blocking removes follow relationships in both directions
create or replace function public.blocks_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and following_id = new.blocked_id)
     or (follower_id = new.blocked_id and following_id = new.blocker_id);
  return new;
end $$;
create trigger blocks_ai after insert on public.user_blocks for each row execute function public.blocks_after_insert();

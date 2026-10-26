-- 0006: conversations, messages, notifications (server-created), push tokens

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz
);
create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on public.conversation_members (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '',
  shared_item_type text check (shared_item_type in ('trip', 'destination')),
  shared_item_id uuid,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint messages_body_len check (char_length(body) <= 2000),
  constraint messages_not_empty check (char_length(body) > 0 or shared_item_id is not null)
);
create index messages_conv_idx on public.messages (conversation_id, created_at desc, id desc);

create table public.message_media (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  storage_path text not null,
  media_type public.media_type not null default 'image'
);

create or replace function public.is_conversation_member(p_conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.conversation_members where conversation_id = p_conv and user_id = auth.uid());
$$;

create or replace function public.create_direct_conversation(p_other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); conv uuid;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_other = me then raise exception 'Cannot message yourself' using errcode = '22023'; end if;
  if not public.is_active_profile(p_other) or public.blocked_between(me, p_other) then
    raise exception 'You cannot message this user' using errcode = '42501';
  end if;
  select c.id into conv from public.conversations c
  where not c.is_group
    and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = me)
    and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = p_other)
  limit 1;
  if conv is not null then return conv; end if;
  insert into public.conversations (created_by) values (me) returning id into conv;
  insert into public.conversation_members (conversation_id, user_id) values (conv, me), (conv, p_other);
  return conv;
end $$;

create or replace function public.messages_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare other uuid;
begin
  if new.sender_id <> auth.uid() then raise exception 'Sender must be the caller' using errcode = '42501'; end if;
  if not public.is_conversation_member(new.conversation_id) then raise exception 'Not a member' using errcode = '42501'; end if;
  for other in select user_id from public.conversation_members where conversation_id = new.conversation_id and user_id <> new.sender_id loop
    if public.blocked_between(new.sender_id, other) then raise exception 'You cannot message this user' using errcode = '42501'; end if;
  end loop;
  new.deleted_at := null;
  return new;
end $$;
create trigger messages_bi before insert on public.messages for each row execute function public.messages_before_insert();

create or replace function public.messages_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end $$;
create trigger messages_ai after insert on public.messages for each row execute function public.messages_after_insert();

-- ---------- notifications ----------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete cascade,
  notification_type public.notification_type not null,
  entity_type text not null,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
  -- No coordinates or message text are ever stored here.
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx on public.notifications (recipient_id) where read_at is null;
create unique index notifications_dedupe on public.notifications (recipient_id, notification_type, coalesce(actor_id, '00000000-0000-0000-0000-000000000000'::uuid), entity_type, coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where notification_type in ('follow', 'follow_request', 'follow_accepted', 'like', 'trip_invite');

create or replace function public.create_notification(p_recipient uuid, p_actor uuid, p_type public.notification_type, p_entity_type text, p_entity_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare prefs jsonb; key text;
begin
  if p_recipient is null or p_recipient = p_actor then return; end if;
  if p_actor is not null and public.blocked_between(p_recipient, p_actor) then return; end if;
  select notification_prefs into prefs from public.profiles where id = p_recipient and account_status = 'active';
  if prefs is null then return; end if;
  key := case p_type when 'like' then 'likes' when 'comment' then 'comments' when 'mention' then 'comments'
    when 'follow' then 'follows' when 'follow_request' then 'follows' when 'follow_accepted' then 'follows'
    when 'message' then 'messages' when 'trip_update' then 'trip_updates' else null end;
  if key is not null and coalesce((prefs ->> key)::boolean, true) = false then return; end if;
  insert into public.notifications (recipient_id, actor_id, notification_type, entity_type, entity_id)
  values (p_recipient, p_actor, p_type, p_entity_type, p_entity_id)
  on conflict do nothing;
end $$;
revoke all on function public.create_notification(uuid, uuid, public.notification_type, text, uuid) from public, anon, authenticated;

create or replace function public.notify_follow() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.create_notification(new.following_id, new.follower_id, case new.status when 'pending' then 'follow_request' else 'follow' end::public.notification_type, 'profile', new.follower_id);
  elsif old.status = 'pending' and new.status = 'accepted' then
    perform public.create_notification(new.follower_id, new.following_id, 'follow_accepted', 'profile', new.following_id);
  end if;
  return new;
end $$;
create trigger follows_notify after insert or update of status on public.follows for each row execute function public.notify_follow();

create or replace function public.notify_reaction() returns trigger
language plpgsql security definer set search_path = public as $$
declare a uuid;
begin
  select author_id into a from public.posts where id = new.post_id;
  perform public.create_notification(a, new.user_id, 'like', 'post', new.post_id);
  return new;
end $$;
create trigger reactions_notify after insert on public.reactions for each row execute function public.notify_reaction();

create or replace function public.notify_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare a uuid; pa uuid; m text[]; mentioned uuid;
begin
  select author_id into a from public.posts where id = new.post_id;
  perform public.create_notification(a, new.author_id, 'comment', 'post', new.post_id);
  if new.parent_comment_id is not null then
    select author_id into pa from public.comments where id = new.parent_comment_id;
    if pa is distinct from a then perform public.create_notification(pa, new.author_id, 'comment', 'post', new.post_id); end if;
  end if;
  for m in select regexp_matches(lower(new.body), '(?:^|[^a-z0-9_])@([a-z0-9_]{3,30})', 'g') loop
    select id into mentioned from public.profiles where lower(username) = m[1];
    if mentioned is not null then
      perform public.create_notification(mentioned, new.author_id, 'mention', 'post', new.post_id);
    end if;
  end loop;
  return new;
end $$;
create trigger comments_notify after insert on public.comments for each row execute function public.notify_comment();

create or replace function public.notify_trip_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.invitation_status = 'invited' then
    perform public.create_notification(new.user_id, new.invited_by, 'trip_invite', 'trip', new.trip_id);
  elsif tg_op = 'UPDATE' and old.invitation_status = 'invited' and new.invitation_status <> 'invited' then
    perform public.create_notification((select owner_id from public.trips where id = new.trip_id), new.user_id, 'trip_update', 'trip', new.trip_id);
  end if;
  return new;
end $$;
create trigger trip_members_notify after insert or update of invitation_status on public.trip_members for each row execute function public.notify_trip_member();

create or replace function public.notify_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare other uuid;
begin
  for other in select user_id from public.conversation_members where conversation_id = new.conversation_id and user_id <> new.sender_id loop
    perform public.create_notification(other, new.sender_id, 'message', 'conversation', new.conversation_id);
  end loop;
  return new;
end $$;
create trigger messages_notify after insert on public.messages for each row execute function public.notify_message();

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique check (char_length(token) between 10 and 400),
  platform text not null check (platform in ('android', 'ios', 'web')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.notifications;
  end if;
end $$;

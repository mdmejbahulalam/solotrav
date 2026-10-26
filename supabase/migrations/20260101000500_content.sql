-- 0005: posts, media, reactions, comments, hashtags, collections, saved items, featured content

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  trip_id uuid references public.trips (id) on delete set null,
  destination_id uuid references public.destinations (id) on delete set null,
  stop_id uuid references public.trip_stops (id) on delete set null,
  post_type public.post_type not null default 'text',
  caption text not null default '',
  visibility public.content_visibility not null default 'public',
  publication_status public.publication_status not null default 'published',
  -- Precise coordinates are NEVER stored on posts. Only a named place (destination_id) can be tagged.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint posts_caption_len check (char_length(caption) <= 2000)
);
create index posts_author_idx on public.posts (author_id, created_at desc);
create index posts_feed_idx on public.posts (created_at desc, id desc) where publication_status = 'published';
create index posts_trip_idx on public.posts (trip_id) where trip_id is not null;
create index posts_destination_idx on public.posts (destination_id) where destination_id is not null;
create index posts_caption_trgm on public.posts using gin (caption extensions.gin_trgm_ops);
create trigger posts_updated before update on public.posts for each row execute function public.set_updated_at();

create or replace function public.posts_before_write() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.author_id is distinct from auth.uid() and not public.is_privileged_context() then raise exception 'Author must be the caller' using errcode = '42501'; end if;
    if new.publication_status = 'removed' then new.publication_status := 'draft'; end if;
  else
    new.author_id := old.author_id;
    -- users cannot un-remove moderated content or remove it themselves via status (they delete instead)
    if old.publication_status = 'removed' and not public.is_privileged_context() then new.publication_status := 'removed'; end if;
    if new.publication_status = 'removed' and old.publication_status <> 'removed' and not public.is_privileged_context() then
      raise exception 'Use delete to remove your own post' using errcode = '42501';
    end if;
  end if;
  if new.trip_id is not null and not public.is_privileged_context() and not (
    public.can_edit_trip(new.trip_id) or exists (select 1 from public.trip_members m where m.trip_id = new.trip_id and m.user_id = new.author_id and m.invitation_status = 'accepted')
  ) then
    raise exception 'You cannot attach this trip' using errcode = '42501';
  end if;
  if new.publication_status = 'published' and new.published_at is null then new.published_at := now(); end if;
  return new;
end $$;
create trigger posts_bw before insert or update on public.posts for each row execute function public.posts_before_write();

create or replace function public.can_view_post(p_post uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.posts p
    where p.id = p_post and (
      p.author_id = auth.uid()
      or (p.publication_status = 'published' and public.can_view_content(p.author_id, p.visibility))
    )
  );
$$;

create table public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  storage_path text not null,
  media_type public.media_type not null,
  width int check (width is null or width between 1 and 20000),
  height int check (height is null or height between 1 and 20000),
  duration_seconds int check (duration_seconds is null or duration_seconds between 0 and 600),
  alt_text text not null default '' check (char_length(alt_text) <= 300),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index post_media_post_idx on public.post_media (post_id, sort_order);

create or replace function public.post_media_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare a uuid;
begin
  select author_id into a from public.posts where id = new.post_id;
  -- storage paths are generated as '<author_uuid>/<uuid>.<ext>'; the first folder must be the post author
  if split_part(new.storage_path, '/', 1) <> a::text then raise exception 'Invalid storage path' using errcode = '22023'; end if;
  if new.storage_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|mp4|mov|webm)$' then raise exception 'Invalid storage path' using errcode = '22023'; end if;
  return new;
end $$;
create trigger post_media_bi before insert on public.post_media for each row execute function public.post_media_before_insert();

create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  reaction_type public.reaction_type not null default 'like',
  created_at timestamptz not null default now(),
  constraint reactions_one_per_user unique (user_id, post_id)
);
create index reactions_post_idx on public.reactions (post_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  parent_comment_id uuid references public.comments (id) on delete cascade,
  body text not null,
  status public.comment_status not null default 'visible',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comments_body_len check (char_length(body) between 1 and 1000)
);
create index comments_post_idx on public.comments (post_id, created_at);
create index comments_parent_idx on public.comments (parent_comment_id) where parent_comment_id is not null;
create trigger comments_updated before update on public.comments for each row execute function public.set_updated_at();

create or replace function public.comments_before_write() returns trigger
language plpgsql security invoker set search_path = public as $$
declare pp uuid; pd uuid;
begin
  if tg_op = 'INSERT' then
    if new.parent_comment_id is not null then
      select post_id, parent_comment_id into pp, pd from public.comments where id = new.parent_comment_id;
      if pp is distinct from new.post_id then raise exception 'Parent comment belongs to another post' using errcode = '22023'; end if;
      if pd is not null then raise exception 'Replies can only be one level deep' using errcode = '22023'; end if;
    end if;
    new.status := 'visible';
  else
    new.post_id := old.post_id; new.author_id := old.author_id; new.parent_comment_id := old.parent_comment_id;
    if not public.is_privileged_context() then new.status := old.status; end if;
  end if;
  return new;
end $$;
create trigger comments_bw before insert or update on public.comments for each row execute function public.comments_before_write();

-- ---------- hashtags ----------
create table public.hashtags (
  id uuid primary key default gen_random_uuid(),
  tag text not null unique check (tag ~ '^[a-z0-9_]{1,50}$'),
  is_blocked boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.post_hashtags (
  post_id uuid not null references public.posts (id) on delete cascade,
  hashtag_id uuid not null references public.hashtags (id) on delete cascade,
  primary key (post_id, hashtag_id)
);
create index post_hashtags_tag_idx on public.post_hashtags (hashtag_id);

create or replace function public.posts_sync_hashtags() returns trigger
language plpgsql security definer set search_path = public as $$
declare m text[]; hid uuid;
begin
  delete from public.post_hashtags where post_id = new.id;
  for m in select regexp_matches(lower(new.caption), '(?:^|[^a-z0-9_&])#([a-z0-9_]{1,50})', 'g') loop
    insert into public.hashtags (tag) values (m[1]) on conflict (tag) do nothing;
    select id into hid from public.hashtags where tag = m[1];
    insert into public.post_hashtags (post_id, hashtag_id) values (new.id, hid) on conflict do nothing;
  end loop;
  return new;
end $$;
create trigger posts_hashtags after insert or update of caption on public.posts for each row execute function public.posts_sync_hashtags();

-- ---------- collections & saved items ----------
create table public.collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 300),
  visibility public.content_visibility not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index collections_owner_idx on public.collections (owner_id);
create trigger collections_updated before update on public.collections for each row execute function public.set_updated_at();

create table public.saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  item_type public.saved_item_type not null,
  item_id uuid not null,
  collection_id uuid references public.collections (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint saved_items_unique unique (user_id, item_type, item_id)
);
create index saved_items_user_idx on public.saved_items (user_id, item_type, created_at desc);

-- Polymorphic reference integrity: the item must exist AND be accessible to the saver.
create or replace function public.saved_items_before_write() returns trigger
language plpgsql security invoker set search_path = public as $$
declare ok boolean;
begin
  if new.user_id is distinct from auth.uid() and not public.is_privileged_context() then raise exception 'Not allowed' using errcode = '42501'; end if;
  ok := case new.item_type
    when 'destination' then exists (select 1 from public.destinations where id = new.item_id and is_published)
    when 'trip' then public.can_view_trip(new.item_id)
    when 'post' then public.can_view_post(new.item_id)
  end;
  if not coalesce(ok, false) then raise exception 'Item not found or not accessible' using errcode = '22023'; end if;
  if new.collection_id is not null and not exists (select 1 from public.collections where id = new.collection_id and owner_id = new.user_id) then
    raise exception 'Collection not found' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger saved_items_bw before insert or update on public.saved_items for each row execute function public.saved_items_before_write();

-- ---------- featured content (curated by staff) ----------
create table public.featured_items (
  id uuid primary key default gen_random_uuid(),
  item_type text not null check (item_type in ('destination', 'trip')),
  item_id uuid not null,
  position int not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (item_type, item_id)
);

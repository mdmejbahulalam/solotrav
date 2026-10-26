-- 0011: posts of one author, same row shape as get_home_feed (RLS enforces visibility, blocks, private accounts)
create or replace function public.get_profile_posts(p_user uuid, p_limit int default 20, p_before timestamptz default null, p_before_id uuid default null)
returns table (
  post_id uuid, author_id uuid, username text, display_name text, avatar_url text, post_type public.post_type, caption text,
  destination_id uuid, trip_id uuid, created_at timestamptz, like_count bigint, comment_count bigint, liked_by_me boolean, saved_by_me boolean
) language sql stable security invoker as $$
  select p.id, p.author_id, pr.username, pr.display_name, pr.avatar_url, p.post_type, p.caption, p.destination_id, p.trip_id, p.created_at,
         (select count(*) from public.reactions r where r.post_id = p.id),
         (select count(*) from public.comments c where c.post_id = p.id and c.status = 'visible'),
         exists (select 1 from public.reactions r where r.post_id = p.id and r.user_id = auth.uid()),
         exists (select 1 from public.saved_items s where s.item_type = 'post' and s.item_id = p.id and s.user_id = auth.uid())
  from public.posts p
  join public.profiles pr on pr.id = p.author_id
  where p.author_id = p_user and p.publication_status = 'published'
    and (p_before is null or (p.created_at, p.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by p.created_at desc, p.id desc
  limit least(greatest(p_limit, 1), 50);
$$;

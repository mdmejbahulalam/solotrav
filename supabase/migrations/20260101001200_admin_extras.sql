-- 0012: remaining staff operations (hashtags, settings, analytics series, content review lists). All permission-checked + audited.

create or replace function public.admin_set_hashtag_blocked(p_tag text, p_blocked boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_permission('hashtags.manage');
  if char_length(coalesce(p_reason, '')) < 5 then raise exception 'A reason is required' using errcode = '22023'; end if;
  update public.hashtags set is_blocked = p_blocked where tag = lower(p_tag);
  perform public.write_audit('hashtag.' || case when p_blocked then 'block' else 'unblock' end, 'hashtag', lower(p_tag), p_reason);
end $$;

create or replace function public.admin_list_hashtags(p_limit int default 50) returns table (tag text, uses bigint, is_blocked boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_permission('hashtags.manage');
  -- counts only; no post content is returned
  return query select h.tag, (select count(*) from public.post_hashtags ph where ph.hashtag_id = h.id), h.is_blocked from public.hashtags h order by 2 desc, h.tag limit least(p_limit, 200);
end $$;

create or replace function public.admin_update_setting(p_key text, p_value jsonb, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_permission('settings.manage');
  if char_length(coalesce(p_reason, '')) < 5 then raise exception 'A reason is required' using errcode = '22023'; end if;
  update public.feature_settings set value = p_value, updated_by = auth.uid(), updated_at = now() where key = p_key;
  if not found then raise exception 'Unknown setting' using errcode = '22023'; end if;
  perform public.write_audit('setting.update', 'setting', p_key, p_reason, jsonb_build_object('value', p_value));
end $$;

-- Daily aggregate counts per event. No user ids, no properties.
create or replace function public.admin_analytics_series(p_days int default 30) returns table (day date, event_name text, events bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_permission('analytics.read');
  return query select (a.created_at at time zone 'utc')::date, a.event_name, count(*) from public.analytics_events a
    where a.created_at > now() - make_interval(days => least(greatest(p_days, 1), 365)) group by 1, 2 order by 1, 2;
end $$;

-- Queue view: report + a SHORT preview of the reported content. Only reported items are ever exposed.
create or replace function public.admin_report_queue(p_status public.report_status default 'open', p_limit int default 25, p_offset int default 0)
returns table (id uuid, target_type public.report_target, target_id uuid, reason text, detail text, status public.report_status, created_at timestamptz,
               reporter_username text, preview text, resolution_note text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_permission('reports.read');
  return query
    select r.id, r.target_type, r.target_id, r.reason, r.detail, r.status, r.created_at, rp.username,
           case r.target_type
             when 'post' then (select left(p.caption, 200) from public.posts p where p.id = r.target_id)
             when 'comment' then (select left(c.body, 200) from public.comments c where c.id = r.target_id)
             when 'profile' then (select '@' || pr.username from public.profiles pr where pr.id = r.target_id)
             when 'trip' then (select left(t.title, 200) from public.trips t where t.id = r.target_id)
             else null end,
           r.resolution_note
    from public.reports r left join public.profiles rp on rp.id = r.reporter_id
    where r.status = p_status order by r.created_at desc limit least(p_limit, 100) offset greatest(p_offset, 0);
end $$;

-- Public content lists for moderators (only content that is already public)
create or replace function public.admin_list_public_posts(p_limit int default 25, p_offset int default 0)
returns table (id uuid, author_username text, caption text, publication_status public.publication_status, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_permission('content.remove');
  return query select p.id, pr.username, left(p.caption, 200), p.publication_status, p.created_at from public.posts p join public.profiles pr on pr.id = p.author_id
    where p.visibility = 'public' and p.publication_status in ('published', 'removed') order by p.created_at desc limit least(p_limit, 100) offset greatest(p_offset, 0);
end $$;

create or replace function public.admin_list_public_trips(p_limit int default 25, p_offset int default 0)
returns table (id uuid, slug text, title text, owner_username text, status public.trip_status, stops bigint, published_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_permission('content.remove');
  return query select t.id, t.slug, t.title, pr.username, t.status, (select count(*) from public.trip_stops s where s.trip_id = t.id), t.published_at
    from public.trips t join public.profiles pr on pr.id = t.owner_id
    where t.visibility = 'public' and t.status in ('planned', 'active', 'completed') order by t.published_at desc nulls last limit least(p_limit, 100) offset greatest(p_offset, 0);
end $$;

create or replace function public.admin_list_recent_comments(p_limit int default 25, p_offset int default 0)
returns table (id uuid, post_id uuid, author_username text, body text, status public.comment_status, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_permission('comments.moderate');
  -- comments on public posts only
  return query select c.id, c.post_id, pr.username, left(c.body, 300), c.status, c.created_at from public.comments c
    join public.profiles pr on pr.id = c.author_id join public.posts p on p.id = c.post_id and p.visibility = 'public'
    order by c.created_at desc limit least(p_limit, 100) offset greatest(p_offset, 0);
end $$;

begin;

-- ============================================================================
-- THINKRIGHT WEEKLY LEADERBOARD (production-grade, incremental, server-side)
-- ============================================================================
-- This migration adds:
-- 1) Weekly projected JAMB rankings
-- 2) Weekly subject rankings
-- 3) Incremental refresh functions + trigger on test_results
-- 4) Read RPCs for top lists + current user's position
--
-- Week format: IYYY-WIW (example: 2026-W07), UTC-based.

-- ----------------------------------------------------------------------------
-- Time helpers
-- ----------------------------------------------------------------------------
create or replace function public.tr_week_id(p_ts timestamptz default now())
returns text
language sql
immutable
as $$
  select to_char((p_ts at time zone 'UTC'), 'IYYY-"W"IW');
$$;

create or replace function public.tr_week_start(p_week_id text)
returns timestamptz
language sql
immutable
as $$
  select (to_date(replace($1, '-W', '-') || '-1', 'IYYY-IW-ID')::timestamp at time zone 'UTC');
$$;

create or replace function public.tr_week_end(p_week_id text)
returns timestamptz
language sql
immutable
as $$
  select public.tr_week_start($1) + interval '7 days';
$$;

create or replace function public.tr_current_week_id()
returns text
language sql
stable
as $$
  select public.tr_week_id(now());
$$;

-- ----------------------------------------------------------------------------
-- Projection helpers
-- ----------------------------------------------------------------------------
create or replace function public.tr_calibrate_projected_score(p_raw_projected integer)
returns integer
language sql
immutable
as $$
  /*
    Sanity example:
    88% -> raw 352 -> calibrated round(352 * 0.85) = 299
  */
  select greatest(
    0,
    least(
      400,
      round(
        greatest(0, least(400, coalesce($1, 0)))::numeric * 0.85
      )::integer
    )
  );
$$;

-- ----------------------------------------------------------------------------
-- Identity helpers
-- ----------------------------------------------------------------------------
create or replace function public.tr_get_username(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_username text;
begin
  if p_user_id is null then
    return 'User';
  end if;

  if to_regclass('public.user_profiles') is not null then
    select nullif(trim(up.username), '')
      into v_username
    from public.user_profiles up
    where up.id = p_user_id;
  end if;

  if coalesce(v_username, '') = '' then
    select nullif(trim((au.raw_user_meta_data ->> 'username')), '')
      into v_username
    from auth.users au
    where au.id = p_user_id;
  end if;

  if coalesce(v_username, '') = '' then
    select nullif(split_part(coalesce(au.email, ''), '@', 1), '')
      into v_username
    from auth.users au
    where au.id = p_user_id;
  end if;

  return coalesce(v_username, 'User');
end;
$$;

create or replace function public.tr_is_admin_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_by_plan boolean := false;
  v_by_meta boolean := false;
begin
  if p_user_id is null then
    return false;
  end if;

  if to_regclass('public.subscriptions') is not null then
    execute '
      select exists (
        select 1
        from public.subscriptions s
        where s.user_id = $1
          and lower(coalesce(s.plan, '''')) = ''admin''
          and lower(coalesce(s.status, ''active'')) = ''active''
      )
    '
    into v_by_plan
    using p_user_id;
  end if;

  select exists (
    select 1
    from auth.users au
    where au.id = p_user_id
      and (
        lower(coalesce(au.raw_user_meta_data ->> 'role', '')) = 'admin'
        or lower(coalesce(au.raw_app_meta_data ->> 'role', '')) = 'admin'
        or lower(coalesce(au.raw_user_meta_data ->> 'is_admin', '')) in ('true', '1', 'yes')
        or lower(coalesce(au.raw_app_meta_data ->> 'is_admin', '')) in ('true', '1', 'yes')
      )
  )
  into v_by_meta;

  return v_by_plan or v_by_meta;
end;
$$;

-- ----------------------------------------------------------------------------
-- Ranking tables
-- ----------------------------------------------------------------------------
create table if not exists public.weekly_projected_rankings (
  week_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  projected_score integer not null check (projected_score >= 0 and projected_score <= 400),
  tests_this_week integer not null check (tests_this_week >= 0),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (week_id, user_id)
);

create table if not exists public.weekly_subject_rankings (
  week_id text not null,
  subject text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  best3_average numeric(5,2) not null check (best3_average >= 0 and best3_average <= 100),
  tests_this_week integer not null check (tests_this_week >= 0),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (week_id, subject, user_id)
);

create index if not exists idx_weekly_projected_lookup
  on public.weekly_projected_rankings (week_id, projected_score desc, tests_this_week desc, updated_at asc, user_id);

create index if not exists idx_weekly_projected_user
  on public.weekly_projected_rankings (user_id, week_id);

create index if not exists idx_weekly_subject_lookup
  on public.weekly_subject_rankings (week_id, subject, best3_average desc, tests_this_week desc, updated_at asc, user_id);

create index if not exists idx_weekly_subject_user
  on public.weekly_subject_rankings (user_id, week_id, subject);

-- ----------------------------------------------------------------------------
-- Refresh functions (incremental, per-user / per-subject)
-- ----------------------------------------------------------------------------
create or replace function public.tr_refresh_weekly_projected(
  p_user_id uuid,
  p_week_id text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_week_id text := coalesce(nullif(trim(p_week_id), ''), public.tr_current_week_id());
  v_week_start timestamptz := public.tr_week_start(v_week_id);
  v_week_end timestamptz := public.tr_week_end(v_week_id);
  v_tests integer := 0;
  v_weighted_avg numeric;
  v_raw_projected integer;
  v_projected integer;
  v_username text;
begin
  if p_user_id is null then
    return;
  end if;

  select count(*)
    into v_tests
  from public.test_results tr
  where tr.user_id = p_user_id
    and tr.completed_at >= v_week_start
    and tr.completed_at < v_week_end;

  if v_tests < 3 then
    delete from public.weekly_projected_rankings
    where week_id = v_week_id
      and user_id = p_user_id;
    return;
  end if;

  with recent as (
    select
      tr.score_percentage::numeric as score,
      row_number() over (order by tr.completed_at desc, tr.id desc) as rn
    from public.test_results tr
    where tr.user_id = p_user_id
      and tr.completed_at >= v_week_start
      and tr.completed_at < v_week_end
  ),
  weighted as (
    select
      r.score,
      w.weight
    from recent r
    join (
      values
        (1, 0.35::numeric),
        (2, 0.25::numeric),
        (3, 0.20::numeric),
        (4, 0.12::numeric),
        (5, 0.08::numeric)
    ) as w(rn, weight) on w.rn = r.rn
  )
  select
    case
      when coalesce(sum(weight), 0) > 0 then sum(score * weight) / sum(weight)
      else null
    end
    into v_weighted_avg
  from weighted;

  if v_weighted_avg is null then
    delete from public.weekly_projected_rankings
    where week_id = v_week_id
      and user_id = p_user_id;
    return;
  end if;

  v_raw_projected := round((v_weighted_avg / 100.0) * 400)::integer;
  v_projected := public.tr_calibrate_projected_score(v_raw_projected);
  v_username := public.tr_get_username(p_user_id);

  insert into public.weekly_projected_rankings (
    week_id, user_id, username, projected_score, tests_this_week, updated_at
  )
  values (
    v_week_id, p_user_id, v_username, v_projected, v_tests, now()
  )
  on conflict (week_id, user_id)
  do update set
    username = excluded.username,
    projected_score = excluded.projected_score,
    tests_this_week = excluded.tests_this_week,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function public.tr_refresh_weekly_subject(
  p_user_id uuid,
  p_subject text,
  p_week_id text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_subject text := lower(trim(coalesce(p_subject, '')));
  v_week_id text := coalesce(nullif(trim(p_week_id), ''), public.tr_current_week_id());
  v_week_start timestamptz := public.tr_week_start(v_week_id);
  v_week_end timestamptz := public.tr_week_end(v_week_id);
  v_tests integer := 0;
  v_best3_avg numeric(5,2);
  v_username text;
begin
  if p_user_id is null or v_subject = '' then
    return;
  end if;

  select count(*)
    into v_tests
  from public.test_results tr
  where tr.user_id = p_user_id
    and lower(trim(coalesce(tr.subject, ''))) = v_subject
    and tr.completed_at >= v_week_start
    and tr.completed_at < v_week_end;

  if v_tests < 2 then
    delete from public.weekly_subject_rankings
    where week_id = v_week_id
      and subject = v_subject
      and user_id = p_user_id;
    return;
  end if;

  with best_three as (
    select tr.score_percentage::numeric as score
    from public.test_results tr
    where tr.user_id = p_user_id
      and lower(trim(coalesce(tr.subject, ''))) = v_subject
      and tr.completed_at >= v_week_start
      and tr.completed_at < v_week_end
    order by tr.score_percentage desc, tr.completed_at asc, tr.id asc
    limit 3
  )
  select round(avg(score)::numeric, 2)
    into v_best3_avg
  from best_three;

  if v_best3_avg is null then
    delete from public.weekly_subject_rankings
    where week_id = v_week_id
      and subject = v_subject
      and user_id = p_user_id;
    return;
  end if;

  v_username := public.tr_get_username(p_user_id);

  insert into public.weekly_subject_rankings (
    week_id, subject, user_id, username, best3_average, tests_this_week, updated_at
  )
  values (
    v_week_id, v_subject, p_user_id, v_username, v_best3_avg, v_tests, now()
  )
  on conflict (week_id, subject, user_id)
  do update set
    username = excluded.username,
    best3_average = excluded.best3_average,
    tests_this_week = excluded.tests_this_week,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function public.tr_refresh_rankings_for_result(
  p_user_id uuid,
  p_subject text,
  p_completed_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_week_id text;
begin
  if p_user_id is null then
    return;
  end if;

  v_week_id := public.tr_week_id(coalesce(p_completed_at, now()));

  perform public.tr_refresh_weekly_projected(p_user_id, v_week_id);
  perform public.tr_refresh_weekly_subject(p_user_id, p_subject, v_week_id);
end;
$$;

-- ----------------------------------------------------------------------------
-- Trigger on test_results (incremental updates, idempotent-safe)
-- ----------------------------------------------------------------------------
create or replace function public.tr_test_results_after_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if tg_op = 'INSERT' then
    perform public.tr_refresh_rankings_for_result(new.user_id, new.subject, new.completed_at);
    return new;
  end if;

  if tg_op = 'UPDATE' then
    perform public.tr_refresh_rankings_for_result(new.user_id, new.subject, new.completed_at);

    if old.user_id is distinct from new.user_id
      or public.tr_week_id(old.completed_at) is distinct from public.tr_week_id(new.completed_at)
      or lower(trim(coalesce(old.subject, ''))) is distinct from lower(trim(coalesce(new.subject, '')))
    then
      perform public.tr_refresh_rankings_for_result(old.user_id, old.subject, old.completed_at);
    end if;

    return new;
  end if;

  return coalesce(new, old);
end;
$$;

do $$
begin
  if to_regclass('public.test_results') is not null then
    execute 'drop trigger if exists trg_test_results_refresh_weekly_rankings on public.test_results';
    execute '
      create trigger trg_test_results_refresh_weekly_rankings
      after insert or update of user_id, subject, score_percentage, completed_at
      on public.test_results
      for each row
      execute function public.tr_test_results_after_change()
    ';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Username sync when profile username changes (optional, safe)
-- ----------------------------------------------------------------------------
create or replace function public.tr_sync_ranking_username()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_username text;
begin
  if new.username is distinct from old.username or new.email is distinct from old.email then
    v_username := public.tr_get_username(new.id);

    update public.weekly_projected_rankings
      set username = v_username,
          updated_at = now()
    where user_id = new.id;

    update public.weekly_subject_rankings
      set username = v_username,
          updated_at = now()
    where user_id = new.id;
  end if;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.user_profiles') is not null then
    execute 'drop trigger if exists trg_user_profiles_sync_ranking_username on public.user_profiles';
    execute '
      create trigger trg_user_profiles_sync_ranking_username
      after update of username, email
      on public.user_profiles
      for each row
      execute function public.tr_sync_ranking_username()
    ';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- One-time bootstrap for the current week (safe to re-run)
-- ----------------------------------------------------------------------------
do $$
declare
  v_week_id text := public.tr_current_week_id();
  v_user uuid;
  v_subject text;
begin
  if to_regclass('public.test_results') is not null then
    for v_user in
      select distinct tr.user_id
      from public.test_results tr
      where tr.completed_at >= public.tr_week_start(v_week_id)
        and tr.completed_at < public.tr_week_end(v_week_id)
    loop
      perform public.tr_refresh_weekly_projected(v_user, v_week_id);
    end loop;

    for v_user, v_subject in
      select distinct tr.user_id, lower(trim(coalesce(tr.subject, '')))
      from public.test_results tr
      where tr.completed_at >= public.tr_week_start(v_week_id)
        and tr.completed_at < public.tr_week_end(v_week_id)
        and coalesce(trim(tr.subject), '') <> ''
    loop
      perform public.tr_refresh_weekly_subject(v_user, v_subject, v_week_id);
    end loop;
  end if;
end;
$$;

-- Admin users are included in rankings.

-- ----------------------------------------------------------------------------
-- Read functions for leaderboard UI
-- ----------------------------------------------------------------------------
create or replace function public.leaderboard_get_top_projected(
  p_week_id text default null,
  p_limit integer default 10
)
returns table (
  rank bigint,
  user_id uuid,
  username text,
  projected_score integer,
  tests_this_week integer,
  week_id text
)
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select
      row_number() over (
        order by r.projected_score desc, r.tests_this_week desc, r.updated_at asc, r.user_id asc
      ) as rank,
      r.user_id,
      r.username,
      r.projected_score,
      r.tests_this_week,
      r.week_id
    from public.weekly_projected_rankings r
    where r.week_id = coalesce(nullif(trim(p_week_id), ''), public.tr_current_week_id())
  )
  select
    ranked.rank,
    ranked.user_id,
    ranked.username,
    ranked.projected_score,
    ranked.tests_this_week,
    ranked.week_id
  from ranked
  order by ranked.rank
  limit greatest(1, least(coalesce(p_limit, 10), 100));
$$;

create or replace function public.leaderboard_get_my_projected_rank(
  p_user_id uuid default null,
  p_week_id text default null
)
returns table (
  rank bigint,
  user_id uuid,
  username text,
  projected_score integer,
  tests_this_week integer,
  qualifies boolean,
  message text,
  week_id text
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := coalesce(p_user_id, auth.uid());
  v_week_id text := coalesce(nullif(trim(p_week_id), ''), public.tr_current_week_id());
  v_tests integer := 0;
begin
  if v_user_id is null then
    return query
    select
      null::bigint,
      null::uuid,
      null::text,
      null::integer,
      0::integer,
      false,
      'Please log in to view your ranking.'::text,
      v_week_id;
    return;
  end if;

  select count(*)
    into v_tests
  from public.test_results tr
  where tr.user_id = v_user_id
    and tr.completed_at >= public.tr_week_start(v_week_id)
    and tr.completed_at < public.tr_week_end(v_week_id);

  if v_tests < 3 then
    return query
    select
      null::bigint,
      v_user_id,
      public.tr_get_username(v_user_id),
      null::integer,
      v_tests,
      false,
      'You need at least 3 completed tests this week to appear.'::text,
      v_week_id;
    return;
  end if;

  return query
  with ranked as (
    select
      row_number() over (
        order by r.projected_score desc, r.tests_this_week desc, r.updated_at asc, r.user_id asc
      ) as rank,
      r.user_id,
      r.username,
      r.projected_score,
      r.tests_this_week,
      r.week_id
    from public.weekly_projected_rankings r
    where r.week_id = v_week_id
  )
  select
    ranked.rank,
    ranked.user_id,
    ranked.username,
    ranked.projected_score,
    ranked.tests_this_week,
    true,
    ('Your position this week: #' || ranked.rank)::text,
    ranked.week_id
  from ranked
  where ranked.user_id = v_user_id;

  if not found then
    return query
    select
      null::bigint,
      v_user_id,
      public.tr_get_username(v_user_id),
      null::integer,
      v_tests,
      false,
      'No ranking yet. Complete another valid test to appear soon.'::text,
      v_week_id;
  end if;
end;
$$;

create or replace function public.leaderboard_get_my_weekly_projection_comparison(
  p_user_id uuid default null,
  p_week_id text default null
)
returns table (
  week_id text,
  total_eligible integer,
  avg_projected integer,
  my_projected_score integer,
  my_tests_this_week integer,
  below_me integer,
  percentile integer,
  rank bigint,
  qualifies boolean,
  message text
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := coalesce(p_user_id, auth.uid());
  v_week_id text := coalesce(nullif(trim(p_week_id), ''), public.tr_current_week_id());
  v_tests integer := 0;
  v_total integer := 0;
  v_avg numeric;
  v_my_projected integer;
  v_my_tests integer := 0;
  v_below integer := 0;
  v_rank bigint;
begin
  if v_user_id is null then
    return query
    select
      v_week_id,
      0::integer,
      null::integer,
      null::integer,
      0::integer,
      0::integer,
      0::integer,
      null::bigint,
      false,
      'Take at least 3 tests this week to unlock comparisons.'::text;
    return;
  end if;

  select count(*)
    into v_tests
  from public.test_results tr
  where tr.user_id = v_user_id
    and tr.completed_at >= public.tr_week_start(v_week_id)
    and tr.completed_at < public.tr_week_end(v_week_id);

  if v_tests < 3 then
    return query
    select
      v_week_id,
      0::integer,
      null::integer,
      null::integer,
      v_tests,
      0::integer,
      0::integer,
      null::bigint,
      false,
      'Take at least 3 tests this week to unlock comparisons.'::text;
    return;
  end if;

  select
    r.projected_score,
    r.tests_this_week
    into v_my_projected, v_my_tests
  from public.weekly_projected_rankings r
  where r.week_id = v_week_id
    and r.user_id = v_user_id;

  if v_my_projected is null then
    return query
    select
      v_week_id,
      0::integer,
      null::integer,
      null::integer,
      v_tests,
      0::integer,
      0::integer,
      null::bigint,
      false,
      'Take at least 3 tests this week to unlock comparisons.'::text;
    return;
  end if;

  select
    count(*)::integer,
    avg(r.projected_score)::numeric
    into v_total, v_avg
  from public.weekly_projected_rankings r
  where r.week_id = v_week_id;

  if coalesce(v_total, 0) = 0 then
    return query
    select
      v_week_id,
      0::integer,
      null::integer,
      v_my_projected,
      v_my_tests,
      0::integer,
      0::integer,
      null::bigint,
      false,
      'Take at least 3 tests this week to unlock comparisons.'::text;
    return;
  end if;

  select count(*)::integer
    into v_below
  from public.weekly_projected_rankings r
  where r.week_id = v_week_id
    and r.projected_score < v_my_projected;

  select 1 + count(*)::bigint
    into v_rank
  from public.weekly_projected_rankings r
  where r.week_id = v_week_id
    and (
      r.projected_score > v_my_projected
      or (
        r.projected_score = v_my_projected
        and r.tests_this_week > coalesce(v_my_tests, 0)
      )
    );

  return query
  select
    v_week_id,
    v_total,
    round(v_avg)::integer,
    v_my_projected,
    v_my_tests,
    v_below,
    greatest(
      0,
      least(
        100,
        round((v_below::numeric / nullif(v_total, 0)) * 100)::integer
      )
    ) as percentile,
    v_rank,
    true,
    ('Your rank: #' || v_rank || ' this week')::text;
end;
$$;

create or replace function public.leaderboard_get_my_projection_trend(
  p_user_id uuid default null,
  p_week_id text default null
)
returns table (
  week_id text,
  previous_week_id text,
  current_projected_score integer,
  previous_projected_score integer,
  delta integer,
  qualifies_current boolean,
  qualifies_previous boolean,
  message text
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := coalesce(p_user_id, auth.uid());
  v_week_id text := coalesce(nullif(trim(p_week_id), ''), public.tr_current_week_id());
  v_prev_week_id text := public.tr_week_id(public.tr_week_start(v_week_id) - interval '1 day');
  v_current integer;
  v_previous integer;
begin
  if v_user_id is null then
    return query
    select
      v_week_id,
      v_prev_week_id,
      null::integer,
      null::integer,
      null::integer,
      false,
      false,
      'Please log in to view score trend.'::text;
    return;
  end if;

  select r.projected_score
    into v_current
  from public.weekly_projected_rankings r
  where r.user_id = v_user_id
    and r.week_id = v_week_id;

  if v_current is null then
    return query
    select
      v_week_id,
      v_prev_week_id,
      null::integer,
      null::integer,
      null::integer,
      false,
      false,
      'Take at least 3 tests this week to unlock trend.'::text;
    return;
  end if;

  select r.projected_score
    into v_previous
  from public.weekly_projected_rankings r
  where r.user_id = v_user_id
    and r.week_id = v_prev_week_id;

  return query
  select
    v_week_id,
    v_prev_week_id,
    v_current,
    v_previous,
    case when v_previous is null then null else v_current - v_previous end,
    true,
    (v_previous is not null),
    case
      when v_previous is null then 'New this week'
      when v_current - v_previous = 0 then 'No change this week'
      when v_current - v_previous > 0 then ('Up ' || (v_current - v_previous) || ' this week')
      else ('Down ' || abs(v_current - v_previous) || ' this week')
    end;
end;
$$;

create or replace function public.leaderboard_get_top_subject(
  p_subject text,
  p_week_id text default null,
  p_limit integer default 10
)
returns table (
  rank bigint,
  user_id uuid,
  username text,
  subject text,
  best3_average numeric,
  tests_this_week integer,
  week_id text
)
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select
      row_number() over (
        order by r.best3_average desc, r.tests_this_week desc, r.updated_at asc, r.user_id asc
      ) as rank,
      r.user_id,
      r.username,
      r.subject,
      r.best3_average,
      r.tests_this_week,
      r.week_id
    from public.weekly_subject_rankings r
    where r.week_id = coalesce(nullif(trim(p_week_id), ''), public.tr_current_week_id())
      and r.subject = lower(trim(coalesce(p_subject, '')))
  )
  select
    ranked.rank,
    ranked.user_id,
    ranked.username,
    ranked.subject,
    ranked.best3_average,
    ranked.tests_this_week,
    ranked.week_id
  from ranked
  order by ranked.rank
  limit greatest(1, least(coalesce(p_limit, 10), 100));
$$;

create or replace function public.leaderboard_get_my_subject_rank(
  p_subject text,
  p_user_id uuid default null,
  p_week_id text default null
)
returns table (
  rank bigint,
  user_id uuid,
  username text,
  subject text,
  best3_average numeric,
  tests_this_week integer,
  qualifies boolean,
  message text,
  week_id text
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_subject text := lower(trim(coalesce(p_subject, '')));
  v_user_id uuid := coalesce(p_user_id, auth.uid());
  v_week_id text := coalesce(nullif(trim(p_week_id), ''), public.tr_current_week_id());
  v_tests integer := 0;
begin
  if v_user_id is null then
    return query
    select
      null::bigint,
      null::uuid,
      null::text,
      v_subject,
      null::numeric,
      0::integer,
      false,
      'Please log in to view your ranking.'::text,
      v_week_id;
    return;
  end if;

  if v_subject = '' then
    return query
    select
      null::bigint,
      v_user_id,
      public.tr_get_username(v_user_id),
      v_subject,
      null::numeric,
      0::integer,
      false,
      'Please select a subject.'::text,
      v_week_id;
    return;
  end if;

  select count(*)
    into v_tests
  from public.test_results tr
  where tr.user_id = v_user_id
    and lower(trim(coalesce(tr.subject, ''))) = v_subject
    and tr.completed_at >= public.tr_week_start(v_week_id)
    and tr.completed_at < public.tr_week_end(v_week_id);

  if v_tests < 2 then
    return query
    select
      null::bigint,
      v_user_id,
      public.tr_get_username(v_user_id),
      v_subject,
      null::numeric,
      v_tests,
      false,
      'You need at least 2 completed tests in this subject this week to appear.'::text,
      v_week_id;
    return;
  end if;

  return query
  with ranked as (
    select
      row_number() over (
        order by r.best3_average desc, r.tests_this_week desc, r.updated_at asc, r.user_id asc
      ) as rank,
      r.user_id,
      r.username,
      r.subject,
      r.best3_average,
      r.tests_this_week,
      r.week_id
    from public.weekly_subject_rankings r
    where r.week_id = v_week_id
      and r.subject = v_subject
  )
  select
    ranked.rank,
    ranked.user_id,
    ranked.username,
    ranked.subject,
    ranked.best3_average,
    ranked.tests_this_week,
    true,
    ('Your position this week: #' || ranked.rank)::text,
    ranked.week_id
  from ranked
  where ranked.user_id = v_user_id;

  if not found then
    return query
    select
      null::bigint,
      v_user_id,
      public.tr_get_username(v_user_id),
      v_subject,
      null::numeric,
      v_tests,
      false,
      'No ranking yet. Complete another valid test to appear soon.'::text,
      v_week_id;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- RLS / Grants
-- ----------------------------------------------------------------------------
alter table public.weekly_projected_rankings enable row level security;
alter table public.weekly_subject_rankings enable row level security;

drop policy if exists "weekly_projected_select_authenticated" on public.weekly_projected_rankings;
create policy "weekly_projected_select_authenticated"
on public.weekly_projected_rankings
for select
to authenticated
using (true);

drop policy if exists "weekly_subject_select_authenticated" on public.weekly_subject_rankings;
create policy "weekly_subject_select_authenticated"
on public.weekly_subject_rankings
for select
to authenticated
using (true);

grant select on public.weekly_projected_rankings to authenticated;
grant select on public.weekly_subject_rankings to authenticated;

revoke all on public.weekly_projected_rankings from anon;
revoke all on public.weekly_subject_rankings from anon;

revoke execute on function public.tr_current_week_id() from public;
revoke execute on function public.tr_refresh_rankings_for_result(uuid, text, timestamptz) from public;
revoke execute on function public.leaderboard_get_top_projected(text, integer) from public;
revoke execute on function public.leaderboard_get_my_projected_rank(uuid, text) from public;
revoke execute on function public.leaderboard_get_my_weekly_projection_comparison(uuid, text) from public;
revoke execute on function public.leaderboard_get_my_projection_trend(uuid, text) from public;
revoke execute on function public.leaderboard_get_top_subject(text, text, integer) from public;
revoke execute on function public.leaderboard_get_my_subject_rank(text, uuid, text) from public;

grant execute on function public.tr_current_week_id() to authenticated;
grant execute on function public.tr_refresh_rankings_for_result(uuid, text, timestamptz) to authenticated;
grant execute on function public.leaderboard_get_top_projected(text, integer) to authenticated;
grant execute on function public.leaderboard_get_my_projected_rank(uuid, text) to authenticated;
grant execute on function public.leaderboard_get_my_weekly_projection_comparison(uuid, text) to authenticated;
grant execute on function public.leaderboard_get_my_projection_trend(uuid, text) to authenticated;
grant execute on function public.leaderboard_get_top_subject(text, text, integer) to authenticated;
grant execute on function public.leaderboard_get_my_subject_rank(text, uuid, text) to authenticated;

commit;

begin;

-- Daily practice activity (one row per user per local calendar day).
create table if not exists public.practice_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  tests_completed integer not null default 0 check (tests_completed >= 0),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

create index if not exists idx_practice_days_user_day_desc
  on public.practice_days (user_id, day desc);

alter table public.practice_days enable row level security;

drop policy if exists "practice_days_select_own" on public.practice_days;
create policy "practice_days_select_own"
on public.practice_days
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "practice_days_insert_own" on public.practice_days;
create policy "practice_days_insert_own"
on public.practice_days
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "practice_days_update_own" on public.practice_days;
create policy "practice_days_update_own"
on public.practice_days
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update on public.practice_days to authenticated;
revoke all on public.practice_days from anon;

-- Client sends local day (YYYY-MM-DD) to avoid timezone off-by-one.
do $$
begin
  if to_regclass('public.test_results') is not null then
    execute 'alter table public.test_results add column if not exists local_day date';
    execute '
      update public.test_results
      set local_day = (completed_at at time zone ''UTC'')::date
      where local_day is null
    ';
  end if;
end;
$$;

create or replace function public.tr_touch_practice_day_from_result()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_day date;
begin
  if new.user_id is null then
    return new;
  end if;

  v_day := coalesce(new.local_day, (new.completed_at at time zone 'UTC')::date, (now() at time zone 'UTC')::date);

  insert into public.practice_days (user_id, day, tests_completed, updated_at)
  values (new.user_id, v_day, 1, now())
  on conflict (user_id, day)
  do update set
    tests_completed = public.practice_days.tests_completed + 1,
    updated_at = excluded.updated_at;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.test_results') is not null then
    execute 'drop trigger if exists trg_test_results_touch_practice_day on public.test_results';
    execute '
      create trigger trg_test_results_touch_practice_day
      after insert
      on public.test_results
      for each row
      execute function public.tr_touch_practice_day_from_result()
    ';
  end if;
end;
$$;

commit;

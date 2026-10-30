-- Apply to an existing ThinkRight Supabase project before enabling student onboarding.
-- Keeps existing profile rows and RLS policies intact.
alter table public.user_profiles
  add column if not exists exam_year integer,
  add column if not exists target_school text,
  add column if not exists target_course text,
  add column if not exists target_score integer,
  add column if not exists subject_combo text[],
  add column if not exists daily_minutes integer;

alter table public.user_profiles
  add column if not exists onboarding_completed boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_profiles_target_score_valid') then
    alter table public.user_profiles
      add constraint user_profiles_target_score_valid check (target_score is null or target_score between 1 and 400);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_profiles_daily_minutes_valid') then
    alter table public.user_profiles
      add constraint user_profiles_daily_minutes_valid check (daily_minutes is null or daily_minutes between 1 and 240);
  end if;
end;
$$;

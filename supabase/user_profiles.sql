-- ThinkRight user_profiles schema (onboarding + personalization)
-- Run in Supabase SQL editor if you do not already have public.user_profiles

begin;

create table if not exists public.user_profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text,
    username text,
    is_premium boolean not null default false,
    class_level text,
    track text,
    goal text,
    onboarding_completed boolean not null default false,
    updated_at timestamptz not null default now(),
    created_at timestamptz not null default now()
);

create index if not exists idx_user_profiles_email on public.user_profiles(email);

create or replace function public.set_user_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
before update on public.user_profiles
for each row
execute function public.set_user_profiles_updated_at();

alter table public.user_profiles enable row level security;

drop policy if exists "user_profiles_select_own" on public.user_profiles;
create policy "user_profiles_select_own"
on public.user_profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "user_profiles_insert_own" on public.user_profiles;
create policy "user_profiles_insert_own"
on public.user_profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "user_profiles_update_own" on public.user_profiles;
create policy "user_profiles_update_own"
on public.user_profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

commit;


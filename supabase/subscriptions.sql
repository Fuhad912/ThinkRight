-- Canonical subscriptions model for ThinkRight
-- Run in Supabase SQL editor

begin;

-- Remove legacy table if it exists
drop table if exists public.user_subscriptions cascade;

create table if not exists public.subscriptions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null unique references auth.users(id) on delete cascade,
    plan text not null default 'free',
    status text not null default 'active',
    started_at timestamptz not null default now(),
    expires_at timestamptz null,
    updated_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    constraint subscriptions_status_chk check (status in ('active', 'expired', 'canceled')),
    constraint subscriptions_plan_chk check (plan in ('free', 'monthly', '3-month', 'trial', 'admin'))
);

create index if not exists idx_subscriptions_user_id on public.subscriptions(user_id);
create index if not exists idx_subscriptions_status on public.subscriptions(status);
create index if not exists idx_subscriptions_expires_at on public.subscriptions(expires_at);

create or replace function public.set_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_subscriptions_updated_at on public.subscriptions;
create trigger trg_subscriptions_updated_at
before update on public.subscriptions
for each row
execute function public.set_subscriptions_updated_at();

-- Auto-create default free subscription row for every new auth user
create or replace function public.create_default_subscription_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (user_id, plan, status, started_at, expires_at)
  values (new.id, 'free', 'active', now(), null)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_subscription on auth.users;
create trigger on_auth_user_created_subscription
after insert on auth.users
for each row
execute function public.create_default_subscription_for_new_user();

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own"
on public.subscriptions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "subscriptions_insert_own" on public.subscriptions;
create policy "subscriptions_insert_own"
on public.subscriptions
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "subscriptions_update_own" on public.subscriptions;
create policy "subscriptions_update_own"
on public.subscriptions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

commit;

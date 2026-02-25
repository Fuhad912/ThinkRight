begin;

-- Test results persisted per-user (cross-browser/device history).
-- Safe to run multiple times.
create table if not exists public.test_results (
    id uuid primary key default gen_random_uuid(),
    -- Stable idempotency key generated client-side to avoid duplicates on retries/backfills.
    client_ref text not null unique,
    user_id uuid not null references auth.users(id) on delete cascade,
    subject text not null,
    score_percentage numeric not null,
    correct_count integer not null,
    wrong_count integer not null,
    total_questions integer not null,
    time_taken_seconds integer null,
    auto_submitted boolean not null default false,
    reason text null,
    -- Optional (can be omitted client-side to keep rows small).
    answers jsonb null,
    completed_at timestamptz not null default now(),
    created_at timestamptz not null default now()
);

create index if not exists idx_test_results_user_id_completed_at
    on public.test_results(user_id, completed_at desc);

alter table public.test_results enable row level security;

drop policy if exists "test_results_select_own" on public.test_results;
create policy "test_results_select_own"
on public.test_results
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "test_results_insert_own" on public.test_results;
create policy "test_results_insert_own"
on public.test_results
for insert
to authenticated
with check (auth.uid() = user_id);

commit;


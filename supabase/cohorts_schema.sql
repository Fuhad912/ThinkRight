-- ============================================================================
-- THINKRIGHT JAMB LEARNING PLATFORM - COHORTS & TUTORS SCHEMA
-- ============================================================================
-- Run this migration in Supabase SQL Editor.
-- Sets up subjects, tutors, cohorts, lessons, enrollments, lesson_progress,
-- and cohort_posts with appropriate RLS policies and indexes.
-- ============================================================================

begin;

-- 1. Canonical Subjects Table
create table if not exists public.subjects (
    id text primary key,
    name text not null,
    is_core boolean not null default false,
    created_at timestamptz not null default now()
);

-- Seed existing 15 JAMB subjects
insert into public.subjects (id, name, is_core) values
    ('english', 'Use of English', true),
    ('mathematics', 'Mathematics', true),
    ('physics', 'Physics', false),
    ('chemistry', 'Chemistry', false),
    ('biology', 'Biology', false),
    ('economics', 'Economics', false),
    ('government', 'Government', false),
    ('literature', 'Literature in English', false),
    ('commerce', 'Commerce', false),
    ('agriculture', 'Agricultural Science', false),
    ('geography', 'Geography', false),
    ('history', 'History', false),
    ('crs', 'Christian Religious Studies', false),
    ('irs', 'Islamic Religious Studies', false),
    ('computer', 'Computer Studies', false)
on conflict (id) do update set
    name = excluded.name,
    is_core = excluded.is_core;

-- 2. Tutors Table
create table if not exists public.tutors (
    id uuid primary key references auth.users(id) on delete cascade,
    display_name text not null,
    bio text null,
    subjects text[] not null default '{}',
    revenue_share_pct numeric(5, 2) not null default 70.00,
    whatsapp_number text null,
    sample_video_url text null,
    status text not null default 'pending',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint tutors_status_chk check (status in ('pending', 'active', 'suspended'))
);

create index if not exists idx_tutors_status on public.tutors(status);

-- 3. Cohorts Table
create table if not exists public.cohorts (
    id uuid primary key default gen_random_uuid(),
    tutor_id uuid not null references public.tutors(id) on delete cascade,
    subject_id text not null references public.subjects(id),
    title text not null,
    start_date date not null,
    price numeric(10, 2) not null default 0,
    whatsapp_link text null,
    live_qa_schedule text null,
    status text not null default 'open',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint cohorts_status_chk check (status in ('open', 'in_progress', 'closed'))
);

create index if not exists idx_cohorts_tutor_id on public.cohorts(tutor_id);
create index if not exists idx_cohorts_subject_id on public.cohorts(subject_id);
create index if not exists idx_cohorts_status on public.cohorts(status);

-- 4. Lessons Table
create table if not exists public.lessons (
    id uuid primary key default gen_random_uuid(),
    cohort_id uuid not null references public.cohorts(id) on delete cascade,
    title text not null,
    syllabus_topic text null,
    video_url text not null,
    order_index int not null default 1,
    live_qa_recording_url text null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_lessons_cohort_id on public.lessons(cohort_id);
create index if not exists idx_lessons_order on public.lessons(cohort_id, order_index);

-- 5. Enrollments Table
create table if not exists public.enrollments (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    cohort_id uuid not null references public.cohorts(id) on delete cascade,
    status text not null default 'active',
    paid_amount numeric(10, 2) not null default 0,
    enrolled_at timestamptz not null default now(),
    expires_at timestamptz null,
    updated_at timestamptz not null default now(),
    constraint enrollments_status_chk check (status in ('active', 'expired', 'canceled')),
    constraint enrollments_user_cohort_unique unique (user_id, cohort_id)
);

create index if not exists idx_enrollments_user_id on public.enrollments(user_id);
create index if not exists idx_enrollments_cohort_id on public.enrollments(cohort_id);
create index if not exists idx_enrollments_status on public.enrollments(status);

-- 6. Lesson Progress Table
create table if not exists public.lesson_progress (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    lesson_id uuid not null references public.lessons(id) on delete cascade,
    completed_at timestamptz not null default now(),
    constraint lesson_progress_user_lesson_unique unique (user_id, lesson_id)
);

create index if not exists idx_lesson_progress_user on public.lesson_progress(user_id);
create index if not exists idx_lesson_progress_lesson on public.lesson_progress(lesson_id);

-- 7. Cohort Posts (Async Comments & Q&A)
create table if not exists public.cohort_posts (
    id uuid primary key default gen_random_uuid(),
    cohort_id uuid not null references public.cohorts(id) on delete cascade,
    lesson_id uuid null references public.lessons(id) on delete set null,
    author_id uuid not null references auth.users(id) on delete cascade,
    body text not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_cohort_posts_cohort on public.cohort_posts(cohort_id);
create index if not exists idx_cohort_posts_lesson on public.cohort_posts(lesson_id);
create index if not exists idx_cohort_posts_created on public.cohort_posts(created_at desc);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Subjects: readable by all
alter table public.subjects enable row level security;
drop policy if exists "subjects_select_all" on public.subjects;
create policy "subjects_select_all" on public.subjects
    for select using (true);

-- Tutors:
-- - Anyone can read active tutors
-- - Tutor can view/edit their own profile
alter table public.tutors enable row level security;

drop policy if exists "tutors_select_active" on public.tutors;
create policy "tutors_select_active" on public.tutors
    for select using (status = 'active' or auth.uid() = id);

drop policy if exists "tutors_insert_self" on public.tutors;
create policy "tutors_insert_self" on public.tutors
    for insert to authenticated
    with check (auth.uid() = id);

drop policy if exists "tutors_update_self" on public.tutors;
create policy "tutors_update_self" on public.tutors
    for update to authenticated
    using (auth.uid() = id)
    with check (auth.uid() = id);

-- Cohorts:
-- - Public can view open / in_progress cohorts
-- - Tutors can view & manage their own cohorts
alter table public.cohorts enable row level security;

drop policy if exists "cohorts_select_public" on public.cohorts;
create policy "cohorts_select_public" on public.cohorts
    for select using (status in ('open', 'in_progress') or auth.uid() = tutor_id);

drop policy if exists "cohorts_manage_tutor" on public.cohorts;
create policy "cohorts_manage_tutor" on public.cohorts
    for all to authenticated
    using (auth.uid() = tutor_id)
    with check (auth.uid() = tutor_id);

-- Lessons:
-- - Enrolled students & cohort tutor can view lessons
-- - Cohort tutor can manage lessons
alter table public.lessons enable row level security;

drop policy if exists "lessons_select_enrolled_or_tutor" on public.lessons;
create policy "lessons_select_enrolled_or_tutor" on public.lessons
    for select to authenticated
    using (
        exists (
            select 1 from public.cohorts c
            where c.id = lessons.cohort_id and c.tutor_id = auth.uid()
        )
        or exists (
            select 1 from public.enrollments e
            where e.cohort_id = lessons.cohort_id
              and e.user_id = auth.uid()
              and e.status = 'active'
        )
    );

drop policy if exists "lessons_manage_tutor" on public.lessons;
create policy "lessons_manage_tutor" on public.lessons
    for all to authenticated
    using (
        exists (
            select 1 from public.cohorts c
            where c.id = lessons.cohort_id and c.tutor_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1 from public.cohorts c
            where c.id = lessons.cohort_id and c.tutor_id = auth.uid()
        )
    );

-- Enrollments:
-- - Students view their own enrollments
-- - Cohort tutor can view enrollments for their cohorts
alter table public.enrollments enable row level security;

drop policy if exists "enrollments_select_own_or_tutor" on public.enrollments;
create policy "enrollments_select_own_or_tutor" on public.enrollments
    for select to authenticated
    using (
        auth.uid() = user_id
        or exists (
            select 1 from public.cohorts c
            where c.id = enrollments.cohort_id and c.tutor_id = auth.uid()
        )
    );

drop policy if exists "enrollments_insert_own" on public.enrollments;
create policy "enrollments_insert_own" on public.enrollments
    for insert to authenticated
    with check (auth.uid() = user_id);

-- Lesson Progress:
-- - Student manages their own progress
-- - Tutor can view progress of students in their cohort
alter table public.lesson_progress enable row level security;

drop policy if exists "lesson_progress_select_own_or_tutor" on public.lesson_progress;
create policy "lesson_progress_select_own_or_tutor" on public.lesson_progress
    for select to authenticated
    using (
        auth.uid() = user_id
        or exists (
            select 1 from public.lessons l
            join public.cohorts c on c.id = l.cohort_id
            where l.id = lesson_progress.lesson_id and c.tutor_id = auth.uid()
        )
    );

drop policy if exists "lesson_progress_manage_own" on public.lesson_progress;
create policy "lesson_progress_manage_own" on public.lesson_progress
    for all to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- Cohort Posts:
-- - Enrolled students & cohort tutor can view posts
-- - Enrolled students & cohort tutor can create posts
alter table public.cohort_posts enable row level security;

drop policy if exists "cohort_posts_select" on public.cohort_posts;
create policy "cohort_posts_select" on public.cohort_posts
    for select to authenticated
    using (
        exists (
            select 1 from public.cohorts c
            where c.id = cohort_posts.cohort_id and c.tutor_id = auth.uid()
        )
        or exists (
            select 1 from public.enrollments e
            where e.cohort_id = cohort_posts.cohort_id
              and e.user_id = auth.uid()
              and e.status = 'active'
        )
    );

drop policy if exists "cohort_posts_insert" on public.cohort_posts;
create policy "cohort_posts_insert" on public.cohort_posts
    for insert to authenticated
    with check (
        auth.uid() = author_id
        and (
            exists (
                select 1 from public.cohorts c
                where c.id = cohort_posts.cohort_id and c.tutor_id = auth.uid()
            )
            or exists (
                select 1 from public.enrollments e
                where e.cohort_id = cohort_posts.cohort_id
                  and e.user_id = auth.uid()
                  and e.status = 'active'
            )
        )
    );

commit;

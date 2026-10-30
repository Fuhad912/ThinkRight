-- ThinkRight Teacher Workspace v2: Announcements, Notifications & Analytics
-- Run in Supabase SQL Editor to enable class announcements and teacher notifications.

create table if not exists public.class_announcements (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  tutor_id uuid not null references public.tutors(id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.class_announcements enable row level security;

drop policy if exists announcement_read on public.class_announcements;
create policy announcement_read on public.class_announcements
  for select to authenticated using(true);

drop policy if exists announcement_write on public.class_announcements;
create policy announcement_write on public.class_announcements
  for all to authenticated
  using(tutor_id = auth.uid() or workspace_admin())
  with check(tutor_id = auth.uid() or workspace_admin());

create table if not exists public.teacher_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  message text not null,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.teacher_notifications enable row level security;

drop policy if exists notif_self on public.teacher_notifications;
create policy notif_self on public.teacher_notifications
  for all to authenticated
  using(user_id = auth.uid())
  with check(user_id = auth.uid());


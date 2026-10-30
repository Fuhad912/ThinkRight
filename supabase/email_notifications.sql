-- ============================================================================
-- THINKRIGHT: EMAIL NOTIFICATIONS, NEWS SUBSCRIBERS & BROADCAST LOGS
-- Powers Resend transactional notifications, JAMB Insider news, and alerts.
-- ============================================================================

create table if not exists public.email_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  name text,
  role text not null default 'student' check (role in ('student', 'teacher', 'admin')),
  categories text[] not null default array['jamb_news', 'exam_alerts', 'study_reminders', 'class_updates'],
  subscribed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_email_subscribers_subscribed on public.email_subscribers(subscribed);
create index if not exists idx_email_subscribers_role on public.email_subscribers(role);

alter table public.email_subscribers enable row level security;

drop policy if exists "Users can view own subscription" on public.email_subscribers;
create policy "Users can view own subscription"
  on public.email_subscribers for select
  to authenticated
  using (user_id = auth.uid() or lower(email) = lower(coalesce(auth.jwt()->>'email', '')));

drop policy if exists "Users can update own subscription" on public.email_subscribers;
create policy "Users can update own subscription"
  on public.email_subscribers for update
  to authenticated
  using (user_id = auth.uid() or lower(email) = lower(coalesce(auth.jwt()->>'email', '')));

-- Broadcast history log for Admin Control Room
create table if not exists public.email_broadcast_logs (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references auth.users(id) on delete set null,
  audience text not null,
  category text not null,
  subject text not null,
  title text not null,
  body text not null,
  action_text text,
  action_url text,
  recipient_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.email_broadcast_logs enable row level security;

-- Public/Authenticated RPC to subscribe or update email alert preferences
create or replace function public.subscribe_email_alerts(
  p_email text,
  p_name text default null,
  p_categories text[] default array['jamb_news', 'exam_alerts', 'study_reminders']
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean_email text := lower(trim(coalesce(p_email, '')));
  v_uid uuid := auth.uid();
  v_sub record;
begin
  if v_clean_email = '' or position('@' in v_clean_email) < 2 then
    raise exception 'Please provide a valid email address';
  end if;

  insert into public.email_subscribers (email, user_id, name, categories, subscribed, updated_at)
  values (
    v_clean_email,
    v_uid,
    nullif(trim(coalesce(p_name, '')), ''),
    coalesce(p_categories, array['jamb_news', 'exam_alerts', 'study_reminders']),
    true,
    now()
  )
  on conflict (email) do update set
    user_id = coalesce(excluded.user_id, public.email_subscribers.user_id),
    name = coalesce(excluded.name, public.email_subscribers.name),
    categories = excluded.categories,
    subscribed = true,
    updated_at = now()
  returning * into v_sub;

  return jsonb_build_object(
    'ok', true,
    'email', v_sub.email,
    'categories', v_sub.categories,
    'subscribed', v_sub.subscribed
  );
end;
$$;

grant execute on function public.subscribe_email_alerts(text, text, text[]) to anon, authenticated, service_role;


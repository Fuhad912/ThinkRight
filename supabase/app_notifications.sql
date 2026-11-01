-- Apply after teacher_workspace.sql and email_notifications.sql.
begin;
create table if not exists public.app_notification_config(id boolean primary key default true check(id),vapid_public_key text not null);
revoke all on public.app_notification_config from public,anon,authenticated;
grant select on public.app_notification_config to authenticated;
alter table public.app_notification_config enable row level security;
drop policy if exists config_read on public.app_notification_config;
create policy config_read on public.app_notification_config for select to authenticated using(true);
create table if not exists public.app_notifications(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade,
 title text not null,body text not null,url text not null default '/dashboard.html',
 event_key text not null,created_at timestamptz not null default now(),read_at timestamptz,
 unique(user_id,event_key)
);
create index if not exists app_notifications_inbox on public.app_notifications(user_id,created_at desc);
alter table public.app_notifications enable row level security;
revoke all on public.app_notifications from public,anon,authenticated;
grant select on public.app_notifications to authenticated;
drop policy if exists notification_read on public.app_notifications;
create policy notification_read on public.app_notifications for select to authenticated using(user_id=auth.uid());
create table if not exists public.app_push_subscriptions(
 endpoint text primary key,user_id uuid not null references auth.users on delete cascade,
 subscription jsonb not null,updated_at timestamptz not null default now()
);
alter table public.app_push_subscriptions enable row level security;
create table if not exists public.app_push_jobs(
 id uuid primary key default gen_random_uuid(),notification_id uuid not null references app_notifications on delete cascade,
 endpoint text not null references app_push_subscriptions on delete cascade,
 attempts int not null default 0,locked_until timestamptz,done boolean not null default false,
 unique(notification_id,endpoint)
);
alter table public.app_push_jobs enable row level security;
revoke all on public.app_push_subscriptions,public.app_push_jobs from public,anon,authenticated;
grant all on public.app_notifications,public.app_push_subscriptions,public.app_push_jobs to service_role;
create or replace function public.app_push_register(p_subscription jsonb,p_remove boolean default false)
returns void language plpgsql security definer set search_path=public as $$
declare ep text:=p_subscription->>'endpoint';
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if p_remove then delete from app_push_subscriptions where endpoint=ep and user_id=auth.uid();return;end if;
 if ep is null or length(ep)>2048 or ep !~ '^https://(fcm.googleapis.com|updates.push.services.mozilla.com|[a-z0-9.-]+[.]push.apple.com|[a-z0-9.-]+[.]notify.windows.com)/'
 or length(coalesce(p_subscription->'keys'->>'p256dh','')) not between 80 and 150
 or length(coalesce(p_subscription->'keys'->>'auth','')) not between 20 and 30 then raise exception 'Invalid device subscription';end if;
 -- Drop queued alerts before switching the owner of a shared device.
 delete from app_push_jobs where endpoint=ep and exists(select 1 from app_push_subscriptions where endpoint=ep and user_id<>auth.uid());
 insert into app_push_subscriptions(endpoint,user_id,subscription) values(ep,auth.uid(),p_subscription)
 on conflict(endpoint) do update set user_id=excluded.user_id,subscription=excluded.subscription,updated_at=now();
end $$;
create or replace function public.app_notification_read(p_id uuid default null)
returns void language sql security definer set search_path=public as $$
 update app_notifications set read_at=now() where user_id=auth.uid() and read_at is null and (p_id is null or id=p_id);
$$;
create or replace function public.app_notify(p_user uuid,p_title text,p_body text,p_url text,p_key text)
returns void language plpgsql security definer set search_path=public as $$
begin
 insert into app_notifications(user_id,title,body,url,event_key) values(p_user,left(p_title,160),left(p_body,1000),p_url,p_key) on conflict do nothing;
end $$;
create or replace function public.app_notification_queue() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into app_push_jobs(notification_id,endpoint) select new.id,endpoint from app_push_subscriptions where user_id=new.user_id on conflict do nothing;return new;
end $$;
drop trigger if exists app_notification_queue on public.app_notifications;
create trigger app_notification_queue after insert on public.app_notifications for each row execute function public.app_notification_queue();
create or replace function public.app_notification_events() returns trigger language plpgsql security definer set search_path=public as $$
declare person record;target uuid;
begin
 if tg_table_name='enrollments' then
  if new.status='active' then
   select tutor_id into target from cohorts where id=new.cohort_id;
   perform app_notify(new.user_id,'You are enrolled','Your class is ready. Start learning at your own pace.','/cohort.html?id='||new.cohort_id,'enrolled:'||new.id);
   perform app_notify(target,'A student joined your class','Open your student roster to see the latest enrolment.','/tutor-students.html','student:'||new.id);
  end if;
 elsif tg_table_name='class_revisions' then
  if new.state is distinct from old.state and new.state in ('published','changes_requested','in_review') then
   select tutor_id into target from cohorts where id=new.cohort_id;
   if new.state='in_review' then
    for person in select user_id as id from workspace_roles where role='admin' loop
     perform app_notify(person.id,'Class awaiting review','A teacher submitted a class for review.','/admin.html','review:'||new.cohort_id||':'||new.version);
    end loop;
   else
    perform app_notify(target,case when new.state='published' then 'Your class is published' else 'Your class needs changes' end,'Open My classes to see the review decision.','/tutor-classes.html','decision:'||new.cohort_id||':'||new.version);
   end if;
  end if;
 elsif tg_table_name='email_broadcast_logs' then
  if new.audience in ('all','students','teachers','admins') then
   for person in select u.id,case when exists(select 1 from workspace_roles where user_id=u.id and role='admin') then 'admins' when exists(select 1 from tutors where id=u.id) then 'teachers' else 'students' end as audience from auth.users u loop
    if new.audience='all' or new.audience=person.audience then
     perform app_notify(person.id,new.title,new.body,case when new.action_url ~ '^/[a-zA-Z0-9]' and new.action_url !~ '[\\]' then new.action_url else '/news.html' end,'broadcast:'||new.id);
    end if;
   end loop;
  end if;
 end if;
 return new;
end $$;
drop trigger if exists app_enrollment_notification on public.enrollments;
create trigger app_enrollment_notification after insert or update of status on public.enrollments for each row execute function public.app_notification_events();
drop trigger if exists app_class_notification on public.class_revisions;
create trigger app_class_notification after update of state on public.class_revisions for each row execute function public.app_notification_events();
drop trigger if exists app_broadcast_notification on public.email_broadcast_logs;
create trigger app_broadcast_notification after insert on public.email_broadcast_logs for each row execute function public.app_notification_events();
create or replace function public.app_notification_reminders() returns void language plpgsql security definer set search_path=public as $$
declare person record;day text:=to_char(now() at time zone 'Africa/Lagos','YYYY-MM-DD');
begin
 -- A daily reminder, deduplicated even if the scheduled job is retried.
 for person in select u.id,case when exists(select 1 from workspace_roles where user_id=u.id and role='admin') then 'admin' when exists(select 1 from tutors where id=u.id) then 'teacher' else 'student' end as role from auth.users u where u.last_sign_in_at>now()-interval '30 days' loop
  perform app_notify(person.id,case person.role when 'student' then 'Ready for a little practice?' when 'teacher' then 'Your teaching workspace is ready' else 'Check your admin workspace' end,
   case person.role when 'student' then 'Continue a lesson or practise a few UTME questions today.' when 'teacher' then 'Check student questions and keep your recorded classes up to date.' else 'Review teaching applications, classes and payment records.' end,
   case person.role when 'student' then '/dashboard.html' when 'teacher' then '/tutor-dashboard.html' else '/admin.html' end,'daily:'||day);
 end loop;
end $$;
create or replace function public.app_push_claim() returns table(id uuid,endpoint text,subscription jsonb)
language sql security definer set search_path=public as $$
 with picked as (select j.id from app_push_jobs j join app_notifications n on n.id=j.notification_id join app_push_subscriptions s on s.endpoint=j.endpoint
 where not j.done and j.attempts<5 and (j.locked_until is null or j.locked_until<now()) and n.created_at>now()-interval '2 days' and n.read_at is null and s.user_id=n.user_id
 order by n.created_at limit 50 for update of j skip locked), claimed as (
 update app_push_jobs j set attempts=attempts+1,locked_until=now()+interval '5 minutes' from picked where j.id=picked.id returning j.*)
 select c.id,s.endpoint,s.subscription from claimed c join app_push_subscriptions s on s.endpoint=c.endpoint;
$$;
revoke all on function public.app_push_register(jsonb,boolean),public.app_notification_read(uuid),public.app_notify(uuid,text,text,text,text),public.app_notification_queue(),public.app_notification_events(),public.app_notification_reminders(),public.app_push_claim() from public,anon,authenticated;
grant execute on function public.app_push_register(jsonb,boolean),public.app_notification_read(uuid) to authenticated;
grant execute on function public.app_push_claim(),public.app_notification_reminders() to service_role;
commit;

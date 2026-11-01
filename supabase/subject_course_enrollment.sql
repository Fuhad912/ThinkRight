-- Apply after teacher_workspace.sql. A course is one teacher + one subject.
-- Topic classes remain classrooms; they are not separate purchases.
begin;

create table if not exists public.subject_course_enrollments (
  user_id uuid not null references auth.users(id),
  tutor_id uuid not null references public.tutors(id),
  subject_id text not null references public.subjects(id),
  enrollment_id uuid unique not null references public.enrollments(id),
  created_at timestamptz not null default now(),
  primary key(user_id,tutor_id,subject_id)
);
alter table public.subject_course_enrollments enable row level security;
revoke all on public.subject_course_enrollments from public,anon,authenticated;

-- Preserve existing purchases and their financial records. Pick one source
-- enrollment per course, preferring access that is still active.
insert into public.subject_course_enrollments(user_id,tutor_id,subject_id,enrollment_id)
select distinct on(e.user_id,c.tutor_id,c.subject_id)
  e.user_id,c.tutor_id,c.subject_id,e.id
from public.enrollments e join public.cohorts c on c.id=e.cohort_id
order by e.user_id,c.tutor_id,c.subject_id,
  (e.status='active' and (e.expires_at is null or e.expires_at>now())) desc,
  e.expires_at desc nulls first,e.enrolled_at desc,e.id
on conflict(user_id,tutor_id,subject_id) do nothing;

alter table public.class_orders add column if not exists tutor_id uuid references public.tutors(id);
alter table public.class_orders add column if not exists subject_id text references public.subjects(id);
update public.class_orders o set tutor_id=c.tutor_id,subject_id=c.subject_id
from public.cohorts c where c.id=o.cohort_id and (o.tutor_id is null or o.subject_id is null);
alter table public.class_orders alter column tutor_id set not null;
alter table public.class_orders alter column subject_id set not null;
create index if not exists class_orders_subject_course on public.class_orders(user_id,tutor_id,subject_id,status);

-- Keep the existing student pages and teacher rosters working. Inherited
-- classroom rows carry no new payment or earnings; the source holds the fee.
create or replace function public.sync_subject_course(p_user uuid,p_tutor uuid,p_subject text)
returns void language plpgsql security definer set search_path=public as $$
declare source enrollments;
begin
 select e.* into source from subject_course_enrollments sc
 join enrollments e on e.id=sc.enrollment_id
 where sc.user_id=p_user and sc.tutor_id=p_tutor and sc.subject_id=p_subject;
 if source.id is null then return; end if;
 insert into enrollments(user_id,cohort_id,status,paid_amount,enrolled_at,expires_at)
 select p_user,c.id,source.status,0,source.enrolled_at,source.expires_at
 from cohorts c where c.tutor_id=p_tutor and c.subject_id=p_subject and c.published
 on conflict(user_id,cohort_id) do update set status=excluded.status,expires_at=excluded.expires_at
 where enrollments.id<>source.id and
   (enrollments.status is distinct from excluded.status or enrollments.expires_at is distinct from excluded.expires_at);
end $$;
revoke all on function public.sync_subject_course(uuid,uuid,text) from public,anon,authenticated;

create or replace function public.subject_course_source_changed()
returns trigger language plpgsql security definer set search_path=public as $$
declare course record;
begin
 for course in select * from subject_course_enrollments where enrollment_id=new.id loop
   perform sync_subject_course(course.user_id,course.tutor_id,course.subject_id);
 end loop;
 return new;
end $$;
drop trigger if exists subject_course_source_changed on public.enrollments;
create trigger subject_course_source_changed after update of status,expires_at on public.enrollments
for each row execute function public.subject_course_source_changed();

create or replace function public.subject_course_published()
returns trigger language plpgsql security definer set search_path=public as $$
declare course record;
begin
 if new.published then
   for course in select * from subject_course_enrollments where tutor_id=new.tutor_id and subject_id=new.subject_id loop
     perform sync_subject_course(course.user_id,course.tutor_id,course.subject_id);
   end loop;
 end if;
 return new;
end $$;
drop trigger if exists subject_course_published on public.cohorts;
create trigger subject_course_published after insert or update of published on public.cohorts
for each row execute function public.subject_course_published();

-- An edit must never move paid access or an outstanding payment to a different
-- teacher/subject, or silently turn an existing public class into another course.
create or replace function public.subject_course_identity_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if (new.tutor_id is distinct from old.tutor_id or new.subject_id is distinct from old.subject_id)
 and (old.published or exists(select 1 from class_orders where cohort_id=old.id)
   or exists(select 1 from enrollments where cohort_id=old.id)) then
   raise exception 'The teacher and subject of an existing course cannot change. Create a new course instead.';
 end if;
 return new;
end $$;
drop trigger if exists subject_course_identity_guard on public.cohorts;
create trigger subject_course_identity_guard before update of tutor_id,subject_id on public.cohorts
for each row execute function public.subject_course_identity_guard();

create or replace function public.workspace_enrolled(p_cohort uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from cohorts c
   join subject_course_enrollments sc on sc.tutor_id=c.tutor_id and sc.subject_id=c.subject_id
   join enrollments e on e.id=sc.enrollment_id
   where c.id=p_cohort and c.published and sc.user_id=auth.uid()
     and e.status='active' and (e.expires_at is null or e.expires_at>now()));
$$;

create or replace function public.class_order_create(p_cohort uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c cohorts; price numeric; o class_orders; source enrollments; eid uuid; uid uuid:=auth.uid();
begin
 if uid is null or (workspace_identity()->>'role')<>'student' then raise exception 'Student sign-in required'; end if;
 select * into c from cohorts where id=p_cohort and published;
 if c.id is null then raise exception 'Class unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text||':'||c.tutor_id::text||':'||c.subject_id,0));
 select e.* into source from subject_course_enrollments sc join enrollments e on e.id=sc.enrollment_id
 where sc.user_id=uid and sc.tutor_id=c.tutor_id and sc.subject_id=c.subject_id;
 if source.status='active' and (source.expires_at is null or source.expires_at>now()) then
   perform sync_subject_course(uid,c.tutor_id,c.subject_id);
   return jsonb_build_object('enrolled',true,'cohort_id',c.id,'subject_id',c.subject_id,'tutor_id',c.tutor_id);
 end if;
 if c.status not in ('open','in_progress') or not exists(select 1 from tutors where id=c.tutor_id and status='active') then raise exception 'Class unavailable'; end if;
 if source.id is not null then raise exception 'This subject course enrollment is inactive. Contact support to restore access.'; end if;
 select enrollment_price into price from subjects where id=c.subject_id;
 if price is null then raise exception 'Enrollment pricing is not available yet'; end if;
 if price=0 then
   insert into enrollments(user_id,cohort_id,paid_amount,status) values(uid,c.id,0,'active')
   on conflict(user_id,cohort_id) do update set status='active',expires_at=null returning id into eid;
   insert into subject_course_enrollments(user_id,tutor_id,subject_id,enrollment_id) values(uid,c.tutor_id,c.subject_id,eid);
   perform sync_subject_course(uid,c.tutor_id,c.subject_id);
   return jsonb_build_object('enrolled',true,'cohort_id',c.id,'subject_id',c.subject_id,'tutor_id',c.tutor_id);
 end if;
 -- Reuse an in-flight subject purchase even when checkout starts on another topic.
 select * into o from class_orders where user_id=uid and tutor_id=c.tutor_id and subject_id=c.subject_id
   and status='pending' and expires_at>now() order by created_at desc limit 1;
 if o.id is null then
   insert into class_orders(user_id,cohort_id,tutor_id,subject_id,amount_kobo,reference)
   values(uid,c.id,c.tutor_id,c.subject_id,round(price*100),'TR-'||gen_random_uuid()::text) returning * into o;
 end if;
 return to_jsonb(o);
end $$;

create or replace function public.class_order_settle(p_reference text,p_amount bigint,p_currency text,p_paid_at timestamptz,p_user uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare o class_orders; eid uuid;
begin
 select * into o from class_orders where reference=p_reference for update;
 if o.id is null or p_user is null or p_amount is null or p_currency is null or o.user_id<>p_user
 or o.amount_kobo<>p_amount or p_currency<>'NGN' or p_paid_at is null or p_paid_at>o.expires_at
 or p_paid_at<o.created_at-interval '1 minute' then raise exception 'Payment does not match a valid order'; end if;
 if o.status='paid' then return o.cohort_id; end if;
 perform pg_advisory_xact_lock(hashtextextended(o.user_id::text||':'||o.tutor_id::text||':'||o.subject_id,0));
 if not exists(select 1 from cohorts where id=o.cohort_id and tutor_id=o.tutor_id and subject_id=o.subject_id and published) then raise exception 'Course no longer matches this payment. Contact support.'; end if;
 if exists(select 1 from subject_course_enrollments where user_id=o.user_id and tutor_id=o.tutor_id and subject_id=o.subject_id) then
   raise exception 'Duplicate subject course payment requires support reconciliation';
 end if;
 insert into enrollments(user_id,cohort_id,paid_amount,status) values(o.user_id,o.cohort_id,o.amount_kobo/100.0,'active')
 on conflict(user_id,cohort_id) do update set paid_amount=excluded.paid_amount,status='active',expires_at=null returning id into eid;
 insert into subject_course_enrollments(user_id,tutor_id,subject_id,enrollment_id) values(o.user_id,o.tutor_id,o.subject_id,eid);
 perform sync_subject_course(o.user_id,o.tutor_id,o.subject_id);
 insert into teacher_earnings(tutor_id,enrollment_id,cohort_id,gross_kobo,teacher_kobo,reference,source)
 values(o.tutor_id,eid,o.cohort_id,o.amount_kobo,round(o.amount_kobo*0.7),p_reference,'verified_payment');
 update class_orders set status='paid' where id=o.id;
 return o.cohort_id;
end $$;

revoke all on function public.subject_course_source_changed(),public.subject_course_published(),public.subject_course_identity_guard() from public,anon,authenticated;
revoke all on function public.class_order_settle(text,bigint,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.class_order_settle(text,bigint,text,timestamptz,uuid) to service_role;
revoke all on function public.class_order_create(uuid) from public,anon;
grant execute on function public.class_order_create(uuid) to authenticated;

do $$ declare course record; begin
 for course in select * from subject_course_enrollments loop
   perform sync_subject_course(course.user_id,course.tutor_id,course.subject_id);
 end loop;
end $$;
commit;

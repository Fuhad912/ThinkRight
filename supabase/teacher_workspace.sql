-- Apply after cohorts_schema.sql and user_profiles.sql. No live changes are made by the build.
begin;
create table if not exists public.workspace_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('student','teacher','admin'))
);
insert into public.workspace_roles select id, 'teacher' from public.tutors on conflict do nothing;
alter table public.workspace_roles enable row level security;
create or replace function public.workspace_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from workspace_roles where user_id=auth.uid() and role='admin');
$$;

-- Application evidence is private, unlike the public teaching profile.
create table if not exists public.teacher_applications (
 tutor_id uuid primary key references public.tutors(id) on delete cascade,
 details jsonb not null check(jsonb_typeof(details)='object'),
 submitted_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id),
 review_checks jsonb
);
alter table public.teacher_applications enable row level security;
revoke all on public.teacher_applications from anon, authenticated;
grant select on public.teacher_applications to authenticated;
drop policy if exists application_read on public.teacher_applications;
create policy application_read on public.teacher_applications for select to authenticated using(tutor_id=auth.uid() or workspace_admin());
create policy workspace_role_self on public.workspace_roles for select to authenticated using(user_id=auth.uid());
alter table public.subjects add column if not exists enrollment_price numeric(10,2) check(enrollment_price>=0);
alter table public.tutors add column if not exists review_feedback text;
alter table public.cohorts add column if not exists description text not null default '';
alter table public.cohorts add column if not exists published boolean not null default true;
alter table public.lessons add column if not exists archived boolean not null default false;
alter table public.cohort_posts add column if not exists parent_id uuid references public.cohort_posts(id);
alter table public.cohort_posts add column if not exists resolved boolean not null default false;
create table public.class_revisions (
  cohort_id uuid primary key references public.cohorts(id),
  body jsonb not null,
  state text not null default 'draft' check(state in ('draft','in_review','changes_requested','published')),
  feedback text,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
insert into public.class_revisions(cohort_id,body,state)
select c.id,jsonb_build_object('title',c.title,'description',c.description,'subject_id',c.subject_id,'start_date',c.start_date,'whatsapp_link',coalesce(c.whatsapp_link,''),'lessons',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'title',l.title,'syllabus_topic',l.syllabus_topic,'video_url',l.video_url) order by l.order_index) from lessons l where l.cohort_id=c.id),'[]'::jsonb)),'published' from cohorts c;
create table public.teacher_bank_details (
  tutor_id uuid primary key references public.tutors(id),
  bank text not null, account_number text not null check(account_number ~ '^[0-9]{10}$'), account_name text not null,
  reviewed boolean not null default false, updated_at timestamptz not null default now()
);
create table public.class_orders (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  cohort_id uuid not null references public.cohorts(id), amount_kobo bigint not null check(amount_kobo>=0),
  currency text not null default 'NGN', reference text unique not null,
  status text not null default 'pending' check(status in ('pending','paid')),
  expires_at timestamptz not null default now()+interval '15 minutes', created_at timestamptz not null default now()
);
create table public.teacher_earnings (
  id uuid primary key default gen_random_uuid(), tutor_id uuid not null references public.tutors(id),
  enrollment_id uuid unique not null references public.enrollments(id), cohort_id uuid not null references public.cohorts(id),
  gross_kobo bigint not null check(gross_kobo>=0), teacher_kobo bigint not null check(teacher_kobo>=0),
  share_pct numeric not null default 70 check(share_pct=70), reference text unique not null,
  source text not null check(source in ('verified_payment','legacy_reconciled')), created_at timestamptz not null default now()
);
create table public.teacher_payouts (
  id uuid primary key default gen_random_uuid(), tutor_id uuid not null references public.tutors(id),
  amount_kobo bigint not null check(amount_kobo>0), reference text unique not null,
  paid_at timestamptz not null, bank_snapshot jsonb not null, reversed boolean not null default false,
  reversal_reason text, created_at timestamptz not null default now()
);
create table public.workspace_audit (
  id bigint generated always as identity primary key, actor uuid references auth.users(id),
  action text not null, target text, details jsonb not null default '{}', created_at timestamptz not null default now()
);
alter table public.class_revisions enable row level security;
alter table public.teacher_bank_details enable row level security;
alter table public.class_orders enable row level security;
alter table public.teacher_earnings enable row level security;
alter table public.teacher_payouts enable row level security;
alter table public.workspace_audit enable row level security;
-- New private tables are accessed only through the checked RPCs below.
revoke all on public.class_revisions, public.teacher_bank_details, public.class_orders, public.teacher_earnings, public.teacher_payouts, public.workspace_audit from anon, authenticated;
drop policy if exists tutors_insert_self on public.tutors;
create policy tutors_insert_pending on public.tutors for insert to authenticated with check(auth.uid()=id and status='pending' and revenue_share_pct=70);
revoke update, delete on public.tutors from authenticated;
drop policy if exists tutors_update_self on public.tutors;
drop policy if exists cohorts_manage_tutor on public.cohorts;
drop policy if exists cohorts_select_public on public.cohorts;
create or replace function public.workspace_enrolled(p_cohort uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from enrollments where cohort_id=p_cohort and user_id=auth.uid() and status='active' and (expires_at is null or expires_at>now()));
$$;
create policy cohorts_published on public.cohorts for select using ((published and status in ('open','in_progress')) or tutor_id=auth.uid() or workspace_admin() or workspace_enrolled(id));
drop policy if exists lessons_manage_tutor on public.lessons;
drop policy if exists lessons_select_enrolled_or_tutor on public.lessons;
create policy lessons_current on public.lessons for select to authenticated using(not archived and (workspace_enrolled(cohort_id) or exists(select 1 from cohorts c where c.id=cohort_id and c.tutor_id=auth.uid())));
drop policy if exists lesson_progress_manage_own on public.lesson_progress;
create policy progress_enrolled on public.lesson_progress for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and exists(select 1 from lessons l where l.id=lesson_id and workspace_enrolled(l.cohort_id)));
drop policy if exists cohort_posts_insert on public.cohort_posts;
drop policy if exists cohort_posts_select on public.cohort_posts;
create policy posts_current_access on public.cohort_posts for select to authenticated using(workspace_enrolled(cohort_id) or exists(select 1 from cohorts c where c.id=cohort_id and c.tutor_id=auth.uid()));
create policy posts_student_insert on public.cohort_posts for insert to authenticated with check(author_id=auth.uid() and workspace_enrolled(cohort_id) and parent_id is null and not resolved and length(trim(body))>0 and (lesson_id is null or exists(select 1 from lessons l where l.id=lesson_id and l.cohort_id=cohort_posts.cohort_id)));
drop policy if exists enrollments_insert_own on public.enrollments;
revoke insert, update, delete on public.cohorts, public.lessons, public.enrollments from authenticated;

create or replace function public.workspace_register_teacher() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into workspace_roles values(new.id,'teacher') on conflict(user_id) do update set role='teacher' where workspace_roles.role<>'admin';
 return new;
end $$;
create trigger workspace_teacher_role after insert on public.tutors for each row execute function public.workspace_register_teacher();

-- Signup metadata may request an application, never approval or admin privileges.
create or replace function public.workspace_signup() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.raw_user_meta_data->>'role'='teacher' then
   insert into tutors(id,display_name,status,revenue_share_pct)
   values(new.id,coalesce(nullif(new.raw_user_meta_data->>'username',''),'New educator'),'pending',70) on conflict do nothing;
 end if;
 return new;
end $$;
create trigger workspace_signup_teacher after insert on auth.users for each row execute function public.workspace_signup();
-- Recover earlier teacher applications that had no session when signing up.
insert into public.tutors(id,display_name,status,revenue_share_pct)
select u.id,coalesce(nullif(u.raw_user_meta_data->>'username',''),'New educator'),'pending',70
from auth.users u where u.raw_user_meta_data->>'role'='teacher' on conflict do nothing;

create or replace function public.workspace_identity() returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r text; t tutors;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select role into r from workspace_roles where user_id=auth.uid();
 select * into t from tutors where id=auth.uid();
 return jsonb_build_object('role',coalesce(r,case when t.id is not null then 'teacher' else 'student' end),'status',t.status,'name',t.display_name);
end $$;

create or replace function public.workspace_snapshot() returns jsonb language plpgsql stable security definer set search_path=public as $$
declare a boolean := workspace_admin(); uid uuid := auth.uid(); ids uuid[]; result jsonb;
begin
 if uid is null or not(a or exists(select 1 from tutors where id=uid)) then raise exception 'Teacher access required'; end if;
 select coalesce(array_agg(id),'{}') into ids from cohorts where a or tutor_id=uid;
 select jsonb_build_object(
 'identity',workspace_identity(),
 'subjects',(select coalesce(jsonb_agg(s order by s.name),'[]') from subjects s),
 'tutors',(select coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object('application',ap.details,'application_submitted_at',ap.submitted_at)),'[]') from tutors t left join teacher_applications ap on ap.tutor_id=t.id where a or t.id=uid),
 'classes',(select coalesce(jsonb_agg(c order by c.created_at desc),'[]') from cohorts c where id=any(ids)),
 'revisions',(select coalesce(jsonb_agg(r),'[]') from class_revisions r where cohort_id=any(ids)),
 'lessons',(select coalesce(jsonb_agg(l order by l.order_index),'[]') from lessons l where cohort_id=any(ids) and not archived),
 'enrollments',(select coalesce(jsonb_agg(e order by e.enrolled_at desc),'[]') from enrollments e where cohort_id=any(ids)),
 'students',(select coalesce(jsonb_agg(p),'[]') from (select distinct u.id,u.username from user_profiles u join enrollments e on e.user_id=u.id where e.cohort_id=any(ids)) p),
 'progress',(select coalesce(jsonb_agg(p),'[]') from lesson_progress p join lessons l on l.id=p.lesson_id where l.cohort_id=any(ids)),
 'posts',(select coalesce(jsonb_agg(p order by p.created_at desc),'[]') from cohort_posts p where cohort_id=any(ids)),
 'earnings',(select coalesce(jsonb_agg(e order by e.created_at desc),'[]') from teacher_earnings e where a or tutor_id=uid),
 'payouts',(select coalesce(jsonb_agg(p order by p.paid_at desc),'[]') from teacher_payouts p where a or tutor_id=uid),
 'banks',(select coalesce(jsonb_agg(b),'[]') from teacher_bank_details b where a or tutor_id=uid),
 'audit',(select coalesce(jsonb_agg(x),'[]') from (select * from workspace_audit where a order by created_at desc limit 100) x)
 ) into result;
 return result;
end $$;

create or replace function public.workspace_action(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); a boolean:=workspace_admin(); cid uuid; tid uuid; c cohorts; t tutors; r class_revisions;
 body jsonb; entry jsonb; lid uuid; kept uuid[]:='{}'; amt bigint; bal bigint; eid uuid; bank teacher_bank_details; result jsonb:='{}';
begin
 if uid is null then raise exception 'Sign in required'; end if;
 if not a and exists(select 1 from tutors where id=uid and status='pending') and p_action<>'profile' then raise exception 'Your teaching application is under review. Workspace access is available after approval.'; end if;
 if p_action in ('price','teacher_review','class_review','bank_review','payout','reverse_payout','reconcile') and not a then raise exception 'Administrator access required'; end if;
 if p_action='profile' then
   if length(trim(coalesce(p_data->>'display_name','')))<2 then raise exception 'Enter your name'; end if;
   if exists(select 1 from tutors where id=uid and status='suspended') then raise exception 'Account suspended'; end if;
   if p_data ? 'application' then
     body:=p_data->'application';
     if jsonb_typeof(body)<>'object' then raise exception 'Invalid application'; end if;
     for entry in select value from jsonb_array_elements('["legal_name","location","qualification","institution","qualification_year","experience_years","jamb_experience","teaching_plan","weekly_hours","equipment"]'::jsonb) loop
       if length(trim(coalesce(body->>(entry#>>'{}'),'')))<1 or length(body->>(entry#>>'{}'))>4000 then raise exception 'Complete all application details'; end if;
     end loop;
     if body->>'qualification_year' !~ '^[0-9]{4}$' or (body->>'qualification_year')::int not between 1950 and extract(year from now())::int then raise exception 'Enter a valid qualification year'; end if;
     if body->>'experience_years' !~ '^[0-9]{1,2}$' or (body->>'experience_years')::int>60 then raise exception 'Enter valid years of experience'; end if;
     if body->>'weekly_hours' !~ '^[0-9]{1,2}$' or (body->>'weekly_hours')::int not between 1 and 60 then raise exception 'Enter 1 to 60 weekly hours'; end if;
     if length(trim(body->>'teaching_plan'))<100 or length(trim(body->>'jamb_experience'))<50 or coalesce(body->>'declaration','')<>'true' then raise exception 'Add credential evidence, JAMB experience, a lesson plan and confirm your declaration'; end if;
     if coalesce(body->>'credential_path','') !~ ('^'||uid::text||'/[0-9a-f-]+[.](pdf|jpg|jpeg|png)$') or not exists(select 1 from storage.objects where bucket_id='teacher-credentials' and name=body->>'credential_path') then raise exception 'Upload your certificate document before submitting'; end if;
     if length(trim(coalesce(p_data->>'bio','')))<20 or coalesce(p_data->>'sample_video_url','') !~ '^https://' or length(regexp_replace(coalesce(p_data->>'whatsapp_number',''),'[^0-9]','','g'))<10 then raise exception 'Add teaching background, a valid WhatsApp number and sample video'; end if;
     if jsonb_array_length(coalesce(p_data->'subjects','[]'))=0 or exists(select 1 from jsonb_array_elements_text(p_data->'subjects') x where not exists(select 1 from subjects where id=x)) then raise exception 'Choose valid teaching subjects'; end if;
   elsif not exists(select 1 from tutors where id=uid and status='active') and not exists(select 1 from teacher_applications where tutor_id=uid) then
     raise exception 'Complete the teaching application first';
   end if;
   insert into tutors(id,display_name,bio,subjects,whatsapp_number,sample_video_url,status,revenue_share_pct)
   values(uid,trim(p_data->>'display_name'),p_data->>'bio',array(select jsonb_array_elements_text(coalesce(p_data->'subjects','[]'))),p_data->>'whatsapp_number',p_data->>'sample_video_url','pending',70)
   on conflict(id) do update set display_name=excluded.display_name,bio=excluded.bio,subjects=excluded.subjects,whatsapp_number=excluded.whatsapp_number,sample_video_url=excluded.sample_video_url,updated_at=now();
   if p_data ? 'application' then
     insert into teacher_applications(tutor_id,details) values(uid,p_data->'application')
     on conflict(tutor_id) do update set details=excluded.details,submitted_at=now(),reviewed_at=null,reviewed_by=null,review_checks=null;
     update tutors set status='pending',review_feedback=null where id=uid and status<>'active';
   end if;
 elsif p_action='price' then
   if (p_data->>'price')::numeric<0 or p_data->>'price' is null then raise exception 'Enter a valid price'; end if;
   update subjects set enrollment_price=(p_data->>'price')::numeric where id=p_data->>'subject_id';
   if not found then raise exception 'Subject not found'; end if;
   update cohorts set price=(p_data->>'price')::numeric where subject_id=p_data->>'subject_id';
 elsif p_action='teacher_review' then
   if p_data->>'status' not in ('active','pending','suspended') then raise exception 'Invalid status'; end if;
   if p_data->>'status'<>'active' and length(trim(coalesce(p_data->>'feedback','')))=0 then raise exception 'Explain the decision'; end if;
   if p_data->>'status'='active' then
     if length(trim(coalesce(p_data->>'feedback','')))<20 then raise exception 'Write a review decision of at least 20 characters'; end if;
     if not exists(select 1 from teacher_applications where tutor_id=(p_data->>'id')::uuid) then raise exception 'A complete teaching application is required before approval'; end if;
     if not exists(select 1 from teacher_applications ap join storage.objects o on o.bucket_id='teacher-credentials' and o.name=ap.details->>'credential_path' where ap.tutor_id=(p_data->>'id')::uuid) then raise exception 'An uploaded certificate document is required before approval'; end if;
     if coalesce(p_data->>'credentials_checked','')<>'on' or coalesce(p_data->>'lesson_checked','')<>'on' or coalesce(p_data->>'experience_checked','')<>'on' then raise exception 'Confirm credentials, lesson quality and teaching experience before approval'; end if;
     update teacher_applications set reviewed_at=now(),reviewed_by=uid,review_checks=jsonb_build_object('credentials',true,'lesson',true,'experience',true) where tutor_id=(p_data->>'id')::uuid;
   end if;
   update tutors set status=p_data->>'status',review_feedback=p_data->>'feedback',updated_at=now() where id=(p_data->>'id')::uuid;
 elsif p_action in ('save_class','submit_class','withdraw_class','class_review','availability') then
   cid:=nullif(p_data->>'id','')::uuid;
   if cid is null and p_action='save_class' then
     select * into t from tutors where id=uid;
     if t.id is null or t.status='suspended' then raise exception 'Teacher access required'; end if;
     body:=p_data->'body';
     if not a and not ((body->>'subject_id')=any(coalesce(t.subjects,'{}'::text[]))) then raise exception 'You can only create classes for subjects in your teaching application'; end if;
     insert into cohorts(tutor_id,subject_id,title,start_date,price,status,published) values(uid,body->>'subject_id',coalesce(nullif(trim(body->>'title'),''),'Untitled class'),coalesce(nullif(body->>'start_date','')::date,current_date),0,'closed',false) returning id into cid;
     insert into class_revisions(cohort_id,body) values(cid,body);
   else
     select * into c from cohorts where id=cid for update;
     if c.id is null or (not a and c.tutor_id<>uid) then raise exception 'Class unavailable'; end if;
     select * into t from tutors where id=c.tutor_id;
     if not a and t.status='suspended' then raise exception 'Account suspended'; end if;
     select * into r from class_revisions where cohort_id=cid for update;
     if p_action='save_class' then
       if r.state='in_review' then raise exception 'Withdraw your submission before editing'; end if;
       if r.version<>(p_data->>'version')::integer or p_data->>'version' is null then raise exception 'This draft changed. Reload before saving.'; end if;
       if not a and not ((p_data->'body'->>'subject_id')=any(coalesce(t.subjects,'{}'::text[]))) then raise exception 'You can only create classes for subjects in your teaching application'; end if;
       update class_revisions set body=p_data->'body',state='draft',version=version+1,updated_at=now() where cohort_id=cid;
     elsif p_action='submit_class' then
       if t.status<>'active' then raise exception 'Teacher approval is required first'; end if;
       if r.state not in ('draft','changes_requested') then raise exception 'This revision cannot be submitted'; end if;
       body:=r.body;
       if not a and not ((body->>'subject_id')=any(coalesce(t.subjects,'{}'::text[]))) then raise exception 'This class subject is not in your teaching application'; end if;
       if coalesce(body->>'whatsapp_link','')<>'' and body->>'whatsapp_link' !~ '^https://' then raise exception 'The group link must use HTTPS'; end if;
       if length(trim(coalesce(body->>'title','')))<3 or length(trim(coalesce(body->>'description','')))<20 or nullif(body->>'start_date','') is null or jsonb_array_length(coalesce(body->'lessons','[]'))=0 then raise exception 'Add a title, description, start date and at least one lesson'; end if;
       if not exists(select 1 from subjects where id=body->>'subject_id' and enrollment_price is not null) then raise exception 'ThinkRight must set the subject price first'; end if;
       for entry in select * from jsonb_array_elements(body->'lessons') loop
         lid:=(entry->>'id')::uuid;
         if lid is null or lid=any(kept) or exists(select 1 from lessons where id=lid and cohort_id<>cid) then raise exception 'Invalid or repeated lesson ID'; end if;
         kept:=array_append(kept,lid);
         if length(trim(coalesce(entry->>'title','')))=0 or length(trim(coalesce(entry->>'syllabus_topic','')))=0 or coalesce(entry->>'video_url','') !~ '^https://' then raise exception 'Every lesson needs a title, topic and HTTPS video link'; end if;
       end loop;
       update class_revisions set state='in_review',feedback=null,version=version+1,updated_at=now() where cohort_id=cid;
     elsif p_action='withdraw_class' then
       if r.state<>'in_review' then raise exception 'Class is not in review'; end if;
       update class_revisions set state='draft',version=version+1,updated_at=now() where cohort_id=cid;
     elsif p_action='availability' then
       if not c.published or t.status<>'active' or p_data->>'status' not in ('open','in_progress','closed') then raise exception 'Invalid availability change'; end if;
       update cohorts set status=p_data->>'status',updated_at=now() where id=cid;
     elsif p_action='class_review' then
       if r.state<>'in_review' then raise exception 'Class is not in review'; end if;
       if p_data->>'decision'='approve' then
         body:=r.body;
         if t.status<>'active' or not exists(select 1 from subjects where id=body->>'subject_id' and enrollment_price is not null) then raise exception 'Teacher approval and subject pricing are required'; end if;
         update cohorts set title=body->>'title',description=body->>'description',subject_id=body->>'subject_id',start_date=(body->>'start_date')::date,whatsapp_link=nullif(body->>'whatsapp_link',''),price=(select enrollment_price from subjects where id=body->>'subject_id'),published=true,status=case when c.published then c.status else 'open' end,updated_at=now() where id=cid;
         for entry in select value from jsonb_array_elements(body->'lessons') loop
           lid:=coalesce(nullif(entry->>'id','')::uuid,gen_random_uuid());
           if exists(select 1 from lessons where id=lid and cohort_id<>cid) then raise exception 'Invalid lesson ownership'; end if;
           kept:=array_append(kept,lid);
           insert into lessons(id,cohort_id,title,syllabus_topic,video_url,order_index) values(lid,cid,entry->>'title',entry->>'syllabus_topic',entry->>'video_url',cardinality(kept))
           on conflict(id) do update set title=excluded.title,syllabus_topic=excluded.syllabus_topic,video_url=excluded.video_url,order_index=excluded.order_index,archived=false;
         end loop;
         update lessons set archived=true where cohort_id=cid and not(id=any(kept));
         update class_revisions set state='published',feedback=null,version=version+1,updated_at=now() where cohort_id=cid;
       else
         if length(trim(coalesce(p_data->>'feedback','')))=0 then raise exception 'Explain the requested changes'; end if;
         update class_revisions set state='changes_requested',feedback=p_data->>'feedback',version=version+1,updated_at=now() where cohort_id=cid;
       end if;
     end if;
   end if;
   result:=jsonb_build_object('id',cid);
 elsif p_action in ('reply','resolve') then
   select * into c from cohorts where id=(select cohort_id from cohort_posts where id=(p_data->>'id')::uuid);
   if c.id is null or (not a and c.tutor_id<>uid) or (not a and not exists(select 1 from tutors where id=uid and status='active')) then raise exception 'Class access required'; end if;
   if p_action='reply' then
     if length(trim(coalesce(p_data->>'body','')))=0 then raise exception 'Write a reply'; end if;
     insert into cohort_posts(cohort_id,author_id,body,parent_id) values(c.id,uid,trim(p_data->>'body'),(p_data->>'id')::uuid);
   else update cohort_posts set resolved=coalesce((p_data->>'resolved')::boolean,true) where id=(p_data->>'id')::uuid; end if;
 elsif p_action='bank' then
   if not exists(select 1 from tutors where id=uid and status<>'suspended') then raise exception 'Teacher access required'; end if;
   if length(trim(coalesce(p_data->>'bank','')))=0 or length(trim(coalesce(p_data->>'account_name','')))=0 then raise exception 'Complete the bank details'; end if;
   insert into teacher_bank_details(tutor_id,bank,account_number,account_name) values(uid,trim(p_data->>'bank'),p_data->>'account_number',trim(p_data->>'account_name')) on conflict(tutor_id) do update set bank=excluded.bank,account_number=excluded.account_number,account_name=excluded.account_name,reviewed=false,updated_at=now();
 elsif p_action='bank_review' then
   update teacher_bank_details set reviewed=true where tutor_id=(p_data->>'id')::uuid;
 elsif p_action='reconcile' then
   eid:=(p_data->>'id')::uuid;
   select co.tutor_id into tid from enrollments e join cohorts co on co.id=e.cohort_id where e.id=eid;
   perform 1 from tutors where id=tid for update;
   if length(trim(coalesce(p_data->>'reference','')))<3 then raise exception 'Payment evidence reference required'; end if;
   insert into teacher_earnings(tutor_id,enrollment_id,cohort_id,gross_kobo,teacher_kobo,reference,source)
   select tid,e.id,e.cohort_id,round(e.paid_amount*100),round(e.paid_amount*70),trim(p_data->>'reference'),'legacy_reconciled' from enrollments e where e.id=eid and e.paid_amount>0;
 elsif p_action='payout' then
   tid:=(p_data->>'id')::uuid;
   perform 1 from tutors where id=tid for update;
   select * into bank from teacher_bank_details where tutor_id=tid for update;
   if bank.tutor_id is null or not bank.reviewed then raise exception 'Review the bank details first'; end if;
   amt:=(p_data->>'amount_kobo')::bigint;
   select coalesce((select sum(teacher_kobo) from teacher_earnings where tutor_id=tid),0)-coalesce((select sum(amount_kobo) from teacher_payouts where tutor_id=tid and not reversed),0) into bal;
   if amt is null or amt<=0 or amt>bal then raise exception 'Payout exceeds unpaid earnings or is invalid'; end if;
   if length(trim(coalesce(p_data->>'reference','')))<3 or (p_data->>'paid_at')::timestamptz>now() then raise exception 'Enter a completed transfer reference and payment date'; end if;
   insert into teacher_payouts(tutor_id,amount_kobo,reference,paid_at,bank_snapshot) values(tid,amt,trim(p_data->>'reference'),(p_data->>'paid_at')::timestamptz,to_jsonb(bank));
 elsif p_action='reverse_payout' then
   if length(trim(coalesce(p_data->>'reason','')))<3 then raise exception 'A correction reason is required'; end if;
   select tutor_id into tid from teacher_payouts where id=(p_data->>'id')::uuid;
   perform 1 from tutors where id=tid for update;
   update teacher_payouts set reversed=true,reversal_reason=p_data->>'reason' where id=(p_data->>'id')::uuid and not reversed;
 else raise exception 'Unknown operation'; end if;
 insert into workspace_audit(actor,action,target,details) values(uid,p_action,coalesce(cid::text,p_data->>'id',p_data->>'subject_id'),p_data - 'account_number' - 'account_name' - 'body');
 return result;
end $$;

-- A purchase is for one teacher's complete subject course (the cohort), never an
-- individual lesson/topic. workspace_enrolled() therefore unlocks every current
-- lesson belonging to that cohort. The client supplies only the course id; the
-- server resolves its subject price. Payment verification is service-role only.
create or replace function public.class_curriculum(p_cohort uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'title',l.title,'syllabus_topic',l.syllabus_topic,'order_index',l.order_index) order by l.order_index),'[]')
 from lessons l join cohorts c on c.id=l.cohort_id
 where c.id=p_cohort and not l.archived and ((c.published and c.status in ('open','in_progress')) or workspace_enrolled(c.id) or c.tutor_id=auth.uid() or workspace_admin());
$$;
grant execute on function public.class_curriculum(uuid) to anon,authenticated;
create or replace function public.class_order_create(p_cohort uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare c cohorts; price numeric; o class_orders;
begin
 if auth.uid() is null or (workspace_identity()->>'role')<>'student' then raise exception 'Student sign-in required'; end if;
 select * into c from cohorts where id=p_cohort and published and status in ('open','in_progress');
 if c.id is null then raise exception 'Class unavailable'; end if;
 if not exists(select 1 from tutors where id=c.tutor_id and status='active') then raise exception 'Class unavailable'; end if;
 if exists(select 1 from enrollments where user_id=auth.uid() and cohort_id=p_cohort and status='active' and (expires_at is null or expires_at>now())) then return jsonb_build_object('enrolled',true); end if;
 select enrollment_price into price from subjects where id=c.subject_id;
 if price is null then raise exception 'Enrollment pricing is not available yet'; end if;
 if price=0 then
   insert into enrollments(user_id,cohort_id,paid_amount,status) values(auth.uid(),p_cohort,0,'active') on conflict(user_id,cohort_id) do update set status='active',expires_at=null;
   return jsonb_build_object('enrolled',true);
 end if;
 insert into class_orders(user_id,cohort_id,amount_kobo,reference) values(auth.uid(),p_cohort,round(price*100),'TR-'||gen_random_uuid()::text) returning * into o;
 return to_jsonb(o)||jsonb_build_object(
   'subject_id',c.subject_id,
   'tutor_id',c.tutor_id,
   'access_scope','subject_course'
 );
end $$;

create or replace function public.class_order_settle(p_reference text,p_amount bigint,p_currency text,p_paid_at timestamptz,p_user uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare o class_orders; tid uuid; eid uuid;
begin
 select * into o from class_orders where reference=p_reference for update;
 if o.id is null or p_user is null or p_amount is null or p_currency is null or o.user_id<>p_user or o.amount_kobo<>p_amount or p_currency<>'NGN' or p_paid_at is null or p_paid_at>o.expires_at or p_paid_at<o.created_at-interval '1 minute' then raise exception 'Payment does not match a valid order'; end if;
 if o.status='paid' then return o.cohort_id; end if;
 select tutor_id into tid from cohorts where id=o.cohort_id;
 perform 1 from tutors where id=tid for update;
 if exists(select 1 from enrollments e join teacher_earnings te on te.enrollment_id=e.id where e.user_id=o.user_id and e.cohort_id=o.cohort_id) then raise exception 'Duplicate class payment requires support reconciliation'; end if;
 insert into enrollments(user_id,cohort_id,paid_amount,status) values(o.user_id,o.cohort_id,o.amount_kobo/100.0,'active') on conflict(user_id,cohort_id) do update set paid_amount=excluded.paid_amount,status='active',expires_at=null returning id into eid;
 insert into teacher_earnings(tutor_id,enrollment_id,cohort_id,gross_kobo,teacher_kobo,reference,source) values(tid,eid,o.cohort_id,o.amount_kobo,round(o.amount_kobo*0.7),p_reference,'verified_payment');
 update class_orders set status='paid' where id=o.id;
 return o.cohort_id;
end $$;
revoke all on function public.class_order_settle(text,bigint,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.class_order_settle(text,bigint,text,timestamptz,uuid) to service_role;
revoke all on function public.workspace_identity(), public.workspace_snapshot(), public.workspace_action(text,jsonb), public.class_order_create(uuid) from public,anon;
grant execute on function public.workspace_identity(), public.workspace_snapshot(), public.workspace_action(text,jsonb), public.class_order_create(uuid) to authenticated;
commit;

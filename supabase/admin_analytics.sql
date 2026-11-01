-- Apply after admin_console.sql, test_results.sql and subject_course_enrollment.sql.
begin;
create or replace view public.admin_learning_events as
select user_id, completed_at as occurred_at, 'test'::text as kind, subject,
 subject as title, score_percentage as score from public.test_results
union all
select p.user_id,p.completed_at,'lesson',c.subject_id,l.title,null::numeric
from public.lesson_progress p join public.lessons l on l.id=p.lesson_id
join public.cohorts c on c.id=l.cohort_id;
revoke all on public.admin_learning_events from public,anon,authenticated;

create or replace function public.admin_analytics_report(
 p_from date, p_to date, p_kind text default 'student', p_page integer default 0,
 p_search text default '', p_subject text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
declare a timestamptz; b timestamptz; prev timestamptz; output jsonb;
begin
 if not public.workspace_admin() then raise exception 'Admin access required'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>365 or p_page is null or p_page<0 or p_page>100000
 or p_kind not in ('student','teacher') or p_kind is null or length(coalesce(p_search,''))>100 then raise exception 'Invalid analytics filters'; end if;
 if coalesce(p_subject,'')<>'' and not exists(select 1 from subjects where id=p_subject) then raise exception 'Invalid subject'; end if;
 a:=p_from::timestamp at time zone 'Africa/Lagos'; b:=(p_to+1)::timestamp at time zone 'Africa/Lagos'; prev:=a-(b-a);
 with ev as (
 select e.* from admin_learning_events e where e.occurred_at>=prev and e.occurred_at<b
 and (coalesce(p_subject,'')='' or lower(e.subject)=lower(p_subject) or lower(e.subject)=(select lower(name) from subjects where id=p_subject))
 and not exists(select 1 from workspace_roles r where r.user_id=e.user_id and r.role in ('teacher','admin'))
 and not exists(select 1 from tutors t where t.id=e.user_id)
 ), metrics as (
 select 'current' as period,a as lo,b as hi union all select 'previous',prev,a
 ), totals as (
 select m.period,jsonb_build_object(
 'active_learners',(select count(distinct user_id) from ev where occurred_at>=m.lo and occurred_at<m.hi),
 'tests',(select count(*) from ev where kind='test' and occurred_at>=m.lo and occurred_at<m.hi),
 'lessons',(select count(*) from ev where kind='lesson' and occurred_at>=m.lo and occurred_at<m.hi),
 'average_score',(select round(avg(score),1) from ev where kind='test' and occurred_at>=m.lo and occurred_at<m.hi),
 'new_students',(select count(*) from user_profiles u where u.created_at>=m.lo and u.created_at<m.hi and not exists(select 1 from tutors t where t.id=u.id) and not exists(select 1 from workspace_roles r where r.user_id=u.id and r.role in ('teacher','admin'))),
 'enrollments',(select count(*) from subject_course_enrollments e where e.created_at>=m.lo and e.created_at<m.hi and (coalesce(p_subject,'')='' or e.subject_id=p_subject)),
 'revenue_kobo',(select coalesce(sum(gross_kobo),0) from teacher_earnings te join cohorts c on c.id=te.cohort_id where te.source='verified_payment' and te.created_at>=m.lo and te.created_at<m.hi and (coalesce(p_subject,'')='' or c.subject_id=p_subject))
 ) as value from metrics m
 ), people as (
 select u.id,coalesce(nullif(u.username,''),'Student') as name,'student'::text as role,null::text as status,
 (select count(*) from ev where user_id=u.id and occurred_at>=a and kind='test') as tests,
 (select round(avg(score),1) from ev where user_id=u.id and occurred_at>=a and kind='test') as average_score,
 (select count(*) from ev where user_id=u.id and occurred_at>=a and kind='lesson') as lessons,
 (select max(occurred_at) from admin_learning_events where user_id=u.id) as last_activity,
 (select count(*) from subject_course_enrollments e where e.user_id=u.id and e.created_at>=a and e.created_at<b and (coalesce(p_subject,'')='' or e.subject_id=p_subject)) as enrollments,
 0::bigint as classes,0::numeric as earnings_kobo
 from user_profiles u where p_kind='student' and not exists(select 1 from tutors t where t.id=u.id)
 and not exists(select 1 from workspace_roles r where r.user_id=u.id and r.role in ('teacher','admin'))
 and (coalesce(p_subject,'')='' or exists(select 1 from ev where user_id=u.id) or exists(select 1 from subject_course_enrollments e where e.user_id=u.id and e.subject_id=p_subject))
 union all
 select t.id,t.display_name,'teacher',t.status,0,null,
 (select count(*) from lessons l join cohorts c on c.id=l.cohort_id where c.tutor_id=t.id and c.published and not l.archived and (coalesce(p_subject,'')='' or c.subject_id=p_subject)),
 (select max(created_at) from workspace_audit where actor=t.id),
 (select count(*) from subject_course_enrollments e where e.tutor_id=t.id and e.created_at>=a and e.created_at<b and (coalesce(p_subject,'')='' or e.subject_id=p_subject)),
 (select count(*) from cohorts c where c.tutor_id=t.id and c.published and (coalesce(p_subject,'')='' or c.subject_id=p_subject)),
 (select coalesce(sum(teacher_kobo),0) from teacher_earnings te join cohorts c on c.id=te.cohort_id where te.tutor_id=t.id and te.created_at>=a and te.created_at<b and (coalesce(p_subject,'')='' or c.subject_id=p_subject))
 from tutors t where p_kind='teacher' and (coalesce(p_subject,'')='' or p_subject=any(t.subjects))
 ), filtered as (select * from people where name ilike '%'||coalesce(p_search,'')||'%')
 select jsonb_build_object(
 'current',(select value from totals where period='current'),'previous',(select value from totals where period='previous'),
 'daily',(select coalesce(jsonb_agg(x order by x.day),'[]') from (
 select d::date as day,(select count(*) from ev where kind='test' and (occurred_at at time zone 'Africa/Lagos')::date=d::date) as tests,
 (select count(*) from ev where kind='lesson' and (occurred_at at time zone 'Africa/Lagos')::date=d::date) as lessons
 from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') d) x),
 'subjects',(select coalesce(jsonb_agg(s order by s.name),'[]') from (select id,name from subjects) s),
 'people',(select coalesce(jsonb_agg(x order by x.name,x.id),'[]') from (select * from filtered order by name,id limit 25 offset p_page*25) x),
 'people_count',(select count(*) from filtered),
 'attention',jsonb_build_object(
 'pending_teachers',(select count(*) from tutors where status='pending'),
 'pending_classes',(select count(*) from class_revisions where state='in_review'),
 'teachers_without_classes',(select count(*) from tutors t where status='active' and not exists(select 1 from cohorts c where c.tutor_id=t.id and c.published)),
 'stopped_practising',(select count(*) from (select user_id from admin_learning_events e where kind='test' and not exists(select 1 from tutors t where t.id=e.user_id) and not exists(select 1 from workspace_roles r where r.user_id=e.user_id and r.role in ('teacher','admin')) group by user_id having max(occurred_at)<now()-interval '7 days') q)
 ),'generated_at',now()) into output;
 return output;
end $$;

create or replace function public.admin_analytics_person(p_user uuid,p_from date,p_to date)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a timestamptz; b timestamptz;
begin
 if not public.workspace_admin() then raise exception 'Admin access required'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>365 then raise exception 'Invalid dates'; end if;
 a:=p_from::timestamp at time zone 'Africa/Lagos'; b:=(p_to+1)::timestamp at time zone 'Africa/Lagos';
 return jsonb_build_object('events',(select coalesce(jsonb_agg(x order by x.occurred_at desc),'[]') from (
 select * from (
 select kind,title,subject,score,occurred_at from admin_learning_events where user_id=p_user
 union all select 'enrollment',s.name,e.subject_id,null,e.created_at from subject_course_enrollments e join subjects s on s.id=e.subject_id where e.user_id=p_user
 union all select 'publishing',replace(action,'_',' '),null,null,created_at from workspace_audit where actor=p_user and exists(select 1 from tutors where id=p_user)
 ) all_events where occurred_at>=a and occurred_at<b order by occurred_at desc limit 100) x));
end $$;
revoke all on function public.admin_analytics_report(date,date,text,integer,text,text),public.admin_analytics_person(uuid,date,date) from public,anon;
grant execute on function public.admin_analytics_report(date,date,text,integer,text,text),public.admin_analytics_person(uuid,date,date) to authenticated;
create index if not exists analytics_test_date on test_results(completed_at);
create index if not exists analytics_progress_date on lesson_progress(completed_at);
commit;

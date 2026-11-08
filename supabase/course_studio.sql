-- Apply after lesson_videos.sql, class_thumbnails.sql and teacher_revenue_share_90.sql.
-- Existing enrollments, payments, video access and published versions are retained.
begin;
alter table public.cohorts add column if not exists course_type text check(course_type in ('topic','complete'));
alter table public.cohorts add column if not exists focused_topics text;
alter table public.cohorts add column if not exists outcomes text;
alter table public.class_revisions add column if not exists suggested_price numeric(10,2);

-- Keep the installed workspace implementation and its existing security checks.
do $$
declare f record; definition text;
begin
 if to_regprocedure('public.workspace_action_before_course(text,jsonb)') is null then
   alter function public.workspace_action(text,jsonb) rename to workspace_action_before_course;
 end if;
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prokind='f' and p.prosrc like '%update cohorts set price=%' loop
   definition:=pg_get_functiondef(f.oid);
   definition:=replace(definition,'where subject_id=p_data->>''subject_id'';','where subject_id=p_data->>''subject_id'' and course_type is null;');
   execute definition;
 end loop;
 -- Change the installed order implementation, leaving its private-video wrapper intact.
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prokind='f' and p.proname like 'class_order_create%'
     and p.prosrc like '%select enrollment_price into price from subjects where id=c.subject_id;%' and p.prosrc not like '%if c.course_type is not null then price:=c.price%' loop
   definition:=pg_get_functiondef(f.oid);
   execute replace(definition,'select enrollment_price into price from subjects where id=c.subject_id;',
    'if c.course_type is not null then price:=c.price; else select enrollment_price into price from subjects where id=c.subject_id; end if;');
 end loop;
end $$;
revoke all on function public.workspace_action_before_course(text,jsonb) from public,anon,authenticated;

create or replace function public.course_revision_validate() returns trigger
language plpgsql security definer set search_path=public as $$
declare b jsonb:=new.body; owner_id uuid; l jsonb; price numeric;
begin
 -- Old published rows are untouched until their next submission.
 if new.state in ('in_review','published') and (tg_op='INSERT' or new.body is distinct from old.body or new.state is distinct from old.state) then
   select tutor_id into owner_id from cohorts where id=new.cohort_id;
   if coalesce(b->>'course_type','') not in ('topic','complete') then raise exception 'Choose focused topic or complete subject course'; end if;
   if not exists(select 1 from tutors where id=owner_id and status='active' and (b->>'subject_id')=any(subjects)) then raise exception 'Choose an approved teaching subject'; end if;
   if b->>'course_type'='topic' and length(trim(coalesce(b->>'focused_topics','')))=0 then raise exception 'Enter the course topics'; end if;
   if length(trim(coalesce(b->>'title','')))<3 or length(trim(coalesce(b->>'description','')))<20 or length(trim(coalesce(b->>'outcomes','')))=0 then raise exception 'Complete the course title, description and learning outcomes'; end if;
   if nullif(b->>'thumbnail_path','') is null or not exists(select 1 from storage.objects where bucket_id='class-thumbnails' and name=b->>'thumbnail_path' and name like owner_id::text||'/%') then raise exception 'Upload a course cover before review'; end if;
   price:=(b->>'proposed_price')::numeric;
   if price is null or price not between 100 and 1000000 or price<>round(price,2) then raise exception 'Enter a course price from 100 to 1000000 with at most two decimals'; end if;
   if jsonb_array_length(coalesce(b->'lessons','[]'))=0 then raise exception 'Add at least one recorded lesson'; end if;
   for l in select value from jsonb_array_elements(b->'lessons') loop
     if length(trim(coalesce(l->>'title','')))=0 or length(trim(coalesce(l->>'syllabus_topic','')))=0 or nullif(l->>'video_asset_id','') is null then raise exception 'Every lesson needs a title, topic and uploaded video'; end if;
   end loop;
 end if;
 return new;
end $$;
drop trigger if exists course_revision_validate on public.class_revisions;
create trigger course_revision_validate before insert or update of body,state on public.class_revisions for each row execute function public.course_revision_validate();
revoke all on function public.course_revision_validate() from public,anon,authenticated;

-- Private helper: only the checked review and acceptance paths below may publish.
create or replace function public.course_publish(p_id uuid,p_price numeric) returns void
language plpgsql security definer set search_path=public as $$
declare c cohorts; r class_revisions; b jsonb; l jsonb; kept uuid[]:='{}'; lid uuid;
begin
 select * into c from cohorts where id=p_id for update;
 select * into r from class_revisions where cohort_id=p_id for update;
 if r.state<>'in_review' or not exists(select 1 from tutors where id=c.tutor_id and status='active') then raise exception 'Course is not ready for publication'; end if;
 b:=r.body;
 if p_price is null or p_price not between 100 and 1000000 or p_price<>round(p_price,2) then raise exception 'Enter a valid course price'; end if;
 -- A course identity cannot change underneath existing purchases.
 if c.published and c.subject_id<>b->>'subject_id' then raise exception 'Create a new course to change its published subject'; end if;
 update cohorts set title=b->>'title',description=b->>'description',subject_id=b->>'subject_id',
  course_type=b->>'course_type',focused_topics=case when b->>'course_type'='topic' then b->>'focused_topics' else null end,
  outcomes=b->>'outcomes',price=p_price,whatsapp_link=null,published=true,
  status=case when c.published then c.status else 'open' end,updated_at=now() where id=p_id;
 for l in select value from jsonb_array_elements(b->'lessons') loop
   lid:=(l->>'id')::uuid;
   if lid is null or lid=any(kept) or exists(select 1 from lessons where id=lid and cohort_id<>p_id) then raise exception 'Invalid lesson ownership or duplicate lesson'; end if;
   kept:=array_append(kept,lid);
   insert into lessons(id,cohort_id,title,syllabus_topic,video_url,order_index)
   values(lid,p_id,l->>'title',l->>'syllabus_topic',l->>'video_url',cardinality(kept))
   on conflict(id) do update set title=excluded.title,syllabus_topic=excluded.syllabus_topic,video_url=excluded.video_url,order_index=excluded.order_index,archived=false;
 end loop;
 update lessons set archived=true where cohort_id=p_id and not(id=any(kept));
 update class_revisions set state='published',body=jsonb_set(body,'{proposed_price}',to_jsonb(p_price)),suggested_price=null,version=version+1,updated_at=now() where cohort_id=p_id;
end $$;
revoke all on function public.course_publish(uuid,numeric) from public,anon,authenticated;

create or replace function public.workspace_action(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
declare c cohorts; r class_revisions; cid uuid; price numeric; result jsonb; b jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if p_action in ('class_review','accept_course_price','request_course_price','submit_class','save_class','withdraw_class') then
   cid:=nullif(p_data->>'id','')::uuid;
   if cid is not null then
     select * into c from cohorts where id=cid for update;
     if c.id is null or (not workspace_admin() and c.tutor_id<>auth.uid()) then raise exception 'Course unavailable'; end if;
     select * into r from class_revisions where cohort_id=cid for update;
   end if;
 end if;
 if p_action='request_course_price' then
   if c.tutor_id is distinct from auth.uid() or r.state<>'in_review' or r.suggested_price is null then raise exception 'No price offer is available to reconsider'; end if;
   if (p_data->>'version')::int is distinct from r.version then raise exception 'The price offer changed. Reload before responding.'; end if;
   price:=(p_data->>'price')::numeric;
   if price is null or price not between 100 and 1000000 or price<>round(price,2) then raise exception 'Enter a valid course price'; end if;
   if length(trim(coalesce(p_data->>'reason',''))) not between 10 and 1000 then raise exception 'Explain your request in 10 to 1000 characters'; end if;
   update class_revisions set body=jsonb_set(body,'{proposed_price}',to_jsonb(price)),suggested_price=null,
     feedback='Teacher price request: '||trim(p_data->>'reason'),version=version+1,updated_at=now() where cohort_id=cid;
 elsif p_action='accept_course_price' then
   if c.tutor_id is distinct from auth.uid() or r.state<>'in_review' or r.suggested_price is null then raise exception 'No price offer is available to accept'; end if;
   if (p_data->>'version')::int is distinct from r.version then raise exception 'The price offer changed. Reload before accepting.'; end if;
   perform course_publish(cid,r.suggested_price);
 elsif p_action='class_review' and p_data->>'decision'='approve' and r.body ? 'course_type' then
   if not workspace_admin() then raise exception 'Administrator access required'; end if;
   if r.state<>'in_review' or not exists(select 1 from tutors where id=c.tutor_id and status='active') then raise exception 'Course is not ready for review'; end if;
   price:=coalesce(nullif(p_data->>'approved_price','')::numeric,(r.body->>'proposed_price')::numeric);
   if price is null or price not between 100 and 1000000 or price<>round(price,2) then raise exception 'Enter a valid course price'; end if;
   if price=(r.body->>'proposed_price')::numeric then perform course_publish(cid,price);
   else
     if length(trim(coalesce(p_data->>'feedback','')))<10 then raise exception 'Explain the suggested price to the teacher'; end if;
     update class_revisions set suggested_price=price,feedback=trim(p_data->>'feedback'),version=version+1,updated_at=now() where cohort_id=cid;
   end if;
 elsif p_action='submit_class' then
   if c.id is null or r.cohort_id is null or r.state not in ('draft','changes_requested') or not exists(select 1 from tutors where id=c.tutor_id and status='active') then raise exception 'Course cannot be submitted'; end if;
   -- Triggers validate course metadata, covers, ready assets and ownership atomically.
   update class_revisions set state='in_review',suggested_price=null,feedback=null,version=version+1,updated_at=now() where cohort_id=cid;
 else
   if p_action='save_class' and c.published and p_data->'body'->>'subject_id' is distinct from c.subject_id then raise exception 'Create a new course to change its published subject'; end if;
   result:=workspace_action_before_course(p_action,p_data);
   if p_action in ('save_class','withdraw_class') then
     update class_revisions set suggested_price=null where cohort_id=(result->>'id')::uuid;
   end if;
   return result;
 end if;
 insert into workspace_audit(actor,action,target,details) values(auth.uid(),p_action,cid::text,p_data-'body');
 return jsonb_build_object('id',cid,'price_pending',exists(select 1 from class_revisions where cohort_id=cid and state='in_review' and suggested_price is not null));
end $$;
revoke all on function public.workspace_action(text,jsonb) from public,anon;
grant execute on function public.workspace_action(text,jsonb) to authenticated;

-- One ongoing conversation per course; only its teacher and enrolled students participate.
create or replace function public.course_message_send(p_cohort uuid,p_body text) returns uuid
language plpgsql security definer set search_path=public as $$
declare mid uuid;
begin
 if auth.uid() is null or not (workspace_enrolled(p_cohort) or exists(select 1 from cohorts c join tutors t on t.id=c.tutor_id where c.id=p_cohort and c.tutor_id=auth.uid() and t.status='active')) then raise exception 'Course enrollment required'; end if;
 if length(trim(coalesce(p_body,''))) not between 1 and 2000 then raise exception 'Write a message of up to 2000 characters'; end if;
 insert into cohort_posts(cohort_id,author_id,body) values(p_cohort,auth.uid(),trim(p_body)) returning id into mid;
 return mid;
end $$;
create or replace function public.course_messages(p_cohort uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null or not (workspace_enrolled(p_cohort) or exists(select 1 from cohorts where id=p_cohort and tutor_id=auth.uid())) then raise exception 'Course enrollment required'; end if;
 return (select coalesce(jsonb_agg(x order by x.created_at,x.id),'[]') from
 (select p.id,p.body,p.created_at,p.author_id,coalesce(t.display_name,u.username,'Student') as author_name
 from cohort_posts p left join tutors t on t.id=p.author_id left join user_profiles u on u.id=p.author_id
 where p.cohort_id=p_cohort order by p.created_at desc,p.id desc limit 100) x);
end $$;
revoke all on function public.course_message_send(uuid,text),public.course_messages(uuid) from public,anon;
grant execute on function public.course_message_send(uuid,text),public.course_messages(uuid) to authenticated;
commit;

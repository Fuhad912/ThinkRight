-- Requires teacher_workspace.sql. Private 5 MB certificate uploads.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('teacher-credentials','teacher-credentials',false,5242880,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists teacher_credentials_read on storage.objects;
create policy teacher_credentials_read on storage.objects for select to authenticated
using(bucket_id='teacher-credentials' and (split_part(name,'/',1)=auth.uid()::text or public.workspace_admin()));
drop policy if exists teacher_credentials_upload on storage.objects;
create policy teacher_credentials_upload on storage.objects for insert to authenticated
with check(bucket_id='teacher-credentials' and split_part(name,'/',1)=auth.uid()::text and name ~ ('^'||auth.uid()::text||'/[0-9a-f-]+[.](pdf|jpg|jpeg|png)$'));
-- No UPDATE policy: submitted evidence cannot be overwritten in place.
drop policy if exists teacher_credentials_cleanup on storage.objects;
create policy teacher_credentials_cleanup on storage.objects for delete to authenticated
using(bucket_id='teacher-credentials' and split_part(name,'/',1)=auth.uid()::text and not exists(select 1 from public.teacher_applications ap where ap.details->>'credential_path'=name));

-- Run after teacher_workspace.sql on existing deployments.
begin;

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
       update class_revisions set body=p_data->'body',state='draft',version=version+1,updated_at=now() where cohort_id=cid;
     elsif p_action='submit_class' then
       if t.status<>'active' then raise exception 'Teacher approval is required first'; end if;
       if r.state not in ('draft','changes_requested') then raise exception 'This revision cannot be submitted'; end if;
       body:=r.body;
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
commit;

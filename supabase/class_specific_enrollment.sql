-- Apply after subject_course_enrollment.sql. Preserve existing access and financial records.
-- New purchases unlock only the selected class. Do not rerun the older migration afterwards.
begin;
drop trigger if exists subject_course_source_changed on public.enrollments;
drop trigger if exists subject_course_published on public.cohorts;
create or replace function public.sync_subject_course(p_user uuid,p_tutor uuid,p_subject text)
returns void language plpgsql security definer set search_path=public as $$ begin return; end $$;
create or replace function public.workspace_enrolled(p_cohort uuid)
returns boolean language sql stable security definer set search_path=public as $$
select exists(select 1 from enrollments where cohort_id=p_cohort and user_id=auth.uid() and status='active' and (expires_at is null or expires_at>now()));
$$;
create or replace function public.class_order_create(p_cohort uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c cohorts; price numeric; o class_orders; source enrollments; eid uuid; uid uuid:=auth.uid();
begin
 if uid is null or (workspace_identity()->>'role')<>'student' then raise exception 'Student sign-in required'; end if;
 select * into c from cohorts where id=p_cohort and published;
 if c.id is null then raise exception 'Class unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text||':'||c.id::text,0));
 select e.* into source from enrollments e where e.user_id=uid and e.cohort_id=c.id;
 if source.status='active' and (source.expires_at is null or source.expires_at>now()) then
   return jsonb_build_object('enrolled',true,'cohort_id',c.id,'subject_id',c.subject_id,'tutor_id',c.tutor_id);
 end if;
 if c.status not in ('open','in_progress') or not exists(select 1 from tutors where id=c.tutor_id and status='active') then raise exception 'Class unavailable'; end if;
 if source.id is not null then raise exception 'This class enrollment is inactive. Contact support to restore access.'; end if;
 select enrollment_price into price from subjects where id=c.subject_id;
 if price is null then raise exception 'Enrollment pricing is not available yet'; end if;
 if price=0 then
   insert into enrollments(user_id,cohort_id,paid_amount,status) values(uid,c.id,0,'active')
   on conflict(user_id,cohort_id) do update set status='active',expires_at=null returning id into eid;
   return jsonb_build_object('enrolled',true,'cohort_id',c.id,'subject_id',c.subject_id,'tutor_id',c.tutor_id);
 end if;
 -- Reuse an in-flight purchase of this class only.
 select * into o from class_orders where user_id=uid and cohort_id=c.id
   and status='pending' and expires_at>now() order by created_at desc limit 1;
 if o.id is null then
   insert into class_orders(user_id,cohort_id,tutor_id,subject_id,amount_kobo,reference)
   values(uid,c.id,c.tutor_id,c.subject_id,round(price*100),'TR-'||gen_random_uuid()::text) returning * into o;
 end if;
 return to_jsonb(o)||jsonb_build_object('access_scope','class');
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
 perform pg_advisory_xact_lock(hashtextextended(o.user_id::text||':'||o.cohort_id::text,0));
 if not exists(select 1 from cohorts where id=o.cohort_id and tutor_id=o.tutor_id and subject_id=o.subject_id and published) then raise exception 'Course no longer matches this payment. Contact support.'; end if;
 if exists(select 1 from enrollments where user_id=o.user_id and cohort_id=o.cohort_id) then
   raise exception 'Duplicate class payment requires support reconciliation';
 end if;
 insert into enrollments(user_id,cohort_id,paid_amount,status) values(o.user_id,o.cohort_id,o.amount_kobo/100.0,'active')
 on conflict(user_id,cohort_id) do update set paid_amount=excluded.paid_amount,status='active',expires_at=null returning id into eid;
 insert into teacher_earnings(tutor_id,enrollment_id,cohort_id,gross_kobo,teacher_kobo,reference,source)
 values(o.tutor_id,eid,o.cohort_id,o.amount_kobo,round(o.amount_kobo*0.7),p_reference,'verified_payment');
 update class_orders set status='paid' where id=o.id;
 return o.cohort_id;
end $$;

revoke all on function public.class_order_settle(text,bigint,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.class_order_settle(text,bigint,text,timestamptz,uuid) to service_role;
revoke all on function public.class_order_create(uuid) from public,anon;
grant execute on function public.class_order_create(uuid) to authenticated;
commit;

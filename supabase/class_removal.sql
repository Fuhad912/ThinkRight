-- Apply after course_studio.sql and its fixes. No financial or lesson rows are deleted.
begin;
alter table public.cohorts add column if not exists deleted_at timestamptz;
alter table public.cohorts add column if not exists retired_at timestamptz;
alter table public.cohorts add column if not exists removal_requested_at timestamptz;
alter table public.cohorts add column if not exists removal_reason text;

create or replace function public.class_removal(p_id uuid,p_decision text,p_reason text default '') returns jsonb
language plpgsql security definer set search_path=public as $$
declare c cohorts; r class_revisions; protected boolean;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select * into c from cohorts where id=p_id for update;
 if c.id is null or (c.tutor_id<>auth.uid() and not workspace_admin()) then raise exception 'Class unavailable'; end if;
 if c.deleted_at is not null or c.retired_at is not null then raise exception 'This class has already been removed'; end if;
 select * into r from class_revisions where cohort_id=p_id for update;
 protected:=exists(select 1 from enrollments where cohort_id=p_id) or exists(select 1 from class_orders where cohort_id=p_id and status='paid') or exists(select 1 from teacher_earnings where cohort_id=p_id);
 if p_decision='delete' then
   if c.tutor_id<>auth.uid() then raise exception 'Only the class owner can delete this class'; end if;
   if r.state='in_review' then raise exception 'Withdraw your submission before deleting this class'; end if;
   if protected then raise exception 'This class has enrollment or payment records. Request removal instead.'; end if;
   if exists(select 1 from class_orders where cohort_id=p_id and status='pending' and expires_at>now()) then raise exception 'A student is completing payment. Try again after the payment expires or request removal after enrollment.'; end if;
   -- Keep the approved version available if a payment confirmation arrives late.
   -- Closed status and the checkout wrapper prevent any new purchase.
   update cohorts set deleted_at=now(),status='closed',updated_at=now() where id=p_id;
 elsif p_decision='request' then
   if c.tutor_id<>auth.uid() then raise exception 'Only the class owner can request removal'; end if;
   if not protected then raise exception 'No enrollment records exist. Withdraw any submission and delete this class directly.'; end if;
   if c.removal_requested_at is not null then raise exception 'A removal request is already awaiting review'; end if;
   if length(trim(coalesce(p_reason,''))) not between 10 and 2000 then raise exception 'Explain your request in 10 to 2000 characters'; end if;
   update cohorts set removal_requested_at=now(),removal_reason=trim(p_reason),updated_at=now() where id=p_id;
 elsif p_decision in ('approve','reject') then
   if not workspace_admin() then raise exception 'Administrator access required'; end if;
   if c.removal_requested_at is null then raise exception 'No removal request is awaiting review'; end if;
   if length(trim(coalesce(p_reason,''))) not between 10 and 2000 then raise exception 'Explain your decision in 10 to 2000 characters'; end if;
   update cohorts set retired_at=case when p_decision='approve' then now() else null end,
     status=case when p_decision='approve' then 'closed' else status end,
     removal_requested_at=null,removal_reason=trim(p_reason),updated_at=now() where id=p_id;
 else raise exception 'Invalid removal decision'; end if;
 insert into workspace_audit(actor,action,target,details) values(auth.uid(),'class_removal_'||p_decision,p_id::text,jsonb_build_object('reason',p_reason));
 return jsonb_build_object('id',p_id,'decision',p_decision);
end $$;
revoke all on function public.class_removal(uuid,text,text) from public,anon;
grant execute on function public.class_removal(uuid,text,text) to authenticated;

-- Serialize new checkout against removal. Existing pending payments may still settle.
create or replace function public.class_removal_order_guard() returns trigger
language plpgsql security definer set search_path=public as $$
declare c cohorts;
begin
 select * into c from cohorts where id=new.cohort_id for share;
 if c.deleted_at is not null or c.retired_at is not null then raise exception 'This class is no longer open for enrollment'; end if;
 return new;
end $$;
drop trigger if exists class_removal_order_guard on public.class_orders;
create trigger class_removal_order_guard before insert on public.class_orders for each row execute function public.class_removal_order_guard();
revoke all on function public.class_removal_order_guard() from public,anon,authenticated;

-- Preserve all installed course rules and prevent removed classes being republished.
do $$ begin
 if to_regprocedure('public.workspace_action_before_removal(text,jsonb)') is null then
   alter function public.workspace_action(text,jsonb) rename to workspace_action_before_removal;
 end if;
end $$;
revoke all on function public.workspace_action_before_removal(text,jsonb) from public,anon,authenticated;
create or replace function public.workspace_action(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
declare c cohorts;
begin
 if p_action in ('save_class','submit_class','withdraw_class','class_review','availability','accept_course_price','request_course_price') and nullif(p_data->>'id','') is not null then
   select * into c from cohorts where id=(p_data->>'id')::uuid for update;
   if c.deleted_at is not null or c.retired_at is not null then raise exception 'This class has been removed and cannot be edited or reopened'; end if;
 end if;
 return workspace_action_before_removal(p_action,p_data);
end $$;
revoke all on function public.workspace_action(text,jsonb) from public,anon;
grant execute on function public.workspace_action(text,jsonb) to authenticated;
do $$ begin
 if to_regprocedure('public.class_order_create_before_removal(uuid)') is null then
   alter function public.class_order_create(uuid) rename to class_order_create_before_removal;
 end if;
end $$;
revoke all on function public.class_order_create_before_removal(uuid) from public,anon,authenticated;
create or replace function public.class_order_create(p_cohort uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare c cohorts;
begin
 if auth.uid() is null then raise exception 'Student sign-in required'; end if;
 select * into c from cohorts where id=p_cohort for update;
 if c.deleted_at is not null or (c.retired_at is not null and not workspace_enrolled(p_cohort)) then raise exception 'This class is no longer open for enrollment'; end if;
 return class_order_create_before_removal(p_cohort);
end $$;
revoke all on function public.class_order_create(uuid) from public,anon;
grant execute on function public.class_order_create(uuid) to authenticated;
commit;

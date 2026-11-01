-- Apply after teacher_document_upload.sql and subject_course_enrollment.sql.
begin;
create table if not exists public.textbooks (
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(trim(title)) between 2 and 160),
 subject_id text not null references public.subjects(id),
 file_path text not null unique,
 image_url text not null default '',
 published boolean not null default false,
 updated_at timestamptz not null default now()
);
alter table public.textbooks enable row level security;
revoke all on public.textbooks from public,anon,authenticated;
grant select on public.textbooks to authenticated;
drop policy if exists textbook_catalog_read on public.textbooks;
create policy textbook_catalog_read on public.textbooks for select to authenticated
 using (public.workspace_admin() or (published and (public.workspace_identity()->>'role')='student'));
insert into public.textbooks(title,subject_id,file_path,image_url,published)
select 'New School Physics',id,'New_School_Physics.pdf','https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQRpheiIZGV9TXj1n8UtyFfsCFJuxdORS_RuSDVsR3-kw&s=10',true
from public.subjects where id='physics' on conflict(file_path) do nothing;

create or replace function public.admin_console_snapshot(p_page integer default 0)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not public.workspace_admin() then raise exception 'Admin access required'; end if;
 if p_page is null or p_page<0 or p_page>100000 then raise exception 'Invalid page'; end if;
 return jsonb_build_object(
  'order_count',(select count(*) from class_orders),
  'paid_count',(select count(*) from class_orders where status='paid'),
  'pending_count',(select count(*) from class_orders where status='pending' and expires_at>now()),
  'gross_kobo',(select coalesce(sum(amount_kobo),0) from class_orders where status='paid'),
  'orders',(select coalesce(jsonb_agg(x order by x.created_at desc),'[]') from
    (select id,reference,user_id,cohort_id,tutor_id,subject_id,amount_kobo,status,created_at,expires_at
     from class_orders order by created_at desc,id desc limit 50 offset p_page*50) x),
  'books',(select coalesce(jsonb_agg(b order by b.title),'[]') from textbooks b));
end $$;

create or replace function public.admin_textbook_save(p_book jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare b textbooks; old_book textbooks; bid uuid; image text:=trim(coalesce(p_book->>'image_url','')); path text:=trim(coalesce(p_book->>'file_path',''));
begin
 if not public.workspace_admin() then raise exception 'Admin access required'; end if;
 if length(path)>512 or path='' or path like '%..%' or path like '/%' or lower(right(path,4))<>'.pdf' then raise exception 'Enter a valid PDF storage path'; end if;
 if image<>'' and (image!~'^https://[^[:space:]]+$' or length(image)>2048) then raise exception 'Cover image must use HTTPS'; end if;
 if not exists(select 1 from storage.objects where bucket_id='textbooks' and name=path) then raise exception 'Upload this PDF to the textbooks bucket first'; end if;
 bid:=nullif(p_book->>'id','')::uuid;
 if bid is not null then
  select * into old_book from textbooks where id=bid for update;
  if old_book.id is null then raise exception 'Textbook not found'; end if;
  if old_book.updated_at is distinct from (p_book->>'updated_at')::timestamptz then raise exception 'This book changed. Refresh and try again.'; end if;
  update textbooks set title=trim(p_book->>'title'),subject_id=p_book->>'subject_id',file_path=path,image_url=image,published=coalesce((p_book->>'published')::boolean,false),updated_at=clock_timestamp() where id=bid returning * into b;
 else
  insert into textbooks(title,subject_id,file_path,image_url,published) values(trim(p_book->>'title'),p_book->>'subject_id',path,image,coalesce((p_book->>'published')::boolean,false)) returning * into b;
 end if;
 insert into workspace_audit(actor,action,target,details) values(auth.uid(),'textbook_saved',b.id::text,jsonb_build_object('title',b.title,'published',b.published));
 return to_jsonb(b);
end $$;
revoke all on function public.admin_console_snapshot(integer),public.admin_textbook_save(jsonb) from public,anon;
grant execute on function public.admin_console_snapshot(integer),public.admin_textbook_save(jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('textbooks','textbooks',false,52428800,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=52428800,allowed_mime_types=array['application/pdf'];
drop policy if exists "Signed-in students can read textbooks" on storage.objects;
create policy "Signed-in students can read textbooks" on storage.objects for select to authenticated
using(bucket_id='textbooks' and (public.workspace_admin() or ((public.workspace_identity()->>'role')='student' and exists(select 1 from public.textbooks t where t.file_path=name and t.published))));
drop policy if exists textbook_admin_upload on storage.objects;
create policy textbook_admin_upload on storage.objects for insert to authenticated
with check(bucket_id='textbooks' and public.workspace_admin());
commit;

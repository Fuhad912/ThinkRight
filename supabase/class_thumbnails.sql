-- Apply after the teacher workspace migrations. Thumbnails publish with class approval.
begin;
alter table public.cohorts add column if not exists thumbnail_path text;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('class-thumbnails','class-thumbnails',true,3145728,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists class_thumbnail_upload on storage.objects;
create policy class_thumbnail_upload on storage.objects for insert to authenticated
with check(bucket_id='class-thumbnails' and (storage.foldername(name))[1]=auth.uid()::text
 and exists(select 1 from public.tutors where id=auth.uid() and status='active'));
-- Immutable uploads prevent a teacher replacing a published image without review.
create or replace function public.class_thumbnail_revision() returns trigger
language plpgsql security definer set search_path=public as $$
declare path text:=nullif(new.body->>'thumbnail_path',''); owner_id uuid;
begin
 select tutor_id into owner_id from cohorts where id=new.cohort_id;
 if path is not null and (path !~ ('^'||owner_id::text||'/[0-9a-f-]+[.](jpg|png|webp)$')
 or not exists(select 1 from storage.objects where bucket_id='class-thumbnails' and name=path)) then
 raise exception 'Upload a valid class thumbnail owned by this teacher'; end if;
 if new.state='published' then update cohorts set thumbnail_path=path where id=new.cohort_id; end if;
 return new;
end $$;
revoke all on function public.class_thumbnail_revision() from public,anon,authenticated;
drop trigger if exists class_thumbnail_revision on public.class_revisions;
create trigger class_thumbnail_revision after insert or update of body,state on public.class_revisions
for each row execute function public.class_thumbnail_revision();
commit;

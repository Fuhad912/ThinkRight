-- Apply LAST, after teacher_application_upgrade, class_specific_enrollment and class_thumbnails.
begin;
alter table public.lessons add column if not exists video_asset_id uuid;
alter table public.cohorts add column if not exists video_migration_required boolean not null default false;
create table if not exists public.video_assets (
 id uuid primary key default gen_random_uuid(),
 teacher_id uuid not null references public.tutors(id),
 cohort_id uuid not null references public.cohorts(id),
 lesson_id uuid not null,
 object_key text not null unique,
 filename text not null,
 fingerprint text not null,
 size_bytes bigint not null check(size_bytes between 1 and 524288000),
 duration_seconds numeric,
 state text not null default 'uploading' check(state in ('uploading','verifying','ready','failed','deleting')),
 upload_id text,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '24 hours',
 error text
);
alter table public.video_assets enable row level security;
revoke all on public.video_assets from public,anon,authenticated;
grant all on public.video_assets to service_role;
alter table public.lessons add constraint lessons_video_asset_fk foreign key(video_asset_id) references public.video_assets(id);
create index video_assets_uploads on public.video_assets(teacher_id,cohort_id,lesson_id,state);

create or replace function public.video_upload_limit() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.teacher_id::text||':video-upload',0));
 if (select count(*) from video_assets where teacher_id=new.teacher_id and state in ('uploading','verifying') and expires_at>now())>=10 then
   raise exception 'Finish or cancel an existing upload first';
 end if;
 return new;
end $$;
create trigger video_upload_limit before insert on public.video_assets for each row execute function public.video_upload_limit();
revoke all on function public.video_upload_limit() from public,anon,authenticated;

create or replace function public.video_upload_allowed(p_cohort uuid,p_lesson uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from cohorts c join tutors t on t.id=c.tutor_id join class_revisions r on r.cohort_id=c.id
 where c.id=p_cohort and c.tutor_id=auth.uid() and t.status='active' and r.state<>'in_review'
 and exists(select 1 from jsonb_array_elements(coalesce(r.body->'lessons','[]')) l where l->>'id'=p_lesson::text));
$$;
create or replace function public.video_playback_allowed(p_asset uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from video_assets v join cohorts c on c.id=v.cohort_id
 where v.id=p_asset and v.state='ready' and (
 workspace_admin() or (c.tutor_id=auth.uid() and exists(select 1 from tutors where id=auth.uid() and status='active'))
 or (workspace_enrolled(c.id) and exists(select 1 from lessons l where l.cohort_id=c.id and l.video_asset_id=v.id and not l.archived))));
$$;
revoke all on function public.video_upload_allowed(uuid,uuid),public.video_playback_allowed(uuid) from public,anon;
grant execute on function public.video_upload_allowed(uuid,uuid),public.video_playback_allowed(uuid) to authenticated;

-- Normalize draft assets to an internal marker that the existing HTTPS validator accepts.
-- It is an identifier, never a public R2 URL. All actual playback requires authorization.
create or replace function public.video_revision_guard() returns trigger
language plpgsql security definer set search_path=public as $$
declare item jsonb; items jsonb:='[]'; asset video_assets; owner_id uuid;
begin
 select tutor_id into owner_id from cohorts where id=new.cohort_id;
 for item in select value from jsonb_array_elements(coalesce(new.body->'lessons','[]')) loop
   if nullif(item->>'video_asset_id','') is not null then
     select * into asset from video_assets where id=(item->>'video_asset_id')::uuid for share;
     if asset.id is null or asset.state<>'ready' or asset.cohort_id<>new.cohort_id or asset.teacher_id<>owner_id or asset.lesson_id<>(item->>'id')::uuid then
       raise exception 'Upload a ready video belonging to this lesson';
     end if;
     item:=item||jsonb_build_object('video_url','https://video.thinkright.invalid/assets/'||asset.id::text);
   elsif new.state in ('in_review','published') then
     raise exception 'Replace every lesson video with a ThinkRight upload before review';
   end if;
   items:=items||jsonb_build_array(item);
 end loop;
 new.body:=jsonb_set(new.body,'{lessons}',items);
 return new;
end $$;
create trigger video_revision_guard before insert or update of body,state on public.class_revisions for each row execute function public.video_revision_guard();

create or replace function public.video_lesson_guard() returns trigger
language plpgsql security definer set search_path=public as $$
declare asset video_assets; asset_text text;
begin
 -- Preserve already published legacy videos while migration is in progress.
 if tg_op='UPDATE' and new.video_url=old.video_url and new.video_asset_id is not distinct from old.video_asset_id and new.cohort_id=old.cohort_id and new.id=old.id then return new; end if;
 asset_text:=substring(new.video_url from '^https://video[.]thinkright[.]invalid/assets/([0-9a-f-]+)$');
 if asset_text is null then raise exception 'New lessons require an uploaded ThinkRight video'; end if;
 select * into asset from video_assets where id=asset_text::uuid for share;
 if asset.id is null or asset.state<>'ready' or asset.cohort_id<>new.cohort_id or asset.lesson_id<>new.id
 or not exists(select 1 from cohorts where id=new.cohort_id and tutor_id=asset.teacher_id) then raise exception 'Invalid lesson video'; end if;
 new.video_asset_id:=asset.id;
 return new;
end $$;
create trigger video_lesson_guard before insert or update on public.lessons for each row execute function public.video_lesson_guard();

update cohorts c set video_migration_required=exists(select 1 from lessons l where l.cohort_id=c.id and not l.archived and l.video_asset_id is null);
create or replace function public.video_publish_finished() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.state='published' then
   update cohorts c set video_migration_required=exists(select 1 from lessons l where l.cohort_id=c.id and not l.archived and l.video_asset_id is null) where c.id=new.cohort_id;
 end if;
 return new;
end $$;
create trigger video_publish_finished after update of state on public.class_revisions for each row execute function public.video_publish_finished();

-- Wrap only order creation. Existing paid access and in-flight settlement remain intact.
alter function public.class_order_create(uuid) rename to class_order_create_before_video;
revoke all on function public.class_order_create_before_video(uuid) from public,anon,authenticated;
create function public.class_order_create(p_cohort uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Student sign-in required'; end if;
 if exists(select 1 from cohorts where id=p_cohort and video_migration_required) and not workspace_enrolled(p_cohort) then
   raise exception 'This class is updating its videos. Enrollment will reopen after review.';
 end if;
 return class_order_create_before_video(p_cohort);
end $$;
revoke all on function public.class_order_create(uuid) from public,anon;
grant execute on function public.class_order_create(uuid) to authenticated;

-- Atomically claim cleanup candidates; row locks serialize cleanup against revision attachment.
create or replace function public.video_cleanup_claim() returns setof public.video_assets
language plpgsql security definer set search_path=public as $$
declare asset video_assets;
begin
 for asset in select * from video_assets where expires_at<now() and state in ('uploading','verifying','failed','ready','deleting') order by expires_at limit 100 for update skip locked loop
   if exists(select 1 from lessons where video_asset_id=asset.id)
     or exists(select 1 from class_revisions r,jsonb_array_elements(coalesce(r.body->'lessons','[]')) l where l->>'video_asset_id'=asset.id::text or l->>'video_url'='https://video.thinkright.invalid/assets/'||asset.id::text) then continue; end if;
   update video_assets set state='deleting' where id=asset.id;
   asset.state:='deleting'; return next asset;
 end loop;
end $$;
revoke all on function public.video_cleanup_claim() from public,anon,authenticated;
grant execute on function public.video_cleanup_claim() to service_role;
revoke all on function public.video_revision_guard(), public.video_lesson_guard(),public.video_publish_finished() from public,anon,authenticated;
commit;

-- Narrow account edits: do not overwrite application fields or approval status.
create or replace function public.teacher_settings_update(p_name text default null, p_subjects text[] default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not exists(select 1 from public.tutors where id=uid and status<>'suspended') then
    raise exception 'Teacher access required';
  end if;
  if p_name is not null then
    if length(trim(p_name)) not between 2 and 120 then raise exception 'Enter a name between 2 and 120 characters'; end if;
    update public.tutors set display_name=trim(p_name),updated_at=now() where id=uid;
    update auth.users set raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)||jsonb_build_object('full_name',trim(p_name),'name',trim(p_name),'username',trim(p_name)) where id=uid;
  end if;
  if p_subjects is not null then
    if cardinality(p_subjects)=0 or cardinality(p_subjects)>100 or exists(select 1 from unnest(p_subjects) x where x is null or not exists(select 1 from public.subjects where id=x)) then
      raise exception 'Choose at least one valid teaching subject';
    end if;
    update public.tutors set subjects=array(select distinct unnest(p_subjects)),updated_at=now() where id=uid;
  end if;
end;
$$;
revoke all on function public.teacher_settings_update(text,text[]) from public,anon;
grant execute on function public.teacher_settings_update(text,text[]) to authenticated;

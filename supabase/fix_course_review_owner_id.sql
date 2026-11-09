-- Apply in SQL Editor after course_studio.sql. Safe to run more than once.
-- Change only the conflicting variable; keep installed validation rules intact.
begin;
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('public.course_revision_validate()'::regprocedure);
 definition:=regexp_replace(definition,'\mowner_id\M','v_course_owner_id','g');
 execute definition;
end $$;
commit;

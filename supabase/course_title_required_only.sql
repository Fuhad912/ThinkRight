-- Apply after course_studio.sql. Titles are required, without a minimum length.
begin;
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('public.course_revision_validate()'::regprocedure);
 definition:=replace(definition,$old$length(trim(coalesce(b->>'title','')))<3$old$,$new$length(trim(coalesce(b->>'title','')))=0$new$);
 execute definition;
end $$;
commit;

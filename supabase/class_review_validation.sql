-- Replace only the combined validation message; preserve the installed workspace function and video guards.
do $migration$
declare definition text; previous text; replacement text;
begin
 definition:=pg_get_functiondef('public.workspace_action(text,jsonb)'::regprocedure);
 previous:=$old$if length(trim(coalesce(body->>'title','')))<3 or length(trim(coalesce(body->>'description','')))<20 or nullif(body->>'start_date','') is null or jsonb_array_length(coalesce(body->'lessons','[]'))=0 then raise exception 'Add a title, description, start date and at least one lesson'; end if;$old$;
 replacement:=$new$if length(trim(coalesce(body->>'title','')))<3 then raise exception 'Enter a class title of at least 3 characters.'; end if;
       if length(trim(coalesce(body->>'description','')))<20 then raise exception 'Please expand your class description to at least 20 characters.'; end if;
       if nullif(body->>'start_date','') is null then raise exception 'The class start date is missing. Save the class details and try again.'; end if;
       if jsonb_array_length(coalesce(body->'lessons','[]'))=0 then raise exception 'Add at least one lesson before submitting for review.'; end if;$new$;
 if position(previous in definition)=0 then raise exception 'Expected workspace validation not found; no changes made'; end if;
 execute replace(definition,previous,replacement);
end $migration$;

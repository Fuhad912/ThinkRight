-- Apply after class_review_validation.sql. Pricing belongs to admin publication, not teacher submission.
do $migration$
declare definition text; previous text; replacement text;
begin
 definition:=pg_get_functiondef('public.workspace_action(text,jsonb)'::regprocedure);
 previous:=$old$if not exists(select 1 from subjects where id=body->>'subject_id' and enrollment_price is not null) then raise exception 'ThinkRight must set the subject price first'; end if;$old$;
 replacement:=$new$if not exists(select 1 from subjects where id=body->>'subject_id') then raise exception 'Choose a valid subject before submitting for review.'; end if;$new$;
 if position(previous in definition)=0 then raise exception 'Expected submission pricing guard not found; no changes made'; end if;
 definition:=replace(definition,previous,replacement);
 previous:=$old$if t.status<>'active' or not exists(select 1 from subjects where id=body->>'subject_id' and enrollment_price is not null) then raise exception 'Teacher approval and subject pricing are required'; end if;$old$;
 replacement:=$new$if t.status<>'active' then raise exception 'Approve the teacher before publishing this class.'; end if;
         if not exists(select 1 from subjects where id=body->>'subject_id' and enrollment_price is not null) then raise exception 'Set the subject price in Pricing before approving this class.'; end if;$new$;
 if position(previous in definition)=0 then raise exception 'Expected publication pricing guard not found; no changes made'; end if;
 execute replace(definition,previous,replacement);
end $migration$;

-- Apply last, after all installed teacher, enrollment and settings migrations.
-- Recorded earnings and payouts retain their original amounts and share rates.
begin;
alter table public.tutors alter column revenue_share_pct set default 90;
update public.tutors set revenue_share_pct=90 where revenue_share_pct is distinct from 90;
alter table public.teacher_earnings drop constraint if exists teacher_earnings_share_pct_check;
alter table public.teacher_earnings alter column share_pct set default 90;
alter table public.teacher_earnings add constraint teacher_earnings_share_pct_check check (share_pct in (70,90));
drop policy if exists tutors_insert_pending on public.tutors;
create policy tutors_insert_pending on public.tutors for insert to authenticated
  with check (auth.uid()=id and status='pending' and revenue_share_pct=90);

-- Preserve the installed functions' access checks and any later migration wrappers.
do $$
declare definition record; updated text;
begin
  for definition in
    select p.oid, pg_get_functiondef(p.oid) as body
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f'
      and (p.prosrc like '%paid_amount*70%'
        or p.prosrc like '%amount_kobo*0.7%'
        or p.prosrc like $pattern$%'pending',70%$pattern$)
  loop
    updated := replace(definition.body,'paid_amount*70','paid_amount*90');
    updated := replace(updated,'amount_kobo*0.7','amount_kobo*0.9');
    updated := replace(updated,$old$'pending',70$old$,$new$'pending',90$new$);
    execute updated;
  end loop;
end $$;
commit;

-- Run AFTER app_notifications.sql and deploying dispatch-notifications.
-- First create Vault secrets named notifications_project_url (https://PROJECT.supabase.co)
-- and notifications_cron_secret (same secret as the Edge Function).
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$ declare job record;begin
 for job in select jobid from cron.job where jobname in ('thinkright-daily-reminders','thinkright-push-dispatch') loop
  perform cron.unschedule(job.jobid);
 end loop;
end $$;
-- 10:00 Africa/Lagos, once per day. Event notifications are queued immediately.
select cron.schedule('thinkright-daily-reminders','0 9 * * *', 'select public.app_notification_reminders()');
select cron.schedule('thinkright-push-dispatch','* * * * *',$job$
 select net.http_post(
  url:=(select decrypted_secret from vault.decrypted_secrets where name='notifications_project_url')||'/functions/v1/dispatch-notifications',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='notifications_cron_secret')),
  body:='{}'::jsonb,timeout_milliseconds:=55000
 );
$job$);

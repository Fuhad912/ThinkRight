-- Enable pg_cron and pg_net in Supabase first. Set the two named Vault secrets
-- described in LESSON_VIDEOS_SETUP.md. No credentials belong in this file.
do $$ begin
 if not exists(select 1 from vault.decrypted_secrets where name='lesson_video_supabase_url')
 or not exists(select 1 from vault.decrypted_secrets where name='lesson_video_cleanup_secret') then
 raise exception 'Configure lesson video Vault secrets before scheduling cleanup'; end if;
end $$;
select cron.unschedule(jobid) from cron.job where jobname='lesson-video-cleanup';
select cron.schedule('lesson-video-cleanup','17 * * * *', $job$
 select net.http_post(
   url := (select rtrim(decrypted_secret,'/') from vault.decrypted_secrets where name='lesson_video_supabase_url' limit 1)||'/functions/v1/lesson-video',
   headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='lesson_video_cleanup_secret' limit 1)),
   body := '{"action":"cleanup"}'::jsonb,
   timeout_milliseconds := 120000
 );
$job$);

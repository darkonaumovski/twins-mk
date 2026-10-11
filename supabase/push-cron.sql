-- Twins Organizer: run the push reminder function every 5 minutes.
-- Run once, after migration 004 and after deploying the send-reminders function (see the README).
-- Replace PASTE_CRON_SECRET_HERE with the CRON_SECRET from supabase/functions/.env.local
-- (the same value the function has as its secret). Running it again replaces the schedule.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- The secret is kept in Supabase Vault, not in the job text.
do $$
begin
  if exists (select 1 from vault.secrets where name = 'reminders_cron_secret') then
    perform vault.update_secret(
      (select id from vault.secrets where name = 'reminders_cron_secret'), 'PASTE_CRON_SECRET_HERE');
  else
    perform vault.create_secret('PASTE_CRON_SECRET_HERE', 'reminders_cron_secret');
  end if;
end;
$$;

select cron.unschedule(jobid) from cron.job where jobname = 'send-reminders';

select cron.schedule(
  'send-reminders',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := 'https://ikswfxyhpyuqwcpslovx.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $job$
);

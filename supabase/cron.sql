-- Run once per environment in the SQL editor after deploying the `jobs` function.
-- Requires the pg_cron and pg_net extensions (Dashboard → Database → Extensions).
-- Store secrets in Vault first:
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<random CRON_SECRET>', 'cron_secret');
select cron.schedule(
  'justgifter-jobs',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/jobs',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

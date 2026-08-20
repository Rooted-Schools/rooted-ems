-- Weekly C.R. Neal lead sync: Mondays 08:00 UTC. Reads the token from
-- sync_config (never hardcoded) and POSTs to the sync-leads Edge Function.
select cron.schedule(
  'weekly-lead-sync',
  '0 8 * * 1',
  $$
  select net.http_post(
    url := 'https://szockdlohlmkyloubgtd.supabase.co/functions/v1/sync-leads',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select sync_token from sync_config where id = 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

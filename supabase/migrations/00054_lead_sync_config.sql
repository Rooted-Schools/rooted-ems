-- Lead sync foundation: schedulers + the token that authorizes a sync trigger.
-- Applied to production via the Supabase MCP; recorded here for repo fidelity.
create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists sync_config (
  id int primary key default 1,
  sync_token text not null,
  constraint sync_config_singleton check (id = 1)
);
alter table sync_config enable row level security;
-- No policies: unreachable by anon/authenticated. Only the service role
-- (Edge Function, app sync action) and the pg_cron superuser job read it.

insert into sync_config (id, sync_token)
values (1, replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''))
on conflict (id) do nothing;

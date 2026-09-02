-- Notifications carry the campus they pertain to, so a multi-campus staff
-- member viewing one campus sees only that campus's notifications. Nullable:
-- a notification with no campus (or created before this column) shows only in
-- the "All campuses" view. Applied to production via the Supabase MCP.
alter table notification add column if not exists campus_id uuid references campus(id);
create index if not exists idx_notification_user_campus on notification(user_id, campus_id, is_read);

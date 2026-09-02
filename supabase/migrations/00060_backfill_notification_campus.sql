-- Backfill campus on existing notifications from the entity their link points
-- to. Generic links (/staff/communications/inbound, /staff/messages) carry no
-- id and stay null, appearing only in the All-campuses view.
update notification n
set campus_id = a.campus_id
from application a
where n.campus_id is null
  and n.link ~ '^/staff/applications/[0-9a-fA-F-]{36}$'
  and a.id = substring(n.link from '([0-9a-fA-F-]{36})$')::uuid;

update notification n
set campus_id = l.campus_id
from lead l
where n.campus_id is null
  and n.link ~ '^/staff/recruitment/[0-9a-fA-F-]{36}$'
  and l.id = substring(n.link from '([0-9a-fA-F-]{36})$')::uuid;

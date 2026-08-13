-- 00049_email_event_campus_scope.sql
--
-- email_event stores the subject line of every message sent to a family, and
-- subjects carry student first names. Its read policy only asked "are you
-- staff anywhere", so a staff member at one campus could read another
-- campus's family engagement history. Scope it the way every other
-- family-data table is scoped.
--
-- Rows with no lead_id (transactional sends not tied to a recruitment lead)
-- keep the staff-wide rule: there is no campus on the row to scope by, and
-- the alternative is hiding delivery history from the staff who need it.
-- Narrowing those further requires a campus column on email_event, which is
-- a schema change, not a policy change.
--
-- APPLY MANUALLY.

DROP POLICY IF EXISTS email_event_staff_read ON email_event;

CREATE POLICY email_event_staff_read ON email_event FOR SELECT TO authenticated
  USING (
    CASE
      WHEN lead_id IS NOT NULL THEN EXISTS (
        SELECT 1 FROM lead l
        WHERE l.id = email_event.lead_id
          AND user_has_campus_access(l.campus_id)
      )
      ELSE user_is_staff_member()
    END
  );

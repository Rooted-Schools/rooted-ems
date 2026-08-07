-- Migration 00039: Security hardening from the 2026-08 red team.
-- All changes are policy/function-level; no data is touched. Apply after a
-- PITR/backup check, like every migration.
--
-- Findings addressed (red-team IDs):
--   C1  is_staff self-promotion via profile_own_update (no WITH CHECK)
--   C1b storage "Staff can read all documents" keyed to the forgeable is_staff bit
--   H7  audit_event / communication_log / contact_log insertable by ANY
--       authenticated user with arbitrary contents (record forgery)
--   H8  "campus_id IS NULL OR ..." policies grant open write access to
--       null-campus rows for every authenticated user
--   M14 suppression list readable by any authenticated user
--   LOW SECURITY DEFINER functions missing SET search_path

-- ============================================
-- 1. C1 — user_profile: same-row check on both sides, and is_staff can only
--    be changed by the service role (auth.uid() IS NULL) or a system admin.
-- ============================================

DROP POLICY IF EXISTS profile_own_update ON user_profile;
CREATE POLICY profile_own_update ON user_profile FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION fn_protect_is_staff()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_staff IS DISTINCT FROM OLD.is_staff THEN
    -- Service-role connections have no JWT (auth.uid() is null) and are the
    -- only sanctioned writer of this flag besides a system admin.
    IF auth.uid() IS NOT NULL AND NOT user_is_system_admin() THEN
      RAISE EXCEPTION 'is_staff can only be changed by an administrator';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_is_staff ON user_profile;
CREATE TRIGGER trg_protect_is_staff
BEFORE UPDATE ON user_profile
FOR EACH ROW
EXECUTE FUNCTION fn_protect_is_staff();

-- ============================================
-- 2. C1b — storage: staff document reads require an actual campus role row,
--    not the is_staff bit. (Deeper per-campus path scoping is future work;
--    this closes the "one forged bit reads every document" path.)
-- ============================================

DROP POLICY IF EXISTS "Staff can read all documents" ON storage.objects;
CREATE POLICY "Staff can read all documents"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1 FROM public.user_campus_role
      WHERE user_id = auth.uid()
    )
  );

-- ============================================
-- 3. H7 — record-forgery: nobody inserts audit rows through the API (the
--    SECURITY DEFINER trigger and the service role are the only legitimate
--    writers, and neither needs an RLS policy). Communication/contact logs
--    are written by the service role in app code; RLS-client inserts are
--    restricted to actual staff.
-- ============================================

CREATE OR REPLACE FUNCTION user_is_staff_member()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_campus_role WHERE user_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS audit_insert ON audit_event;

DROP POLICY IF EXISTS cl_insert ON communication_log;
CREATE POLICY cl_insert ON communication_log FOR INSERT TO authenticated
  WITH CHECK (user_is_staff_member());

DROP POLICY IF EXISTS clog_staff_insert ON contact_log;
CREATE POLICY clog_staff_insert ON contact_log FOR INSERT TO authenticated
  WITH CHECK (user_is_staff_member());

-- ============================================
-- 4. H8 — null-campus rows are network-level records: staff-only, not
--    everyone. Same shape for each affected policy.
-- ============================================

DROP POLICY IF EXISTS mt_staff ON message_template;
CREATE POLICY mt_staff ON message_template FOR ALL TO authenticated
  USING ((campus_id IS NULL AND user_is_staff_member()) OR user_has_campus_access(campus_id));

DROP POLICY IF EXISTS note_staff ON note;
CREATE POLICY note_staff ON note FOR ALL TO authenticated
  USING ((campus_id IS NULL AND user_is_staff_member()) OR user_has_campus_access(campus_id));

DROP POLICY IF EXISTS tag_staff ON tag;
CREATE POLICY tag_staff ON tag FOR ALL TO authenticated
  USING ((campus_id IS NULL AND user_is_staff_member()) OR user_has_campus_access(campus_id));

DROP POLICY IF EXISTS setting_staff ON setting;
CREATE POLICY setting_staff ON setting FOR ALL TO authenticated
  USING ((campus_id IS NULL AND user_is_staff_member()) OR user_has_campus_access(campus_id));

DROP POLICY IF EXISTS journey_staff ON journey;
CREATE POLICY journey_staff ON journey FOR ALL TO authenticated
  USING ((campus_id IS NULL AND user_is_staff_member()) OR user_has_campus_access(campus_id));

-- ============================================
-- 5. M14 — suppression list contains bounced/complaining family emails;
--    staff-only read.
-- ============================================

DROP POLICY IF EXISTS suppression_staff_read ON email_suppression;
CREATE POLICY suppression_staff_read ON email_suppression FOR SELECT TO authenticated
  USING (user_is_staff_member());

-- ============================================
-- 6. Pin search_path on every SECURITY DEFINER function from 00010.
-- ============================================

ALTER FUNCTION user_has_campus_access(UUID) SET search_path = public;
ALTER FUNCTION user_has_campus_role(UUID, staff_role) SET search_path = public;
ALTER FUNCTION user_is_system_admin() SET search_path = public;
ALTER FUNCTION user_owns_household(UUID) SET search_path = public;
ALTER FUNCTION fn_track_status_change() SET search_path = public;
ALTER FUNCTION fn_update_offer_capacity() SET search_path = public;
ALTER FUNCTION fn_update_acceptance_capacity() SET search_path = public;
ALTER FUNCTION fn_update_enrollment_capacity() SET search_path = public;
ALTER FUNCTION fn_audit_trigger() SET search_path = public;

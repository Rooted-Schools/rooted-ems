-- 00048_redteam_hardening_2.sql
-- APPLY MANUALLY (same ritual as 00035+: backup check, then execute in full).
--
-- Second hardening pass, from the 2026-08-12 full red team. Four families of
-- fixes, each closing a verified finding:
--
--   A. Storage: staff document reads scoped to the document's campus
--      (was: any staff role anywhere could read every family's documents).
--   B. Family-side RLS write gaps: application / application_answer /
--      guardian_student / registration_item could be written directly via
--      PostgREST in ways the app layer never allows (self-verified paperwork,
--      forged status, self-granted sibling priority).
--   C. Capacity counters: offer/acceptance triggers were year-blind and
--      corrupted every other school year's plan; seats_accepted never
--      decremented on withdrawal. Counters are reconciled at the end.
--   D. email_event reads scoped to the lead's campus where one exists.

-- ────────────────────────────────────────────────────────────────────────────
-- A. Storage: campus-scoped staff reads on the documents bucket
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Staff can read all documents" ON storage.objects;

-- A staff member may read an object only when it backs a document row whose
-- application sits at a campus they hold a role on. Objects with no document
-- row (mid-upload, orphans) are readable by no staff member; families keep
-- their own-folder policy untouched.
CREATE POLICY "Staff can read documents on their campuses"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1
      FROM public.document d
      JOIN public.application a ON a.id = d.application_id
      WHERE d.storage_path = storage.objects.name
        AND public.user_has_campus_access(a.campus_id)
    )
  );

-- Codify the bucket's privacy so it cannot drift by dashboard accident.
UPDATE storage.buckets SET public = false WHERE id = 'documents';

-- ────────────────────────────────────────────────────────────────────────────
-- B1. application: split app_family FOR ALL into explicit per-command
--     policies with WITH CHECK, and protect staff-owned columns
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS app_family ON application;

CREATE POLICY app_family_select ON application FOR SELECT TO authenticated
  USING (guardian_id IN (
    SELECT id FROM guardian WHERE user_owns_household(household_id)));

CREATE POLICY app_family_insert ON application FOR INSERT TO authenticated
  WITH CHECK (guardian_id IN (
    SELECT id FROM guardian WHERE user_owns_household(household_id)));

CREATE POLICY app_family_update ON application FOR UPDATE TO authenticated
  USING (guardian_id IN (
    SELECT id FROM guardian WHERE user_owns_household(household_id)))
  WITH CHECK (guardian_id IN (
    SELECT id FROM guardian WHERE user_owns_household(household_id)));

-- No family DELETE policy existed before (FOR ALL granted it implicitly);
-- withdrawal is a status, not a row deletion, so families get no DELETE.

-- Staff-owned columns on application: revert any change made by a writer that
-- is neither the service role nor staff with access to the row's campus.
-- Same shape as fn_protect_registration_packet_columns (00044).
CREATE OR REPLACE FUNCTION fn_protect_application_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.locked_at IS NOT DISTINCT FROM OLD.locked_at
     AND NEW.submitted_at IS NOT DISTINCT FROM OLD.submitted_at
     AND NEW.has_sibling_enrolled IS NOT DISTINCT FROM OLD.has_sibling_enrolled
     AND NEW.reviewed_by IS NOT DISTINCT FROM OLD.reviewed_by
     AND NEW.reviewed_at IS NOT DISTINCT FROM OLD.reviewed_at
     AND NEW.review_notes IS NOT DISTINCT FROM OLD.review_notes
     AND NEW.assigned_staff_id IS NOT DISTINCT FROM OLD.assigned_staff_id THEN
    RETURN NEW;
  END IF;

  -- Service role (server actions, crons) carries no JWT.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF user_has_campus_access(NEW.campus_id) THEN
    RETURN NEW;
  END IF;

  NEW.status := OLD.status;
  NEW.locked_at := OLD.locked_at;
  NEW.submitted_at := OLD.submitted_at;
  NEW.has_sibling_enrolled := OLD.has_sibling_enrolled;
  NEW.reviewed_by := OLD.reviewed_by;
  NEW.reviewed_at := OLD.reviewed_at;
  NEW.review_notes := OLD.review_notes;
  NEW.assigned_staff_id := OLD.assigned_staff_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_application_columns ON application;
CREATE TRIGGER trg_protect_application_columns
BEFORE UPDATE ON application
FOR EACH ROW
EXECUTE FUNCTION fn_protect_application_columns();

-- ────────────────────────────────────────────────────────────────────────────
-- B2. application_answer: explicit policies; INSERT blocked once the
--     application is locked (the lock trigger only covered UPDATE)
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS answer_family ON application_answer;

CREATE POLICY answer_family_select ON application_answer FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM application a JOIN guardian g ON g.id = a.guardian_id
    WHERE a.id = application_answer.application_id
      AND user_owns_household(g.household_id)));

CREATE POLICY answer_family_insert ON application_answer FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM application a JOIN guardian g ON g.id = a.guardian_id
    WHERE a.id = application_answer.application_id
      AND user_owns_household(g.household_id)
      AND a.locked_at IS NULL));

CREATE POLICY answer_family_update ON application_answer FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM application a JOIN guardian g ON g.id = a.guardian_id
    WHERE a.id = application_answer.application_id
      AND user_owns_household(g.household_id)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM application a JOIN guardian g ON g.id = a.guardian_id
    WHERE a.id = application_answer.application_id
      AND user_owns_household(g.household_id)));

-- ────────────────────────────────────────────────────────────────────────────
-- B3. guardian_student: writes must own BOTH sides of the link
--     (was: guardian side only, letting a family bind another family's
--     enrolled student to their own guardian and inherit sibling priority)
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS gs_own ON guardian_student;

CREATE POLICY gs_own_select ON guardian_student FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM guardian g
    WHERE g.id = guardian_student.guardian_id
      AND user_owns_household(g.household_id)));

CREATE POLICY gs_own_write ON guardian_student FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM guardian g
      WHERE g.id = guardian_student.guardian_id
        AND user_owns_household(g.household_id))
    AND EXISTS (
      SELECT 1 FROM student s
      WHERE s.id = guardian_student.student_id
        AND user_owns_household(s.household_id)));

CREATE POLICY gs_own_update ON guardian_student FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM guardian g
    WHERE g.id = guardian_student.guardian_id
      AND user_owns_household(g.household_id)))
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM guardian g
      WHERE g.id = guardian_student.guardian_id
        AND user_owns_household(g.household_id))
    AND EXISTS (
      SELECT 1 FROM student s
      WHERE s.id = guardian_student.student_id
        AND user_owns_household(s.household_id)));

CREATE POLICY gs_own_delete ON guardian_student FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM guardian g
      WHERE g.id = guardian_student.guardian_id
        AND user_owns_household(g.household_id))
    AND EXISTS (
      SELECT 1 FROM student s
      WHERE s.id = guardian_student.student_id
        AND user_owns_household(s.household_id)));

-- ────────────────────────────────────────────────────────────────────────────
-- B4. registration_item: protect verification columns
--     (same defect 00044 fixed on registration_packet, on the table it missed)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_protect_registration_item_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item_campus_id UUID;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.verified_at IS NOT DISTINCT FROM OLD.verified_at
     AND NEW.verified_by IS NOT DISTINCT FROM OLD.verified_by THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT e.campus_id INTO item_campus_id
  FROM enrollment e
  WHERE e.id = NEW.enrollment_id;

  IF item_campus_id IS NOT NULL AND user_has_campus_access(item_campus_id) THEN
    RETURN NEW;
  END IF;

  NEW.status := OLD.status;
  NEW.verified_at := OLD.verified_at;
  NEW.verified_by := OLD.verified_by;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_registration_item_columns ON registration_item;
CREATE TRIGGER trg_protect_registration_item_columns
BEFORE UPDATE ON registration_item
FOR EACH ROW
EXECUTE FUNCTION fn_protect_registration_item_columns();

-- ────────────────────────────────────────────────────────────────────────────
-- C. Capacity counters: year-scoped, and seats_accepted decrements
-- ────────────────────────────────────────────────────────────────────────────

-- Offers: resolve the school year through the application's enrollment
-- window; when it cannot be resolved, touch nothing rather than corrupt a
-- sibling year's plan.
CREATE OR REPLACE FUNCTION fn_update_offer_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_year_id UUID;
BEGIN
  SELECT ew.school_year_id INTO v_school_year_id
  FROM application a
  JOIN enrollment_window ew ON ew.id = a.enrollment_window_id
  WHERE a.id = NEW.application_id;

  IF v_school_year_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    UPDATE capacity_plan
    SET seats_offered = seats_offered + 1
    WHERE campus_id = NEW.campus_id AND grade_level_id = NEW.grade_level_id
      AND school_year_id = v_school_year_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'pending' AND NEW.status IN ('expired', 'revoked', 'declined') THEN
      UPDATE capacity_plan
      SET seats_offered = GREATEST(seats_offered - 1, 0)
      WHERE campus_id = NEW.campus_id AND grade_level_id = NEW.grade_level_id
        AND school_year_id = v_school_year_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_update_acceptance_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campus_id UUID;
  v_grade_level_id UUID;
  v_school_year_id UUID;
BEGIN
  SELECT o.campus_id, o.grade_level_id, ew.school_year_id
    INTO v_campus_id, v_grade_level_id, v_school_year_id
  FROM offer o
  JOIN application a ON a.id = o.application_id
  JOIN enrollment_window ew ON ew.id = a.enrollment_window_id
  WHERE o.id = NEW.offer_id;

  IF v_school_year_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE capacity_plan
  SET seats_accepted = seats_accepted + 1
  WHERE campus_id = v_campus_id AND grade_level_id = v_grade_level_id
    AND school_year_id = v_school_year_id;

  RETURN NEW;
END;
$$;

-- Enrollments: already year-scoped; extend so a withdrawal also releases the
-- accepted seat (seats_accepted previously only ever went up).
CREATE OR REPLACE FUNCTION fn_update_enrollment_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN
    UPDATE capacity_plan
    SET seats_registered = seats_registered + 1
    WHERE campus_id = NEW.campus_id AND grade_level_id = NEW.grade_level_id
    AND school_year_id = NEW.school_year_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'active' AND NEW.status IN ('withdrawn', 'transferred') THEN
      UPDATE capacity_plan
      SET seats_registered = GREATEST(seats_registered - 1, 0),
          seats_accepted = GREATEST(seats_accepted - 1, 0)
      WHERE campus_id = NEW.campus_id AND grade_level_id = NEW.grade_level_id
      AND school_year_id = NEW.school_year_id;
    ELSIF OLD.status != 'active' AND NEW.status = 'active' THEN
      UPDATE capacity_plan
      SET seats_registered = seats_registered + 1
      WHERE campus_id = NEW.campus_id AND grade_level_id = NEW.grade_level_id
      AND school_year_id = NEW.school_year_id;
    ELSIF OLD.status IN ('withdrawn', 'transferred') AND NEW.status = 'active' THEN
      UPDATE capacity_plan
      SET seats_accepted = seats_accepted + 1
      WHERE campus_id = NEW.campus_id AND grade_level_id = NEW.grade_level_id
      AND school_year_id = NEW.school_year_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Reconcile every counter from live rows now that the triggers are correct.
UPDATE capacity_plan cp
SET seats_offered = sub.n
FROM (
  SELECT a.campus_id, o.grade_level_id, ew.school_year_id, count(*) AS n
  FROM offer o
  JOIN application a ON a.id = o.application_id
  JOIN enrollment_window ew ON ew.id = a.enrollment_window_id
  WHERE o.status = 'pending'
  GROUP BY 1, 2, 3
) sub
WHERE cp.campus_id = sub.campus_id
  AND cp.grade_level_id = sub.grade_level_id
  AND cp.school_year_id = sub.school_year_id
  AND cp.seats_offered IS DISTINCT FROM sub.n;

UPDATE capacity_plan cp
SET seats_offered = 0
WHERE cp.seats_offered <> 0
  AND NOT EXISTS (
    SELECT 1 FROM offer o
    JOIN application a ON a.id = o.application_id
    JOIN enrollment_window ew ON ew.id = a.enrollment_window_id
    WHERE o.status = 'pending'
      AND a.campus_id = cp.campus_id
      AND o.grade_level_id = cp.grade_level_id
      AND ew.school_year_id = cp.school_year_id);

UPDATE capacity_plan cp
SET seats_accepted = sub.n
FROM (
  SELECT a.campus_id, o.grade_level_id, ew.school_year_id, count(*) AS n
  FROM acceptance acc
  JOIN offer o ON o.id = acc.offer_id
  JOIN application a ON a.id = o.application_id
  JOIN enrollment_window ew ON ew.id = a.enrollment_window_id
  GROUP BY 1, 2, 3
) sub
WHERE cp.campus_id = sub.campus_id
  AND cp.grade_level_id = sub.grade_level_id
  AND cp.school_year_id = sub.school_year_id
  AND cp.seats_accepted IS DISTINCT FROM sub.n;

UPDATE capacity_plan cp
SET seats_accepted = 0
WHERE cp.seats_accepted <> 0
  AND NOT EXISTS (
    SELECT 1 FROM acceptance acc
    JOIN offer o ON o.id = acc.offer_id
    JOIN application a ON a.id = o.application_id
    JOIN enrollment_window ew ON ew.id = a.enrollment_window_id
    WHERE a.campus_id = cp.campus_id
      AND o.grade_level_id = cp.grade_level_id
      AND ew.school_year_id = cp.school_year_id);

UPDATE capacity_plan cp
SET seats_registered = sub.n
FROM (
  SELECT e.campus_id, e.grade_level_id, e.school_year_id, count(*) AS n
  FROM enrollment e
  WHERE e.status = 'active'
  GROUP BY 1, 2, 3
) sub
WHERE cp.campus_id = sub.campus_id
  AND cp.grade_level_id = sub.grade_level_id
  AND cp.school_year_id = sub.school_year_id
  AND cp.seats_registered IS DISTINCT FROM sub.n;

UPDATE capacity_plan cp
SET seats_registered = 0
WHERE cp.seats_registered <> 0
  AND NOT EXISTS (
    SELECT 1 FROM enrollment e
    WHERE e.status = 'active'
      AND e.campus_id = cp.campus_id
      AND e.grade_level_id = cp.grade_level_id
      AND e.school_year_id = cp.school_year_id);

-- ────────────────────────────────────────────────────────────────────────────
-- D. email_event: scope staff reads to the lead's campus where one exists
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS email_event_staff_read ON email_event;
CREATE POLICY email_event_staff_read ON email_event FOR SELECT TO authenticated
  USING (
    CASE
      WHEN lead_id IS NOT NULL THEN EXISTS (
        SELECT 1 FROM lead l
        WHERE l.id = email_event.lead_id
          AND user_has_campus_access(l.campus_id))
      ELSE user_is_staff_member()
    END
  );

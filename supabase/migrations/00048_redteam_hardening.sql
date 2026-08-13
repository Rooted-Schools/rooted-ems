-- 00048_redteam_hardening.sql
--
-- Red team 2026-08-12. Closes the gaps where TypeScript was the only thing
-- standing between a family (or a staff member at another campus) and a
-- record they should not be able to write or read.
--
-- Every finding below was reproduced against the live schema before this was
-- written. The pattern for column protection is the one migration 00044
-- established for registration_packet: a BEFORE UPDATE trigger that reverts
-- protected columns for any writer that is neither the service role
-- (auth.uid() IS NULL, i.e. our own server actions) nor real staff on the
-- record's campus. RLS policies alone cannot express "you may update this
-- row, but not these columns".
--
-- APPLY MANUALLY. Verify each section's comment before running.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Documents storage: scope staff reads to the document's own campus
--
-- The policy this replaces (00039) checked only "does this user hold a role
-- on ANY campus", so a Vancouver enrollment_staff account could read a
-- Columbia family's IEP, immunization record, or proof of residency. Storage
-- paths are {uploader_user_id}/{filename} with no campus segment, so the
-- campus has to be resolved by joining the document row that owns the path.
-- The app-layer guard in staffGetSignedUrl was already correct; this makes
-- the database agree with it, so a staff JWT used directly against storage
-- cannot bypass it.
-- ───────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Staff can read all documents" ON storage.objects;

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

-- The bucket was created by hand in the dashboard and verified private on
-- 2026-08-12. Codify it so it cannot silently drift public, which would make
-- every policy above moot.
UPDATE storage.buckets SET public = false WHERE id = 'documents';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. application: families may edit their own draft, not adjudicate it
--
-- app_family is FOR ALL with no WITH CHECK and no column grants, so a family
-- could PATCH their own application directly through PostgREST and set
-- status = 'enrolled' (skipping lottery, offer, acceptance and registration
-- entirely) or has_sibling_enrolled = true (self-granting the sibling
-- priority tier the lottery treats as a claim to verify). The state machine
-- and the enrollment-window gate live only in TypeScript.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_protect_application_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Cheap early-out: a family editing a draft touches none of these.
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

  -- Service role (our server actions and cron) carries no JWT.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Real staff on this application's campus are trusted, matching the
  -- app_staff_update policy.
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

-- ───────────────────────────────────────────────────────────────────────────
-- 3. registration_item: families complete items, staff verify them
--
-- 00044 fixed exactly this defect on registration_packet and did not cover
-- registration_item. regitem_family_update is an UPDATE policy with no
-- WITH CHECK, so a family could mark their own items status = 'verified',
-- which cascades: the packet finalizes, the application advances, and the
-- school holds paperwork nobody reviewed.
-- ───────────────────────────────────────────────────────────────────────────

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

-- ───────────────────────────────────────────────────────────────────────────
-- 4. document: families upload, staff decide
--
-- doc_family is FOR ALL with no WITH CHECK, so a family could set their own
-- document status = 'verified' and clear the review queue for themselves.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_protect_document_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  doc_campus_id UUID;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.verified_at IS NOT DISTINCT FROM OLD.verified_at
     AND NEW.verified_by IS NOT DISTINCT FROM OLD.verified_by THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT a.campus_id INTO doc_campus_id
  FROM application a
  WHERE a.id = NEW.application_id;

  IF doc_campus_id IS NOT NULL AND user_has_campus_access(doc_campus_id) THEN
    RETURN NEW;
  END IF;

  NEW.status := OLD.status;
  NEW.verified_at := OLD.verified_at;
  NEW.verified_by := OLD.verified_by;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_document_columns ON document;
CREATE TRIGGER trg_protect_document_columns
BEFORE UPDATE ON document
FOR EACH ROW
EXECUTE FUNCTION fn_protect_document_columns();

-- ───────────────────────────────────────────────────────────────────────────
-- 5. guardian_student: both sides of the link must belong to the caller
--
-- gs_own constrained guardian_id only and left student_id unchecked, and with
-- no WITH CHECK the same one-sided rule governed INSERT. A family that
-- learned one enrolled student's id could bind that child to their own
-- guardian record with is_legal_guardian = true, which is precisely how the
-- lottery derives verified sibling priority: the strongest preference tier,
-- claimed by forging a relationship to someone else's child.
-- ───────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS gs_own ON guardian_student;

CREATE POLICY gs_own_select ON guardian_student FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM guardian g
      WHERE g.id = guardian_student.guardian_id
        AND user_owns_household(g.household_id)
    )
  );

CREATE POLICY gs_own_write ON guardian_student FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM guardian g
      WHERE g.id = guardian_student.guardian_id
        AND user_owns_household(g.household_id)
    )
    AND EXISTS (
      SELECT 1 FROM student s
      WHERE s.id = guardian_student.student_id
        AND user_owns_household(s.household_id)
    )
  );

CREATE POLICY gs_own_update ON guardian_student FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM guardian g
      WHERE g.id = guardian_student.guardian_id
        AND user_owns_household(g.household_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM guardian g
      WHERE g.id = guardian_student.guardian_id
        AND user_owns_household(g.household_id)
    )
    AND EXISTS (
      SELECT 1 FROM student s
      WHERE s.id = guardian_student.student_id
        AND user_owns_household(s.household_id)
    )
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 6. application_answer: a locked application's answers are final
--
-- answer_family is FOR ALL with no WITH CHECK. The existing lock trigger is
-- BEFORE UPDATE only, so a family could INSERT new answers onto a submitted,
-- locked application, including field keys the server's allowlist rejects.
-- ───────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS answer_family ON application_answer;

CREATE POLICY answer_family_select ON application_answer FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM application a
      JOIN guardian g ON g.id = a.guardian_id
      WHERE a.id = application_answer.application_id
        AND user_owns_household(g.household_id)
    )
  );

CREATE POLICY answer_family_write ON application_answer FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM application a
      JOIN guardian g ON g.id = a.guardian_id
      WHERE a.id = application_answer.application_id
        AND user_owns_household(g.household_id)
        AND a.locked_at IS NULL
    )
  );

CREATE POLICY answer_family_update ON application_answer FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM application a
      JOIN guardian g ON g.id = a.guardian_id
      WHERE a.id = application_answer.application_id
        AND user_owns_household(g.household_id)
        AND a.locked_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM application a
      JOIN guardian g ON g.id = a.guardian_id
      WHERE a.id = application_answer.application_id
        AND user_owns_household(g.household_id)
        AND a.locked_at IS NULL
    )
  );

CREATE POLICY answer_family_delete ON application_answer FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM application a
      JOIN guardian g ON g.id = a.guardian_id
      WHERE a.id = application_answer.application_id
        AND user_owns_household(g.household_id)
        AND a.locked_at IS NULL
    )
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 7. Capacity counters must be scoped to a school year
--
-- capacity_plan is UNIQUE (campus_id, grade_level_id, school_year_id), but
-- the offer and acceptance triggers updated every year's row for that campus
-- and grade. fn_update_enrollment_capacity already filtered by school year;
-- these two never did. With 2026-27 and 2027-28 both live, every offer sent
-- for one year also moved the other year's counters, so the seat numbers
-- staff plan against were wrong in both directions.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_offer_school_year(p_application_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ew.school_year_id
  FROM application a
  JOIN enrollment_window ew ON ew.id = a.enrollment_window_id
  WHERE a.id = p_application_id;
$$;

CREATE OR REPLACE FUNCTION fn_update_offer_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_year_id UUID;
BEGIN
  v_school_year_id := fn_offer_school_year(NEW.application_id);
  IF v_school_year_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    UPDATE capacity_plan
    SET seats_offered = seats_offered + 1
    WHERE campus_id = NEW.campus_id
      AND grade_level_id = NEW.grade_level_id
      AND school_year_id = v_school_year_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'pending' AND NEW.status IN ('expired', 'revoked', 'declined') THEN
      UPDATE capacity_plan
      SET seats_offered = GREATEST(seats_offered - 1, 0)
      WHERE campus_id = NEW.campus_id
        AND grade_level_id = NEW.grade_level_id
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
  v_application_id UUID;
  v_school_year_id UUID;
BEGIN
  SELECT o.campus_id, o.grade_level_id, o.application_id
    INTO v_campus_id, v_grade_level_id, v_application_id
  FROM offer o WHERE o.id = NEW.offer_id;

  v_school_year_id := fn_offer_school_year(v_application_id);
  IF v_school_year_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE capacity_plan
  SET seats_accepted = seats_accepted + 1
  WHERE campus_id = v_campus_id
    AND grade_level_id = v_grade_level_id
    AND school_year_id = v_school_year_id;

  RETURN NEW;
END;
$$;

-- seats_accepted only ever counted up: nothing decremented it when a family
-- later withdrew, so a grade could read full while real seats sat empty and
-- staff stopped promoting from the waitlist. Mirror the enrollment trigger.
CREATE OR REPLACE FUNCTION fn_release_accepted_seat()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'active'
     AND NEW.status IN ('withdrawn', 'transferred') THEN
    UPDATE capacity_plan
    SET seats_accepted = GREATEST(seats_accepted - 1, 0)
    WHERE campus_id = NEW.campus_id
      AND grade_level_id = NEW.grade_level_id
      AND school_year_id = NEW.school_year_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_release_accepted_seat ON enrollment;
CREATE TRIGGER trg_release_accepted_seat
AFTER UPDATE ON enrollment
FOR EACH ROW
EXECUTE FUNCTION fn_release_accepted_seat();

-- ───────────────────────────────────────────────────────────────────────────
-- 8. Reconcile the counters the year-blind triggers corrupted
--
-- Recomputed from the real rows rather than adjusted, so the result does not
-- depend on how wrong the stored value was.
-- ───────────────────────────────────────────────────────────────────────────

UPDATE capacity_plan cp
SET
  seats_offered = COALESCE(actual.offered, 0),
  seats_accepted = COALESCE(actual.accepted, 0)
FROM (
  SELECT
    cp2.id,
    (
      SELECT count(*) FROM offer o
      JOIN application a ON a.id = o.application_id
      JOIN enrollment_window ew ON ew.id = a.enrollment_window_id
      WHERE o.campus_id = cp2.campus_id
        AND o.grade_level_id = cp2.grade_level_id
        AND ew.school_year_id = cp2.school_year_id
        AND o.status = 'pending'
    ) AS offered,
    (
      SELECT count(*) FROM acceptance acc
      JOIN offer o ON o.id = acc.offer_id
      JOIN application a ON a.id = o.application_id
      JOIN enrollment_window ew ON ew.id = a.enrollment_window_id
      LEFT JOIN enrollment e ON e.acceptance_id = acc.id
      WHERE o.campus_id = cp2.campus_id
        AND o.grade_level_id = cp2.grade_level_id
        AND ew.school_year_id = cp2.school_year_id
        AND (e.id IS NULL OR e.status NOT IN ('withdrawn', 'transferred'))
    ) AS accepted
  FROM capacity_plan cp2
) AS actual
WHERE cp.id = actual.id;

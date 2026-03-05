-- Migration 010: RLS Policies + Triggers

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Check if current user has any role at a campus
CREATE OR REPLACE FUNCTION user_has_campus_access(p_campus_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_campus_role
    WHERE user_id = auth.uid()
    AND campus_id = p_campus_id
  );
$$;

-- Check if current user has a minimum role at a campus
-- Hierarchy: system_admin > enrollment_manager > enrollment_staff > compliance_auditor
CREATE OR REPLACE FUNCTION user_has_campus_role(p_campus_id UUID, p_min_role staff_role)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_campus_role
    WHERE user_id = auth.uid()
    AND campus_id = p_campus_id
    AND CASE p_min_role
      WHEN 'compliance_auditor' THEN role IN ('system_admin', 'enrollment_manager', 'enrollment_staff', 'compliance_auditor')
      WHEN 'enrollment_staff' THEN role IN ('system_admin', 'enrollment_manager', 'enrollment_staff')
      WHEN 'enrollment_manager' THEN role IN ('system_admin', 'enrollment_manager')
      WHEN 'system_admin' THEN role = 'system_admin'
    END
  );
$$;

-- Check if current user is a system_admin on any campus
CREATE OR REPLACE FUNCTION user_is_system_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_campus_role
    WHERE user_id = auth.uid()
    AND role = 'system_admin'
  );
$$;

-- Check if current user owns a household
CREATE OR REPLACE FUNCTION user_owns_household(p_household_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM household
    WHERE id = p_household_id
    AND user_id = auth.uid()
  );
$$;

-- ============================================
-- ENABLE RLS ON ALL TABLES
-- ============================================

ALTER TABLE organization ENABLE ROW LEVEL SECURITY;
ALTER TABLE region ENABLE ROW LEVEL SECURITY;
ALTER TABLE campus ENABLE ROW LEVEL SECURITY;
ALTER TABLE program ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_year ENABLE ROW LEVEL SECURITY;
ALTER TABLE grade_level ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_campus_role ENABLE ROW LEVEL SECURITY;
ALTER TABLE household ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian ENABLE ROW LEVEL SECURITY;
ALTER TABLE student ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian_student ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment_window ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE application ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_answer ENABLE ROW LEVEL SECURITY;
ALTER TABLE document ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE signature ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE lottery_rule_set ENABLE ROW LEVEL SECURITY;
ALTER TABLE lottery_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE lottery_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE lottery_entry_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer ENABLE ROW LEVEL SECURITY;
ALTER TABLE acceptance ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist_position ENABLE ROW LEVEL SECURITY;
ALTER TABLE capacity_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathway_interest ENABLE ROW LEVEL SECURITY;
ALTER TABLE note ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_tag ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE setting ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES: Public/Read-only tables
-- ============================================

-- Organization: readable by all authenticated users
CREATE POLICY org_select ON organization FOR SELECT TO authenticated USING (true);
CREATE POLICY org_manage ON organization FOR ALL TO authenticated USING (user_is_system_admin());

-- Region: readable by all authenticated users
CREATE POLICY region_select ON region FOR SELECT TO authenticated USING (true);
CREATE POLICY region_manage ON region FOR ALL TO authenticated USING (user_is_system_admin());

-- Campus: readable by all authenticated users
CREATE POLICY campus_select ON campus FOR SELECT TO authenticated USING (true);
CREATE POLICY campus_manage ON campus FOR ALL TO authenticated USING (user_is_system_admin());

-- School year: readable by all authenticated users
CREATE POLICY school_year_select ON school_year FOR SELECT TO authenticated USING (true);
CREATE POLICY school_year_manage ON school_year FOR ALL TO authenticated USING (user_is_system_admin());

-- Grade level: readable by all authenticated users
CREATE POLICY grade_level_select ON grade_level FOR SELECT TO authenticated USING (true);
CREATE POLICY grade_level_manage ON grade_level FOR ALL TO authenticated USING (user_has_campus_role(campus_id, 'enrollment_manager'));

-- Program: readable by all authenticated users
CREATE POLICY program_select ON program FOR SELECT TO authenticated USING (true);
CREATE POLICY program_manage ON program FOR ALL TO authenticated USING (user_has_campus_role(campus_id, 'enrollment_manager'));

-- ============================================
-- RLS POLICIES: User-scoped tables
-- ============================================

-- User profile: users can read/update their own profile
CREATE POLICY profile_own ON user_profile FOR SELECT TO authenticated
  USING (id = auth.uid());
CREATE POLICY profile_own_update ON user_profile FOR UPDATE TO authenticated
  USING (id = auth.uid());
CREATE POLICY profile_own_insert ON user_profile FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
-- Staff can see profiles in their campus
CREATE POLICY profile_staff ON user_profile FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_campus_role ucr
    WHERE ucr.user_id = user_profile.id
    AND user_has_campus_access(ucr.campus_id)
  ));

-- User campus roles: staff can see roles in their campus
CREATE POLICY ucr_select ON user_campus_role FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR user_has_campus_access(campus_id));
CREATE POLICY ucr_manage ON user_campus_role FOR ALL TO authenticated
  USING (user_has_campus_role(campus_id, 'system_admin'));

-- ============================================
-- RLS POLICIES: Family data (household-scoped)
-- ============================================

-- Household: families see their own, staff see campus-related
CREATE POLICY household_own ON household FOR ALL TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY household_staff ON household FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM student s
    JOIN application a ON a.student_id = s.id
    WHERE s.household_id = household.id
    AND user_has_campus_access(a.campus_id)
  ));

-- Guardian: families see their own household, staff see campus-related
CREATE POLICY guardian_own ON guardian FOR ALL TO authenticated
  USING (user_owns_household(household_id));
CREATE POLICY guardian_staff ON guardian FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM student s
    JOIN application a ON a.student_id = s.id
    WHERE s.household_id = guardian.household_id
    AND user_has_campus_access(a.campus_id)
  ));

-- Student: families see their own household, staff see campus-related
CREATE POLICY student_own ON student FOR ALL TO authenticated
  USING (user_owns_household(household_id));
CREATE POLICY student_staff ON student FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM application a
    WHERE a.student_id = student.id
    AND user_has_campus_access(a.campus_id)
  ));

-- Guardian-Student: based on household access
CREATE POLICY gs_own ON guardian_student FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM guardian g WHERE g.id = guardian_id AND user_owns_household(g.household_id)
  ));

-- ============================================
-- RLS POLICIES: Application data (campus-scoped)
-- ============================================

-- Enrollment window: public read (for families to see), staff manage
CREATE POLICY window_select ON enrollment_window FOR SELECT TO authenticated USING (true);
CREATE POLICY window_manage ON enrollment_window FOR ALL TO authenticated
  USING (user_has_campus_role(campus_id, 'enrollment_manager'));

-- Form template: public read for active templates
CREATE POLICY form_template_select ON form_template FOR SELECT TO authenticated
  USING (is_active = true OR (campus_id IS NOT NULL AND user_has_campus_access(campus_id)));
CREATE POLICY form_template_manage ON form_template FOR ALL TO authenticated
  USING (campus_id IS NOT NULL AND user_has_campus_role(campus_id, 'enrollment_manager'));

-- Application: families see their own, staff see their campus
CREATE POLICY app_family ON application FOR ALL TO authenticated
  USING (guardian_id IN (SELECT id FROM guardian WHERE user_owns_household(household_id)));
CREATE POLICY app_staff ON application FOR SELECT TO authenticated
  USING (user_has_campus_access(campus_id));
CREATE POLICY app_staff_update ON application FOR UPDATE TO authenticated
  USING (user_has_campus_role(campus_id, 'enrollment_staff'));

-- Application answers: same as application
CREATE POLICY answer_family ON application_answer FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM application a
    JOIN guardian g ON g.id = a.guardian_id
    WHERE a.id = application_id AND user_owns_household(g.household_id)
  ));
CREATE POLICY answer_staff ON application_answer FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM application a WHERE a.id = application_id AND user_has_campus_access(a.campus_id)
  ));

-- Documents: same access pattern as applications
CREATE POLICY doc_family ON document FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM application a
    JOIN guardian g ON g.id = a.guardian_id
    WHERE a.id = application_id AND user_owns_household(g.household_id)
  ));
CREATE POLICY doc_staff ON document FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM application a WHERE a.id = application_id AND user_has_campus_access(a.campus_id)
  ));
CREATE POLICY doc_staff_update ON document FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM application a WHERE a.id = application_id AND user_has_campus_role(a.campus_id, 'enrollment_staff')
  ));

-- Status history: read-only for all with access
CREATE POLICY status_history_select ON application_status_history FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM application a WHERE a.id = application_id
    AND (user_has_campus_access(a.campus_id) OR guardian_id IN (SELECT id FROM guardian WHERE user_owns_household(household_id)))
  ));

-- Signature: families insert, staff read
CREATE POLICY sig_family ON signature FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM application a
    JOIN guardian g ON g.id = a.guardian_id
    WHERE a.id = application_id AND user_owns_household(g.household_id)
  ));
CREATE POLICY sig_read ON signature FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM application a WHERE a.id = application_id AND user_has_campus_access(a.campus_id)
  ));

-- Verification items: staff only
CREATE POLICY verify_staff ON verification_item FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM application a WHERE a.id = application_id AND user_has_campus_role(a.campus_id, 'enrollment_staff')
  ));

-- ============================================
-- RLS POLICIES: Lottery (staff only)
-- ============================================

CREATE POLICY lrs_staff ON lottery_rule_set FOR ALL TO authenticated
  USING (user_has_campus_access(campus_id));

CREATE POLICY lr_staff ON lottery_run FOR ALL TO authenticated
  USING (user_has_campus_access(campus_id));

CREATE POLICY le_staff ON lottery_entry FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM lottery_run lr WHERE lr.id = lottery_run_id AND user_has_campus_access(lr.campus_id)));

-- Lottery entry snapshot: INSERT-only (immutable)
CREATE POLICY les_insert ON lottery_entry_snapshot FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM lottery_run lr WHERE lr.id = lottery_run_id
    AND lr.status = 'official'
    AND user_has_campus_role(lr.campus_id, 'enrollment_manager')
  ));
CREATE POLICY les_select ON lottery_entry_snapshot FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM lottery_run lr WHERE lr.id = lottery_run_id AND user_has_campus_access(lr.campus_id)));

-- ============================================
-- RLS POLICIES: Offers, Waitlist, Capacity, Enrollment
-- ============================================

CREATE POLICY offer_staff ON offer FOR ALL TO authenticated
  USING (user_has_campus_access(campus_id));
CREATE POLICY offer_family ON offer FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM application a
    JOIN guardian g ON g.id = a.guardian_id
    WHERE a.id = application_id AND user_owns_household(g.household_id)
  ));

CREATE POLICY acceptance_staff ON acceptance FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM offer o WHERE o.id = offer_id AND user_has_campus_access(o.campus_id)));
CREATE POLICY acceptance_family ON acceptance FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM offer o
    JOIN application a ON a.id = o.application_id
    JOIN guardian g ON g.id = a.guardian_id
    WHERE o.id = offer_id AND user_owns_household(g.household_id)
  ));

CREATE POLICY waitlist_staff ON waitlist FOR ALL TO authenticated
  USING (user_has_campus_access(campus_id));
CREATE POLICY wp_staff ON waitlist_position FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM waitlist w WHERE w.id = waitlist_id AND user_has_campus_access(w.campus_id)));

CREATE POLICY cp_staff ON capacity_plan FOR ALL TO authenticated
  USING (user_has_campus_access(campus_id));

CREATE POLICY enrollment_staff ON enrollment FOR ALL TO authenticated
  USING (user_has_campus_access(campus_id));

-- ============================================
-- RLS POLICIES: Communications & Misc
-- ============================================

CREATE POLICY mt_staff ON message_template FOR ALL TO authenticated
  USING (campus_id IS NULL OR user_has_campus_access(campus_id));

CREATE POLICY cl_staff ON communication_log FOR SELECT TO authenticated
  USING (campus_id IS NULL OR user_has_campus_access(campus_id));
CREATE POLICY cl_insert ON communication_log FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY notif_own ON notification FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY notif_update ON notification FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY pi_staff ON pathway_interest FOR ALL TO authenticated
  USING (user_has_campus_access(campus_id));

CREATE POLICY note_staff ON note FOR ALL TO authenticated
  USING (campus_id IS NULL OR user_has_campus_access(campus_id));

CREATE POLICY tag_staff ON tag FOR ALL TO authenticated
  USING (campus_id IS NULL OR user_has_campus_access(campus_id));
CREATE POLICY at_staff ON application_tag FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM application a WHERE a.id = application_id AND user_has_campus_access(a.campus_id)));

-- Audit event: INSERT-only, NO UPDATE/DELETE ever, select for admins only
CREATE POLICY audit_insert ON audit_event FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY audit_select ON audit_event FOR SELECT TO authenticated
  USING (user_is_system_admin() OR (campus_id IS NOT NULL AND user_has_campus_role(campus_id, 'enrollment_manager')));

CREATE POLICY setting_staff ON setting FOR ALL TO authenticated
  USING (campus_id IS NULL OR user_has_campus_access(campus_id));

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Apply updated_at trigger to all tables with updated_at column
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE column_name = 'updated_at'
    AND table_schema = 'public'
    AND table_name != 'audit_event'
  LOOP
    EXECUTE format('
      CREATE TRIGGER trg_updated_at
      BEFORE UPDATE ON %I
      FOR EACH ROW
      EXECUTE FUNCTION fn_set_updated_at();
    ', t);
  END LOOP;
END;
$$;

-- Track application status changes
CREATE OR REPLACE FUNCTION fn_track_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO application_status_history (
      application_id, from_status, to_status, changed_by
    ) VALUES (
      NEW.id, OLD.status, NEW.status, auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_application_status_change
AFTER UPDATE OF status ON application
FOR EACH ROW
EXECUTE FUNCTION fn_track_status_change();

-- Update capacity counters when offers change
CREATE OR REPLACE FUNCTION fn_update_offer_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    UPDATE capacity_plan
    SET seats_offered = seats_offered + 1
    WHERE campus_id = NEW.campus_id AND grade_level_id = NEW.grade_level_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Offer revoked or expired: decrement
    IF OLD.status = 'pending' AND NEW.status IN ('expired', 'revoked', 'declined') THEN
      UPDATE capacity_plan
      SET seats_offered = GREATEST(seats_offered - 1, 0)
      WHERE campus_id = NEW.campus_id AND grade_level_id = NEW.grade_level_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_offer_capacity
AFTER INSERT OR UPDATE OF status ON offer
FOR EACH ROW
EXECUTE FUNCTION fn_update_offer_capacity();

-- Update capacity counters when acceptances are created
CREATE OR REPLACE FUNCTION fn_update_acceptance_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_campus_id UUID;
  v_grade_level_id UUID;
BEGIN
  SELECT o.campus_id, o.grade_level_id INTO v_campus_id, v_grade_level_id
  FROM offer o WHERE o.id = NEW.offer_id;

  UPDATE capacity_plan
  SET seats_accepted = seats_accepted + 1
  WHERE campus_id = v_campus_id AND grade_level_id = v_grade_level_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_acceptance_capacity
AFTER INSERT ON acceptance
FOR EACH ROW
EXECUTE FUNCTION fn_update_acceptance_capacity();

-- Update capacity counters when enrollments change
CREATE OR REPLACE FUNCTION fn_update_enrollment_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
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
      SET seats_registered = GREATEST(seats_registered - 1, 0)
      WHERE campus_id = NEW.campus_id AND grade_level_id = NEW.grade_level_id
      AND school_year_id = NEW.school_year_id;
    ELSIF OLD.status != 'active' AND NEW.status = 'active' THEN
      UPDATE capacity_plan
      SET seats_registered = seats_registered + 1
      WHERE campus_id = NEW.campus_id AND grade_level_id = NEW.grade_level_id
      AND school_year_id = NEW.school_year_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enrollment_capacity
AFTER INSERT OR UPDATE OF status ON enrollment
FOR EACH ROW
EXECUTE FUNCTION fn_update_enrollment_capacity();

-- Generic audit trigger
CREATE OR REPLACE FUNCTION fn_audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_action audit_action;
  v_campus_id UUID;
  v_record_id UUID;
BEGIN
  -- Determine action
  IF TG_OP = 'INSERT' THEN
    v_action = 'create';
    v_record_id = NEW.id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action = 'update';
    v_record_id = NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    v_action = 'delete';
    v_record_id = OLD.id;
  END IF;

  -- Try to extract campus_id from the record
  BEGIN
    IF TG_OP = 'DELETE' THEN
      v_campus_id = (row_to_json(OLD)::jsonb->>'campus_id')::UUID;
    ELSE
      v_campus_id = (row_to_json(NEW)::jsonb->>'campus_id')::UUID;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_campus_id = NULL;
  END;

  INSERT INTO audit_event (table_name, record_id, action, actor_id, campus_id, old_data, new_data)
  VALUES (
    TG_TABLE_NAME,
    v_record_id,
    v_action,
    auth.uid(),
    v_campus_id,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN row_to_json(OLD)::jsonb ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW)::jsonb ELSE NULL END
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Apply audit trigger to key tables
CREATE TRIGGER trg_audit_application AFTER INSERT OR UPDATE OR DELETE ON application
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();
CREATE TRIGGER trg_audit_offer AFTER INSERT OR UPDATE OR DELETE ON offer
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();
CREATE TRIGGER trg_audit_acceptance AFTER INSERT OR UPDATE OR DELETE ON acceptance
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();
CREATE TRIGGER trg_audit_enrollment AFTER INSERT OR UPDATE OR DELETE ON enrollment
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();
CREATE TRIGGER trg_audit_lottery_run AFTER INSERT OR UPDATE OR DELETE ON lottery_run
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();
CREATE TRIGGER trg_audit_document AFTER INSERT OR UPDATE OR DELETE ON document
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();
CREATE TRIGGER trg_audit_user_campus_role AFTER INSERT OR UPDATE OR DELETE ON user_campus_role
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

-- Prevent updates to application_answer after application is locked
CREATE OR REPLACE FUNCTION fn_check_answer_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_locked_at TIMESTAMPTZ;
BEGIN
  SELECT locked_at INTO v_locked_at
  FROM application WHERE id = NEW.application_id;

  IF v_locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot modify answers for a locked application';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_answer_lock_check
BEFORE UPDATE ON application_answer
FOR EACH ROW
EXECUTE FUNCTION fn_check_answer_lock();

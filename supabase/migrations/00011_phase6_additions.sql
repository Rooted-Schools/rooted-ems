-- Migration 011: Phase 6 — New Tables + Column Additions
-- Tables: inquiry, application_preference, contact_log, registration_item
-- Columns: guardian.sms_consent, student.previous_school_phone,
--          application.source, application.assigned_staff_id

-- ============================================
-- COLUMN ADDITIONS TO EXISTING TABLES
-- ============================================

-- Guardian: SMS consent tracking
ALTER TABLE guardian ADD COLUMN sms_consent BOOLEAN DEFAULT false;

-- Student: Previous school phone for records requests
ALTER TABLE student ADD COLUMN previous_school_phone TEXT;

-- Application: Lead source tracking + staff assignment
ALTER TABLE application ADD COLUMN source TEXT;
ALTER TABLE application ADD COLUMN assigned_staff_id UUID REFERENCES user_profile(id);

-- ============================================
-- NEW TABLES
-- ============================================

-- Pre-application lead/inquiry capture (CRM)
CREATE TABLE inquiry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID REFERENCES campus(id),
  student_first_name TEXT NOT NULL,
  student_last_name TEXT NOT NULL,
  grade_applying grade_level_code NOT NULL,
  guardian_name TEXT,
  guardian_email TEXT,
  guardian_phone TEXT,
  source TEXT, -- 'word_of_mouth', 'social_media', 'community_event', 'partner_referral', 'website', 'other'
  notes TEXT,
  assigned_staff_id UUID REFERENCES user_profile(id),
  status TEXT NOT NULL DEFAULT 'new', -- 'new', 'contacted', 'applied', 'lost'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ranked campus preferences per application
CREATE TABLE application_preference (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES application(id) ON DELETE CASCADE,
  campus_id UUID NOT NULL REFERENCES campus(id),
  rank INTEGER NOT NULL, -- 1, 2, 3
  UNIQUE(application_id, rank),
  UNIQUE(application_id, campus_id)
);

-- Contact history / CRM log
CREATE TABLE contact_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES student(id),
  inquiry_id UUID REFERENCES inquiry(id),
  application_id UUID REFERENCES application(id),
  staff_id UUID REFERENCES user_profile(id),
  channel TEXT NOT NULL, -- 'phone', 'email', 'sms', 'in_person'
  direction TEXT NOT NULL, -- 'inbound', 'outbound'
  subject TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Registration packet items (post-acceptance)
CREATE TABLE registration_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES enrollment(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL, -- 'emergency_contact', 'medical_info', 'tech_policy', 'handbook_ack', 'media_release', 'field_trip', 'frl_app', 'transport', 'before_after_care'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'submitted', 'verified'
  signed_at TIMESTAMPTZ,
  verified_by UUID REFERENCES user_profile(id),
  verified_at TIMESTAMPTZ,
  data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- ENABLE RLS ON NEW TABLES
-- ============================================

ALTER TABLE inquiry ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_preference ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_item ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES
-- ============================================

-- Inquiry: staff with campus access can CRUD, system_admin full access
CREATE POLICY inquiry_staff_select ON inquiry FOR SELECT TO authenticated
  USING (campus_id IS NULL OR user_has_campus_access(campus_id));
CREATE POLICY inquiry_staff_insert ON inquiry FOR INSERT TO authenticated
  WITH CHECK (campus_id IS NULL OR user_has_campus_access(campus_id));
CREATE POLICY inquiry_staff_update ON inquiry FOR UPDATE TO authenticated
  USING (campus_id IS NULL OR user_has_campus_role(campus_id, 'enrollment_staff'));
CREATE POLICY inquiry_staff_delete ON inquiry FOR DELETE TO authenticated
  USING (user_is_system_admin() OR (campus_id IS NOT NULL AND user_has_campus_role(campus_id, 'enrollment_manager')));

-- Application preference: same access pattern as application
CREATE POLICY apref_family ON application_preference FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM application a
    JOIN guardian g ON g.id = a.guardian_id
    WHERE a.id = application_id AND user_owns_household(g.household_id)
  ));
CREATE POLICY apref_staff ON application_preference FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM application a WHERE a.id = application_id AND user_has_campus_access(a.campus_id)
  ));

-- Contact log: staff with campus access can CRUD
CREATE POLICY clog_staff_select ON contact_log FOR SELECT TO authenticated
  USING (
    (application_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM application a WHERE a.id = application_id AND user_has_campus_access(a.campus_id)
    ))
    OR (inquiry_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM inquiry i WHERE i.id = inquiry_id AND user_has_campus_access(i.campus_id)
    ))
    OR user_is_system_admin()
  );
CREATE POLICY clog_staff_insert ON contact_log FOR INSERT TO authenticated
  WITH CHECK (true); -- validated at application layer
CREATE POLICY clog_staff_update ON contact_log FOR UPDATE TO authenticated
  USING (staff_id = auth.uid() OR user_is_system_admin());
CREATE POLICY clog_staff_delete ON contact_log FOR DELETE TO authenticated
  USING (user_is_system_admin());

-- Registration item: family can view/update own enrollment items, staff can CRUD for campus
CREATE POLICY regitem_family ON registration_item FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM enrollment e
    JOIN application a ON a.id = e.application_id
    JOIN guardian g ON g.id = a.guardian_id
    WHERE e.id = enrollment_id AND user_owns_household(g.household_id)
  ));
CREATE POLICY regitem_family_update ON registration_item FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM enrollment e
    JOIN application a ON a.id = e.application_id
    JOIN guardian g ON g.id = a.guardian_id
    WHERE e.id = enrollment_id AND user_owns_household(g.household_id)
  ));
CREATE POLICY regitem_staff ON registration_item FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM enrollment e WHERE e.id = enrollment_id AND user_has_campus_access(e.campus_id)
  ));

-- ============================================
-- INDEXES
-- ============================================

-- Inquiry indexes
CREATE INDEX idx_inquiry_campus_id ON inquiry(campus_id);
CREATE INDEX idx_inquiry_assigned_staff_id ON inquiry(assigned_staff_id);
CREATE INDEX idx_inquiry_status ON inquiry(status);
CREATE INDEX idx_inquiry_grade ON inquiry(grade_applying);
CREATE INDEX idx_inquiry_created_at ON inquiry(created_at DESC);

-- Application preference indexes
CREATE INDEX idx_apref_application_id ON application_preference(application_id);
CREATE INDEX idx_apref_campus_id ON application_preference(campus_id);

-- Contact log indexes
CREATE INDEX idx_clog_student_id ON contact_log(student_id);
CREATE INDEX idx_clog_application_id ON contact_log(application_id);
CREATE INDEX idx_clog_inquiry_id ON contact_log(inquiry_id);
CREATE INDEX idx_clog_staff_id ON contact_log(staff_id);
CREATE INDEX idx_clog_created_at ON contact_log(created_at DESC);

-- Registration item indexes
CREATE INDEX idx_regitem_enrollment_id ON registration_item(enrollment_id);
CREATE INDEX idx_regitem_status ON registration_item(status);
CREATE INDEX idx_regitem_item_type ON registration_item(item_type);

-- Index on new application columns
CREATE INDEX idx_application_source ON application(source) WHERE source IS NOT NULL;
CREATE INDEX idx_application_assigned_staff ON application(assigned_staff_id) WHERE assigned_staff_id IS NOT NULL;

-- ============================================
-- TRIGGERS
-- ============================================

-- updated_at triggers for new tables with updated_at
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON inquiry
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON registration_item
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Audit trigger for inquiry (CRM lead tracking)
CREATE TRIGGER trg_audit_inquiry AFTER INSERT OR UPDATE OR DELETE ON inquiry
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

-- Audit trigger for registration_item
CREATE TRIGGER trg_audit_registration_item AFTER INSERT OR UPDATE OR DELETE ON registration_item
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

-- Migration 014: Phase 1 — New Tables for Entity Model Expansion
-- Tables: application_flag, document_type, document_review, task, transfer, withdrawal,
--         registration_packet, packet_requirement
-- Supports: staff work queue, compliance tracking, enrollment lifecycle

-- ============================================
-- DOCUMENT TYPE (reference table)
-- ============================================

CREATE TABLE document_type (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID REFERENCES campus(id),          -- NULL = org-wide default
  name TEXT NOT NULL,                              -- e.g., 'Birth Certificate', 'Immunization Records'
  slug TEXT NOT NULL,                              -- e.g., 'proof_of_age', 'immunization'
  description TEXT,
  is_required BOOLEAN NOT NULL DEFAULT true,
  applies_to TEXT NOT NULL DEFAULT 'application',  -- 'application', 'registration', 'both'
  accepted_mime_types TEXT[] DEFAULT ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/heic'],
  max_file_size_mb INTEGER DEFAULT 10,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- DOCUMENT REVIEW (audit trail for document reviews)
-- ============================================

CREATE TABLE document_review (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES user_profile(id),
  action TEXT NOT NULL,            -- 'approved', 'rejected', 'requested_reupload'
  reason TEXT,                     -- required for rejection
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- APPLICATION FLAG (blocking/informational flags)
-- ============================================

CREATE TABLE application_flag (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES application(id) ON DELETE CASCADE,
  flag_type TEXT NOT NULL,           -- 'missing_document', 'incomplete_info', 'duplicate_suspected', 'priority_review', 'compliance_hold'
  severity TEXT NOT NULL DEFAULT 'info',  -- 'info', 'warning', 'blocking'
  title TEXT NOT NULL,
  description TEXT,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by UUID REFERENCES user_profile(id),
  resolved_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES user_profile(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- TASK (staff work queue / follow-up tracking)
-- ============================================

CREATE TABLE task (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID REFERENCES campus(id),
  title TEXT NOT NULL,
  description TEXT,
  entity_type TEXT,                  -- 'application', 'inquiry', 'enrollment', 'student'
  entity_id UUID,                    -- polymorphic reference
  priority TEXT NOT NULL DEFAULT 'normal',  -- 'low', 'normal', 'high', 'urgent'
  status TEXT NOT NULL DEFAULT 'open',     -- 'open', 'in_progress', 'completed', 'cancelled'
  due_date DATE,
  assigned_to UUID REFERENCES user_profile(id),
  created_by UUID NOT NULL REFERENCES user_profile(id),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- TRANSFER (formal transfer records)
-- ============================================

CREATE TABLE transfer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES enrollment(id),
  student_id UUID NOT NULL REFERENCES student(id),
  from_campus_id UUID NOT NULL REFERENCES campus(id),
  to_campus_id UUID NOT NULL REFERENCES campus(id),
  from_grade_level_id UUID NOT NULL REFERENCES grade_level(id),
  to_grade_level_id UUID NOT NULL REFERENCES grade_level(id),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'approved', 'completed', 'denied'
  requested_by UUID NOT NULL REFERENCES user_profile(id),
  approved_by UUID REFERENCES user_profile(id),
  approved_at TIMESTAMPTZ,
  effective_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- WITHDRAWAL (formal withdrawal records)
-- ============================================

CREATE TABLE withdrawal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES enrollment(id),
  student_id UUID NOT NULL REFERENCES student(id),
  campus_id UUID NOT NULL REFERENCES campus(id),
  reason TEXT NOT NULL,            -- 'family_moved', 'transfer_out', 'dissatisfaction', 'disciplinary', 'financial', 'other'
  reason_detail TEXT,
  effective_date DATE NOT NULL,
  processed_by UUID NOT NULL REFERENCES user_profile(id),
  exit_interview_completed BOOLEAN DEFAULT false,
  forwarding_school TEXT,
  records_transferred BOOLEAN DEFAULT false,
  records_transferred_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- REGISTRATION PACKET (wrapper for post-acceptance registration)
-- ============================================

CREATE TABLE registration_packet (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES enrollment(id) ON DELETE CASCADE UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'in_progress', 'submitted', 'verified', 'complete'
  started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  verified_by UUID REFERENCES user_profile(id),
  verified_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- PACKET REQUIREMENT (configurable requirements per campus/year)
-- ============================================

CREATE TABLE packet_requirement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID NOT NULL REFERENCES campus(id),
  school_year_id UUID NOT NULL REFERENCES school_year(id),
  item_type TEXT NOT NULL,                  -- matches registration_item.item_type
  name TEXT NOT NULL,                        -- display name
  description TEXT,
  is_required BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(campus_id, school_year_id, item_type)
);

-- ============================================
-- ENABLE RLS ON ALL NEW TABLES
-- ============================================

ALTER TABLE document_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_flag ENABLE ROW LEVEL SECURITY;
ALTER TABLE task ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawal ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_packet ENABLE ROW LEVEL SECURITY;
ALTER TABLE packet_requirement ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES
-- ============================================

-- Document type: anyone authenticated can read, staff can manage
CREATE POLICY doctype_read ON document_type FOR SELECT TO authenticated
  USING (true);
CREATE POLICY doctype_manage ON document_type FOR ALL TO authenticated
  USING (user_is_system_admin() OR (campus_id IS NOT NULL AND user_has_campus_role(campus_id, 'enrollment_manager')));

-- Document review: staff with campus access can read/create
CREATE POLICY docreview_read ON document_review FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM document d
    JOIN application a ON a.id = d.application_id
    WHERE d.id = document_id AND user_has_campus_access(a.campus_id)
  ) OR EXISTS (
    SELECT 1 FROM document d
    JOIN application a ON a.id = d.application_id
    JOIN guardian g ON g.id = a.guardian_id
    WHERE d.id = document_id AND user_owns_household(g.household_id)
  ));
CREATE POLICY docreview_create ON document_review FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM document d
    JOIN application a ON a.id = d.application_id
    WHERE d.id = document_id AND user_has_campus_access(a.campus_id)
  ));

-- Application flag: staff with campus access
CREATE POLICY appflag_staff ON application_flag FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM application a WHERE a.id = application_id AND user_has_campus_access(a.campus_id)
  ));
CREATE POLICY appflag_family_read ON application_flag FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM application a
    JOIN guardian g ON g.id = a.guardian_id
    WHERE a.id = application_id AND user_owns_household(g.household_id)
  ));

-- Task: assigned user or campus staff can see, campus staff can manage
CREATE POLICY task_read ON task FOR SELECT TO authenticated
  USING (
    assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR (campus_id IS NOT NULL AND user_has_campus_access(campus_id))
    OR user_is_system_admin()
  );
CREATE POLICY task_manage ON task FOR INSERT TO authenticated
  WITH CHECK (
    (campus_id IS NOT NULL AND user_has_campus_access(campus_id))
    OR user_is_system_admin()
  );
CREATE POLICY task_update ON task FOR UPDATE TO authenticated
  USING (
    assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR (campus_id IS NOT NULL AND user_has_campus_role(campus_id, 'enrollment_manager'))
    OR user_is_system_admin()
  );
CREATE POLICY task_delete ON task FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR user_is_system_admin()
  );

-- Transfer: staff with campus access on either campus
CREATE POLICY transfer_staff ON transfer FOR ALL TO authenticated
  USING (
    user_has_campus_access(from_campus_id) OR user_has_campus_access(to_campus_id) OR user_is_system_admin()
  );
CREATE POLICY transfer_family_read ON transfer FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM enrollment e
    JOIN application a ON a.id = e.application_id
    JOIN guardian g ON g.id = a.guardian_id
    WHERE e.id = enrollment_id AND user_owns_household(g.household_id)
  ));

-- Withdrawal: staff with campus access
CREATE POLICY withdrawal_staff ON withdrawal FOR ALL TO authenticated
  USING (user_has_campus_access(campus_id) OR user_is_system_admin());
CREATE POLICY withdrawal_family_read ON withdrawal FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM enrollment e
    JOIN application a ON a.id = e.application_id
    JOIN guardian g ON g.id = a.guardian_id
    WHERE e.id = enrollment_id AND user_owns_household(g.household_id)
  ));

-- Registration packet: family can view/update own, staff can manage
CREATE POLICY regpacket_family ON registration_packet FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM enrollment e
    JOIN application a ON a.id = e.application_id
    JOIN guardian g ON g.id = a.guardian_id
    WHERE e.id = enrollment_id AND user_owns_household(g.household_id)
  ));
CREATE POLICY regpacket_family_update ON registration_packet FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM enrollment e
    JOIN application a ON a.id = e.application_id
    JOIN guardian g ON g.id = a.guardian_id
    WHERE e.id = enrollment_id AND user_owns_household(g.household_id)
  ));
CREATE POLICY regpacket_staff ON registration_packet FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM enrollment e WHERE e.id = enrollment_id AND user_has_campus_access(e.campus_id)
  ));

-- Packet requirement: anyone authenticated can read, staff can manage
CREATE POLICY packetreq_read ON packet_requirement FOR SELECT TO authenticated
  USING (true);
CREATE POLICY packetreq_manage ON packet_requirement FOR ALL TO authenticated
  USING (user_has_campus_role(campus_id, 'enrollment_manager') OR user_is_system_admin());

-- ============================================
-- INDEXES
-- ============================================

-- Document type
CREATE INDEX idx_doctype_campus ON document_type(campus_id);
CREATE INDEX idx_doctype_slug ON document_type(slug);
CREATE INDEX idx_doctype_applies_to ON document_type(applies_to);

-- Document review
CREATE INDEX idx_docreview_document ON document_review(document_id);
CREATE INDEX idx_docreview_reviewer ON document_review(reviewer_id);
CREATE INDEX idx_docreview_created ON document_review(created_at DESC);

-- Application flag
CREATE INDEX idx_appflag_application ON application_flag(application_id);
CREATE INDEX idx_appflag_type ON application_flag(flag_type);
CREATE INDEX idx_appflag_severity ON application_flag(severity);
CREATE INDEX idx_appflag_resolved ON application_flag(resolved);

-- Task
CREATE INDEX idx_task_campus ON task(campus_id);
CREATE INDEX idx_task_assigned ON task(assigned_to);
CREATE INDEX idx_task_created_by ON task(created_by);
CREATE INDEX idx_task_status ON task(status);
CREATE INDEX idx_task_priority ON task(priority);
CREATE INDEX idx_task_due_date ON task(due_date);
CREATE INDEX idx_task_entity ON task(entity_type, entity_id);

-- Transfer
CREATE INDEX idx_transfer_enrollment ON transfer(enrollment_id);
CREATE INDEX idx_transfer_student ON transfer(student_id);
CREATE INDEX idx_transfer_from_campus ON transfer(from_campus_id);
CREATE INDEX idx_transfer_to_campus ON transfer(to_campus_id);
CREATE INDEX idx_transfer_status ON transfer(status);

-- Withdrawal
CREATE INDEX idx_withdrawal_enrollment ON withdrawal(enrollment_id);
CREATE INDEX idx_withdrawal_student ON withdrawal(student_id);
CREATE INDEX idx_withdrawal_campus ON withdrawal(campus_id);
CREATE INDEX idx_withdrawal_effective ON withdrawal(effective_date);

-- Registration packet
CREATE INDEX idx_regpacket_enrollment ON registration_packet(enrollment_id);
CREATE INDEX idx_regpacket_status ON registration_packet(status);

-- Packet requirement
CREATE INDEX idx_packetreq_campus_year ON packet_requirement(campus_id, school_year_id);
CREATE INDEX idx_packetreq_item_type ON packet_requirement(item_type);

-- ============================================
-- TRIGGERS
-- ============================================

-- updated_at triggers
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON document_type
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON application_flag
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON task
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON transfer
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON withdrawal
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON registration_packet
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON packet_requirement
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Audit triggers for important tables
CREATE TRIGGER trg_audit_task AFTER INSERT OR UPDATE OR DELETE ON task
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_audit_transfer AFTER INSERT OR UPDATE OR DELETE ON transfer
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_audit_withdrawal AFTER INSERT OR UPDATE OR DELETE ON withdrawal
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_audit_registration_packet AFTER INSERT OR UPDATE OR DELETE ON registration_packet
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

-- ============================================
-- SEED: Default document types (org-wide)
-- ============================================

INSERT INTO document_type (campus_id, name, slug, description, is_required, applies_to, sort_order) VALUES
  (NULL, 'Birth Certificate / Proof of Age', 'proof_of_age', 'Official birth certificate or government-issued proof of age document.', true, 'application', 1),
  (NULL, 'Proof of Residency', 'residency', 'Utility bill, lease agreement, or mortgage statement showing current address.', true, 'application', 2),
  (NULL, 'Immunization Records', 'immunization', 'Up-to-date immunization/vaccination records from healthcare provider.', true, 'application', 3),
  (NULL, 'Previous School Records', 'school_records', 'Transcripts or report cards from previous school.', false, 'application', 4),
  (NULL, 'IEP Documentation', 'iep', 'Current Individualized Education Program documentation.', false, 'application', 5),
  (NULL, '504 Plan Documentation', 'plan_504', 'Current Section 504 Plan documentation.', false, 'application', 6),
  (NULL, 'Custody Documentation', 'custody', 'Legal custody documents if applicable.', false, 'application', 7),
  (NULL, 'McKinney-Vento Documentation', 'mckinney_vento', 'Documentation for students experiencing homelessness.', false, 'application', 8),
  (NULL, 'Income Verification', 'income_verification', 'Proof of income for Free/Reduced Lunch eligibility.', false, 'application', 9),
  (NULL, 'Parent/Guardian Photo ID', 'guardian_id', 'Government-issued photo identification of parent or guardian.', false, 'application', 10);

-- Default packet requirements (for all campuses, current school year)
-- Uses dynamic lookup for school_year to avoid FK issues
INSERT INTO packet_requirement (campus_id, school_year_id, item_type, name, description, is_required, sort_order)
SELECT c.id, sy.id, req.item_type, req.name, req.description, req.is_required, req.sort_order
FROM campus c
CROSS JOIN school_year sy
CROSS JOIN (VALUES
  ('emergency_contact', 'Emergency Contact Form', 'Complete emergency contact information for your student.', true, 1),
  ('medical_info', 'Medical/Health Information', 'Medical history, allergies, medications, and health conditions.', true, 2),
  ('tech_policy', 'Technology Acceptable Use Policy', 'Agreement to the school technology use policy.', true, 3),
  ('handbook_ack', 'Student Handbook Acknowledgment', 'Acknowledgment of receiving and reviewing the student handbook.', true, 4),
  ('media_release', 'Media Release Consent', 'Consent for use of student photos/videos in school communications.', false, 5),
  ('field_trip', 'Field Trip Permission', 'Blanket permission for school-organized field trips.', true, 6),
  ('frl_app', 'Free/Reduced Lunch Application', 'Application for the National School Lunch Program.', false, 7),
  ('transport', 'Transportation Enrollment', 'School transportation enrollment and route preferences.', false, 8),
  ('before_after_care', 'Before/After Care Enrollment', 'Enrollment in before and/or after school care programs.', false, 9)
) AS req(item_type, name, description, is_required, sort_order)
WHERE sy.is_current = true
ON CONFLICT (campus_id, school_year_id, item_type) DO NOTHING;

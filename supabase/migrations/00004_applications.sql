-- Migration 004: Application Tables
-- EnrollmentWindow, FormTemplate, Application, ApplicationAnswer, Document,
-- ApplicationStatusHistory, Signature, VerificationItem

-- Enrollment windows (per-campus enrollment periods)
CREATE TABLE enrollment_window (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campus_id UUID NOT NULL REFERENCES campus(id),
  school_year_id UUID NOT NULL REFERENCES school_year(id),
  name TEXT NOT NULL,
  status window_status NOT NULL DEFAULT 'draft',
  open_date TIMESTAMPTZ NOT NULL,
  close_date TIMESTAMPTZ NOT NULL,
  late_deadline TIMESTAMPTZ,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT window_dates_check CHECK (close_date > open_date)
);

-- Dynamic form templates
CREATE TABLE form_template (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campus_id UUID REFERENCES campus(id),
  name TEXT NOT NULL,
  description TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES user_profile(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Applications
CREATE TABLE application (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  enrollment_window_id UUID NOT NULL REFERENCES enrollment_window(id),
  student_id UUID NOT NULL REFERENCES student(id),
  campus_id UUID NOT NULL REFERENCES campus(id),
  grade_level_id UUID NOT NULL REFERENCES grade_level(id),
  form_template_id UUID REFERENCES form_template(id),
  guardian_id UUID NOT NULL REFERENCES guardian(id),
  status application_status NOT NULL DEFAULT 'draft',
  submitted_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES user_profile(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  has_sibling_enrolled BOOLEAN DEFAULT false,
  sibling_student_id UUID REFERENCES student(id),
  disciplinary_statement TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Application answers (EAV pattern for dynamic form responses)
CREATE TABLE application_answer (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES application(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (application_id, field_key)
);

-- Uploaded documents
CREATE TABLE document (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID REFERENCES application(id) ON DELETE SET NULL,
  student_id UUID REFERENCES student(id),
  document_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  storage_path TEXT NOT NULL,
  status document_status NOT NULL DEFAULT 'pending',
  verified_by UUID REFERENCES user_profile(id),
  verified_at TIMESTAMPTZ,
  rejection_reason TEXT,
  expires_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Application status history (immutable log)
CREATE TABLE application_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES application(id) ON DELETE CASCADE,
  from_status application_status,
  to_status application_status NOT NULL,
  changed_by UUID REFERENCES user_profile(id),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- E-signatures
CREATE TABLE signature (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES application(id) ON DELETE CASCADE,
  signer_id UUID NOT NULL REFERENCES guardian(id),
  signature_type TEXT NOT NULL,
  signature_data TEXT,
  ip_address INET,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Verification checklist items
CREATE TABLE verification_item (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES application(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT true,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  verified_by UUID REFERENCES user_profile(id),
  verified_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

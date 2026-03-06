-- Migration 007: Capacity & Enrollment Tables

-- Capacity plans (seats per campus/grade/year)
CREATE TABLE capacity_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID NOT NULL REFERENCES campus(id),
  grade_level_id UUID NOT NULL REFERENCES grade_level(id),
  school_year_id UUID NOT NULL REFERENCES school_year(id),
  total_seats INTEGER NOT NULL DEFAULT 0,
  seats_offered INTEGER NOT NULL DEFAULT 0,
  seats_accepted INTEGER NOT NULL DEFAULT 0,
  seats_registered INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campus_id, grade_level_id, school_year_id),
  CONSTRAINT seats_offered_check CHECK (seats_offered >= 0),
  CONSTRAINT seats_accepted_check CHECK (seats_accepted >= 0),
  CONSTRAINT seats_registered_check CHECK (seats_registered >= 0)
);

-- Final enrollment records
CREATE TABLE enrollment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES student(id),
  campus_id UUID NOT NULL REFERENCES campus(id),
  grade_level_id UUID NOT NULL REFERENCES grade_level(id),
  school_year_id UUID NOT NULL REFERENCES school_year(id),
  acceptance_id UUID REFERENCES acceptance(id),
  application_id UUID REFERENCES application(id),
  status enrollment_status NOT NULL DEFAULT 'pending',
  enrolled_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  withdrawal_reason TEXT,
  sis_student_id TEXT,
  sis_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

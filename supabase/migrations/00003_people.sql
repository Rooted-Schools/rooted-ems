-- Migration 003: People Tables
-- UserProfile, UserCampusRole, Household, Guardian, Student, GuardianStudent

-- User profile (linked to Supabase auth.users)
CREATE TABLE user_profile (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  phone TEXT,
  first_name TEXT,
  last_name TEXT,
  preferred_language VARCHAR(10) DEFAULT 'en',
  avatar_url TEXT,
  is_staff BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Staff role assignments (campus-scoped)
CREATE TABLE user_campus_role (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  campus_id UUID NOT NULL REFERENCES campus(id),
  role staff_role NOT NULL,
  assigned_by UUID REFERENCES user_profile(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, campus_id, role)
);

-- Household (family unit)
CREATE TABLE household (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES user_profile(id),
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state CHAR(2),
  zip VARCHAR(10),
  primary_language VARCHAR(50) DEFAULT 'English',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Guardian (parent/caregiver)
CREATE TABLE guardian (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES household(id),
  user_id UUID REFERENCES user_profile(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  relationship guardian_relationship NOT NULL,
  email TEXT,
  phone TEXT,
  phone_secondary TEXT,
  employer TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  is_emergency_contact BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Student
CREATE TABLE student (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES household(id),
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  suffix TEXT,
  date_of_birth DATE,
  gender TEXT,
  race_ethnicity TEXT[],
  primary_language VARCHAR(50),
  home_language VARCHAR(50),
  birth_country VARCHAR(100),
  previous_school_name TEXT,
  previous_school_address TEXT,
  previous_school_dates TEXT,
  has_iep BOOLEAN DEFAULT false,
  has_504 BOOLEAN DEFAULT false,
  special_services_notes TEXT,
  medical_allergies TEXT,
  medical_medications TEXT,
  medical_conditions TEXT,
  emergency_contact_1_name TEXT,
  emergency_contact_1_phone TEXT,
  emergency_contact_1_relationship TEXT,
  emergency_contact_2_name TEXT,
  emergency_contact_2_phone TEXT,
  emergency_contact_2_relationship TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Guardian-Student relationship (many-to-many)
CREATE TABLE guardian_student (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  guardian_id UUID NOT NULL REFERENCES guardian(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  relationship guardian_relationship NOT NULL,
  is_legal_guardian BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (guardian_id, student_id)
);

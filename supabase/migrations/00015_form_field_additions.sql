-- Migration 015: Application Form Field Additions
-- Adds missing columns identified in PRD audit:
--   student.preferred_name
--   guardian.occupation, guardian.preferred_contact_method, guardian.preferred_language

-- Student: Preferred/nickname
ALTER TABLE student ADD COLUMN IF NOT EXISTS preferred_name TEXT;

-- Guardian: Occupation
ALTER TABLE guardian ADD COLUMN IF NOT EXISTS occupation TEXT;

-- Guardian: Preferred contact method (email, phone, text)
ALTER TABLE guardian ADD COLUMN IF NOT EXISTS preferred_contact_method TEXT
  CHECK (preferred_contact_method IS NULL OR preferred_contact_method IN ('email', 'phone', 'text'));

-- Guardian: Preferred language for communications
ALTER TABLE guardian ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(50) DEFAULT 'English';

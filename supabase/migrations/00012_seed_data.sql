-- Migration 012: Seed Data
-- Populates the database with demo data for all three campuses.
-- Idempotent: uses ON CONFLICT DO NOTHING and subqueries for existing users.

-- ============================================
-- ORGANIZATION & REGIONS
-- ============================================

INSERT INTO organization (id, name, legal_name, ein, website)
VALUES (
  '11111111-0000-0000-0000-000000000001',
  'Rooted School Foundation',
  'Rooted School Foundation Inc.',
  '84-3456789',
  'https://rootedschool.org'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO region (id, organization_id, name, state_code) VALUES
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Pacific Northwest', 'WA'),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'Southeast', 'SC'),
  ('22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', 'Midwest', 'OH')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- CAMPUSES
-- ============================================

INSERT INTO campus (id, organization_id, region_id, name, short_code, address_line1, city, state, zip, phone, email, timezone) VALUES
  (
    '33333333-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000001',
    '22222222-0000-0000-0000-000000000001',
    'Rooted School Vancouver',
    'RSV',
    '5700 E 18th St',
    'Vancouver', 'WA', '98661',
    '(360) 555-0100',
    'vancouver@rootedschool.org',
    'America/Los_Angeles'
  ),
  (
    '33333333-0000-0000-0000-000000000002',
    '11111111-0000-0000-0000-000000000001',
    '22222222-0000-0000-0000-000000000002',
    'C.R. Neal Academy',
    'CRN',
    '1225 Laurel St',
    'Columbia', 'SC', '29201',
    '(803) 555-0200',
    'columbia@rootedschool.org',
    'America/New_York'
  ),
  (
    '33333333-0000-0000-0000-000000000003',
    '11111111-0000-0000-0000-000000000001',
    '22222222-0000-0000-0000-000000000003',
    'Rooted Schools Cleveland',
    'RSC',
    '3100 Chester Ave',
    'Cleveland', 'OH', '44114',
    '(216) 555-0300',
    'cleveland@rootedschool.org',
    'America/New_York'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- SCHOOL YEARS
-- ============================================

INSERT INTO school_year (id, organization_id, name, start_date, end_date, is_current) VALUES
  (
    '44444444-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000001',
    '2025-26',
    '2025-08-18',
    '2026-06-05',
    false
  ),
  (
    '44444444-0000-0000-0000-000000000002',
    '11111111-0000-0000-0000-000000000001',
    '2026-27',
    '2026-08-17',
    '2027-06-04',
    true
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- GRADE LEVELS (for 2026-27, all 3 campuses, grades 6-12)
-- ============================================

INSERT INTO grade_level (id, campus_id, school_year_id, grade) VALUES
  -- Vancouver
  ('55555555-0001-0000-0000-000000000006', '33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', '6'),
  ('55555555-0001-0000-0000-000000000007', '33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', '7'),
  ('55555555-0001-0000-0000-000000000008', '33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', '8'),
  ('55555555-0001-0000-0000-000000000009', '33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', '9'),
  ('55555555-0001-0000-0000-000000000010', '33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', '10'),
  ('55555555-0001-0000-0000-000000000011', '33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', '11'),
  ('55555555-0001-0000-0000-000000000012', '33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', '12'),
  -- Columbia
  ('55555555-0002-0000-0000-000000000006', '33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', '6'),
  ('55555555-0002-0000-0000-000000000007', '33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', '7'),
  ('55555555-0002-0000-0000-000000000008', '33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', '8'),
  ('55555555-0002-0000-0000-000000000009', '33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', '9'),
  ('55555555-0002-0000-0000-000000000010', '33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', '10'),
  ('55555555-0002-0000-0000-000000000011', '33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', '11'),
  ('55555555-0002-0000-0000-000000000012', '33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', '12'),
  -- Cleveland
  ('55555555-0003-0000-0000-000000000006', '33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', '6'),
  ('55555555-0003-0000-0000-000000000007', '33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', '7'),
  ('55555555-0003-0000-0000-000000000008', '33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', '8'),
  ('55555555-0003-0000-0000-000000000009', '33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', '9'),
  ('55555555-0003-0000-0000-000000000010', '33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', '10'),
  ('55555555-0003-0000-0000-000000000011', '33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', '11'),
  ('55555555-0003-0000-0000-000000000012', '33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', '12')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- ENROLLMENT WINDOWS (2026-27 Open Enrollment)
-- ============================================

INSERT INTO enrollment_window (id, campus_id, school_year_id, name, status, open_date, close_date, description) VALUES
  (
    '66666666-0000-0000-0000-000000000001',
    '33333333-0000-0000-0000-000000000001',
    '44444444-0000-0000-0000-000000000002',
    '2026-27 Open Enrollment — Vancouver',
    'open',
    '2026-01-15T00:00:00Z',
    '2026-04-30T23:59:59Z',
    'Open enrollment for the 2026-27 school year at Rooted School Vancouver.'
  ),
  (
    '66666666-0000-0000-0000-000000000002',
    '33333333-0000-0000-0000-000000000002',
    '44444444-0000-0000-0000-000000000002',
    '2026-27 Open Enrollment — Columbia',
    'open',
    '2026-01-15T00:00:00Z',
    '2026-04-30T23:59:59Z',
    'Open enrollment for the 2026-27 school year at C.R. Neal Academy.'
  ),
  (
    '66666666-0000-0000-0000-000000000003',
    '33333333-0000-0000-0000-000000000003',
    '44444444-0000-0000-0000-000000000002',
    '2026-27 Open Enrollment — Cleveland',
    'open',
    '2026-02-01T00:00:00Z',
    '2026-05-15T23:59:59Z',
    'Open enrollment for the 2026-27 school year at Rooted Schools Cleveland.'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- CAPACITY PLANS (2026-27)
-- ============================================

INSERT INTO capacity_plan (id, campus_id, grade_level_id, school_year_id, total_seats, seats_offered, seats_accepted, seats_registered) VALUES
  -- Vancouver: 30 seats per grade
  ('77777777-0001-0000-0000-000000000006', '33333333-0000-0000-0000-000000000001', '55555555-0001-0000-0000-000000000006', '44444444-0000-0000-0000-000000000002', 30, 8, 5, 3),
  ('77777777-0001-0000-0000-000000000009', '33333333-0000-0000-0000-000000000001', '55555555-0001-0000-0000-000000000009', '44444444-0000-0000-0000-000000000002', 30, 12, 8, 6),
  -- Columbia: 40 seats per grade
  ('77777777-0002-0000-0000-000000000006', '33333333-0000-0000-0000-000000000002', '55555555-0002-0000-0000-000000000006', '44444444-0000-0000-0000-000000000002', 40, 15, 10, 7),
  ('77777777-0002-0000-0000-000000000009', '33333333-0000-0000-0000-000000000002', '55555555-0002-0000-0000-000000000009', '44444444-0000-0000-0000-000000000002', 40, 20, 14, 10),
  -- Cleveland: 25 seats per grade
  ('77777777-0003-0000-0000-000000000006', '33333333-0000-0000-0000-000000000003', '55555555-0003-0000-0000-000000000006', '44444444-0000-0000-0000-000000000002', 25, 5, 3, 1),
  ('77777777-0003-0000-0000-000000000009', '33333333-0000-0000-0000-000000000003', '55555555-0003-0000-0000-000000000009', '44444444-0000-0000-0000-000000000002', 25, 8, 5, 3)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- DEMO AUTH USERS + PROFILES
-- We do NOT insert scarney@rootedschool.org into auth.users because
-- that user already exists (real Google OAuth login). We look up
-- the real UUID with a subquery wherever it's needed.
-- Other demo users are inserted with WHERE NOT EXISTS for safety.
-- ============================================

-- Demo staff user: Jane Smith
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, role, aud, created_at, updated_at, instance_id, raw_app_meta_data, raw_user_meta_data)
SELECT 'aaaaaaaa-0000-0000-0000-000000000002', 'jsmith@rootedschool.org', '$2a$10$SEED_DATA_PLACEHOLDER', NOW(), 'authenticated', 'authenticated', NOW(), NOW(), '00000000-0000-0000-0000-000000000000', '{"provider":"google","providers":["google"]}'::jsonb, '{"full_name":"Jane Smith"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'jsmith@rootedschool.org');

-- Demo family users
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, role, aud, created_at, updated_at, instance_id, raw_app_meta_data, raw_user_meta_data)
SELECT 'bbbbbbbb-0000-0000-0000-000000000001', 'maria.johnson@example.com', '$2a$10$SEED_DATA_PLACEHOLDER', NOW(), 'authenticated', 'authenticated', NOW(), NOW(), '00000000-0000-0000-0000-000000000000', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Maria Johnson"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'maria.johnson@example.com');

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, role, aud, created_at, updated_at, instance_id, raw_app_meta_data, raw_user_meta_data)
SELECT 'bbbbbbbb-0000-0000-0000-000000000002', 'david.williams@example.com', '$2a$10$SEED_DATA_PLACEHOLDER', NOW(), 'authenticated', 'authenticated', NOW(), NOW(), '00000000-0000-0000-0000-000000000000', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"David Williams"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'david.williams@example.com');

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, role, aud, created_at, updated_at, instance_id, raw_app_meta_data, raw_user_meta_data)
SELECT 'bbbbbbbb-0000-0000-0000-000000000003', 'ana.garcia@example.com', '$2a$10$SEED_DATA_PLACEHOLDER', NOW(), 'authenticated', 'authenticated', NOW(), NOW(), '00000000-0000-0000-0000-000000000000', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Ana Garcia"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'ana.garcia@example.com');

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, role, aud, created_at, updated_at, instance_id, raw_app_meta_data, raw_user_meta_data)
SELECT 'bbbbbbbb-0000-0000-0000-000000000004', 'keisha.brown@example.com', '$2a$10$SEED_DATA_PLACEHOLDER', NOW(), 'authenticated', 'authenticated', NOW(), NOW(), '00000000-0000-0000-0000-000000000000', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Keisha Brown"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'keisha.brown@example.com');

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, role, aud, created_at, updated_at, instance_id, raw_app_meta_data, raw_user_meta_data)
SELECT 'bbbbbbbb-0000-0000-0000-000000000005', 'robert.chen@example.com', '$2a$10$SEED_DATA_PLACEHOLDER', NOW(), 'authenticated', 'authenticated', NOW(), NOW(), '00000000-0000-0000-0000-000000000000', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Robert Chen"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'robert.chen@example.com');

-- User profiles (scarney uses subquery for real UUID)
INSERT INTO user_profile (id, email, first_name, last_name, is_staff)
SELECT id, 'scarney@rootedschool.org', 'Steven', 'Carney', true
FROM auth.users WHERE email = 'scarney@rootedschool.org'
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_profile (id, email, first_name, last_name, is_staff) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000002', 'jsmith@rootedschool.org', 'Jane', 'Smith', true),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'maria.johnson@example.com', 'Maria', 'Johnson', false),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'david.williams@example.com', 'David', 'Williams', false),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'ana.garcia@example.com', 'Ana', 'Garcia', false),
  ('bbbbbbbb-0000-0000-0000-000000000004', 'keisha.brown@example.com', 'Keisha', 'Brown', false),
  ('bbbbbbbb-0000-0000-0000-000000000005', 'robert.chen@example.com', 'Robert', 'Chen', false)
ON CONFLICT (id) DO NOTHING;

-- Staff campus roles (scarney = system_admin at all 3 campuses)
INSERT INTO user_campus_role (id, user_id, campus_id, role)
SELECT 'cccccccc-0000-0000-0000-000000000001', id, '33333333-0000-0000-0000-000000000001', 'system_admin'
FROM auth.users WHERE email = 'scarney@rootedschool.org'
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_campus_role (id, user_id, campus_id, role)
SELECT 'cccccccc-0000-0000-0000-000000000002', id, '33333333-0000-0000-0000-000000000002', 'system_admin'
FROM auth.users WHERE email = 'scarney@rootedschool.org'
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_campus_role (id, user_id, campus_id, role)
SELECT 'cccccccc-0000-0000-0000-000000000003', id, '33333333-0000-0000-0000-000000000003', 'system_admin'
FROM auth.users WHERE email = 'scarney@rootedschool.org'
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_campus_role (id, user_id, campus_id, role) VALUES
  ('cccccccc-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000001', 'enrollment_manager'),
  ('cccccccc-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000002', 'enrollment_staff')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- HOUSEHOLDS, GUARDIANS, STUDENTS
-- ============================================

-- Household 1: Johnson family (Vancouver)
INSERT INTO household (id, user_id, address_line1, city, state, zip, primary_language) VALUES
  ('dddddddd-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', '1234 Oak St', 'Vancouver', 'WA', '98660', 'English')
ON CONFLICT (id) DO NOTHING;

INSERT INTO guardian (id, household_id, user_id, first_name, last_name, relationship, email, phone, is_primary, is_emergency_contact) VALUES
  ('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Maria', 'Johnson', 'mother', 'maria.johnson@example.com', '(360) 555-1234', true, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO student (id, household_id, first_name, last_name, date_of_birth, gender, race_ethnicity, primary_language, previous_school_name) VALUES
  ('ffffffff-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'Marcus', 'Johnson', '2014-05-15', 'Male', ARRAY['Black or African American'], 'English', 'Cedar Park Elementary'),
  ('ffffffff-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000001', 'Ava', 'Johnson', '2016-09-22', 'Female', ARRAY['Black or African American'], 'English', 'Cedar Park Elementary')
ON CONFLICT (id) DO NOTHING;

INSERT INTO guardian_student (guardian_id, student_id, relationship, is_legal_guardian) VALUES
  ('eeeeeeee-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001', 'mother', true),
  ('eeeeeeee-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000002', 'mother', true)
ON CONFLICT DO NOTHING;

-- Household 2: Williams family (Columbia)
INSERT INTO household (id, user_id, address_line1, city, state, zip, primary_language) VALUES
  ('dddddddd-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', '567 Magnolia Dr', 'Columbia', 'SC', '29201', 'English')
ON CONFLICT (id) DO NOTHING;

INSERT INTO guardian (id, household_id, user_id, first_name, last_name, relationship, email, phone, is_primary, is_emergency_contact) VALUES
  ('eeeeeeee-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'David', 'Williams', 'father', 'david.williams@example.com', '(803) 555-5678', true, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO student (id, household_id, first_name, last_name, date_of_birth, gender, race_ethnicity, primary_language, previous_school_name) VALUES
  ('ffffffff-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000002', 'Devon', 'Williams', '2012-01-30', 'Male', ARRAY['Black or African American', 'White'], 'English', 'Richland Middle School')
ON CONFLICT (id) DO NOTHING;

INSERT INTO guardian_student (guardian_id, student_id, relationship, is_legal_guardian) VALUES
  ('eeeeeeee-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000003', 'father', true)
ON CONFLICT DO NOTHING;

-- Household 3: Garcia family (Vancouver)
INSERT INTO household (id, user_id, address_line1, city, state, zip, primary_language) VALUES
  ('dddddddd-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000003', '890 Pine Ave', 'Vancouver', 'WA', '98661', 'Spanish')
ON CONFLICT (id) DO NOTHING;

INSERT INTO guardian (id, household_id, user_id, first_name, last_name, relationship, email, phone, is_primary, is_emergency_contact) VALUES
  ('eeeeeeee-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000003', 'Ana', 'Garcia', 'mother', 'ana.garcia@example.com', '(360) 555-8901', true, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO student (id, household_id, first_name, last_name, date_of_birth, gender, race_ethnicity, primary_language, previous_school_name) VALUES
  ('ffffffff-0000-0000-0000-000000000004', 'dddddddd-0000-0000-0000-000000000003', 'Sofia', 'Garcia', '2014-11-08', 'Female', ARRAY['Hispanic or Latino'], 'Spanish', 'Mill Plain Elementary')
ON CONFLICT (id) DO NOTHING;

INSERT INTO guardian_student (guardian_id, student_id, relationship, is_legal_guardian) VALUES
  ('eeeeeeee-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000004', 'mother', true)
ON CONFLICT DO NOTHING;

-- Household 4: Brown family (Columbia)
INSERT INTO household (id, user_id, address_line1, city, state, zip, primary_language) VALUES
  ('dddddddd-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000004', '345 Elm Ct', 'Columbia', 'SC', '29203', 'English')
ON CONFLICT (id) DO NOTHING;

INSERT INTO guardian (id, household_id, user_id, first_name, last_name, relationship, email, phone, is_primary, is_emergency_contact) VALUES
  ('eeeeeeee-0000-0000-0000-000000000004', 'dddddddd-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000004', 'Keisha', 'Brown', 'mother', 'keisha.brown@example.com', '(803) 555-3456', true, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO student (id, household_id, first_name, last_name, date_of_birth, gender, race_ethnicity, primary_language, previous_school_name) VALUES
  ('ffffffff-0000-0000-0000-000000000005', 'dddddddd-0000-0000-0000-000000000004', 'Aisha', 'Brown', '2013-03-17', 'Female', ARRAY['Black or African American'], 'English', 'Lower Richland Middle')
ON CONFLICT (id) DO NOTHING;

INSERT INTO guardian_student (guardian_id, student_id, relationship, is_legal_guardian) VALUES
  ('eeeeeeee-0000-0000-0000-000000000004', 'ffffffff-0000-0000-0000-000000000005', 'mother', true)
ON CONFLICT DO NOTHING;

-- Household 5: Chen family (Cleveland)
INSERT INTO household (id, user_id, address_line1, city, state, zip, primary_language) VALUES
  ('dddddddd-0000-0000-0000-000000000005', 'bbbbbbbb-0000-0000-0000-000000000005', '678 Lake Dr', 'Cleveland', 'OH', '44114', 'Mandarin')
ON CONFLICT (id) DO NOTHING;

INSERT INTO guardian (id, household_id, user_id, first_name, last_name, relationship, email, phone, is_primary, is_emergency_contact) VALUES
  ('eeeeeeee-0000-0000-0000-000000000005', 'dddddddd-0000-0000-0000-000000000005', 'bbbbbbbb-0000-0000-0000-000000000005', 'Robert', 'Chen', 'father', 'robert.chen@example.com', '(216) 555-6789', true, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO student (id, household_id, first_name, last_name, date_of_birth, gender, race_ethnicity, primary_language, previous_school_name) VALUES
  ('ffffffff-0000-0000-0000-000000000006', 'dddddddd-0000-0000-0000-000000000005', 'Tyler', 'Chen', '2014-07-03', 'Male', ARRAY['Asian'], 'Mandarin', 'Franklin Elementary'),
  ('ffffffff-0000-0000-0000-000000000007', 'dddddddd-0000-0000-0000-000000000005', 'Maya', 'Chen', '2012-12-20', 'Female', ARRAY['Asian'], 'Mandarin', 'Carl B. Stokes School')
ON CONFLICT (id) DO NOTHING;

INSERT INTO guardian_student (guardian_id, student_id, relationship, is_legal_guardian) VALUES
  ('eeeeeeee-0000-0000-0000-000000000005', 'ffffffff-0000-0000-0000-000000000006', 'father', true),
  ('eeeeeeee-0000-0000-0000-000000000005', 'ffffffff-0000-0000-0000-000000000007', 'father', true)
ON CONFLICT DO NOTHING;

-- ============================================
-- APPLICATIONS (across pipeline stages)
-- All reviewed_by/offered_by fields that reference scarney use a subquery.
-- ============================================

-- App 1: Marcus Johnson -> Vancouver Grade 6 -> SUBMITTED
INSERT INTO application (id, enrollment_window_id, student_id, campus_id, grade_level_id, guardian_id, status, submitted_at, created_at, updated_at) VALUES
  ('aaa11111-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', '55555555-0001-0000-0000-000000000006', 'eeeeeeee-0000-0000-0000-000000000001', 'submitted', '2026-02-10T14:30:00Z', '2026-02-08T10:00:00Z', '2026-02-10T14:30:00Z')
ON CONFLICT (id) DO NOTHING;

-- App 2: Ava Johnson -> Vancouver Grade 6 -> DRAFT
INSERT INTO application (id, enrollment_window_id, student_id, campus_id, grade_level_id, guardian_id, status, created_at, updated_at) VALUES
  ('aaa11111-0000-0000-0000-000000000002', '66666666-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000001', '55555555-0001-0000-0000-000000000006', 'eeeeeeee-0000-0000-0000-000000000001', 'draft', '2026-02-28T09:00:00Z', '2026-03-01T11:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- App 3: Devon Williams -> Columbia Grade 9 -> VERIFIED (reviewed by Jane Smith)
INSERT INTO application (id, enrollment_window_id, student_id, campus_id, grade_level_id, guardian_id, status, submitted_at, reviewed_by, reviewed_at, created_at, updated_at) VALUES
  ('aaa11111-0000-0000-0000-000000000003', '66666666-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000002', '55555555-0002-0000-0000-000000000009', 'eeeeeeee-0000-0000-0000-000000000002', 'verified', '2026-02-01T08:00:00Z', 'aaaaaaaa-0000-0000-0000-000000000002', '2026-02-05T16:00:00Z', '2026-01-28T12:00:00Z', '2026-02-05T16:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- App 4: Sofia Garcia -> Vancouver Grade 6 -> OFFERED (reviewed by scarney)
INSERT INTO application (id, enrollment_window_id, student_id, campus_id, grade_level_id, guardian_id, status, submitted_at, reviewed_by, reviewed_at, created_at, updated_at)
SELECT 'aaa11111-0000-0000-0000-000000000004', '66666666-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000001', '55555555-0001-0000-0000-000000000006', 'eeeeeeee-0000-0000-0000-000000000003', 'offered', '2026-01-20T10:00:00Z', u.id, '2026-01-25T14:00:00Z', '2026-01-18T09:00:00Z', '2026-03-01T10:00:00Z'
FROM auth.users u WHERE u.email = 'scarney@rootedschool.org'
ON CONFLICT (id) DO NOTHING;

-- App 5: Aisha Brown -> Columbia Grade 8 -> ACCEPTED (reviewed by Jane Smith)
INSERT INTO application (id, enrollment_window_id, student_id, campus_id, grade_level_id, guardian_id, status, submitted_at, reviewed_by, reviewed_at, created_at, updated_at) VALUES
  ('aaa11111-0000-0000-0000-000000000005', '66666666-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000005', '33333333-0000-0000-0000-000000000002', '55555555-0002-0000-0000-000000000008', 'eeeeeeee-0000-0000-0000-000000000004', 'accepted', '2026-01-18T11:00:00Z', 'aaaaaaaa-0000-0000-0000-000000000002', '2026-01-22T15:00:00Z', '2026-01-16T08:00:00Z', '2026-02-20T09:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- App 6: Tyler Chen -> Cleveland Grade 6 -> NEEDS_INFO
INSERT INTO application (id, enrollment_window_id, student_id, campus_id, grade_level_id, guardian_id, status, submitted_at, created_at, updated_at) VALUES
  ('aaa11111-0000-0000-0000-000000000006', '66666666-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000006', '33333333-0000-0000-0000-000000000003', '55555555-0003-0000-0000-000000000006', 'eeeeeeee-0000-0000-0000-000000000005', 'needs_info', '2026-02-15T13:00:00Z', '2026-02-12T10:00:00Z', '2026-02-20T11:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- App 7: Maya Chen -> Cleveland Grade 9 -> REGISTERED (reviewed by scarney)
INSERT INTO application (id, enrollment_window_id, student_id, campus_id, grade_level_id, guardian_id, status, submitted_at, reviewed_by, reviewed_at, created_at, updated_at)
SELECT 'aaa11111-0000-0000-0000-000000000007', '66666666-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000007', '33333333-0000-0000-0000-000000000003', '55555555-0003-0000-0000-000000000009', 'eeeeeeee-0000-0000-0000-000000000005', 'registered', '2026-01-10T09:00:00Z', u.id, '2026-01-15T14:00:00Z', '2026-01-08T08:00:00Z', '2026-03-01T10:00:00Z'
FROM auth.users u WHERE u.email = 'scarney@rootedschool.org'
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- APPLICATION STATUS HISTORY
-- ============================================

-- Marcus: draft -> submitted
INSERT INTO application_status_history (application_id, from_status, to_status, changed_by, reason, created_at) VALUES
  ('aaa11111-0000-0000-0000-000000000001', 'draft', 'submitted', 'bbbbbbbb-0000-0000-0000-000000000001', NULL, '2026-02-10T14:30:00Z');

-- Devon: draft -> submitted -> verified
INSERT INTO application_status_history (application_id, from_status, to_status, changed_by, reason, created_at) VALUES
  ('aaa11111-0000-0000-0000-000000000003', 'draft', 'submitted', 'bbbbbbbb-0000-0000-0000-000000000002', NULL, '2026-02-01T08:00:00Z'),
  ('aaa11111-0000-0000-0000-000000000003', 'submitted', 'verified', 'aaaaaaaa-0000-0000-0000-000000000002', 'All documents verified.', '2026-02-05T16:00:00Z');

-- Sofia: draft -> submitted -> verified -> offered (scarney reviewed)
INSERT INTO application_status_history (application_id, from_status, to_status, changed_by, reason, created_at) VALUES
  ('aaa11111-0000-0000-0000-000000000004', 'draft', 'submitted', 'bbbbbbbb-0000-0000-0000-000000000003', NULL, '2026-01-20T10:00:00Z');

INSERT INTO application_status_history (application_id, from_status, to_status, changed_by, reason, created_at)
SELECT 'aaa11111-0000-0000-0000-000000000004', 'submitted', 'verified', u.id, 'Verified.', '2026-01-25T14:00:00Z'
FROM auth.users u WHERE u.email = 'scarney@rootedschool.org';

INSERT INTO application_status_history (application_id, from_status, to_status, changed_by, reason, created_at)
SELECT 'aaa11111-0000-0000-0000-000000000004', 'verified', 'offered', u.id, 'Seat offered via lottery.', '2026-03-01T10:00:00Z'
FROM auth.users u WHERE u.email = 'scarney@rootedschool.org';

-- Aisha: draft -> submitted -> verified -> offered -> accepted
INSERT INTO application_status_history (application_id, from_status, to_status, changed_by, reason, created_at) VALUES
  ('aaa11111-0000-0000-0000-000000000005', 'draft', 'submitted', 'bbbbbbbb-0000-0000-0000-000000000004', NULL, '2026-01-18T11:00:00Z'),
  ('aaa11111-0000-0000-0000-000000000005', 'submitted', 'verified', 'aaaaaaaa-0000-0000-0000-000000000002', 'All docs verified.', '2026-01-22T15:00:00Z'),
  ('aaa11111-0000-0000-0000-000000000005', 'verified', 'offered', 'aaaaaaaa-0000-0000-0000-000000000002', 'Seat offered.', '2026-02-10T09:00:00Z'),
  ('aaa11111-0000-0000-0000-000000000005', 'offered', 'accepted', 'bbbbbbbb-0000-0000-0000-000000000004', 'Offer accepted by guardian.', '2026-02-20T09:00:00Z');

-- Tyler: draft -> submitted -> needs_info (scarney flagged)
INSERT INTO application_status_history (application_id, from_status, to_status, changed_by, reason, created_at) VALUES
  ('aaa11111-0000-0000-0000-000000000006', 'draft', 'submitted', 'bbbbbbbb-0000-0000-0000-000000000005', NULL, '2026-02-15T13:00:00Z');

INSERT INTO application_status_history (application_id, from_status, to_status, changed_by, reason, created_at)
SELECT 'aaa11111-0000-0000-0000-000000000006', 'submitted', 'needs_info', u.id, 'Missing immunization records.', '2026-02-20T11:00:00Z'
FROM auth.users u WHERE u.email = 'scarney@rootedschool.org';

-- Maya: full pipeline (scarney reviewed)
INSERT INTO application_status_history (application_id, from_status, to_status, changed_by, reason, created_at) VALUES
  ('aaa11111-0000-0000-0000-000000000007', 'draft', 'submitted', 'bbbbbbbb-0000-0000-0000-000000000005', NULL, '2026-01-10T09:00:00Z');

INSERT INTO application_status_history (application_id, from_status, to_status, changed_by, reason, created_at)
SELECT 'aaa11111-0000-0000-0000-000000000007', 'submitted', 'verified', u.id, 'Verified.', '2026-01-15T14:00:00Z'
FROM auth.users u WHERE u.email = 'scarney@rootedschool.org';

INSERT INTO application_status_history (application_id, from_status, to_status, changed_by, reason, created_at)
SELECT 'aaa11111-0000-0000-0000-000000000007', 'verified', 'offered', u.id, 'Seat offered.', '2026-02-01T10:00:00Z'
FROM auth.users u WHERE u.email = 'scarney@rootedschool.org';

INSERT INTO application_status_history (application_id, from_status, to_status, changed_by, reason, created_at) VALUES
  ('aaa11111-0000-0000-0000-000000000007', 'offered', 'accepted', 'bbbbbbbb-0000-0000-0000-000000000005', 'Accepted.', '2026-02-10T09:00:00Z');

INSERT INTO application_status_history (application_id, from_status, to_status, changed_by, reason, created_at)
SELECT 'aaa11111-0000-0000-0000-000000000007', 'accepted', 'registered', u.id, 'Registration complete.', '2026-03-01T10:00:00Z'
FROM auth.users u WHERE u.email = 'scarney@rootedschool.org';

-- ============================================
-- OFFERS
-- ============================================

-- Offer for Sofia (pending, offered by scarney)
INSERT INTO offer (id, application_id, campus_id, grade_level_id, status, offered_at, expires_at, offered_by)
SELECT '0000ff00-0000-0000-0000-000000000001', 'aaa11111-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000001', '55555555-0001-0000-0000-000000000006', 'pending', '2026-03-01T10:00:00Z', '2026-03-15T23:59:59Z', u.id
FROM auth.users u WHERE u.email = 'scarney@rootedschool.org'
ON CONFLICT (id) DO NOTHING;

-- Offer for Aisha (accepted, offered by Jane Smith)
INSERT INTO offer (id, application_id, campus_id, grade_level_id, status, offered_at, expires_at, responded_at, offered_by) VALUES
  ('0000ff00-0000-0000-0000-000000000002', 'aaa11111-0000-0000-0000-000000000005', '33333333-0000-0000-0000-000000000002', '55555555-0002-0000-0000-000000000008', 'accepted', '2026-02-10T09:00:00Z', '2026-02-24T23:59:59Z', '2026-02-20T09:00:00Z', 'aaaaaaaa-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- Offer for Maya (accepted, offered by scarney)
INSERT INTO offer (id, application_id, campus_id, grade_level_id, status, offered_at, expires_at, responded_at, offered_by)
SELECT '0000ff00-0000-0000-0000-000000000003', 'aaa11111-0000-0000-0000-000000000007', '33333333-0000-0000-0000-000000000003', '55555555-0003-0000-0000-000000000009', 'accepted', '2026-02-01T10:00:00Z', '2026-02-15T23:59:59Z', '2026-02-10T09:00:00Z', u.id
FROM auth.users u WHERE u.email = 'scarney@rootedschool.org'
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- ACCEPTANCES
-- ============================================

INSERT INTO acceptance (id, offer_id, application_id, accepted_by, accepted_at) VALUES
  ('0000ff01-0000-0000-0000-000000000001', '0000ff00-0000-0000-0000-000000000002', 'aaa11111-0000-0000-0000-000000000005', 'eeeeeeee-0000-0000-0000-000000000004', '2026-02-20T09:00:00Z'),
  ('0000ff01-0000-0000-0000-000000000002', '0000ff00-0000-0000-0000-000000000003', 'aaa11111-0000-0000-0000-000000000007', 'eeeeeeee-0000-0000-0000-000000000005', '2026-02-10T09:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- ENROLLMENT (Maya Chen — fully registered)
-- ============================================

INSERT INTO enrollment (id, student_id, campus_id, grade_level_id, school_year_id, acceptance_id, application_id, status, enrolled_at, sis_student_id, sis_synced_at) VALUES
  ('0000ff02-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000007', '33333333-0000-0000-0000-000000000003', '55555555-0003-0000-0000-000000000009', '44444444-0000-0000-0000-000000000002', '0000ff01-0000-0000-0000-000000000002', 'aaa11111-0000-0000-0000-000000000007', 'active', '2026-03-01T10:00:00Z', 'RSF-2026-0001', '2026-03-02T08:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- DOCUMENTS
-- ============================================

INSERT INTO document (id, application_id, student_id, document_type, file_name, file_size, mime_type, storage_path, status, created_at) VALUES
  ('dddddd00-0000-0000-0000-000000000001', 'aaa11111-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001', 'proof_of_age', 'birth_certificate_marcus.pdf', 1258291, 'application/pdf', 'documents/birth_certificate_marcus.pdf', 'verified', '2026-02-08T10:30:00Z'),
  ('dddddd00-0000-0000-0000-000000000002', 'aaa11111-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001', 'immunization', 'immunization_marcus.pdf', 845000, 'application/pdf', 'documents/immunization_marcus.pdf', 'verified', '2026-02-08T10:35:00Z'),
  ('dddddd00-0000-0000-0000-000000000003', 'aaa11111-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001', 'residency', 'utility_bill_johnson.pdf', 2100000, 'application/pdf', 'documents/utility_bill_johnson.pdf', 'pending', '2026-02-10T14:00:00Z'),
  ('dddddd00-0000-0000-0000-000000000004', 'aaa11111-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000003', 'proof_of_age', 'birth_certificate_devon.pdf', 1340000, 'application/pdf', 'documents/birth_certificate_devon.pdf', 'verified', '2026-01-29T09:00:00Z'),
  ('dddddd00-0000-0000-0000-000000000005', 'aaa11111-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000003', 'immunization', 'immunization_devon.pdf', 920000, 'application/pdf', 'documents/immunization_devon.pdf', 'verified', '2026-01-29T09:05:00Z')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- NOTIFICATIONS (for demo families)
-- ============================================

INSERT INTO notification (id, user_id, title, body, link, is_read, created_at) VALUES
  ('0000ff03-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Application Received — Marcus Johnson', 'Thank you for submitting your enrollment application for Marcus Johnson. Our team will review it shortly.', '/family/applications/aaa11111-0000-0000-0000-000000000001', true, '2026-02-10T14:31:00Z'),
  ('0000ff03-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', 'Document Verified: Birth Certificate', 'The birth certificate uploaded for Marcus Johnson has been verified.', '/family/documents', true, '2026-02-12T10:00:00Z'),
  ('0000ff03-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000001', 'Reminder: Complete Ava''s Application', 'You have a draft application for Ava Johnson that has not been submitted. The enrollment window closes Apr 30, 2026.', '/family/applications/aaa11111-0000-0000-0000-000000000002', false, '2026-03-02T09:00:00Z'),
  ('0000ff03-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000003', 'Seat Offered — Sofia Garcia', 'Congratulations! A seat has been offered to Sofia Garcia at Rooted School Vancouver for Grade 6. Please respond before Mar 15, 2026.', '/family/applications/aaa11111-0000-0000-0000-000000000004', false, '2026-03-01T10:05:00Z'),
  ('0000ff03-0000-0000-0000-000000000005', 'bbbbbbbb-0000-0000-0000-000000000005', 'Missing Documents — Tyler Chen', 'Additional immunization records are needed for Tyler Chen''s application. Please upload the missing documents.', '/family/applications/aaa11111-0000-0000-0000-000000000006', false, '2026-02-20T11:05:00Z'),
  ('0000ff03-0000-0000-0000-000000000006', 'bbbbbbbb-0000-0000-0000-000000000005', 'Enrollment Complete — Maya Chen', 'Maya Chen is now fully enrolled at Rooted Schools Cleveland for Grade 9. Welcome to the Rooted School family!', '/family/applications/aaa11111-0000-0000-0000-000000000007', true, '2026-03-01T10:30:00Z'),
  ('0000ff03-0000-0000-0000-000000000007', 'bbbbbbbb-0000-0000-0000-000000000004', 'Offer Accepted — Aisha Brown', 'You have accepted the enrollment offer for Aisha Brown at C.R. Neal Academy. Next steps: complete the registration packet.', '/family/applications/aaa11111-0000-0000-0000-000000000005', true, '2026-02-20T09:05:00Z')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- NOTES (staff notes on applications)
-- ============================================

INSERT INTO note (id, entity_type, entity_id, campus_id, content, is_internal, created_by, created_at)
SELECT '0000ff04-0000-0000-0000-000000000001', 'application', 'aaa11111-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', 'Good application. Birth certificate and immunization records look complete. Waiting on proof of residency verification.', true, u.id, '2026-02-11T09:00:00Z'
FROM auth.users u WHERE u.email = 'scarney@rootedschool.org'
ON CONFLICT (id) DO NOTHING;

INSERT INTO note (id, entity_type, entity_id, campus_id, content, is_internal, created_by, created_at) VALUES
  ('0000ff04-0000-0000-0000-000000000002', 'application', 'aaa11111-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000002', 'All documents verified. Strong candidate — sibling interest noted.', true, 'aaaaaaaa-0000-0000-0000-000000000002', '2026-02-05T16:30:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO note (id, entity_type, entity_id, campus_id, content, is_internal, created_by, created_at)
SELECT '0000ff04-0000-0000-0000-000000000003', 'application', 'aaa11111-0000-0000-0000-000000000006', '33333333-0000-0000-0000-000000000003', 'Called family 2/20 — they will upload updated immunization records this week.', true, u.id, '2026-02-20T15:00:00Z'
FROM auth.users u WHERE u.email = 'scarney@rootedschool.org'
ON CONFLICT (id) DO NOTHING;

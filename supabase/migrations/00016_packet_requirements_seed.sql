-- Migration 016: Comprehensive Packet Requirements Seed + Seed Data Repair
-- Ensures essential parent records exist (in case migration 00012 partially failed),
-- then seeds packet_requirement for all 3 campuses for the 2026-27 school year.
-- Master list covers registration requirements across WA, SC, and OH.
-- item_type values also match registration_item.item_type for consistency.

-- ============================================
-- ENSURE PARENT RECORDS EXIST (idempotent)
-- ============================================

-- Organization
INSERT INTO organization (id, name, legal_name, ein, website)
VALUES (
  '11111111-0000-0000-0000-000000000001',
  'Rooted School Foundation',
  'Rooted School Foundation Inc.',
  '84-3456789',
  'https://rootedschool.org'
) ON CONFLICT (id) DO NOTHING;

-- Regions
INSERT INTO region (id, organization_id, name, state_code) VALUES
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Pacific Northwest', 'WA'),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'Southeast', 'SC'),
  ('22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', 'Midwest', 'OH')
ON CONFLICT (id) DO NOTHING;

-- Campuses
INSERT INTO campus (id, organization_id, region_id, name, short_code, address_line1, city, state, zip, phone, email, timezone) VALUES
  ('33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'Rooted School Vancouver', 'RSV', '5700 E 18th St', 'Vancouver', 'WA', '98661', '(360) 555-0100', 'info@rootedschoolvancouver.org', 'America/Los_Angeles'),
  ('33333333-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'C.R. Neal Academy', 'CRN', '1225 Laurel St', 'Columbia', 'SC', '29201', '(803) 555-0200', 'info@rootedschoolcola.org', 'America/New_York'),
  ('33333333-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000003', 'Rooted Schools Cleveland', 'RSC', '3100 Chester Ave', 'Cleveland', 'OH', '44114', '(216) 555-0300', 'info@rootedschoolcle.org', 'America/New_York')
ON CONFLICT (id) DO NOTHING;

-- School Years
INSERT INTO school_year (id, organization_id, name, start_date, end_date, is_current) VALUES
  ('44444444-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', '2025-26', '2025-08-18', '2026-06-05', false),
  ('44444444-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', '2026-27', '2026-08-17', '2027-06-04', true)
ON CONFLICT (id) DO NOTHING;

-- Grade Levels (2026-27, all 3 campuses, grades 6-12)
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

-- Enrollment Windows (2026-27)
INSERT INTO enrollment_window (id, campus_id, school_year_id, name, status, open_date, close_date, description) VALUES
  ('66666666-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', '2026-27 Open Enrollment — Vancouver', 'open', '2026-01-15T00:00:00Z', '2026-04-30T23:59:59Z', 'Open enrollment for the 2026-27 school year at Rooted School Vancouver.'),
  ('66666666-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', '2026-27 Open Enrollment — Columbia', 'open', '2026-01-15T00:00:00Z', '2026-04-30T23:59:59Z', 'Open enrollment for the 2026-27 school year at C.R. Neal Academy.'),
  ('66666666-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', '2026-27 Open Enrollment — Cleveland', 'open', '2026-02-01T00:00:00Z', '2026-05-15T23:59:59Z', 'Open enrollment for the 2026-27 school year at Rooted Schools Cleveland.')
ON CONFLICT (id) DO NOTHING;

-- Capacity Plans (2026-27)
INSERT INTO capacity_plan (id, campus_id, grade_level_id, school_year_id, total_seats, seats_offered, seats_accepted, seats_registered) VALUES
  ('77777777-0001-0000-0000-000000000006', '33333333-0000-0000-0000-000000000001', '55555555-0001-0000-0000-000000000006', '44444444-0000-0000-0000-000000000002', 30, 8, 5, 3),
  ('77777777-0001-0000-0000-000000000009', '33333333-0000-0000-0000-000000000001', '55555555-0001-0000-0000-000000000009', '44444444-0000-0000-0000-000000000002', 30, 12, 8, 6),
  ('77777777-0002-0000-0000-000000000006', '33333333-0000-0000-0000-000000000002', '55555555-0002-0000-0000-000000000006', '44444444-0000-0000-0000-000000000002', 40, 15, 10, 7),
  ('77777777-0002-0000-0000-000000000009', '33333333-0000-0000-0000-000000000002', '55555555-0002-0000-0000-000000000009', '44444444-0000-0000-0000-000000000002', 40, 20, 14, 10),
  ('77777777-0003-0000-0000-000000000006', '33333333-0000-0000-0000-000000000003', '55555555-0003-0000-0000-000000000006', '44444444-0000-0000-0000-000000000002', 25, 5, 3, 1),
  ('77777777-0003-0000-0000-000000000009', '33333333-0000-0000-0000-000000000003', '55555555-0003-0000-0000-000000000009', '44444444-0000-0000-0000-000000000002', 25, 8, 5, 3)
ON CONFLICT (id) DO NOTHING;

-- User profile for scarney (uses subquery for real UUID from auth)
INSERT INTO user_profile (id, email, first_name, last_name, is_staff)
SELECT id, 'scarney@rootedschool.org', 'Steven', 'Carney', true
FROM auth.users WHERE email = 'scarney@rootedschool.org'
ON CONFLICT (id) DO NOTHING;

-- Staff campus roles for scarney = system_admin at all 3 campuses
INSERT INTO user_campus_role (user_id, campus_id, role)
SELECT id, '33333333-0000-0000-0000-000000000001', 'system_admin'
FROM auth.users WHERE email = 'scarney@rootedschool.org'
ON CONFLICT DO NOTHING;

INSERT INTO user_campus_role (user_id, campus_id, role)
SELECT id, '33333333-0000-0000-0000-000000000002', 'system_admin'
FROM auth.users WHERE email = 'scarney@rootedschool.org'
ON CONFLICT DO NOTHING;

INSERT INTO user_campus_role (user_id, campus_id, role)
SELECT id, '33333333-0000-0000-0000-000000000003', 'system_admin'
FROM auth.users WHERE email = 'scarney@rootedschool.org'
ON CONFLICT DO NOTHING;

-- ============================================
-- DEMO HOUSEHOLDS, GUARDIANS, STUDENTS
-- (does NOT create auth.users — families log in via OTP)
-- ============================================

-- Household 1: Johnson family (Vancouver)
INSERT INTO household (id, address_line1, city, state, zip, primary_language) VALUES
  ('dddddddd-0000-0000-0000-000000000001', '1234 Oak St', 'Vancouver', 'WA', '98660', 'English')
ON CONFLICT (id) DO NOTHING;

INSERT INTO guardian (id, household_id, first_name, last_name, relationship, email, phone, is_primary, is_emergency_contact) VALUES
  ('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'Maria', 'Johnson', 'mother', 'maria.johnson@example.com', '(360) 555-1234', true, true)
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
INSERT INTO household (id, address_line1, city, state, zip, primary_language) VALUES
  ('dddddddd-0000-0000-0000-000000000002', '567 Magnolia Dr', 'Columbia', 'SC', '29201', 'English')
ON CONFLICT (id) DO NOTHING;

INSERT INTO guardian (id, household_id, first_name, last_name, relationship, email, phone, is_primary, is_emergency_contact) VALUES
  ('eeeeeeee-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000002', 'David', 'Williams', 'father', 'david.williams@example.com', '(803) 555-5678', true, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO student (id, household_id, first_name, last_name, date_of_birth, gender, race_ethnicity, primary_language, previous_school_name) VALUES
  ('ffffffff-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000002', 'Devon', 'Williams', '2012-01-30', 'Male', ARRAY['Black or African American', 'White'], 'English', 'Richland Middle School')
ON CONFLICT (id) DO NOTHING;

INSERT INTO guardian_student (guardian_id, student_id, relationship, is_legal_guardian) VALUES
  ('eeeeeeee-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000003', 'father', true)
ON CONFLICT DO NOTHING;

-- Household 3: Garcia family (Vancouver)
INSERT INTO household (id, address_line1, city, state, zip, primary_language) VALUES
  ('dddddddd-0000-0000-0000-000000000003', '890 Pine Ave', 'Vancouver', 'WA', '98661', 'Spanish')
ON CONFLICT (id) DO NOTHING;

INSERT INTO guardian (id, household_id, first_name, last_name, relationship, email, phone, is_primary, is_emergency_contact) VALUES
  ('eeeeeeee-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000003', 'Ana', 'Garcia', 'mother', 'ana.garcia@example.com', '(360) 555-8901', true, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO student (id, household_id, first_name, last_name, date_of_birth, gender, race_ethnicity, primary_language, previous_school_name) VALUES
  ('ffffffff-0000-0000-0000-000000000004', 'dddddddd-0000-0000-0000-000000000003', 'Sofia', 'Garcia', '2014-11-08', 'Female', ARRAY['Hispanic or Latino'], 'Spanish', 'Mill Plain Elementary')
ON CONFLICT (id) DO NOTHING;

INSERT INTO guardian_student (guardian_id, student_id, relationship, is_legal_guardian) VALUES
  ('eeeeeeee-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000004', 'mother', true)
ON CONFLICT DO NOTHING;

-- Household 4: Brown family (Columbia)
INSERT INTO household (id, address_line1, city, state, zip, primary_language) VALUES
  ('dddddddd-0000-0000-0000-000000000004', '345 Elm Ct', 'Columbia', 'SC', '29203', 'English')
ON CONFLICT (id) DO NOTHING;

INSERT INTO guardian (id, household_id, first_name, last_name, relationship, email, phone, is_primary, is_emergency_contact) VALUES
  ('eeeeeeee-0000-0000-0000-000000000004', 'dddddddd-0000-0000-0000-000000000004', 'Keisha', 'Brown', 'mother', 'keisha.brown@example.com', '(803) 555-3456', true, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO student (id, household_id, first_name, last_name, date_of_birth, gender, race_ethnicity, primary_language, previous_school_name) VALUES
  ('ffffffff-0000-0000-0000-000000000005', 'dddddddd-0000-0000-0000-000000000004', 'Aisha', 'Brown', '2013-03-17', 'Female', ARRAY['Black or African American'], 'English', 'Lower Richland Middle')
ON CONFLICT (id) DO NOTHING;

INSERT INTO guardian_student (guardian_id, student_id, relationship, is_legal_guardian) VALUES
  ('eeeeeeee-0000-0000-0000-000000000004', 'ffffffff-0000-0000-0000-000000000005', 'mother', true)
ON CONFLICT DO NOTHING;

-- Household 5: Chen family (Cleveland)
INSERT INTO household (id, address_line1, city, state, zip, primary_language) VALUES
  ('dddddddd-0000-0000-0000-000000000005', '678 Lake Dr', 'Cleveland', 'OH', '44114', 'Mandarin')
ON CONFLICT (id) DO NOTHING;

INSERT INTO guardian (id, household_id, first_name, last_name, relationship, email, phone, is_primary, is_emergency_contact) VALUES
  ('eeeeeeee-0000-0000-0000-000000000005', 'dddddddd-0000-0000-0000-000000000005', 'Robert', 'Chen', 'father', 'robert.chen@example.com', '(216) 555-6789', true, true)
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
-- ============================================

-- App 1: Marcus Johnson -> Vancouver Grade 6 -> SUBMITTED
INSERT INTO application (id, enrollment_window_id, student_id, campus_id, grade_level_id, guardian_id, status, submitted_at, created_at, updated_at) VALUES
  ('aaa11111-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', '55555555-0001-0000-0000-000000000006', 'eeeeeeee-0000-0000-0000-000000000001', 'submitted', '2026-02-10T14:30:00Z', '2026-02-08T10:00:00Z', '2026-02-10T14:30:00Z')
ON CONFLICT (id) DO NOTHING;

-- App 2: Ava Johnson -> Vancouver Grade 6 -> DRAFT
INSERT INTO application (id, enrollment_window_id, student_id, campus_id, grade_level_id, guardian_id, status, created_at, updated_at) VALUES
  ('aaa11111-0000-0000-0000-000000000002', '66666666-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000001', '55555555-0001-0000-0000-000000000006', 'eeeeeeee-0000-0000-0000-000000000001', 'draft', '2026-02-28T09:00:00Z', '2026-03-01T11:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- App 3: Devon Williams -> Columbia Grade 9 -> VERIFIED
INSERT INTO application (id, enrollment_window_id, student_id, campus_id, grade_level_id, guardian_id, status, submitted_at, created_at, updated_at) VALUES
  ('aaa11111-0000-0000-0000-000000000003', '66666666-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000002', '55555555-0002-0000-0000-000000000009', 'eeeeeeee-0000-0000-0000-000000000002', 'verified', '2026-02-01T08:00:00Z', '2026-01-28T12:00:00Z', '2026-02-05T16:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- App 4: Sofia Garcia -> Vancouver Grade 6 -> OFFERED
INSERT INTO application (id, enrollment_window_id, student_id, campus_id, grade_level_id, guardian_id, status, submitted_at, created_at, updated_at) VALUES
  ('aaa11111-0000-0000-0000-000000000004', '66666666-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000001', '55555555-0001-0000-0000-000000000006', 'eeeeeeee-0000-0000-0000-000000000003', 'offered', '2026-01-20T10:00:00Z', '2026-01-18T09:00:00Z', '2026-03-01T10:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- App 5: Aisha Brown -> Columbia Grade 8 -> ACCEPTED
INSERT INTO application (id, enrollment_window_id, student_id, campus_id, grade_level_id, guardian_id, status, submitted_at, created_at, updated_at) VALUES
  ('aaa11111-0000-0000-0000-000000000005', '66666666-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000005', '33333333-0000-0000-0000-000000000002', '55555555-0002-0000-0000-000000000008', 'eeeeeeee-0000-0000-0000-000000000004', 'accepted', '2026-01-18T11:00:00Z', '2026-01-16T08:00:00Z', '2026-02-20T09:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- App 6: Tyler Chen -> Cleveland Grade 6 -> NEEDS_INFO
INSERT INTO application (id, enrollment_window_id, student_id, campus_id, grade_level_id, guardian_id, status, submitted_at, created_at, updated_at) VALUES
  ('aaa11111-0000-0000-0000-000000000006', '66666666-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000006', '33333333-0000-0000-0000-000000000003', '55555555-0003-0000-0000-000000000006', 'eeeeeeee-0000-0000-0000-000000000005', 'needs_info', '2026-02-15T13:00:00Z', '2026-02-12T10:00:00Z', '2026-02-20T11:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- App 7: Maya Chen -> Cleveland Grade 9 -> REGISTERED
INSERT INTO application (id, enrollment_window_id, student_id, campus_id, grade_level_id, guardian_id, status, submitted_at, created_at, updated_at) VALUES
  ('aaa11111-0000-0000-0000-000000000007', '66666666-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000007', '33333333-0000-0000-0000-000000000003', '55555555-0003-0000-0000-000000000009', 'eeeeeeee-0000-0000-0000-000000000005', 'registered', '2026-01-10T09:00:00Z', '2026-01-08T08:00:00Z', '2026-03-01T10:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- OFFERS
-- ============================================

INSERT INTO offer (id, application_id, campus_id, grade_level_id, status, offered_at, expires_at) VALUES
  ('0000ff00-0000-0000-0000-000000000001', 'aaa11111-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000001', '55555555-0001-0000-0000-000000000006', 'pending', '2026-03-01T10:00:00Z', '2026-03-15T23:59:59Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO offer (id, application_id, campus_id, grade_level_id, status, offered_at, expires_at, responded_at) VALUES
  ('0000ff00-0000-0000-0000-000000000002', 'aaa11111-0000-0000-0000-000000000005', '33333333-0000-0000-0000-000000000002', '55555555-0002-0000-0000-000000000008', 'accepted', '2026-02-10T09:00:00Z', '2026-02-24T23:59:59Z', '2026-02-20T09:00:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO offer (id, application_id, campus_id, grade_level_id, status, offered_at, expires_at, responded_at) VALUES
  ('0000ff00-0000-0000-0000-000000000003', 'aaa11111-0000-0000-0000-000000000007', '33333333-0000-0000-0000-000000000003', '55555555-0003-0000-0000-000000000009', 'accepted', '2026-02-01T10:00:00Z', '2026-02-15T23:59:59Z', '2026-02-10T09:00:00Z')
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
-- PACKET REQUIREMENTS (Comprehensive Master List)
-- ============================================

-- ============================================
-- VANCOUVER (WA) — Rooted School Vancouver
-- ============================================

INSERT INTO packet_requirement (campus_id, school_year_id, item_type, name, description, is_required, sort_order, is_active) VALUES
  -- CORE FORMS (Universal)
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'emergency_contact', 'Emergency Contact Information', 'Provide at least two emergency contacts with phone numbers and relationship to student.', true, 1, true),
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'medical_info', 'Health History & Medical Information', 'Student health history, allergies, current medications, and physician contact information.', true, 2, true),
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'medication_auth', 'Medication Administration Authorization', 'Authorization for school to administer prescribed or over-the-counter medications.', false, 3, true),
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'food_allergy_plan', 'Food Allergy Action Plan', 'Required if student has food allergies. Includes emergency action steps and EpiPen authorization.', false, 4, true),
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'tech_policy', 'Technology Acceptable Use Policy', 'Student and parent agreement for responsible use of school technology and internet access.', true, 5, true),
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'handbook_ack', 'Student & Family Handbook Acknowledgment', 'Acknowledge receipt and review of the student/family handbook including policies and expectations.', true, 6, true),
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'discipline_policy', 'Discipline Policy Acknowledgment', 'Acknowledge receipt and understanding of the school discipline and behavior expectations policy.', true, 7, true),
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'media_release', 'Photo/Video/Media Release', 'Permission for school to use student photos and videos in newsletters, website, and social media.', false, 8, true),
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'field_trip', 'Blanket Field Trip Permission', 'Annual permission for student to participate in school-sponsored field trips and off-campus activities.', true, 9, true),
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'internet_safety', 'Internet Safety Agreement', 'Student agreement to follow internet safety guidelines and digital citizenship expectations.', true, 10, true),
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'anti_bullying', 'Anti-Bullying Policy Acknowledgment', 'Acknowledge review of anti-bullying and harassment prevention policies.', true, 11, true),
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'uniform_policy', 'Uniform/Dress Code Policy', 'Acknowledge the school uniform and dress code requirements.', false, 12, true),
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'ferpa_consent', 'FERPA Directory Information Consent', 'Consent for release of student directory information under FERPA guidelines.', true, 13, true),
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'pickup_auth', 'Authorized Pickup / Dismissal Form', 'List of individuals authorized to pick up the student from school. Photo ID required at pickup.', true, 14, true),

  -- DOCUMENT UPLOADS (State-Specific: WA)
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'immunization_records', 'WA Certificate of Immunization Status (CIS)', 'Washington State Certificate of Immunization Status showing all required vaccinations or approved exemption.', true, 20, true),
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'proof_of_residency', 'Proof of Residency', 'Current utility bill, lease agreement, or mortgage statement showing family address within service area.', true, 21, true),
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'proof_of_age', 'Birth Certificate or Proof of Age', 'Certified birth certificate, passport, or other legal proof of age document.', true, 22, true),
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'lthc_form', 'Life-Threatening Health Condition (LTHC) Form', 'WA state required form for any life-threatening health conditions (anaphylaxis, seizure disorder, diabetes, etc.).', false, 23, true),

  -- SPECIAL SERVICES & COMPLIANCE
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'iep_records', 'IEP / Special Education Records Transfer', 'Current Individualized Education Program (IEP) and related services documentation from prior school.', false, 30, true),
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', '504_plan', '504 Plan Documentation', 'Current Section 504 Plan and accommodations documentation from prior school.', false, 31, true),
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'home_language_survey', 'Home Language Survey', 'Federal requirement to identify students who may need English Language Learner (ELL) services.', true, 32, true),
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'mckinney_vento', 'McKinney-Vento Homeless Education Declaration', 'For families experiencing homelessness. Ensures immediate enrollment and access to services.', false, 33, true),
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'previous_school_records', 'Previous School Records Release', 'Authorization for school to request academic transcripts and records from prior school.', true, 34, true),

  -- FEDERAL PROGRAMS
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'frl_app', 'Free/Reduced Lunch Application', 'Federal income-based application for free or reduced-price school meals (NSLP/SBP).', false, 40, true),
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'military_family', 'Military Connected Family Form', 'Identifies students from active duty military, reserve, or National Guard families for support services.', false, 41, true),

  -- TRANSPORTATION & EXTENDED DAY
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'transport', 'Transportation Request Form', 'Bus route request, walking/biking designation, or carpool arrangement for daily transportation.', false, 50, true),
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'before_after_care', 'Before/After School Care Enrollment', 'Registration for extended day programs (before-school and/or after-school care).', false, 51, true),

  -- PARENT/GUARDIAN VERIFICATION
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'parent_id', 'Parent/Guardian Photo ID', 'Copy of valid government-issued photo ID for primary guardian. Required for records verification.', true, 60, true),
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'custody_docs', 'Custody / Legal Guardian Documentation', 'Court orders, custody agreements, or other legal documents establishing guardianship (if applicable).', false, 61, true),
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'student_photo', 'Student Photo (ID Badge)', 'Recent student photo for school ID badge and emergency identification purposes.', false, 62, true),

  -- WA-SPECIFIC (inactive for now — only used if needed)
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'wa_health_exam', 'WA Health Examination Form', 'Physical exam record for school entry (recommended but not required in WA for charter schools).', false, 70, false),

  -- SC-SPECIFIC (inactive at Vancouver)
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'sc_health_exam', 'SC School Entry Health Exam', 'South Carolina DHEC school entry health examination within 3 months of enrollment.', false, 71, false),
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'sc_dental_screen', 'SC Dental Screening', 'South Carolina dental health screening certificate.', false, 72, false),

  -- OH-SPECIFIC (inactive at Vancouver)
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'oh_custody_affidavit', 'OH Custody/Caretaker Affidavit', 'Ohio caretaker authorization affidavit for non-parent guardians enrolling students.', false, 73, false),
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'income_verification', 'Income Verification (Community Eligibility)', 'Household income documentation for community eligibility provision or Title I qualification.', false, 74, false),

  -- ATHLETICS (inactive by default)
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'sports_physical', 'Athletic/Sports Physical Exam', 'Pre-participation physical exam for student athletes. Required before tryouts or practice.', false, 80, false)

ON CONFLICT (campus_id, school_year_id, item_type) DO NOTHING;

-- ============================================
-- COLUMBIA (SC) — C.R. Neal Academy
-- Same master list, SC-specific items active, WA/OH-specific items inactive
-- ============================================

INSERT INTO packet_requirement (campus_id, school_year_id, item_type, name, description, is_required, sort_order, is_active) VALUES
  -- CORE FORMS
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'emergency_contact', 'Emergency Contact Information', 'Provide at least two emergency contacts with phone numbers and relationship to student.', true, 1, true),
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'medical_info', 'Health History & Medical Information', 'Student health history, allergies, current medications, and physician contact information.', true, 2, true),
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'medication_auth', 'Medication Administration Authorization', 'Authorization for school to administer prescribed or over-the-counter medications.', false, 3, true),
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'food_allergy_plan', 'Food Allergy Action Plan', 'Required if student has food allergies. Includes emergency action steps and EpiPen authorization.', false, 4, true),
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'tech_policy', 'Technology Acceptable Use Policy', 'Student and parent agreement for responsible use of school technology and internet access.', true, 5, true),
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'handbook_ack', 'Student & Family Handbook Acknowledgment', 'Acknowledge receipt and review of the student/family handbook including policies and expectations.', true, 6, true),
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'discipline_policy', 'Discipline Policy Acknowledgment', 'Acknowledge receipt and understanding of the school discipline and behavior expectations policy.', true, 7, true),
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'media_release', 'Photo/Video/Media Release', 'Permission for school to use student photos and videos in newsletters, website, and social media.', false, 8, true),
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'field_trip', 'Blanket Field Trip Permission', 'Annual permission for student to participate in school-sponsored field trips and off-campus activities.', true, 9, true),
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'internet_safety', 'Internet Safety Agreement', 'Student agreement to follow internet safety guidelines and digital citizenship expectations.', true, 10, true),
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'anti_bullying', 'Anti-Bullying Policy Acknowledgment', 'Acknowledge review of anti-bullying and harassment prevention policies.', true, 11, true),
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'uniform_policy', 'Uniform/Dress Code Policy', 'Acknowledge the school uniform and dress code requirements.', true, 12, true),
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'ferpa_consent', 'FERPA Directory Information Consent', 'Consent for release of student directory information under FERPA guidelines.', true, 13, true),
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'pickup_auth', 'Authorized Pickup / Dismissal Form', 'List of individuals authorized to pick up the student from school. Photo ID required at pickup.', true, 14, true),

  -- DOCUMENT UPLOADS (State-Specific: SC)
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'immunization_records', 'SC DHEC Certificate of Immunization', 'South Carolina DHEC immunization certificate showing all state-required vaccinations or approved exemption.', true, 20, true),
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'proof_of_residency', 'Proof of Residency', 'Current utility bill, lease agreement, or mortgage statement showing family address within service area.', true, 21, true),
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'proof_of_age', 'Birth Certificate or Proof of Age', 'Certified birth certificate, passport, or other legal proof of age document.', true, 22, true),
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'sc_health_exam', 'SC School Entry Health Exam', 'South Carolina DHEC school entry health examination completed within 3 months of enrollment. Required for all new students.', true, 23, true),
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'sc_dental_screen', 'SC Dental Health Screening', 'South Carolina dental screening certificate. Required for kindergarten and first-time SC enrollment.', false, 24, true),

  -- SPECIAL SERVICES & COMPLIANCE
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'iep_records', 'IEP / Special Education Records Transfer', 'Current Individualized Education Program (IEP) and related services documentation from prior school.', false, 30, true),
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', '504_plan', '504 Plan Documentation', 'Current Section 504 Plan and accommodations documentation from prior school.', false, 31, true),
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'home_language_survey', 'Home Language Survey', 'Federal requirement to identify students who may need English Language Learner (ELL) services.', true, 32, true),
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'mckinney_vento', 'McKinney-Vento Homeless Education Declaration', 'For families experiencing homelessness. Ensures immediate enrollment and access to services.', false, 33, true),
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'previous_school_records', 'Previous School Records Release', 'Authorization for school to request academic transcripts and records from prior school.', true, 34, true),

  -- FEDERAL PROGRAMS
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'frl_app', 'Free/Reduced Lunch Application', 'Federal income-based application for free or reduced-price school meals (NSLP/SBP).', false, 40, true),
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'military_family', 'Military Connected Family Form', 'Identifies students from active duty military, reserve, or National Guard families for support services.', false, 41, true),

  -- TRANSPORTATION & EXTENDED DAY
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'transport', 'Transportation Request Form', 'Bus route request, walking/biking designation, or carpool arrangement for daily transportation.', false, 50, true),
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'before_after_care', 'Before/After School Care Enrollment', 'Registration for extended day programs (before-school and/or after-school care).', false, 51, true),

  -- PARENT/GUARDIAN VERIFICATION
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'parent_id', 'Parent/Guardian Photo ID', 'Copy of valid government-issued photo ID for primary guardian. Required for records verification.', true, 60, true),
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'custody_docs', 'Custody / Legal Guardian Documentation', 'Court orders, custody agreements, or other legal documents establishing guardianship (if applicable).', false, 61, true),
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'student_photo', 'Student Photo (ID Badge)', 'Recent student photo for school ID badge and emergency identification purposes.', false, 62, true),

  -- WA-SPECIFIC (inactive at Columbia)
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'lthc_form', 'Life-Threatening Health Condition (LTHC) Form', 'WA state required form for life-threatening health conditions.', false, 70, false),
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'wa_health_exam', 'WA Health Examination Form', 'Physical exam record for school entry (WA specific).', false, 71, false),

  -- OH-SPECIFIC (inactive at Columbia)
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'oh_custody_affidavit', 'OH Custody/Caretaker Affidavit', 'Ohio caretaker authorization affidavit for non-parent guardians.', false, 73, false),
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'income_verification', 'Income Verification (Community Eligibility)', 'Household income documentation for Title I or community eligibility.', false, 74, false),

  -- ATHLETICS (inactive by default)
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'sports_physical', 'Athletic/Sports Physical Exam', 'Pre-participation physical exam for student athletes.', false, 80, false)

ON CONFLICT (campus_id, school_year_id, item_type) DO NOTHING;

-- ============================================
-- CLEVELAND (OH) — Rooted Schools Cleveland
-- Same master list, OH-specific items active, WA/SC-specific items inactive
-- ============================================

INSERT INTO packet_requirement (campus_id, school_year_id, item_type, name, description, is_required, sort_order, is_active) VALUES
  -- CORE FORMS
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'emergency_contact', 'Emergency Contact Information', 'Provide at least two emergency contacts with phone numbers and relationship to student.', true, 1, true),
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'medical_info', 'Health History & Medical Information', 'Student health history, allergies, current medications, and physician contact information.', true, 2, true),
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'medication_auth', 'Medication Administration Authorization', 'Authorization for school to administer prescribed or over-the-counter medications.', false, 3, true),
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'food_allergy_plan', 'Food Allergy Action Plan', 'Required if student has food allergies. Includes emergency action steps and EpiPen authorization.', false, 4, true),
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'tech_policy', 'Technology Acceptable Use Policy', 'Student and parent agreement for responsible use of school technology and internet access.', true, 5, true),
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'handbook_ack', 'Student & Family Handbook Acknowledgment', 'Acknowledge receipt and review of the student/family handbook including policies and expectations.', true, 6, true),
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'discipline_policy', 'Discipline Policy Acknowledgment', 'Acknowledge receipt and understanding of the school discipline and behavior expectations policy.', true, 7, true),
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'media_release', 'Photo/Video/Media Release', 'Permission for school to use student photos and videos in newsletters, website, and social media.', false, 8, true),
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'field_trip', 'Blanket Field Trip Permission', 'Annual permission for student to participate in school-sponsored field trips and off-campus activities.', true, 9, true),
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'internet_safety', 'Internet Safety Agreement', 'Student agreement to follow internet safety guidelines and digital citizenship expectations.', true, 10, true),
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'anti_bullying', 'Anti-Bullying Policy Acknowledgment', 'Acknowledge review of anti-bullying and harassment prevention policies.', true, 11, true),
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'uniform_policy', 'Uniform/Dress Code Policy', 'Acknowledge the school uniform and dress code requirements.', true, 12, true),
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'ferpa_consent', 'FERPA Directory Information Consent', 'Consent for release of student directory information under FERPA guidelines.', true, 13, true),
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'pickup_auth', 'Authorized Pickup / Dismissal Form', 'List of individuals authorized to pick up the student from school. Photo ID required at pickup.', true, 14, true),

  -- DOCUMENT UPLOADS (State-Specific: OH)
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'immunization_records', 'OH Immunization Records', 'Ohio immunization records showing all state-required vaccinations or approved exemption form.', true, 20, true),
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'proof_of_residency', 'Proof of Residency', 'Current utility bill, lease agreement, or mortgage statement showing family address within service area.', true, 21, true),
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'proof_of_age', 'Birth Certificate or Proof of Age', 'Certified birth certificate, passport, or other legal proof of age document.', true, 22, true),
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'oh_custody_affidavit', 'OH Custody/Caretaker Authorization Affidavit', 'Ohio caretaker authorization affidavit required when student is enrolled by someone other than parent/legal guardian.', false, 23, true),
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'income_verification', 'Income Verification (Community Eligibility)', 'Household income documentation for community eligibility provision or Title I qualification. Required for OH community schools.', false, 24, true),

  -- SPECIAL SERVICES & COMPLIANCE
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'iep_records', 'IEP / Special Education Records Transfer', 'Current Individualized Education Program (IEP) and related services documentation from prior school.', false, 30, true),
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', '504_plan', '504 Plan Documentation', 'Current Section 504 Plan and accommodations documentation from prior school.', false, 31, true),
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'home_language_survey', 'Home Language Survey', 'Federal requirement to identify students who may need English Language Learner (ELL) services.', true, 32, true),
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'mckinney_vento', 'McKinney-Vento Homeless Education Declaration', 'For families experiencing homelessness. Ensures immediate enrollment and access to services.', false, 33, true),
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'previous_school_records', 'Previous School Records Release Authorization', 'Authorization for school to request academic transcripts and records from prior school. Required under Ohio law.', true, 34, true),

  -- FEDERAL PROGRAMS
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'frl_app', 'Free/Reduced Lunch Application', 'Federal income-based application for free or reduced-price school meals (NSLP/SBP).', false, 40, true),
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'military_family', 'Military Connected Family Form', 'Identifies students from active duty military, reserve, or National Guard families for support services.', false, 41, true),

  -- TRANSPORTATION & EXTENDED DAY
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'transport', 'Transportation Request Form', 'Bus route request, walking/biking designation, or carpool arrangement for daily transportation.', false, 50, true),
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'before_after_care', 'Before/After School Care Enrollment', 'Registration for extended day programs (before-school and/or after-school care).', false, 51, true),

  -- PARENT/GUARDIAN VERIFICATION
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'parent_id', 'Parent/Guardian Photo ID', 'Copy of valid government-issued photo ID for primary guardian. Required for records verification.', true, 60, true),
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'custody_docs', 'Custody / Legal Guardian Documentation', 'Court orders, custody agreements, or other legal documents establishing guardianship (if applicable).', false, 61, true),
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'student_photo', 'Student Photo (ID Badge)', 'Recent student photo for school ID badge and emergency identification purposes.', false, 62, true),

  -- WA-SPECIFIC (inactive at Cleveland)
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'lthc_form', 'Life-Threatening Health Condition (LTHC) Form', 'WA state required form for life-threatening health conditions.', false, 70, false),
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'wa_health_exam', 'WA Health Examination Form', 'Physical exam record for school entry (WA specific).', false, 71, false),

  -- SC-SPECIFIC (inactive at Cleveland)
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'sc_health_exam', 'SC School Entry Health Exam', 'South Carolina DHEC school entry health examination.', false, 72, false),
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'sc_dental_screen', 'SC Dental Screening', 'South Carolina dental health screening certificate.', false, 73, false),

  -- ATHLETICS (inactive by default)
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'sports_physical', 'Athletic/Sports Physical Exam', 'Pre-participation physical exam for student athletes.', false, 80, false)

ON CONFLICT (campus_id, school_year_id, item_type) DO NOTHING;

-- =============================================
-- Rooted EMS — Staff Role Setup
-- Run this AFTER a staff user has logged in at least once
-- via Google OAuth so their auth.users record exists.
--
-- Usage:
-- 1. Log into the app with your Google account at /staff-login
-- 2. Find your user ID in Supabase Dashboard → Auth → Users
-- 3. Replace the placeholder below with your actual user ID
-- 4. Run this in Supabase SQL Editor
-- =============================================

-- REPLACE THIS with your actual Supabase Auth user ID
-- Find it in: Supabase Dashboard → Authentication → Users
DO $$
DECLARE
  staff_user_id UUID := '00000000-0000-0000-0000-000000000000'; -- ← REPLACE THIS
BEGIN
  -- 1. Ensure user_profile exists and is marked as staff
  INSERT INTO user_profile (id, email, is_staff)
  VALUES (
    staff_user_id,
    (SELECT email FROM auth.users WHERE id = staff_user_id),
    true
  )
  ON CONFLICT (id) DO UPDATE SET is_staff = true;

  -- 2. Assign system_admin role on ALL campuses (CMO-level access)
  INSERT INTO user_campus_role (user_id, campus_id, role)
  SELECT staff_user_id, id, 'system_admin'::staff_role
  FROM campus
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Staff roles assigned for user %', staff_user_id;
END $$;

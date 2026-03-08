-- Add a generated full_name column to user_profile so queries can select it directly.
-- This avoids having to concatenate first_name + last_name in every query.
ALTER TABLE user_profile
  ADD COLUMN IF NOT EXISTS full_name TEXT
  GENERATED ALWAYS AS (COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) STORED;

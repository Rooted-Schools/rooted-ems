-- Add target_start_year to inquiry so families can express interest
-- for future enrollment years (e.g. "my child starts in 2027-28")
ALTER TABLE inquiry
  ADD COLUMN IF NOT EXISTS target_start_year TEXT;

-- Migration 023: Backfill packet_requirement rows for the 2025-26 school year.
-- The original seed (016) only covered 2026-27. Current enrollment windows use 2025-26,
-- so item seeding was silently producing 0 rows for all active enrollments.
-- This migration copies all 2026-27 rows to 2025-26 for all three campuses.

INSERT INTO packet_requirement (campus_id, school_year_id, item_type, name, description, is_required, sort_order, is_active)
SELECT
  campus_id,
  '44444444-0000-0000-0000-000000000001' AS school_year_id, -- 2025-26
  item_type,
  name,
  description,
  is_required,
  sort_order,
  is_active
FROM packet_requirement
WHERE school_year_id = '44444444-0000-0000-0000-000000000002' -- 2026-27 (source)
ON CONFLICT (campus_id, school_year_id, item_type) DO NOTHING;

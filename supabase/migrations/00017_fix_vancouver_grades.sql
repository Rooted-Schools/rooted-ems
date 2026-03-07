-- Fix: Rooted School Vancouver is grades 9-12, not 6-12.
-- Remove grade levels 6, 7, 8 for Vancouver campus.
-- Vancouver campus_id = '33333333-0000-0000-0000-000000000001'
-- Must handle FK dependencies in order.

-- 1. Delete any enrollment records referencing these grade levels
DELETE FROM enrollment
WHERE grade_level_id IN (
  '55555555-0001-0000-0000-000000000006',
  '55555555-0001-0000-0000-000000000007',
  '55555555-0001-0000-0000-000000000008'
);

-- 2. Delete any offers referencing these grade levels
DELETE FROM offer
WHERE grade_level_id IN (
  '55555555-0001-0000-0000-000000000006',
  '55555555-0001-0000-0000-000000000007',
  '55555555-0001-0000-0000-000000000008'
);

-- 3. Delete any lottery entries referencing applications with these grade levels
DELETE FROM lottery_entry
WHERE application_id IN (
  SELECT id FROM application WHERE grade_level_id IN (
    '55555555-0001-0000-0000-000000000006',
    '55555555-0001-0000-0000-000000000007',
    '55555555-0001-0000-0000-000000000008'
  )
);

-- 4. Delete application answers for these applications
DELETE FROM application_answer
WHERE application_id IN (
  SELECT id FROM application WHERE grade_level_id IN (
    '55555555-0001-0000-0000-000000000006',
    '55555555-0001-0000-0000-000000000007',
    '55555555-0001-0000-0000-000000000008'
  )
);

-- 5. Delete application status history for these applications
DELETE FROM application_status_history
WHERE application_id IN (
  SELECT id FROM application WHERE grade_level_id IN (
    '55555555-0001-0000-0000-000000000006',
    '55555555-0001-0000-0000-000000000007',
    '55555555-0001-0000-0000-000000000008'
  )
);

-- 6. Delete applications referencing Vancouver grades 6-8
DELETE FROM application
WHERE grade_level_id IN (
  '55555555-0001-0000-0000-000000000006',
  '55555555-0001-0000-0000-000000000007',
  '55555555-0001-0000-0000-000000000008'
);

-- 7. Remove capacity plans referencing Vancouver grades 6-8
DELETE FROM capacity_plan
WHERE grade_level_id IN (
  '55555555-0001-0000-0000-000000000006',
  '55555555-0001-0000-0000-000000000007',
  '55555555-0001-0000-0000-000000000008'
);

-- 8. Finally remove the grade levels themselves
DELETE FROM grade_level
WHERE id IN (
  '55555555-0001-0000-0000-000000000006',
  '55555555-0001-0000-0000-000000000007',
  '55555555-0001-0000-0000-000000000008'
);

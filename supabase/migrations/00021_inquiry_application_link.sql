-- Link inquiries to applications after conversion
-- This creates a traceable FK from inquiry -> application

ALTER TABLE inquiry
  ADD COLUMN application_id uuid REFERENCES application(id) ON DELETE SET NULL;

CREATE INDEX idx_inquiry_application_id ON inquiry(application_id) WHERE application_id IS NOT NULL;

-- Back-fill existing "applied" inquiries by matching student records created from inquiry_conversion
-- We match on student_first_name + student_last_name + campus_id where application source = 'inquiry_conversion'
UPDATE inquiry i
SET application_id = sub.app_id
FROM (
  SELECT DISTINCT ON (a.student_id)
    s.first_name,
    s.last_name,
    a.campus_id,
    a.id AS app_id
  FROM application a
  JOIN student s ON s.id = a.student_id
  WHERE a.source = 'inquiry_conversion'
  ORDER BY a.student_id, a.created_at DESC
) sub
WHERE i.status = 'applied'
  AND i.application_id IS NULL
  AND lower(trim(i.student_first_name)) = lower(trim(sub.first_name))
  AND lower(trim(i.student_last_name)) = lower(trim(sub.last_name))
  AND i.campus_id = sub.campus_id;

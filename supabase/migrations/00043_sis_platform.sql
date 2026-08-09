-- Migration 00043: which SIS each campus runs.
--
-- Rooted runs two systems, not one:
--   Rooted School Vancouver   Skyward Qmlativ
--   C.R. Neal Academy         PowerSchool
--   Rooted Schools Cleveland  PowerSchool
--
-- Without this column the app cannot know which adapter to call for a given
-- campus, which is the first thing any SIS work needs and the reason this
-- migration comes before any integration code.
--
-- `enrollment.sis_student_id` and `enrollment.sis_synced_at` already exist
-- (00007) and are deliberately reused rather than adding a student-level id.
-- A student's identifier is issued by the SIS per enrolment, and a student who
-- transfers between campuses running different systems will legitimately hold
-- two different ids. Hanging it off enrollment models that correctly; hanging
-- it off student would force one of the two to be wrong.

CREATE TYPE sis_platform AS ENUM ('powerschool', 'qmlativ');

ALTER TABLE campus ADD COLUMN sis_platform sis_platform;

COMMENT ON COLUMN campus.sis_platform IS
  'Which SIS this campus runs. NULL means not yet integrated, which is a real '
  'state and not an error: a pre-opening campus has no SIS until it has '
  'students. Adapters must handle NULL by doing nothing rather than by '
  'guessing a default.';

-- Seed the known assignments. Matched on short_code rather than name so a
-- later rename does not silently skip a campus.
UPDATE campus SET sis_platform = 'qmlativ'     WHERE short_code = 'RSV';
UPDATE campus SET sis_platform = 'powerschool' WHERE short_code IN ('CRN', 'RSC');

-- Reconciliation reads "which enrolments are not yet synced", per campus.
CREATE INDEX idx_enrollment_sis_sync
  ON enrollment (campus_id, sis_synced_at NULLS FIRST);

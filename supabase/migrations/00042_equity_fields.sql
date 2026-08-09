-- Migration 00042: the two Equity Tracker cuts the schema could not support.
--
-- Playbook PB 24 v2.2 s6 requires every funnel stage broken out by race,
-- income, language, disability, housing, and zip. Five of those six were
-- already possible. Income and housing had no home in the schema at all:
-- income existed only as document requirements (frl_app, income_verification)
-- and housing not at all.
--
-- ─────────────────────────────────────────────────────────────────────────
-- LEGAL POSTURE, AND WHY THESE LIVE ON `enrollment` RATHER THAN `application`
--
-- A lottery-based charter must not let income or housing status influence
-- admission. Collecting either during the APPLICATION window creates exactly
-- the appearance an authorizer challenge is built on: the data was in the file
-- while the decision was being made.
--
-- These columns therefore hang off `enrollment`, which by definition only
-- exists AFTER a seat has been awarded and accepted. There is no application
-- window in which they can be populated, so they cannot influence a lottery
-- even by accident. That is a structural guarantee rather than a policy
-- promise, which is the only kind worth relying on.
--
-- This still satisfies the Equity Tracker, which measures OUTCOMES by group
-- (who enrolled, who was retained) rather than screening by group.
--
-- STILL PENDING: counsel sign-off before either field is populated in
-- production. The schema is safe to land; the collection is not yet approved.
-- Nothing in the app writes these yet.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TYPE frl_status AS ENUM (
  'free',
  'reduced',
  'paid',
  'not_reported'
);

-- McKinney-Vento categories, kept close to the federal definitions so this can
-- feed required reporting without a second translation step.
CREATE TYPE housing_status AS ENUM (
  'stable',
  'doubled_up',
  'shelter',
  'unsheltered',
  'hotel_motel',
  'not_reported'
);

ALTER TABLE enrollment ADD COLUMN frl_status frl_status NOT NULL DEFAULT 'not_reported';
ALTER TABLE enrollment ADD COLUMN housing_status housing_status NOT NULL DEFAULT 'not_reported';
ALTER TABLE enrollment ADD COLUMN equity_data_recorded_at TIMESTAMPTZ;

COMMENT ON COLUMN enrollment.frl_status IS
  'Free/reduced lunch eligibility. POST-ENROLLMENT ONLY: lives on enrollment, '
  'not application, so it cannot exist during a lottery. Defaults to '
  'not_reported, which is a real state meaning nobody asked — never treat it '
  'as "paid".';

COMMENT ON COLUMN enrollment.housing_status IS
  'McKinney-Vento housing status. POST-ENROLLMENT ONLY, same reasoning as '
  'frl_status. Defaults to not_reported.';

COMMENT ON COLUMN enrollment.equity_data_recorded_at IS
  'When a human actually recorded the two fields above. Distinguishes "asked '
  'and told not_reported" from "never asked", which the enum alone cannot.';

-- Equity reporting groups enrolled students by these; both scans are per
-- campus and school year.
CREATE INDEX idx_enrollment_equity_frl
  ON enrollment (campus_id, school_year_id, frl_status);

CREATE INDEX idx_enrollment_equity_housing
  ON enrollment (campus_id, school_year_id, housing_status);

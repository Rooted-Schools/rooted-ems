-- Migration 00047: Lottery policy governance layer
--
-- WHY THIS EXISTS
--
-- A charter lottery is a legal act. The rules that govern it are adopted by a
-- governing board and constrained by state charter law; they are not developer
-- configuration. Until now the only rule surface in this schema was
-- lottery_rule_set.priority_tiers (00005_lottery.sql:10) — a JSONB blob with no
-- adoption state, no version history, no record of who approved it, and no
-- binding to the runs it governed. A run could be finalized under rules that
-- were edited five minutes earlier, and nothing in the record would show it.
--
-- This migration adds:
--   1. lottery_policy      — versioned, board-adoptable policy configuration
--   2. lottery_run.policy_id + policy_snapshot — the run binds to the adopted
--      policy AT CREATION and carries an immutable copy of it forever
--   3. lottery_run.is_rehearsal — dress-rehearsal runs, which the database
--      itself refuses to let reach 'official'
--   4. lottery_notification — the idempotency ledger that makes the
--      post-commit family notification fan-out resumable without double-sends
--
-- GOVERNING SOURCE FOR THE SEEDED RSV CONFIGURATION
--
--   Rooted School Vancouver, Board Enrollment Policy.
--   Adopted 2023-01-25. Revised 2024-08-20.
--
-- Every rule encoded in the RSV seed below is drawn from that document. The
-- version 1 row seeded for RSV is marked 'adopted' with adopted_date
-- 2024-08-20 (the revision date) because that is the board action the
-- configuration reflects.
--
-- C.R. Neal Academy (South Carolina) and Rooted Schools Cleveland (Ohio) are
-- seeded with DRAFT copies only. Their authorizing statutes are not Washington
-- law, their boards have not adopted this text, and presenting these as adopted
-- would be a false record. The application blocks official lotteries at a
-- campus with no adopted policy.
--
-- APPLY MANUALLY. The application degrades gracefully if this migration has not
-- been applied: policy lookups return null, runs are created unbound and
-- flagged, and finalize-as-official is blocked with an honest message.
-- Additive only — no existing table, column, policy, or index is altered or
-- dropped.

-- ═══════════════════════════════════════════════════════════════════════════
--  1. lottery_policy
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE lottery_policy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID NOT NULL REFERENCES campus(id),

  name TEXT NOT NULL,

  -- Monotonic per campus. A new draft is always max(version) + 1; adopting one
  -- supersedes the previously adopted row rather than editing it, so the
  -- history of what governed which run is never rewritten.
  version INTEGER NOT NULL DEFAULT 1,

  -- 'draft'      — editable, cannot govern an official run
  -- 'adopted'    — the one configuration official runs at this campus bind to
  -- 'superseded' — was adopted, replaced by a later adopted version
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'adopted', 'superseded')),

  -- The full typed configuration. Shape and validation live in
  -- apps/web/lib/lottery-policy.ts; the database stores it verbatim so the
  -- snapshot copied onto a run is byte-identical to what was adopted.
  config JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- The date the governing board took the adoption action. NOT the row's
  -- created_at, and never auto-filled: an adoption date the board did not
  -- vote on is a fabricated record.
  adopted_date DATE,
  adopted_note TEXT,

  created_by UUID REFERENCES user_profile(id),
  adopted_by UUID REFERENCES user_profile(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (campus_id, version),

  -- An adopted policy must carry the date of the board action that adopted it.
  CONSTRAINT lottery_policy_adopted_needs_date
    CHECK (status <> 'adopted' OR adopted_date IS NOT NULL)
);

-- At most one adopted policy per campus. This is the constraint the engine
-- relies on when it resolves "the policy that governs this campus" — enforced
-- by the database rather than by application discipline.
CREATE UNIQUE INDEX idx_lottery_policy_one_adopted
  ON lottery_policy (campus_id)
  WHERE status = 'adopted';

CREATE INDEX idx_lottery_policy_campus ON lottery_policy (campus_id, version DESC);

COMMENT ON TABLE lottery_policy IS
  'Board-adopted lottery rules, versioned per campus. The RSV version 1 row '
  'encodes the Rooted School Vancouver Enrollment Policy adopted 2023-01-25, '
  'revised 2024-08-20. Other campuses hold drafts pending their own board '
  'adoption and state-law review.';

COMMENT ON COLUMN lottery_policy.adopted_date IS
  'Date the governing board adopted this configuration. Never inferred, never '
  'defaulted — an unverified adoption date is a fabricated compliance record.';

-- ═══════════════════════════════════════════════════════════════════════════
--  2. lottery_run: policy binding, and rehearsal runs
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE lottery_run ADD COLUMN policy_id UUID REFERENCES lottery_policy(id);

-- The immutable copy. Once a run is created under an adopted policy, editing
-- or superseding that policy cannot change how the run is read, reported, or
-- audited afterward. Preview and official both read the snapshot, never the
-- live policy row.
ALTER TABLE lottery_run ADD COLUMN policy_snapshot JSONB;

-- Dress-rehearsal runs. Execute the complete pipeline against the real
-- applicant pool with zero family-visible effect.
ALTER TABLE lottery_run ADD COLUMN is_rehearsal BOOLEAN NOT NULL DEFAULT false;

-- What the draw actually did: per-tier applicant and entry counts, sibling
-- pre-pass placements, linked-sibling activations, and any honest gaps found
-- (a weighted tier whose source field nothing collects). Written by the draw,
-- read by the preview panel and the report, so those surfaces never have to
-- recompute — or guess at — counts after the fact.
ALTER TABLE lottery_run ADD COLUMN draw_summary JSONB;

-- A rehearsal can never become the official record. Enforced here rather than
-- in application code so no code path, migration, or manual UPDATE can promote
-- one. Official is always a fresh run.
ALTER TABLE lottery_run
  ADD CONSTRAINT lottery_run_rehearsal_never_official
  CHECK (NOT is_rehearsal OR status <> 'official');

CREATE INDEX idx_lottery_run_policy ON lottery_run (policy_id);

COMMENT ON COLUMN lottery_run.policy_snapshot IS
  'Frozen copy of lottery_policy.config as it stood when this run was created. '
  'Immutable once set (see fn_lottery_run_policy_snapshot_immutable).';

-- Immutability trigger. A snapshot that can be rewritten is not evidence.
CREATE OR REPLACE FUNCTION fn_lottery_run_policy_snapshot_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.policy_snapshot IS NOT NULL
     AND NEW.policy_snapshot IS DISTINCT FROM OLD.policy_snapshot THEN
    RAISE EXCEPTION
      'lottery_run.policy_snapshot is immutable once set (run %)', OLD.id;
  END IF;

  IF OLD.policy_id IS NOT NULL
     AND NEW.policy_id IS DISTINCT FROM OLD.policy_id THEN
    RAISE EXCEPTION
      'lottery_run.policy_id is immutable once set (run %)', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lottery_run_policy_immutable
  BEFORE UPDATE ON lottery_run
  FOR EACH ROW
  EXECUTE FUNCTION fn_lottery_run_policy_snapshot_immutable();

-- ═══════════════════════════════════════════════════════════════════════════
--  3. Snapshot uniqueness — the finalize crash guard
-- ═══════════════════════════════════════════════════════════════════════════
--
-- finalizeLotteryRun commits in the order snapshot -> results -> status. The
-- Supabase JS client cannot open a multi-statement transaction, so the safety
-- argument rests on each step being individually idempotent and the sequence
-- being forward-recoverable. This index is what makes step one idempotent at
-- the database level: a retry after a crash between the snapshot insert and
-- the status flip cannot produce a duplicate snapshot row, no matter what the
-- application code does.

CREATE UNIQUE INDEX idx_lottery_snapshot_unique_entry
  ON lottery_entry_snapshot (lottery_run_id, lottery_entry_id);

-- ═══════════════════════════════════════════════════════════════════════════
--  4. lottery_notification — resumable, non-duplicating family fan-out
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Every family notification produced by a lottery run gets a ledger row. Rows
-- are written in the same operation that commits the underlying record (the
-- offer, or the waitlist position), then the fan-out walks pending rows. A
-- crash mid-fan-out leaves pending rows behind; resuming sends exactly those.
-- The unique key is what makes a resume safe: a family already marked 'sent'
-- can never be notified twice.

CREATE TABLE lottery_notification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lottery_run_id UUID NOT NULL REFERENCES lottery_run(id),
  application_id UUID NOT NULL REFERENCES application(id),

  -- 'offer'    — selected family, seat offered
  -- 'waitlist' — non-selected family, waitlist position
  kind TEXT NOT NULL CHECK (kind IN ('offer', 'waitlist')),

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed')),

  -- Context the resume path needs so it never has to reconstruct state:
  -- the offer being announced, and the waitlist position being reported.
  offer_id UUID REFERENCES offer(id),
  position_number INTEGER,
  student_name TEXT,
  expires_at TIMESTAMPTZ,

  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ,
  last_error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (lottery_run_id, application_id, kind)
);

CREATE INDEX idx_lottery_notification_pending
  ON lottery_notification (lottery_run_id, status);

COMMENT ON TABLE lottery_notification IS
  'Idempotency ledger for lottery family notifications. Written at commit '
  'time, walked afterward. A resume after a crashed fan-out sends only rows '
  'still pending, so no family is notified twice.';

-- ═══════════════════════════════════════════════════════════════════════════
--  5. RLS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Campus-scoped read for any staff member with access to the campus; manage
-- gated on enrollment_manager at that campus (the 00010_rls_triggers.sql
-- campus-scoped pattern). Adoption itself carries a stricter application-level
-- gate (system_admin) in app/staff/policy/actions.ts — RLS is the floor here,
-- not the ceiling.

ALTER TABLE lottery_policy ENABLE ROW LEVEL SECURITY;

CREATE POLICY lottery_policy_staff_read ON lottery_policy
  FOR SELECT TO authenticated
  USING (user_has_campus_access(campus_id));

CREATE POLICY lottery_policy_manage ON lottery_policy
  FOR ALL TO authenticated
  USING (user_has_campus_role(campus_id, 'enrollment_manager'))
  WITH CHECK (user_has_campus_role(campus_id, 'enrollment_manager'));

-- lottery_notification carries no campus_id of its own; it joins through the
-- run. Staff-read only — every write goes through the service-role client
-- inside the lottery mutations, matching audit_event and email_event
-- (00045_email_events.sql:39-44).
ALTER TABLE lottery_notification ENABLE ROW LEVEL SECURITY;

CREATE POLICY lottery_notification_staff_read ON lottery_notification
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM lottery_run r
      WHERE r.id = lottery_run_id AND user_has_campus_access(r.campus_id)
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
--  6. SEED — Rooted School Vancouver, adopted policy version 1
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Source: RSV Board Enrollment Policy, adopted 2023-01-25, revised 2024-08-20.
--
-- Campuses are resolved by short_code because two seed files disagree on the
-- campus UUID namespace (00012_seed_data.sql uses 33333333-…, supabase/seed.sql
-- uses 00000000-0000-0000-0002-…). Cleveland additionally appears as 'RSC' in
-- the migration seed and 'CLE' in seed.sql, so both are matched. Nothing is
-- inserted for a campus that does not exist.

INSERT INTO lottery_policy (campus_id, name, version, status, adopted_date, adopted_note, config)
SELECT
  c.id,
  'Rooted School Vancouver Enrollment Policy',
  1,
  'adopted',
  DATE '2024-08-20',
  'Adopted by the Rooted School Vancouver Board of Directors 2023-01-25; revised 2024-08-20. Seeded from the board-adopted policy document.',
  jsonb_build_object(
    'schemaVersion', 1,
    'jurisdiction', 'WA',
    'adoptedBy', 'Rooted School Vancouver Board of Directors',
    'sourceDocument', 'Rooted School Vancouver Enrollment Policy (adopted 2023-01-25, revised 2024-08-20)',
    'administeredBy', 'Director of Operations',

    -- Windows. Application period Nov 1 through the last day of February;
    -- lottery and offers on March 1, moving to the next weekday if March 1
    -- falls on a weekend.
    'applicationWindow', jsonb_build_object(
      'opensMonthDay', '11-01',
      'closesRule', 'last_day_of_february',
      'note', 'Applications are accepted November 1 through the last day of February.'
    ),
    'lotteryDate', jsonb_build_object(
      'monthDay', '03-01',
      'weekendRule', 'next_weekday',
      'note', 'Lottery is held and offers are made on March 1, or the next weekday when March 1 falls on a weekend.'
    ),

    -- Absolute preference: siblings of currently enrolled students are placed
    -- before the draw. Not a weighted advantage — a categorical one.
    'absolutePreferences', jsonb_build_array(
      jsonb_build_object(
        'key', 'sibling_current_enrolled',
        'label', 'Sibling of a currently enrolled student',
        'enabled', true,
        'autoOfferBeforeDraw', true,
        'overflowToPriorityWaitlist', true,
        'siblingDefinition', 'shared_legal_guardian',
        'definition', 'A sibling shares a legal parent or guardian with a student currently enrolled at this campus. Foster placements are excluded until legal guardianship is established.',
        'fosterExcludedUntilLegalGuardianship', true,
        'verificationMayBeRequired', true,
        'falseClaimForfeitsSeat', true,
        'authorityNote', 'RSV Board Enrollment Policy, adopted 2023-01-25, revised 2024-08-20.'
      )
    ),

    -- Weighted entries. Multiplied chances, never guarantees.
    'defaultWeight', 1,
    'weightedTiers', jsonb_build_array(
      jsonb_build_object(
        'key', 'staff_child',
        'label', 'Child of contracted full-time staff',
        'weight', 5,
        'enabled', true,
        'optional', false,
        'source', jsonb_build_object(
          'kind', 'application_answer',
          'field', 'is_staff_child',
          'matchValues', jsonb_build_array('yes', 'true'),
          'note', 'Legal custody by a contracted full-time employee, declared on the original application.'
        ),
        'authorityNote', 'RSV Board Enrollment Policy, adopted 2023-01-25, revised 2024-08-20: children of contracted full-time staff receive five lottery entries.'
      ),
      jsonb_build_object(
        'key', 'economically_disadvantaged',
        'label', 'Economically disadvantaged (FRL-qualifying)',
        'weight', 3,
        'enabled', true,
        'optional', false,
        'source', jsonb_build_object(
          'kind', 'application_answer',
          'field', 'is_frl_qualifying',
          'matchValues', jsonb_build_array('yes', 'true'),
          'note', 'Must be indicated on the ORIGINAL application; verified later through the meal benefit form.'
        ),
        'authorityNote', 'RSV Board Enrollment Policy, adopted 2023-01-25, revised 2024-08-20: economically disadvantaged applicants receive three lottery entries.'
      )
    ),

    -- Siblings who are BOTH new applicants gain sibling preference only once
    -- one of them has been drawn.
    'linkedSiblingActivation', true,

    -- No legacy preference: siblings of graduated or departed students get
    -- nothing. Encoded explicitly so it cannot be assumed either way.
    'legacyPreference', false,

    'preferencesFromOriginalApplicationOnly', true,
    'falsifiedInformationInvalidates', true,
    'preferenceClaimNote', 'Preferences derive only from the original application. Omissions cannot be claimed after the application window closes. Falsified information invalidates the application for the year.',

    -- Acceptance: 14 days after the lottery, cutting off at 4pm on day 14.
    -- Waitlist families are notified on day 15.
    'acceptanceWindowDays', 14,
    'acceptanceCutoffTime', '16:00',
    'acceptanceNote', 'Staff attempt personal verification during the acceptance window. A seat not accepted by 4:00 PM on day 14 is released to the waitlist. Waitlist families are notified on day 15.',
    'waitlistNotifyDayOffset', 15,
    'enrollmentPacketDueDays', 30,
    'reenrollmentDueDays', 30,

    -- Waitlist offers run on a two-day clock, cutting off at 4pm on day 2.
    'waitlistOfferWindow', jsonb_build_object(
      'days', 2,
      'cutoffTime', '16:00',
      'note', 'A waitlist offer expires at 4:00 PM on the second day, then passes to the next family.'
    ),
    'waitlistScope', 'per_grade',
    'waitlistCarryover', false,
    'waitlistNote', 'Waitlists are created per grade immediately after the lottery and never carry over from year to year. A family who withdraws after registration must reapply and joins the bottom of the waitlist.',

    -- Public lottery conduct.
    'observers', jsonb_build_array(
      jsonb_build_object('role', 'Board representative', 'required', true),
      jsonb_build_object('role', 'Community partner representative', 'required', true)
    ),
    'openMeetingsActCompliance', true,
    'openMeetingsActNote', 'The lottery is public and conducted in compliance with the Washington Open Public Meetings Act. Results are communicated to families immediately through the platform.',

    'postLotteryRolling', jsonb_build_object(
      'allowed', false,
      'exceptions', jsonb_build_array(
        'A grade is under capacity and its waitlist is empty.',
        'The application window has been formally reopened.'
      )
    ),
    'backfillRule', 'No backfill after the first trimester unless advisory capacity falls below 80 percent.',
    'mckinneyVentoNote', 'Enrollment of students experiencing homelessness is never delayed for missing records, per the McKinney-Vento Act.',

    -- Options available in the editor but NOT authorized at RSV. Each stays
    -- disabled and cannot be enabled without an authority citation.
    'optionalFeatures', jsonb_build_object(
      'multiBirthSingleUnit', jsonb_build_object('enabled', false, 'authorityNote', ''),
      'foundersChildren', jsonb_build_object('enabled', false, 'weight', 1, 'capPercent', 0, 'authorityNote', ''),
      'geographicZone', jsonb_build_object('enabled', false, 'weight', 1, 'zoneDescription', '', 'authorityNote', ''),
      'militaryFamily', jsonb_build_object('enabled', false, 'weight', 1, 'authorityNote', ''),
      'boardMemberChildren', jsonb_build_object('enabled', false, 'weight', 1, 'authorityNote', ''),
      'returningStudentExemption', jsonb_build_object('enabled', false, 'note', '', 'authorityNote', '')
    )
  )
FROM campus c
WHERE c.short_code = 'RSV'
  AND NOT EXISTS (
    SELECT 1 FROM lottery_policy p WHERE p.campus_id = c.id AND p.version = 1
  );

-- ═══════════════════════════════════════════════════════════════════════════
--  7. SEED — C.R. Neal Academy and Rooted Schools Cleveland: DRAFT ONLY
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Copies of the RSV structure so each campus has somewhere to start, marked
-- draft and carrying an explicit warning. South Carolina and Ohio charter law
-- differ from Washington's, and neither board has adopted this text. The
-- application refuses to run an official lottery against a draft.

INSERT INTO lottery_policy (campus_id, name, version, status, adopted_date, adopted_note, config)
SELECT
  c.id,
  c.name || ' Enrollment Policy (draft)',
  1,
  'draft',
  NULL,
  'Drafted from RSV policy — requires board adoption and state-law review before any official lottery',
  (
    SELECT p.config
      || jsonb_build_object(
           'jurisdiction', CASE WHEN c.short_code = 'CRN' THEN 'SC' ELSE 'OH' END,
           'adoptedBy', '',
           'sourceDocument', 'Drafted from the Rooted School Vancouver Enrollment Policy. Not adopted. Requires board adoption and state-law review.',
           'observers', jsonb_build_array(),
           'openMeetingsActCompliance', false,
           'openMeetingsActNote', 'Washington Open Public Meetings Act provisions do not apply here. Confirm the public-meeting requirements of this state before conducting a lottery.'
         )
    FROM lottery_policy p
    JOIN campus rsv ON rsv.id = p.campus_id AND rsv.short_code = 'RSV'
    WHERE p.version = 1
    LIMIT 1
  )
FROM campus c
WHERE c.short_code IN ('CRN', 'RSC', 'CLE')
  AND EXISTS (
    SELECT 1 FROM lottery_policy p
    JOIN campus rsv ON rsv.id = p.campus_id AND rsv.short_code = 'RSV'
    WHERE p.version = 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM lottery_policy p WHERE p.campus_id = c.id AND p.version = 1
  );

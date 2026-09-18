-- ============================================
-- Lead interest survey (one-question nurture personalisation)
-- ============================================
--
-- The first nurture email in a cold-list campaign now carries a one-question
-- survey ("what matters most to your family?") so later emails can be
-- personalised by what each family actually cares about, instead of staying
-- generic. Answered from a public, unauthenticated landing page
-- (app/(public)/interest) reached by a tokenized link in the email — same
-- shape as the existing unsubscribe flow.
--
-- interest_focus / interest_focus_other / interest_focus_answered_at mirror
-- inquiry_intent's pattern (see 00062_lead_inquiry_intent.sql): CHECK keeps
-- the answer to the known set (or NULL for leads who haven't answered yet),
-- and the "answered_at" timestamp re-stamps every time the family picks —
-- including picking a different option later, which is a legitimate change
-- of mind, not an error.
--
-- survey_token is deliberately its own column, NOT a reuse of
-- unsubscribe_token (00032_email_compliance.sql). The two links carry very
-- different power: unsubscribe_token silences all recruitment email for the
-- family, while a survey link is meant to be shared, forwarded, and clicked
-- by anyone in the household. A forwarded survey link must never double as
-- an unsubscribe link — if a sibling, grandparent, or the wrong inbox opens
-- it, the worst case should be an updated survey answer, not the family
-- silently dropping off every future campaign. Do not "simplify" this by
-- collapsing the two tokens back into one.

ALTER TABLE lead
  ADD COLUMN IF NOT EXISTS interest_focus TEXT
  CHECK (interest_focus IS NULL OR interest_focus IN (
    'career_connected', 'hbcu_authorized', 'career_majors', 'financial_literacy', 'other'
  ));

COMMENT ON COLUMN lead.interest_focus IS
  'Family''s answer to the one-question interest survey sent in the first nurture email: career_connected, hbcu_authorized, career_majors, financial_literacy, or other. NULL until answered.';

ALTER TABLE lead
  ADD COLUMN IF NOT EXISTS interest_focus_other TEXT;

COMMENT ON COLUMN lead.interest_focus_other IS
  'Free text the family entered when interest_focus = ''other''. NULL otherwise.';

ALTER TABLE lead
  ADD COLUMN IF NOT EXISTS interest_focus_answered_at TIMESTAMPTZ;

COMMENT ON COLUMN lead.interest_focus_answered_at IS
  'When interest_focus was last set. Re-stamped every time the family answers again (picking a different option is a legitimate change of mind, not an error).';

-- Separate capability token for the public survey landing page. NOT the same
-- token as unsubscribe_token — see the comment block above. Every existing
-- lead gets a value via the column default the moment this migration runs,
-- so the backfill for ~1,316 existing C.R. Neal leads is automatic.
ALTER TABLE lead
  ADD COLUMN IF NOT EXISTS survey_token UUID NOT NULL DEFAULT gen_random_uuid();

COMMENT ON COLUMN lead.survey_token IS
  'Capability token for the public one-question interest survey (app/(public)/interest). Distinct from unsubscribe_token on purpose: a forwarded survey link must never carry the power to unsubscribe the family.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_survey_token ON lead (survey_token);

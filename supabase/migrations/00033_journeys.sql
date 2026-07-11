-- ============================================
-- LG-2: journey engine — multi-step nurture sequences with exits
-- ============================================
-- A journey is an ordered list of timed steps. A lead is enrolled in a
-- journey and advances one step at a time on a daily cron. The exit rule is
-- the whole point: enrollment ends the instant the family applies, RSVPs,
-- gets a logged staff call, or unsubscribes — nobody gets an "apply?" email
-- the day after they applied.

CREATE TABLE journey (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID REFERENCES campus(id),  -- NULL = network default template
  key TEXT NOT NULL,                     -- 'push_to_apply' | 'keep_the_seat' | 'event_follow_up' | custom
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE journey_step (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id UUID NOT NULL REFERENCES journey(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  delay_days INTEGER NOT NULL DEFAULT 0,   -- days after the PREVIOUS step (step 1 = days after enrollment)
  template_key TEXT NOT NULL,              -- reuses campaign templates (reintroduction, event_invite, …)
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (journey_id, step_order)
);

CREATE TABLE journey_enrollment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id UUID NOT NULL REFERENCES journey(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES lead(id) ON DELETE CASCADE,
  current_step INTEGER NOT NULL DEFAULT 0,  -- last completed step; 0 = none sent yet
  status TEXT NOT NULL DEFAULT 'active',    -- 'active' | 'completed' | 'exited'
  exit_reason TEXT,                          -- 'applied' | 'rsvp' | 'contacted' | 'unsubscribed' | 'manual'
  next_step_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  UNIQUE (journey_id, lead_id)
);

CREATE INDEX idx_journey_campus ON journey(campus_id, is_active);
CREATE INDEX idx_journey_step_order ON journey_step(journey_id, step_order);
CREATE INDEX idx_enrollment_due ON journey_enrollment(status, next_step_at) WHERE status = 'active';
CREATE INDEX idx_enrollment_lead ON journey_enrollment(lead_id);

ALTER TABLE journey ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_step ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_enrollment ENABLE ROW LEVEL SECURITY;

-- Staff read/manage journeys for campuses they can access (plus network
-- templates, campus_id NULL, visible to all staff).
CREATE POLICY journey_staff ON journey FOR ALL TO authenticated
  USING (campus_id IS NULL OR user_has_campus_access(campus_id));
CREATE POLICY journey_step_staff ON journey_step FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM journey j WHERE j.id = journey_id AND (j.campus_id IS NULL OR user_has_campus_access(j.campus_id))));
CREATE POLICY journey_enrollment_staff ON journey_enrollment FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM lead l WHERE l.id = lead_id AND user_has_campus_access(l.campus_id)));

CREATE TRIGGER trg_journey_updated_at BEFORE UPDATE ON journey
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ─── Engagement tracking (opens/clicks from Resend webhooks) ────────────────
-- Recorded as lead_activity already; this column lets journeys branch and the
-- lead detail surface real engagement without scanning the activity log.
ALTER TABLE lead
  ADD COLUMN last_email_opened_at TIMESTAMPTZ,
  ADD COLUMN last_email_clicked_at TIMESTAMPTZ;

-- ─── Cost-per-enrollment (ad spend entry) ──────────────────────────────────
CREATE TABLE channel_spend (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID NOT NULL REFERENCES campus(id),
  channel TEXT NOT NULL,                 -- matches lead.source ('ad', 'qr', …) or a campaign label
  amount_cents INTEGER NOT NULL,
  period_month DATE NOT NULL,            -- first of month the spend applies to
  note TEXT,
  created_by UUID REFERENCES user_profile(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_channel_spend_campus ON channel_spend(campus_id, period_month);
ALTER TABLE channel_spend ENABLE ROW LEVEL SECURITY;
CREATE POLICY channel_spend_staff ON channel_spend FOR ALL TO authenticated
  USING (user_has_campus_access(campus_id));

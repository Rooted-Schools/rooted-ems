-- Migration 00045: per-send email engagement tracking (open/click pipeline).
--
-- Answers the owner's question: "Is there a way in the recruitment Journey
-- to determine if they opened the email?" One row per outbound Resend send
-- (journey step, campaign, welcome, re-engagement, one-off), keyed by the
-- Resend message id, stamped by the webhook (app/api/webhooks/resend/route.ts)
-- as delivery/open/click events arrive.
--
-- CAVEAT — read before trusting "opened" as a metric: Apple Mail Privacy
-- Protection (and similar proxies in Gmail/Outlook image proxying) pre-fetches
-- the tracking pixel for every email at delivery time, regardless of whether
-- the recipient ever looks at it. On an iOS/Apple Mail-heavy list this
-- inflates open rates toward 100% and makes "opened" close to meaningless on
-- its own. Clicks require an actual tap on a real link and are not spoofed by
-- privacy proxies the same way — treat click_count / clicked_at as the
-- reliable engagement signal, and opened_at as a weak, directional one.
--
-- Applied manually (see docs/REDTEAM_HANDOFF.md). Additive only. Every piece
-- of code that reads or writes this table must degrade gracefully when it
-- doesn't exist yet — log once, skip, never break a send or the webhook.

CREATE TABLE email_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resend_id TEXT UNIQUE NOT NULL,
  to_email TEXT NOT NULL,
  lead_id UUID REFERENCES lead(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,             -- 'journey_step' | 'campaign' | 'welcome' | 'reengagement' | 'one_off'
  subject TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  open_count INT NOT NULL DEFAULT 0,
  click_count INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_email_event_lead_id ON email_event(lead_id);

ALTER TABLE email_event ENABLE ROW LEVEL SECURITY;

-- Staff-read only, same gate as email_suppression post-00039 (M14): real
-- staff membership (user_campus_role row), not the forgeable is_staff bit.
CREATE POLICY email_event_staff_read ON email_event FOR SELECT TO authenticated
  USING (user_is_staff_member());

-- No INSERT/UPDATE policy for `authenticated` — writes come only from the
-- service role (lib/email.ts on send, the Resend webhook on delivery/open/
-- click), matching the pattern for audit_event and public_submission_log.

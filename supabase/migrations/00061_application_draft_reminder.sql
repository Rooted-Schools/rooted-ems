-- ============================================
-- Draft-reminder throttle marker
-- ============================================
--
-- A family can start an application, save it as a draft, and never come back
-- to submit it, quietly missing the lottery (raised by a pilot tester). The
-- nudge-drafts cron (app/api/cron/nudge-drafts) sends one gentle reminder per
-- interval while the enrollment window is still open.
--
-- This column is the throttle/claim marker for that cron, exactly the role
-- registration_packet.last_nudged_at plays for nudge-registrations and
-- offer.reminder_sent_at plays for offer-reminders: the runner flips it inside
-- an atomic guarded UPDATE so a draft is reminded at most once per interval,
-- even if two runs overlap.

ALTER TABLE application
  ADD COLUMN IF NOT EXISTS draft_reminder_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN application.draft_reminder_sent_at IS
  'Last time the draft-completion reminder was sent for this application. Set by the nudge-drafts cron as a throttle/claim marker; NULL means never reminded.';

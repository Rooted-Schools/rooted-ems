-- Migration 038: Re-enrollment intent pulse
--
-- Spring re-enrollment campaign: before staff formally offer a seat for the
-- next school year (see staffInitiateReenrollment in
-- app/staff/enrollment/re-enrollment-actions.ts, which creates a new
-- application + enrollment row), families are asked a lightweight one-tap
-- question on their CURRENT active enrollment: are you coming back?
--
-- reenrollment_intent / reenrollment_intent_at capture the family's answer.
-- reenrollment_pulse_sent_at is the throttle marker for the staff-triggered
-- "Send pulse" action, mirroring offer.reminder_sent_at (00026) and
-- registration_packet.last_nudged_at (00027) — at-most-once-per-window sends.

ALTER TABLE enrollment
  ADD COLUMN reenrollment_intent TEXT,
  ADD COLUMN reenrollment_intent_at TIMESTAMPTZ,
  ADD COLUMN reenrollment_pulse_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN enrollment.reenrollment_intent IS
  'Family''s one-tap answer to the spring intent-to-return pulse: ''yes'' | ''undecided'' | ''no''. NULL = no response yet.';
COMMENT ON COLUMN enrollment.reenrollment_intent_at IS
  'When the family last set reenrollment_intent. NULL = no response yet.';
COMMENT ON COLUMN enrollment.reenrollment_pulse_sent_at IS
  'Last time staff triggered the re-enrollment pulse notification for this enrollment. NULL = never pulsed. Throttled to once per 7 days.';

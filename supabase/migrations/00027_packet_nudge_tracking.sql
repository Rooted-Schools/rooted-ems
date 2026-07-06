-- Missing-document nudge throttle.
-- The nudge cron re-nudges a stalled registration packet at most once per
-- window (see NUDGE_INTERVAL_DAYS in the cron route); this timestamp is the
-- claim/throttle marker, mirroring offer.reminder_sent_at from 00026.
ALTER TABLE registration_packet
  ADD COLUMN last_nudged_at TIMESTAMPTZ;

COMMENT ON COLUMN registration_packet.last_nudged_at IS
  'Last time the missing-items nudge cron notified this family. NULL = never nudged.';

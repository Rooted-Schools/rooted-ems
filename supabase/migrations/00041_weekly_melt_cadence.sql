-- Migration 00041: weekly summer-melt outreach (playbook PB 24 v2.2).
--
-- The playbook changelog records the melt contact standard being CORRECTED to
-- WEEKLY, lottery day through the first day of school, with any family at 14+
-- days since contact auto-flagged MELT_RISK. The app sent exactly one touch,
-- ever: cron/keep-the-seat claimed `keep_the_seat_sent_at` and never looked at
-- that family again.
--
-- Two clocks, deliberately kept separate:
--
--   last_outreach_at  advances on every AUTOMATED touch. Drives the weekly
--                     email cadence.
--   contacted_at      (00036) advances only when a human logs real contact.
--                     Drives MELT_RISK.
--
-- Keeping them apart is the whole point. If an automated email reset the risk
-- clock, the system would mark a family "contacted" precisely when no human
-- had spoken to them, and the families being quietly ignored would be the ones
-- the report declared healthy. The playbook says PERSONAL outreach weekly;
-- automation is the backstop, never the evidence.
--
-- keep_the_seat_sent_at is retained rather than repurposed: it still records
-- the first congratulations touch, which is a different thing from the most
-- recent check-in, and existing rows carry real history we should not rewrite.

ALTER TABLE registration_packet ADD COLUMN last_outreach_at TIMESTAMPTZ;

COMMENT ON COLUMN registration_packet.last_outreach_at IS
  'Last AUTOMATED melt-prevention touch. Drives the weekly cadence in '
  'cron/keep-the-seat. Never used for MELT_RISK: that reads contacted_at, '
  'which only a human can advance.';

-- Backfill so the first weekly run after deploy does not re-contact everyone
-- who already had their one-time touch on the same day.
UPDATE registration_packet
   SET last_outreach_at = keep_the_seat_sent_at
 WHERE keep_the_seat_sent_at IS NOT NULL
   AND last_outreach_at IS NULL;

-- The weekly sweep scans complete packets ordered by how stale the last touch
-- is. NULLs first: never-touched families are the most urgent, not the least.
CREATE INDEX idx_registration_packet_melt_cadence
  ON registration_packet (last_outreach_at NULLS FIRST)
  WHERE status = 'complete';

-- MELT_RISK reads a different column and needs its own index.
CREATE INDEX idx_registration_packet_melt_risk
  ON registration_packet (contacted_at NULLS FIRST)
  WHERE status = 'complete';

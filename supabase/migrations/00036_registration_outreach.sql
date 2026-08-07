-- Migration 036: Registration Outreach Tracking
--
-- Two additive timestamp columns supporting the registration-melt program
-- (Today "Needs a phone call" queue + the keep-the-seat cron — see
-- apps/web/lib/queries/melt.ts, apps/web/app/staff/today,
-- apps/web/app/api/cron/keep-the-seat).
--
-- registration_packet.contacted_at
--   Stamped when staff mark a stalled packet "contacted" from the Today
--   call-escalation queue. Kept deliberately separate from last_nudged_at
--   (migration 00027), which is reserved for the automated missing-items
--   nudge cron: folding a human phone call into that column would make
--   last_nudged_at lie about what actually happened (an automated send vs.
--   a staff member on the phone). The human-readable record of WHO called
--   and WHEN lives in the `note` table (lib/mutations/notes.ts createNote,
--   entity_type = 'application') — this column is only the machine
--   throttle that removes the row from the call queue for the same 7-day
--   window the queue itself uses to decide who belongs in it.
--
-- registration_packet.keep_the_seat_sent_at
--   One-time dedupe marker for the "keep the seat" welcome email/SMS sent
--   2+ days after a packet completes, before the school year starts.
--   communication_log (00008) was inspected first: its rows carry
--   recipient_user_id/campus_id/subject/body but no enrollment_id or
--   application_id, so a family with multiple students or multiple
--   enrollments across years cannot be deduped from it without risking a
--   cross-record collision. A dedicated timestamp on the packet itself
--   (mirroring reminder_sent_at 00026 and last_nudged_at 00027) is the
--   honest, minimal alternative — checked and only added because neither
--   an existing column nor communication_log actually fit.
--
-- Additive only: no existing column, table, or policy is altered or
-- dropped. Both columns default NULL for all existing rows — no history is
-- invented; only new outreach going forward is recorded.

ALTER TABLE registration_packet ADD COLUMN contacted_at TIMESTAMPTZ;
ALTER TABLE registration_packet ADD COLUMN keep_the_seat_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN registration_packet.contacted_at IS
  'Last time staff logged a phone call to this family from the Today "Needs a phone call" queue. NULL = never marked contacted. Distinct from last_nudged_at, which tracks only the automated nudge cron.';

COMMENT ON COLUMN registration_packet.keep_the_seat_sent_at IS
  'When the one-time keep-the-seat welcome email/SMS was sent after packet completion. NULL = not yet sent. Throttle/dedupe marker for app/api/cron/keep-the-seat, mirroring last_nudged_at (00027) and reminder_sent_at (00026).';

-- Partial indexes so each query only scans the rows it can actually act on.
CREATE INDEX idx_regpacket_call_queue
  ON registration_packet (created_at)
  WHERE status IN ('pending', 'in_progress');

CREATE INDEX idx_regpacket_keep_the_seat
  ON registration_packet (verified_at)
  WHERE status = 'complete' AND keep_the_seat_sent_at IS NULL;

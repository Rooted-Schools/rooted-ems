-- Migration 037: Event RSVP conversion loop — reminders, check-in, follow-ups
--
-- Events currently capture RSVPs and stop. Four additive timestamp columns
-- on event_rsvp support the full loop implemented in
-- app/api/cron/event-followups (reminders + next-morning follow-ups) and
-- the staff check-in roster on the event detail page
-- (app/staff/recruitment/events/[id]):
--
-- reminded_24h_at / reminded_2h_at
--   Dedupe markers for the two pre-event reminder sends (~24h and ~2h
--   before event.starts_at). Mirrors reminder_sent_at (00026) and
--   last_nudged_at (00027): a NULL-guarded UPDATE ... WHERE col IS NULL
--   is the atomic per-row claim, same pattern app/api/cron/offer-reminders
--   and app/api/cron/keep-the-seat already use.
--
-- checked_in_at
--   Stamped when staff tap "Check in" on the event detail roster, or when
--   a walk-in family is quick-added at the door. This is the honest
--   attendance signal — the attribution link between recruitment effort
--   (the RSVP) and who actually showed up — and is what the follow-up
--   cron reads to tell attendees from no-shows. Distinct from
--   event_rsvp.status = 'attended', which staff could already set by hand
--   from the existing Attended/No-show buttons; check-in sets both so the
--   two stay consistent, but this timestamp is the record of *when*
--   someone was actually marked present at the door, which status alone
--   never captured.
--
-- followup_sent_at
--   One-time dedupe marker for the next-morning "great to meet you"
--   (attendees) / "we missed you" (no-shows) follow-up.
--
-- Additive only: no existing column, table, or policy is altered or
-- dropped. All four columns default NULL for every existing row — no
-- history is invented; only sends and check-ins going forward are
-- recorded. Migrations are applied manually, so every code path that
-- reads or writes these columns (lib/mutations/events.ts,
-- lib/queries/events.ts, app/api/cron/event-followups) must degrade
-- gracefully — log once, skip — when they are absent.

ALTER TABLE event_rsvp ADD COLUMN reminded_24h_at TIMESTAMPTZ;
ALTER TABLE event_rsvp ADD COLUMN reminded_2h_at TIMESTAMPTZ;
ALTER TABLE event_rsvp ADD COLUMN checked_in_at TIMESTAMPTZ;
ALTER TABLE event_rsvp ADD COLUMN followup_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN event_rsvp.reminded_24h_at IS
  'When the ~24h-before-event reminder (bilingual email + consented SMS) was sent. NULL = not yet sent. Throttle marker for app/api/cron/event-followups.';
COMMENT ON COLUMN event_rsvp.reminded_2h_at IS
  'When the ~2h-before-event short reminder was sent. NULL = not yet sent. Throttle marker for app/api/cron/event-followups.';
COMMENT ON COLUMN event_rsvp.checked_in_at IS
  'When staff checked this family in at the door (or a walk-in was recorded). NULL = not checked in. Read by the check-in roster on the staff event detail page and by the next-morning follow-up cron to tell attendees from no-shows.';
COMMENT ON COLUMN event_rsvp.followup_sent_at IS
  'When the next-morning post-event follow-up (attendee thank-you or no-show note) was sent. NULL = not yet sent. Throttle marker for app/api/cron/event-followups.';

-- Partial indexes so the cron only scans rows it can actually act on.
CREATE INDEX idx_rsvp_reminder_24h_pending
  ON event_rsvp (event_id)
  WHERE status != 'cancelled' AND reminded_24h_at IS NULL;

CREATE INDEX idx_rsvp_reminder_2h_pending
  ON event_rsvp (event_id)
  WHERE status != 'cancelled' AND reminded_2h_at IS NULL;

CREATE INDEX idx_rsvp_followup_pending
  ON event_rsvp (event_id)
  WHERE status != 'cancelled' AND followup_sent_at IS NULL;

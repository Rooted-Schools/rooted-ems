-- Migration 00040: Capture WHY a family declines a seat.
--
-- Playbook PB 24 v2.2 Section 15 requires post-lottery refusal tracking. The
-- schema already had offer.revoke_reason (staff revoking a seat) and
-- waitlist_position.removal_reason, but nothing recorded the family's own
-- reason. That is the highest-value learning signal in the funnel and it was
-- being discarded at the moment it was offered.
--
-- Design notes:
--   * Enum, not free text, so the reason is reportable by campus and subgroup.
--     A free-text note rides alongside for nuance.
--   * Nullable. Historical declines have no reason and must not be invented,
--     and a staff-side decline (recorded on a family's behalf by phone) may
--     legitimately not capture one.
--   * 'other' exists so a family is never forced into a wrong bucket, which
--     would poison the very data this is meant to produce.

CREATE TYPE decline_reason AS ENUM (
  'chose_another_school',
  'transportation',
  'program_fit',
  'moved',
  'timing',
  'other'
);

ALTER TABLE offer ADD COLUMN decline_reason decline_reason;
ALTER TABLE offer ADD COLUMN decline_note TEXT;

COMMENT ON COLUMN offer.decline_reason IS
  'Why the FAMILY declined the seat (playbook s15 refusal tracking). Distinct '
  'from revoke_reason, which is why STAFF pulled the seat back. Null is '
  'meaningful: it records that no reason was captured, never that none exists.';

COMMENT ON COLUMN offer.decline_note IS
  'Optional free text accompanying decline_reason. Never required.';

-- Reporting reads declines by campus over a window; the partial index keeps
-- that scan off the full offer table.
CREATE INDEX idx_offer_decline_reason
  ON offer (campus_id, decline_reason, responded_at)
  WHERE status = 'declined';

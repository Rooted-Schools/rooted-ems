-- Migration 034: Waitlist Position History
--
-- Normalized, append-only ledger of every waitlist_position change (initial
-- placement, promotion, removal, and effective-rank recalculation when
-- someone ahead on the same waitlist leaves it). Lets the family portal show
-- REAL movement ("Moved up from 7 to 4 on May 3") instead of inferring it —
-- see lib/mutations/waitlist-history.ts and lib/queries/family.ts
-- (getWaitlistHistory).
--
-- Additive only: no existing table, column, or policy is altered or dropped.
-- History begins now — existing waitlist_position rows get no invented prior
-- entries; only NEW changes going forward are recorded.

CREATE TABLE waitlist_position_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  waitlist_position_id UUID NOT NULL REFERENCES waitlist_position(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES application(id),
  position_number INTEGER NOT NULL,
  -- 'initial' | 'promoted' | 'removed' | 'recalculated' | 'manual_adjustment'
  -- Free-text (not an enum) so a new change_type never requires a migration.
  change_type TEXT NOT NULL,
  reason TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_waitlist_position_history_position
  ON waitlist_position_history (waitlist_position_id, changed_at);

CREATE INDEX idx_waitlist_position_history_application
  ON waitlist_position_history (application_id, changed_at);

-- ============================================
-- RLS — mirrors waitlist_position exactly
-- ============================================
--
-- waitlist_position's own policy (00010_rls_triggers.sql):
--   CREATE POLICY wp_staff ON waitlist_position FOR ALL TO authenticated
--     USING (EXISTS (SELECT 1 FROM waitlist w WHERE w.id = waitlist_id AND user_has_campus_access(w.campus_id)));
--
-- There is no family-facing SELECT policy on waitlist_position either —
-- families read their own standing through service-role queries in
-- lib/queries/family.ts (getWaitlistStandings), gated by an application id
-- already proven theirs via an RLS-scoped read. getWaitlistHistory follows
-- the identical pattern for this table, so no additional policy is added
-- here beyond the staff one being mirrored.

ALTER TABLE waitlist_position_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY wph_staff ON waitlist_position_history FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM waitlist_position wp
    JOIN waitlist w ON w.id = wp.waitlist_id
    WHERE wp.id = waitlist_position_id AND user_has_campus_access(w.campus_id)
  ));

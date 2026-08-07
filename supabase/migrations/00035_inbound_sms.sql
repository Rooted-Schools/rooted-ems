-- Migration 035: Inbound SMS (two-way texting)
--
-- Outbound texts already exist (apps/web/lib/sms.ts → Twilio REST). This
-- table is the landing place for the other direction: family replies
-- delivered by Twilio to /api/webhooks/twilio.
--
-- Why a new table rather than communication_log: communication_log models
-- an OUTBOUND send only. It has no direction column, its recipient_address
-- is NOT NULL and describes a destination (not a sender), and
-- recipient_user_id is a FK to user_profile — most texting families are
-- leads with no auth user at all. Forcing an inbound message into that
-- shape would mean lying in at least two columns, so inbound gets its own
-- honest one.
--
-- Additive only: no existing table, column, policy, or index is altered.
-- apps/web/lib/inbound-sms.ts degrades gracefully when this migration has
-- not been applied yet — the reply is logged to the server console and
-- campus staff are still notified with the full message body embedded, so
-- no family reply is ever silently lost while the migration is pending.

CREATE TABLE inbound_sms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Twilio's message identifier. UNIQUE is the dedupe key: Twilio retries a
  -- webhook that doesn't 200 quickly enough, and a retry must not create a
  -- second row or a second staff notification.
  message_sid TEXT NOT NULL UNIQUE,

  -- The sender, normalized to E.164 by lib/sms.ts (normalizePhone).
  from_phone TEXT NOT NULL,

  -- At most one of these is set. Both NULL = an unrecognized number; the
  -- row is kept anyway so staff have a record rather than a vanished text.
  matched_guardian_id UUID REFERENCES guardian(id),
  matched_lead_id UUID REFERENCES lead(id),

  -- Resolved from the matched guardian's most recent application, or from
  -- the matched lead. NULL when the number matched nobody.
  campus_id UUID REFERENCES campus(id),

  body TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inbound_sms_campus ON inbound_sms (campus_id, received_at DESC);
CREATE INDEX idx_inbound_sms_guardian ON inbound_sms (matched_guardian_id, received_at DESC)
  WHERE matched_guardian_id IS NOT NULL;
CREATE INDEX idx_inbound_sms_lead ON inbound_sms (matched_lead_id, received_at DESC)
  WHERE matched_lead_id IS NOT NULL;
CREATE INDEX idx_inbound_sms_from ON inbound_sms (from_phone, received_at DESC);

-- ============================================
-- RLS — staff-only, campus-scoped
-- ============================================
--
-- Mirrors the campus-ownership pattern used by lead (00028_crm_leads.sql)
-- and inquiry (00011_phase6_additions.sql): staff read only the campuses
-- they have access to. Unmatched replies (campus_id IS NULL) can't be
-- attributed to a campus, so only system_admin sees them — an unknown
-- number must never leak into another campus's view.
--
-- No INSERT/UPDATE/DELETE policy: writes happen exclusively through the
-- service-role client in the Twilio webhook path, never from a session.

ALTER TABLE inbound_sms ENABLE ROW LEVEL SECURITY;

CREATE POLICY inbound_sms_staff_select ON inbound_sms FOR SELECT TO authenticated
  USING (
    (campus_id IS NOT NULL AND user_has_campus_access(campus_id))
    OR user_is_system_admin()
  );

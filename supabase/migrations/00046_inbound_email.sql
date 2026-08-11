-- Migration 00046: Two-way email (inbound replies land on the family timeline)
--
-- Built against Resend's documented inbound-email receiving feature:
--   - https://resend.com/docs/dashboard/receiving/introduction
--     (enabling inbound: Resend-managed receiving address, or MX records on
--     a custom domain/subdomain — "once you add the MX record ... you will
--     receive emails for any address at that domain")
--   - https://resend.com/docs/dashboard/webhooks/introduction and the
--     `email.received` event reference (Dashboard → Webhooks → Add Webhook →
--     event type `email.received`)
--
-- Payload shape assumed (from Resend's documented `email.received` event —
-- see the header comment in app/api/webhooks/resend/route.ts for the full
-- assumed JSON and the important caveat that the webhook carries METADATA
-- ONLY, not the body — the body is fetched separately via
-- GET /emails/receiving/{email_id}):
--   { type: "email.received", data: { email_id, from, to, subject,
--     message_id, received_for?, bcc?, cc?, attachments? } }
--
-- The sibling table is inbound_sms (00035_inbound_sms.sql) — same shape,
-- same reasoning, same degrade-gracefully contract: lib/inbound-email.ts
-- works whether or not this migration has been applied yet (log-once,
-- continue, never lose the reply — campus staff still get notified with the
-- reply body embedded even if the row can't be stored).
--
-- Additive only: no existing table, column, policy, or index is altered,
-- with one deliberate exception below (note.created_by) which loosens a
-- constraint rather than removing or renaming anything.

CREATE TABLE inbound_email (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Resend's `email_id` from the email.received webhook event, when the
  -- provider gives us one — the dedupe key, same role message_sid plays for
  -- inbound_sms. UNIQUE and nullable: if a future payload shape omits it,
  -- the caller falls back to a hash of from+subject+received-minute so a
  -- retried delivery still can't double-insert, but this column itself
  -- degrades to NULL rather than fabricating an id.
  provider_id TEXT UNIQUE,

  from_email TEXT NOT NULL,
  to_email TEXT,
  subject TEXT,

  -- First ~5000 characters of the plain-text body. Deliberately capped —
  -- this is a matching/notification/audit trail, not a mailbox.
  body_text TEXT,

  -- At most one of these is set. Both NULL = an unrecognized sender; the
  -- row is kept anyway (mirrors inbound_sms) so staff have a record rather
  -- than a vanished reply.
  matched_lead_id UUID REFERENCES lead(id),
  matched_guardian_id UUID REFERENCES guardian(id),

  -- Resolved from the matched guardian's most recent application, or from
  -- the matched lead. NULL when the sender matched nobody.
  campus_id UUID REFERENCES campus(id),

  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Stamped once the campus-inbox forward (step 3 of the flow) is confirmed
  -- sent. NULL means either "not attempted yet", "no campus inbox to
  -- forward to", or "the send failed" — lib/inbound-email.ts logs which.
  forwarded_at TIMESTAMPTZ
);

CREATE INDEX idx_inbound_email_matched_lead ON inbound_email (matched_lead_id)
  WHERE matched_lead_id IS NOT NULL;
CREATE INDEX idx_inbound_email_matched_guardian ON inbound_email (matched_guardian_id)
  WHERE matched_guardian_id IS NOT NULL;
CREATE INDEX idx_inbound_email_campus ON inbound_email (campus_id, received_at DESC);

-- ============================================
-- RLS — staff read, network-wide
-- ============================================
--
-- Same gate as email_event (00045): real staff membership
-- (user_is_staff_member(), a user_campus_role row), not per-campus scoping.
-- An unmatched reply has no campus to scope to at all, so a campus-scoped
-- policy would hide it from everyone — network-wide staff-read is the
-- honest policy here, matching how notifyStaffOfFamilyResponse/unmatched
-- inbound already routes to system_admins rather than nobody.
--
-- No INSERT/UPDATE/DELETE policy: writes happen exclusively through the
-- service-role client in the inbound webhook path, never from a session.

ALTER TABLE inbound_email ENABLE ROW LEVEL SECURITY;

CREATE POLICY inbound_email_staff_read ON inbound_email FOR SELECT TO authenticated
  USING (user_is_staff_member());

-- ============================================
-- note.created_by: allow system-authored notes
-- ============================================
--
-- The guardian path of handleInboundEmail (lib/inbound-email.ts) records a
-- reply as an internal note on the guardian's latest application, matching
-- the existing "Internal notes" pattern (lib/mutations/notes.ts createNote).
-- But createNote requires an authenticated session (auth.uid()), and this
-- write happens from an unauthenticated webhook via the service-role client
-- — there is no signed-in user to attribute it to.
--
-- note.created_by has been NOT NULL REFERENCES user_profile(id) since
-- 00008_comms_misc.sql. lead_activity.actor_id already models exactly this
-- case ("NULL = system/automation", 00028_crm_leads.sql) — this loosens
-- note.created_by to the same nullable-means-system convention rather than
-- inventing a new pattern. Every existing INSERT still supplies created_by
-- (createNote, createFamilyResponse) and is unaffected; this only widens
-- what's allowed, it narrows nothing.
ALTER TABLE note ALTER COLUMN created_by DROP NOT NULL;

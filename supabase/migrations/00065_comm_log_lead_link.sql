-- ============================================
-- Link communication_log rows to a lead
-- ============================================
--
-- communication_log identified recipients only by email address, so a campaign
-- send in the log could not click through to the individual's lead record.
-- Add an optional lead reference so staff can jump from the communications log
-- straight to the person it went to. Nullable: transactional email to a family
-- guardian (a user, not a lead) leaves it null and keeps using
-- recipient_user_id / recipient_address.

ALTER TABLE communication_log
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES lead(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_communication_log_lead
  ON communication_log (lead_id) WHERE lead_id IS NOT NULL;

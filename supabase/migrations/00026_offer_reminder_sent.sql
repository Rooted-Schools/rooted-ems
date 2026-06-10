-- Migration 026: Track reminder emails for expiring offers
-- The offer-reminders cron stamps reminder_sent_at when it notifies a family
-- that their pending offer expires within 48 hours. The conditional update on
-- this column (WHERE reminder_sent_at IS NULL) guarantees at-most-once sends.

ALTER TABLE offer ADD COLUMN reminder_sent_at TIMESTAMPTZ;

-- Partial index so the daily cron scan only touches pending, un-reminded offers.
CREATE INDEX idx_offer_pending_reminder
  ON offer (expires_at)
  WHERE status = 'pending' AND reminder_sent_at IS NULL;

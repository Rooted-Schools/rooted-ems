-- ============================================
-- LG-0.1: email compliance — unsubscribe + suppression
-- ============================================

-- Per-lead one-click unsubscribe. The token is the capability: possessing
-- it lets you unsubscribe that lead and nothing else.
ALTER TABLE lead
  ADD COLUMN unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN unsubscribed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX idx_lead_unsubscribe_token ON lead(unsubscribe_token);

-- Address-level suppression from provider signals (hard bounces, spam
-- complaints). Keyed by email because a bounce applies to the address,
-- not one lead row; checked by every bulk sender alongside unsubscribed_at.
CREATE TABLE email_suppression (
  email TEXT PRIMARY KEY,
  reason TEXT NOT NULL,          -- 'bounce' | 'complaint' | 'manual'
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE email_suppression ENABLE ROW LEVEL SECURITY;
CREATE POLICY suppression_staff_read ON email_suppression FOR SELECT TO authenticated USING (true);

-- Rate limiting for public capture endpoints (LG-0.4): hashed-IP submission
-- log, pruned opportunistically by the writers.
CREATE TABLE public_submission_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_submission_log_lookup ON public_submission_log(ip_hash, endpoint, created_at);
ALTER TABLE public_submission_log ENABLE ROW LEVEL SECURITY;
-- service-role only: no policies for authenticated users.

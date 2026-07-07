-- ============================================
-- CRM: batch email campaigns for leads
-- ============================================
-- Staff pick an audience (by stage) and a branded template; the send cron
-- drains recipients at daily_limit per day so a 1,200-family campaign never
-- hits the domain's sending reputation in one burst.

CREATE TABLE lead_campaign (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID NOT NULL REFERENCES campus(id),
  name TEXT NOT NULL,
  template_key TEXT NOT NULL,        -- 'reintroduction' | 'event_invite' | 'deadline' | 'custom'
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,  -- template params (event name, custom body, …)
  audience_stage TEXT NOT NULL,      -- 'open' | 'new' | 'contacted' | 'engaged'
  status TEXT NOT NULL DEFAULT 'sending',  -- 'sending' | 'complete' | 'cancelled'
  daily_limit INTEGER NOT NULL DEFAULT 150,
  total_recipients INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES user_profile(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE lead_campaign_recipient (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES lead_campaign(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES lead(id) ON DELETE CASCADE,
  email TEXT NOT NULL,               -- snapshot at launch; lead email edits don't retarget
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'sent' | 'failed'
  sent_at TIMESTAMPTZ,
  UNIQUE (campaign_id, lead_id)
);

CREATE INDEX idx_campaign_campus ON lead_campaign(campus_id, status);
CREATE INDEX idx_campaign_recipient_pending ON lead_campaign_recipient(campaign_id, status);

ALTER TABLE lead_campaign ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_campaign_recipient ENABLE ROW LEVEL SECURITY;

CREATE POLICY campaign_staff ON lead_campaign FOR ALL TO authenticated
  USING (user_has_campus_access(campus_id));
CREATE POLICY campaign_recipient_staff ON lead_campaign_recipient FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM lead_campaign c WHERE c.id = campaign_id AND user_has_campus_access(c.campus_id)));

CREATE TRIGGER trg_lead_campaign_updated_at BEFORE UPDATE ON lead_campaign
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ============================================
-- CRM Phase 0/1: leads + activity timeline
-- ============================================
-- The recruitment CRM's family record: opens at first inquiry, accrues
-- profile detail over time, and stitches to the EMS application on
-- conversion (lead.application_id) for end-to-end attribution.
-- Campus-owned per the operating model: every lead belongs to a campus and
-- staff see only their campuses (same RLS pattern as the EMS).

CREATE TABLE lead (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID NOT NULL REFERENCES campus(id),

  -- Guardian contact
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  sms_consent BOOLEAN NOT NULL DEFAULT false,
  preferred_language TEXT NOT NULL DEFAULT 'en',  -- 'en' | 'es'

  -- Prospective student
  student_first_name TEXT,
  entry_grade TEXT,

  -- Dynamic profile (grows over time; personalization reads from here)
  pathway_interest TEXT,          -- e.g. 'healthcare', 'technology', 'advanced_manufacturing'
  notes TEXT,

  -- Funnel
  stage TEXT NOT NULL DEFAULT 'new',  -- 'new' | 'contacted' | 'engaged' | 'applied' | 'closed'
  source TEXT NOT NULL DEFAULT 'website',  -- 'website' | 'event' | 'referral' | 'qr' | 'ad' | 'walk_in' | 'staff' | 'other'
  source_detail TEXT,

  -- Ownership + follow-up discipline
  assigned_to UUID REFERENCES user_profile(id),
  next_follow_up_at TIMESTAMPTZ,
  last_contact_at TIMESTAMPTZ,
  reengaged_at TIMESTAMPTZ,       -- throttle marker for the re-engagement cron

  -- Conversion stitch: set when this lead becomes an EMS application
  application_id UUID REFERENCES application(id),
  converted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE lead_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES lead(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,  -- 'inquiry' | 'email' | 'sms' | 'call' | 'note' | 'stage_change' | 'reengagement' | 'converted'
  body TEXT,
  actor_id UUID REFERENCES user_profile(id),  -- NULL = system/automation
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lead_campus_stage ON lead(campus_id, stage);
CREATE INDEX idx_lead_followup ON lead(campus_id, next_follow_up_at) WHERE application_id IS NULL;
CREATE INDEX idx_lead_email ON lead(lower(email));
CREATE INDEX idx_lead_activity_lead ON lead_activity(lead_id, created_at);

-- RLS: staff-only, campus-scoped. Public inquiries insert via the service
-- role in a server action; families never read lead rows.
ALTER TABLE lead ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_staff ON lead FOR ALL TO authenticated
  USING (user_has_campus_access(campus_id));
CREATE POLICY lead_activity_staff ON lead_activity FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM lead l WHERE l.id = lead_id AND user_has_campus_access(l.campus_id)));

CREATE TRIGGER trg_lead_updated_at BEFORE UPDATE ON lead
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

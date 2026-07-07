-- ============================================
-- CRM Part 4: events + RSVP, and referral tracking
-- ============================================

-- Recruitment events: info sessions, open houses, tours.
CREATE TABLE event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID NOT NULL REFERENCES campus(id),
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL DEFAULT 'info_session',  -- 'info_session' | 'open_house' | 'tour' | 'other'
  location TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  capacity INTEGER,                 -- NULL = unlimited
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES user_profile(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per family registration. lead_id links to the family record when
-- matched/created; email is snapshotted so a walk-up RSVP stands on its own.
CREATE TABLE event_rsvp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES lead(id) ON DELETE SET NULL,
  guardian_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  party_size INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'registered',  -- 'registered' | 'attended' | 'no_show' | 'cancelled'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, email)
);

CREATE INDEX idx_event_campus_start ON event(campus_id, starts_at);
CREATE INDEX idx_event_published ON event(is_published, starts_at) WHERE is_published = true;
CREATE INDEX idx_rsvp_event ON event_rsvp(event_id, status);
CREATE INDEX idx_rsvp_lead ON event_rsvp(lead_id);

ALTER TABLE event ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_rsvp ENABLE ROW LEVEL SECURITY;

-- Staff-only, campus-scoped (same pattern as lead). Public list/RSVP paths
-- run through the service role in server code, mirroring /inquire.
CREATE POLICY event_staff ON event FOR ALL TO authenticated
  USING (user_has_campus_access(campus_id));
CREATE POLICY rsvp_staff ON event_rsvp FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM event e WHERE e.id = event_id AND user_has_campus_access(e.campus_id)));

CREATE TRIGGER trg_event_updated_at BEFORE UPDATE ON event
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_rsvp_updated_at BEFORE UPDATE ON event_rsvp
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ─── Referral tracking on the lead record ───────────────────────────────────
-- referral_code: a family's own shareable code (lazily generated on request).
-- referred_by_lead_id: set when a lead arrives via someone's referral link.
ALTER TABLE lead
  ADD COLUMN referral_code TEXT UNIQUE,
  ADD COLUMN referred_by_lead_id UUID REFERENCES lead(id) ON DELETE SET NULL;

CREATE INDEX idx_lead_referral_code ON lead(referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX idx_lead_referred_by ON lead(referred_by_lead_id) WHERE referred_by_lead_id IS NOT NULL;

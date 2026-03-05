-- Migration 006: Offer & Acceptance Tables
-- Offer, Acceptance, Waitlist, WaitlistPosition

-- Seat offers
CREATE TABLE offer (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES application(id),
  lottery_entry_id UUID REFERENCES lottery_entry(id),
  campus_id UUID NOT NULL REFERENCES campus(id),
  grade_level_id UUID NOT NULL REFERENCES grade_level(id),
  status offer_status NOT NULL DEFAULT 'pending',
  offered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  responded_at TIMESTAMPTZ,
  offered_by UUID REFERENCES user_profile(id),
  revoked_by UUID REFERENCES user_profile(id),
  revoke_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Acceptances (separate from offers for audit trail)
CREATE TABLE acceptance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id UUID NOT NULL REFERENCES offer(id) UNIQUE,
  application_id UUID NOT NULL REFERENCES application(id),
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_by UUID NOT NULL REFERENCES guardian(id),
  conditions_met BOOLEAN NOT NULL DEFAULT false,
  conditions_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Waitlists (per campus/grade/year)
CREATE TABLE waitlist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campus_id UUID NOT NULL REFERENCES campus(id),
  grade_level_id UUID NOT NULL REFERENCES grade_level(id),
  school_year_id UUID NOT NULL REFERENCES school_year(id),
  enrollment_window_id UUID NOT NULL REFERENCES enrollment_window(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campus_id, grade_level_id, school_year_id)
);

-- Waitlist positions
CREATE TABLE waitlist_position (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  waitlist_id UUID NOT NULL REFERENCES waitlist(id),
  application_id UUID NOT NULL REFERENCES application(id),
  position_number INTEGER NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  promoted_at TIMESTAMPTZ,
  removed_at TIMESTAMPTZ,
  removal_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (waitlist_id, application_id)
);

-- Migration 005: Lottery Tables
-- LotteryRuleSet, LotteryRun, LotteryEntry, LotteryEntrySnapshot

-- Lottery rule sets (named/versioned configurations)
CREATE TABLE lottery_rule_set (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID NOT NULL REFERENCES campus(id),
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  priority_tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  sibling_preference BOOLEAN NOT NULL DEFAULT true,
  geographic_preference BOOLEAN NOT NULL DEFAULT false,
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES user_profile(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lottery runs (execution records)
CREATE TABLE lottery_run (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_window_id UUID NOT NULL REFERENCES enrollment_window(id),
  lottery_rule_set_id UUID NOT NULL REFERENCES lottery_rule_set(id),
  campus_id UUID NOT NULL REFERENCES campus(id),
  grade_level_id UUID REFERENCES grade_level(id),
  status lottery_status NOT NULL DEFAULT 'draft',
  run_number INTEGER NOT NULL DEFAULT 1,
  random_seed TEXT,
  total_applicants INTEGER DEFAULT 0,
  total_seats INTEGER DEFAULT 0,
  executed_by UUID REFERENCES user_profile(id),
  executed_at TIMESTAMPTZ,
  finalized_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lottery entries (per-application assignment)
CREATE TABLE lottery_entry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lottery_run_id UUID NOT NULL REFERENCES lottery_run(id),
  application_id UUID NOT NULL REFERENCES application(id),
  priority_tier INTEGER NOT NULL DEFAULT 0,
  random_number DOUBLE PRECISION,
  final_rank INTEGER,
  is_selected BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lottery_run_id, application_id)
);

-- Lottery entry snapshots (immutable after official run)
CREATE TABLE lottery_entry_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lottery_run_id UUID NOT NULL REFERENCES lottery_run(id),
  lottery_entry_id UUID NOT NULL REFERENCES lottery_entry(id),
  application_id UUID NOT NULL REFERENCES application(id),
  student_name TEXT NOT NULL,
  grade grade_level_code NOT NULL,
  priority_tier INTEGER NOT NULL,
  random_number DOUBLE PRECISION NOT NULL,
  final_rank INTEGER NOT NULL,
  is_selected BOOLEAN NOT NULL,
  snapshot_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

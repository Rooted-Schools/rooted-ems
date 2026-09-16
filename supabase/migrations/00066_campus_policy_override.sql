-- ============================================
-- Per-campus policy content for registration acknowledgements
-- ============================================
--
-- The policy text a family reads before signing a registration
-- acknowledgement (handbook, discipline, media release, field trip, tech /
-- internet, FERPA, ...) lives hardcoded in
-- app/family/registration/policy-content.ts. That means a school cannot
-- update its own annual handbook language, add the official PDF, or change a
-- policy without a developer editing code and redeploying.
--
-- This table lets each campus manage its own policy content. An absent row
-- means "use the built-in default in policy-content.ts", so nothing changes
-- until a school actually edits a policy. When a row exists, the family reads
-- the school's own text (and, when attached, opens the official PDF) and then
-- signs — the signature/attestation flow is unchanged.

CREATE TABLE IF NOT EXISTS campus_policy_override (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID NOT NULL REFERENCES campus(id) ON DELETE CASCADE,
  -- Matches the registration item_type of an "acknowledge" policy item.
  item_type TEXT NOT NULL,
  body_en TEXT NOT NULL DEFAULT '',
  body_es TEXT NOT NULL DEFAULT '',
  -- Optional official policy document in the private "documents" bucket
  -- ({campusId}/policies/...). The family can open it before signing.
  pdf_storage_path TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES user_profile(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campus_id, item_type)
);

CREATE INDEX IF NOT EXISTS idx_campus_policy_override_lookup
  ON campus_policy_override (campus_id, item_type) WHERE is_active;

ALTER TABLE campus_policy_override ENABLE ROW LEVEL SECURITY;

-- Staff on the campus can read their school's policy content.
DROP POLICY IF EXISTS cpo_staff_read ON campus_policy_override;
CREATE POLICY cpo_staff_read ON campus_policy_override
  FOR SELECT TO authenticated
  USING (user_has_campus_access(campus_id));

-- Editing the policy a family must sign is an enrollment_manager decision,
-- the same bar as the welcome-message override.
DROP POLICY IF EXISTS cpo_manager_write ON campus_policy_override;
CREATE POLICY cpo_manager_write ON campus_policy_override
  FOR ALL TO authenticated
  USING (user_has_campus_role(campus_id, 'enrollment_manager'::staff_role))
  WITH CHECK (user_has_campus_role(campus_id, 'enrollment_manager'::staff_role));

DROP TRIGGER IF EXISTS trg_updated_at ON campus_policy_override;
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON campus_policy_override
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE campus_policy_override IS
  'Per-campus registration policy content (text + optional official PDF). Absent row = the built-in default in app/family/registration/policy-content.ts.';

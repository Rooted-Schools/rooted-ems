-- 00051_campus_message_override.sql
--
-- Per-campus wording for automated family messages, starting with the
-- inquiry welcome. Campuses differ in voice and in what they can promise,
-- and until now the only way to change a word was a code deploy.
--
-- Scope is deliberately the WORDS only. The subject line and the body
-- paragraphs are editable; the call to action, its link, the campus logo and
-- the sign-off stay system-controlled, so an edit can never produce a
-- welcome email with a dead "Start an application" button.
--
-- Both languages are stored. A campus that customises English and leaves
-- Spanish at the default would quietly send English to families who chose
-- Spanish, so the editor requires both and this table holds both.
--
-- Absent row means the built-in default, which is why nothing breaks for a
-- campus that never touches this.
--
-- APPLY MANUALLY.

CREATE TABLE IF NOT EXISTS campus_message_override (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID NOT NULL REFERENCES campus(id) ON DELETE CASCADE,
  -- Matches the template function name in lib/email-templates.ts.
  template_key TEXT NOT NULL,
  subject_en TEXT NOT NULL,
  subject_es TEXT NOT NULL,
  -- Paragraphs, separated by a blank line. Rendered into the same shell the
  -- built-in template uses.
  body_en TEXT NOT NULL,
  body_es TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES user_profile(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campus_id, template_key)
);

CREATE INDEX IF NOT EXISTS idx_campus_message_override_lookup
  ON campus_message_override (campus_id, template_key) WHERE is_active;

ALTER TABLE campus_message_override ENABLE ROW LEVEL SECURITY;

-- Staff on the campus can read what their school sends.
DROP POLICY IF EXISTS cmo_staff_read ON campus_message_override;
CREATE POLICY cmo_staff_read ON campus_message_override
  FOR SELECT TO authenticated
  USING (user_has_campus_access(campus_id));

-- Changing what every prospective family receives is an enrollment_manager
-- decision, the same bar as editing an enrollment window.
DROP POLICY IF EXISTS cmo_manager_write ON campus_message_override;
CREATE POLICY cmo_manager_write ON campus_message_override
  FOR ALL TO authenticated
  USING (user_has_campus_role(campus_id, 'enrollment_manager'::staff_role))
  WITH CHECK (user_has_campus_role(campus_id, 'enrollment_manager'::staff_role));

DROP TRIGGER IF EXISTS trg_updated_at ON campus_message_override;
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON campus_message_override
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE campus_message_override IS
  'Per-campus wording for automated family messages. Absent row means the built-in default in lib/email-templates.ts.';

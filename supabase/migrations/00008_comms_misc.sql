-- Migration 008: Communication, Pathway, Notes, Tags, Audit, Settings

-- Message templates
CREATE TABLE message_template (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campus_id UUID REFERENCES campus(id),
  name TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  channel comm_channel NOT NULL DEFAULT 'email',
  merge_fields TEXT[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES user_profile(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Communication log (sent messages)
CREATE TABLE communication_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campus_id UUID REFERENCES campus(id),
  template_id UUID REFERENCES message_template(id),
  recipient_user_id UUID REFERENCES user_profile(id),
  recipient_address TEXT NOT NULL,
  channel comm_channel NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  status comm_status NOT NULL DEFAULT 'queued',
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  error_message TEXT,
  external_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- In-app notifications
CREATE TABLE notification (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profile(id),
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Career pathway interests (per spec Module 6)
CREATE TABLE pathway_interest (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES student(id),
  campus_id UUID NOT NULL REFERENCES campus(id),
  pathway_name TEXT NOT NULL,
  interest_level TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Staff notes (polymorphic via entity_type + entity_id)
CREATE TABLE note (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  campus_id UUID REFERENCES campus(id),
  content TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES user_profile(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tags for categorization
CREATE TABLE tag (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campus_id UUID REFERENCES campus(id),
  name TEXT NOT NULL,
  color VARCHAR(7),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campus_id, name)
);

-- Application-Tag junction
CREATE TABLE application_tag (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES application(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  created_by UUID REFERENCES user_profile(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (application_id, tag_id)
);

-- Audit event log (INSERT-only, immutable)
CREATE TABLE audit_event (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name TEXT NOT NULL,
  record_id UUID,
  action audit_action NOT NULL,
  actor_id UUID REFERENCES user_profile(id),
  campus_id UUID REFERENCES campus(id),
  old_data JSONB,
  new_data JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Key-value settings (per campus or global)
CREATE TABLE setting (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campus_id UUID REFERENCES campus(id),
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campus_id, key)
);

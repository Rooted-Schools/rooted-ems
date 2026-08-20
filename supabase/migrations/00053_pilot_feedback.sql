-- ============================================
-- Pilot feedback: a real, triageable feedback channel
-- ============================================
-- Testers (Tim, Lalah, Steven) submit feedback from a pop-up widget anywhere
-- in the staff console. Each item is cross-campus by design — the whole team
-- learns from every report — so there is no campus scoping on read. An item
-- carries an optional screenshot, a status (open/resolved), and a thread of
-- staff replies so triage happens in-place instead of in a side channel.
--
-- Replaces the earlier approach of folding feedback into generic `note` rows,
-- which had no room for status, replies, or an attachment.

CREATE TABLE pilot_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES user_profile(id),
  campus_id UUID REFERENCES campus(id),      -- the campus lens active at submit, for context; NULL if none
  category TEXT NOT NULL,                     -- 'Bug' | 'Confusing' | 'Idea' | 'Working well'
  context TEXT,                              -- optional "where in the app" note (often the page path)
  body TEXT NOT NULL,
  screenshot_path TEXT,                      -- storage path in the 'documents' bucket; NULL if none
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolved_by UUID REFERENCES user_profile(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE pilot_feedback_reply (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID NOT NULL REFERENCES pilot_feedback(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES user_profile(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pilot_feedback_status ON pilot_feedback(status, created_at DESC);
CREATE INDEX idx_pilot_feedback_reply_parent ON pilot_feedback_reply(feedback_id, created_at);

ALTER TABLE pilot_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilot_feedback_reply ENABLE ROW LEVEL SECURITY;

-- Any staff member can see and act on any feedback item (cross-campus is the
-- point). The app reaches these tables through service-role server actions
-- guarded by requireStaffSession, so these policies are a second line of
-- defense rather than the primary gate; they still block direct client access
-- by anyone who is not staff.
CREATE POLICY pilot_feedback_staff ON pilot_feedback FOR ALL TO authenticated
  USING (user_is_staff_member()) WITH CHECK (user_is_staff_member());
CREATE POLICY pilot_feedback_reply_staff ON pilot_feedback_reply FOR ALL TO authenticated
  USING (user_is_staff_member()) WITH CHECK (user_is_staff_member());

CREATE TRIGGER trg_pilot_feedback_updated_at BEFORE UPDATE ON pilot_feedback
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

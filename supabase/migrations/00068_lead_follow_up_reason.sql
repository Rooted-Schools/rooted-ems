-- ============================================
-- Lead follow-up reason (callbacks sort first)
-- ============================================
--
-- The daily follow-up queue (lib/queries/leads.ts getFollowUpQueue) orders
-- due leads oldest-first and caps the result, which silently hides whatever
-- is newest — and the newest due item is exactly where a callback promised
-- for a specific hour today lives. Postgres cannot sort "callbacks first"
-- without something to sort ON, and until now that signal (is_callback) was
-- derived after the fact by batch-querying lead_activity for each lead's
-- most recent call and pattern-matching the body prefix. That derivation
-- cannot be expressed inside a single ORDER BY / WHERE, so the queue could
-- never put callbacks ahead of older non-callbacks — only re-sort within
-- whatever page it already fetched.
--
-- lib/lead-call-outcomes.ts's own header once argued against a second column
-- for exactly this ("...never a second column that could drift"). This is a
-- deliberate, documented reversal of that call: next_follow_up_reason is
-- written in the SAME update statement that sets next_follow_up_at (see
-- submitLog in app/staff/recruitment/[id]/lead-detail-client.tsx), so the two
-- can never drift apart the way a value derived from a separate table could.
-- Without this column, "callbacks due today outrank older non-callbacks" is
-- not a query Postgres can answer.
--
-- Additive only: nullable column, CHECK allows NULL (every lead created
-- before this migration, and the sheet-sync/staff-add paths that don't log a
-- structured call outcome), backfill, and a supporting index. No drops.

ALTER TABLE lead
  ADD COLUMN IF NOT EXISTS next_follow_up_reason TEXT
  CHECK (next_follow_up_reason IS NULL OR next_follow_up_reason IN (
    'reached', 'voicemail', 'wrong_number', 'callback'
  ));

COMMENT ON COLUMN lead.next_follow_up_reason IS
  'Which structured call outcome (lib/lead-call-outcomes.ts CALL_OUTCOMES key) set the current next_follow_up_at, or NULL when it was set some other way (manual note follow-up, sheet sync, staff-add, the re-engagement cron). Written in the same update as next_follow_up_at so the two can never drift — see lib/queries/leads.ts getFollowUpQueue, which uses this column (not a lead_activity derivation) to put due callbacks ahead of older non-callbacks.';

-- Backfill from each lead's most recent call activity, mapping the exact
-- body prefix buildCallOutcomeBody (lib/lead-call-outcomes.ts) writes.
-- DISTINCT ON picks the latest call per lead_id; leads with no call
-- activity, or whose latest call body doesn't match a known prefix (e.g. a
-- pre-CALL_OUTCOMES freeform "call" note), are left NULL rather than guessed.
WITH latest_call AS (
  SELECT DISTINCT ON (lead_id) lead_id, body
  FROM lead_activity
  WHERE activity_type = 'call'
  ORDER BY lead_id, created_at DESC
)
UPDATE lead
SET next_follow_up_reason = CASE
  WHEN latest_call.body LIKE '[Reached]%' THEN 'reached'
  WHEN latest_call.body LIKE '[Left voicemail]%' THEN 'voicemail'
  WHEN latest_call.body LIKE '[Wrong number]%' THEN 'wrong_number'
  WHEN latest_call.body LIKE '[Call back later]%' THEN 'callback'
  ELSE NULL
END
FROM latest_call
WHERE lead.id = latest_call.lead_id
  AND lead.next_follow_up_reason IS NULL;

-- Supports getFollowUpQueue's two-query merge: one query for due callbacks
-- (next_follow_up_reason = 'callback'), one for due non-callbacks
-- (next_follow_up_reason IS NULL OR <> 'callback'), each ordered by
-- next_follow_up_at — the shape PostgREST can express, since it cannot put
-- "callback" rows first inside a single ORDER BY.
CREATE INDEX IF NOT EXISTS idx_lead_follow_up_reason
  ON lead (next_follow_up_reason, next_follow_up_at)
  WHERE stage IN ('new', 'contacted', 'engaged');

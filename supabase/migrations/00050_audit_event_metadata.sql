-- 00050_audit_event_metadata.sql
--
-- logAuditEvent has always accepted a `metadata` object and the codebase has
-- always passed one: finalizeLotteryRun records how many snapshots it wrote,
-- revokeOffer records the application status it reverted to, acceptOffer
-- records whether staff acted on behalf of a family. None of it was ever
-- stored, because audit_event has no such column and the insert silently
-- dropped the field.
--
-- Add the column so those details persist. Nullable JSONB, no backfill: the
-- events already written genuinely do not have this detail and inventing it
-- would be worse than its absence. Existing rows keep NULL, which reads
-- honestly as "not recorded".
--
-- APPLY MANUALLY.

ALTER TABLE audit_event ADD COLUMN IF NOT EXISTS metadata JSONB;

COMMENT ON COLUMN audit_event.metadata IS
  'Supplementary context for the event (lottery run linkage, on-behalf-of flags, counts). NULL on rows written before 00050, which predate the column.';

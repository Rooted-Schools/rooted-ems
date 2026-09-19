-- Lead ownership: index to back the new ownership filters.
--
-- The recruitment list, the follow-up queue, and the "Mine / Unassigned /
-- a specific staff member / Everyone" lens all now filter on
-- (campus_id, assigned_to) — including `assigned_to IS NULL` for
-- "Unassigned", which a plain btree index on this column pair still serves
-- (Postgres indexes NULLs). Additive only — no drops, and not applied to
-- any database by this change.
CREATE INDEX IF NOT EXISTS idx_lead_assigned_to ON lead(campus_id, assigned_to);

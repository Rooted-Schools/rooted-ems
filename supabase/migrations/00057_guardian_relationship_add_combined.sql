-- The application forms (family and staff) and the only translations offer
-- "Grandparent" and "Aunt / Uncle" as guardian relationships, sending the enum
-- values 'grandparent' and 'aunt_uncle'. The enum only had granular
-- grandmother/grandfather/aunt/uncle, so choosing either combined option failed
-- the guardian insert ("Failed to create guardian record") and kicked the
-- family out of the flow. Add the values the app actually sends. Applied to
-- production via the Supabase MCP; recorded here for repo fidelity.
ALTER TYPE guardian_relationship ADD VALUE IF NOT EXISTS 'grandparent';
ALTER TYPE guardian_relationship ADD VALUE IF NOT EXISTS 'aunt_uncle';

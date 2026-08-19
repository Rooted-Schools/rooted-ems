-- 00052_revoke_anon_execute_remaining_secdef.sql
--
-- Four SECURITY DEFINER functions were still granted EXECUTE to anon and
-- authenticated, so any unauthenticated caller could invoke them directly
-- over /rest/v1/rpc. A prior out-of-band change revoked two of the six the
-- Supabase security advisor flagged, but was never committed and left these
-- four open. This closes them, in a committed migration this time.
--
-- Three are trigger functions and are only ever meant to fire from their
-- triggers, which run as the table owner regardless of who holds EXECUTE.
-- fn_offer_school_year is an internal helper called from other definer
-- functions, which likewise carry their own privileges. None of the four is
-- meant to be a public RPC, so revoking direct execute changes no legitimate
-- behavior.
--
-- APPLY MANUALLY.

REVOKE EXECUTE ON FUNCTION public.fn_lottery_run_policy_snapshot_immutable() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_protect_application_columns() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_release_accepted_seat() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_offer_school_year(uuid) FROM PUBLIC, anon, authenticated;

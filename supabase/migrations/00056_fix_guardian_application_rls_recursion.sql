-- Family reads of guardian/application threw "infinite recursion detected in
-- policy for relation guardian": guardian_staff (and household_staff,
-- student_staff) read application inline, and application.app_family read
-- guardian inline, so each re-triggered the other's RLS. This broke every
-- family-portal read done through the user-scoped client (dashboard,
-- applications, documents, offers); service-role reads were unaffected, which
-- is why staff could still see a family's submitted application while the
-- family saw nothing. Fix: app_family checks guardian ownership through a
-- SECURITY DEFINER helper (same pattern as user_owns_household), so it never
-- re-enters guardian's RLS and the cycle is cut at that edge.
-- Applied to production via the Supabase MCP; recorded here for repo fidelity.

CREATE OR REPLACE FUNCTION public.caller_owns_guardian(p_guardian_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM guardian g
    WHERE g.id = p_guardian_id
      AND user_owns_household(g.household_id)
  );
$$;

REVOKE ALL ON FUNCTION public.caller_owns_guardian(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.caller_owns_guardian(uuid) TO authenticated;

DROP POLICY app_family ON application;
CREATE POLICY app_family ON application FOR ALL TO authenticated
  USING (public.caller_owns_guardian(guardian_id));

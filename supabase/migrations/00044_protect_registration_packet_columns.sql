-- Migration 00044: lock family-forgeable registration_packet columns.
--
-- regpacket_family_update (00014_phase1_new_tables.sql) is:
--
--   CREATE POLICY regpacket_family_update ON registration_packet FOR UPDATE
--     TO authenticated USING (... user_owns_household(g.household_id) ...);
--
-- USING with no WITH CHECK, and no column-level grants. A family with
-- legitimate UPDATE access to their OWN registration_packet row (so they can
-- fill in the fields they are meant to edit) can therefore PATCH ANY column
-- on that row via PostgREST, including the ones that exist purely to record
-- staff/system trust decisions:
--
--   status                 driven by lib/mutations/registration.ts
--                          verifyRegistrationItem / skipRegistrationItem —
--                          a family setting this to 'complete' directly
--                          fakes a fully-verified packet.
--   verified_at            staff verification timestamp.
--   contacted_at           staff "mark contacted" from the Today call-
--                          escalation queue (00036) — a forged recent value
--                          silently drops the family off that queue.
--   last_outreach_at       the keep-the-seat cron's weekly-cadence marker
--                          (00041) — a forged recent value silently stops
--                          the automated melt outreach too.
--   keep_the_seat_sent_at  the cron's one-time first-touch marker (00036).
--
-- None of these are family-authored data, and forging any of them either
-- manufactures a "fully registered" record the school never verified, or
-- erases the family from the melt/call-escalation queues that exist
-- specifically to catch families who have gone quiet.
--
-- Fixed the same way fn_protect_is_staff (00039_security_hardening.sql)
-- fixed the equivalent gap on user_profile.is_staff: a SECURITY DEFINER
-- BEFORE UPDATE trigger distinguishes a trusted writer (staff with real
-- campus access, or the service role) from a plain authenticated family
-- user, and reuses the exact same signals 00039 established:
--   - auth.uid() IS NULL            => service-role connection (cron,
--                                      server actions using the
--                                      service-role client) — always trusted.
--   - user_has_campus_access(cid)   => an actual staff campus-role row on
--                                      this packet's campus (via its
--                                      enrollment) — the same helper
--                                      regpacket_staff already uses.
--
-- A family write to any protected column is reverted to its prior value
-- rather than failing the whole statement, so a family's own edits to the
-- fields they legitimately own (in the same UPDATE) still go through.
-- Additive only: no existing column, table, or policy is altered or dropped.

CREATE OR REPLACE FUNCTION fn_protect_registration_packet_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  packet_campus_id UUID;
BEGIN
  -- Cheap early-out: most updates (family or staff) never touch these
  -- columns at all, so skip the campus lookup unless one actually changed.
  IF NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.verified_at IS NOT DISTINCT FROM OLD.verified_at
     AND NEW.contacted_at IS NOT DISTINCT FROM OLD.contacted_at
     AND NEW.last_outreach_at IS NOT DISTINCT FROM OLD.last_outreach_at
     AND NEW.keep_the_seat_sent_at IS NOT DISTINCT FROM OLD.keep_the_seat_sent_at THEN
    RETURN NEW;
  END IF;

  -- Service-role connections (cron, server actions using the service-role
  -- client) carry no JWT — auth.uid() is NULL — and are the only path that
  -- legitimately sets these columns today. Same signal fn_protect_is_staff
  -- (00039) uses for the equivalent decision on user_profile.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT e.campus_id INTO packet_campus_id
  FROM enrollment e
  WHERE e.id = NEW.enrollment_id;

  -- A real staff campus-role row on this packet's campus — the same check
  -- regpacket_staff already gates FOR ALL on — is trusted.
  IF packet_campus_id IS NOT NULL AND user_has_campus_access(packet_campus_id) THEN
    RETURN NEW;
  END IF;

  -- Neither staff on this campus nor service role: revert every protected
  -- column to its prior value. Any other column in the same UPDATE (the
  -- fields a family legitimately fills in) is left untouched.
  NEW.status := OLD.status;
  NEW.verified_at := OLD.verified_at;
  NEW.contacted_at := OLD.contacted_at;
  NEW.last_outreach_at := OLD.last_outreach_at;
  NEW.keep_the_seat_sent_at := OLD.keep_the_seat_sent_at;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_registration_packet_columns ON registration_packet;
CREATE TRIGGER trg_protect_registration_packet_columns
BEFORE UPDATE ON registration_packet
FOR EACH ROW
EXECUTE FUNCTION fn_protect_registration_packet_columns();

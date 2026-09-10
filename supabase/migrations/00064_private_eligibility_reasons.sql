BEGIN;

CREATE FUNCTION public.mark_application_ineligible(
  p_application_id uuid,
  p_expected_status public.application_status,
  p_actor_id uuid,
  p_reason text
)
RETURNS TABLE (id uuid)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  changed_id uuid;
  changed_campus_id uuid;
  normalized_reason text := btrim(p_reason, E' \t\n\r');
BEGIN
  IF normalized_reason IS NULL OR normalized_reason = '' THEN
    RAISE EXCEPTION 'An eligibility reason is required';
  END IF;

  IF p_expected_status IS NULL OR p_expected_status::text NOT IN (
    'submitted', 'needs_info', 'verified', 'lottery_assigned'
  ) THEN
    RAISE EXCEPTION 'Invalid eligibility transition';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.application AS target
    JOIN public.user_campus_role AS campus_role
      ON campus_role.campus_id = target.campus_id
    JOIN public.user_profile AS actor ON actor.id = campus_role.user_id
    WHERE target.id = p_application_id
      AND actor.id = p_actor_id
      AND actor.is_staff = true
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.application AS target
  SET status = 'ineligible', review_notes = NULL,
      reviewed_by = p_actor_id, reviewed_at = now(), updated_at = now()
  WHERE target.id = p_application_id AND target.status = p_expected_status
  RETURNING target.id, target.campus_id INTO changed_id, changed_campus_id;

  IF changed_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.note (
    entity_type, entity_id, campus_id, content, is_internal, created_by
  ) VALUES (
    'application', changed_id, changed_campus_id,
    'Eligibility decision: ' || normalized_reason, true, p_actor_id
  );

  RETURN QUERY SELECT changed_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_application_ineligible(uuid, public.application_status, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_application_ineligible(uuid, public.application_status, uuid, text)
  TO service_role;

DO $$
DECLARE
  legacy_application record;
  legacy_history record;
BEGIN
  FOR legacy_application IN
    SELECT id, campus_id, review_notes FROM public.application
    WHERE status::text = 'ineligible' AND review_notes IS NOT NULL
    FOR UPDATE
  LOOP
    IF btrim(legacy_application.review_notes) <> '' THEN
      INSERT INTO public.note (entity_type, entity_id, campus_id, content, is_internal, created_by)
      VALUES ('application', legacy_application.id, legacy_application.campus_id,
        'Migrated eligibility note: ' || legacy_application.review_notes, true, NULL);
    END IF;
    UPDATE public.application SET review_notes = NULL WHERE id = legacy_application.id;
  END LOOP;

  FOR legacy_history IN
    SELECT history.id, history.application_id, history.reason, history.changed_by, target.campus_id
    FROM public.application_status_history AS history
    JOIN public.application AS target ON target.id = history.application_id
    WHERE history.to_status::text = 'ineligible' AND history.reason IS NOT NULL
    FOR UPDATE OF history
  LOOP
    IF btrim(legacy_history.reason) <> '' THEN
      INSERT INTO public.note (entity_type, entity_id, campus_id, content, is_internal, created_by)
      VALUES ('application', legacy_history.application_id, legacy_history.campus_id,
        'Migrated eligibility history: ' || legacy_history.reason, true, legacy_history.changed_by);
    END IF;
    UPDATE public.application_status_history SET reason = NULL WHERE id = legacy_history.id;
  END LOOP;
END;
$$;

ALTER TABLE public.application ADD CONSTRAINT application_ineligible_notes_private
  CHECK (status::text <> 'ineligible' OR review_notes IS NULL);

ALTER TABLE public.application_status_history ADD CONSTRAINT history_ineligible_notes_private
  CHECK (to_status::text <> 'ineligible' OR reason IS NULL);

COMMIT;

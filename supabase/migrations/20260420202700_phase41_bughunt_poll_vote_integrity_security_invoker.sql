-- Pass 20b: fn_enforce_home_poll_vote_integrity must be SECURITY INVOKER
-- so current_user reflects the actual caller. Under SECURITY DEFINER,
-- current_user was always 'postgres' which hit the bypass branch and
-- skipped option_ids validation. Reader SELECT on polls runs fine via
-- SECURITY INVOKER because authenticated has read access to polls in
-- groups they belong to (and we only need polls.options/is_closed/closes_at
-- which are row-visible to any voter anyway).
CREATE OR REPLACE FUNCTION public.fn_enforce_home_poll_vote_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := current_user;
  v_poll RECORD;
  v_valid_ids text[];
  v_bad_ids   text[];
BEGIN
  IF v_role IN ('postgres', 'supabase_admin', 'service_role',
                'supabase_auth_admin', 'supabase_storage_admin') THEN
    RETURN NEW;
  END IF;

  SELECT id, is_closed, closes_at, options INTO v_poll
    FROM commander_home_polls WHERE id = NEW.poll_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'POLL_NOT_FOUND' USING HINT = 'poll_id does not exist';
  END IF;

  IF v_poll.is_closed = true THEN
    RAISE EXCEPTION 'POLL_CLOSED' USING HINT = 'cannot vote on a closed poll';
  END IF;
  IF v_poll.closes_at IS NOT NULL AND v_poll.closes_at < now() THEN
    RAISE EXCEPTION 'POLL_EXPIRED' USING HINT = 'voting closed at ' || v_poll.closes_at::text;
  END IF;

  SELECT array_agg(value->>'id') INTO v_valid_ids
    FROM jsonb_array_elements(v_poll.options) AS value;

  IF NEW.option_ids IS NULL OR array_length(NEW.option_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'NO_OPTIONS_SELECTED'
          USING HINT = 'option_ids must contain at least one option id';
  END IF;

  SELECT array_agg(x) INTO v_bad_ids
    FROM unnest(NEW.option_ids) AS x
    WHERE x <> ALL(COALESCE(v_valid_ids, ARRAY[]::text[]));

  IF v_bad_ids IS NOT NULL AND array_length(v_bad_ids, 1) > 0 THEN
    RAISE EXCEPTION 'INVALID_POLL_OPTION'
          USING HINT = 'option_ids not present on poll: ' || array_to_string(v_bad_ids, ',');
  END IF;

  RETURN NEW;
END;
$function$;

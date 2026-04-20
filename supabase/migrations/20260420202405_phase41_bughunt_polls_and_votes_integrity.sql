-- =====================================================================
-- Pass 20: polls + poll_votes integrity.
--
-- BUGS (verified):
--   PL1 — closes_at can be backdated: host can retroactively kill voting
--   PL2 — is_closed true→false: host can resurrect a closed poll
--   PL3 — updated_at can be backdated
--   V2  — votes can reference option_ids not in the poll's options array
--
-- FIX:
--   (A) commander_home_polls BEFORE UPDATE:
--       - closes_at: while poll is active (not closed), cannot move it
--         into the past (keeps retroactive closure from stealing votes)
--       - is_closed: once true, sticky (cannot go true→false)
--       - updated_at: system-managed
--
--   (B) commander_home_poll_votes BEFORE INSERT/UPDATE:
--       - Each id in option_ids must be a member of the poll's
--         options array's [*].id values
--       - Poll must be open (is_closed=false AND (closes_at IS NULL OR
--         closes_at > now()))
-- =====================================================================

-- (A) Polls lifecycle/schedule guards
CREATE OR REPLACE FUNCTION public.fn_enforce_home_polls_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE v_role text := current_user;
BEGIN
  IF v_role IN ('postgres', 'supabase_admin', 'service_role',
                'supabase_auth_admin', 'supabase_storage_admin') THEN
    RETURN NEW;
  END IF;

  -- updated_at: system-managed
  IF NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
    RAISE EXCEPTION 'SYSTEM_ONLY_FIELD'
          USING HINT = 'updated_at is managed by triggers; do not include in payload';
  END IF;

  -- is_closed: sticky
  IF OLD.is_closed = true AND COALESCE(NEW.is_closed, false) = false THEN
    RAISE EXCEPTION 'POLL_CLOSED_TERMINAL'
          USING HINT = 'closed polls cannot be reopened; create a new poll instead';
  END IF;

  -- closes_at: cannot move into the past on an active (open) poll
  IF NEW.closes_at IS DISTINCT FROM OLD.closes_at
     AND COALESCE(OLD.is_closed, false) = false
     AND NEW.closes_at IS NOT NULL
     AND NEW.closes_at < now() THEN
    RAISE EXCEPTION 'POLL_CLOSES_AT_PAST'
          USING HINT = 'cannot move closes_at into the past; set is_closed=true to close the poll';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_home_polls_lifecycle ON public.commander_home_polls;
CREATE TRIGGER trg_enforce_home_polls_lifecycle
BEFORE UPDATE ON public.commander_home_polls
FOR EACH ROW
EXECUTE FUNCTION public.fn_enforce_home_polls_lifecycle();

-- (B) Poll vote integrity: options must match, poll must be open
CREATE OR REPLACE FUNCTION public.fn_enforce_home_poll_vote_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
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

  -- Poll must be open
  IF v_poll.is_closed = true THEN
    RAISE EXCEPTION 'POLL_CLOSED'
          USING HINT = 'cannot vote on a closed poll';
  END IF;
  IF v_poll.closes_at IS NOT NULL AND v_poll.closes_at < now() THEN
    RAISE EXCEPTION 'POLL_EXPIRED'
          USING HINT = 'voting closed at ' || v_poll.closes_at::text;
  END IF;

  -- option_ids must be a subset of poll.options[*].id
  SELECT array_agg(value->>'id')
    INTO v_valid_ids
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

DROP TRIGGER IF EXISTS trg_enforce_home_poll_vote_integrity
  ON public.commander_home_poll_votes;
CREATE TRIGGER trg_enforce_home_poll_vote_integrity
BEFORE INSERT OR UPDATE ON public.commander_home_poll_votes
FOR EACH ROW
EXECUTE FUNCTION public.fn_enforce_home_poll_vote_integrity();

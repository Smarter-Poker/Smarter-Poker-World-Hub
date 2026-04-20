-- =====================================================================
-- Phase 41 bug-hunt pass 12: constrain commander_home_games lifecycle
-- and schedule mutations on direct UPDATE.
--
-- BUGS (confirmed via authenticated-host attack simulation):
--   H3 — Host can backdate scheduled_date to force all seat activity
--        to raise GAME_START_TIME_PASSED, silently closing the game
--        for every participant.
--   H4 — Host can revive a cancelled game by flipping status back to
--        scheduled and clearing cancelled_at. Members already got
--        cancellation notifications; the zombie revival desyncs them.
--
-- FIX:
--   BEFORE UPDATE trigger on commander_home_games.
--   SECURITY INVOKER so postgres/service_role bypass works correctly.
--
--   Status transitions (legit edges):
--     draft       → scheduled, cancelled
--     scheduled   → in_progress, cancelled, completed
--     in_progress → completed, cancelled
--     completed   → (terminal)
--     cancelled   → (terminal)
--
--   Schedule (scheduled_date, start_time):
--     - May be changed only while status IN ('draft','scheduled')
--     - May not be backdated to a past timestamp if the game is still
--       active (would force GAME_START_TIME_PASSED on participants)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_enforce_home_game_lifecycle_transitions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := current_user;
  v_new_start timestamptz;
BEGIN
  IF v_role IN ('postgres', 'supabase_admin', 'service_role',
                'supabase_auth_admin', 'supabase_storage_admin') THEN
    RETURN NEW;
  END IF;

  -- ---- Lifecycle transitions ----
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'cancelled' THEN
      RAISE EXCEPTION 'GAME_STATUS_TERMINAL'
        USING HINT = 'cancelled games cannot be revived; create a new game instead';
    END IF;
    IF OLD.status = 'completed' THEN
      RAISE EXCEPTION 'GAME_STATUS_TERMINAL'
        USING HINT = 'completed games cannot transition out of completed';
    END IF;
    IF OLD.status = 'draft' AND NEW.status NOT IN ('scheduled','cancelled') THEN
      RAISE EXCEPTION 'INVALID_GAME_TRANSITION'
        USING HINT = 'from draft, allowed next statuses are scheduled or cancelled';
    END IF;
    IF OLD.status = 'scheduled' AND NEW.status NOT IN ('in_progress','cancelled','completed','draft') THEN
      RAISE EXCEPTION 'INVALID_GAME_TRANSITION'
        USING HINT = 'from scheduled, allowed next statuses are in_progress, cancelled, completed, or draft';
    END IF;
    IF OLD.status = 'in_progress' AND NEW.status NOT IN ('completed','cancelled') THEN
      RAISE EXCEPTION 'INVALID_GAME_TRANSITION'
        USING HINT = 'from in_progress, allowed next statuses are completed or cancelled';
    END IF;
  END IF;

  -- ---- Schedule mutations ----
  IF NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date
     OR NEW.start_time  IS DISTINCT FROM OLD.start_time THEN
    -- Only mutable while game is active and pre-start
    IF OLD.status NOT IN ('draft','scheduled') THEN
      RAISE EXCEPTION 'GAME_SCHEDULE_LOCKED'
        USING HINT = 'cannot change schedule on a ' || OLD.status || ' game';
    END IF;
    -- Prevent backdating into the past while game is still active
    IF NEW.scheduled_date IS NOT NULL AND NEW.start_time IS NOT NULL THEN
      v_new_start := (NEW.scheduled_date + NEW.start_time)::timestamptz;
      IF v_new_start < now() THEN
        RAISE EXCEPTION 'GAME_SCHEDULE_PAST'
          USING HINT = 'cannot backdate scheduled_date + start_time into the past on an active game; '
                    || 'cancel instead';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_home_game_lifecycle_transitions
  ON public.commander_home_games;

CREATE TRIGGER trg_enforce_home_game_lifecycle_transitions
BEFORE UPDATE ON public.commander_home_games
FOR EACH ROW
EXECUTE FUNCTION public.fn_enforce_home_game_lifecycle_transitions();

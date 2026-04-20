-- =====================================================================
-- Pass 39: commander_home_games INSERT status restriction +
--          cancellation-metadata attribution lockdown
--
-- BUG BD-1 (CRITICAL):
--   Any approved member can INSERT a row into commander_home_games with
--   status='completed' (or 'in_progress'/'confirmed'/'cancelled'),
--   bypassing the whole lifecycle. Completed games unlock:
--     - review eligibility (home_game_reviews INSERT policy requires
--       status='completed')
--     - stat increments (games_hosted/games_attended)
--     - visibility in historical feeds
--   Existing lifecycle trigger only fires BEFORE UPDATE, not INSERT.
--
-- BUG BD-2 (ATTRIBUTION FORGERY):
--   Host/admin can direct-UPDATE cancelled_by to any user_id (including
--   another member) without going through cancel_home_game RPC. This
--   misattributes who cancelled the game. Similarly cancelled_at and
--   cancellation_reason can be set without actually cancelling.
--
-- FIX:
--   Layered as a NEW trigger (fn_enforce_home_game_insert_and_cancel_meta)
--   covering both INSERT and UPDATE to avoid rewriting the existing
--   lifecycle trigger. Service-role / postgres bypass preserved so legit
--   RPCs (cancel_home_game, complete_home_game, clone_home_game) still
--   work.
--
-- INSERT rules (authenticated callers only):
--   status must be in ('draft','scheduled')
--   cancelled_at / cancelled_by / cancellation_reason must be NULL
--
-- UPDATE rules (authenticated callers only):
--   cancelled_at / cancelled_by / cancellation_reason can only change
--   when status is ALSO transitioning to 'cancelled' in the same
--   statement (NEW.status = 'cancelled' AND OLD.status <> 'cancelled'
--   — the normal cancel flow via UPDATE ... SET status='cancelled',
--   cancelled_at=..., cancelled_by=..., cancellation_reason=...).
--   And when they ARE being set during cancel, cancelled_by must equal
--   auth.uid() (no attribution forgery).
-- ========================================================================

CREATE OR REPLACE FUNCTION public.fn_enforce_home_game_insert_and_cancel_meta()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_role text := current_user;
  v_caller uuid := auth.uid();
BEGIN
  -- Service-role / postgres bypass (cancel_home_game, complete_home_game,
  -- clone_home_game, cron jobs, migrations all land here)
  IF v_role IN ('postgres','supabase_admin','service_role',
                'supabase_auth_admin','supabase_storage_admin') THEN
    RETURN NEW;
  END IF;

  -- ─────────────────────── INSERT guards ───────────────────────
  IF TG_OP = 'INSERT' THEN
    -- Status must be draft or scheduled on user-initiated creation
    IF NEW.status IS NOT NULL AND NEW.status NOT IN ('draft','scheduled') THEN
      RAISE EXCEPTION 'INVALID_INITIAL_STATUS'
        USING HINT = 'new games must start as draft or scheduled; '
                  || 'cannot INSERT with status=' || NEW.status
                  || '. Use the lifecycle RPCs to transition later.';
    END IF;

    -- Cancellation metadata must be NULL on INSERT
    IF NEW.cancelled_at IS NOT NULL
       OR NEW.cancelled_by IS NOT NULL
       OR COALESCE(trim(NEW.cancellation_reason), '') <> '' THEN
      RAISE EXCEPTION 'CANCELLATION_METADATA_ON_INSERT'
        USING HINT = 'cancelled_at, cancelled_by, cancellation_reason must be NULL '
                  || 'on new games. Use cancel_home_game RPC to cancel later.';
    END IF;

    RETURN NEW;
  END IF;

  -- ─────────────────────── UPDATE guards ───────────────────────
  IF TG_OP = 'UPDATE' THEN
    -- Check if any cancellation metadata is being changed
    IF NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
       OR NEW.cancelled_by IS DISTINCT FROM OLD.cancelled_by
       OR NEW.cancellation_reason IS DISTINCT FROM OLD.cancellation_reason
    THEN
      -- Only legitimate during a status→cancelled transition
      IF NOT (NEW.status = 'cancelled' AND OLD.status <> 'cancelled') THEN
        RAISE EXCEPTION 'CANCELLATION_METADATA_WITHOUT_TRANSITION'
          USING HINT = 'cancelled_at/cancelled_by/cancellation_reason can only be set '
                    || 'during a status transition to cancelled. Use cancel_home_game RPC.';
      END IF;

      -- Attribution check: cancelled_by must be the caller
      IF NEW.cancelled_by IS NOT NULL AND NEW.cancelled_by <> v_caller THEN
        RAISE EXCEPTION 'CANCEL_ATTRIBUTION_FORGERY'
          USING HINT = 'cancelled_by must equal auth.uid(); '
                    || 'cannot attribute the cancellation to another user';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_home_game_insert_and_cancel_meta ON public.commander_home_games;
CREATE TRIGGER trg_enforce_home_game_insert_and_cancel_meta
BEFORE INSERT OR UPDATE ON public.commander_home_games
FOR EACH ROW
EXECUTE FUNCTION public.fn_enforce_home_game_insert_and_cancel_meta();

COMMENT ON FUNCTION public.fn_enforce_home_game_insert_and_cancel_meta() IS
  'Pass 39: Blocks (1) authenticated INSERT with status outside draft/scheduled '
  '(BD-1 lifecycle bypass), and (2) authenticated UPDATE of cancelled_at/'
  'cancelled_by/cancellation_reason outside a legit status->cancelled transition, '
  'including forged cancelled_by attribution (BD-2). Service-role / postgres bypass '
  'preserved for cancel_home_game, complete_home_game, clone_home_game, and migrations.';
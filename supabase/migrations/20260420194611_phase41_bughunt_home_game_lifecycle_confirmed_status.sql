-- Patch pass 12: include 'confirmed' in the status graph (missed in prior pass).
-- Valid transitions (per the status CHECK constraint on the table):
--   draft       → scheduled, cancelled
--   scheduled   → confirmed, in_progress, completed, cancelled, draft (demote)
--   confirmed   → scheduled (undo), in_progress, completed, cancelled
--   in_progress → completed, cancelled
--   completed   → (terminal)
--   cancelled   → (terminal)
-- Schedule may be changed while status IN ('draft','scheduled','confirmed')
-- and only forward in time.

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

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'cancelled' THEN
      RAISE EXCEPTION 'GAME_STATUS_TERMINAL'
        USING HINT = 'cancelled games cannot be revived';
    END IF;
    IF OLD.status = 'completed' THEN
      RAISE EXCEPTION 'GAME_STATUS_TERMINAL'
        USING HINT = 'completed games cannot transition out of completed';
    END IF;
    IF OLD.status = 'draft' AND NEW.status NOT IN ('scheduled','cancelled') THEN
      RAISE EXCEPTION 'INVALID_GAME_TRANSITION'
        USING HINT = 'from draft, allowed next: scheduled or cancelled';
    END IF;
    IF OLD.status = 'scheduled' AND NEW.status NOT IN ('confirmed','in_progress','completed','cancelled','draft') THEN
      RAISE EXCEPTION 'INVALID_GAME_TRANSITION'
        USING HINT = 'from scheduled, allowed next: confirmed, in_progress, completed, cancelled, draft';
    END IF;
    IF OLD.status = 'confirmed' AND NEW.status NOT IN ('scheduled','in_progress','completed','cancelled') THEN
      RAISE EXCEPTION 'INVALID_GAME_TRANSITION'
        USING HINT = 'from confirmed, allowed next: scheduled, in_progress, completed, cancelled';
    END IF;
    IF OLD.status = 'in_progress' AND NEW.status NOT IN ('completed','cancelled') THEN
      RAISE EXCEPTION 'INVALID_GAME_TRANSITION'
        USING HINT = 'from in_progress, allowed next: completed or cancelled';
    END IF;
  END IF;

  IF NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date
     OR NEW.start_time  IS DISTINCT FROM OLD.start_time THEN
    IF OLD.status NOT IN ('draft','scheduled','confirmed') THEN
      RAISE EXCEPTION 'GAME_SCHEDULE_LOCKED'
        USING HINT = 'cannot change schedule on a ' || OLD.status || ' game';
    END IF;
    IF NEW.scheduled_date IS NOT NULL AND NEW.start_time IS NOT NULL THEN
      v_new_start := (NEW.scheduled_date + NEW.start_time)::timestamptz;
      IF v_new_start < now() THEN
        RAISE EXCEPTION 'GAME_SCHEDULE_PAST'
          USING HINT = 'cannot backdate schedule into the past on an active game; cancel instead';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

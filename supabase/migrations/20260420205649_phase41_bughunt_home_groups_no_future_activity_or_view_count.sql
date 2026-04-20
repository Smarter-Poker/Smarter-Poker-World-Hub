-- =====================================================================
-- Pass 30: commander_home_groups — block future last_activity_at and
-- direct view_count tampering. Extends the existing group field-
-- permissions trigger.
--
-- BUG:
--   G5 — host can set last_activity_at to a far-future date, pushing
--        their group to the top of "trending" / "recent" feeds
--        indefinitely. SEO/ranking manipulation.
--   G6/future — view_count was not in the blocked-fields list (only
--        share_click_count was). Add it for defense-in-depth.
--
-- FIX: layer a new BEFORE UPDATE trigger with these checks, so we don't
-- rewrite the existing monolithic function (per pass-17 lesson).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_enforce_home_group_activity_and_views()
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
  -- Nested system trigger paths (recomputes) run at depth>1 and bypass
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- view_count: system-managed, direct mutation forbidden at user depth
  IF NEW.view_count IS DISTINCT FROM OLD.view_count THEN
    RAISE EXCEPTION 'IMMUTABLE_OR_COMPUTED_FIELD'
          USING HINT = 'view_count is maintained by the system';
  END IF;

  -- last_activity_at can be set to now() (legit revive) but not to the
  -- future. Allow changes where the new value is <= now() + small slop.
  IF NEW.last_activity_at IS DISTINCT FROM OLD.last_activity_at
     AND NEW.last_activity_at IS NOT NULL
     AND NEW.last_activity_at > NOW() + INTERVAL '1 minute' THEN
    RAISE EXCEPTION 'FUTURE_ACTIVITY_AT_FORBIDDEN'
          USING HINT = 'last_activity_at cannot be set to a future time';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_home_group_activity_and_views
  ON public.commander_home_groups;
CREATE TRIGGER trg_enforce_home_group_activity_and_views
BEFORE UPDATE ON public.commander_home_groups
FOR EACH ROW
EXECUTE FUNCTION public.fn_enforce_home_group_activity_and_views();

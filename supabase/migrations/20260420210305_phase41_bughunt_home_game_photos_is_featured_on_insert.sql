-- =====================================================================
-- Pass 32: home_game_photos — gate is_featured on INSERT, not just UPDATE.
--
-- BUG:
--   PH3 — pass 18 only fired BEFORE UPDATE. On INSERT, any uploader
--   could set is_featured=true, bypassing host-only moderation.
--
-- FIX: dedicated BEFORE INSERT trigger that force-clears is_featured
-- to false for non-host callers. Hosts can set it explicitly via the
-- same is_featured=true path (they'd set it OR do a subsequent UPDATE,
-- both paths checked against caller privilege).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_enforce_home_game_photos_is_featured_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_is_host boolean;
BEGIN
  IF auth.role() = 'service_role' OR v_caller IS NULL THEN RETURN NEW; END IF;
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  -- If inserter tries to set is_featured=true, verify host/owner/admin
  IF COALESCE(NEW.is_featured, false) = true THEN
    SELECT
      EXISTS (SELECT 1 FROM commander_home_games g
               WHERE g.id = NEW.game_id AND g.host_id = v_caller)
      OR EXISTS (SELECT 1 FROM commander_home_games g
                 JOIN commander_home_groups gr ON gr.id = g.group_id
                 WHERE g.id = NEW.game_id AND gr.owner_id = v_caller)
      OR EXISTS (SELECT 1 FROM commander_home_games g
                 JOIN commander_home_members m ON m.group_id = g.group_id
                 WHERE g.id = NEW.game_id
                   AND m.user_id = v_caller
                   AND m.role = 'admin'
                   AND m.status = 'approved')
    INTO v_is_host;

    IF NOT v_is_host THEN
      -- Quietly sanitize rather than reject, so legitimate uploads
      -- from non-hosts still succeed (just without the feature flag).
      NEW.is_featured := false;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_home_game_photos_is_featured_on_insert
  ON public.commander_home_game_photos;
CREATE TRIGGER trg_enforce_home_game_photos_is_featured_on_insert
BEFORE INSERT ON public.commander_home_game_photos
FOR EACH ROW
EXECUTE FUNCTION public.fn_enforce_home_game_photos_is_featured_on_insert();

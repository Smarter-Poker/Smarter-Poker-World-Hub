-- =====================================================================
-- Pass 18: commander_home_game_photos.is_featured is a moderation flag;
-- gate it to host / group-owner / admin. Currently the uploader of a
-- photo can self-feature via direct UPDATE — same class as pass 15
-- (posts.is_pinned).
--
-- Layered as a NEW trigger rather than folding into an existing one,
-- per the lesson from pass 17 (monolithic trigger rewrites silently
-- drop prior protections).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_enforce_home_game_photos_is_featured()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_is_host boolean;
BEGIN
  IF auth.role() = 'service_role' OR v_caller IS NULL THEN RETURN NEW; END IF;
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  IF NEW.is_featured IS DISTINCT FROM OLD.is_featured THEN
    SELECT
      EXISTS (SELECT 1 FROM commander_home_games g WHERE g.id = NEW.game_id AND g.host_id = v_caller)
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
      RAISE EXCEPTION 'HOST_ONLY_FIELD'
            USING HINT = 'is_featured is a moderation flag; only host/owner/admin can feature photos';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_home_game_photos_is_featured
  ON public.commander_home_game_photos;

CREATE TRIGGER trg_enforce_home_game_photos_is_featured
BEFORE UPDATE ON public.commander_home_game_photos
FOR EACH ROW
EXECUTE FUNCTION public.fn_enforce_home_game_photos_is_featured();

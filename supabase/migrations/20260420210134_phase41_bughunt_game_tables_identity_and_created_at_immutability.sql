-- =====================================================================
-- Pass 31: commander_home_game_tables — created_at + created_by immutable.
--
-- BUGS (verified):
--   T4 — host can backdate created_at to any past time
--   T5 — host can rewrite created_by to another user
--
-- FIX: layered BEFORE UPDATE trigger (don't modify the existing
-- fn_enforce_game_table_immutability body, per pass-17 lesson).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_enforce_game_table_identity_immutable()
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

  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'GAME_TABLE_IMMUTABLE'
          USING HINT = 'created_at is immutable on game tables';
  END IF;

  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'GAME_TABLE_IMMUTABLE'
          USING HINT = 'created_by is immutable on game tables';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_game_table_identity_immutable
  ON public.commander_home_game_tables;
CREATE TRIGGER trg_enforce_game_table_identity_immutable
BEFORE UPDATE ON public.commander_home_game_tables
FOR EACH ROW
EXECUTE FUNCTION public.fn_enforce_game_table_identity_immutable();

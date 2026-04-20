-- =====================================================================
-- Pass 22: commander_home_game_templates integrity.
--
-- BUGS:
--   GT1 — multiple templates per group could have is_default=true
--   GT2 — group_id could be relocated between groups the caller owns
--   GT3 — created_by could be rewritten (history tampering)
--   GT5 — created_at could be backdated
--
-- FIX:
--   (a) Partial unique index enforces at most one is_default=true per group.
--   (b) BEFORE UPDATE trigger (SECURITY INVOKER) blocks mutation of
--       identity/audit fields for non-admin paths.
-- =====================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_home_templates_single_default
  ON public.commander_home_game_templates (group_id)
  WHERE is_default = true;

CREATE OR REPLACE FUNCTION public.fn_enforce_home_game_templates_integrity()
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

  IF NEW.group_id IS DISTINCT FROM OLD.group_id THEN
    RAISE EXCEPTION 'IMMUTABLE_FIELD'
          USING HINT = 'group_id is immutable on templates; create a new template in the target group';
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'IMMUTABLE_FIELD'
          USING HINT = 'created_by is immutable on templates';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'IMMUTABLE_FIELD'
          USING HINT = 'created_at is immutable on templates';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_home_game_templates_integrity
  ON public.commander_home_game_templates;
CREATE TRIGGER trg_enforce_home_game_templates_integrity
BEFORE UPDATE ON public.commander_home_game_templates
FOR EACH ROW
EXECUTE FUNCTION public.fn_enforce_home_game_templates_integrity();

-- =====================================================================
-- Pass 23: commander_home_group_promotion_requests integrity.
--
-- BUGS (prefill class):
--   PR1a — status='approved' on INSERT
--   PR1b — reviewer_id pre-filled
--   PR1c — created_club_id pre-filled
--
-- FIX: BEFORE INSERT trigger forces moderator/review fields to
-- NULL/'pending'. Users submit the request; staff review it.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_enforce_home_promotion_request_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() = 'service_role' OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Force moderation-pending state for user-submitted requests
  NEW.status := 'pending';
  NEW.reviewer_id := NULL;
  NEW.reviewer_note := NULL;
  NEW.reviewed_at := NULL;
  NEW.created_club_id := NULL;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_home_promotion_request_insert
  ON public.commander_home_group_promotion_requests;
CREATE TRIGGER trg_enforce_home_promotion_request_insert
BEFORE INSERT ON public.commander_home_group_promotion_requests
FOR EACH ROW
EXECUTE FUNCTION public.fn_enforce_home_promotion_request_insert();

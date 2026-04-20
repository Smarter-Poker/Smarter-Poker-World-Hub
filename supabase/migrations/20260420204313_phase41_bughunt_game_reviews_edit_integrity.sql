-- =====================================================================
-- Pass 26: commander_home_game_reviews edit integrity.
--
-- BUGS:
--   R1 — review_text can be silently edited (no is_edited marker)
--   R2 — rating can be silently flipped
--   R3 — created_at can be backdated
--
-- FIX:
--   Add updated_at + is_edited columns. Auto-flip is_edited when
--   rating or review_text changes. Block created_at / updated_at
--   backdating (system-managed). Sticky is_edited.
-- =====================================================================

ALTER TABLE public.commander_home_game_reviews
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_edited boolean NOT NULL DEFAULT false;

-- Touch updated_at on any row change (system trigger at pg_trigger_depth > 0)
CREATE OR REPLACE FUNCTION public.fn_home_game_reviews_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_home_game_reviews_touch_updated_at
  ON public.commander_home_game_reviews;
CREATE TRIGGER trg_home_game_reviews_touch_updated_at
BEFORE UPDATE ON public.commander_home_game_reviews
FOR EACH ROW
EXECUTE FUNCTION public.fn_home_game_reviews_touch_updated_at();

-- Edit-integrity trigger (SECURITY INVOKER — current_user matters)
CREATE OR REPLACE FUNCTION public.fn_enforce_home_game_reviews_edit_integrity()
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

  -- created_at immutable
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'SYSTEM_ONLY_FIELD'
          USING HINT = 'created_at is immutable on reviews';
  END IF;

  -- updated_at: user-supplied rejected (touch trigger sets it at depth>1)
  IF NEW.updated_at IS DISTINCT FROM OLD.updated_at
     AND pg_trigger_depth() = 1 THEN
    -- Normalize to OLD.updated_at; the touch trigger will set it next
    -- This prevents a user from setting updated_at explicitly; the touch
    -- fires after and overwrites with NOW() anyway.
    RAISE EXCEPTION 'SYSTEM_ONLY_FIELD'
          USING HINT = 'updated_at is managed by trg_home_game_reviews_touch_updated_at';
  END IF;

  -- Auto-flip is_edited on content/rating change
  IF NEW.review_text IS DISTINCT FROM OLD.review_text
     OR NEW.rating IS DISTINCT FROM OLD.rating THEN
    NEW.is_edited := true;
  END IF;

  -- Sticky is_edited
  IF OLD.is_edited = true AND NEW.is_edited = false THEN
    RAISE EXCEPTION 'IS_EDITED_STICKY'
          USING HINT = 'is_edited cannot be reset once recorded';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_home_game_reviews_edit_integrity
  ON public.commander_home_game_reviews;
CREATE TRIGGER trg_enforce_home_game_reviews_edit_integrity
BEFORE UPDATE ON public.commander_home_game_reviews
FOR EACH ROW
EXECUTE FUNCTION public.fn_enforce_home_game_reviews_edit_integrity();

-- =====================================================================
-- Pass 27: commander_home_posts edit integrity.
--
-- BUGS:
--   P1 — updated_at can be backdated
--   P2 — content can be silently edited (no is_edited marker exists)
--
-- FIX:
--   Add is_edited column. Auto-flip on content/image/video edits.
--   Block updated_at user-supply. Sticky is_edited.
--
--   Not blocking visibility flips: a post author deciding to reduce
--   visibility after the fact is a legitimate UX choice.
-- =====================================================================

ALTER TABLE public.commander_home_posts
  ADD COLUMN IF NOT EXISTS is_edited boolean NOT NULL DEFAULT false;

-- Touch updated_at on UPDATE (runs at pg_trigger_depth > 0 naturally).
-- If a touch trigger already exists, this is a no-op CREATE OR REPLACE.
CREATE OR REPLACE FUNCTION public.fn_home_posts_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_home_posts_touch_updated_at ON public.commander_home_posts;
CREATE TRIGGER trg_home_posts_touch_updated_at
BEFORE UPDATE ON public.commander_home_posts
FOR EACH ROW
EXECUTE FUNCTION public.fn_home_posts_touch_updated_at();

-- Edit integrity trigger (layered, SECURITY INVOKER)
CREATE OR REPLACE FUNCTION public.fn_enforce_home_posts_edit_integrity()
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

  -- updated_at: system-managed (touch trigger runs at depth>0 next)
  IF NEW.updated_at IS DISTINCT FROM OLD.updated_at
     AND pg_trigger_depth() = 1 THEN
    RAISE EXCEPTION 'SYSTEM_ONLY_FIELD'
          USING HINT = 'updated_at is managed by trg_home_posts_touch_updated_at';
  END IF;

  -- Auto-flip on content/media change
  IF NEW.content IS DISTINCT FROM OLD.content
     OR NEW.image_urls IS DISTINCT FROM OLD.image_urls
     OR NEW.video_url IS DISTINCT FROM OLD.video_url THEN
    NEW.is_edited := true;
  END IF;

  -- Sticky
  IF OLD.is_edited = true AND NEW.is_edited = false THEN
    RAISE EXCEPTION 'IS_EDITED_STICKY'
          USING HINT = 'is_edited cannot be reset once recorded';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_home_posts_edit_integrity
  ON public.commander_home_posts;
CREATE TRIGGER trg_enforce_home_posts_edit_integrity
BEFORE UPDATE ON public.commander_home_posts
FOR EACH ROW
EXECUTE FUNCTION public.fn_enforce_home_posts_edit_integrity();

-- =====================================================================
-- Pass 44: Extend home_posts field-permission enforcement to INSERT
--
-- BUGS (3 verified — BH-1, BH-2, BH-3):
--   BH-1  Inflated engagement counters on INSERT.
--         Any authenticated user could INSERT a post with
--         likes_count=999999, comments_count=999999 — fake social proof.
--         The existing trg_enforce_home_post_field_permissions trigger
--         fires BEFORE UPDATE only; it does not block forgery at birth.
--
--   BH-2  Pin on insert without admin role.
--         Any member could INSERT a post with is_pinned=true. The
--         existing trigger blocks UPDATE is_pinned → true for non-admins,
--         but not the initial INSERT. Any user could pin their own post
--         to the top of a group.
--
--   BH-3  Backdated created_at on insert.
--         Any user could INSERT a post with created_at='2020-01-01',
--         forging post age — claim to be an early community poster,
--         or bury recent moderation-worthy content under a fake old
--         timestamp.
--
-- FIX:
--   Rewrite fn_enforce_home_post_field_permissions to handle both
--   INSERT and UPDATE. On INSERT:
--     • Force likes_count=0 and comments_count=0 (server-maintained)
--     • Force created_at=now()             (server-stamped)
--     • Require admin/owner for is_pinned=true
--   On UPDATE: existing logic preserved (block mutation of
--   likes_count/comments_count/created_at; restrict is_pinned to admins).
--
--   Replace trigger to fire BEFORE INSERT OR UPDATE.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_enforce_home_post_field_permissions()
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
  -- Service role and non-RLS paths bypass (legitimate server code)
  IF auth.role() = 'service_role' OR v_caller IS NULL THEN RETURN NEW; END IF;
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    -- BH-1: force server-maintained counters to 0 on insert (don't trust client)
    NEW.likes_count    := COALESCE(0, NEW.likes_count);
    NEW.comments_count := COALESCE(0, NEW.comments_count);
    -- Explicit override (not just COALESCE — client may have sent any value):
    NEW.likes_count    := 0;
    NEW.comments_count := 0;

    -- BH-3: force server-stamped timestamp on insert (prevent backdating
    -- or future-dating). Use transaction timestamp for consistency.
    NEW.created_at := now();

    -- BH-2: is_pinned on insert requires host/owner/admin of the group
    IF COALESCE(NEW.is_pinned, false) = true THEN
      SELECT
        EXISTS (SELECT 1 FROM commander_home_groups gr
                 WHERE gr.id = NEW.group_id AND gr.owner_id = v_caller)
        OR EXISTS (SELECT 1 FROM commander_home_members m
                   WHERE m.group_id = NEW.group_id
                     AND m.user_id = v_caller
                     AND m.role = 'admin'
                     AND m.status = 'approved')
      INTO v_is_host;

      IF NOT v_is_host THEN
        RAISE EXCEPTION 'HOST_ONLY_FIELD'
              USING HINT = 'is_pinned is a moderation flag; only group owner '
                        || 'or admin can create pinned posts';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  -- ─────── UPDATE path (preserved from original) ───────

  -- Computed/system fields
  IF NEW.likes_count    IS DISTINCT FROM OLD.likes_count
     OR NEW.comments_count IS DISTINCT FROM OLD.comments_count
     OR NEW.created_at  IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'IMMUTABLE_OR_COMPUTED_FIELD'
          USING HINT = 'likes_count, comments_count, created_at are '
                     || 'maintained by the system';
  END IF;

  -- is_pinned: host / group owner / admin only
  IF NEW.is_pinned IS DISTINCT FROM OLD.is_pinned THEN
    SELECT
      EXISTS (SELECT 1 FROM commander_home_groups gr
               WHERE gr.id = NEW.group_id AND gr.owner_id = v_caller)
      OR EXISTS (SELECT 1 FROM commander_home_members m
                 WHERE m.group_id = NEW.group_id
                   AND m.user_id = v_caller
                   AND m.role = 'admin'
                   AND m.status = 'approved')
    INTO v_is_host;

    IF NOT v_is_host THEN
      RAISE EXCEPTION 'HOST_ONLY_FIELD'
            USING HINT = 'is_pinned is a moderation flag; only group owner or '
                      || 'admin can pin/unpin posts';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Replace trigger to fire on INSERT too (previously UPDATE-only)
DROP TRIGGER IF EXISTS trg_enforce_home_post_field_permissions
  ON public.commander_home_posts;
CREATE TRIGGER trg_enforce_home_post_field_permissions
  BEFORE INSERT OR UPDATE ON public.commander_home_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_enforce_home_post_field_permissions();

COMMENT ON FUNCTION public.fn_enforce_home_post_field_permissions() IS
  'Pass 44: Enforces server-maintained field integrity on home posts for '
  'both INSERT and UPDATE. On INSERT: forces likes_count=0, '
  'comments_count=0, created_at=now(); requires host/admin for is_pinned=true. '
  'On UPDATE: blocks mutation of likes_count/comments_count/created_at; '
  'requires host/admin for is_pinned flip. Seals BH-1/BH-2/BH-3.';
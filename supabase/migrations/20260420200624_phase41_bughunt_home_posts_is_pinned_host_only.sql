-- =====================================================================
-- Pass 15: is_pinned on commander_home_posts is a moderation flag and
-- must be host-only. Currently any member can pin their own posts,
-- letting them spam the prominently-displayed pinned section.
--
-- BUG (confirmed): Author UPDATE path had no constraint on is_pinned,
-- so `UPDATE commander_home_posts SET is_pinned=true WHERE id=<own>`
-- succeeded for any author.
--
-- FIX: Extend fn_enforce_home_post_field_permissions to gate is_pinned
-- on host/owner/admin. Same shape as fn_enforce_home_rsvp_field_permissions.
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
  IF auth.role() = 'service_role' OR v_caller IS NULL THEN RETURN NEW; END IF;
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

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

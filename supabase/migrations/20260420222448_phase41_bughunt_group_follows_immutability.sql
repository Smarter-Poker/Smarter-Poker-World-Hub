-- =====================================================================
-- Pass 35c: commander_home_group_follows identity immutability (finding AM)
--
-- BUG:
--   User can UPDATE own follow row's group_id and migrate their follow
--   record to another group they shouldn't follow (e.g. private group
--   where they aren't a member). Also user_id rewrite (theoretically
--   blocked by UPDATE policy on user_id = auth.uid(), but defense in
--   depth).
--
-- FIX:
--   BEFORE UPDATE trigger blocks any change to group_id or user_id.
--   Edit paths (notification prefs) remain fully open.
--
-- BYPASS:
--   - service_role / postgres (admin rebind flows)
-- =======================================================================

CREATE OR REPLACE FUNCTION public.fn_enforce_home_group_follows_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  -- Service-role / postgres bypass
  IF current_user IN ('postgres','supabase_admin','service_role',
                       'supabase_auth_admin','supabase_storage_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.group_id IS DISTINCT FROM OLD.group_id THEN
    RAISE EXCEPTION 'FOLLOW_IMMUTABLE_FIELD'
      USING HINT = 'group_id cannot be changed. Unfollow and follow the new group.';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'FOLLOW_IMMUTABLE_FIELD'
      USING HINT = 'user_id cannot be changed.';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'FOLLOW_IMMUTABLE_FIELD'
      USING HINT = 'id cannot be changed.';
  END IF;

  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'FOLLOW_IMMUTABLE_FIELD'
      USING HINT = 'created_at cannot be changed.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_home_group_follows_immutability ON public.commander_home_group_follows;
CREATE TRIGGER trg_enforce_home_group_follows_immutability
BEFORE UPDATE ON public.commander_home_group_follows
FOR EACH ROW
EXECUTE FUNCTION public.fn_enforce_home_group_follows_immutability();

COMMENT ON FUNCTION public.fn_enforce_home_group_follows_immutability() IS
  'Pass 35c: Blocks UPDATE of group_id, user_id, id, created_at on '
  'commander_home_group_follows. Notification prefs (notify_new_games, '
  'notify_announcements) remain editable.';
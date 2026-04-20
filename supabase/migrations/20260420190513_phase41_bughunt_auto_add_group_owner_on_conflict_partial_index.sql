-- =====================================================================
-- Phase 41 bug-hunt pass 3: fix auto_add_group_owner to match the
-- partial unique index introduced by phase41.
--
-- Background:
--   Pre-phase41: commander_home_members had UNIQUE(group_id, user_id).
--   Phase41:     Replaced with partial unique index
--                commander_home_members_group_user_unique_active
--                ON (group_id, user_id) WHERE (user_id IS NOT NULL)
--                (needed so roster-only members with NULL user_id can be
--                added to the same group).
--
--   Consequence: the pre-existing trigger auto_add_group_owner() uses
--     ON CONFLICT (group_id, user_id) DO UPDATE ...
--   PostgreSQL will NOT match a partial unique index unless the ON
--   CONFLICT clause includes the partial-index predicate. Since phase41
--   shipped ~1.5 hours ago EVERY INSERT INTO commander_home_groups has
--   been raising:
--     42P10: there is no unique or exclusion constraint matching the
--            ON CONFLICT specification
--   This blocks all new home-game group creation in production.
--
-- Fix:
--   Add the matching WHERE predicate to the ON CONFLICT clause. The
--   INSERT here can never produce a NULL user_id (the function raises
--   if NEW.owner_id IS NULL, and owner_id is NOT NULL on the table
--   anyway), so the predicate is purely for PG's constraint-matcher.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.auto_add_group_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.owner_id IS NULL THEN
    RAISE EXCEPTION 'commander_home_groups.owner_id cannot be NULL — '
      'the creator of a home game is always the top admin';
  END IF;

  INSERT INTO commander_home_members (
    group_id, user_id, role, status, joined_at, can_host, is_regular,
    notifications_enabled, notify_announcements, notify_new_games,
    notify_game_reminders, notify_rsvp_updates
  ) VALUES (
    NEW.id, NEW.owner_id, 'owner', 'approved', now(), true, true,
    true, true, true, true, true
  )
  ON CONFLICT (group_id, user_id) WHERE user_id IS NOT NULL
  DO UPDATE
    SET role = 'owner',
        status = 'approved',
        can_host = true,
        joined_at = COALESCE(commander_home_members.joined_at, now());

  RETURN NEW;
END;
$function$;

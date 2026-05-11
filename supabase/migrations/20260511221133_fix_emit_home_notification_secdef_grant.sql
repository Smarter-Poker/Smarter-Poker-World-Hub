-- Dan-fix/silent-submit (2026-05-11): the home_group INSERT trigger cascade
-- was failing silently for the `authenticated` role with:
--   ERROR:  42501: permission denied for function fn_emit_home_notification
--   CONTEXT:
--     PL/pgSQL function fn_notify_friends_of_home_join() line 28 at PERFORM
--     SQL statement "INSERT INTO commander_home_members (...)"
--     PL/pgSQL function auto_add_group_owner() line 8 at SQL statement
--
-- Call chain (all running as the original `authenticated` caller):
--   1. INSERT into commander_home_groups
--   2. AFTER trigger auto_add_group_owner -> INSERT into commander_home_members
--   3. AFTER trigger fn_notify_friends_of_home_join fires on that member row
--   4. PERFORM public.fn_emit_home_notification(...)  <-- cross-function call
--   5. authenticated had no EXECUTE grant on fn_emit_home_notification
--      -> ENTIRE transaction rolls back
--
-- The home-group create page (pages/hub/commander/home-games/create.js)
-- POSTed to /api/commander/home-games/groups, the API returned a non-2xx
-- with the permission_denied message. PR #438 on the same day made the
-- client-side error banner visible (it was rendering but scrolled out of
-- frame); this migration fixes the actual underlying break.
--
-- fn_emit_home_notification's body has a top-level comment:
--   "Even the insert itself must not block the parent operation.
--    Notifications are nice-to-have; game creation/RSVP is critical."
-- and an internal `EXCEPTION WHEN OTHERS RAISE WARNING` block. The 42501
-- error is raised by PostgreSQL BEFORE the function body runs, so the
-- internal catch can't handle it. SECURITY DEFINER matches the documented
-- intent (and is safe -- body only inserts into `notifications` for the
-- user_id passed; no privilege-escalation surface).
--
-- Also hardened fn_notify_friends_of_home_join with its own EXCEPTION
-- WHEN OTHERS guard so any future inner-call failure (e.g., friendships
-- grants drift) logs and continues rather than blocking parent INSERTs.
-- Notification side-effects must NEVER block member-add.

ALTER FUNCTION public.fn_emit_home_notification(uuid, text, text, text, text, jsonb, text)
  SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.fn_emit_home_notification(uuid, text, text, text, text, jsonb, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_notify_friends_of_home_join()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''public''
AS $function$
DECLARE
    v_group RECORD; v_slug text; v_joiner_name text; v_friend RECORD;
BEGIN
    IF TG_OP = ''INSERT'' AND NEW.status <> ''approved'' THEN RETURN NEW; END IF;
    IF TG_OP = ''UPDATE'' AND (OLD.status = ''approved'' OR NEW.status <> ''approved'') THEN RETURN NEW; END IF;

    BEGIN
        SELECT * INTO v_group FROM commander_home_groups WHERE id = NEW.group_id;
        IF v_group IS NULL OR v_group.is_private THEN RETURN NEW; END IF;

        SELECT sp.slug INTO v_slug FROM social_pages sp
         WHERE sp.linked_entity_type=''home_group'' AND sp.linked_entity_id=v_group.id::text LIMIT 1;
        SELECT COALESCE(display_name, full_name, username, ''A friend'') INTO v_joiner_name
          FROM profiles WHERE id = NEW.user_id;

        FOR v_friend IN
            SELECT DISTINCT CASE WHEN f.user_id = NEW.user_id THEN f.friend_id ELSE f.user_id END AS friend_user_id
              FROM friendships f
             WHERE (f.user_id = NEW.user_id OR f.friend_id = NEW.user_id)
               AND f.status = ''accepted''
        LOOP
            IF v_friend.friend_user_id = NEW.user_id THEN CONTINUE; END IF;
            IF EXISTS (SELECT 1 FROM commander_home_members
                        WHERE group_id = NEW.group_id AND user_id = v_friend.friend_user_id) THEN
                CONTINUE;
            END IF;

            PERFORM public.fn_emit_home_notification(
                v_friend.friend_user_id, ''home_group_friend_joined'',
                v_joiner_name || '' joined '' || v_group.name,
                ''Your friend is now in '' || v_group.name || '' — check it out'',
                ''/hub/home-games/'' || COALESCE(v_slug, v_group.id::text),
                jsonb_build_object(''group_id'', v_group.id, ''friend_id'', NEW.user_id),
                ''friend_activity''
            );
        END LOOP;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING ''fn_notify_friends_of_home_join failed for group=% user=%: % (%)'',
            NEW.group_id, NEW.user_id, SQLERRM, SQLSTATE;
    END;

    RETURN NEW;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_notify_friends_of_home_join()
  TO authenticated;

-- BUG FIX: same SECURITY INVOKER → silent RLS rejection pattern as
-- 20260426110000, applied to RSVP counter trigger and member counter trigger.

CREATE OR REPLACE FUNCTION public.update_home_game_rsvp_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  UPDATE commander_home_games
     SET rsvp_yes = (SELECT COUNT(*) FROM commander_home_rsvps
                      WHERE game_id = COALESCE(NEW.game_id, OLD.game_id) AND response = 'yes'),
         rsvp_maybe = (SELECT COUNT(*) FROM commander_home_rsvps
                        WHERE game_id = COALESCE(NEW.game_id, OLD.game_id) AND response = 'maybe'),
         rsvp_no = (SELECT COUNT(*) FROM commander_home_rsvps
                     WHERE game_id = COALESCE(NEW.game_id, OLD.game_id) AND response = 'no'),
         waitlist_count = (SELECT COUNT(*) FROM commander_home_rsvps
                            WHERE game_id = COALESCE(NEW.game_id, OLD.game_id) AND response = 'waitlist'),
         updated_at = NOW()
   WHERE id = COALESCE(NEW.game_id, OLD.game_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_home_group_member_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  UPDATE commander_home_groups
     SET member_count = (SELECT COUNT(*) FROM commander_home_members
                          WHERE group_id = COALESCE(NEW.group_id, OLD.group_id)
                            AND status = 'approved'),
         updated_at = NOW()
   WHERE id = COALESCE(NEW.group_id, OLD.group_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

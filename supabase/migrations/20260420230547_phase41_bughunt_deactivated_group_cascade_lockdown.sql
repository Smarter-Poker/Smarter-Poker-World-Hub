-- =====================================================================
-- Pass 40: Deactivated-group cascade lockdown
--
-- BUG (4 vulns BE-1..BE-4, plus BE-0 accidental):
--   When a home group has is_active=false, members and host could still
--   INSERT new activity into it:
--     BE-1: comments on existing posts          (ALLOWED)
--     BE-2: RSVPs on existing games             (ALLOWED)
--     BE-3: likes on existing posts             (ALLOWED)
--     BE-4: host creates NEW games              (ALLOWED)
--     BE-0: posts were ONLY blocked accidentally by a permission
--           denied on fn_bump_home_group_activity (not a real policy).
--
--   "Deactivating" a group was cosmetic — the group was meant to be
--   frozen but users could keep engaging in it indefinitely.
--
-- FIX:
--   New trigger fn_require_active_home_group() attached BEFORE INSERT
--   on every user-activity table that belongs (directly or via parent
--   row) to a home group:
--     commander_home_posts                (group_id direct)
--     commander_home_games                (group_id direct)
--     commander_home_polls                (group_id direct)
--     commander_home_post_comments        (via posts.group_id)
--     commander_home_post_likes           (via posts.group_id)
--     commander_home_rsvps                (via games.group_id)
--     commander_home_poll_votes           (via polls.group_id)
--     commander_home_game_photos          (via games.group_id)
--     commander_home_game_reviews         (via games.group_id)
--     commander_home_seat_reservations    (via game_tables→games.group_id)
--
--   Service-role / postgres bypass preserved so legit SECURITY DEFINER
--   RPCs and migrations still work.
--
--   Members table is intentionally NOT gated: join/leave must always
--   be possible on deactivated groups (leave is a safety valve; join
--   flow goes through request_to_join_home_group RPC which can apply
--   its own business rule).
-- =======================================================================

CREATE OR REPLACE FUNCTION public.fn_require_active_home_group()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_role text := current_user;
  v_group_id uuid;
  v_active boolean;
BEGIN
  -- Service-role / postgres bypass (cancel flows, admin tools, cron)
  IF v_role IN ('postgres','supabase_admin','service_role',
                'supabase_auth_admin','supabase_storage_admin') THEN
    RETURN NEW;
  END IF;

  -- Nested-trigger bypass (shouldn't hit on INSERT but keep safe)
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Resolve target group_id based on table
  CASE TG_TABLE_NAME
    WHEN 'commander_home_posts',
         'commander_home_games',
         'commander_home_polls' THEN
      v_group_id := NEW.group_id;

    WHEN 'commander_home_post_comments',
         'commander_home_post_likes' THEN
      SELECT p.group_id INTO v_group_id
        FROM public.commander_home_posts p WHERE p.id = NEW.post_id;

    WHEN 'commander_home_rsvps',
         'commander_home_game_photos',
         'commander_home_game_reviews' THEN
      SELECT g.group_id INTO v_group_id
        FROM public.commander_home_games g WHERE g.id = NEW.game_id;

    WHEN 'commander_home_poll_votes' THEN
      SELECT pl.group_id INTO v_group_id
        FROM public.commander_home_polls pl WHERE pl.id = NEW.poll_id;

    WHEN 'commander_home_seat_reservations' THEN
      SELECT g.group_id INTO v_group_id
        FROM public.commander_home_game_tables t
        JOIN public.commander_home_games g ON g.id = t.game_id
       WHERE t.id = NEW.table_id;

    ELSE
      RETURN NEW;
  END CASE;

  IF v_group_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT is_active INTO v_active
    FROM public.commander_home_groups
   WHERE id = v_group_id;

  IF v_active IS FALSE THEN
    RAISE EXCEPTION 'GROUP_INACTIVE'
      USING HINT = 'group is deactivated — no new activity is permitted. '
                || 'Owner must reactivate the group first.';
  END IF;

  RETURN NEW;
END;
$$;

-- Attach to all activity-insert tables
DO $$
DECLARE
  v_tbl text;
  v_tables text[] := ARRAY[
    'commander_home_posts',
    'commander_home_games',
    'commander_home_polls',
    'commander_home_post_comments',
    'commander_home_post_likes',
    'commander_home_rsvps',
    'commander_home_poll_votes',
    'commander_home_game_photos',
    'commander_home_game_reviews',
    'commander_home_seat_reservations'
  ];
BEGIN
  FOREACH v_tbl IN ARRAY v_tables LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_require_active_home_group ON public.%I;', v_tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_require_active_home_group
         BEFORE INSERT ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.fn_require_active_home_group();', v_tbl);
  END LOOP;
END $$;

COMMENT ON FUNCTION public.fn_require_active_home_group() IS
  'Pass 40: Blocks INSERT on any user-activity table whose owning group has '
  'is_active=false. Applied to posts, games, polls, comments, likes, rsvps, '
  'poll_votes, game_photos, game_reviews, seat_reservations. Service-role / '
  'postgres bypass preserved for legit RPC paths. Members table intentionally '
  'excluded (leave must always work).';
-- Pass 47 BK-3 v2: replace hstore-based assignment with TG_TABLE_NAME branching.
-- hstore is not available in this project; plpgsql handles NEW.col assignment
-- via compile-time column resolution per branch.

CREATE OR REPLACE FUNCTION public.fn_home_force_insert_origin_ts()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text := current_user;
BEGIN
  IF v_role IN ('postgres', 'supabase_admin', 'service_role',
                'supabase_auth_admin', 'supabase_storage_admin') THEN
    RETURN NEW;
  END IF;

  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Each branch resolves the correct column on the row type at compile time,
  -- bypassing the need for dynamic SQL / hstore. Unreachable branches are
  -- never parsed against the wrong row type because plpgsql defers record
  -- member resolution to first execution per call path.
  IF TG_TABLE_NAME = 'commander_home_rsvps' THEN
    NEW.responded_at := NOW();
  ELSIF TG_TABLE_NAME = 'commander_home_group_promotion_requests' THEN
    NEW.requested_at := NOW();
  ELSE
    NEW.created_at := NOW();
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_home_force_insert_origin_ts() IS
  'Pass 47 BK-3 v2: BEFORE INSERT pair for fn_home_protect_row_identity. '
  'Overwrites the origin-timestamp column with NOW() for non-service-role '
  'callers. Branches by TG_TABLE_NAME to resolve the right column per table '
  '(created_at by default, responded_at for RSVPs, requested_at for '
  'promotion_requests). Prevents INSERT-time chronology tamper (BK-3).';

-- Re-attach on every in-scope home_* table (drop prior args-style triggers).
DO $outer$
DECLARE
  v_tables text[] := ARRAY[
    'commander_home_members',
    'commander_home_groups',
    'commander_home_games',
    'commander_home_game_templates',
    'commander_home_game_tables',
    'commander_home_posts',
    'commander_home_post_comments',
    'commander_home_post_likes',
    'commander_home_polls',
    'commander_home_poll_votes',
    'commander_home_game_photos',
    'commander_home_game_reviews',
    'commander_home_group_follows',
    'commander_home_seat_reservations',
    'commander_home_content_reports',
    'commander_home_invite_tokens',
    'commander_home_rsvps',
    'commander_home_group_promotion_requests'
  ];
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_home_force_insert_origin_ts ON public.%I',
      v_table
    );
    EXECUTE format(
      'CREATE TRIGGER trg_home_force_insert_origin_ts '
      'BEFORE INSERT ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.fn_home_force_insert_origin_ts()',
      v_table
    );
  END LOOP;
END;
$outer$;
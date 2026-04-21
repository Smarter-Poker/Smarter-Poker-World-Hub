-- =====================================================================
-- Pass 47: Universal row-identity immutability for home_* tables
-- BK-1: created_at tamper on commander_home_members (verified live).
-- BK-2: id tamper on commander_home_members (verified live).
-- Blast radius: 18 home_* tables with writable RLS UPDATE policies.
-- Fix: BEFORE UPDATE trigger blocks NEW.id <> OLD.id and
--      NEW.created_at <> OLD.created_at for non-service-role callers.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_home_protect_row_identity()
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

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'ROW_IDENTITY_IMMUTABLE'
          USING HINT = 'the primary key (id) of a ' || TG_TABLE_NAME
                     || ' row cannot be changed via direct UPDATE; '
                     || 'delete and recreate the row if needed (was '
                     || OLD.id::text || ', attempted ' || NEW.id::text || ')',
                ERRCODE = '42501';
  END IF;

  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'CREATED_AT_IMMUTABLE'
          USING HINT = 'created_at on ' || TG_TABLE_NAME
                     || ' is the row origin timestamp and cannot be '
                     || 'modified after insert (was '
                     || OLD.created_at::text || ', attempted '
                     || NEW.created_at::text || ')',
                ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_home_protect_row_identity() IS
  'Pass 47: universal row-identity immutability for home_* tables. '
  'Blocks NEW.id <> OLD.id (PK tamper) and NEW.created_at <> OLD.created_at '
  '(chronology tamper) for non-service-role callers. Attached as BEFORE UPDATE '
  'on every home_* table with a writable RLS UPDATE policy. Seals BK-1/BK-2.';

DO $outer$
DECLARE
  v_tables text[] := ARRAY[
    'commander_home_members',
    'commander_home_groups',
    'commander_home_games',
    'commander_home_game_templates',
    'commander_home_game_tables',
    'commander_home_rsvps',
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
    'commander_home_group_promotion_requests',
    'commander_home_invite_tokens'
  ];
  v_table text;
  v_has_id boolean;
  v_has_created_at boolean;
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    SELECT
      bool_or(column_name = 'id'),
      bool_or(column_name = 'created_at')
    INTO v_has_id, v_has_created_at
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = v_table;

    IF v_has_id IS NOT TRUE OR v_has_created_at IS NOT TRUE THEN
      RAISE NOTICE 'Pass 47: skipping %; missing id or created_at column',
        v_table;
      CONTINUE;
    END IF;

    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_home_protect_row_identity ON public.%I',
      v_table
    );
    EXECUTE format(
      'CREATE TRIGGER trg_home_protect_row_identity '
      'BEFORE UPDATE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.fn_home_protect_row_identity()',
      v_table
    );
  END LOOP;
END;
$outer$;

COMMENT ON TRIGGER trg_home_protect_row_identity ON public.commander_home_members IS
  'Pass 47 BK-1/BK-2: blocks direct PostgREST tamper of id/created_at by '
  'authenticated/anon roles. See fn_home_protect_row_identity.';
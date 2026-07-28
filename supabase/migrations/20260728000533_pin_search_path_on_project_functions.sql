-- Mirrored from the live database on 2026-07-28. Applied via MCP as migration 20260728000533_pin_search_path_on_project_functions.
-- Recorded here so a fresh 'supabase db reset' replays it and cannot silently reopen what it closed.

-- ═══════════════════════════════════════════════════════════════════════
-- Pin `search_path` on the ten project-owned functions that lacked it.
--
-- A function without a fixed search_path resolves unqualified names using
-- whatever search_path the caller happens to have. Postgres itself only
-- treats this as critical for SECURITY DEFINER functions (none of these
-- ten are DEFINER, so this is hardening rather than an open hole), but a
-- caller that can create objects in an earlier schema can still shadow a
-- table or operator these functions rely on and change their results.
--
-- Extension-owned functions (postgis, vector, pg_trgm, plpgsql_check) are
-- deliberately excluded — they belong to the extension and altering them
-- would be undone by the next extension upgrade.
--
-- `pg_temp` is placed last, which is the documented safe ordering: it
-- prevents a caller's temporary objects from taking precedence over the
-- real ones in `public`.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n2 ON n2.oid = p.pronamespace
    WHERE n2.nspname = 'public'
      AND p.proname IN (
        'fn_hg_validate_game_scheduled_date',
        'get_mlb_standings_ext',
        'get_mlb_validation_stats',
        'mlb_validation_stats',
        'sp_backfill_matrix_batch',
        'sp_pending_boards',
        'sp_refresh_pending_families',
        'sp_solved_state',
        'sp_sync_matrix',
        'sp_v2_to_app_matrix')
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')
      -- never touch anything owned by an extension
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
    n := n + 1;
  END LOOP;

  RAISE NOTICE 'pinned search_path on % function(s)', n;

  IF n = 0 THEN
    RAISE EXCEPTION 'expected to pin at least one function, pinned none — name list is stale';
  END IF;
END $$;

-- Post-condition: none of the ten may remain unpinned.
DO $$
DECLARE
  remaining text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO remaining
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'fn_hg_validate_game_scheduled_date','get_mlb_standings_ext',
      'get_mlb_validation_stats','mlb_validation_stats','sp_backfill_matrix_batch',
      'sp_pending_boards','sp_refresh_pending_families','sp_solved_state',
      'sp_sync_matrix','sp_v2_to_app_matrix')
    AND NOT EXISTS (
      SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%');

  IF remaining IS NOT NULL THEN
    RAISE EXCEPTION 'still unpinned: %', remaining;
  END IF;
END $$;

-- Phase 5 release audit: keep the ranked queue inside PostgREST's statement
-- budget. The original function serialized every column in profiles for every
-- grouped pair and hid its partial-index predicate behind coalesce().
--
-- This migration changes only those equivalent expressions. It asserts every
-- expected source fragment before replacing the function so upstream drift
-- cannot silently produce a partial optimization.
--
-- ROLLBACK:
-- Restore fn_ca_integrity_queue from migration 20260906101639. No application
-- rows or detector findings are changed by this migration.

DO $migration$
DECLARE
  v_sql text;
  v_before text;
BEGIN
  SELECT pg_get_functiondef(
    'public.fn_ca_integrity_queue(boolean,text,text,text,timestamptz,integer,jsonb)'::regprocedure
  ) INTO v_sql;

  IF v_sql IS NULL THEN
    RAISE EXCEPTION 'fn_ca_integrity_queue is missing';
  END IF;

  v_before := v_sql;
  v_sql := replace(
    v_sql,
    'coalesce(c.status, ''open'') = ''open''',
    'c.status = ''open'''
  );
  IF v_sql = v_before THEN
    RAISE EXCEPTION 'queue open-status predicate did not match';
  END IF;

  v_before := v_sql;
  v_sql := replace(
    v_sql,
    'coalesce((to_jsonb(pa) ->> ''is_horse'')::boolean, false)',
    'coalesce(pa.is_horse, false)'
  );
  IF v_sql = v_before OR position('to_jsonb(pa) ->> ''is_horse''' IN v_sql) > 0 THEN
    RAISE EXCEPTION 'queue player-a horse expressions were not fully replaced';
  END IF;

  v_before := v_sql;
  v_sql := replace(
    v_sql,
    'coalesce((to_jsonb(pb) ->> ''is_horse'')::boolean, false)',
    'coalesce(pb.is_horse, false)'
  );
  IF v_sql = v_before OR position('to_jsonb(pb) ->> ''is_horse''' IN v_sql) > 0 THEN
    RAISE EXCEPTION 'queue player-b horse expressions were not fully replaced';
  END IF;

  v_before := v_sql;
  v_sql := replace(
    v_sql,
    'coalesce(to_jsonb(pa) ->> ''display_name'', to_jsonb(pa) ->> ''username'', g.player_a_id::text)',
    'coalesce(pa.display_name, pa.username, g.player_a_id::text)'
  );
  IF v_sql = v_before THEN
    RAISE EXCEPTION 'queue player-a name expression did not match';
  END IF;

  v_before := v_sql;
  v_sql := replace(
    v_sql,
    'coalesce(to_jsonb(pb) ->> ''display_name'', to_jsonb(pb) ->> ''username'', g.player_b_id::text)',
    'coalesce(pb.display_name, pb.username, g.player_b_id::text)'
  );
  IF v_sql = v_before THEN
    RAISE EXCEPTION 'queue player-b name expression did not match';
  END IF;

  EXECUTE v_sql;
END;
$migration$;

REVOKE ALL ON FUNCTION public.fn_ca_integrity_queue(boolean, text, text, text, timestamptz, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ca_integrity_queue(boolean, text, text, text, timestamptz, integer, jsonb) TO service_role;


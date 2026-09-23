-- Restored migration file.
--
-- This migration is already installed in the production database under version
-- 20260914082602, which is exactly the version recorded for it in
-- supabase_migrations.schema_migrations.
--
-- The file was lost from source when commit
-- 35a6e033038978c696cf94b651db5756221a4ec3 restored the tree to a September 13
-- snapshot. It is restored here under its original version number and name so
-- that source matches the database that is actually installed.
--
-- Re-running this migration is safe. The function is written as
-- CREATE OR REPLACE, and the preflight guard below accepts the already-migrated
-- definition hash as well as the pre-migration one.
--
-- The SQL below is reproduced byte for byte from the migration ledger.

-- Retain the candidate cursor even when player filters match no hands.
DO $guard$
DECLARE v_definition text;
BEGIN
  SELECT md5(pg_get_functiondef('public.fn_ca_integrity_hands(uuid,uuid,timestamptz,integer,jsonb,boolean)'::regprocedure)) INTO v_definition;
  IF v_definition NOT IN ('33c571e374bf6a57aa79f349944e833b', '13ef06d17be466008dacf2ee9dab791e') THEN
    RAISE EXCEPTION 'Integrity hand search definition drift: %', v_definition;
  END IF;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.fn_ca_integrity_hands(p_player_id uuid DEFAULT NULL::uuid, p_pair_player_id uuid DEFAULT NULL::uuid, p_as_of timestamp with time zone DEFAULT now(), p_limit integer DEFAULT 25, p_cursor jsonb DEFAULT NULL::jsonb, p_include_horses boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_as_of      timestamptz := least(coalesce(p_as_of, now()), now());
  v_limit      integer := least(greatest(coalesce(p_limit, 25), 1), 50);
  v_candidate  integer := 500;
  v_rows       jsonb;
  v_next       jsonb;
  v_match      bigint;
  v_scanned    integer;
BEGIN
  IF p_pair_player_id IS NOT NULL AND p_player_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PLAYER_ID_REQUIRED',
                              'message', 'A primary player is required for pair search');
  END IF;
  IF p_cursor IS NOT NULL AND (jsonb_typeof(p_cursor) <> 'object'
      OR NOT (p_cursor ?& array['created_at', 'id'])
      OR p_cursor ->> 'created_at' IS NULL OR p_cursor ->> 'id' IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_CURSOR',
                              'message', 'The hand cursor is incomplete');
  END IF;

  WITH candidates AS MATERIALIZED (
    SELECT h.id, h.table_id, h.tournament_id, h.hand_number, h.game_variant,
           h.pot_size, h.big_blind, h.small_blind, h.players, h.winners,
           h.actions, h.created_at
    FROM public.hand_history h
    WHERE h.created_at <= v_as_of
      AND (p_cursor IS NULL OR ROW(h.created_at, h.id) < ROW(
        (p_cursor ->> 'created_at')::timestamptz,
        (p_cursor ->> 'id')::uuid))
    ORDER BY h.created_at DESC, h.id DESC
    LIMIT v_candidate
  ), matched AS MATERIALIZED (
    SELECT c.*
    FROM candidates c
    WHERE (p_player_id IS NULL OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(coalesce(c.players, '[]'::jsonb)) x
       WHERE coalesce(x ->> 'user_id', x ->> 'userId', x ->> 'id') = p_player_id::text))
      AND (p_pair_player_id IS NULL OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(coalesce(c.players, '[]'::jsonb)) x
       WHERE coalesce(x ->> 'user_id', x ->> 'userId', x ->> 'id') = p_pair_player_id::text))
  ), page AS MATERIALIZED (
    SELECT m.*, row_number() OVER (ORDER BY m.created_at DESC, m.id DESC) AS rn
    FROM matched m
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT v_limit + 1
  )
  SELECT
    coalesce(jsonb_agg((to_jsonb(p) - 'rn') ORDER BY p.rn)
      FILTER (WHERE p.rn <= v_limit), '[]'::jsonb),
    (SELECT count(*)::bigint FROM matched),
    (SELECT count(*)::integer FROM candidates),
    CASE WHEN count(*) > v_limit THEN (
      SELECT jsonb_build_object('created_at', z.created_at, 'id', z.id)
      FROM page z WHERE z.rn = v_limit)
    WHEN (SELECT count(*) FROM candidates) = v_candidate THEN (
      SELECT jsonb_build_object('created_at', c.created_at, 'id', c.id)
      FROM candidates c ORDER BY c.created_at ASC, c.id ASC LIMIT 1) END
    INTO v_rows, v_match, v_scanned, v_next
    FROM page p;

  RETURN jsonb_build_object(
    'ok', true,
    'state', CASE WHEN v_match > 0 THEN 'hands_available'
                  WHEN v_next IS NOT NULL THEN 'search_incomplete'
                  ELSE 'nothing_to_review' END,
    'hands', v_rows,
    'rows', v_rows,
    'matched_in_sample', v_match,
    'candidate_cap', v_candidate,
    'scanned_count', v_scanned,
    'truncated', v_next IS NOT NULL,
    'include_horses', coalesce(p_include_horses, true),
    'as_of', v_as_of,
    'measured_at', clock_timestamp(),
    'next_cursor', v_next,
    'coverage_note', 'Search examines the newest 500 candidate hands per page before player filters.');
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
  RETURN jsonb_build_object('ok', false, 'code', 'INVALID_CURSOR',
                            'message', 'The hand cursor is invalid', 'state', 'unknown');
WHEN OTHERS THEN
  RAISE NOTICE 'fn_ca_integrity_hands source error: %', SQLERRM;
  RETURN jsonb_build_object('ok', false, 'code', 'HANDS_SOURCE_ERROR',
                            'message', 'The hand-history source could not be read', 'state', 'unknown');
END;
$function$;


REVOKE ALL ON FUNCTION public.fn_ca_integrity_hands(uuid,uuid,timestamptz,integer,jsonb,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ca_integrity_hands(uuid,uuid,timestamptz,integer,jsonb,boolean) TO service_role;

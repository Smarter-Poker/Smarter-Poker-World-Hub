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
BEGIN
  IF p_pair_player_id IS NOT NULL AND p_player_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PLAYER_ID_REQUIRED',
                              'message', 'A primary player is required for pair search');
  END IF;
  IF p_cursor IS NOT NULL AND NOT (p_cursor ?& array['created_at', 'id']) THEN
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
    CASE WHEN count(*) > v_limit THEN (
      SELECT jsonb_build_object('created_at', z.created_at, 'id', z.id)
      FROM page z WHERE z.rn = v_limit) END
    INTO v_rows, v_match, v_next
    FROM page p;

  RETURN jsonb_build_object(
    'ok', true,
    'state', CASE WHEN v_match > 0 THEN 'hands_available' ELSE 'nothing_to_review' END,
    'hands', v_rows,
    'rows', v_rows,
    'matched_in_sample', v_match,
    'candidate_cap', v_candidate,
    'truncated', true,
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
$function$


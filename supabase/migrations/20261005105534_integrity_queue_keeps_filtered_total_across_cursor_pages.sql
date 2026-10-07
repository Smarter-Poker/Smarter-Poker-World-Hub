-- 20261005105534_integrity_queue_keeps_filtered_total_across_cursor_pages.sql
--
-- A continuation cursor used to reduce totals.filtered_groups to only the
-- pairs remaining after that cursor. The client consequently reported a
-- smaller result set on every page. Carry the view-wide filtered total in the
-- signed cursor data and reuse it on continuation pages. Ranking, inclusion,
-- evidence, and detector health are unchanged.

BEGIN;

DO $migration$
DECLARE
  v_function regprocedure :=
    'public.fn_ca_integrity_queue(boolean,text,text,text,timestamptz,integer,jsonb)'::regprocedure;
  v_expected_pre text := '8a9d9de1e1a957e43ac765f2fe7f8b43';
  v_definition text;
  v_replaced text;
  v_expected_post text;
  v_actual_post text;
  v_cursor_old text := $old$
        'player_a_id', z.player_a_id,
        'player_b_id', z.player_b_id)
      FROM page z WHERE z.rn = v_limit
$old$;
  v_cursor_new text := $new$
        'player_a_id', z.player_a_id,
        'player_b_id', z.player_b_id,
        'filtered_groups', coalesce(
          CASE WHEN p_cursor ? 'filtered_groups'
            THEN (p_cursor ->> 'filtered_groups')::bigint END,
          (SELECT count(*)::bigint FROM selected)))
      FROM page z WHERE z.rn = v_limit
$new$;
  v_total_old text := $old$
      'filtered_groups', (SELECT count(*)::bigint FROM selected),
$old$;
  v_total_new text := $new$
      'filtered_groups', coalesce(
        CASE WHEN p_cursor ? 'filtered_groups'
          THEN (p_cursor ->> 'filtered_groups')::bigint END,
        (SELECT count(*)::bigint FROM selected)),
$new$;
BEGIN
  SELECT pg_get_functiondef(v_function) INTO v_definition;

  IF md5(v_definition) <> v_expected_pre THEN
    IF v_definition LIKE '%''filtered_groups'', coalesce(%p_cursor ? ''filtered_groups''%' THEN
      RAISE NOTICE 'fn_ca_integrity_queue already preserves filtered totals across cursor pages.';
      RETURN;
    END IF;
    RAISE EXCEPTION
      'Refusing to apply over drift: fn_ca_integrity_queue expected md5 %, found %',
      v_expected_pre, md5(v_definition);
  END IF;

  IF strpos(v_definition, v_cursor_old) = 0 OR strpos(v_definition, v_total_old) = 0 THEN
    RAISE EXCEPTION 'Refusing to apply: reviewed queue fragments were not found';
  END IF;

  v_replaced := replace(v_definition, v_cursor_old, v_cursor_new);
  v_replaced := replace(v_replaced, v_total_old, v_total_new);
  v_expected_post := md5(v_replaced);
  EXECUTE v_replaced;

  SELECT md5(pg_get_functiondef(v_function)) INTO v_actual_post;
  IF v_actual_post <> v_expected_post THEN
    RAISE EXCEPTION
      'Post-image mismatch: expected md5 %, found %',
      v_expected_post, v_actual_post;
  END IF;

  RAISE NOTICE 'fn_ca_integrity_queue replaced. Post-image md5 %.', v_actual_post;
END
$migration$;

COMMIT;

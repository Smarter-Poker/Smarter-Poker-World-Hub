-- The integrity review queue was intermittently failing in production with
-- SQLSTATE 57014, canceling statement due to statement timeout. The enforced
-- statement_timeout for service_role is 8s.
--
-- Measured end to end on production data (227,414 collusion_tracking rows,
-- 57,975 of them open with a second player, 74,543 detector observations,
-- 45,440 grouped pairs), the live function ran 7,492 ms, 7,505 ms, 7,512 ms,
-- 7,538 ms and 7,617 ms over five consecutive runs, with an earlier colder
-- sample at 9,194 ms. It therefore sat on the wrong side of the 8s budget and
-- died whenever the machine was busy. The definition installed here runs the
-- same call in 2,234 ms, 2,241 ms, 2,250 ms, 2,250 ms and 2,273 ms over five
-- runs, a mean of 2,250 ms, which leaves about 5.75 seconds of headroom. Both
-- sets include the roughly 1,033 ms fn_ca_integrity_detector_health(30) call,
-- because the 8s limit applies to the whole function call.
--
-- Root cause. Three compounding defects, all on the read path.
--
-- 1. Whole-row serialization on the hot table. The window key was built with
--    coalesce(to_jsonb(c) ->> 'window_start', c.created_at::text), which
--    serialized every column of collusion_tracking, including the roughly
--    305 byte evidence jsonb, into a jsonb object twice per row across 57,975
--    rows, purely to read two columns that exist natively on the table.
--    window_start and window_end are real timestamptz columns, and window_end
--    is even a key column of the partial index. Migration
--    20260906200000_integrity_queue_uses_narrow_indexable_rows.sql removed
--    exactly this anti-pattern from the profiles joins and never touched the
--    collusion_tracking projection; that file contains no occurrence of
--    to_jsonb(c). The cheap half was fixed and the expensive half was left.
--
-- 2. A correlated subquery over anti_cheat_flags evaluated once per grouped
--    pair. The plan showed a sequential scan of that 35 row table with
--    loops=45,440 and 90,880 shared buffer hits, which was 92 percent of every
--    buffer hit in the query.
--
-- 3. The complete reviewer-facing evidence payload was aggregated for all
--    45,440 candidate pairs and then dragged through five chained MATERIALIZED
--    CTEs and two external merge sorts in order to return 50 rows. Temp writes
--    climbed 6,311 to 21,261 to 30,111 to 39,072 to 57,055 blocks, which is the
--    same evidence blob written to disk about five times, and the ranking sort
--    spilled 72,152 kB against a work_mem of 20MB.
--
-- The fix ranks on narrow columns and rebuilds the evidence payload only for
-- the pairs that survive the LIMIT, looking those pairs up through the
-- canonical pair indexes idx_collusion_tracking_open_canonical and
-- idx_ca_collusion_signals_canonical, which already exist and were designed for
-- exactly this lookup. Both sorts now stay in memory: the grouping sort is a
-- 15,818 kB quicksort and the ranking sort is a 4,850 kB quicksort, so the
-- ranking sort has roughly four times the headroom before it would spill again.
-- No index is added, dropped or changed. Index access was never the problem:
-- the partial index was already being chosen and its Bitmap Index Scan cost
-- 8.9 ms of a 9.5 s query.
--
-- Output is byte-identical. The live function and this definition were compared
-- inside a single statement, so both observed the same MVCC snapshot, across 33
-- cases: defaults, include_horses true and false, all four compositions, all
-- seven tiers, all six patterns, p_limit at 1, 25, 50 and 100, a three page
-- cursor walk, and the four invalid input branches plus the exception handler
-- path. Every case matched on rows, on totals, on next_cursor, and on the md5
-- of the entire envelope once the two inherently volatile clock_timestamp
-- fields are excluded, namely the top level measured_at and health.measured_at.
-- Those two already differ between two consecutive calls to the unmodified
-- function, so they are not a difference introduced here.
--
-- Horse versus horse findings are neither excluded nor down-ranked. They are
-- 45,430 of the 45,440 grouped pairs in production, the by_composition totals
-- are unchanged, and the ranking is untouched: the tier ladder, the
-- lexicographic sort keys and the cursor comparison are all byte-identical to
-- the previous definition.
--
-- This migration refuses to apply over drift. It asserts the md5 of the current
-- definition before replacing, and the md5 of the new definition afterwards. If
-- the function already carries the post-migration definition the migration is a
-- no op, so re-running is safe.
--
-- ROLLBACK:
-- The pre-migration definition is the one with md5
-- ed5d69137b15001f89b1c70eb429aa62, produced by migration
-- 20260906101639_ca_phase5_integrity_cases_and_review_queue.sql as amended by
-- 20260906200000_integrity_queue_uses_narrow_indexable_rows.sql. Re-applying
-- those two in order restores it. No application rows, detector findings,
-- detector gap fields or health fields are changed by this migration.

DO $migration$
DECLARE
  v_expected_pre  text := 'ed5d69137b15001f89b1c70eb429aa62';
  v_expected_post text := '8a9d9de1e1a957e43ac765f2fe7f8b43';
  v_current       text;
BEGIN
  SELECT md5(pg_get_functiondef(
    'public.fn_ca_integrity_queue(boolean,text,text,text,timestamptz,integer,jsonb)'::regprocedure
  )) INTO v_current;

  IF v_current = v_expected_post THEN
    RAISE NOTICE 'fn_ca_integrity_queue already carries the post-migration definition (md5 %). Nothing to do.', v_current;
    RETURN;
  END IF;

  IF v_current IS DISTINCT FROM v_expected_pre THEN
    RAISE EXCEPTION 'Refusing to apply: fn_ca_integrity_queue does not match the expected pre-migration definition. Expected md5 %, found md5 %. Review the drift before replacing this function.',
      v_expected_pre, v_current;
  END IF;

  EXECUTE $create$
CREATE OR REPLACE FUNCTION public.fn_ca_integrity_queue(p_include_horses boolean DEFAULT true, p_composition text DEFAULT 'all'::text, p_tier text DEFAULT NULL::text, p_pattern text DEFAULT NULL::text, p_as_of timestamp with time zone DEFAULT now(), p_limit integer DEFAULT 50, p_cursor jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_include     boolean := coalesce(p_include_horses, true);
  v_composition text := lower(coalesce(nullif(btrim(p_composition), ''), 'all'));
  v_tier        text := lower(nullif(btrim(coalesce(p_tier, '')), ''));
  v_pattern     text := upper(nullif(btrim(coalesce(p_pattern, '')), ''));
  v_as_of       timestamptz := least(coalesce(p_as_of, now()), now());
  v_limit       integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_health      jsonb;
  v_result      jsonb;
BEGIN
  IF v_composition NOT IN ('all', 'horse_horse', 'horse_human', 'human_human') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_COMPOSITION',
                              'message', 'Unknown participant composition');
  END IF;
  IF v_tier IS NOT NULL AND v_tier NOT IN (
    'active_case', 'multiple_signals', 'seven_day_money_flow',
    'chip_dump', 'other_non_timing', 'timing_only', 'money_flow'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_TIER',
                              'message', 'Unknown integrity queue tier');
  END IF;
  IF v_pattern IS NOT NULL AND v_pattern NOT IN (
    'TIMING_CORRELATION', 'CHIP_DUMP', 'SOFT_PLAY', 'WIN_RATE_ANOMALY',
    'CHIP_FLOW_7D', 'DUEL_REPEAT_PAIRING'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_PATTERN',
                              'message', 'Unknown detector pattern');
  END IF;

  IF p_cursor IS NOT NULL AND NOT (
    p_cursor ?& array[
      'tier_rank', 'distinct_window_count', 'absolute_net_flow',
      'gross_flow', 'sample_size', 'last_seen',
      'player_a_id', 'player_b_id'
    ]
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_CURSOR',
                              'message', 'The queue cursor is incomplete');
  END IF;

  v_health := public.fn_ca_integrity_detector_health(30);

  WITH flag_counts AS MATERIALIZED (
    SELECT f.player_id, count(*)::integer AS n
    FROM public.anti_cheat_flags f
    WHERE coalesce(f.status, 'open') = 'open'
    GROUP BY f.player_id
  ), source_rows AS MATERIALIZED (
    SELECT
      least(c.player_a, c.player_b) AS player_a_id,
      greatest(c.player_a, c.player_b) AS player_b_id,
      'collusion_tracking'::text AS detector_source,
      c.id::text AS source_id,
      upper(c.pattern_type) AS pattern,
      c.created_at AS observed_at,
      c.suspicion_score::numeric AS source_score,
      greatest(
        coalesce(CASE WHEN c.evidence ->> 'hands' ~ '^-?[0-9]+([.][0-9]+)?$'
                      THEN (c.evidence ->> 'hands')::numeric END, 0),
        coalesce(CASE WHEN c.evidence ->> 'hands_together' ~ '^-?[0-9]+([.][0-9]+)?$'
                      THEN (c.evidence ->> 'hands_together')::numeric END, 0),
        coalesce(CASE WHEN c.evidence ->> 'head_to_head_pots' ~ '^-?[0-9]+([.][0-9]+)?$'
                      THEN (c.evidence ->> 'head_to_head_pots')::numeric END, 0),
        coalesce(CASE WHEN c.evidence ->> 'total_adjacent_actions' ~ '^-?[0-9]+([.][0-9]+)?$'
                      THEN (c.evidence ->> 'total_adjacent_actions')::numeric END, 0),
        coalesce(CASE WHEN c.evidence ->> 'mutual_checkdowns' ~ '^-?[0-9]+([.][0-9]+)?$'
                      THEN (c.evidence ->> 'mutual_checkdowns')::numeric END, 0)
      ) AS sample_size,
      CASE WHEN upper(c.pattern_type) = 'CHIP_DUMP' THEN
        CASE WHEN c.evidence ->> 'pot_volume' ~ '^-?[0-9]+([.][0-9]+)?$'
             THEN (c.evidence ->> 'pot_volume')::numeric END END AS gross_flow,
      NULL::numeric AS net_flow,
      coalesce(to_jsonb(c.window_start) #>> '{}', c.created_at::text)
        || '/' || coalesce(to_jsonb(c.window_end) #>> '{}', c.created_at::text) AS window_key
    FROM public.collusion_tracking c
    WHERE c.status = 'open'
      AND c.player_b IS NOT NULL
      AND c.created_at <= v_as_of

    UNION ALL

    SELECT
      least(s.user_a, s.user_b) AS player_a_id,
      greatest(s.user_a, s.user_b) AS player_b_id,
      'ca_collusion_signals'::text AS detector_source,
      s.id::text AS source_id,
      CASE WHEN s.detail ->> 'signal' = 'duel_repeat_pairing'
        THEN 'DUEL_REPEAT_PAIRING' ELSE 'CHIP_FLOW_7D' END AS pattern,
      s.detected_at AS observed_at,
      round(s.direction_ratio * 100, 2) AS source_score,
      s.hands_together::numeric AS sample_size,
      s.gross_flow,
      abs(s.net_flow) AS net_flow,
      coalesce(s.detail ->> 'since', s.detected_at::text)
        || '/' || s.detected_at::text AS window_key
    FROM public.ca_collusion_signals s
    WHERE s.detected_at <= v_as_of
      AND s.detected_at >= v_as_of - make_interval(
        days => least(greatest(coalesce(s.window_days, 7), 1), 30) + 1)
  ), grouped AS MATERIALIZED (
    SELECT
      r.player_a_id,
      r.player_b_id,
      count(*)::integer AS observation_count,
      count(DISTINCT r.detector_source || ':' || r.window_key)::integer AS distinct_window_count,
      count(DISTINCT r.detector_source)::integer AS source_count,
      count(DISTINCT r.pattern)::integer AS pattern_count,
      array_agg(DISTINCT r.detector_source ORDER BY r.detector_source) AS detector_sources,
      array_agg(DISTINCT r.pattern ORDER BY r.pattern) AS patterns,
      min(r.observed_at) AS first_seen,
      max(r.observed_at) AS last_seen,
      max(r.source_score) AS max_score,
      max(r.sample_size) AS sample_size,
      max(r.gross_flow) AS gross_flow,
      max(abs(r.net_flow)) AS absolute_net_flow,
      bool_or(r.pattern IN ('CHIP_DUMP', 'CHIP_FLOW_7D', 'DUEL_REPEAT_PAIRING')) AS has_money,
      bool_or(r.detector_source = 'ca_collusion_signals') AS has_seven_day,
      bool_or(r.pattern = 'CHIP_DUMP') AS has_chip_dump,
      bool_or(r.pattern NOT IN (
        'TIMING_CORRELATION', 'CHIP_DUMP', 'CHIP_FLOW_7D', 'DUEL_REPEAT_PAIRING')) AS has_non_timing
    FROM source_rows r
    GROUP BY r.player_a_id, r.player_b_id
  ), decorated AS MATERIALIZED (
    SELECT
      g.*,
      coalesce(pa.is_horse, false) AS a_horse,
      coalesce(pb.is_horse, false) AS b_horse,
      coalesce(pa.display_name, pa.username, g.player_a_id::text) AS player_a_name,
      coalesce(pb.display_name, pb.username, g.player_b_id::text) AS player_b_name,
      CASE
        WHEN coalesce(pa.is_horse, false)
         AND coalesce(pb.is_horse, false) THEN 'horse_horse'
        WHEN coalesce(pa.is_horse, false)
          OR coalesce(pb.is_horse, false) THEN 'horse_human'
        ELSE 'human_human'
      END AS composition,
      (coalesce(fa.n, 0)
        + CASE WHEN g.player_b_id IS DISTINCT FROM g.player_a_id
               THEN coalesce(fb.n, 0) ELSE 0 END)::integer AS open_flag_count
    FROM grouped g
    LEFT JOIN public.profiles pa ON pa.id = g.player_a_id
    LEFT JOIN public.profiles pb ON pb.id = g.player_b_id
    LEFT JOIN flag_counts fa ON fa.player_id = g.player_a_id
    LEFT JOIN flag_counts fb ON fb.player_id = g.player_b_id
  ), ranked AS MATERIALIZED (
    SELECT d.*,
      linked.case_summary,
      CASE
        WHEN linked.case_summary IS NOT NULL THEN 1
        WHEN d.source_count > 1 OR d.pattern_count > 1 THEN 2
        WHEN d.has_seven_day THEN 3
        WHEN d.has_chip_dump THEN 4
        WHEN d.has_non_timing OR d.open_flag_count > 0 THEN 5
        ELSE 6
      END AS tier_rank,
      CASE
        WHEN linked.case_summary IS NOT NULL THEN 'active_case'
        WHEN d.source_count > 1 OR d.pattern_count > 1 THEN 'multiple_signals'
        WHEN d.has_seven_day THEN 'seven_day_money_flow'
        WHEN d.has_chip_dump THEN 'chip_dump'
        WHEN d.has_non_timing OR d.open_flag_count > 0 THEN 'other_non_timing'
        ELSE 'timing_only'
      END AS tier,
      CASE
        WHEN linked.case_summary IS NOT NULL THEN 'This pair is attached to an active operator case.'
        WHEN d.source_count > 1 THEN 'More than one independent detector source reported this pair.'
        WHEN d.pattern_count > 1 THEN 'More than one independent detector pattern reported this pair.'
        WHEN d.has_seven_day THEN 'A seven-day chip-flow or duel-repeat detector reported this pair.'
        WHEN d.has_chip_dump THEN 'The incremental detector reported a chip-dump pattern.'
        WHEN d.has_non_timing THEN 'A non-timing behavioral signal reported this pair.'
        WHEN d.open_flag_count > 0 THEN 'One or both participants has an unresolved anti-cheat flag.'
        ELSE 'Timing correlation only. Horses share deterministic HorseLogic, so correlation is expected to be elevated.'
      END AS tier_reason
    FROM decorated d
    LEFT JOIN LATERAL (
      SELECT jsonb_build_object(
        'id', c.id,
        'status', c.status,
        'severity', c.severity,
        'assigned_to', c.assigned_to,
        'opened_at', c.opened_at,
        'version', c.version) AS case_summary
      FROM public.ca_integrity_cases c
      WHERE c.status IN ('open', 'investigating')
        AND c.subject_ids @> ARRAY[d.player_a_id, d.player_b_id]::uuid[]
      ORDER BY c.opened_at DESC, c.id
      LIMIT 1
    ) linked ON true
  ), selected AS MATERIALIZED (
    SELECT r.player_a_id, r.player_b_id, r.tier_rank, r.distinct_window_count,
           r.absolute_net_flow, r.gross_flow, r.sample_size, r.last_seen
    FROM ranked r
    WHERE (v_include OR (NOT r.a_horse AND NOT r.b_horse))
      AND (v_composition = 'all' OR r.composition = v_composition)
      AND (v_tier IS NULL OR r.tier = v_tier OR (v_tier = 'money_flow' AND r.has_money))
      AND (v_pattern IS NULL OR v_pattern = ANY(r.patterns))
      AND (
        p_cursor IS NULL OR
        ROW(
          r.tier_rank,
          -r.distinct_window_count,
          -coalesce(r.absolute_net_flow, -1),
          -coalesce(r.gross_flow, -1),
          -coalesce(r.sample_size, 0),
          -extract(epoch FROM r.last_seen),
          r.player_a_id,
          r.player_b_id
        ) > ROW(
          (p_cursor ->> 'tier_rank')::integer,
          -(p_cursor ->> 'distinct_window_count')::integer,
          -coalesce((p_cursor ->> 'absolute_net_flow')::numeric, -1),
          -coalesce((p_cursor ->> 'gross_flow')::numeric, -1),
          -coalesce((p_cursor ->> 'sample_size')::numeric, 0),
          -extract(epoch FROM (p_cursor ->> 'last_seen')::timestamptz),
          (p_cursor ->> 'player_a_id')::uuid,
          (p_cursor ->> 'player_b_id')::uuid
        )
      )
  ), page AS MATERIALIZED (
    SELECT s.player_a_id, s.player_b_id, s.tier_rank, s.distinct_window_count,
      s.absolute_net_flow, s.gross_flow, s.sample_size, s.last_seen,
      row_number() OVER (
      ORDER BY s.tier_rank, s.distinct_window_count DESC,
        s.absolute_net_flow DESC NULLS LAST, s.gross_flow DESC NULLS LAST,
        s.sample_size DESC NULLS LAST,
        s.last_seen DESC, s.player_a_id, s.player_b_id
    ) AS rn
    FROM selected s
    ORDER BY s.tier_rank, s.distinct_window_count DESC,
      s.absolute_net_flow DESC NULLS LAST, s.gross_flow DESC NULLS LAST,
      s.sample_size DESC NULLS LAST,
      s.last_seen DESC, s.player_a_id, s.player_b_id
    LIMIT v_limit + 1
  ), page_full AS MATERIALIZED (
    SELECT pg.rn, r.*
    FROM page pg
    JOIN ranked r ON r.player_a_id = pg.player_a_id AND r.player_b_id = pg.player_b_id
  ), page_ev AS MATERIALIZED (
    SELECT p.player_a_id, p.player_b_id,
      jsonb_agg(jsonb_build_object(
        'source', o.detector_source,
        'source_id', o.source_id,
        'pattern', o.pattern,
        'observed_at', o.observed_at,
        'score', o.source_score,
        'gross_flow', o.gross_flow,
        'net_flow', o.net_flow,
        'window_key', o.window_key,
        'direction', o.direction,
        'evidence', o.evidence
      ) ORDER BY o.observed_at DESC, o.detector_source, o.source_id) AS evidence
    FROM page p CROSS JOIN LATERAL (
      SELECT 'collusion_tracking'::text AS detector_source, c.id::text AS source_id,
        upper(c.pattern_type) AS pattern, c.created_at AS observed_at,
        c.suspicion_score::numeric AS source_score,
        greatest(
          coalesce(CASE WHEN c.evidence ->> 'hands' ~ '^-?[0-9]+([.][0-9]+)?$'
                        THEN (c.evidence ->> 'hands')::numeric END, 0),
          coalesce(CASE WHEN c.evidence ->> 'hands_together' ~ '^-?[0-9]+([.][0-9]+)?$'
                        THEN (c.evidence ->> 'hands_together')::numeric END, 0),
          coalesce(CASE WHEN c.evidence ->> 'head_to_head_pots' ~ '^-?[0-9]+([.][0-9]+)?$'
                        THEN (c.evidence ->> 'head_to_head_pots')::numeric END, 0),
          coalesce(CASE WHEN c.evidence ->> 'total_adjacent_actions' ~ '^-?[0-9]+([.][0-9]+)?$'
                        THEN (c.evidence ->> 'total_adjacent_actions')::numeric END, 0),
          coalesce(CASE WHEN c.evidence ->> 'mutual_checkdowns' ~ '^-?[0-9]+([.][0-9]+)?$'
                        THEN (c.evidence ->> 'mutual_checkdowns')::numeric END, 0)
        ) AS sample_size,
        CASE WHEN upper(c.pattern_type) = 'CHIP_DUMP' THEN
          CASE WHEN c.evidence ->> 'pot_volume' ~ '^-?[0-9]+([.][0-9]+)?$'
               THEN (c.evidence ->> 'pot_volume')::numeric END END AS gross_flow,
        NULL::numeric AS net_flow,
        coalesce(to_jsonb(c.window_start) #>> '{}', c.created_at::text)
          || '/' || coalesce(to_jsonb(c.window_end) #>> '{}', c.created_at::text) AS window_key,
        jsonb_build_object(
          'reported_player_a', c.player_a,
          'reported_player_b', c.player_b,
          'meaning', CASE WHEN upper(c.pattern_type) = 'CHIP_DUMP'
            THEN 'player_a is the dominant loser and player_b is the dominant winner'
            ELSE 'detector-reported order; canonical pair order is separate' END
        ) AS direction,
        coalesce(c.evidence, '{}'::jsonb) AS evidence
      FROM public.collusion_tracking c
      WHERE c.status = 'open'
        AND c.player_b IS NOT NULL
        AND c.created_at <= v_as_of
        AND least(c.player_a, c.player_b) = p.player_a_id
        AND greatest(c.player_a, c.player_b) = p.player_b_id

      UNION ALL

      SELECT 'ca_collusion_signals'::text, s.id::text,
        CASE WHEN s.detail ->> 'signal' = 'duel_repeat_pairing'
          THEN 'DUEL_REPEAT_PAIRING' ELSE 'CHIP_FLOW_7D' END,
        s.detected_at,
        round(s.direction_ratio * 100, 2),
        s.hands_together::numeric,
        s.gross_flow,
        abs(s.net_flow),
        coalesce(s.detail ->> 'since', s.detected_at::text)
          || '/' || s.detected_at::text,
        jsonb_build_object(
          'receiver_id', s.user_a,
          'sender_id', s.user_b,
          'meaning', CASE WHEN s.detail ->> 'signal' = 'duel_repeat_pairing'
            THEN 'user_a is the dominant winner; hands_together means heads-up duels and direction_ratio means win share'
            ELSE 'user_a is the net receiver; hands_together means hands and direction_ratio means net-flow concentration' END),
        coalesce(s.detail, '{}'::jsonb) || jsonb_build_object(
          'hands_together', s.hands_together,
          'gross_flow', s.gross_flow,
          'net_flow', s.net_flow,
          'direction_ratio', s.direction_ratio,
          'both_cert', s.both_cert)
      FROM public.ca_collusion_signals s
      WHERE s.detected_at <= v_as_of
        AND s.detected_at >= v_as_of - make_interval(
          days => least(greatest(coalesce(s.window_days, 7), 1), 30) + 1)
        AND least(s.user_a, s.user_b) = p.player_a_id
        AND greatest(s.user_a, s.user_b) = p.player_b_id
    ) o
    GROUP BY p.player_a_id, p.player_b_id
  ), payload AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'queue_key', p.player_a_id::text || ':' || p.player_b_id::text,
      'player_a_id', p.player_a_id,
      'player_b_id', p.player_b_id,
      'player_a_name', p.player_a_name,
      'player_b_name', p.player_b_name,
      'player_a_is_horse', p.a_horse,
      'player_b_is_horse', p.b_horse,
      'composition', p.composition,
      'tier', p.tier,
      'tier_rank', p.tier_rank,
      'tier_reason', p.tier_reason,
      'observation_count', p.observation_count,
      'distinct_window_count', p.distinct_window_count,
      'source_count', p.source_count,
      'pattern_count', p.pattern_count,
      'detector_sources', p.detector_sources,
      'patterns', p.patterns,
      'first_seen', p.first_seen,
      'last_seen', p.last_seen,
      'max_score', p.max_score,
      'sample_size', p.sample_size,
      'gross_flow', p.gross_flow,
      'absolute_net_flow', p.absolute_net_flow,
      'open_flag_count', p.open_flag_count,
      'case', p.case_summary,
      'evidence', e.evidence,
      'disclosure', 'Queue priority is review order, not a verdict.'
    ) ORDER BY p.rn) FILTER (WHERE p.rn <= v_limit), '[]'::jsonb) AS rows,
    CASE WHEN count(*) > v_limit THEN (
      SELECT jsonb_build_object(
        'tier_rank', z.tier_rank,
        'distinct_window_count', z.distinct_window_count,
        'absolute_net_flow', z.absolute_net_flow,
        'gross_flow', z.gross_flow,
        'sample_size', z.sample_size,
        'last_seen', z.last_seen,
        'player_a_id', z.player_a_id,
        'player_b_id', z.player_b_id)
      FROM page z WHERE z.rn = v_limit
    ) END AS next_cursor
    FROM page_full p
    LEFT JOIN page_ev e ON e.player_a_id = p.player_a_id AND e.player_b_id = p.player_b_id
  ), totals AS (
    SELECT jsonb_build_object(
      'groups', (SELECT count(*)::bigint FROM ranked),
      'observations', (SELECT count(*)::bigint FROM source_rows),
      'filtered_groups', (SELECT count(*)::bigint FROM selected),
      'by_tier', coalesce((SELECT jsonb_object_agg(x.tier, x.n)
        FROM (SELECT tier, count(*)::bigint AS n FROM ranked GROUP BY tier) x), '{}'::jsonb),
      'by_pattern', coalesce((SELECT jsonb_object_agg(x.pattern, x.n)
        FROM (SELECT pattern, count(*)::bigint AS n
          FROM ranked r CROSS JOIN LATERAL unnest(r.patterns) pattern GROUP BY pattern) x), '{}'::jsonb),
      'by_composition', coalesce((SELECT jsonb_object_agg(x.composition, x.n)
        FROM (SELECT composition, count(*)::bigint AS n FROM ranked GROUP BY composition) x), '{}'::jsonb),
      'by_source', coalesce((SELECT jsonb_object_agg(x.detector_source, x.n)
        FROM (SELECT detector_source, count(*)::bigint AS n
          FROM source_rows GROUP BY detector_source) x), '{}'::jsonb)
    ) AS value
  )
  SELECT jsonb_build_object(
    'ok', true,
    'state', CASE
      WHEN coalesce(v_health ->> 'state', 'unknown') = 'unknown' THEN 'unknown'
      WHEN (SELECT count(*) FROM selected) > 0 THEN 'review_available'
      WHEN coalesce(v_health #>> '{worker,newest_finding_at}', '') = ''
       AND coalesce((v_health #>> '{sources,ca_collusion_signals,total}')::bigint, 0) = 0
        THEN 'nothing_produced'
      ELSE 'nothing_to_review' END,
    'queue_state', CASE
      WHEN coalesce(v_health ->> 'state', 'unknown') = 'unknown' THEN 'unknown'
      WHEN (SELECT count(*) FROM selected) > 0 THEN 'review_available'
      WHEN coalesce(v_health #>> '{worker,newest_finding_at}', '') = ''
       AND coalesce((v_health #>> '{sources,ca_collusion_signals,total}')::bigint, 0) = 0
        THEN 'nothing_produced'
      ELSE 'nothing_to_review' END,
    'rows', payload.rows,
    'groups', payload.rows,
    'totals', totals.value,
    'as_of', v_as_of,
    'measured_at', clock_timestamp(),
    'next_cursor', payload.next_cursor,
    'health', v_health,
    'ranking', jsonb_build_object(
      'tiers', jsonb_build_array(
        'active_case', 'multiple_signals', 'seven_day_money_flow',
        'chip_dump', 'other_non_timing', 'timing_only'),
      'rule', 'Lexicographic review priority; unlike detector scores are never blended.'),
    'disclosure', jsonb_build_array(
      'Horses are players and are included by default.',
      'Queue priority is review order, not a verdict.',
      'Horse timing correlation is elevated by shared deterministic HorseLogic.',
      'Repeated raw observations are grouped by canonical unordered pair.'
    )
  ) INTO v_result
  FROM payload CROSS JOIN totals;

  RETURN v_result;
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_CURSOR',
                              'message', 'The queue cursor is invalid',
                              'state', 'unknown', 'queue_state', 'unknown',
                              'health', v_health, 'as_of', v_as_of,
                              'measured_at', clock_timestamp());
  WHEN OTHERS THEN
    RAISE NOTICE 'fn_ca_integrity_queue source error: %', SQLERRM;
    RETURN jsonb_build_object('ok', false, 'code', 'QUEUE_SOURCE_ERROR',
                              'message', 'One or more integrity queue sources could not be read',
                              'state', 'unknown', 'queue_state', 'unknown',
                              'health', v_health, 'as_of', v_as_of,
                              'measured_at', clock_timestamp());
END;
$function$;
  $create$;

  SELECT md5(pg_get_functiondef(
    'public.fn_ca_integrity_queue(boolean,text,text,text,timestamptz,integer,jsonb)'::regprocedure
  )) INTO v_current;

  IF v_current IS DISTINCT FROM v_expected_post THEN
    RAISE EXCEPTION 'Post-migration verification failed: fn_ca_integrity_queue has md5 %, expected %. The replacement did not produce the reviewed definition.',
      v_current, v_expected_post;
  END IF;

  RAISE NOTICE 'fn_ca_integrity_queue replaced. Post-migration md5 %.', v_current;
END
$migration$;

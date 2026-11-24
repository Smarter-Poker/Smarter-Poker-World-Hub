-- TIER: 3
-- AUTHOR: Antigravity (trivia-study-curation), Track 4 Trivia Study Deck & Pool Curation
-- AFFECTS: public.trivia_missed_questions_study_v1(uuid,text,integer),
--          public.trivia_question_calibration_report_v1(integer,integer),
--          public.trivia_pool_batch_curate_v1(uuid,uuid[],text,text)
-- IRREVERSIBLE: no
-- WHY:
--   1. Players need a read-only personal missed-questions study deck combining legacy
--      trivia_user_question_history and V3 trivia_question_result_events without moving
--      diamonds or exposing quarantined questions.
--   2. Operators need an empirical difficulty calibration report surfacing mislabeled
--      easy/hard questions, high-skip/report outliers, per-category 90-day eligible
--      pool depth, and review-queue backlog counts.
--   3. Operators need a bounded, audited batch curation RPC (max 100 IDs, required
--      reason, role-checked via trivia_operator_context_core_v1) supporting approve,
--      quarantine, and difficulty re-tiering with immutable audit records in
--      trivia_operator_events_v1 using existing allowed action codes (zero table locks).
-- HOW:
--   Create the three additive SECURITY DEFINER RPCs with pinned search_path,
--   service_role runtime guards, and REVOKE ALL / service_role-only EXECUTE grants,
--   then reload PostgREST schema cache. Zero ALTER TABLE statements.

BEGIN;
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;

-- 1. Personal Missed-Questions Study Deck RPC (read-only, zero diamonds moved)
CREATE OR REPLACE FUNCTION public.trivia_missed_questions_study_v1(
    p_user_id uuid,
    p_category text DEFAULT NULL,
    p_limit integer DEFAULT 25
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path = pg_catalog, public, extensions, pg_temp
AS $function$
DECLARE
    v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
    v_category text := NULLIF(btrim(COALESCE(p_category, '')), '');
    v_valid_categories text[] := ARRAY[
        'poker_history', 'famous_hands', 'gto_theory', 'player_profiles',
        'tournament_facts', 'rule_knowledge', 'mtt_situations',
        'cash_game_situations', 'icm_chip_ev', 'gto_scenarios'
    ];
    v_total integer := 0;
    v_categories jsonb := '{}'::jsonb;
    v_items jsonb := '[]'::jsonb;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
    END IF;

    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'authentication_required');
    END IF;

    IF v_category = 'all' THEN
        v_category := NULL;
    END IF;

    IF v_category IS NOT NULL AND NOT (v_category = ANY(v_valid_categories)) THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_category');
    END IF;

    WITH raw_misses AS (
        SELECT h.question_id,
               COALESCE(h.seen_at, now()) AS missed_at
          FROM public.trivia_user_question_history h
         WHERE h.user_id = p_user_id
           AND h.was_correct = false
        UNION ALL
        SELECT e.question_id,
               COALESCE(e.created_at, now()) AS missed_at
          FROM public.trivia_question_result_events e
         WHERE e.user_id = p_user_id
           AND e.was_correct = false
    ),
    grouped AS (
        SELECT rm.question_id,
               MAX(rm.missed_at) AS last_missed_at,
               COUNT(*)::integer AS miss_count
          FROM raw_misses rm
         GROUP BY rm.question_id
    ),
    joined AS (
        SELECT q.id AS question_id,
               q.question,
               q.options,
               q.correct_index,
               q.explanation,
               q.category,
               q.difficulty,
               g.last_missed_at,
               g.miss_count
          FROM grouped g
          JOIN public.trivia_questions q ON q.id = g.question_id
         WHERE NOT EXISTS (
               SELECT 1
                 FROM public.trivia_question_quarantine z
                WHERE z.question_id = q.id
                  AND z.released_at IS NULL
           )
    ),
    cat_counts AS (
        SELECT category, COUNT(*)::integer AS n
          FROM joined
         GROUP BY category
    ),
    filtered AS (
        SELECT *
          FROM joined
         WHERE v_category IS NULL OR category = v_category
         ORDER BY last_missed_at DESC, question_id ASC
         LIMIT v_limit
    )
    SELECT
        (SELECT COUNT(*)::integer FROM joined),
        COALESCE((SELECT jsonb_object_agg(category, n ORDER BY category) FROM cat_counts), '{}'::jsonb),
        COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'question_id', f.question_id,
                    'question', f.question,
                    'options', f.options,
                    'correct_index', f.correct_index,
                    'explanation', COALESCE(f.explanation, ''),
                    'category', f.category,
                    'difficulty', f.difficulty,
                    'last_missed_at', f.last_missed_at,
                    'miss_count', f.miss_count
                )
                ORDER BY f.last_missed_at DESC, f.question_id ASC
            )
            FROM filtered f
        ), '[]'::jsonb)
      INTO v_total, v_categories, v_items;

    RETURN jsonb_build_object(
        'success', true,
        'total_missed', v_total,
        'returned', jsonb_array_length(v_items),
        'category_filter', COALESCE(v_category, 'all'),
        'categories', v_categories,
        'items', v_items
    );
END;
$function$;

-- 3. Empirical Difficulty Calibration & Pool Depth Report RPC (read-only)
CREATE OR REPLACE FUNCTION public.trivia_question_calibration_report_v1(
    p_min_shown integer DEFAULT 15,
    p_limit integer DEFAULT 100
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path = pg_catalog, public, extensions, pg_temp
AS $function$
DECLARE
    v_min_shown integer := LEAST(GREATEST(COALESCE(p_min_shown, 15), 1), 10000);
    v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
    v_ninety_day_target integer := 1800;
    v_outliers jsonb := '[]'::jsonb;
    v_category_depth jsonb := '[]'::jsonb;
    v_summary jsonb := '{}'::jsonb;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
    END IF;

    WITH event_stats AS (
        SELECT e.question_id,
               COUNT(*)::integer AS shown_events,
               COUNT(*) FILTER (WHERE e.was_correct IS TRUE)::integer AS correct_events,
               COUNT(*) FILTER (WHERE e.was_skipped IS TRUE)::integer AS skipped_events
          FROM public.trivia_question_result_events e
         WHERE COALESCE(e.actor_type, 'human') = 'human'
         GROUP BY e.question_id
    ),
    history_stats AS (
        SELECT h.question_id,
               COUNT(*)::integer AS shown_hist,
               COUNT(*) FILTER (WHERE h.was_correct IS TRUE)::integer AS correct_hist
          FROM public.trivia_user_question_history h
         WHERE h.was_correct IS NOT NULL
         GROUP BY h.question_id
    ),
    report_stats AS (
        SELECT r.question_id,
               COUNT(*) FILTER (WHERE r.state IN ('open', 'triaged'))::integer AS open_reports,
               COUNT(*)::integer AS total_reports
          FROM public.trivia_question_reports r
         GROUP BY r.question_id
    ),
    combined AS (
        SELECT q.id AS question_id,
               q.category,
               q.difficulty,
               left(q.question, 180) AS question_preview,
               q.audit_verified,
               q.quality_score,
               GREATEST(
                   COALESCE(q.times_shown, 0),
                   COALESCE(ev.shown_events, 0) + COALESCE(hs.shown_hist, 0)
               )::integer AS shown_count,
               GREATEST(
                   COALESCE(q.times_correct, 0),
                   COALESCE(ev.correct_events, 0) + COALESCE(hs.correct_hist, 0)
               )::integer AS correct_count,
               GREATEST(
                   COALESCE(q.skipped_count, 0),
                   COALESCE(ev.skipped_events, 0)
               )::integer AS skipped_count,
               COALESCE(rp.open_reports, 0)::integer AS open_reports,
               COALESCE(rp.total_reports, 0)::integer AS total_reports,
               EXISTS (
                   SELECT 1
                     FROM public.trivia_question_quarantine z
                    WHERE z.question_id = q.id
                      AND z.released_at IS NULL
               ) AS quarantined
          FROM public.trivia_questions q
          LEFT JOIN event_stats ev ON ev.question_id = q.id
          LEFT JOIN history_stats hs ON hs.question_id = q.id
          LEFT JOIN report_stats rp ON rp.question_id = q.id
    ),
    scored AS (
        SELECT c.*,
               CASE
                   WHEN c.shown_count > 0
                   THEN ROUND(LEAST(c.correct_count, c.shown_count)::numeric / c.shown_count::numeric, 4)
                   ELSE NULL
               END AS solve_rate,
               CASE
                   WHEN c.shown_count > 0
                   THEN ROUND(LEAST(c.skipped_count, c.shown_count)::numeric / c.shown_count::numeric, 4)
                   ELSE NULL
               END AS skip_rate
          FROM combined c
         WHERE NOT c.quarantined
    ),
    flagged AS (
        SELECT s.*,
               array_remove(ARRAY[
                   CASE
                       WHEN s.difficulty = 'easy'
                        AND s.shown_count >= v_min_shown
                        AND s.solve_rate < 0.35
                       THEN 'easy_too_hard'
                   END,
                   CASE
                       WHEN s.difficulty = 'hard'
                        AND s.shown_count >= v_min_shown
                        AND s.solve_rate > 0.85
                       THEN 'hard_too_easy'
                   END,
                   CASE
                       WHEN s.shown_count >= v_min_shown
                        AND s.skip_rate >= 0.25
                       THEN 'high_skip_rate'
                   END,
                   CASE
                       WHEN s.open_reports >= 2 OR s.total_reports >= 3
                       THEN 'high_report_outlier'
                   END
               ], NULL::text) AS flags,
               CASE
                   WHEN s.difficulty = 'easy' AND s.shown_count >= v_min_shown AND s.solve_rate < 0.20 THEN 'hard'
                   WHEN s.difficulty = 'easy' AND s.shown_count >= v_min_shown AND s.solve_rate < 0.35 THEN 'medium'
                   WHEN s.difficulty = 'hard' AND s.shown_count >= v_min_shown AND s.solve_rate > 0.92 THEN 'easy'
                   WHEN s.difficulty = 'hard' AND s.shown_count >= v_min_shown AND s.solve_rate > 0.85 THEN 'medium'
                   ELSE NULL
               END AS suggested_difficulty
          FROM scored s
    ),
    only_flagged AS (
        SELECT *
          FROM flagged
         WHERE cardinality(flags) > 0
    ),
    limited_flagged AS (
        SELECT *
          FROM only_flagged
         ORDER BY open_reports DESC, shown_count DESC, question_id ASC
         LIMIT v_limit
    ),
    review_by_cat AS (
        SELECT category, COUNT(*)::integer AS review_queue_count
          FROM public.trivia_review_queue_v1
         GROUP BY category
    ),
    depth AS (
        SELECT e.category,
               COUNT(*)::integer AS total_questions,
               COUNT(*) FILTER (WHERE e.reject_reasons = '{}'::text[])::integer AS eligible_count,
               COUNT(*) FILTER (WHERE 'audit_unset' = ANY(e.reject_reasons))::integer AS unaudited_count,
               COUNT(*) FILTER (WHERE 'audit_failed' = ANY(e.reject_reasons))::integer AS audit_failed_count,
               COUNT(*) FILTER (WHERE 'quarantined' = ANY(e.reject_reasons))::integer AS quarantined_count,
               COALESCE(rq.review_queue_count, 0)::integer AS review_queue_count,
               v_ninety_day_target AS ninety_day_target,
               FLOOR(COUNT(*) FILTER (WHERE e.reject_reasons = '{}'::text[])::numeric / 20.0)::integer AS days_of_supply,
               (COUNT(*) FILTER (WHERE e.reject_reasons = '{}'::text[]) < v_ninety_day_target) AS below_90_day_supply,
               GREATEST(0, v_ninety_day_target - COUNT(*) FILTER (WHERE e.reject_reasons = '{}'::text[])::integer)::integer AS shortfall_90_day
          FROM public.trivia_question_eligibility_v1 e
          LEFT JOIN review_by_cat rq ON rq.category = e.category
         GROUP BY e.category, rq.review_queue_count
    )
    SELECT
        COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'question_id', lf.question_id,
                    'category', lf.category,
                    'difficulty', lf.difficulty,
                    'suggested_difficulty', lf.suggested_difficulty,
                    'question_preview', lf.question_preview,
                    'shown_count', lf.shown_count,
                    'correct_count', lf.correct_count,
                    'skipped_count', lf.skipped_count,
                    'solve_rate', lf.solve_rate,
                    'skip_rate', lf.skip_rate,
                    'open_reports', lf.open_reports,
                    'total_reports', lf.total_reports,
                    'flags', to_jsonb(lf.flags)
                )
                ORDER BY lf.open_reports DESC, lf.shown_count DESC, lf.question_id ASC
            )
            FROM limited_flagged lf
        ), '[]'::jsonb),
        COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'category', d.category,
                    'total_questions', d.total_questions,
                    'eligible_count', d.eligible_count,
                    'unaudited_count', d.unaudited_count,
                    'audit_failed_count', d.audit_failed_count,
                    'quarantined_count', d.quarantined_count,
                    'review_queue_count', d.review_queue_count,
                    'ninety_day_target', d.ninety_day_target,
                    'days_of_supply', d.days_of_supply,
                    'below_90_day_supply', d.below_90_day_supply,
                    'shortfall_90_day', d.shortfall_90_day
                )
                ORDER BY d.eligible_count ASC, d.category ASC
            )
            FROM depth d
        ), '[]'::jsonb),
        jsonb_build_object(
            'flagged_count', (SELECT COUNT(*)::integer FROM only_flagged),
            'easy_too_hard_count', (SELECT COUNT(*)::integer FROM only_flagged WHERE 'easy_too_hard' = ANY(flags)),
            'hard_too_easy_count', (SELECT COUNT(*)::integer FROM only_flagged WHERE 'hard_too_easy' = ANY(flags)),
            'high_skip_count', (SELECT COUNT(*)::integer FROM only_flagged WHERE 'high_skip_rate' = ANY(flags)),
            'high_report_count', (SELECT COUNT(*)::integer FROM only_flagged WHERE 'high_report_outlier' = ANY(flags)),
            'categories_below_90_day', (SELECT COUNT(*)::integer FROM depth WHERE below_90_day_supply),
            'total_eligible', COALESCE((SELECT SUM(eligible_count)::integer FROM depth), 0),
            'total_review_queue', COALESCE((SELECT SUM(review_queue_count)::integer FROM depth), 0),
            'total_unaudited', COALESCE((SELECT SUM(unaudited_count)::integer FROM depth), 0)
        )
      INTO v_outliers, v_category_depth, v_summary;

    RETURN jsonb_build_object(
        'success', true,
        'min_shown', v_min_shown,
        'ninety_day_target_per_category', v_ninety_day_target,
        'summary', v_summary,
        'outliers', v_outliers,
        'category_depth', v_category_depth
    );
END;
$function$;

-- 4. Audited Batch Question Curation RPC
CREATE OR REPLACE FUNCTION public.trivia_pool_batch_curate_v1(
    p_operator_id uuid,
    p_question_ids uuid[],
    p_action text,
    p_reason text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pg_catalog, public, extensions, pg_temp
AS $function$
DECLARE
    v_context jsonb;
    v_is_admin boolean := false;
    v_has_authority boolean := false;
    v_reason text := btrim(COALESCE(p_reason, ''));
    v_action text := btrim(COALESCE(p_action, ''));
    v_dedup_ids uuid[];
    v_valid_ids uuid[];
    v_missing_ids uuid[];
    v_requested_count integer := 0;
    v_affected_count integer := 0;
    v_released_count integer := 0;
    v_quarantined_count integer := 0;
    v_new_difficulty text := NULL;
    v_now timestamptz := now();
    v_receipt uuid := extensions.gen_random_uuid();
    v_request_key text;
    v_request_hash text;
    v_actor text;
    v_qid uuid;
    v_quar_row record;
    v_quar_res jsonb;
    v_result jsonb;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
    END IF;

    IF p_operator_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'operator_required');
    END IF;

    v_context := public.trivia_operator_context_core_v1(p_operator_id);
    SELECT COALESCE(p.is_admin, false) OR COALESCE(p.role, '') IN ('admin', 'superadmin', 'god')
      INTO v_is_admin
      FROM public.profiles p
     WHERE p.id = p_operator_id;

    v_has_authority := COALESCE((v_context->>'allowed')::boolean, false)
        AND (
            (v_context->'roles') ?| ARRAY['supervisor', 'question_curator']
            OR (v_context->'capabilities') ?| ARRAY['question_quarantine', 'question_release']
            OR COALESCE(v_is_admin, false)
        );

    IF NOT v_has_authority THEN
        RETURN jsonb_build_object('success', false, 'error', 'operator_capability_required');
    END IF;

    IF length(v_reason) < 8 OR length(v_reason) > 500 THEN
        RETURN jsonb_build_object('success', false, 'error', 'reason_required');
    END IF;

    IF v_action NOT IN (
        'approve', 'quarantine',
        'set_difficulty_easy', 'set_difficulty_medium', 'set_difficulty_hard'
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'unsupported_action');
    END IF;

    SELECT COALESCE(array_agg(DISTINCT id), ARRAY[]::uuid[])
      INTO v_dedup_ids
      FROM unnest(COALESCE(p_question_ids, ARRAY[]::uuid[])) AS id
     WHERE id IS NOT NULL;

    v_requested_count := COALESCE(array_length(v_dedup_ids, 1), 0);
    IF v_requested_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'question_ids_required');
    END IF;
    IF v_requested_count > 100 THEN
        RETURN jsonb_build_object('success', false, 'error', 'batch_limit_exceeded', 'max_batch_size', 100);
    END IF;

    SELECT COALESCE(array_agg(q.id ORDER BY q.id), ARRAY[]::uuid[])
      INTO v_valid_ids
      FROM public.trivia_questions q
     WHERE q.id = ANY(v_dedup_ids);

    SELECT COALESCE(array_agg(req_id ORDER BY req_id), ARRAY[]::uuid[])
      INTO v_missing_ids
      FROM unnest(v_dedup_ids) AS req_id
     WHERE NOT (req_id = ANY(v_valid_ids));

    IF COALESCE(array_length(v_valid_ids, 1), 0) = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'questions_not_found',
            'missing_ids', to_jsonb(v_missing_ids)
        );
    END IF;

    v_actor := 'operator:' || p_operator_id::text;

    IF v_action = 'approve' THEN
        UPDATE public.trivia_questions
           SET audit_verified = true,
               last_audited_at = v_now,
               quality_score = GREATEST(COALESCE(quality_score, 7), 7),
               updated_at = v_now
         WHERE id = ANY(v_valid_ids);
        GET DIAGNOSTICS v_affected_count = ROW_COUNT;

        UPDATE public.trivia_question_curation
           SET last_reviewed_at = v_now,
               updated_at = v_now
         WHERE question_id = ANY(v_valid_ids);

        FOR v_quar_row IN
            SELECT id
              FROM public.trivia_question_quarantine
             WHERE question_id = ANY(v_valid_ids)
               AND released_at IS NULL
             ORDER BY id
        LOOP
            v_quar_res := public.trivia_release_question_quarantine_v1(
                v_quar_row.id,
                v_actor,
                v_reason
            );
            IF COALESCE((v_quar_res->>'success')::boolean, false)
               AND COALESCE((v_quar_res->>'duplicate')::boolean, false) IS NOT TRUE THEN
                v_released_count := v_released_count + 1;
            END IF;
        END LOOP;

    ELSIF v_action = 'quarantine' THEN
        FOREACH v_qid IN ARRAY v_valid_ids
        LOOP
            v_quar_res := public.trivia_quarantine_question_v1(
                v_qid,
                'operator_batch_quarantine',
                'operations',
                v_actor,
                jsonb_build_object(
                    'reason', v_reason,
                    'operator_id', p_operator_id,
                    'receipt_id', v_receipt
                )
            );
            IF COALESCE((v_quar_res->>'success')::boolean, false) THEN
                v_affected_count := v_affected_count + 1;
                IF COALESCE((v_quar_res->>'duplicate')::boolean, false) IS NOT TRUE THEN
                    v_quarantined_count := v_quarantined_count + 1;
                END IF;
            END IF;
        END LOOP;

    ELSE
        v_new_difficulty := CASE v_action
            WHEN 'set_difficulty_easy' THEN 'easy'
            WHEN 'set_difficulty_medium' THEN 'medium'
            WHEN 'set_difficulty_hard' THEN 'hard'
        END;

        UPDATE public.trivia_questions
           SET difficulty = v_new_difficulty,
               retagged_difficulty = v_new_difficulty,
               updated_at = v_now
         WHERE id = ANY(v_valid_ids);
        GET DIAGNOSTICS v_affected_count = ROW_COUNT;
    END IF;

    v_request_key := 'pool-curate:' || replace(v_receipt::text, '-', '');
    v_request_hash := encode(extensions.digest(convert_to(
        jsonb_build_object(
            'operatorId', p_operator_id,
            'action', v_action,
            'reason', v_reason,
            'questionIds', to_jsonb(v_valid_ids)
        )::text, 'UTF8'), 'sha256'), 'hex');

    v_result := jsonb_build_object(
        'batch_action', v_action,
        'requested_count', v_requested_count,
        'affected_count', v_affected_count,
        'released_quarantine_count', v_released_count,
        'quarantined_count', v_quarantined_count,
        'new_difficulty', v_new_difficulty,
        'missing_ids', to_jsonb(v_missing_ids),
        'question_ids', to_jsonb(v_valid_ids)
    );

    INSERT INTO public.trivia_operator_events_v1
        (receipt_id, operator_id, request_key, request_hash, action, reason,
         target_kind, target_id, outcome, result)
    VALUES (
        v_receipt,
        p_operator_id,
        v_request_key,
        v_request_hash,
        CASE v_action
            WHEN 'quarantine' THEN 'question_quarantine'
            WHEN 'approve' THEN 'question_release'
            ELSE 'incident_note'
        END,
        v_reason,
        'question',
        v_valid_ids[1],
        'succeeded',
        v_result
    );

    RETURN jsonb_build_object(
        'success', true,
        'receipt_id', v_receipt,
        'action', v_action,
        'requested_count', v_requested_count,
        'affected_count', v_affected_count,
        'released_quarantine_count', v_released_count,
        'quarantined_count', v_quarantined_count,
        'new_difficulty', v_new_difficulty,
        'missing_ids', to_jsonb(v_missing_ids)
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.trivia_missed_questions_study_v1(uuid, text, integer)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trivia_missed_questions_study_v1(uuid, text, integer)
    TO service_role;

REVOKE ALL ON FUNCTION public.trivia_question_calibration_report_v1(integer, integer)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trivia_question_calibration_report_v1(integer, integer)
    TO service_role;

REVOKE ALL ON FUNCTION public.trivia_pool_batch_curate_v1(uuid, uuid[], text, text)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trivia_pool_batch_curate_v1(uuid, uuid[], text, text)
    TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

/* FORWARD ROLLBACK (Tier 3)
BEGIN;
DROP FUNCTION IF EXISTS public.trivia_pool_batch_curate_v1(uuid, uuid[], text, text);
DROP FUNCTION IF EXISTS public.trivia_question_calibration_report_v1(integer, integer);
DROP FUNCTION IF EXISTS public.trivia_missed_questions_study_v1(uuid, text, integer);
NOTIFY pgrst, 'reload schema';
COMMIT;
*/

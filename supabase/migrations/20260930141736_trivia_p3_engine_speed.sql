-- Trivia Phase 3, migration 3: the engine answers inside the service-role statement timeout.
--
-- The service role runs with statement_timeout = 8s. Measured in production after the Phase 3 install:
--   * trivia_question_health_v1 read the eligible pool nine times (4-5 s warm) and timed out in
--     the first scheduled pool-guard run, so no health run or alert was recorded;
--   * trivia_preflight_tournament_v1 rebuilt the candidate pool for every round and joined it row
--     by row against the entrants' seen questions: 15.1 s for a 256-player bracket, 16.3 s for 512;
--   * trivia_select_core_v1 took 0.6-4.6 s per roster and created temporary tables on each call.
--
-- Nothing a caller sees changes: every signature, grant, key and output is identical. The selection
-- is split into the label-independent candidate set (read once, with key-set membership instead of
-- joins) and the trivia-select/1 passes (per label), so the preflight reads the pool once for all
-- rounds. Proven on production data before install, old against new in the same transaction:
-- 60 of 60 rosters identical across all 15 profiles (players' seen questions, scarcity, exclusions,
-- oversized counts), identical 256- and 512-player tournament plans (1.7 s instead of 15-16 s),
-- identical capacity for every bracket size and identical health metrics (1.4 s instead of 4.1 s).

-- The eligible candidates for one profile, players and time. Label-independent, so a caller
-- building several rosters reads the pool once. A player's seen questions, the shared cooldown
-- and the exclusions are key sets (jsonb objects, so membership is a binary search): the pool
-- is never joined row by row against them, whatever the planner guesses about the pool's size.
CREATE OR REPLACE FUNCTION public.trivia_p3_candidates_v1(p_profile_id text, p_player_ids uuid[],
    p_exclude_canonical uuid[], p_as_of timestamptz,
    OUT qids uuid[], OUT rids uuid[], OUT cats text[], OUT diffs text[], OUT tiers smallint[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE v_p public.trivia_roster_profiles%ROWTYPE; v_seen jsonb; v_cool jsonb; v_excl jsonb;
BEGIN
    SELECT * INTO v_p FROM public.trivia_roster_profiles r WHERE r.profile_id = p_profile_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'unknown_profile %', p_profile_id; END IF;
    qids := '{}'; rids := '{}'; cats := '{}'; diffs := '{}'; tiers := '{}';
    -- As before: a NULL inside the exclusion list excludes every candidate.
    IF array_position(coalesce(p_exclude_canonical, '{}'::uuid[]), NULL) IS NOT NULL THEN RETURN; END IF;
    SELECT coalesce(jsonb_object_agg(z.canon::text, true), '{}'::jsonb) INTO v_seen
      FROM (SELECT DISTINCT c.canonical_question_id AS canon
              FROM public.trivia_user_question_history h
              JOIN public.trivia_question_curation c ON c.question_id = h.question_id
             WHERE h.user_id = ANY (coalesce(p_player_ids, '{}'::uuid[]))
               AND h.seen_at <= p_as_of
               AND h.seen_at > p_as_of - make_interval(days => v_p.exposure_window_days)) z;
    SELECT coalesce(jsonb_object_agg(z.canon::text, true), '{}'::jsonb) INTO v_cool
      FROM (SELECT DISTINCT i.canonical_question_id AS canon
              FROM public.trivia_roster_snapshot_items i
              JOIN public.trivia_roster_snapshots rs ON rs.id = i.snapshot_id
             WHERE v_p.global_cooldown_days > 0
               AND rs.scope_kind IN ('daily','tournament_plan')
               AND rs.created_at <= p_as_of
               AND rs.created_at > p_as_of - make_interval(days => v_p.global_cooldown_days)) z;
    SELECT coalesce(jsonb_object_agg(z.id::text, true), '{}'::jsonb) INTO v_excl
      FROM (SELECT DISTINCT u.id FROM unnest(coalesce(p_exclude_canonical, '{}'::uuid[])) AS u(id)) z;
    SELECT coalesce(array_agg(z.qid), '{}'), coalesce(array_agg(z.rid), '{}'), coalesce(array_agg(z.cat), '{}'),
           coalesce(array_agg(z.diff), '{}'), coalesce(array_agg(z.tr), '{}')
      INTO qids, rids, cats, diffs, tiers
      FROM (SELECT p.question_id AS qid, p.revision_id AS rid, p.category AS cat, p.difficulty AS diff,
                   (CASE WHEN v_seen ? p.question_id::text THEN 2 WHEN v_cool ? p.question_id::text THEN 1 ELSE 0 END)::smallint AS tr
              FROM public.trivia_eligible_question_pool_v1 p
             WHERE v_p.mode = ANY (p.modes)
               AND p.category = ANY (v_p.categories)
               AND (v_p.per_question_seconds IS NULL OR p.min_timer_seconds <= v_p.per_question_seconds)
               AND NOT (v_excl ? p.question_id::text)) z;
END $$;

-- The trivia-select/1 passes over a given candidate set: category order and difficulty tokens
-- from the label, then (1) each cell by (tier, key), (2) each category's deficit, (3) the global
-- remainder, then the order key. One statement, no temporary tables; the HMAC is the same
-- expression trivia_hmac_v1 wraps, computed inline.
CREATE OR REPLACE FUNCTION public.trivia_p3_select_passes_v1(p_secret bytea, p_label text, p_profile_id text,
    p_count integer, p_qids uuid[], p_rids uuid[], p_cats text[], p_diffs text[], p_tiers smallint[])
RETURNS TABLE(pos integer, question_id uuid, revision_id uuid, canonical_question_id uuid, category text,
              difficulty text, tier smallint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE
    v_p public.trivia_roster_profiles%ROWTYPE; v_n integer; v_cats text[]; v_k integer; v_counts jsonb;
BEGIN
    SELECT * INTO v_p FROM public.trivia_roster_profiles r WHERE r.profile_id = p_profile_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'unknown_profile %', p_profile_id; END IF;
    IF p_secret IS NULL OR p_label IS NULL THEN RAISE EXCEPTION 'select_core_arguments'; END IF;
    v_n := coalesce(p_count, v_p.question_count);
    SELECT array_agg(c ORDER BY public.trivia_hmac_v1(p_secret, 'trivia-select/1:' || p_label || ':c:' || c))
      INTO v_cats FROM unnest(v_p.categories) AS u(c);
    v_k := cardinality(v_cats);
    WITH d AS (SELECT e.key AS diff, (e.value #>> '{}')::numeric AS share FROM jsonb_each(v_p.difficulty_mix) e),
         f AS (SELECT diff, floor(v_n * share)::int AS base, (v_n * share) - floor(v_n * share) AS frac FROM d),
         r AS (SELECT diff, base, row_number() OVER (ORDER BY frac DESC, diff ASC) AS rk FROM f)
    SELECT jsonb_object_agg(diff, base + CASE WHEN rk <= v_n - (SELECT sum(base) FROM f) THEN 1 ELSE 0 END)
      INTO v_counts FROM r;

    RETURN QUERY
    WITH cand AS MATERIALIZED (
        SELECT u.qid, u.rid, u.cat, u.diff, u.tr,
               extensions.hmac(convert_to('trivia-select/1:' || p_label || ':q:' || u.qid::text, 'UTF8'), p_secret, 'sha256') AS k
          FROM unnest(coalesce(p_qids, '{}'::uuid[]), coalesce(p_rids, '{}'::uuid[]), coalesce(p_cats, '{}'::text[]),
                      coalesce(p_diffs, '{}'::text[]), coalesce(p_tiers, '{}'::smallint[])) AS u(qid, rid, cat, diff, tr)),
    slots AS (
        SELECT v_cats[(t.slot % v_k) + 1] AS cat, t.diff
          FROM (SELECT tk.diff, (row_number() OVER (ORDER BY extensions.hmac(convert_to(
                       'trivia-select/1:' || p_label || ':t:' || tk.diff || ':' || tk.i::text, 'UTF8'), p_secret, 'sha256')) - 1)::int AS slot
                  FROM (SELECT dd.key AS diff, g.i FROM jsonb_each(v_counts) dd
                        CROSS JOIN LATERAL generate_series(1, (dd.value #>> '{}')::int) AS g(i)) tk) t),
    cells AS (SELECT sl.cat, sl.diff, count(*) AS n FROM slots sl GROUP BY 1, 2),
    cat_slots AS (SELECT sl.cat, count(*) AS n FROM slots sl GROUP BY 1),
    p1 AS (SELECT r1.qid
             FROM (SELECT c.qid, c.cat, c.diff, row_number() OVER (PARTITION BY c.cat, c.diff ORDER BY c.tr, c.k) AS rn
                     FROM cand c) r1
             JOIN cells ce ON ce.cat = r1.cat AND ce.diff = r1.diff
            WHERE r1.rn <= ce.n),
    p1_cat AS (SELECT c.cat, count(*) AS n FROM cand c JOIN p1 ON p1.qid = c.qid GROUP BY 1),
    p2 AS (SELECT r2.qid
             FROM (SELECT c.qid, c.cat, row_number() OVER (PARTITION BY c.cat ORDER BY c.tr, c.k) AS rn
                     FROM cand c WHERE NOT EXISTS (SELECT 1 FROM p1 WHERE p1.qid = c.qid)) r2
             JOIN (SELECT cs.cat, cs.n - coalesce(pc.n, 0) AS deficit
                     FROM cat_slots cs LEFT JOIN p1_cat pc ON pc.cat = cs.cat) de ON de.cat = r2.cat
            WHERE r2.rn <= de.deficit),
    p12 AS (SELECT p1.qid FROM p1 UNION ALL SELECT p2.qid FROM p2),
    p3 AS (SELECT c.qid FROM cand c
            WHERE NOT EXISTS (SELECT 1 FROM p12 WHERE p12.qid = c.qid)
            ORDER BY c.tr, c.k
            LIMIT greatest(v_n - (SELECT count(*) FROM p12), 0)),
    picked AS (SELECT p12.qid FROM p12 UNION ALL SELECT p3.qid FROM p3)
    SELECT (row_number() OVER (ORDER BY
                CASE WHEN v_p.order_policy = 'difficulty_ramp'
                     THEN CASE c.diff WHEN 'easy' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END ELSE 0 END,
                extensions.hmac(convert_to('trivia-select/1:' || p_label || ':o:' || c.qid::text, 'UTF8'), p_secret, 'sha256')))::int,
           c.qid, c.rid, c.qid, c.cat, c.diff, c.tr
      FROM cand c JOIN picked pk ON pk.qid = c.qid
     ORDER BY 1;
END $$;

-- Same signature, same rows as before.
CREATE OR REPLACE FUNCTION public.trivia_select_core_v1(p_secret bytea, p_label text, p_profile_id text, p_count integer,
    p_player_ids uuid[], p_exclude_canonical uuid[], p_as_of timestamptz)
RETURNS TABLE(pos integer, question_id uuid, revision_id uuid, canonical_question_id uuid, category text,
              difficulty text, tier smallint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE v_c record;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.trivia_roster_profiles r WHERE r.profile_id = p_profile_id) THEN
        RAISE EXCEPTION 'unknown_profile %', p_profile_id;
    END IF;
    IF p_secret IS NULL OR p_label IS NULL OR p_as_of IS NULL THEN RAISE EXCEPTION 'select_core_arguments'; END IF;
    v_c := public.trivia_p3_candidates_v1(p_profile_id, p_player_ids, p_exclude_canonical, p_as_of);
    RETURN QUERY SELECT * FROM public.trivia_p3_select_passes_v1(p_secret, p_label, p_profile_id, p_count,
        v_c.qids, v_c.rids, v_c.cats, v_c.diffs, v_c.tiers);
END $$;

-- One pass over the eligible pool (it used to be read three times). Same output.
CREATE OR REPLACE FUNCTION public.trivia_tournament_capacity_v1(p_bracket_size integer,
    p_profile_id text DEFAULT 'tournament.nightly/roster@1')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_p public.trivia_roster_profiles%ROWTYPE; v_rounds integer; v_req integer; v_avail integer; v_cat jsonb; v_diff jsonb;
BEGIN
    SELECT * INTO v_p FROM public.trivia_roster_profiles WHERE profile_id = p_profile_id AND mode = 'tournaments';
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'unknown_profile'); END IF;
    IF p_bracket_size IS NULL OR p_bracket_size < 2 OR p_bracket_size > 4096 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_bracket_size');
    END IF;
    v_rounds := ceil(ln(p_bracket_size::numeric) / ln(2::numeric) - 1e-9)::int;
    v_req := v_rounds * v_p.question_count;
    WITH p AS MATERIALIZED (
        SELECT e.category, e.difficulty FROM public.trivia_eligible_question_pool_v1 e
         WHERE v_p.mode = ANY (e.modes) AND e.category = ANY (v_p.categories)
           AND (v_p.per_question_seconds IS NULL OR e.min_timer_seconds <= v_p.per_question_seconds))
    SELECT (SELECT count(*) FROM p),
           (SELECT jsonb_object_agg(z.category, z.n) FROM (SELECT p.category, count(*) n FROM p GROUP BY 1) z),
           (SELECT jsonb_object_agg(z.difficulty, z.n) FROM (SELECT p.difficulty, count(*) n FROM p GROUP BY 1) z)
      INTO v_avail, v_cat, v_diff;
    RETURN jsonb_build_object('success', true, 'bracket_size', p_bracket_size, 'rounds', v_rounds,
        'questions_per_round', v_p.question_count, 'required', v_req, 'eligible_available', v_avail,
        'supports', v_avail >= v_req, 'by_category', coalesce(v_cat, '{}'::jsonb), 'by_difficulty', coalesce(v_diff, '{}'::jsonb),
        'profile_id', p_profile_id);
END $$;

-- The candidate pool is read once for all rounds (each round excludes the questions already
-- planned, exactly as before). Same plan, same receipt.
CREATE OR REPLACE FUNCTION public.trivia_preflight_tournament_v1(p_tournament_id uuid, p_bracket_size integer,
    p_profile_id text DEFAULT 'tournament.nightly/roster@1', p_entrant_ids uuid[] DEFAULT '{}'::uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE
    v_cap jsonb; v_s public.trivia_roster_snapshots%ROWTYPE; v_rounds integer; v_n integer; v_r integer;
    v_as_of timestamptz := now(); v_got integer; v_excl uuid[] := '{}'::uuid[]; v_secret bytea; v_base record;
    f_q uuid[]; f_r uuid[]; f_c text[]; f_d text[]; f_t smallint[];
BEGIN
    IF p_tournament_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'invalid_scope'); END IF;
    v_cap := public.trivia_tournament_capacity_v1(p_bracket_size, p_profile_id);
    IF (v_cap ->> 'success')::boolean IS NOT TRUE THEN RETURN v_cap; END IF;
    v_rounds := (v_cap ->> 'rounds')::int;
    v_n := (v_cap ->> 'questions_per_round')::int;
    PERFORM pg_advisory_xact_lock(hashtextextended('trivia_roster:tournament_plan:' || p_tournament_id::text, 0));
    SELECT * INTO v_s FROM public.trivia_roster_snapshots WHERE scope_kind = 'tournament_plan' AND scope_id = p_tournament_id::text;
    IF FOUND THEN
        IF v_s.profile_id <> p_profile_id OR v_s.rounds <> v_rounds THEN
            RETURN jsonb_build_object('success', false, 'error', 'scope_conflict', 'snapshot_id', v_s.id);
        END IF;
        RETURN public.trivia_p3_snapshot_receipt(v_s) || jsonb_build_object('questions_per_round', v_n,
            'required', v_rounds * v_n);
    END IF;
    v_secret := public.trivia_engine_secret_v1('roster-v1');
    v_base := public.trivia_p3_candidates_v1(p_profile_id, coalesce(p_entrant_ids, '{}'::uuid[]), '{}'::uuid[], v_as_of);
    CREATE TEMP TABLE IF NOT EXISTS trivia_p3_plan (round_no integer, pos integer, question_id uuid, revision_id uuid,
        canonical_question_id uuid, category text, difficulty text, tier smallint) ON COMMIT DROP;
    TRUNCATE pg_temp.trivia_p3_plan;
    FOR v_r IN 1 .. v_rounds LOOP
        SELECT coalesce(array_agg(u.qid), '{}'), coalesce(array_agg(u.rid), '{}'), coalesce(array_agg(u.cat), '{}'),
               coalesce(array_agg(u.diff), '{}'), coalesce(array_agg(u.tr), '{}')
          INTO f_q, f_r, f_c, f_d, f_t
          FROM unnest(v_base.qids, v_base.rids, v_base.cats, v_base.diffs, v_base.tiers) AS u(qid, rid, cat, diff, tr)
         WHERE NOT (u.qid = ANY (v_excl));
        INSERT INTO pg_temp.trivia_p3_plan
        SELECT v_r, s.pos, s.question_id, s.revision_id, s.canonical_question_id, s.category, s.difficulty, s.tier
          FROM public.trivia_p3_select_passes_v1(v_secret, 'tournament_plan:' || p_tournament_id::text || ':r' || v_r,
               p_profile_id, v_n, f_q, f_r, f_c, f_d, f_t) s;
        SELECT count(*) INTO v_got FROM pg_temp.trivia_p3_plan WHERE round_no = v_r;
        IF v_got < v_n THEN
            RETURN jsonb_build_object('success', false, 'error', 'insufficient_eligible_pool', 'round', v_r,
                'required', v_rounds * v_n, 'available', (v_cap ->> 'eligible_available')::int);
        END IF;
        v_excl := ARRAY(SELECT canonical_question_id FROM pg_temp.trivia_p3_plan);
    END LOOP;
    RETURN public.trivia_p3_store_snapshot('tournament_plan', p_tournament_id::text, p_profile_id,
        'tournament_plan:' || p_tournament_id::text, v_as_of, v_rounds)
        || jsonb_build_object('questions_per_round', v_n, 'required', v_rounds * v_n);
END $$;

-- The eligible pool is read once per health run (it used to be read nine times).
CREATE OR REPLACE FUNCTION public.trivia_question_health_v1(p_record boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE
    m jsonb; c jsonb := '[]'::jsonb; v_cap256 jsonb; v_cap512 jsonb; v_thin jsonb; v_pool integer; v_by_mode jsonb;
    v_queue integer; v_last_review timestamptz; v_rep_open integer; v_rep_invalid integer; v_rep_oldest numeric;
    v_stale integer; v_held integer; v_nostats integer; v_exp24 integer; v_items integer; v_tier2 integer;
    v_voids integer; v_integrity integer; v_events jsonb := '[]'::jsonb; r record; v_now timestamptz := now();
    v_run uuid;
BEGIN
    v_cap256 := public.trivia_tournament_capacity_v1(256);
    v_cap512 := public.trivia_tournament_capacity_v1(512);
    -- The eligible pool is read once; the count, the thin-profile check and the per-mode
    -- supply are all taken from that one pass.
    WITH pool AS MATERIALIZED (SELECT e.category, e.modes, e.min_timer_seconds FROM public.trivia_eligible_question_pool_v1 e)
    SELECT (SELECT count(*) FROM pool),
           (SELECT coalesce(jsonb_object_agg(p.profile_id, e.n), '{}'::jsonb) FROM public.trivia_roster_profiles p
              CROSS JOIN LATERAL (SELECT count(*) n FROM pool x
                                   WHERE p.mode = ANY (x.modes) AND x.category = ANY (p.categories)
                                     AND (p.per_question_seconds IS NULL OR x.min_timer_seconds <= p.per_question_seconds)) e
             WHERE p.mode NOT IN ('pvp','tournaments') AND e.n < p.question_count * 30),
           (SELECT jsonb_object_agg(z.mode, z.n) FROM (SELECT u.mode, count(*) n FROM pool p, unnest(p.modes) u(mode) GROUP BY 1) z)
      INTO v_pool, v_thin, v_by_mode;
    SELECT count(*) INTO v_queue FROM public.trivia_review_queue_v1;
    SELECT greatest((SELECT max(reviewed_at) FROM public.trivia_question_reviews),
                    (SELECT max(last_audited_at) FROM public.trivia_questions)) INTO v_last_review;
    SELECT count(*) FILTER (WHERE valid), count(*) FILTER (WHERE NOT valid),
           max(extract(epoch FROM (v_now - created_at)) / 3600) FILTER (WHERE valid)
      INTO v_rep_open, v_rep_invalid, v_rep_oldest FROM public.trivia_question_reports WHERE state IN ('open','triaged');
    SELECT count(*) FILTER (WHERE NOT public.trivia_p3_session_is_held_evidence(id)),
           count(*) FILTER (WHERE public.trivia_p3_session_is_held_evidence(id))
      INTO v_stale, v_held FROM public.trivia_sessions
     WHERE status = 'open' AND ((expires_at IS NOT NULL AND expires_at < v_now)
            OR (expires_at IS NULL AND created_at < v_now - interval '6 hours'));
    SELECT count(*) INTO v_nostats FROM public.trivia_sessions
     WHERE status = 'submitted' AND stats_recorded_at IS NULL AND NOT public.trivia_p3_session_is_held_evidence(id);
    SELECT count(*) INTO v_exp24 FROM public.trivia_session_reconciliations WHERE action = 'expired' AND created_at > v_now - interval '24 hours';
    SELECT count(*), count(*) FILTER (WHERE i.selection_tier = 2) INTO v_items, v_tier2
      FROM public.trivia_roster_snapshot_items i JOIN public.trivia_roster_snapshots s ON s.id = i.snapshot_id
     WHERE s.scope_kind IN ('solo_session','pvp_match') AND s.created_at > v_now - interval '7 days';
    SELECT coalesce(sum(voided), 0) INTO v_voids FROM public.trivia_session_results WHERE created_at > v_now - interval '24 hours';
    SELECT count(*) INTO v_integrity FROM public.trivia_question_curation cu
      JOIN public.trivia_question_revisions rv ON rv.id = cu.current_revision_id
      JOIN public.trivia_questions q ON q.id = cu.question_id
     WHERE rv.content_hash <> public.trivia_question_content_hash_v1(q.question, q.options, q.correct_index,
               q.explanation, q.category, q.subcategory, q.difficulty);
    m := jsonb_build_object('eligible_pool', v_pool,
        'pool_by_mode', v_by_mode,
        'rejection_reasons', (SELECT jsonb_object_agg(reason, n) FROM (SELECT u.reason, count(*) n FROM public.trivia_question_eligibility_v1 e,
                         unnest(e.reject_reasons) u(reason) GROUP BY 1) z),
        'tournament_256', v_cap256, 'tournament_512', v_cap512, 'thin_profiles', v_thin,
        'review_queue', v_queue, 'last_review_at', v_last_review,
        'reports_open_valid', v_rep_open, 'reports_open_invalid', v_rep_invalid, 'reports_oldest_valid_hours', round(coalesce(v_rep_oldest, 0), 1),
        'sessions_stale_open', v_stale, 'sessions_held_evidence', v_held, 'sessions_expired_24h', v_exp24,
        'submitted_without_stats', v_nostats, 'roster_items_7d', v_items,
        'repeat_rate_7d', CASE WHEN v_items > 0 THEN round(v_tier2::numeric / v_items, 4) ELSE 0 END,
        'invalid_question_voids_24h', v_voids, 'revision_integrity_mismatches', v_integrity);
    IF (v_cap256 ->> 'supports')::boolean IS NOT TRUE THEN
        c := c || jsonb_build_array(jsonb_build_object('alertname', 'TriviaEligiblePoolBelowNightlyBracket', 'severity', 'critical',
            'summary', format('eligible tournament pool %s < %s questions required for a 256-player bracket',
                               v_cap256 ->> 'eligible_available', v_cap256 ->> 'required')));
    END IF;
    IF v_thin <> '{}'::jsonb THEN
        c := c || jsonb_build_array(jsonb_build_object('alertname', 'TriviaEligiblePoolThin', 'severity', 'warning',
            'summary', 'eligible supply under 30 rosters for: ' || (SELECT string_agg(k, ', ') FROM jsonb_object_keys(v_thin) k)));
    END IF;
    IF v_nostats > 0 THEN
        c := c || jsonb_build_array(jsonb_build_object('alertname', 'TriviaSubmittedWithoutStats', 'severity', 'warning',
            'summary', format('%s submitted sessions have no recorded stats', v_nostats)));
    END IF;
    IF v_stale > 0 THEN
        c := c || jsonb_build_array(jsonb_build_object('alertname', 'TriviaStaleOpenSessions', 'severity', 'warning',
            'summary', format('%s open sessions are past their deadline', v_stale)));
    END IF;
    IF coalesce(v_rep_oldest, 0) > 72 THEN
        c := c || jsonb_build_array(jsonb_build_object('alertname', 'TriviaQuestionReportBacklog', 'severity', 'warning',
            'summary', format('%s valid question reports open; oldest %s h', v_rep_open, round(v_rep_oldest))));
    END IF;
    IF v_queue > 0 AND (v_last_review IS NULL OR v_last_review < v_now - interval '48 hours') THEN
        c := c || jsonb_build_array(jsonb_build_object('alertname', 'TriviaReviewQueueStalled', 'severity', 'warning',
            'summary', format('%s questions await review; no review recorded in 48 h', v_queue)));
    END IF;
    IF v_integrity > 0 THEN
        c := c || jsonb_build_array(jsonb_build_object('alertname', 'TriviaRevisionIntegrity', 'severity', 'critical',
            'summary', format('%s questions differ from their captured revision', v_integrity)));
    END IF;
    IF v_voids > 0 THEN
        c := c || jsonb_build_array(jsonb_build_object('alertname', 'TriviaInvalidQuestionVoids', 'severity', 'warning',
            'summary', format('%s served questions were voided in 24 h', v_voids)));
    END IF;
    IF v_items >= 20 AND v_tier2::numeric / v_items > 0.2 THEN
        c := c || jsonb_build_array(jsonb_build_object('alertname', 'TriviaRosterRepeatRateHigh', 'severity', 'warning',
            'summary', format('%s%% of roster items in 7 days repeated a player''s recent question', round(100.0 * v_tier2 / v_items))));
    END IF;
    IF NOT coalesce(p_record, false) THEN
        RETURN jsonb_build_object('success', true, 'healthy', jsonb_array_length(c) = 0, 'metrics', m, 'conditions', c, 'events', '[]'::jsonb);
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('trivia_question_health_v1', 0));
    -- close episodes whose condition is gone; keep re-sending undelivered recoveries
    FOR r IN SELECT * FROM public.trivia_ops_alert_state s
              WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(c) x WHERE x ->> 'alertname' = s.alertname)
                AND (s.resolved_at IS NULL OR NOT s.resolution_delivered) LOOP
        UPDATE public.trivia_ops_alert_state SET resolved_at = coalesce(resolved_at, v_now) WHERE alertname = r.alertname;
        v_events := v_events || jsonb_build_array(jsonb_build_object('alertname', r.alertname, 'status', 'resolved',
            'severity', r.severity, 'event_key', r.episode_key || ':resolved', 'resolves', r.episode_key,
            'summary', 'recovered: ' || coalesce(r.last_summary, r.alertname), 'firing_since', r.firing_since));
    END LOOP;
    FOR r IN SELECT x ->> 'alertname' AS alertname, x ->> 'severity' AS severity, x ->> 'summary' AS summary
               FROM jsonb_array_elements(c) x LOOP
        INSERT INTO public.trivia_ops_alert_state AS s (alertname, severity, episode_key, firing_since, last_seen_at, last_summary)
        VALUES (r.alertname, r.severity, public.trivia_sha256_hex_v1('trivia-ops/1:' || r.alertname || ':' || v_now::text),
                v_now, v_now, r.summary)
        ON CONFLICT (alertname) DO UPDATE SET
            episode_key = CASE WHEN s.resolved_at IS NOT NULL THEN EXCLUDED.episode_key ELSE s.episode_key END,
            firing_since = CASE WHEN s.resolved_at IS NOT NULL THEN EXCLUDED.firing_since ELSE s.firing_since END,
            resolved_at = NULL, resolution_delivered = false, severity = EXCLUDED.severity,
            last_seen_at = EXCLUDED.last_seen_at, last_summary = EXCLUDED.last_summary;
        v_events := v_events || (SELECT jsonb_build_array(jsonb_build_object('alertname', s.alertname, 'status', 'firing',
            'severity', s.severity, 'event_key', s.episode_key, 'summary', s.last_summary, 'firing_since', s.firing_since))
            FROM public.trivia_ops_alert_state s WHERE s.alertname = r.alertname);
    END LOOP;
    INSERT INTO public.trivia_question_health_runs (healthy, metrics, conditions)
    VALUES (jsonb_array_length(c) = 0, m, c) RETURNING id INTO v_run;
    RETURN jsonb_build_object('success', true, 'run_id', v_run, 'healthy', jsonb_array_length(c) = 0, 'metrics', m,
        'conditions', c, 'events', v_events);
END $$;

-- Internals stay owner-only; the replaced service functions keep exactly their grants.
REVOKE ALL ON FUNCTION public.trivia_p3_candidates_v1(text, uuid[], uuid[], timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_p3_select_passes_v1(bytea, text, text, integer, uuid[], uuid[], text[], text[], smallint[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_select_core_v1(bytea, text, text, integer, uuid[], uuid[], timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_tournament_capacity_v1(integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trivia_preflight_tournament_v1(uuid, integer, text, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trivia_question_health_v1(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_tournament_capacity_v1(integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_preflight_tournament_v1(uuid, integer, text, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_question_health_v1(boolean) TO service_role;

-- Postconditions.
DO $post$
DECLARE v_fn text; v_a jsonb; v_b jsonb; v_h jsonb; v_cap jsonb;
BEGIN
    FOREACH v_fn IN ARRAY ARRAY['public.trivia_p3_candidates_v1(text,uuid[],uuid[],timestamptz)',
        'public.trivia_p3_select_passes_v1(bytea,text,text,integer,uuid[],uuid[],text[],text[],smallint[])',
        'public.trivia_select_core_v1(bytea,text,text,integer,uuid[],uuid[],timestamptz)'] LOOP
        IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
           OR has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
            RAISE EXCEPTION 'trivia_p3_engine_speed: % must stay owner-only', v_fn;
        END IF;
    END LOOP;
    FOREACH v_fn IN ARRAY ARRAY['public.trivia_tournament_capacity_v1(integer,text)',
        'public.trivia_preflight_tournament_v1(uuid,integer,text,uuid[])', 'public.trivia_question_health_v1(boolean)'] LOOP
        IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
           OR NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
            RAISE EXCEPTION 'trivia_p3_engine_speed: % grants changed', v_fn;
        END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.trivia_select_core_v1(bytea,text,text,integer,uuid[],uuid[],timestamptz)'::regprocedure
                AND prosrc ILIKE '%CREATE TEMP TABLE%') THEN
        RAISE EXCEPTION 'trivia_p3_engine_speed: select core still builds temporary tables';
    END IF;
    IF (SELECT count(*) FROM public.trivia_questions) >= 5000 THEN
        SELECT jsonb_agg(to_jsonb(s) ORDER BY s.pos) INTO v_a FROM public.trivia_select_core_v1('\x70337370656564'::bytea,
            'trivia_p3_engine_speed:postcondition', 'pvp.standard/roster@1', NULL, '{}', '{}', now()) s;
        SELECT jsonb_agg(to_jsonb(s) ORDER BY s.pos) INTO v_b FROM public.trivia_select_core_v1('\x70337370656564'::bytea,
            'trivia_p3_engine_speed:postcondition', 'pvp.standard/roster@1', NULL, '{}', '{}', now()) s;
        IF jsonb_array_length(coalesce(v_a, '[]')) <> 20 OR v_a IS DISTINCT FROM v_b THEN
            RAISE EXCEPTION 'trivia_p3_engine_speed: select core is not a deterministic 20-question roster';
        END IF;
        v_cap := public.trivia_tournament_capacity_v1(256);
        IF (v_cap ->> 'supports')::boolean IS NOT TRUE OR (v_cap ->> 'rounds')::int <> 8 THEN
            RAISE EXCEPTION 'trivia_p3_engine_speed: 256-player capacity lost: %', v_cap;
        END IF;
        v_h := public.trivia_question_health_v1(false);
        IF (v_h ->> 'success')::boolean IS NOT TRUE THEN
            RAISE EXCEPTION 'trivia_p3_engine_speed: health check failed';
        END IF;
    END IF;
END $post$;

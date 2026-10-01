-- Trivia Phase 3, migration 4: the health check keeps clear of the service-role timeout.
--
-- After trivia_p3_engine_speed the health check measured 1.4-3 s, with the revision-integrity
-- check alone taking about 1.5 s: it called trivia_question_content_hash_v1 once per question,
-- and that function's pinned search_path stops PostgreSQL from inlining it. The check now
-- computes the same expression inline (0.4 s). Output, grants and alerts are unchanged; the
-- postcondition proves the inline hash equals the function for every question.

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
    -- The revision hash is computed inline: the same expression trivia_question_content_hash_v1
    -- wraps (its pinned search_path keeps it from being inlined, which made this check 1.5 s).
    SELECT count(*) INTO v_integrity FROM public.trivia_question_curation cu
      JOIN public.trivia_question_revisions rv ON rv.id = cu.current_revision_id
      JOIN public.trivia_questions q ON q.id = cu.question_id
     WHERE rv.content_hash <> encode(extensions.digest(jsonb_build_object(
               'v', 'trivia-question/1', 'q', q.question, 'o', q.options, 'k', q.correct_index,
               'e', coalesce(q.explanation, ''), 'c', q.category, 's', coalesce(q.subcategory, ''),
               'd', q.difficulty)::text, 'sha256'), 'hex');
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

REVOKE ALL ON FUNCTION public.trivia_question_health_v1(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_question_health_v1(boolean) TO service_role;

-- Postconditions.
DO $post$
DECLARE v_diff integer; v_h jsonb;
BEGIN
    SELECT count(*) INTO v_diff FROM public.trivia_questions q
     WHERE encode(extensions.digest(jsonb_build_object(
               'v', 'trivia-question/1', 'q', q.question, 'o', q.options, 'k', q.correct_index,
               'e', coalesce(q.explanation, ''), 'c', q.category, 's', coalesce(q.subcategory, ''),
               'd', q.difficulty)::text, 'sha256'), 'hex')
           IS DISTINCT FROM public.trivia_question_content_hash_v1(q.question, q.options, q.correct_index,
               q.explanation, q.category, q.subcategory, q.difficulty);
    IF v_diff <> 0 THEN
        RAISE EXCEPTION 'trivia_p3_health_speed: inline revision hash differs for % questions', v_diff;
    END IF;
    IF has_function_privilege('anon', 'public.trivia_question_health_v1(boolean)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.trivia_question_health_v1(boolean)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.trivia_question_health_v1(boolean)', 'EXECUTE') THEN
        RAISE EXCEPTION 'trivia_p3_health_speed: health grants changed';
    END IF;
    v_h := public.trivia_question_health_v1(false);
    IF (v_h ->> 'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'trivia_p3_health_speed: health check failed';
    END IF;
END $post$;

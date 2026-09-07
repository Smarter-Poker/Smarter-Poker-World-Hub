-- =====================================================================
-- 20260907065000_training_cache_drift_audit_performance.sql
-- =====================================================================
-- TIER:        3
-- AUTHOR:      Codex
-- AFFECTS:     training_question_cache, fn_training_cache_run_drift_audit
-- IRREVERSIBLE: no
--
-- WHY:
--   The initial audit re-ran the complete nested policy validator multiple
--   times across the entire cache. The live 27k-row corpus exceeded the
--   PostgREST statement timeout, which made the daily worker fail closed but
--   unable to finish. Writes already pass that complete validator in the
--   cache BEFORE trigger. This migration records that write-time attestation,
--   audits every changed row, checks every solver/chart source every day, and
--   rolls a checksum shard across unchanged rows for bounded drift coverage.
-- =====================================================================

BEGIN;

ALTER TABLE public.training_question_cache
    ADD COLUMN contract_stamped_at timestamptz,
    ADD COLUMN contract_audited_at timestamptz,
    ADD COLUMN audit_shard smallint GENERATED ALWAYS AS (
        (get_byte(decode(md5(question_id), 'hex'), 0) % 16)::smallint
    ) STORED;

-- The expansion migration deliberately retained held rows while the old app
-- was live. Their recovery snapshots already exist; remove them from the main
-- cache before recording the post-backfill audit baseline.
SELECT public.fn_training_cache_quarantine_invalid();

UPDATE public.training_question_cache
SET contract_stamped_at = now(),
    contract_audited_at = now()
WHERE quality_status IN ('active', 'active_fallback');

ALTER TABLE public.training_question_cache
    ALTER COLUMN contract_stamped_at SET DEFAULT now(),
    ALTER COLUMN contract_stamped_at SET NOT NULL,
    ADD CONSTRAINT training_question_cache_audit_shard_check
        CHECK (audit_shard BETWEEN 0 AND 15);

CREATE INDEX training_question_cache_drift_due_idx
    ON public.training_question_cache (contract_audited_at, contract_stamped_at)
    WHERE quality_status IN ('active', 'active_fallback');
CREATE INDEX training_question_cache_audit_shard_idx
    ON public.training_question_cache (audit_shard, quality_status);

CREATE FUNCTION public.fn_training_cache_mark_contract_dirty()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
    NEW.contract_stamped_at := clock_timestamp();
    NEW.contract_audited_at := NULL;
    RETURN NEW;
END;
$$;

-- Trigger order is lexical: truth_stamp validates and normalizes first,
-- this trigger marks the accepted contract dirty, and zz_truth_reject makes
-- the final fail-closed source-artifact check.
CREATE TRIGGER zy_training_question_cache_contract_dirty
BEFORE INSERT OR UPDATE OF
    question_data, canonical_policy, source_classification, question_kind,
    scenario_hash, exact_node, public_action_history, policy_version,
    solver_version, solver_binary_checksum, manifest_version,
    manifest_checksum, source_checksum, pipeline_commit, machine_id,
    source_created_at, source_audited_at, generator_version, lineage,
    content_checksum, policy_checksum
ON public.training_question_cache
FOR EACH ROW EXECUTE FUNCTION public.fn_training_cache_mark_contract_dirty();

-- This helper is intentionally an attestation comparison, not a replacement
-- for fn_training_cache_derive_classification. Full policy validation remains
-- synchronous in fn_training_cache_stamp_row for every write. The daily audit
-- can therefore compare the checksum-sealed label without re-running nested
-- JSON policy loops for every unchanged cache row.
CREATE FUNCTION public.fn_training_cache_attested_classification(
    p_question_kind text,
    p_question jsonb,
    p_policy jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, extensions
AS $$
    SELECT CASE
        WHEN lower(coalesce(p_policy ->> 'kind', '')) = 'heuristic'
         AND (
            upper(coalesce(p_question ->> 'source', ''))
                IN ('MODEL_DISTILLED', 'DISTILLED_MODEL')
            OR upper(coalesce(p_question ->> 'dataQuality', '')) = 'MODEL_DISTILLED'
            OR upper(coalesce(p_question ->> 'sourceClassification', ''))
                = 'MODEL_DISTILLED'
         ) THEN 'MODEL_DISTILLED'
        WHEN upper(coalesce(p_policy ->> 'qualitySeal', '')) IN (
            'SOLVER_EXACT', 'SOLVER_AGGREGATED', 'SOLVER_DERIVED_RESPONSE',
            'CHART_AUDITED', 'CURATED', 'HEURISTIC', 'LEGACY_UNVERIFIED'
        ) THEN upper(p_policy ->> 'qualitySeal')
        WHEN upper(coalesce(p_question ->> 'source', ''))
                IN ('MODEL_DISTILLED', 'DISTILLED_MODEL')
          OR upper(coalesce(p_question ->> 'dataQuality', '')) = 'MODEL_DISTILLED'
          OR upper(coalesce(p_question ->> 'sourceClassification', ''))
                = 'MODEL_DISTILLED' THEN 'MODEL_DISTILLED'
        WHEN upper(coalesce(p_question ->> 'dataQuality', '')) = 'SIMULATED'
          OR upper(coalesce(p_question ->> 'source', ''))
                IN ('POSTFLOP_ENGINE', 'HEURISTIC')
          OR upper(coalesce(p_question ->> 'sourceClassification', ''))
                = 'HEURISTIC' THEN 'HEURISTIC'
        WHEN upper(coalesce(p_question ->> 'source', '')) ~ '(CURATED|SCENARIO|PSYCHOLOGY)'
          OR upper(coalesce(p_question ->> 'type', '')) = 'SCENARIO'
          OR (
              upper(coalesce(p_question_kind, '')) = 'SCENARIO'
              AND upper(coalesce(p_question ->> 'source', ''))
                    NOT IN ('DETERMINISTIC_SOLVER', 'PIO_DATABASE', 'PIO')
          )
          OR upper(coalesce(p_question ->> 'sourceClassification', ''))
                = 'CURATED' THEN 'CURATED'
        ELSE 'LEGACY_UNVERIFIED'
    END
$$;

CREATE OR REPLACE FUNCTION public.fn_training_cache_run_drift_audit(
    p_run_date date DEFAULT (now() AT TIME ZONE 'utc')::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_started timestamptz := clock_timestamp();
    v_shard smallint := mod((p_run_date - DATE '2000-01-01')::integer, 16)::smallint;
    v_inspected integer := 0;
    v_content_drift integer := 0;
    v_policy_drift integer := 0;
    v_classification_drift integer := 0;
    v_source_drift integer := 0;
    v_chart_source_missing integer := 0;
    v_lineage_gaps integer := 0;
    v_counter_drift integer := 0;
    v_counter_repaired integer := 0;
    v_quarantined integer := 0;
    v_active integer := 0;
    v_fallback integer := 0;
    v_status text;
    v_metrics jsonb;
    v_findings jsonb := '[]'::jsonb;
    v_result jsonb;
BEGIN
    IF p_run_date IS NULL THEN
        RAISE EXCEPTION 'training_cache_audit_run_date_required';
    END IF;

    -- Remove previously held rows first. They already have immutable recovery
    -- snapshots and must not consume the bounded checksum budget.
    v_quarantined := public.fn_training_cache_quarantine_invalid();

    WITH candidates AS MATERIALIZED (
        SELECT c.*
        FROM public.training_question_cache c
        WHERE c.quality_status IN ('active', 'active_fallback')
          AND (
              c.contract_audited_at IS NULL
              OR c.contract_stamped_at > c.contract_audited_at
              OR c.audit_shard = v_shard
              OR c.source_classification IN (
                  'SOLVER_EXACT', 'SOLVER_AGGREGATED',
                  'SOLVER_DERIVED_RESPONSE', 'CHART_AUDITED'
              )
          )
    ), inspected AS MATERIALIZED (
        SELECT
            c.id,
            c.content_checksum
                <> encode(extensions.digest(c.question_data::text, 'sha256'), 'hex')
                AS content_drift,
            c.policy_checksum
                <> encode(extensions.digest(c.canonical_policy::text, 'sha256'), 'hex')
                AS policy_drift,
            c.source_classification
                <> public.fn_training_cache_attested_classification(
                    c.question_kind, c.question_data, c.canonical_policy
                ) AS classification_drift,
            c.source_classification IN (
                'SOLVER_EXACT', 'SOLVER_AGGREGATED', 'SOLVER_DERIVED_RESPONSE'
            ) AND (
                c.source_checksum IS NULL
                OR c.scenario_hash IS NULL
                OR NOT EXISTS (
                    SELECT 1 FROM public.solved_spots_gold s
                    WHERE s.scenario_hash = c.scenario_hash
                      AND s.source_artifact_checksum = c.source_checksum
                )
            ) AS source_drift,
            c.source_classification = 'CHART_AUDITED'
            AND (
                c.canonical_policy #>> '{sourceArtifact,system}'
                    <> 'memory_charts_gold'
                OR NOT EXISTS (
                    SELECT 1 FROM public.memory_charts_gold m
                    WHERE m.chart_id::text
                        = c.canonical_policy #>> '{sourceArtifact,artifactId}'
                )
            ) AS chart_source_missing,
            (
                c.canonical_policy IS NULL
                OR c.policy_version IS NULL
                OR c.generator_version IS NULL
                OR c.source_created_at IS NULL
                OR jsonb_typeof(c.lineage) IS DISTINCT FROM 'object'
                OR c.lineage ->> 'contractVersion'
                    IS DISTINCT FROM 'smarter-poker.training-cache-lineage.v1'
                OR c.lineage ->> 'sourceClassification'
                    IS DISTINCT FROM c.source_classification
                OR c.question_data -> 'solverPolicy'
                    IS DISTINCT FROM c.canonical_policy
                OR c.question_data ->> 'sourceClassification'
                    IS DISTINCT FROM c.source_classification
                OR c.question_data ->> 'dataQuality'
                    IS DISTINCT FROM c.source_classification
                OR c.policy_version
                    IS DISTINCT FROM c.canonical_policy ->> 'policyVersion'
                OR c.exact_node IS DISTINCT FROM c.canonical_policy -> 'node'
                OR c.public_action_history
                    IS DISTINCT FROM c.canonical_policy #> '{key,publicActionHistory}'
                OR c.canonical_policy ->> 'contractVersion'
                    IS DISTINCT FROM 'smarter-poker.solver-policy.v1'
                OR jsonb_typeof(c.canonical_policy -> 'actions') IS DISTINCT FROM 'array'
                OR CASE
                    WHEN jsonb_typeof(c.canonical_policy -> 'actions') = 'array'
                    THEN jsonb_array_length(c.canonical_policy -> 'actions') < 1
                    ELSE true
                END
                OR jsonb_typeof(c.canonical_policy -> 'distribution')
                    IS DISTINCT FROM 'object'
                OR NOT coalesce(
                    c.canonical_policy -> 'distribution'
                    ? lower(coalesce(c.question_data ->> 'correctAnswer', '')),
                    false
                )
                OR (
                    c.source_classification = 'SOLVER_EXACT'
                    AND (
                        c.scenario_hash IS NULL
                        OR c.exact_node IS NULL
                        OR c.public_action_history #>> '{complete}' <> 'true'
                        OR c.solver_version IS NULL
                        OR c.solver_binary_checksum IS NULL
                        OR c.manifest_checksum IS NULL
                        OR c.source_checksum IS NULL
                        OR c.pipeline_commit IS NULL
                        OR c.machine_id IS NULL
                    )
                )
            ) AS lineage_gap
        FROM candidates c
    ), marked AS (
        UPDATE public.training_question_cache c
        SET quality_status = 'drifted'
        FROM inspected i
        WHERE c.id = i.id
          AND (
              i.content_drift OR i.policy_drift OR i.classification_drift
              OR i.source_drift OR i.chart_source_missing OR i.lineage_gap
          )
        RETURNING c.id
    ), audited AS (
        UPDATE public.training_question_cache c
        SET contract_audited_at = clock_timestamp()
        FROM inspected i
        WHERE c.id = i.id
          AND NOT (
              i.content_drift OR i.policy_drift OR i.classification_drift
              OR i.source_drift OR i.chart_source_missing OR i.lineage_gap
          )
        RETURNING c.id
    )
    SELECT
        count(*)::integer,
        count(*) FILTER (WHERE content_drift)::integer,
        count(*) FILTER (WHERE policy_drift)::integer,
        count(*) FILTER (WHERE classification_drift)::integer,
        count(*) FILTER (WHERE source_drift)::integer,
        count(*) FILTER (WHERE chart_source_missing)::integer,
        count(*) FILTER (WHERE lineage_gap)::integer
    INTO
        v_inspected, v_content_drift, v_policy_drift,
        v_classification_drift, v_source_drift,
        v_chart_source_missing, v_lineage_gaps
    FROM inspected
    CROSS JOIN (SELECT count(*) FROM marked) AS force_marked;

    v_quarantined := v_quarantined
        + public.fn_training_cache_quarantine_invalid();

    WITH expected AS MATERIALIZED (
        SELECT
            c.question_id,
            count(e.id) FILTER (WHERE e.event_type = 'served')::bigint AS served,
            count(e.id) FILTER (WHERE e.event_type = 'answered')::bigint AS answered,
            count(e.id) FILTER (
                WHERE e.event_type = 'answered' AND e.is_correct
            )::bigint AS correct,
            count(e.id) FILTER (WHERE e.event_type = 'completed')::bigint AS completed,
            max(e.occurred_at) FILTER (WHERE e.event_type = 'served') AS last_served,
            max(e.occurred_at) FILTER (WHERE e.event_type = 'answered') AS last_answered,
            max(e.occurred_at) FILTER (WHERE e.event_type = 'completed') AS last_completed
        FROM public.training_question_cache c
        LEFT JOIN public.training_question_events e ON e.question_id = c.question_id
        GROUP BY c.question_id
    ), drift AS MATERIALIZED (
        SELECT c.question_id
        FROM public.training_question_cache c
        JOIN expected x USING (question_id)
        WHERE (c.served_count, c.answered_count, c.correct_count, c.completed_count)
            IS DISTINCT FROM (x.served, x.answered, x.correct, x.completed)
    ), repaired AS (
        UPDATE public.training_question_cache c
        SET served_count = x.served,
            answered_count = x.answered,
            correct_count = x.correct,
            completed_count = x.completed,
            times_used = least(2147483647, x.served)::integer,
            last_served_at = x.last_served,
            last_answered_at = x.last_answered,
            last_completed_at = x.last_completed
        FROM expected x
        WHERE x.question_id = c.question_id
          AND EXISTS (
              SELECT 1 FROM drift d WHERE d.question_id = c.question_id
          )
        RETURNING c.id
    )
    SELECT
        (SELECT count(*)::integer FROM drift),
        (SELECT count(*)::integer FROM repaired)
    INTO v_counter_drift, v_counter_repaired;

    SELECT count(*) FILTER (WHERE quality_status = 'active'),
           count(*) FILTER (WHERE quality_status = 'active_fallback')
    INTO v_active, v_fallback
    FROM public.training_question_cache;

    IF v_content_drift + v_policy_drift + v_classification_drift + v_source_drift
       + v_chart_source_missing + v_lineage_gaps > 0 THEN
        v_status := 'critical';
    ELSIF v_counter_drift > 0 OR v_quarantined > 0 THEN
        v_status := 'warning';
    ELSE
        v_status := 'healthy';
    END IF;

    v_metrics := jsonb_build_object(
        'activeRows', v_active,
        'fallbackRows', v_fallback,
        'rowsInspected', v_inspected,
        'auditShard', v_shard,
        'auditShardCount', 16,
        'contentDriftRows', v_content_drift,
        'policyDriftRows', v_policy_drift,
        'classificationDriftRows', v_classification_drift,
        'sourceDriftRows', v_source_drift,
        'missingChartSourceRows', v_chart_source_missing,
        'lineageGapRows', v_lineage_gaps,
        'counterDriftRows', v_counter_drift,
        'counterRowsRepaired', v_counter_repaired,
        'rowsQuarantined', v_quarantined
    );
    IF v_content_drift > 0 THEN
        v_findings := v_findings || jsonb_build_array(jsonb_build_object(
            'severity', 'critical', 'code', 'content_checksum_drift',
            'count', v_content_drift
        ));
    END IF;
    IF v_policy_drift > 0 THEN
        v_findings := v_findings || jsonb_build_array(jsonb_build_object(
            'severity', 'critical', 'code', 'policy_checksum_drift',
            'count', v_policy_drift
        ));
    END IF;
    IF v_classification_drift > 0 THEN
        v_findings := v_findings || jsonb_build_array(jsonb_build_object(
            'severity', 'critical', 'code', 'classification_drift',
            'count', v_classification_drift
        ));
    END IF;
    IF v_source_drift + v_chart_source_missing > 0 THEN
        v_findings := v_findings || jsonb_build_array(jsonb_build_object(
            'severity', 'critical', 'code', 'source_artifact_drift',
            'count', v_source_drift + v_chart_source_missing
        ));
    END IF;
    IF v_lineage_gaps > 0 THEN
        v_findings := v_findings || jsonb_build_array(jsonb_build_object(
            'severity', 'critical', 'code', 'lineage_incomplete',
            'count', v_lineage_gaps
        ));
    END IF;
    IF v_counter_drift > 0 THEN
        v_findings := v_findings || jsonb_build_array(jsonb_build_object(
            'severity', 'warning', 'code', 'counter_reconciled',
            'count', v_counter_drift
        ));
    END IF;

    INSERT INTO public.training_cache_audit_runs (
        run_date, status, metrics, findings, run_count, started_at, completed_at
    ) VALUES (
        p_run_date, v_status, v_metrics, v_findings, 1, v_started, clock_timestamp()
    )
    ON CONFLICT (run_date) DO UPDATE
    SET status = EXCLUDED.status,
        metrics = EXCLUDED.metrics,
        findings = EXCLUDED.findings,
        run_count = public.training_cache_audit_runs.run_count + 1,
        started_at = EXCLUDED.started_at,
        completed_at = EXCLUDED.completed_at
    RETURNING jsonb_build_object(
        'runDate', run_date,
        'status', status,
        'metrics', metrics,
        'findings', findings,
        'runCount', run_count,
        'startedAt', started_at,
        'completedAt', completed_at
    ) INTO v_result;
    RETURN v_result;
END;
$$;

COMMENT ON COLUMN public.training_question_cache.contract_stamped_at IS
    'Last write that passed the complete synchronous cache truth validator.';
COMMENT ON COLUMN public.training_question_cache.contract_audited_at IS
    'Last bounded daily audit that rechecked this row after its accepted write.';
COMMENT ON COLUMN public.training_question_cache.audit_shard IS
    'Stable 0-15 checksum shard; every unchanged row is rechecked within 16 daily runs.';

REVOKE ALL ON FUNCTION public.fn_training_cache_mark_contract_dirty()
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_training_cache_attested_classification(text, jsonb, jsonb)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_training_cache_run_drift_audit(date)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_training_cache_run_drift_audit(date)
    TO service_role;

DO $$
DECLARE
    v_bad_rows integer;
BEGIN
    SELECT count(*) INTO v_bad_rows
    FROM public.training_question_cache
    WHERE quality_status NOT IN ('active', 'active_fallback')
       OR contract_stamped_at IS NULL
       OR contract_audited_at IS NULL
       OR audit_shard NOT BETWEEN 0 AND 15;
    IF v_bad_rows <> 0 THEN
        RAISE EXCEPTION 'post-apply failed: % cache rows lack audit attestation', v_bad_rows;
    END IF;
END $$;

COMMIT;

-- ROLLBACK NOTES:
-- DROP TRIGGER IF EXISTS zy_training_question_cache_contract_dirty
--     ON public.training_question_cache;
-- DROP FUNCTION IF EXISTS public.fn_training_cache_mark_contract_dirty();
-- DROP FUNCTION IF EXISTS public.fn_training_cache_attested_classification(text, jsonb, jsonb);
-- DROP INDEX IF EXISTS public.training_question_cache_audit_shard_idx;
-- DROP INDEX IF EXISTS public.training_question_cache_drift_due_idx;
-- ALTER TABLE public.training_question_cache
--     DROP COLUMN IF EXISTS audit_shard,
--     DROP COLUMN IF EXISTS contract_audited_at,
--     DROP COLUMN IF EXISTS contract_stamped_at;

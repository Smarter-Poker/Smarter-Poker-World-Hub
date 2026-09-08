-- =====================================================================
-- 20260907070000_training_cache_truth_enforcement.sql
-- =====================================================================
-- TIER:        3
-- AUTHOR:      Codex
-- AFFECTS:     training cache nullability and answer/session truth triggers
-- IRREVERSIBLE: no
--
-- Apply only after:
--   1. 20260907060000 expansion is live;
--   2. scripts/backfill-training-cache-truth.mjs --apply has completed; and
--   3. the Phase 3 application is serving checksum-bound questions.
--
-- The expansion migration is deliberately compatible with the prior app.
-- This migration closes that rolling-deploy window: every answer and every
-- cache-backed session completion must now carry the exact policy checksum,
-- and Postgres independently recomputes the grade from canonical_policy.
-- =====================================================================

BEGIN;

-- The full policy-shape scan validates every serving row and intentionally
-- exceeds the platform's normal interactive query budget at production scale.
SET LOCAL statement_timeout = '20min';

DO $$
BEGIN
    IF to_regclass('public.training_question_cache') IS NULL
       OR to_regclass('public.training_question_events') IS NULL
       OR to_regclass('public.training_question_cache_quarantine') IS NULL THEN
        RAISE EXCEPTION 'pre-flight failed: training cache truth expansion is not installed';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'training_question_cache'
          AND column_name = 'policy_checksum'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: policy_checksum is missing';
    END IF;
END $$;

-- Any source row the backfill could not restore stays recoverable in the
-- quarantine table and is removed from the serving table before nullability
-- becomes strict.
SELECT public.fn_training_cache_quarantine_invalid();

DO $$
DECLARE
    v_invalid integer;
BEGIN
    SELECT count(*) INTO v_invalid
    FROM public.training_question_cache c
    WHERE c.quality_status NOT IN ('active', 'active_fallback')
       OR c.canonical_policy IS NULL
       OR c.policy_checksum IS NULL
       OR NOT public.fn_training_cache_row_is_valid(
            c.source_classification, c.question_data, c.canonical_policy,
            c.scenario_hash, c.exact_node, c.public_action_history,
            c.policy_version, c.solver_version, c.solver_binary_checksum,
            c.manifest_checksum, c.source_checksum, c.pipeline_commit, c.machine_id
       );
    IF v_invalid <> 0 THEN
        RAISE EXCEPTION 'pre-flight failed: % cache rows were not restored to the truth contract', v_invalid;
    END IF;
END $$;

ALTER TABLE public.training_question_cache
    ALTER COLUMN canonical_policy SET NOT NULL,
    ALTER COLUMN policy_checksum SET NOT NULL;

-- Database-side counterpart of gradeCanonicalPolicyDecision(). Frequencies in
-- canonical_policy are 0..1; public answer analytics retain their historical
-- percentage representation (0..100).
CREATE OR REPLACE FUNCTION public.fn_training_cache_grade(
    p_policy jsonb,
    p_answer_id text
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, extensions
AS $$
DECLARE
    v_answer text := lower(nullif(btrim(p_answer_id), ''));
    v_selected numeric;
    v_optimal numeric;
    v_optimal_action text;
    v_nonzero integer;
    v_classification text;
    v_is_correct boolean;
    v_solver_verified boolean;
    v_selected_ev numeric;
    v_optimal_ev numeric;
    v_ev_measured boolean := false;
    v_ev_loss numeric;
BEGIN
    IF NOT public.fn_training_cache_policy_seal_is_valid(p_policy)
       OR v_answer IS NULL
       OR jsonb_typeof(p_policy -> 'distribution' -> v_answer) <> 'number' THEN
        RETURN jsonb_build_object('valid', false);
    END IF;

    v_selected := (p_policy -> 'distribution' ->> v_answer)::numeric;
    SELECT
        (entry.value #>> '{}')::numeric,
        entry.key
    INTO v_optimal, v_optimal_action
    FROM jsonb_each(p_policy -> 'distribution') AS entry(key, value)
    ORDER BY (entry.value #>> '{}')::numeric DESC, entry.key ASC
    LIMIT 1;
    SELECT count(*)::integer INTO v_nonzero
    FROM jsonb_each(p_policy -> 'distribution') AS entry(key, value)
    WHERE (entry.value #>> '{}')::numeric > 0;

    v_classification := CASE
        WHEN v_selected >= v_optimal - 0.000000001 THEN 'best'
        WHEN v_selected >= 0.20 THEN 'best'
        WHEN v_selected >= 0.05 THEN 'correct'
        WHEN v_selected >= 0.01 THEN 'inaccuracy'
        WHEN v_optimal >= 0.80 OR v_nonzero <= 1 THEN 'blunder'
        ELSE 'wrong'
    END;
    v_is_correct := v_classification IN ('best', 'correct');
    v_solver_verified := upper(p_policy ->> 'qualitySeal') IN (
        'SOLVER_EXACT', 'SOLVER_AGGREGATED',
        'SOLVER_DERIVED_RESPONSE', 'CHART_AUDITED'
    );

    IF p_policy #>> '{chipEv,measuredByAction}' = 'true'
       AND NOT EXISTS (
           SELECT 1
           FROM jsonb_object_keys(p_policy -> 'distribution') AS action_id(id)
           WHERE jsonb_typeof(p_policy #> ARRAY['chipEv', 'byAction', action_id.id]) <> 'number'
       ) THEN
        v_selected_ev := (p_policy #>> ARRAY['chipEv', 'byAction', v_answer])::numeric;
        SELECT max((entry.value #>> '{}')::numeric) INTO v_optimal_ev
        FROM jsonb_each(p_policy #> '{chipEv,byAction}') AS entry(key, value);
        v_ev_measured := v_selected_ev IS NOT NULL AND v_optimal_ev IS NOT NULL;
        IF v_ev_measured THEN
            v_ev_loss := greatest(0, v_optimal_ev - v_selected_ev);
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'valid', true,
        'classification', v_classification,
        'isCorrect', v_is_correct,
        'solverVerified', v_solver_verified,
        'selectedFrequency', round(v_selected * 100, 2),
        'optimalFrequency', round(v_optimal * 100, 2),
        'optimalAction', v_optimal_action,
        'evLossMeasured', v_ev_measured,
        'evLoss', CASE WHEN v_ev_measured THEN round(v_ev_loss, 3) ELSE NULL END,
        'policyVersion', p_policy ->> 'policyVersion',
        'solverSource', p_policy #>> '{sourceArtifact,system}',
        'sourceChecksum', p_policy #>> '{sourceArtifact,sourceArtifactChecksum}'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_training_answer_cache_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_cache public.training_question_cache%ROWTYPE;
    v_checksum text := lower(coalesce(NEW.evidence_metadata ->> 'policyChecksum', ''));
    v_grade jsonb;
    v_expected_verified boolean;
    v_expected_ev_measured boolean;
BEGIN
    IF v_checksum !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'training_answer_missing_policy_checksum';
    END IF;
    SELECT * INTO v_cache
    FROM public.training_question_cache c
    WHERE c.question_id = NEW.question_id
      AND c.quality_status IN ('active', 'active_fallback');
    IF v_cache.id IS NULL THEN
        RAISE EXCEPTION 'training_answer_question_not_active';
    END IF;
    IF v_checksum <> v_cache.policy_checksum THEN
        RAISE EXCEPTION 'training_answer_stale_policy';
    END IF;

    v_grade := public.fn_training_cache_grade(v_cache.canonical_policy, NEW.answer_id);
    IF coalesce((v_grade ->> 'valid')::boolean, false) = false THEN
        RAISE EXCEPTION 'training_answer_not_in_canonical_policy';
    END IF;
    v_expected_verified := (v_grade ->> 'solverVerified')::boolean;
    v_expected_ev_measured := (v_grade ->> 'evLossMeasured')::boolean;

    IF NEW.is_correct IS DISTINCT FROM (v_grade ->> 'isCorrect')::boolean
       OR lower(coalesce(NEW.classification, '')) <> v_grade ->> 'classification'
       OR NEW.solver_verified IS DISTINCT FROM v_expected_verified THEN
        RAISE EXCEPTION 'training_answer_grade_mismatch';
    END IF;
    IF v_expected_verified THEN
        IF NEW.selected_frequency IS NULL OR NEW.optimal_frequency IS NULL
           OR abs(NEW.selected_frequency - (v_grade ->> 'selectedFrequency')::numeric) > 0.000001
           OR abs(NEW.optimal_frequency - (v_grade ->> 'optimalFrequency')::numeric) > 0.000001
           OR coalesce(NEW.solver_source, '') <> coalesce(v_grade ->> 'solverSource', '') THEN
            RAISE EXCEPTION 'training_answer_solver_evidence_mismatch';
        END IF;
    ELSIF NEW.selected_frequency IS NOT NULL
       OR NEW.optimal_frequency IS NOT NULL
       OR NEW.solver_source IS NOT NULL THEN
        RAISE EXCEPTION 'training_answer_fallback_claims_solver_evidence';
    END IF;
    IF NEW.ev_loss_measured IS DISTINCT FROM v_expected_ev_measured
       OR (v_expected_ev_measured AND (
            NEW.ev_loss IS NULL
            OR abs(NEW.ev_loss - (v_grade ->> 'evLoss')::numeric) > 0.000001
       ))
       OR (NOT v_expected_ev_measured AND coalesce(NEW.ev_loss, 0) <> 0) THEN
        RAISE EXCEPTION 'training_answer_ev_evidence_mismatch';
    END IF;
    IF coalesce(NEW.evidence_metadata ->> 'policyVersion', '')
            <> v_cache.policy_version
       OR coalesce(NEW.evidence_metadata ->> 'dataQuality', '')
            <> v_cache.source_classification
       OR (
            v_expected_verified
            AND coalesce(NEW.evidence_metadata ->> 'sourceChecksum', '')
                <> coalesce(v_grade ->> 'sourceChecksum', '')
       ) THEN
        RAISE EXCEPTION 'training_answer_lineage_mismatch';
    END IF;

    PERFORM public.fn_training_cache_record_event(
        'answered',
        'training-answer:' || NEW.id::text,
        NEW.question_id,
        NEW.user_id,
        (v_grade ->> 'isCorrect')::boolean,
        jsonb_build_object(
            'answerId', NEW.id,
            'submissionId', NEW.submission_id,
            'classification', v_grade ->> 'classification',
            'solverVerified', v_expected_verified,
            'selectedFrequency', v_grade -> 'selectedFrequency',
            'optimalFrequency', v_grade -> 'optimalFrequency',
            'evLossMeasured', v_expected_ev_measured,
            'evLoss', v_grade -> 'evLoss'
        ),
        coalesce(NEW.answered_at, now()),
        v_checksum
    );
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_training_session_cache_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_question_id text;
    v_policy_checksum text;
    v_history jsonb := CASE WHEN jsonb_typeof(NEW.hand_history) = 'array'
        THEN NEW.hand_history ELSE '[]'::jsonb END;
BEGIN
    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_history) AS entry(value)
        CROSS JOIN LATERAL (VALUES (coalesce(
            nullif(entry.value ->> 'questionId', ''),
            nullif(entry.value #>> '{handData,questionId}', '')
        ))) AS resolved(question_id)
        WHERE question_id IS NOT NULL
          AND coalesce(
              nullif(entry.value ->> 'policyChecksum', ''),
              nullif(entry.value #>> '{handData,policyChecksum}', ''),
              ''
          ) !~ '^[0-9a-f]{64}$'
    ) THEN
        RAISE EXCEPTION 'training_session_question_missing_policy_checksum';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_history) AS entry(value)
        CROSS JOIN LATERAL (VALUES (coalesce(
            nullif(entry.value ->> 'questionId', ''),
            nullif(entry.value #>> '{handData,questionId}', '')
        ))) AS resolved(question_id)
        WHERE question_id IS NOT NULL
        GROUP BY question_id
        HAVING count(DISTINCT nullif(coalesce(
            entry.value ->> 'policyChecksum',
            entry.value #>> '{handData,policyChecksum}'
        ), '')) > 1
    ) THEN
        RAISE EXCEPTION 'training_session_contains_conflicting_policy_checksums';
    END IF;

    FOR v_question_id, v_policy_checksum IN
        SELECT
            question_id,
            max(nullif(coalesce(
                entry.value ->> 'policyChecksum',
                entry.value #>> '{handData,policyChecksum}'
            ), '')) AS policy_checksum
        FROM jsonb_array_elements(v_history) AS entry(value)
        CROSS JOIN LATERAL (VALUES (coalesce(
            nullif(entry.value ->> 'questionId', ''),
            nullif(entry.value #>> '{handData,questionId}', '')
        ))) AS resolved(question_id)
        WHERE question_id IS NOT NULL
        GROUP BY question_id
    LOOP
        PERFORM public.fn_training_cache_record_event(
            'completed',
            'training-session:' || NEW.id::text || ':'
                || encode(extensions.digest(v_question_id, 'sha256'), 'hex'),
            v_question_id,
            NEW.user_id,
            NULL,
            jsonb_build_object(
                'sessionId', NEW.id,
                'gameId', NEW.game_id,
                'policyChecksum', v_policy_checksum
            ),
            coalesce(NEW.created_at, now()),
            v_policy_checksum
        );
    END LOOP;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_training_cache_grade(jsonb, text)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_training_answer_cache_event()
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_training_session_cache_completion()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_training_cache_grade(jsonb, text)
    TO service_role;

DO $$
DECLARE
    v_bad integer;
BEGIN
    SELECT count(*) INTO v_bad
    FROM public.training_question_cache c
    WHERE c.quality_status NOT IN ('active', 'active_fallback')
       OR c.canonical_policy IS NULL
       OR c.policy_checksum IS NULL
       OR c.policy_checksum <> encode(
            extensions.digest(c.canonical_policy::text, 'sha256'), 'hex'
       )
       OR c.content_checksum <> encode(
            extensions.digest(c.question_data::text, 'sha256'), 'hex'
       )
       OR c.source_classification <> public.fn_training_cache_derive_classification(
            c.question_kind, c.question_data, c.canonical_policy
       )
       OR NOT public.fn_training_cache_row_is_valid(
            c.source_classification, c.question_data, c.canonical_policy,
            c.scenario_hash, c.exact_node, c.public_action_history,
            c.policy_version, c.solver_version, c.solver_binary_checksum,
            c.manifest_checksum, c.source_checksum, c.pipeline_commit, c.machine_id
       );
    IF v_bad <> 0 THEN
        RAISE EXCEPTION 'post-apply failed: % serving rows violate the truth contract', v_bad;
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'training_question_cache'
          AND column_name IN ('canonical_policy', 'policy_checksum')
          AND is_nullable = 'YES'
    ) THEN
        RAISE EXCEPTION 'post-apply failed: strict policy columns remain nullable';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

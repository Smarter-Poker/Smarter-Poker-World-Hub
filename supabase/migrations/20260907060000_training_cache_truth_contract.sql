-- =====================================================================
-- 20260907060000_training_cache_truth_contract.sql
-- =====================================================================
-- TIER:        3
-- AUTHOR:      Codex
-- AFFECTS:     training_question_cache, training_question_cache_quarantine,
--              training_question_events, training_cache_audit_runs,
--              training_answers and training_sessions triggers, cache RPCs
-- IRREVERSIBLE: no
--
-- WHY:
--   The live Training cache overloaded engine_type='PIO' as both a routing
--   family and a provenance claim. On 2026-09-07, 21,354 of 27,648 rows used
--   that label while zero had a complete solver provenance seal. Reads also
--   incremented times_used with a read/modify/write race, and answer grading
--   trusted the cached question envelope instead of an immutable canonical
--   policy artifact. This migration makes source truth explicit, moves unsafe
--   rows into recoverable quarantine, and makes usage accounting atomic.
--
-- HOW (high level):
--   - Add the eight-value public source taxonomy and complete lineage fields.
--   - Stamp every row from canonical policy/source evidence and quarantine any
--     raw row that cannot satisfy either a policy or explicit fallback contract.
--   - Add an immutable event ledger with atomic served/answered/correct/
--     completed counters and automatic answer/session triggers.
--   - Add a daily drift audit RPC that compares cache content, policy lineage,
--     source artifacts, and event-ledger counters, repairing counters from the
--     ledger and quarantining drifted policy rows.
-- =====================================================================

BEGIN;

-- 1. PRE-FLIGHT ASSERTIONS
DO $$
BEGIN
    IF to_regclass('public.training_question_cache') IS NULL THEN
        RAISE EXCEPTION 'pre-flight failed: public.training_question_cache not found';
    END IF;
    IF to_regclass('public.training_answers') IS NULL THEN
        RAISE EXCEPTION 'pre-flight failed: public.training_answers not found';
    END IF;
    IF to_regclass('public.training_sessions') IS NULL THEN
        RAISE EXCEPTION 'pre-flight failed: public.training_sessions not found';
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'training_question_cache'
          AND column_name = 'source_classification'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: source_classification already exists';
    END IF;
END $$;

-- 2. CACHE CONTRACT COLUMNS
ALTER TABLE public.training_question_cache
    ADD COLUMN question_kind text,
    ADD COLUMN source_classification text,
    ADD COLUMN canonical_policy jsonb,
    ADD COLUMN scenario_hash text,
    ADD COLUMN exact_node jsonb,
    ADD COLUMN public_action_history jsonb,
    ADD COLUMN policy_version text,
    ADD COLUMN solver_version text,
    ADD COLUMN solver_binary_checksum text,
    ADD COLUMN manifest_version text,
    ADD COLUMN manifest_checksum text,
    ADD COLUMN source_checksum text,
    ADD COLUMN pipeline_commit text,
    ADD COLUMN machine_id text,
    ADD COLUMN quality_status text,
    ADD COLUMN source_created_at timestamptz,
    ADD COLUMN source_audited_at timestamptz,
    ADD COLUMN generator_version text,
    ADD COLUMN lineage jsonb,
    ADD COLUMN content_checksum text,
    ADD COLUMN policy_checksum text,
    ADD COLUMN served_count bigint NOT NULL DEFAULT 0,
    ADD COLUMN answered_count bigint NOT NULL DEFAULT 0,
    ADD COLUMN correct_count bigint NOT NULL DEFAULT 0,
    ADD COLUMN completed_count bigint NOT NULL DEFAULT 0,
    ADD COLUMN last_served_at timestamptz,
    ADD COLUMN last_answered_at timestamptz,
    ADD COLUMN last_completed_at timestamptz;

COMMENT ON COLUMN public.training_question_cache.engine_type IS
    'Legacy routing family only (PIO, CHART, SCENARIO). Never use as provenance or UI copy.';
COMMENT ON COLUMN public.training_question_cache.question_kind IS
    'Routing family preserved separately from source_classification during the legacy transition.';
COMMENT ON COLUMN public.training_question_cache.source_classification IS
    'Public mutually exclusive provenance taxonomy; derived from canonical policy/source evidence.';
COMMENT ON COLUMN public.training_question_cache.canonical_policy IS
    'Server-authored solver-policy envelope used for grading. Cached prose is never grading authority.';
COMMENT ON COLUMN public.training_question_cache.content_checksum IS
    'SHA-256 of the canonical question_data jsonb text after database stamping.';
COMMENT ON COLUMN public.training_question_cache.policy_checksum IS
    'SHA-256 of the canonical grading policy jsonb text after database stamping.';
COMMENT ON COLUMN public.training_question_cache.times_used IS
    'Legacy mirror of served_count. New writes use training_question_events and atomic RPCs.';

CREATE TABLE public.training_question_cache_quarantine (
    original_id uuid PRIMARY KEY,
    question_id text NOT NULL,
    game_id text NOT NULL,
    source_classification text NOT NULL,
    quarantine_reason text NOT NULL,
    original_row jsonb NOT NULL,
    quarantined_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX training_cache_quarantine_question_idx
    ON public.training_question_cache_quarantine (question_id);
CREATE INDEX training_cache_quarantine_reason_time_idx
    ON public.training_question_cache_quarantine (quarantine_reason, quarantined_at DESC);

CREATE TABLE public.training_question_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type text NOT NULL,
    event_key text NOT NULL,
    question_id text NOT NULL,
    user_id uuid,
    is_correct boolean,
    policy_checksum text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT training_question_events_type_check
        CHECK (event_type IN ('served', 'answered', 'completed')),
    CONSTRAINT training_question_events_answer_check
        CHECK ((event_type = 'answered' AND is_correct IS NOT NULL)
            OR (event_type <> 'answered' AND is_correct IS NULL)),
    CONSTRAINT training_question_events_policy_checksum_check
        CHECK (policy_checksum ~ '^[0-9a-f]{64}$'),
    CONSTRAINT training_question_events_key_length_check
        CHECK (length(event_key) BETWEEN 1 AND 320
            AND length(question_id) BETWEEN 1 AND 180),
    CONSTRAINT training_question_events_key_unique UNIQUE (event_type, event_key)
);

CREATE INDEX training_question_events_question_time_idx
    ON public.training_question_events (question_id, occurred_at DESC);
CREATE INDEX training_question_events_user_time_idx
    ON public.training_question_events (user_id, occurred_at DESC)
    WHERE user_id IS NOT NULL;

CREATE TABLE public.training_cache_audit_runs (
    run_date date PRIMARY KEY,
    status text NOT NULL,
    metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
    findings jsonb NOT NULL DEFAULT '[]'::jsonb,
    run_count integer NOT NULL DEFAULT 1,
    started_at timestamptz NOT NULL,
    completed_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT training_cache_audit_status_check
        CHECK (status IN ('healthy', 'warning', 'critical')),
    CONSTRAINT training_cache_audit_run_count_check CHECK (run_count > 0)
);

ALTER TABLE public.training_question_cache_quarantine ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_question_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_cache_audit_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY training_cache_quarantine_service_role
    ON public.training_question_cache_quarantine
    FOR SELECT TO service_role USING (true);
CREATE POLICY training_question_events_service_role
    ON public.training_question_events
    FOR SELECT TO service_role USING (true);
CREATE POLICY training_cache_audit_runs_service_role
    ON public.training_cache_audit_runs
    FOR SELECT TO service_role USING (true);

REVOKE ALL ON public.training_question_cache_quarantine FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.training_question_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.training_cache_audit_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.training_question_cache_quarantine TO service_role;
GRANT SELECT ON public.training_question_events TO service_role;
GRANT SELECT ON public.training_cache_audit_runs TO service_role;

-- 3. FAIL-CLOSED DERIVATION AND VALIDATION HELPERS
CREATE FUNCTION public.fn_training_cache_has_distribution(p_question jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, extensions
AS $$
DECLARE
    v_entry record;
BEGIN
    IF jsonb_typeof(p_question) <> 'object' THEN RETURN false; END IF;
    IF jsonb_typeof(p_question -> 'gtoFrequencies') = 'object' THEN
        FOR v_entry IN SELECT * FROM jsonb_each(p_question -> 'gtoFrequencies') LOOP
            IF jsonb_typeof(v_entry.value) = 'number'
               AND (v_entry.value #>> '{}')::numeric > 0 THEN
                RETURN true;
            END IF;
        END LOOP;
    END IF;
    IF jsonb_typeof(p_question -> 'options') = 'array' THEN
        FOR v_entry IN SELECT value FROM jsonb_array_elements(p_question -> 'options') LOOP
            IF jsonb_typeof(v_entry.value -> 'frequency') = 'number'
               AND (v_entry.value ->> 'frequency')::numeric > 0 THEN
                RETURN true;
            END IF;
        END LOOP;
    END IF;
    RETURN false;
END;
$$;

CREATE FUNCTION public.fn_training_cache_policy_seal_is_valid(p_policy jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, extensions
AS $$
DECLARE
    v_action jsonb;
    v_distribution record;
    v_action_ids text[] := ARRAY[]::text[];
    v_action_id text;
    v_frequency numeric;
    v_distribution_frequency numeric;
    v_sum numeric := 0;
    v_distribution_count integer := 0;
    v_expected_board_count integer;
    v_expected_holding_count integer;
BEGIN
    IF jsonb_typeof(p_policy) <> 'object'
       OR p_policy ->> 'contractVersion' <> 'smarter-poker.solver-policy.v1'
       OR nullif(p_policy ->> 'policyVersion', '') IS NULL
       OR jsonb_typeof(p_policy -> 'key') <> 'object'
       OR jsonb_typeof(p_policy -> 'node') <> 'object'
       OR jsonb_typeof(p_policy -> 'actions') <> 'array'
       OR jsonb_typeof(p_policy -> 'distribution') <> 'object'
       OR jsonb_typeof(p_policy -> 'legalSizes') <> 'array'
       OR jsonb_typeof(p_policy -> 'chipEv') <> 'object'
       OR jsonb_typeof(p_policy -> 'tournamentUtilityEv') <> 'object'
       OR jsonb_typeof(p_policy -> 'sourceArtifact') <> 'object'
       OR jsonb_typeof(p_policy -> 'validDomain') <> 'object'
       OR jsonb_typeof(p_policy -> 'confidence') <> 'object' THEN
        RETURN false;
    END IF;
    IF jsonb_array_length(p_policy -> 'actions') = 0 THEN RETURN false; END IF;
    IF NOT (CASE p_policy ->> 'kind'
        WHEN 'exact' THEN p_policy ->> 'qualitySeal' = 'SOLVER_EXACT'
        WHEN 'aggregated' THEN p_policy ->> 'qualitySeal' = 'SOLVER_AGGREGATED'
        WHEN 'derived' THEN p_policy ->> 'qualitySeal'
            IN ('SOLVER_DERIVED_RESPONSE', 'LEGACY_UNVERIFIED')
        WHEN 'chart' THEN p_policy ->> 'qualitySeal' = 'CHART_AUDITED'
        WHEN 'curated' THEN p_policy ->> 'qualitySeal' = 'CURATED'
        WHEN 'heuristic' THEN p_policy ->> 'qualitySeal' = 'HEURISTIC'
        ELSE false
    END) THEN
        RETURN false;
    END IF;

    FOR v_action IN SELECT value FROM jsonb_array_elements(p_policy -> 'actions') LOOP
        v_action_id := nullif(btrim(v_action ->> 'id'), '');
        IF jsonb_typeof(v_action) <> 'object'
           OR v_action_id IS NULL
           OR v_action_id = ANY(v_action_ids)
           OR jsonb_typeof(v_action -> 'frequency') <> 'number'
           OR jsonb_typeof(v_action -> 'legal') <> 'boolean'
           OR jsonb_typeof(v_action -> 'size') <> 'object' THEN
            RETURN false;
        END IF;
        v_frequency := (v_action ->> 'frequency')::numeric;
        IF v_frequency < 0 OR v_frequency > 1 THEN RETURN false; END IF;
        IF jsonb_typeof(p_policy -> 'distribution' -> v_action_id) <> 'number' THEN
            RETURN false;
        END IF;
        v_distribution_frequency := (p_policy -> 'distribution' ->> v_action_id)::numeric;
        IF abs(v_distribution_frequency - v_frequency) > 0.000000001 THEN
            RETURN false;
        END IF;
        v_action_ids := array_append(v_action_ids, v_action_id);
        v_sum := v_sum + v_frequency;
    END LOOP;

    FOR v_distribution IN SELECT * FROM jsonb_each(p_policy -> 'distribution') LOOP
        IF NOT (v_distribution.key = ANY(v_action_ids))
           OR jsonb_typeof(v_distribution.value) <> 'number' THEN
            RETURN false;
        END IF;
        v_distribution_count := v_distribution_count + 1;
    END LOOP;
    IF v_distribution_count <> coalesce(array_length(v_action_ids, 1), 0)
       OR abs(v_sum - 1) > 0.000001 THEN
        RETURN false;
    END IF;

    IF p_policy ->> 'kind' = 'exact' THEN
        v_expected_board_count := CASE p_policy #>> '{key,street}'
            WHEN 'preflop' THEN 0 WHEN 'flop' THEN 3 WHEN 'turn' THEN 4
            WHEN 'river' THEN 5 ELSE NULL END;
        v_expected_holding_count := CASE p_policy #>> '{key,variant}'
            WHEN 'nlh' THEN 2 WHEN 'short_deck' THEN 2 WHEN 'pineapple' THEN 3
            WHEN 'plo4' THEN 4 WHEN 'plo5' THEN 5 WHEN 'plo6' THEN 6
            WHEN 'plo8' THEN 4 ELSE NULL END;
        IF v_expected_board_count IS NULL OR v_expected_holding_count IS NULL
           OR p_policy #>> '{sourceArtifact,provenanceComplete}' <> 'true'
           OR lower(coalesce(p_policy #>> '{sourceArtifact,system}', '')) IN ('', 'none')
           OR nullif(p_policy #>> '{sourceArtifact,artifactId}', '') IS NULL
           OR nullif(p_policy #>> '{sourceArtifact,scenarioHash}', '') IS NULL
           OR nullif(p_policy #>> '{sourceArtifact,solverVersion}', '') IS NULL
           OR coalesce(p_policy #>> '{sourceArtifact,solverBinaryChecksum}', '')
                !~ '^[0-9a-fA-F]{64}$'
           OR nullif(p_policy #>> '{sourceArtifact,machineId}', '') IS NULL
           OR coalesce(p_policy #>> '{sourceArtifact,pipelineCommit}', '')
                !~ '^[0-9a-fA-F]{40}$'
           OR nullif(p_policy #>> '{sourceArtifact,manifestVersion}', '') IS NULL
           OR coalesce(p_policy #>> '{sourceArtifact,manifestChecksum}', '')
                !~ '^[0-9a-fA-F]{64}$'
           OR coalesce(p_policy #>> '{sourceArtifact,sourceArtifactChecksum}', '')
                !~ '^[0-9a-fA-F]{64}$'
           OR lower(coalesce(p_policy #>> '{sourceArtifact,qualityStatus}', '')) <> 'validated'
           OR public.fn_training_cache_try_timestamptz(
                p_policy #>> '{sourceArtifact,auditedAt}'
              ) IS NULL
           OR p_policy #>> '{validDomain,completeKey}' <> 'true'
           OR p_policy -> 'validDomain' -> 'exactMatchDimensions' <> '["all"]'::jsonb
           OR p_policy -> 'validDomain' -> 'approximatedDimensions' <> '[]'::jsonb
           OR p_policy -> 'validDomain' -> 'exclusions' <> '[]'::jsonb
           OR coalesce(p_policy -> 'fallbackReason', '"missing"'::jsonb) <> 'null'::jsonb
           OR p_policy #>> '{key,contractVersion}' <> 'smarter-poker.solver-policy.v1'
           OR coalesce(p_policy #>> '{key,bettingStructure}', 'unknown') = 'unknown'
           OR coalesce(p_policy #>> '{key,tableSize}', '') !~ '^[2-9][0-9]*$'
           OR coalesce(p_policy #>> '{key,positions,hero}', 'UNKNOWN') = 'UNKNOWN'
           OR coalesce(p_policy #>> '{key,positions,button}', 'UNKNOWN') = 'UNKNOWN'
           OR coalesce(p_policy #>> '{key,positions,smallBlind}', 'UNKNOWN') = 'UNKNOWN'
           OR coalesce(p_policy #>> '{key,positions,bigBlind}', 'UNKNOWN') = 'UNKNOWN'
           OR jsonb_typeof(p_policy #> '{key,positions,villains}') <> 'array'
           OR jsonb_array_length(p_policy #> '{key,positions,villains}') < 1
           OR jsonb_typeof(p_policy #> '{key,stackVector}') <> 'array'
           OR jsonb_array_length(p_policy #> '{key,stackVector}')
                <> (p_policy #>> '{key,tableSize}')::integer
           OR p_policy #>> '{key,blinds,complete}' <> 'true'
           OR jsonb_typeof(p_policy #> '{key,blinds,bigBlind}') <> 'number'
           OR (p_policy #>> '{key,blinds,bigBlind}')::numeric <= 0
           OR p_policy #>> '{key,rake,complete}' <> 'true'
           OR p_policy #>> '{key,tournamentUtility,complete}' <> 'true'
           OR jsonb_typeof(p_policy #> '{key,board}') <> 'array'
           OR jsonb_array_length(p_policy #> '{key,board}') <> v_expected_board_count
           OR jsonb_typeof(p_policy #> '{key,holding}') <> 'array'
           OR jsonb_array_length(p_policy #> '{key,holding}') <> v_expected_holding_count
           OR p_policy #>> '{key,publicActionHistory,complete}' <> 'true'
           OR (v_expected_board_count > 0
               AND jsonb_array_length(p_policy #> '{key,publicActionHistory,actions}') = 0)
           OR jsonb_typeof(p_policy #> '{key,legalActions}') <> 'array'
           OR jsonb_array_length(p_policy #> '{key,legalActions}') = 0
           OR p_policy #>> '{key,sidePotEligibility,complete}' <> 'true'
           OR jsonb_typeof(p_policy #> '{key,payouts}') <> 'array'
           OR jsonb_typeof(p_policy #> '{key,bounties}') <> 'array'
           OR (p_policy #>> '{key,tournamentUtility,mode}' <> 'cash'
               AND jsonb_array_length(p_policy #> '{key,payouts}') = 0)
           OR EXISTS (
                SELECT 1
                FROM (
                    SELECT value #>> '{}' AS card
                    FROM jsonb_array_elements(p_policy #> '{key,board}')
                    UNION ALL
                    SELECT value #>> '{}'
                    FROM jsonb_array_elements(p_policy #> '{key,holding}')
                ) AS cards
                WHERE card !~ '^[2-9TJQKA][cdhs]$'
           )
           OR (
                SELECT count(*) <> count(DISTINCT card)
                FROM (
                    SELECT value #>> '{}' AS card
                    FROM jsonb_array_elements(p_policy #> '{key,board}')
                    UNION ALL
                    SELECT value #>> '{}'
                    FROM jsonb_array_elements(p_policy #> '{key,holding}')
                ) AS cards
           ) THEN
            RETURN false;
        END IF;

        FOR v_action IN SELECT value FROM jsonb_array_elements(p_policy -> 'actions') LOOP
            IF v_action ->> 'legal' <> 'true'
               OR nullif(v_action ->> 'family', '') IS NULL
               OR jsonb_typeof(v_action -> 'size') <> 'object'
               OR NOT EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(p_policy #> '{key,legalActions}') AS legal(value)
                    WHERE legal.value ->> 'action' = v_action ->> 'family'
                       OR ((v_action ->> 'family') = 'all_in'
                           AND legal.value ->> 'allIn' = 'true')
               ) THEN
                RETURN false;
            END IF;
            IF v_action ->> 'family' IN ('bet', 'raise', 'all_in') THEN
                IF v_action #>> '{size,exact}' <> 'true'
                   OR jsonb_typeof(v_action #> '{size,chips}') <> 'number'
                   OR jsonb_typeof(v_action #> '{size,bigBlinds}') <> 'number'
                   OR jsonb_typeof(v_action #> '{size,potFraction}') <> 'number'
                   OR (v_action #>> '{size,chips}')::numeric < 0
                   OR (v_action #>> '{size,bigBlinds}')::numeric < 0
                   OR (v_action #>> '{size,potFraction}')::numeric < 0
                   OR abs(
                        (v_action #>> '{size,chips}')::numeric
                        / (p_policy #>> '{key,blinds,bigBlind}')::numeric
                        - (v_action #>> '{size,bigBlinds}')::numeric
                      ) > 0.000001
                   OR jsonb_typeof(p_policy #> '{node,potBb}') <> 'number'
                   OR (p_policy #>> '{node,potBb}')::numeric <= 0
                   OR abs(
                        (v_action #>> '{size,bigBlinds}')::numeric
                        / (p_policy #>> '{node,potBb}')::numeric
                        - (v_action #>> '{size,potFraction}')::numeric
                      ) > 0.000001 THEN
                    RETURN false;
                END IF;
            ELSIF v_action ->> 'family' IN ('fold', 'check', 'call') THEN
                IF v_action #>> '{size,unit}' <> 'none'
                   OR v_action #>> '{size,exact}' <> 'false'
                   OR v_action #> '{size,chips}' <> 'null'::jsonb
                   OR v_action #> '{size,bigBlinds}' <> 'null'::jsonb
                   OR v_action #> '{size,potFraction}' <> 'null'::jsonb THEN
                    RETURN false;
                END IF;
            ELSE
                RETURN false;
            END IF;
        END LOOP;
    END IF;
    RETURN true;
END;
$$;

CREATE FUNCTION public.fn_training_cache_derive_classification(
    p_question_kind text,
    p_question jsonb,
    p_policy jsonb
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, extensions
AS $$
DECLARE
    v_source text := upper(coalesce(p_question ->> 'source', ''));
    v_type text := upper(coalesce(p_question ->> 'type', ''));
    v_quality text := upper(coalesce(p_question ->> 'dataQuality', ''));
    v_declared text := upper(coalesce(p_question ->> 'sourceClassification', ''));
    v_seal text := upper(coalesce(p_policy ->> 'qualitySeal', ''));
    v_kind text := lower(coalesce(p_policy ->> 'kind', ''));
    v_policy_valid boolean := public.fn_training_cache_policy_seal_is_valid(p_policy);
BEGIN
    IF v_policy_valid THEN
        IF v_kind = 'heuristic'
           AND (v_source IN ('MODEL_DISTILLED', 'DISTILLED_MODEL')
                OR v_quality = 'MODEL_DISTILLED'
                OR v_declared = 'MODEL_DISTILLED') THEN
            RETURN 'MODEL_DISTILLED';
        END IF;
        IF v_seal IN (
            'SOLVER_EXACT', 'SOLVER_AGGREGATED', 'SOLVER_DERIVED_RESPONSE',
            'CHART_AUDITED', 'CURATED', 'HEURISTIC', 'LEGACY_UNVERIFIED'
        ) THEN
            RETURN v_seal;
        END IF;
    END IF;

    IF v_source IN ('MODEL_DISTILLED', 'DISTILLED_MODEL')
       OR v_quality = 'MODEL_DISTILLED'
       OR v_declared = 'MODEL_DISTILLED' THEN
        RETURN 'MODEL_DISTILLED';
    END IF;
    IF v_quality = 'SIMULATED'
       OR v_source IN ('POSTFLOP_ENGINE', 'HEURISTIC')
       OR v_declared = 'HEURISTIC' THEN
        RETURN 'HEURISTIC';
    END IF;
    IF public.fn_training_cache_has_distribution(p_question)
       AND v_source IN ('CHART', 'LOCAL_SOLVER_RANGES') THEN
        RETURN 'CHART_AUDITED';
    END IF;
    IF v_source ~ '(CURATED|SCENARIO|PSYCHOLOGY)'
       OR v_type = 'SCENARIO'
       OR (upper(coalesce(p_question_kind, '')) = 'SCENARIO'
           AND v_source NOT IN ('DETERMINISTIC_SOLVER', 'PIO_DATABASE', 'PIO'))
       OR v_declared = 'CURATED' THEN
        RETURN 'CURATED';
    END IF;
    RETURN 'LEGACY_UNVERIFIED';
END;
$$;

CREATE FUNCTION public.fn_training_cache_try_timestamptz(p_value text)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, extensions
AS $$
BEGIN
    IF nullif(btrim(p_value), '') IS NULL THEN RETURN NULL; END IF;
    RETURN p_value::timestamptz;
EXCEPTION WHEN others THEN
    RETURN NULL;
END;
$$;

CREATE FUNCTION public.fn_training_cache_row_is_valid(
    p_classification text,
    p_question jsonb,
    p_policy jsonb,
    p_scenario_hash text,
    p_exact_node jsonb,
    p_public_action_history jsonb,
    p_policy_version text,
    p_solver_version text,
    p_solver_binary_checksum text,
    p_manifest_checksum text,
    p_source_checksum text,
    p_pipeline_commit text,
    p_machine_id text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, extensions
AS $$
DECLARE
    v_base boolean;
    v_source text := upper(coalesce(p_question ->> 'source', ''));
    v_quality text := upper(coalesce(p_question ->> 'dataQuality', ''));
    v_declared text := upper(coalesce(p_question ->> 'sourceClassification', ''));
    v_policy_valid boolean := public.fn_training_cache_policy_seal_is_valid(p_policy);
    v_policy_kind text := lower(coalesce(p_policy ->> 'kind', ''));
    v_policy_seal text := upper(coalesce(p_policy ->> 'qualitySeal', ''));
    v_correct_answer text := lower(coalesce(p_question ->> 'correctAnswer', ''));
BEGIN
    IF jsonb_typeof(p_question) <> 'object'
       OR jsonb_typeof(p_question -> 'options') <> 'array' THEN
        RETURN false;
    END IF;
    v_base := jsonb_array_length(p_question -> 'options') >= 2
        AND nullif(v_correct_answer, '') IS NOT NULL
        AND v_policy_valid
        AND p_question -> 'solverPolicy' = p_policy
        AND p_question ->> 'sourceClassification' = p_classification
        AND p_question ->> 'dataQuality' = p_classification
        AND p_policy_version = p_policy ->> 'policyVersion'
        AND p_exact_node = p_policy -> 'node'
        AND p_public_action_history = p_policy #> '{key,publicActionHistory}';
    IF NOT v_base THEN RETURN false; END IF;

    -- The player-facing option set and answer hint must describe the immutable
    -- grading policy even though neither field is itself grading authority.
    IF EXISTS (
        SELECT 1
        FROM jsonb_object_keys(p_policy -> 'distribution') AS policy_action(action_id)
        WHERE NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(p_question -> 'options') AS option_row(value)
            WHERE lower(option_row.value ->> 'id') = lower(policy_action.action_id)
        )
    ) OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_question -> 'options') AS option_row(value)
        WHERE jsonb_typeof(option_row.value) <> 'object'
           OR nullif(lower(option_row.value ->> 'id'), '') IS NULL
           OR NOT (p_policy -> 'distribution' ? lower(option_row.value ->> 'id'))
    ) OR NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_question -> 'options') AS option_row(value)
        WHERE lower(option_row.value ->> 'id') = v_correct_answer
    ) OR jsonb_typeof(p_policy -> 'distribution' -> v_correct_answer) <> 'number'
       OR (p_policy -> 'distribution' ->> v_correct_answer)::numeric < (
            SELECT max((entry.value #>> '{}')::numeric)
            FROM jsonb_each(p_policy -> 'distribution') AS entry(key, value)
       ) THEN
        RETURN false;
    END IF;

    CASE p_classification
        WHEN 'SOLVER_EXACT' THEN
            RETURN v_policy_kind = 'exact'
                AND v_policy_seal = 'SOLVER_EXACT'
                AND p_policy #>> '{sourceArtifact,provenanceComplete}' = 'true'
                AND p_policy #>> '{sourceArtifact,scenarioHash}' = p_scenario_hash
                AND p_policy #>> '{sourceArtifact,solverVersion}' = p_solver_version
                AND lower(p_policy #>> '{sourceArtifact,solverBinaryChecksum}')
                    = lower(p_solver_binary_checksum)
                AND lower(p_policy #>> '{sourceArtifact,manifestChecksum}')
                    = lower(p_manifest_checksum)
                AND lower(p_policy #>> '{sourceArtifact,sourceArtifactChecksum}')
                    = lower(p_source_checksum)
                AND lower(p_policy #>> '{sourceArtifact,pipelineCommit}')
                    = lower(p_pipeline_commit)
                AND p_policy #>> '{sourceArtifact,machineId}' = p_machine_id
                AND p_policy #>> '{validDomain,completeKey}' = 'true'
                AND nullif(p_scenario_hash, '') IS NOT NULL
                AND jsonb_typeof(p_exact_node) = 'object'
                AND p_public_action_history #>> '{complete}' = 'true'
                AND nullif(p_policy_version, '') IS NOT NULL
                AND nullif(p_solver_version, '') IS NOT NULL
                AND coalesce(p_solver_binary_checksum, '') ~ '^[0-9a-fA-F]{64}$'
                AND coalesce(p_manifest_checksum, '') ~ '^[0-9a-fA-F]{64}$'
                AND coalesce(p_source_checksum, '') ~ '^[0-9a-fA-F]{64}$'
                AND coalesce(p_pipeline_commit, '') ~ '^[0-9a-fA-F]{40}$'
                AND nullif(p_machine_id, '') IS NOT NULL;
        WHEN 'SOLVER_AGGREGATED' THEN
            RETURN v_policy_kind = 'aggregated'
                AND v_policy_seal = 'SOLVER_AGGREGATED'
                AND nullif(p_policy_version, '') IS NOT NULL
                AND nullif(p_scenario_hash, '') IS NOT NULL
                AND coalesce(p_source_checksum, '') ~ '^[0-9a-fA-F]{64}$'
                AND lower(p_policy #>> '{sourceArtifact,sourceArtifactChecksum}')
                    = lower(p_source_checksum)
                AND p_policy #>> '{sourceArtifact,scenarioHash}' = p_scenario_hash;
        WHEN 'SOLVER_DERIVED_RESPONSE' THEN
            RETURN v_policy_kind = 'derived'
                AND v_policy_seal = 'SOLVER_DERIVED_RESPONSE'
                AND nullif(p_policy_version, '') IS NOT NULL
                AND nullif(p_scenario_hash, '') IS NOT NULL
                AND coalesce(p_source_checksum, '') ~ '^[0-9a-fA-F]{64}$'
                AND lower(p_policy #>> '{sourceArtifact,sourceArtifactChecksum}')
                    = lower(p_source_checksum)
                AND p_policy #>> '{sourceArtifact,scenarioHash}' = p_scenario_hash;
        WHEN 'CHART_AUDITED' THEN
            RETURN v_policy_kind = 'chart'
                AND v_policy_seal = 'CHART_AUDITED'
                AND public.fn_training_cache_has_distribution(p_question)
                AND p_policy #>> '{sourceArtifact,system}' = 'memory_charts_gold'
                AND nullif(p_policy #>> '{sourceArtifact,artifactId}', '') IS NOT NULL
                AND v_source IN ('CHART', 'LOCAL_SOLVER_RANGES');
        WHEN 'MODEL_DISTILLED' THEN
            RETURN v_policy_kind = 'heuristic'
                AND v_policy_seal = 'HEURISTIC'
                AND (v_source IN ('MODEL_DISTILLED', 'DISTILLED_MODEL')
                    OR v_quality = 'MODEL_DISTILLED'
                    OR v_declared = 'MODEL_DISTILLED');
        WHEN 'CURATED' THEN
            RETURN v_policy_kind = 'curated' AND v_policy_seal = 'CURATED';
        WHEN 'HEURISTIC' THEN
            RETURN v_policy_kind = 'heuristic' AND v_policy_seal = 'HEURISTIC';
        WHEN 'LEGACY_UNVERIFIED' THEN
            RETURN v_policy_kind = 'derived'
                AND v_policy_seal = 'LEGACY_UNVERIFIED'
                AND v_source = 'LEGACY_STRATEGY_ARCHIVE'
                AND upper(coalesce(p_question ->> 'dataQuality', '')) = 'LEGACY_UNVERIFIED'
                AND p_question #>> '{solverProvenance,verified}' = 'false'
                AND p_question #>> '{questionContract,valid}' = 'true'
                AND p_question ->> 'evidenceDisclosure'
                    = 'Legacy strategy archive; writer provenance is unavailable.';
        ELSE
            RETURN false;
    END CASE;
END;
$$;

CREATE FUNCTION public.fn_training_cache_quarantine_reason(
    p_classification text,
    p_question jsonb,
    p_policy jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
    SELECT CASE
        WHEN jsonb_typeof(p_question) <> 'object' THEN 'question_payload_not_object'
        WHEN jsonb_typeof(p_question -> 'options') <> 'array' THEN 'missing_legal_options'
        WHEN jsonb_array_length(p_question -> 'options') < 2 THEN 'missing_legal_options'
        WHEN nullif(p_question ->> 'correctAnswer', '') IS NULL THEN 'missing_answer_key'
        WHEN NOT public.fn_training_cache_policy_seal_is_valid(p_policy)
          THEN 'invalid_canonical_policy'
        WHEN p_classification = 'LEGACY_UNVERIFIED'
          AND upper(coalesce(p_question ->> 'source', '')) IN
            ('DETERMINISTIC_SOLVER', 'PIO_DATABASE', 'PIO')
          THEN 'unsealed_warehouse_provenance'
        WHEN p_classification = 'CHART_AUDITED'
          AND NOT public.fn_training_cache_has_distribution(p_question)
          THEN 'audited_chart_missing_distribution'
        ELSE 'source_contract_incomplete'
    END;
$$;

CREATE FUNCTION public.fn_training_cache_stamp_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
    v_policy jsonb;
    v_source jsonb;
    v_provenance jsonb;
    v_scenario jsonb;
    v_classification text;
BEGIN
    NEW.question_data := coalesce(NEW.question_data, '{}'::jsonb);
    NEW.question_kind := coalesce(nullif(NEW.question_kind, ''), NEW.engine_type);
    v_policy := coalesce(
        CASE WHEN jsonb_typeof(NEW.canonical_policy) = 'object' THEN NEW.canonical_policy END,
        CASE WHEN jsonb_typeof(NEW.question_data -> 'solverPolicy') = 'object'
            THEN NEW.question_data -> 'solverPolicy' END
    );
    NEW.canonical_policy := v_policy;
    IF jsonb_typeof(v_policy) = 'object' THEN
        -- canonical_policy is the database grading authority. Keep the embedded
        -- response envelope byte-identical so APIs cannot serve one policy
        -- while counters and answers bind to another.
        NEW.question_data := jsonb_set(
            NEW.question_data, '{solverPolicy}', v_policy, true
        );
    END IF;
    v_source := coalesce(v_policy -> 'sourceArtifact', '{}'::jsonb);
    v_provenance := coalesce(NEW.question_data -> 'solverProvenance', '{}'::jsonb);
    v_scenario := coalesce(NEW.question_data -> 'scenario', '{}'::jsonb);

    v_classification := public.fn_training_cache_derive_classification(
        NEW.question_kind, NEW.question_data, v_policy
    );
    NEW.source_classification := v_classification;
    NEW.question_data := jsonb_set(
        jsonb_set(NEW.question_data, '{sourceClassification}', to_jsonb(v_classification), true),
        '{dataQuality}', to_jsonb(v_classification), true
    );

    NEW.scenario_hash := coalesce(
        nullif(v_source ->> 'scenarioHash', ''),
        nullif(v_provenance ->> 'scenarioHash', ''),
        nullif(v_scenario ->> 'scenarioHash', ''),
        nullif(NEW.question_data ->> 'scenarioHash', '')
    );
    NEW.exact_node := CASE WHEN jsonb_typeof(v_policy -> 'node') = 'object'
        THEN v_policy -> 'node' END;
    NEW.public_action_history := CASE
        WHEN jsonb_typeof(v_policy #> '{key,publicActionHistory}') = 'object'
            THEN v_policy #> '{key,publicActionHistory}'
        ELSE NULL
    END;
    NEW.policy_version := nullif(v_policy ->> 'policyVersion', '');
    NEW.solver_version := coalesce(
        nullif(v_source ->> 'solverVersion', ''),
        nullif(v_provenance ->> 'solverVersion', ''),
        NULL
    );
    NEW.solver_binary_checksum := coalesce(
        nullif(v_source ->> 'solverBinaryChecksum', ''),
        nullif(v_provenance ->> 'solverBinaryChecksum', ''),
        NULL
    );
    NEW.manifest_version := coalesce(
        nullif(v_source ->> 'manifestVersion', ''),
        nullif(v_provenance ->> 'manifestVersion', ''),
        NULL
    );
    NEW.manifest_checksum := coalesce(
        nullif(v_source ->> 'manifestChecksum', ''),
        nullif(v_provenance ->> 'manifestChecksum', ''),
        NULL
    );
    NEW.source_checksum := coalesce(
        nullif(v_source ->> 'sourceArtifactChecksum', ''),
        nullif(v_provenance ->> 'sourceArtifactChecksum', ''),
        NULL
    );
    NEW.pipeline_commit := coalesce(
        nullif(v_source ->> 'pipelineCommit', ''),
        nullif(v_provenance ->> 'pipelineCommit', ''),
        NULL
    );
    NEW.machine_id := coalesce(
        nullif(v_source ->> 'machineId', ''),
        nullif(v_provenance ->> 'machineId', ''),
        NULL
    );
    NEW.source_created_at := coalesce(NEW.source_created_at, NEW.generated_at, now());
    NEW.source_audited_at := coalesce(
        public.fn_training_cache_try_timestamptz(v_source ->> 'auditedAt'),
        public.fn_training_cache_try_timestamptz(v_provenance ->> 'auditedAt'),
        NULL
    );
    NEW.generator_version := coalesce(
        nullif(NEW.question_data ->> 'generatorVersion', ''),
        nullif(NEW.question_data ->> 'engineVersion', ''),
        NEW.generator_version,
        'training-cache-contract.1:' || lower(v_classification)
    );
    NEW.lineage := jsonb_strip_nulls(jsonb_build_object(
        'contractVersion', 'smarter-poker.training-cache-lineage.v1',
        'sourceClassification', v_classification,
        'policyVersion', NEW.policy_version,
        'scenarioHash', NEW.scenario_hash,
        'exactNode', NEW.exact_node,
        'publicActionHistory', NEW.public_action_history,
        'sourceArtifact', v_source,
        'sourceCreatedAt', NEW.source_created_at,
        'sourceAuditedAt', NEW.source_audited_at,
        'generatorVersion', NEW.generator_version
    ));
    NEW.content_checksum := encode(extensions.digest(NEW.question_data::text, 'sha256'), 'hex');
    NEW.policy_checksum := CASE
        WHEN jsonb_typeof(NEW.canonical_policy) = 'object'
            THEN encode(extensions.digest(NEW.canonical_policy::text, 'sha256'), 'hex')
        ELSE NULL
    END;
    IF NEW.served_count = 0 AND coalesce(NEW.times_used, 0) > 0 THEN
        NEW.served_count := NEW.times_used;
    END IF;
    NEW.quality_status := CASE
        WHEN public.fn_training_cache_row_is_valid(
            v_classification, NEW.question_data, v_policy, NEW.scenario_hash,
            NEW.exact_node, NEW.public_action_history, NEW.policy_version,
            NEW.solver_version, NEW.solver_binary_checksum, NEW.manifest_checksum,
            NEW.source_checksum, NEW.pipeline_commit, NEW.machine_id
        ) THEN CASE WHEN v_classification = 'LEGACY_UNVERIFIED'
            THEN 'active_fallback' ELSE 'active' END
        ELSE 'quarantined'
    END;
    RETURN NEW;
END;
$$;

CREATE TRIGGER training_question_cache_truth_stamp
BEFORE INSERT OR UPDATE OF
    question_data, canonical_policy, source_classification, question_kind,
    scenario_hash, exact_node, public_action_history, policy_version,
    solver_version, solver_binary_checksum, manifest_version,
    manifest_checksum, source_checksum, pipeline_commit, machine_id,
    source_created_at, source_audited_at, generator_version, lineage,
    content_checksum, policy_checksum
ON public.training_question_cache
FOR EACH ROW EXECUTE FUNCTION public.fn_training_cache_stamp_row();

-- Stamp the live rows, including a truthful replacement for legacy
-- dataQuality values, then move invalid rows without discarding recovery data.
UPDATE public.training_question_cache
SET question_data = question_data,
    question_kind = engine_type,
    source_created_at = coalesce(generated_at, now()),
    served_count = greatest(coalesce(times_used, 0), 0);

INSERT INTO public.training_question_cache_quarantine (
    original_id, question_id, game_id, source_classification,
    quarantine_reason, original_row, quarantined_at
)
SELECT
    c.id,
    c.question_id,
    c.game_id,
    c.source_classification,
    public.fn_training_cache_quarantine_reason(
        c.source_classification, c.question_data, c.canonical_policy
    ),
    to_jsonb(c),
    now()
FROM public.training_question_cache c
WHERE c.quality_status = 'quarantined'
ON CONFLICT (original_id) DO UPDATE
SET quarantine_reason = EXCLUDED.quarantine_reason,
    original_row = EXCLUDED.original_row,
    quarantined_at = EXCLUDED.quarantined_at;

DELETE FROM public.training_question_cache WHERE quality_status = 'quarantined';

ALTER TABLE public.training_question_cache
    ALTER COLUMN question_kind SET NOT NULL,
    ALTER COLUMN source_classification SET NOT NULL,
    ALTER COLUMN quality_status SET NOT NULL,
    ALTER COLUMN generator_version SET NOT NULL,
    ALTER COLUMN lineage SET NOT NULL,
    ALTER COLUMN content_checksum SET NOT NULL,
    ALTER COLUMN policy_checksum SET NOT NULL,
    ALTER COLUMN question_kind SET DEFAULT 'PIO',
    ALTER COLUMN source_classification SET DEFAULT 'LEGACY_UNVERIFIED',
    ALTER COLUMN quality_status SET DEFAULT 'quarantined',
    ALTER COLUMN generator_version SET DEFAULT 'training-cache-contract.1:legacy_unverified',
    ALTER COLUMN lineage SET DEFAULT '{}'::jsonb;

ALTER TABLE public.training_question_cache
    ADD CONSTRAINT training_question_cache_kind_check
        CHECK (question_kind IN ('PIO', 'CHART', 'SCENARIO')),
    ADD CONSTRAINT training_question_cache_source_classification_check
        CHECK (source_classification IN (
            'SOLVER_EXACT', 'SOLVER_AGGREGATED', 'SOLVER_DERIVED_RESPONSE',
            'CHART_AUDITED', 'MODEL_DISTILLED', 'CURATED', 'HEURISTIC',
            'LEGACY_UNVERIFIED'
        )),
    ADD CONSTRAINT training_question_cache_quality_status_check
        CHECK (quality_status IN ('active', 'active_fallback', 'quarantined', 'drifted')),
    ADD CONSTRAINT training_question_cache_policy_object_check
        CHECK (canonical_policy IS NULL OR jsonb_typeof(canonical_policy) = 'object'),
    ADD CONSTRAINT training_question_cache_lineage_object_check
        CHECK (jsonb_typeof(lineage) = 'object'),
    ADD CONSTRAINT training_question_cache_content_checksum_check
        CHECK (content_checksum ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT training_question_cache_policy_checksum_check
        CHECK (policy_checksum ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT training_question_cache_counters_check
        CHECK (served_count >= 0 AND answered_count >= 0
            AND correct_count >= 0 AND completed_count >= 0
            AND correct_count <= answered_count);

-- The first trigger had to stamp legacy rows before quarantine. From this
-- point forward, fail every unsafe writer closed rather than leaving a newly
-- inserted quarantined row visible to an older application during rollout.
CREATE FUNCTION public.fn_training_cache_reject_invalid_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
    IF NEW.quality_status NOT IN ('active', 'active_fallback') THEN
        RAISE EXCEPTION 'training_cache_write_failed_truth_contract';
    END IF;
    IF NEW.source_classification IN (
        'SOLVER_EXACT', 'SOLVER_AGGREGATED', 'SOLVER_DERIVED_RESPONSE'
    ) AND NOT EXISTS (
        SELECT 1
        FROM public.solved_spots_gold s
        WHERE s.scenario_hash = NEW.scenario_hash
          AND s.source_artifact_checksum = NEW.source_checksum
    ) THEN
        RAISE EXCEPTION 'training_cache_write_missing_solver_artifact';
    END IF;
    IF NEW.source_classification = 'CHART_AUDITED'
       AND (
          NEW.canonical_policy #>> '{sourceArtifact,system}' <> 'memory_charts_gold'
          OR coalesce(NEW.canonical_policy #>> '{sourceArtifact,artifactId}', '')
                !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
          OR NOT EXISTS (
              SELECT 1
              FROM public.memory_charts_gold m
              WHERE m.chart_id::text = lower(
                  NEW.canonical_policy #>> '{sourceArtifact,artifactId}'
              )
          )
       ) THEN
        RAISE EXCEPTION 'training_cache_write_missing_chart_artifact';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER zz_training_question_cache_truth_reject
BEFORE INSERT OR UPDATE OF
    question_data, canonical_policy, source_classification, question_kind,
    scenario_hash, exact_node, public_action_history, policy_version,
    solver_version, solver_binary_checksum, manifest_version,
    manifest_checksum, source_checksum, pipeline_commit, machine_id,
    source_created_at, source_audited_at, generator_version, lineage,
    content_checksum, policy_checksum
ON public.training_question_cache
FOR EACH ROW EXECUTE FUNCTION public.fn_training_cache_reject_invalid_write();

CREATE INDEX training_question_cache_active_lookup_idx
    ON public.training_question_cache (game_id, level, question_kind)
    WHERE quality_status IN ('active', 'active_fallback');
CREATE INDEX training_question_cache_source_class_idx
    ON public.training_question_cache (source_classification, quality_status);
CREATE INDEX training_question_cache_scenario_hash_idx
    ON public.training_question_cache (scenario_hash)
    WHERE scenario_hash IS NOT NULL;

-- 4. IMMUTABLE EVENT LEDGER AND ATOMIC COUNTERS
CREATE FUNCTION public.fn_training_cache_record_event(
    p_event_type text,
    p_event_key text,
    p_question_id text,
    p_user_id uuid DEFAULT NULL,
    p_is_correct boolean DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'::jsonb,
    p_occurred_at timestamptz DEFAULT now(),
    p_expected_policy_checksum text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_inserted boolean := false;
    v_rows integer := 0;
    v_occurred_at timestamptz := coalesce(p_occurred_at, now());
    v_existing public.training_question_events%ROWTYPE;
    v_cache public.training_question_cache%ROWTYPE;
BEGIN
    IF p_event_type NOT IN ('served', 'answered', 'completed') THEN
        RAISE EXCEPTION 'invalid_training_cache_event_type';
    END IF;
    IF nullif(btrim(p_event_key), '') IS NULL OR length(p_event_key) > 320 THEN
        RAISE EXCEPTION 'invalid_training_cache_event_key';
    END IF;
    IF nullif(btrim(p_question_id), '') IS NULL OR length(p_question_id) > 180 THEN
        RAISE EXCEPTION 'invalid_training_cache_question_id';
    END IF;
    IF (p_event_type = 'answered') <> (p_is_correct IS NOT NULL) THEN
        RAISE EXCEPTION 'answered_event_requires_is_correct';
    END IF;
    IF p_metadata IS NOT NULL AND jsonb_typeof(p_metadata) <> 'object' THEN
        RAISE EXCEPTION 'invalid_training_cache_event_metadata';
    END IF;

    -- Lock the cache row before binding the event to its grading policy. This
    -- makes the event insert and all four counters one atomic receipt even when
    -- many requests hit the same question concurrently.
    SELECT * INTO v_cache
    FROM public.training_question_cache c
    WHERE c.question_id = p_question_id
      AND c.quality_status IN ('active', 'active_fallback')
    FOR UPDATE;
    IF v_cache.id IS NULL THEN
        RAISE EXCEPTION 'training_cache_event_question_not_active';
    END IF;
    IF p_expected_policy_checksum IS NOT NULL
       AND p_expected_policy_checksum <> v_cache.policy_checksum THEN
        RAISE EXCEPTION 'training_cache_event_stale_policy';
    END IF;

    INSERT INTO public.training_question_events (
        event_type, event_key, question_id, user_id, is_correct, policy_checksum,
        metadata, occurred_at
    ) VALUES (
        p_event_type, p_event_key, p_question_id, p_user_id, p_is_correct,
        v_cache.policy_checksum, coalesce(p_metadata, '{}'::jsonb), v_occurred_at
    )
    ON CONFLICT (event_type, event_key) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_inserted := v_rows = 1;

    IF NOT v_inserted THEN
        SELECT * INTO v_existing
        FROM public.training_question_events e
        WHERE e.event_type = p_event_type AND e.event_key = p_event_key;
        IF v_existing.question_id <> p_question_id
           OR v_existing.user_id IS DISTINCT FROM p_user_id
           OR v_existing.is_correct IS DISTINCT FROM p_is_correct
           OR (p_expected_policy_checksum IS NOT NULL
               AND v_existing.policy_checksum <> p_expected_policy_checksum) THEN
            RAISE EXCEPTION 'training_cache_event_binding_mismatch';
        END IF;
    ELSE
        UPDATE public.training_question_cache c
        SET served_count = coalesce(c.served_count, 0)
                + CASE WHEN p_event_type = 'served' THEN 1 ELSE 0 END,
            answered_count = coalesce(c.answered_count, 0)
                + CASE WHEN p_event_type = 'answered' THEN 1 ELSE 0 END,
            correct_count = coalesce(c.correct_count, 0)
                + CASE WHEN p_event_type = 'answered' AND p_is_correct THEN 1 ELSE 0 END,
            completed_count = coalesce(c.completed_count, 0)
                + CASE WHEN p_event_type = 'completed' THEN 1 ELSE 0 END,
            times_used = LEAST(
                2147483647,
                coalesce(c.times_used, 0)
                    + CASE WHEN p_event_type = 'served' THEN 1 ELSE 0 END
            ),
            last_served_at = CASE WHEN p_event_type = 'served'
                THEN greatest(coalesce(c.last_served_at, '-infinity'::timestamptz), v_occurred_at)
                ELSE c.last_served_at END,
            last_answered_at = CASE WHEN p_event_type = 'answered'
                THEN greatest(coalesce(c.last_answered_at, '-infinity'::timestamptz), v_occurred_at)
                ELSE c.last_answered_at END,
            last_completed_at = CASE WHEN p_event_type = 'completed'
                THEN greatest(coalesce(c.last_completed_at, '-infinity'::timestamptz), v_occurred_at)
                ELSE c.last_completed_at END
        WHERE c.question_id = p_question_id
        RETURNING c.* INTO v_cache;
    END IF;

    RETURN jsonb_build_object(
        'inserted', v_inserted,
        'questionId', p_question_id,
        'cacheRowFound', v_cache.id IS NOT NULL,
        'policyChecksum', v_cache.policy_checksum,
        'served', coalesce(v_cache.served_count, 0),
        'answered', coalesce(v_cache.answered_count, 0),
        'correct', coalesce(v_cache.correct_count, 0),
        'completed', coalesce(v_cache.completed_count, 0)
    );
END;
$$;

CREATE FUNCTION public.fn_training_cache_record_served_batch(
    p_request_key text,
    p_question_receipts jsonb,
    p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_receipt record;
    v_result jsonb;
    v_inserted integer := 0;
    v_requested integer := 0;
    v_raw_count integer := 0;
BEGIN
    IF nullif(btrim(p_request_key), '') IS NULL OR length(p_request_key) > 180 THEN
        RAISE EXCEPTION 'invalid_training_cache_request_key';
    END IF;
    IF jsonb_typeof(p_question_receipts) <> 'array' THEN
        RAISE EXCEPTION 'invalid_training_cache_question_batch';
    END IF;
    v_raw_count := jsonb_array_length(p_question_receipts);
    IF v_raw_count < 1 OR v_raw_count > 50 THEN
        RAISE EXCEPTION 'invalid_training_cache_question_batch';
    END IF;
    SELECT count(DISTINCT btrim(item ->> 'questionId'))::integer INTO v_requested
    FROM jsonb_array_elements(p_question_receipts) AS receipts(item)
    WHERE jsonb_typeof(item) = 'object'
      AND nullif(btrim(item ->> 'questionId'), '') IS NOT NULL
      AND length(btrim(item ->> 'questionId')) <= 180
      AND lower(coalesce(item ->> 'policyChecksum', '')) ~ '^[0-9a-f]{64}$';
    IF v_requested <> v_raw_count THEN
        RAISE EXCEPTION 'invalid_training_cache_question_receipts';
    END IF;

    FOR v_receipt IN
        SELECT
            btrim(item ->> 'questionId') AS question_id,
            lower(item ->> 'policyChecksum') AS policy_checksum
        FROM jsonb_array_elements(p_question_receipts) AS receipts(item)
        ORDER BY btrim(item ->> 'questionId')
    LOOP
        v_result := public.fn_training_cache_record_event(
            'served',
            p_request_key || ':' || encode(extensions.digest(v_receipt.question_id, 'sha256'), 'hex'),
            v_receipt.question_id,
            p_user_id,
            NULL,
            jsonb_build_object(
                'requestKey', p_request_key,
                'policyChecksum', v_receipt.policy_checksum
            ),
            now(),
            v_receipt.policy_checksum
        );
        IF coalesce((v_result ->> 'inserted')::boolean, false) THEN
            v_inserted := v_inserted + 1;
        END IF;
    END LOOP;
    RETURN jsonb_build_object(
        'requestKey', p_request_key,
        'questionCount', v_requested,
        'inserted', v_inserted,
        'duplicates', v_requested - v_inserted
    );
END;
$$;

-- Seed the auditable ledger from the legacy counters before enabling triggers.
INSERT INTO public.training_question_events (
    event_type, event_key, question_id, is_correct, policy_checksum, metadata, occurred_at
)
SELECT
    'served',
    'legacy-served:' || c.id::text || ':' || n::text,
    c.question_id,
    NULL,
    c.policy_checksum,
    jsonb_build_object('backfill', true, 'legacyColumn', 'times_used'),
    coalesce(c.generated_at, now())
FROM public.training_question_cache c
CROSS JOIN LATERAL generate_series(1, greatest(coalesce(c.times_used, 0), 0)) AS n;

INSERT INTO public.training_question_events (
    event_type, event_key, question_id, user_id, is_correct, policy_checksum,
    metadata, occurred_at
)
SELECT
    'answered',
    'training-answer:' || a.id::text,
    a.question_id,
    a.user_id,
    a.is_correct,
    c.policy_checksum,
    jsonb_build_object('backfill', true, 'answerId', a.id),
    coalesce(a.answered_at, now())
FROM public.training_answers a
JOIN public.training_question_cache c ON c.question_id = a.question_id
ON CONFLICT (event_type, event_key) DO NOTHING;

WITH expected AS (
    SELECT
        e.question_id,
        count(*) FILTER (WHERE e.event_type = 'served')::bigint AS served,
        count(*) FILTER (WHERE e.event_type = 'answered')::bigint AS answered,
        count(*) FILTER (WHERE e.event_type = 'answered' AND e.is_correct)::bigint AS correct,
        count(*) FILTER (WHERE e.event_type = 'completed')::bigint AS completed,
        max(e.occurred_at) FILTER (WHERE e.event_type = 'served') AS last_served,
        max(e.occurred_at) FILTER (WHERE e.event_type = 'answered') AS last_answered,
        max(e.occurred_at) FILTER (WHERE e.event_type = 'completed') AS last_completed
    FROM public.training_question_events e
    GROUP BY e.question_id
)
UPDATE public.training_question_cache c
SET served_count = coalesce(x.served, 0),
    answered_count = coalesce(x.answered, 0),
    correct_count = coalesce(x.correct, 0),
    completed_count = coalesce(x.completed, 0),
    times_used = least(2147483647, coalesce(x.served, 0))::integer,
    last_served_at = x.last_served,
    last_answered_at = x.last_answered,
    last_completed_at = x.last_completed
FROM expected x
WHERE x.question_id = c.question_id;

CREATE FUNCTION public.fn_training_answer_cache_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF coalesce(NEW.evidence_metadata ->> 'policyChecksum', '') !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'training_answer_missing_policy_checksum';
    END IF;
    PERFORM public.fn_training_cache_record_event(
        'answered',
        'training-answer:' || NEW.id::text,
        NEW.question_id,
        NEW.user_id,
        NEW.is_correct,
        jsonb_build_object(
            'answerId', NEW.id,
            'submissionId', NEW.submission_id,
            'classification', NEW.classification,
            'solverVerified', NEW.solver_verified
        ),
        coalesce(NEW.answered_at, now()),
        nullif(NEW.evidence_metadata ->> 'policyChecksum', '')
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER training_answer_cache_event
AFTER INSERT OR UPDATE OF question_id, user_id, is_correct, evidence_metadata
ON public.training_answers
FOR EACH ROW EXECUTE FUNCTION public.fn_training_answer_cache_event();

CREATE FUNCTION public.fn_training_session_cache_completion()
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
              nullif(entry.value #>> '{handData,policyChecksum}', '')
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

CREATE TRIGGER training_session_cache_completion
AFTER INSERT ON public.training_sessions
FOR EACH ROW EXECUTE FUNCTION public.fn_training_session_cache_completion();

-- 5. QUARANTINE AND DAILY DRIFT AUDIT
CREATE FUNCTION public.fn_training_cache_quarantine_invalid()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_count integer;
BEGIN
    WITH moved AS (
        INSERT INTO public.training_question_cache_quarantine (
            original_id, question_id, game_id, source_classification,
            quarantine_reason, original_row, quarantined_at
        )
        SELECT
            c.id,
            c.question_id,
            c.game_id,
            c.source_classification,
            CASE WHEN c.quality_status = 'drifted' THEN 'source_or_cache_drift'
                ELSE public.fn_training_cache_quarantine_reason(
                    c.source_classification, c.question_data, c.canonical_policy
                ) END,
            to_jsonb(c),
            now()
        FROM public.training_question_cache c
        WHERE c.quality_status IN ('quarantined', 'drifted')
        ON CONFLICT (original_id) DO UPDATE
        SET quarantine_reason = EXCLUDED.quarantine_reason,
            original_row = EXCLUDED.original_row,
            quarantined_at = EXCLUDED.quarantined_at
        RETURNING original_id
    ), deleted AS (
        DELETE FROM public.training_question_cache c
        USING moved m
        WHERE c.id = m.original_id
        RETURNING c.id
    )
    SELECT count(*)::integer INTO v_count FROM deleted;
    RETURN coalesce(v_count, 0);
END;
$$;

CREATE FUNCTION public.fn_training_cache_release_restored(p_original_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_count integer := 0;
BEGIN
    IF coalesce(array_length(p_original_ids, 1), 0) < 1
       OR array_length(p_original_ids, 1) > 500 THEN
        RAISE EXCEPTION 'invalid_training_cache_restore_batch';
    END IF;

    -- Rebuild the legacy usage ledger only after the replacement row has
    -- passed the canonical policy validator. Historical answer correctness is
    -- regraded from that replacement policy; the old cached answer key is
    -- never copied into the new counters.
    INSERT INTO public.training_question_events (
        event_type, event_key, question_id, is_correct, policy_checksum,
        metadata, occurred_at
    )
    SELECT
        'served',
        'legacy-served:' || q.original_id::text || ':' || n::text,
        c.question_id,
        NULL,
        c.policy_checksum,
        jsonb_build_object(
            'backfill', true,
            'legacyColumn', 'times_used',
            'policyChecksum', c.policy_checksum
        ),
        coalesce(
            public.fn_training_cache_try_timestamptz(q.original_row ->> 'generated_at'),
            c.generated_at,
            now()
        )
    FROM public.training_question_cache_quarantine q
    JOIN public.training_question_cache c
      ON c.id = q.original_id AND c.question_id = q.question_id
    CROSS JOIN LATERAL generate_series(
        1,
        CASE WHEN coalesce(q.original_row ->> 'times_used', '') ~ '^[0-9]+$'
            THEN least((q.original_row ->> 'times_used')::integer, 2147483647)
            ELSE 0 END
    ) AS n
    WHERE q.original_id = ANY(p_original_ids)
      AND c.quality_status IN ('active', 'active_fallback')
    ON CONFLICT (event_type, event_key) DO NOTHING;

    INSERT INTO public.training_question_events (
        event_type, event_key, question_id, user_id, is_correct,
        policy_checksum, metadata, occurred_at
    )
    SELECT
        'answered',
        'training-answer:' || a.id::text,
        c.question_id,
        a.user_id,
        (
            (c.canonical_policy -> 'distribution' ->> lower(a.answer_id))::numeric >= 0.05
            OR (c.canonical_policy -> 'distribution' ->> lower(a.answer_id))::numeric >= (
                SELECT max((frequency.value #>> '{}')::numeric)
                FROM jsonb_each(c.canonical_policy -> 'distribution') AS frequency(key, value)
            )
        ),
        c.policy_checksum,
        jsonb_build_object(
            'backfill', true,
            'historicalAnswerRegraded', true,
            'answerId', a.id,
            'policyChecksum', c.policy_checksum
        ),
        coalesce(a.answered_at, now())
    FROM public.training_question_cache_quarantine q
    JOIN public.training_question_cache c
      ON c.id = q.original_id AND c.question_id = q.question_id
    JOIN public.training_answers a ON a.question_id = c.question_id
    WHERE q.original_id = ANY(p_original_ids)
      AND c.quality_status IN ('active', 'active_fallback')
      AND jsonb_typeof(
          c.canonical_policy -> 'distribution' -> lower(a.answer_id)
      ) = 'number'
    ON CONFLICT (event_type, event_key) DO NOTHING;

    WITH expected AS (
        SELECT
            c.id,
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
        WHERE c.id = ANY(p_original_ids)
        GROUP BY c.id
    )
    UPDATE public.training_question_cache c
    SET served_count = expected.served,
        answered_count = expected.answered,
        correct_count = expected.correct,
        completed_count = expected.completed,
        times_used = least(2147483647, expected.served)::integer,
        last_served_at = expected.last_served,
        last_answered_at = expected.last_answered,
        last_completed_at = expected.last_completed
    FROM expected
    WHERE c.id = expected.id;

    WITH released AS (
        DELETE FROM public.training_question_cache_quarantine q
        USING public.training_question_cache c
        WHERE q.original_id = ANY(p_original_ids)
          AND c.id = q.original_id
          AND c.question_id = q.question_id
          AND c.quality_status IN ('active', 'active_fallback')
          AND public.fn_training_cache_row_is_valid(
              c.source_classification, c.question_data, c.canonical_policy,
              c.scenario_hash, c.exact_node, c.public_action_history,
              c.policy_version, c.solver_version, c.solver_binary_checksum,
              c.manifest_checksum, c.source_checksum, c.pipeline_commit, c.machine_id
          )
        RETURNING q.original_id
    )
    SELECT count(*)::integer INTO v_count FROM released;
    RETURN v_count;
END;
$$;

CREATE FUNCTION public.fn_training_cache_run_drift_audit(
    p_run_date date DEFAULT (now() AT TIME ZONE 'utc')::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_started timestamptz := clock_timestamp();
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
    SELECT count(*) INTO v_content_drift
    FROM public.training_question_cache c
    WHERE c.content_checksum
        <> encode(extensions.digest(c.question_data::text, 'sha256'), 'hex');

    SELECT count(*) INTO v_policy_drift
    FROM public.training_question_cache c
    WHERE c.policy_checksum
        <> encode(extensions.digest(c.canonical_policy::text, 'sha256'), 'hex');

    SELECT count(*) INTO v_classification_drift
    FROM public.training_question_cache c
    WHERE c.source_classification <> public.fn_training_cache_derive_classification(
        c.question_kind, c.question_data, c.canonical_policy
    );

    SELECT count(*) INTO v_source_drift
    FROM public.training_question_cache c
    WHERE c.source_classification IN (
        'SOLVER_EXACT', 'SOLVER_AGGREGATED', 'SOLVER_DERIVED_RESPONSE'
    )
      AND (
        c.source_checksum IS NULL
        OR c.scenario_hash IS NULL
        OR NOT EXISTS (
            SELECT 1
            FROM public.solved_spots_gold s
            WHERE s.scenario_hash = c.scenario_hash
              AND s.source_artifact_checksum = c.source_checksum
        )
      );

    SELECT count(*) INTO v_chart_source_missing
    FROM public.training_question_cache c
    WHERE c.source_classification = 'CHART_AUDITED'
      AND c.canonical_policy #>> '{sourceArtifact,system}' = 'memory_charts_gold'
      AND NOT EXISTS (
          SELECT 1 FROM public.memory_charts_gold m
          WHERE m.chart_id::text = c.canonical_policy #>> '{sourceArtifact,artifactId}'
      );

    SELECT count(*) INTO v_lineage_gaps
    FROM public.training_question_cache c
    WHERE NOT public.fn_training_cache_row_is_valid(
            c.source_classification, c.question_data, c.canonical_policy,
            c.scenario_hash, c.exact_node, c.public_action_history,
            c.policy_version, c.solver_version, c.solver_binary_checksum,
            c.manifest_checksum, c.source_checksum, c.pipeline_commit, c.machine_id
          )
       OR c.canonical_policy IS NULL
       OR c.policy_version IS NULL
       OR c.generator_version IS NULL
       OR c.source_created_at IS NULL
       OR jsonb_typeof(c.lineage) <> 'object'
       OR (
            c.source_classification = 'SOLVER_EXACT'
            AND (
                c.scenario_hash IS NULL OR c.exact_node IS NULL
                OR c.public_action_history #>> '{complete}' <> 'true'
                OR c.solver_version IS NULL OR c.solver_binary_checksum IS NULL
                OR c.manifest_checksum IS NULL OR c.source_checksum IS NULL
                OR c.pipeline_commit IS NULL OR c.machine_id IS NULL
            )
       );

    WITH expected AS (
        SELECT
            c.question_id,
            count(e.id) FILTER (WHERE e.event_type = 'served')::bigint AS served,
            count(e.id) FILTER (WHERE e.event_type = 'answered')::bigint AS answered,
            count(e.id) FILTER (WHERE e.event_type = 'answered' AND e.is_correct)::bigint AS correct,
            count(e.id) FILTER (WHERE e.event_type = 'completed')::bigint AS completed,
            max(e.occurred_at) FILTER (WHERE e.event_type = 'served') AS last_served,
            max(e.occurred_at) FILTER (WHERE e.event_type = 'answered') AS last_answered,
            max(e.occurred_at) FILTER (WHERE e.event_type = 'completed') AS last_completed
        FROM public.training_question_cache c
        LEFT JOIN public.training_question_events e ON e.question_id = c.question_id
        GROUP BY c.question_id
    ), drift AS (
        SELECT c.question_id
        FROM public.training_question_cache c
        JOIN expected x USING (question_id)
        WHERE (c.served_count, c.answered_count, c.correct_count, c.completed_count)
            IS DISTINCT FROM (x.served, x.answered, x.correct, x.completed)
    )
    SELECT count(*)::integer INTO v_counter_drift FROM drift;

    WITH expected AS (
        SELECT
            c.question_id,
            count(e.id) FILTER (WHERE e.event_type = 'served')::bigint AS served,
            count(e.id) FILTER (WHERE e.event_type = 'answered')::bigint AS answered,
            count(e.id) FILTER (WHERE e.event_type = 'answered' AND e.is_correct)::bigint AS correct,
            count(e.id) FILTER (WHERE e.event_type = 'completed')::bigint AS completed,
            max(e.occurred_at) FILTER (WHERE e.event_type = 'served') AS last_served,
            max(e.occurred_at) FILTER (WHERE e.event_type = 'answered') AS last_answered,
            max(e.occurred_at) FILTER (WHERE e.event_type = 'completed') AS last_completed
        FROM public.training_question_cache c
        LEFT JOIN public.training_question_events e ON e.question_id = c.question_id
        GROUP BY c.question_id
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
          AND (c.served_count, c.answered_count, c.correct_count, c.completed_count)
            IS DISTINCT FROM (x.served, x.answered, x.correct, x.completed)
        RETURNING c.id
    )
    SELECT count(*)::integer INTO v_counter_repaired FROM repaired;

    UPDATE public.training_question_cache c
    SET quality_status = 'drifted'
    WHERE c.content_checksum
            <> encode(extensions.digest(c.question_data::text, 'sha256'), 'hex')
       OR c.policy_checksum
            <> encode(extensions.digest(c.canonical_policy::text, 'sha256'), 'hex')
       OR c.source_classification <> public.fn_training_cache_derive_classification(
            c.question_kind, c.question_data, c.canonical_policy
       )
       OR NOT public.fn_training_cache_row_is_valid(
            c.source_classification, c.question_data, c.canonical_policy,
            c.scenario_hash, c.exact_node, c.public_action_history,
            c.policy_version, c.solver_version, c.solver_binary_checksum,
            c.manifest_checksum, c.source_checksum, c.pipeline_commit, c.machine_id
       )
       OR (
            c.source_classification IN (
                'SOLVER_EXACT', 'SOLVER_AGGREGATED', 'SOLVER_DERIVED_RESPONSE'
            )
            AND (
                c.source_checksum IS NULL OR c.scenario_hash IS NULL
                OR NOT EXISTS (
                    SELECT 1 FROM public.solved_spots_gold s
                    WHERE s.scenario_hash = c.scenario_hash
                      AND s.source_artifact_checksum = c.source_checksum
                )
            )
       )
       OR (
            c.source_classification = 'CHART_AUDITED'
            AND c.canonical_policy #>> '{sourceArtifact,system}' = 'memory_charts_gold'
            AND NOT EXISTS (
                SELECT 1 FROM public.memory_charts_gold m
                WHERE m.chart_id::text = c.canonical_policy #>> '{sourceArtifact,artifactId}'
            )
       );

    v_quarantined := public.fn_training_cache_quarantine_invalid();

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
            'severity', 'critical', 'code', 'content_checksum_drift', 'count', v_content_drift
        ));
    END IF;
    IF v_policy_drift > 0 THEN
        v_findings := v_findings || jsonb_build_array(jsonb_build_object(
            'severity', 'critical', 'code', 'policy_checksum_drift', 'count', v_policy_drift
        ));
    END IF;
    IF v_classification_drift > 0 THEN
        v_findings := v_findings || jsonb_build_array(jsonb_build_object(
            'severity', 'critical', 'code', 'classification_drift', 'count', v_classification_drift
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
            'severity', 'critical', 'code', 'lineage_incomplete', 'count', v_lineage_gaps
        ));
    END IF;
    IF v_counter_drift > 0 THEN
        v_findings := v_findings || jsonb_build_array(jsonb_build_object(
            'severity', 'warning', 'code', 'counter_reconciled', 'count', v_counter_drift
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

REVOKE ALL ON FUNCTION public.fn_training_cache_has_distribution(jsonb)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_training_cache_policy_seal_is_valid(jsonb)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_training_cache_derive_classification(text, jsonb, jsonb)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_training_cache_try_timestamptz(text)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_training_cache_row_is_valid(
    text, jsonb, jsonb, text, jsonb, jsonb, text, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_training_cache_quarantine_reason(text, jsonb, jsonb)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_training_cache_record_event(
    text, text, text, uuid, boolean, jsonb, timestamptz, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_training_cache_record_served_batch(text, jsonb, uuid)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_training_cache_quarantine_invalid()
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_training_cache_release_restored(uuid[])
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_training_cache_run_drift_audit(date)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_training_cache_stamp_row()
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_training_cache_reject_invalid_write()
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_training_answer_cache_event()
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_training_session_cache_completion()
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_training_cache_record_event(
    text, text, text, uuid, boolean, jsonb, timestamptz, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_training_cache_record_served_batch(text, jsonb, uuid)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_training_cache_quarantine_invalid()
    TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_training_cache_release_restored(uuid[])
    TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_training_cache_run_drift_audit(date)
    TO service_role;

-- 6. POST-APPLY ASSERTIONS
DO $$
DECLARE
    v_invalid integer;
    v_counter_drift integer;
    v_checksum_drift integer;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'training_question_cache'
          AND column_name = 'source_classification'
          AND is_nullable = 'NO'
    ) THEN
        RAISE EXCEPTION 'post-apply failed: source_classification is not enforced';
    END IF;
    IF to_regclass('public.training_question_events') IS NULL
       OR to_regclass('public.training_question_cache_quarantine') IS NULL
       OR to_regclass('public.training_cache_audit_runs') IS NULL THEN
        RAISE EXCEPTION 'post-apply failed: truth tables missing';
    END IF;

    SELECT count(*) INTO v_invalid
    FROM public.training_question_cache c
    WHERE c.quality_status NOT IN ('active', 'active_fallback')
       OR NOT public.fn_training_cache_row_is_valid(
            c.source_classification, c.question_data, c.canonical_policy,
            c.scenario_hash, c.exact_node, c.public_action_history,
            c.policy_version, c.solver_version, c.solver_binary_checksum,
            c.manifest_checksum, c.source_checksum, c.pipeline_commit, c.machine_id
       );
    IF v_invalid <> 0 THEN
        RAISE EXCEPTION 'post-apply failed: % invalid rows remained active', v_invalid;
    END IF;

    SELECT count(*) INTO v_checksum_drift
    FROM public.training_question_cache c
    WHERE c.content_checksum <> encode(extensions.digest(c.question_data::text, 'sha256'), 'hex')
       OR c.policy_checksum <> encode(extensions.digest(c.canonical_policy::text, 'sha256'), 'hex');
    IF v_checksum_drift <> 0 THEN
        RAISE EXCEPTION 'post-apply failed: % cache checksums do not reconcile', v_checksum_drift;
    END IF;

    WITH expected AS (
        SELECT
            c.question_id,
            count(e.id) FILTER (WHERE e.event_type = 'served')::bigint AS served,
            count(e.id) FILTER (WHERE e.event_type = 'answered')::bigint AS answered,
            count(e.id) FILTER (WHERE e.event_type = 'answered' AND e.is_correct)::bigint AS correct,
            count(e.id) FILTER (WHERE e.event_type = 'completed')::bigint AS completed
        FROM public.training_question_cache c
        LEFT JOIN public.training_question_events e ON e.question_id = c.question_id
        GROUP BY c.question_id
    )
    SELECT count(*) INTO v_counter_drift
    FROM public.training_question_cache c
    JOIN expected x USING (question_id)
    WHERE (c.served_count, c.answered_count, c.correct_count, c.completed_count)
        IS DISTINCT FROM (x.served, x.answered, x.correct, x.completed);
    IF v_counter_drift <> 0 THEN
        RAISE EXCEPTION 'post-apply failed: % counters do not reconcile', v_counter_drift;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'public.training_question_cache'::regclass
          AND tgname = 'training_question_cache_truth_stamp'
          AND NOT tgisinternal
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'public.training_answers'::regclass
          AND tgname = 'training_answer_cache_event'
          AND NOT tgisinternal
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'public.training_sessions'::regclass
          AND tgname = 'training_session_cache_completion'
          AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION 'post-apply failed: one or more truth triggers missing';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =====================================================================
-- ROLLBACK (apply as a NEW migration; quarantined source rows are restored)
-- =====================================================================
-- BEGIN;
-- DROP TRIGGER IF EXISTS training_session_cache_completion ON public.training_sessions;
-- DROP TRIGGER IF EXISTS training_answer_cache_event ON public.training_answers;
-- DROP TRIGGER IF EXISTS training_question_cache_truth_stamp ON public.training_question_cache;
-- DROP TRIGGER IF EXISTS zz_training_question_cache_truth_reject ON public.training_question_cache;
-- DROP FUNCTION IF EXISTS public.fn_training_cache_reject_invalid_write();
-- DROP FUNCTION IF EXISTS public.fn_training_session_cache_completion();
-- DROP FUNCTION IF EXISTS public.fn_training_answer_cache_event();
-- DROP FUNCTION IF EXISTS public.fn_training_cache_run_drift_audit(date);
-- DROP FUNCTION IF EXISTS public.fn_training_cache_release_restored(uuid[]);
-- DROP FUNCTION IF EXISTS public.fn_training_cache_quarantine_invalid();
-- DROP FUNCTION IF EXISTS public.fn_training_cache_record_served_batch(text, jsonb, uuid);
-- DROP FUNCTION IF EXISTS public.fn_training_cache_record_event(text, text, text, uuid, boolean, jsonb, timestamptz, text);
-- INSERT INTO public.training_question_cache (
--   id, question_id, game_id, engine_type, game_type, level,
--   question_data, generated_at, times_used
-- )
-- SELECT
--   (original_row ->> 'id')::uuid, original_row ->> 'question_id',
--   original_row ->> 'game_id', original_row ->> 'engine_type',
--   original_row ->> 'game_type', (original_row ->> 'level')::integer,
--   original_row -> 'question_data', (original_row ->> 'generated_at')::timestamptz,
--   (original_row ->> 'times_used')::integer
-- FROM public.training_question_cache_quarantine
-- ON CONFLICT (question_id) DO NOTHING;
-- ALTER TABLE public.training_question_cache
--   DROP CONSTRAINT IF EXISTS training_question_cache_counters_check,
--   DROP CONSTRAINT IF EXISTS training_question_cache_content_checksum_check,
--   DROP CONSTRAINT IF EXISTS training_question_cache_lineage_object_check,
--   DROP CONSTRAINT IF EXISTS training_question_cache_policy_object_check,
--   DROP CONSTRAINT IF EXISTS training_question_cache_quality_status_check,
--   DROP CONSTRAINT IF EXISTS training_question_cache_source_classification_check,
--   DROP CONSTRAINT IF EXISTS training_question_cache_kind_check,
--   DROP COLUMN IF EXISTS last_completed_at,
--   DROP COLUMN IF EXISTS last_answered_at,
--   DROP COLUMN IF EXISTS last_served_at,
--   DROP COLUMN IF EXISTS completed_count,
--   DROP COLUMN IF EXISTS correct_count,
--   DROP COLUMN IF EXISTS answered_count,
--   DROP COLUMN IF EXISTS served_count,
--   DROP COLUMN IF EXISTS policy_checksum,
--   DROP COLUMN IF EXISTS content_checksum,
--   DROP COLUMN IF EXISTS lineage,
--   DROP COLUMN IF EXISTS generator_version,
--   DROP COLUMN IF EXISTS source_audited_at,
--   DROP COLUMN IF EXISTS source_created_at,
--   DROP COLUMN IF EXISTS quality_status,
--   DROP COLUMN IF EXISTS machine_id,
--   DROP COLUMN IF EXISTS pipeline_commit,
--   DROP COLUMN IF EXISTS source_checksum,
--   DROP COLUMN IF EXISTS manifest_checksum,
--   DROP COLUMN IF EXISTS manifest_version,
--   DROP COLUMN IF EXISTS solver_binary_checksum,
--   DROP COLUMN IF EXISTS solver_version,
--   DROP COLUMN IF EXISTS policy_version,
--   DROP COLUMN IF EXISTS public_action_history,
--   DROP COLUMN IF EXISTS exact_node,
--   DROP COLUMN IF EXISTS scenario_hash,
--   DROP COLUMN IF EXISTS canonical_policy,
--   DROP COLUMN IF EXISTS source_classification,
--   DROP COLUMN IF EXISTS question_kind;
-- DROP TABLE IF EXISTS public.training_cache_audit_runs;
-- DROP TABLE IF EXISTS public.training_question_events;
-- DROP TABLE IF EXISTS public.training_question_cache_quarantine;
-- DROP FUNCTION IF EXISTS public.fn_training_cache_quarantine_reason(text, jsonb, jsonb);
-- DROP FUNCTION IF EXISTS public.fn_training_cache_row_is_valid(text, jsonb, jsonb, text, jsonb, jsonb, text, text, text, text, text, text, text);
-- DROP FUNCTION IF EXISTS public.fn_training_cache_try_timestamptz(text);
-- DROP FUNCTION IF EXISTS public.fn_training_cache_derive_classification(text, jsonb, jsonb);
-- DROP FUNCTION IF EXISTS public.fn_training_cache_policy_seal_is_valid(jsonb);
-- DROP FUNCTION IF EXISTS public.fn_training_cache_has_distribution(jsonb);
-- COMMIT;

-- =====================================================================
-- 20260907067000_training_cache_function_definition_boundaries.sql
-- =====================================================================
-- TIER:        3
-- AUTHOR:      Codex
-- AFFECTS:     training cache truth trigger and served-batch function
-- IRREVERSIBLE: no
--
-- The expansion migration performs one-time top-level cache UPDATEs after
-- these function declarations. The repository's safe-update audit correctly
-- follows the newest function definition, but deliberately uses migration
-- boundaries rather than a SQL parser. Restating the byte-identical function
-- bodies here gives that audit an unambiguous boundary without rewriting the
-- already-applied expansion migration or changing production semantics.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_training_cache_stamp_row()
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
    NEW.question_data := jsonb_set(
        NEW.question_data, '{id}', to_jsonb(NEW.question_id), true
    );
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

CREATE OR REPLACE FUNCTION public.fn_training_cache_record_served_batch(
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

COMMIT;

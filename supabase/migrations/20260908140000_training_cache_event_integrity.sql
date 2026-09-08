-- =====================================================================
-- 20260908140000_training_cache_event_integrity.sql
-- =====================================================================
-- TIER:        3
-- AUTHOR:      Codex
-- AFFECTS:     training answer provenance and cache event immutability
-- IRREVERSIBLE: yes (unverifiable historical solver labels are not restored)
--
-- Phase 3 certification found four gaps after strict enforcement shipped:
--   1. pre-enforcement answers could still claim solver_verified without a
--      checksum-bound receipt;
--   2. answers written during the rolling window had no event row;
--   3. answered event replays were not bound to the selected action; and
--   4. service_role retained direct mutation grants on the event table.
--
-- Historical rows are preserved, but explicitly classified as unbound. New
-- rows are insert-only, checksum-bound, action-bound evidence.
-- =====================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '5min';

DO $$
BEGIN
    IF to_regclass('public.training_question_cache') IS NULL
       OR to_regclass('public.training_question_events') IS NULL
       OR to_regclass('public.training_answers') IS NULL THEN
        RAISE EXCEPTION 'pre-flight failed: Phase 3 training evidence tables are missing';
    END IF;
    IF to_regprocedure('public.fn_training_cache_record_event(text,text,text,uuid,boolean,jsonb,timestamptz,text)') IS NULL
       OR to_regprocedure('public.fn_training_answer_cache_event()') IS NULL
       OR to_regprocedure('public.fn_training_cache_grade(jsonb,text)') IS NULL THEN
        RAISE EXCEPTION 'pre-flight failed: Phase 3 strict functions are missing';
    END IF;
END $$;

-- Freeze the three write surfaces for the short backfill so no answer can
-- land between the historical scan and the replacement INSERT trigger.
LOCK TABLE public.training_answers IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.training_question_events IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.training_question_cache IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.training_question_events
    ADD COLUMN IF NOT EXISTS binding_status text NOT NULL DEFAULT 'CHECKSUM_BOUND';

COMMENT ON COLUMN public.training_question_events.binding_status IS
    'CHECKSUM_BOUND means the caller supplied the exact served policy checksum and selected action. HISTORICAL_UNBOUND preserves pre-enforcement telemetry without presenting it as policy evidence.';

-- The current trigger rejects checksum-less rows on UPDATE. Remove it while
-- the one-time historical downgrade records the claims it is retiring.
DROP TRIGGER IF EXISTS training_answer_cache_event ON public.training_answers;

UPDATE public.training_answers a
SET evidence_metadata = coalesce(a.evidence_metadata, '{}'::jsonb)
        || jsonb_strip_nulls(jsonb_build_object(
            'historicalPolicyBinding', false,
            'historicalSolverVerifiedClaim', a.solver_verified,
            'historicalSolverSourceClaim', a.solver_source,
            'historicalSelectedFrequencyClaim', a.selected_frequency,
            'historicalOptimalFrequencyClaim', a.optimal_frequency,
            'historicalEvLossMeasuredClaim', a.ev_loss_measured,
            'historicalEvLossClaim', a.ev_loss
        )),
    solver_verified = false,
    solver_source = NULL,
    selected_frequency = NULL,
    optimal_frequency = NULL,
    ev_loss_measured = false,
    ev_loss = 0
WHERE lower(coalesce(a.evidence_metadata ->> 'policyChecksum', ''))
          !~ '^[0-9a-f]{64}$';

-- Every answer event created by the expansion migration was historical. Add
-- the real selected action and make the lack of an original checksum explicit.
UPDATE public.training_question_events e
SET binding_status = 'HISTORICAL_UNBOUND',
    metadata = coalesce(e.metadata, '{}'::jsonb)
        || jsonb_strip_nulls(jsonb_build_object(
            'answerId', a.id,
            'selectedAnswer', a.answer_id,
            'submissionId', a.submission_id,
            'classification', a.classification,
            'solverVerified', false,
            'historicalPolicyBinding', false,
            'currentPolicyChecksumReference', c.policy_checksum
        ))
FROM public.training_answers a
JOIN public.training_question_cache c ON c.question_id = a.question_id
WHERE e.event_type = 'answered'
  AND e.event_key = 'training-answer:' || a.id::text;

-- Backfill the rolling-window answer gap without pretending those answers
-- carried the policy checksum when they were submitted.
INSERT INTO public.training_question_events (
    event_type, event_key, question_id, user_id, is_correct, policy_checksum,
    metadata, occurred_at, binding_status
)
SELECT
    'answered',
    'training-answer:' || a.id::text,
    a.question_id,
    a.user_id,
    a.is_correct,
    c.policy_checksum,
    jsonb_strip_nulls(jsonb_build_object(
        'backfill', true,
        'answerId', a.id,
        'selectedAnswer', a.answer_id,
        'submissionId', a.submission_id,
        'classification', a.classification,
        'solverVerified', false,
        'historicalPolicyBinding', false,
        'currentPolicyChecksumReference', c.policy_checksum
    )),
    coalesce(a.answered_at, now()),
    'HISTORICAL_UNBOUND'
FROM public.training_answers a
JOIN public.training_question_cache c ON c.question_id = a.question_id
WHERE c.quality_status IN ('active', 'active_fallback')
  AND c.policy_checksum IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM public.training_question_events e
      WHERE e.event_type = 'answered'
        AND e.event_key = 'training-answer:' || a.id::text
  );

-- Preserve older direct consumers if any existed during the rolling window.
-- Their own private ledgers provide a recoverable selected action.
UPDATE public.training_question_events e
SET metadata = e.metadata || jsonb_build_object(
        'selectedAnswer', d.selected_action,
        'historicalPolicyBinding', false
    ),
    binding_status = 'HISTORICAL_UNBOUND'
FROM public.training_daily_challenge d
WHERE e.event_type = 'answered'
  AND e.event_key LIKE 'daily-challenge:%'
  AND e.user_id = d.user_id
  AND e.metadata ->> 'dailyId' = d.daily_id
  AND nullif(d.selected_action, '') IS NOT NULL
  AND nullif(e.metadata ->> 'selectedAnswer', '') IS NULL;

UPDATE public.training_question_events e
SET metadata = e.metadata || jsonb_build_object(
        'selectedAnswer', CASE WHEN a.timed_out THEN '__timeout__' ELSE a.selected_answer END,
        'historicalPolicyBinding', false
    ),
    binding_status = 'HISTORICAL_UNBOUND'
FROM public.leak_drill_answers a
WHERE e.event_type = 'answered'
  AND e.event_key = 'leak-drill:' || a.batch_id::text || ':' || a.question_id
  AND nullif(e.metadata ->> 'selectedAnswer', '') IS NULL;

-- If an older direct caller has no recoverable private answer row, retain the
-- event as explicit unbound telemetry. A later replay cannot silently alias it.
UPDATE public.training_question_events e
SET metadata = e.metadata || jsonb_build_object(
        'selectedAnswer', '__historical_unbound__',
        'historicalPolicyBinding', false
    ),
    binding_status = 'HISTORICAL_UNBOUND'
WHERE e.event_type = 'answered'
  AND nullif(e.metadata ->> 'selectedAnswer', '') IS NULL;

UPDATE public.training_question_events e
SET metadata = e.metadata || jsonb_build_object('historicalPolicyBinding', false),
    binding_status = 'HISTORICAL_UNBOUND'
WHERE e.metadata @> '{"backfill":true}'::jsonb
  AND e.event_type <> 'answered';

ALTER TABLE public.training_question_events
    DROP CONSTRAINT IF EXISTS training_question_events_binding_status_check,
    DROP CONSTRAINT IF EXISTS training_question_events_binding_metadata_check,
    ADD CONSTRAINT training_question_events_binding_status_check
        CHECK (binding_status IN ('CHECKSUM_BOUND', 'HISTORICAL_UNBOUND')),
    ADD CONSTRAINT training_question_events_binding_metadata_check CHECK (
        (binding_status = 'HISTORICAL_UNBOUND'
            AND metadata @> '{"historicalPolicyBinding":false}'::jsonb)
        OR
        (binding_status = 'CHECKSUM_BOUND'
            AND NOT metadata @> '{"historicalPolicyBinding":false}'::jsonb)
    );

-- Reconcile materialized counters after filling the rolling-window gap.
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
)
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
WHERE x.question_id = c.question_id;

CREATE OR REPLACE FUNCTION public.fn_training_cache_record_event(
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
    v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
    v_expected_checksum text := lower(coalesce(p_expected_policy_checksum, ''));
    v_selected_answer text;
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
    IF jsonb_typeof(v_metadata) <> 'object' THEN
        RAISE EXCEPTION 'invalid_training_cache_event_metadata';
    END IF;
    IF v_metadata @> '{"historicalPolicyBinding":false}'::jsonb THEN
        RAISE EXCEPTION 'bound_event_cannot_claim_historical_binding';
    END IF;
    IF v_expected_checksum !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'training_cache_event_missing_policy_checksum';
    END IF;

    SELECT * INTO v_cache
    FROM public.training_question_cache c
    WHERE c.question_id = p_question_id
      AND c.quality_status IN ('active', 'active_fallback')
    FOR UPDATE;
    IF v_cache.id IS NULL THEN
        RAISE EXCEPTION 'training_cache_event_question_not_active';
    END IF;
    IF v_expected_checksum <> v_cache.policy_checksum THEN
        RAISE EXCEPTION 'training_cache_event_stale_policy';
    END IF;

    -- Rolling-deploy compatibility: the prior daily-challenge and leak-drill
    -- callers wrote their immutable private answer first but did not repeat it
    -- in event metadata. Resolve only those two known ledgers. Every other
    -- answered caller must supply the action explicitly.
    IF p_event_type = 'answered'
       AND nullif(btrim(v_metadata ->> 'selectedAnswer'), '') IS NULL THEN
        IF v_metadata ->> 'consumer' = 'daily-challenge' THEN
            SELECT d.selected_action INTO v_selected_answer
            FROM public.training_daily_challenge d
            WHERE d.user_id = p_user_id
              AND d.daily_id = v_metadata ->> 'dailyId'
            LIMIT 1;
        ELSIF v_metadata ->> 'consumer' = 'verified-leak-drill' THEN
            SELECT CASE WHEN a.timed_out THEN '__timeout__' ELSE a.selected_answer END
            INTO v_selected_answer
            FROM public.leak_drill_answers a
            WHERE a.user_id = p_user_id
              AND a.batch_id::text = v_metadata ->> 'batchId'
              AND a.question_id = v_cache.id::text
            LIMIT 1;
        END IF;
        IF nullif(btrim(v_selected_answer), '') IS NULL THEN
            RAISE EXCEPTION 'answered_event_requires_selected_answer';
        END IF;
        v_metadata := v_metadata || jsonb_build_object('selectedAnswer', v_selected_answer);
    END IF;

    INSERT INTO public.training_question_events (
        event_type, event_key, question_id, user_id, is_correct, policy_checksum,
        metadata, occurred_at, binding_status
    ) VALUES (
        p_event_type, p_event_key, p_question_id, p_user_id, p_is_correct,
        v_cache.policy_checksum, v_metadata, v_occurred_at, 'CHECKSUM_BOUND'
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
           OR v_existing.policy_checksum <> v_cache.policy_checksum
           OR v_existing.binding_status <> 'CHECKSUM_BOUND'
           OR v_existing.metadata IS DISTINCT FROM v_metadata THEN
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
            times_used = least(2147483647, coalesce(c.times_used, 0)
                + CASE WHEN p_event_type = 'served' THEN 1 ELSE 0 END),
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
        'bindingStatus', 'CHECKSUM_BOUND',
        'policyChecksum', v_cache.policy_checksum,
        'served', coalesce(v_cache.served_count, 0),
        'answered', coalesce(v_cache.answered_count, 0),
        'correct', coalesce(v_cache.correct_count, 0),
        'completed', coalesce(v_cache.completed_count, 0)
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
    IF coalesce(NEW.evidence_metadata ->> 'policyVersion', '') <> v_cache.policy_version
       OR coalesce(NEW.evidence_metadata ->> 'dataQuality', '') <> v_cache.source_classification
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
        jsonb_strip_nulls(jsonb_build_object(
            'answerId', NEW.id,
            'selectedAnswer', NEW.answer_id,
            'submissionId', NEW.submission_id,
            'classification', v_grade ->> 'classification',
            'solverVerified', v_expected_verified,
            'selectedFrequency', v_grade -> 'selectedFrequency',
            'optimalFrequency', v_grade -> 'optimalFrequency',
            'evLossMeasured', v_expected_ev_measured,
            'evLoss', v_grade -> 'evLoss',
            'policyChecksum', v_checksum
        )),
        coalesce(NEW.answered_at, now()),
        v_checksum
    );
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_training_answer_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
        RAISE EXCEPTION 'training_answer_is_immutable';
    END IF;
    RETURN OLD;
END;
$$;

CREATE TRIGGER training_answer_cache_event
AFTER INSERT ON public.training_answers
FOR EACH ROW EXECUTE FUNCTION public.fn_training_answer_cache_event();

DROP TRIGGER IF EXISTS training_answer_reject_mutation ON public.training_answers;
CREATE TRIGGER training_answer_reject_mutation
BEFORE UPDATE ON public.training_answers
FOR EACH ROW EXECUTE FUNCTION public.fn_training_answer_reject_mutation();

-- Direct writes can bypass the atomic counter update. Only the definer-owned
-- RPC may mutate the event ledger; service_role receives read access only.
REVOKE ALL PRIVILEGES ON TABLE public.training_question_events FROM service_role;
GRANT SELECT ON TABLE public.training_question_events TO service_role;

REVOKE ALL ON FUNCTION public.fn_training_cache_record_event(
    text, text, text, uuid, boolean, jsonb, timestamptz, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_training_cache_record_event(
    text, text, text, uuid, boolean, jsonb, timestamptz, text
) TO service_role;
REVOKE ALL ON FUNCTION public.fn_training_answer_cache_event()
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_training_answer_reject_mutation()
    FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
    v_bad integer;
BEGIN
    SELECT count(*) INTO v_bad
    FROM public.training_answers a
    WHERE a.solver_verified
      AND lower(coalesce(a.evidence_metadata ->> 'policyChecksum', ''))
            !~ '^[0-9a-f]{64}$';
    IF v_bad <> 0 THEN
        RAISE EXCEPTION 'post-apply failed: % unbound answers still claim solver verification', v_bad;
    END IF;

    SELECT count(*) INTO v_bad
    FROM public.training_answers a
    JOIN public.training_question_cache c ON c.question_id = a.question_id
    WHERE c.quality_status IN ('active', 'active_fallback')
      AND NOT EXISTS (
          SELECT 1 FROM public.training_question_events e
          WHERE e.event_type = 'answered'
            AND e.event_key = 'training-answer:' || a.id::text
      );
    IF v_bad <> 0 THEN
        RAISE EXCEPTION 'post-apply failed: % active-cache answers have no event', v_bad;
    END IF;

    SELECT count(*) INTO v_bad
    FROM public.training_question_events e
    WHERE e.event_type = 'answered'
      AND nullif(btrim(e.metadata ->> 'selectedAnswer'), '') IS NULL;
    IF v_bad <> 0 THEN
        RAISE EXCEPTION 'post-apply failed: % answer events have no selected action', v_bad;
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
    SELECT count(*) INTO v_bad
    FROM public.training_question_cache c
    JOIN expected x ON x.question_id = c.question_id
    WHERE c.served_count <> x.served
       OR c.answered_count <> x.answered
       OR c.correct_count <> x.correct
       OR c.completed_count <> x.completed
       OR c.times_used <> least(2147483647, x.served)::integer;
    IF v_bad <> 0 THEN
        RAISE EXCEPTION 'post-apply failed: % cache counters disagree with the ledger', v_bad;
    END IF;

    SELECT count(*) INTO v_bad
    FROM information_schema.role_table_grants g
    WHERE g.table_schema = 'public'
      AND g.table_name = 'training_question_events'
      AND g.grantee = 'service_role'
      AND g.privilege_type <> 'SELECT';
    IF v_bad <> 0 THEN
        RAISE EXCEPTION 'post-apply failed: service_role still has % event mutation grants', v_bad;
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- ROLLBACK (manual, only if application is rolled back first):
-- BEGIN;
-- DROP TRIGGER IF EXISTS training_answer_reject_mutation ON public.training_answers;
-- DROP FUNCTION IF EXISTS public.fn_training_answer_reject_mutation();
-- DROP TRIGGER IF EXISTS training_answer_cache_event ON public.training_answers;
-- Recreate fn_training_answer_cache_event and fn_training_cache_record_event
-- from 20260907070000_training_cache_truth_enforcement.sql, then recreate the
-- original AFTER INSERT OR UPDATE trigger. Historical provenance downgrades
-- are retained because restoring unverifiable solver claims is unsafe.
-- ALTER TABLE public.training_question_events
--   DROP CONSTRAINT IF EXISTS training_question_events_binding_metadata_check,
--   DROP CONSTRAINT IF EXISTS training_question_events_binding_status_check,
--   DROP COLUMN IF EXISTS binding_status;
-- Keep service_role SELECT-only on training_question_events; application writes
-- remain behind the security-definer event RPC even after an application rollback.
-- COMMIT;

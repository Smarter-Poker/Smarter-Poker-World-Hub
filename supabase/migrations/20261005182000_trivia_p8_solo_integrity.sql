-- ============================================================================
-- Trivia Phase 8: trustworthy reports, durable neutral voids and settlement identity
-- ============================================================================
-- TIER:        3
-- AUTHOR:      Codex Phase 8 core solo UI
-- AFFECTS:     trivia sessions, session answers, report/answer/settlement RPCs
-- IRREVERSIBLE: yes (durable void and request evidence is intentionally retained)
--
-- WHY:
--   A caller-provided report session was not bound to the reported question;
--   invalid-question recording was split across mutable API reads and a normal
--   skip write; settlement trusted only one field of a previously observed
--   grade; and replaying an old Daily session could mint a current-day bonus.
--
-- HOW:
-- 1. Bind reports to a served canonical question/revision and serialize each
--    canonical threshold decision.
-- 2. Record a server void atomically, durably and without ever returning an
--    answer key. Both V3 rows and legacy JSON sessions are supported.
-- 3. Re-grade under the settlement lock and require the complete grade basis
--    to match before money moves.
-- 4. Preserve one immutable settlement request id and permit a Daily bonus
--    only for the transaction that changed an open session to submitted.
-- ============================================================================
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '10min';

DO $$
BEGIN
    IF to_regprocedure('public.trivia_submit_question_report_v1(uuid,uuid,text,text,uuid)') IS NULL
       OR to_regprocedure('public.award_trivia_run(uuid,integer,integer,integer,integer)') IS NULL
       OR to_regprocedure('public.trivia_session_answer_v3(uuid,uuid,uuid,integer,uuid)') IS NULL
       OR to_regprocedure('public.trivia_session_settle_solo_v3(uuid,uuid,integer,integer,uuid)') IS NULL
       OR to_regprocedure('public.trivia_p3_grade(uuid)') IS NULL
       OR to_regprocedure('public.trivia_p3_forbid_mutation()') IS NULL THEN
        RAISE EXCEPTION 'trivia p8 pre-flight failed: required Phase 3 functions are missing';
    END IF;
    IF to_regclass('public.trivia_session_answers') IS NULL
       OR to_regclass('public.trivia_question_curation') IS NULL
       OR to_regclass('public.trivia_question_revisions') IS NULL
       OR to_regclass('public.trivia_question_quarantine') IS NULL
       OR to_regclass('public.solved_spots_gold') IS NULL
       OR to_regclass('public.training_solver_artifact_catalog') IS NULL
       OR to_regclass('public.training_solver_provenance_authority') IS NULL
       OR NOT EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'trivia_sessions' AND column_name = 'question_ids')
       OR NOT EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'trivia_questions' AND column_name = 'engine_metadata') THEN
        RAISE EXCEPTION 'trivia p8 pre-flight failed: required session provenance schema is missing';
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND ((table_name = 'trivia_sessions' AND column_name IN ('settlement_request_id','question_revision_ids'))
             OR (table_name = 'trivia_session_answers' AND column_name IN ('server_voided_at','server_void_reason'))
             OR (table_name = 'trivia_question_revisions' AND column_name = 'engine_metadata'))
    ) THEN
        RAISE EXCEPTION 'trivia p8 pre-flight failed: additive evidence columns already exist';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.trivia_question_revisions'::regclass
           AND conname = 'trivia_question_revisions_question_id_content_hash_key'
           AND contype = 'u') THEN
        RAISE EXCEPTION 'trivia p8 pre-flight failed: revision content uniqueness contract is missing';
    END IF;
END $$;

ALTER TABLE public.trivia_sessions
    ADD COLUMN settlement_request_id uuid,
    ADD COLUMN question_revision_ids jsonb;

ALTER TABLE public.trivia_session_answers
    ADD COLUMN server_voided_at timestamptz,
    ADD COLUMN server_void_reason text;

ALTER TABLE public.trivia_question_revisions
    ADD COLUMN engine_metadata jsonb;

-- The Phase 3 append-only guard is removed only inside this transaction so
-- existing immutable revisions can receive an explicit "unknown" snapshot.
-- Current trivia_questions metadata is not historical evidence and must never
-- be copied onto a revision captured before this migration.
DROP TRIGGER trg_trivia_question_revisions_append_only ON public.trivia_question_revisions;
UPDATE public.trivia_question_revisions r
   SET engine_metadata = '{}'::jsonb;
ALTER TABLE public.trivia_question_revisions
    ALTER COLUMN engine_metadata SET DEFAULT '{}'::jsonb,
    ALTER COLUMN engine_metadata SET NOT NULL,
    DROP CONSTRAINT trivia_question_revisions_question_id_content_hash_key,
    ADD CONSTRAINT trivia_question_revisions_content_metadata_key
        UNIQUE (question_id, content_hash, engine_metadata);
CREATE TRIGGER trg_trivia_question_revisions_append_only BEFORE UPDATE OR DELETE
    ON public.trivia_question_revisions FOR EACH ROW EXECUTE FUNCTION public.trivia_p3_forbid_mutation();

-- Reconstruct legacy provenance from the newest revision that existed when
-- each session began. A question with no such revision stays unmapped; all
-- Phase 8 legacy consumers fail closed on that gap instead of using live rows.
UPDATE public.trivia_sessions s
   SET question_revision_ids = coalesce((
       SELECT jsonb_object_agg(x.question_id::text, x.revision_id ORDER BY x.ordinality)
         FROM (
             SELECT q.question_id, q.ordinality, (
                 SELECT r.id
                   FROM public.trivia_question_revisions r
                  WHERE r.question_id = q.question_id
                    AND r.captured_at <= s.created_at
                  ORDER BY r.captured_at DESC, r.revision_no DESC
                  LIMIT 1) AS revision_id
               FROM unnest(coalesce(s.question_ids, '{}'::uuid[]))
                    WITH ORDINALITY q(question_id, ordinality)
         ) x
        WHERE x.revision_id IS NOT NULL
   ), '{}'::jsonb)
 WHERE s.engine_version IS NULL;
UPDATE public.trivia_sessions SET question_revision_ids = '{}'::jsonb
 WHERE question_revision_ids IS NULL;
ALTER TABLE public.trivia_sessions
    ALTER COLUMN question_revision_ids SET DEFAULT '{}'::jsonb,
    ALTER COLUMN question_revision_ids SET NOT NULL;

ALTER TABLE public.trivia_session_answers
    ADD CONSTRAINT trivia_session_answers_server_void_check CHECK (
        (server_voided_at IS NULL AND server_void_reason IS NULL)
        OR (server_voided_at IS NOT NULL
            AND server_void_reason IN ('structural','audit','quarantine')
            AND outcome = 'skip'
            AND display_index = -1
            AND original_index IS NULL
            AND is_correct IS FALSE)
    );

-- Recorded player answers stay immutable. The only later transition is an
-- authoritative neutralization after the bound revision or live question has
-- become invalid. The trigger independently verifies that evidence, so even a
-- privileged direct table update cannot manufacture a server void.
CREATE OR REPLACE FUNCTION public.trivia_session_answer_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE
    v_reason text;
BEGIN
    IF TG_OP <> 'UPDATE' THEN
        RAISE EXCEPTION 'trivia_session_answers rows are never deleted' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.session_id <> OLD.session_id OR NEW.position <> OLD.position
       OR NEW.question_id <> OLD.question_id OR NEW.revision_id <> OLD.revision_id
       OR NEW.option_count <> OLD.option_count OR NEW.actor_type <> OLD.actor_type
       OR (OLD.opened_at IS NOT NULL AND NEW.opened_at IS DISTINCT FROM OLD.opened_at)
       OR (OLD.opened_at IS NOT NULL AND NEW.deadline_at IS DISTINCT FROM OLD.deadline_at) THEN
        RAISE EXCEPTION 'a recorded answer is immutable' USING ERRCODE = 'check_violation';
    END IF;
    -- Whether the row was unanswered or already answered, the first durable
    -- void transition is accepted only when its complete mutation shape and
    -- live authority evidence agree. This closes the direct-table path that
    -- would otherwise be able to manufacture a server void on an empty row.
    IF OLD.server_voided_at IS NULL AND NEW.server_voided_at IS NOT NULL THEN
        IF NEW.server_void_reason IN ('structural','audit','quarantine')
           AND NEW.outcome = 'skip' AND NEW.display_index = -1
           AND NEW.original_index IS NULL AND NEW.is_correct IS FALSE
           AND NEW.answered_at IS NOT NULL AND NEW.sequence IS NOT NULL
           AND NEW.opened_at IS NOT DISTINCT FROM OLD.opened_at
           AND NEW.deadline_at IS NOT DISTINCT FROM OLD.deadline_at
           AND (OLD.outcome IS NULL OR NEW.client_nonce IS NOT DISTINCT FROM OLD.client_nonce)
           AND (to_jsonb(NEW) - ARRAY['answered_at','display_index','original_index','is_correct',
                    'outcome','sequence','client_nonce','server_voided_at','server_void_reason'])
               IS NOT DISTINCT FROM
               (to_jsonb(OLD) - ARRAY['answered_at','display_index','original_index','is_correct',
                    'outcome','sequence','client_nonce','server_voided_at','server_void_reason']) THEN
            SELECT CASE
                       WHEN r.structurally_valid IS FALSE THEN 'structural'
                       WHEN q.audit_verified IS FALSE THEN 'audit'
                       WHEN EXISTS (
                           SELECT 1 FROM public.trivia_question_quarantine z
                            WHERE z.question_id = q.id AND z.released_at IS NULL)
                           THEN 'quarantine'
                   END
              INTO v_reason
              FROM public.trivia_question_revisions r
              JOIN public.trivia_questions q ON q.id = r.question_id
             WHERE r.id = NEW.revision_id AND q.id = NEW.question_id;
            IF v_reason IS NOT DISTINCT FROM NEW.server_void_reason THEN
                RETURN NEW;
            END IF;
        END IF;
        RAISE EXCEPTION 'a recorded answer is immutable' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.outcome IS NOT NULL AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
        RAISE EXCEPTION 'a recorded answer is immutable' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER trg_trivia_session_answer_guard_v1 ON public.trivia_session_answers;
CREATE TRIGGER trg_trivia_session_answer_guard_v1
    BEFORE UPDATE OR DELETE ON public.trivia_session_answers
    FOR EACH ROW EXECUTE FUNCTION public.trivia_session_answer_guard_v1();

COMMENT ON COLUMN public.trivia_sessions.settlement_request_id IS
    'First successful settlement request identity. Null on pre-Phase-8 historical settlements; once set it is immutable.';
COMMENT ON COLUMN public.trivia_sessions.question_revision_ids IS
    'Immutable question-id to served-revision-id map. Missing legacy keys mean provenance unavailable and must fail closed.';
COMMENT ON COLUMN public.trivia_session_answers.server_voided_at IS
    'Server clock when an invalid served question was atomically neutralized. Never player asserted.';
COMMENT ON COLUMN public.trivia_session_answers.server_void_reason IS
    'Authoritative neutralization reason: structural, audit, or quarantine.';
COMMENT ON COLUMN public.trivia_question_revisions.engine_metadata IS
    'Immutable server-only strategy/solver metadata captured with the served revision.';

CREATE TABLE public.trivia_gto_render_claims (
    cache_digest text PRIMARY KEY CHECK (cache_digest ~ '^[0-9a-f]{64}$'),
    owner_token uuid NOT NULL,
    lease_expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.trivia_gto_render_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_gto_render_claims FORCE ROW LEVEL SECURITY;
COMMENT ON TABLE public.trivia_gto_render_claims IS
    'Bounded cross-request ownership for one GTO render digest; correctness never depends on scheduled cleanup.';

CREATE OR REPLACE FUNCTION public.trivia_claim_gto_render_v1(
    p_cache_digest text, p_owner_token uuid, p_lease_seconds integer DEFAULT 300)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE
    v_now timestamptz := clock_timestamp();
    v_seconds integer := greatest(60, least(coalesce(p_lease_seconds, 300), 600));
    v_claim public.trivia_gto_render_claims%ROWTYPE;
    v_retry bigint;
BEGIN
    IF p_cache_digest IS NULL OR p_cache_digest !~ '^[0-9a-f]{64}$' OR p_owner_token IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_arguments');
    END IF;
    INSERT INTO public.trivia_gto_render_claims AS c
        (cache_digest, owner_token, lease_expires_at, created_at, updated_at)
    VALUES (p_cache_digest, p_owner_token, v_now + make_interval(secs => v_seconds), v_now, v_now)
    ON CONFLICT (cache_digest) DO UPDATE
       SET owner_token = EXCLUDED.owner_token,
           lease_expires_at = EXCLUDED.lease_expires_at,
           updated_at = EXCLUDED.updated_at
     WHERE c.lease_expires_at <= v_now
    RETURNING * INTO v_claim;
    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'acquired', true,
            'leaseExpiresAt', v_claim.lease_expires_at);
    END IF;
    SELECT * INTO v_claim FROM public.trivia_gto_render_claims
     WHERE cache_digest = p_cache_digest;
    v_retry := greatest(250, least(600000,
        ceil(extract(epoch FROM (coalesce(v_claim.lease_expires_at, v_now) - v_now)) * 1000)::bigint));
    RETURN jsonb_build_object('success', true, 'acquired', false,
        'leaseExpiresAt', v_claim.lease_expires_at, 'retryAfterMs', v_retry);
END $$;

CREATE OR REPLACE FUNCTION public.trivia_release_gto_render_v1(
    p_cache_digest text, p_owner_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
BEGIN
    IF p_cache_digest IS NULL OR p_cache_digest !~ '^[0-9a-f]{64}$' OR p_owner_token IS NULL THEN
        RETURN false;
    END IF;
    DELETE FROM public.trivia_gto_render_claims
     WHERE cache_digest = p_cache_digest AND owner_token = p_owner_token;
    RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.trivia_session_settlement_request_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
BEGIN
    IF OLD.settlement_request_id IS NOT NULL THEN
        IF NEW.settlement_request_id IS DISTINCT FROM OLD.settlement_request_id THEN
            RAISE EXCEPTION 'settlement request identity is immutable' USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.settlement_result IS DISTINCT FROM OLD.settlement_result THEN
            RAISE EXCEPTION 'settlement result is immutable after request identity is sealed'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    IF OLD.settlement_request_id IS NULL AND NEW.settlement_request_id IS NOT NULL THEN
        IF OLD.status <> 'submitted' OR NEW.status <> 'submitted'
           OR NEW.settlement_result IS NULL
           OR (to_jsonb(NEW) - ARRAY['settlement_request_id','settlement_result'])
              IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['settlement_request_id','settlement_result']) THEN
            RAISE EXCEPTION 'settlement request identity can only seal an atomically completed settlement'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_trivia_session_settlement_request_guard_v1
    BEFORE UPDATE ON public.trivia_sessions
    FOR EACH ROW EXECUTE FUNCTION public.trivia_session_settlement_request_guard_v1();

CREATE OR REPLACE FUNCTION public.trivia_session_revision_map_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE
    v_map jsonb;
    v_bound record;
    v_permutation jsonb;
    v_option_count integer;
    v_indexes integer[];
    v_expected integer[];
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT coalesce(jsonb_object_agg(q.question_id::text, c.current_revision_id ORDER BY q.ordinality), '{}'::jsonb)
          INTO v_map
          FROM unnest(coalesce(NEW.question_ids, '{}'::uuid[])) WITH ORDINALITY q(question_id, ordinality)
          JOIN public.trivia_question_curation c ON c.question_id = q.question_id;
        IF (SELECT count(*) FROM jsonb_object_keys(v_map))
                <> cardinality(coalesce(NEW.question_ids, '{}'::uuid[])) THEN
            RAISE EXCEPTION 'revision_provenance_unavailable' USING ERRCODE = 'check_violation';
        END IF;

        -- The caller can compute permutations before a concurrent curation
        -- advance. Validate against the exact revisions selected above so a
        -- mismatched roster insert (and its enclosing entry charge) rolls back.
        FOR v_bound IN
            SELECT q.question_id, r.options
              FROM unnest(coalesce(NEW.question_ids, '{}'::uuid[]))
                   WITH ORDINALITY q(question_id, ordinality)
              JOIN public.trivia_question_revisions r
                ON r.id = (v_map ->> q.question_id::text)::uuid
             ORDER BY q.ordinality
        LOOP
            v_permutation := NEW.permutations -> v_bound.question_id::text;
            IF jsonb_typeof(v_bound.options) IS DISTINCT FROM 'array'
               OR jsonb_typeof(v_permutation) IS DISTINCT FROM 'array' THEN
                RAISE EXCEPTION 'session permutation does not match bound revision'
                    USING ERRCODE = 'check_violation';
            END IF;
            v_option_count := jsonb_array_length(v_bound.options);
            IF v_option_count < 1 OR jsonb_array_length(v_permutation) <> v_option_count
               OR EXISTS (
                    SELECT 1 FROM jsonb_array_elements(v_permutation) e(value)
                     WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'number'
                        OR e.value::text !~ '^[0-9]+$') THEN
                RAISE EXCEPTION 'session permutation does not match bound revision'
                    USING ERRCODE = 'check_violation';
            END IF;
            SELECT array_agg(e.value::text::integer ORDER BY e.value::text::integer)
              INTO v_indexes FROM jsonb_array_elements(v_permutation) e(value);
            SELECT array_agg(i ORDER BY i) INTO v_expected
              FROM generate_series(0, v_option_count - 1) i;
            IF v_indexes IS DISTINCT FROM v_expected THEN
                RAISE EXCEPTION 'session permutation does not match bound revision'
                    USING ERRCODE = 'check_violation';
            END IF;
        END LOOP;
        NEW.question_revision_ids := v_map;
        RETURN NEW;
    END IF;
    IF NEW.question_ids IS DISTINCT FROM OLD.question_ids THEN
        RAISE EXCEPTION 'trivia session roster is immutable' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.question_revision_ids IS DISTINCT FROM OLD.question_revision_ids THEN
        RAISE EXCEPTION 'trivia session revision provenance is immutable' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_trivia_session_revision_map_guard_v1
    BEFORE INSERT OR UPDATE OF question_ids, question_revision_ids ON public.trivia_sessions
    FOR EACH ROW EXECUTE FUNCTION public.trivia_session_revision_map_guard_v1();

CREATE OR REPLACE FUNCTION public.trivia_bind_revision_engine_metadata_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
BEGIN
    SELECT coalesce(q.engine_metadata, '{}'::jsonb) INTO NEW.engine_metadata
      FROM public.trivia_questions q WHERE q.id = NEW.question_id;
    NEW.engine_metadata := coalesce(NEW.engine_metadata, '{}'::jsonb);
    RETURN NEW;
END $$;

CREATE TRIGGER trg_trivia_bind_revision_engine_metadata_v1
    BEFORE INSERT ON public.trivia_question_revisions
    FOR EACH ROW EXECUTE FUNCTION public.trivia_bind_revision_engine_metadata_v1();

-- Preserve the unknown metadata on every historical revision. For questions
-- that currently have strategy metadata, capture a new revision at migration
-- time and advance only curation's future-serving pointer to that revision.
-- Sessions already bound to older revisions therefore remain fail-closed.
WITH metadata_baseline AS (
    INSERT INTO public.trivia_question_revisions (
        question_id, revision_no, content_hash, question, options, correct_index,
        explanation, category, subcategory, difficulty, fingerprint,
        content_version, source, reading_words, min_timer_seconds,
        structurally_valid, capture_reason, engine_metadata)
    SELECT r.question_id,
           (SELECT coalesce(max(rr.revision_no), 0) + 1
              FROM public.trivia_question_revisions rr
             WHERE rr.question_id = r.question_id),
           r.content_hash, r.question, r.options, r.correct_index, r.explanation,
           r.category, r.subcategory, r.difficulty, r.fingerprint,
           r.content_version, r.source, r.reading_words, r.min_timer_seconds,
           r.structurally_valid, 'content_update', q.engine_metadata
      FROM public.trivia_question_curation c
      JOIN public.trivia_question_revisions r ON r.id = c.current_revision_id
      JOIN public.trivia_questions q ON q.id = c.question_id
     WHERE coalesce(q.engine_metadata, '{}'::jsonb) <> '{}'::jsonb
    RETURNING question_id, id
)
UPDATE public.trivia_question_curation c
   SET current_revision_id = b.id, updated_at = now()
  FROM metadata_baseline b
 WHERE c.question_id = b.question_id;

-- Preserve the Phase 3 curation behavior while making strategy metadata part
-- of the immutable revision identity. The content hash remains content-only so
-- existing integrity tooling stays compatible; uniqueness also includes the
-- captured metadata and therefore permits a metadata-only revision.
CREATE OR REPLACE FUNCTION public.trivia_capture_question_revision_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE
    v_hash text;
    v_metadata jsonb := coalesce(NEW.engine_metadata, '{}'::jsonb);
    v_latest record;
    v_rev uuid;
    v_old_fp text;
    v_canon uuid;
    v_promoted uuid;
BEGIN
    v_hash := public.trivia_question_content_hash_v1(NEW.question, NEW.options, NEW.correct_index,
        NEW.explanation, NEW.category, NEW.subcategory, NEW.difficulty);
    SELECT id, revision_no, content_hash, engine_metadata INTO v_latest
      FROM public.trivia_question_revisions WHERE question_id = NEW.id
     ORDER BY revision_no DESC LIMIT 1;
    IF FOUND AND v_latest.content_hash = v_hash
       AND v_latest.engine_metadata IS NOT DISTINCT FROM v_metadata THEN
        v_rev := v_latest.id;
    ELSE
        SELECT id INTO v_rev FROM public.trivia_question_revisions
         WHERE question_id = NEW.id AND content_hash = v_hash
           AND engine_metadata IS NOT DISTINCT FROM v_metadata
         ORDER BY revision_no DESC LIMIT 1;
        IF v_rev IS NULL THEN
            INSERT INTO public.trivia_question_revisions (question_id, revision_no, content_hash, question,
                options, correct_index, explanation, category, subcategory, difficulty, fingerprint, source,
                reading_words, min_timer_seconds, structurally_valid, capture_reason, engine_metadata)
            VALUES (NEW.id, coalesce(v_latest.revision_no, 0) + 1, v_hash, NEW.question, NEW.options,
                NEW.correct_index, NEW.explanation, NEW.category, NEW.subcategory, NEW.difficulty,
                NEW.question_fingerprint, NEW.source,
                public.trivia_reading_words_v1(NEW.question, NEW.options),
                public.trivia_min_timer_seconds_v1(NEW.question, NEW.options),
                public.trivia_question_structure_ok_v1(NEW.question, NEW.options, NEW.correct_index,
                    NEW.category, NEW.difficulty),
                CASE WHEN TG_OP = 'INSERT' THEN 'insert' ELSE 'content_update' END, v_metadata)
            RETURNING id INTO v_rev;
        END IF;
    END IF;

    SELECT fingerprint INTO v_old_fp FROM public.trivia_question_curation WHERE question_id = NEW.id;
    IF NOT FOUND THEN
        SELECT c.canonical_question_id INTO v_canon FROM public.trivia_question_curation c
         WHERE c.fingerprint = NEW.question_fingerprint AND c.canonical_reason <> 'alias'
         ORDER BY c.created_at, c.question_id LIMIT 1;
        INSERT INTO public.trivia_question_curation (question_id, current_revision_id, fingerprint,
            canonical_question_id, canonical_reason, modes, source, provenance)
        VALUES (NEW.id, v_rev, NEW.question_fingerprint, coalesce(v_canon, NEW.id),
            CASE WHEN v_canon IS NULL THEN 'sole' ELSE 'alias' END,
            public.trivia_default_modes_v1(NEW.category), NEW.source,
            jsonb_build_object('source', NEW.source, 'created_at', NEW.created_at,
                'baseline_quality', NEW.quality_score, 'captured_by', 'trivia_capture_question_revision_v1'));
        IF v_canon IS NOT NULL THEN
            UPDATE public.trivia_question_curation SET canonical_reason = 'group_canonical', updated_at = now()
             WHERE question_id = v_canon AND canonical_reason = 'sole';
        END IF;
        RETURN NULL;
    END IF;

    UPDATE public.trivia_question_curation
       SET current_revision_id = v_rev,
           modes = CASE WHEN TG_OP = 'UPDATE' AND NEW.category IS DISTINCT FROM OLD.category
                        THEN public.trivia_default_modes_v1(NEW.category) ELSE modes END,
           updated_at = now()
     WHERE question_id = NEW.id;

    IF v_old_fp IS DISTINCT FROM NEW.question_fingerprint THEN
        SELECT c.question_id INTO v_promoted
          FROM public.trivia_question_curation c JOIN public.trivia_questions q ON q.id = c.question_id
         WHERE c.fingerprint = v_old_fp AND c.question_id <> NEW.id AND c.canonical_question_id = NEW.id
         ORDER BY (coalesce(q.quality_score, 0) >= 6) DESC,
                  CASE WHEN q.audit_verified IS TRUE THEN 0 WHEN q.audit_verified IS NULL THEN 1 ELSE 2 END,
                  q.quality_score DESC NULLS LAST, q.created_at ASC NULLS LAST, q.id ASC
         LIMIT 1;
        IF v_promoted IS NOT NULL THEN
            UPDATE public.trivia_question_curation
               SET canonical_question_id = v_promoted,
                   canonical_reason = CASE WHEN question_id = v_promoted THEN 'group_canonical' ELSE 'alias' END,
                   updated_at = now()
             WHERE fingerprint = v_old_fp AND question_id <> NEW.id;
            UPDATE public.trivia_question_curation SET canonical_reason = 'sole', updated_at = now()
             WHERE question_id = v_promoted
               AND NOT EXISTS (SELECT 1 FROM public.trivia_question_curation o
                                WHERE o.fingerprint = v_old_fp AND o.question_id <> v_promoted
                                  AND o.question_id <> NEW.id);
        END IF;
        SELECT c.canonical_question_id INTO v_canon FROM public.trivia_question_curation c
         WHERE c.fingerprint = NEW.question_fingerprint AND c.question_id <> NEW.id
           AND c.canonical_reason <> 'alias'
         ORDER BY c.created_at, c.question_id LIMIT 1;
        UPDATE public.trivia_question_curation
           SET fingerprint = NEW.question_fingerprint,
               canonical_question_id = coalesce(v_canon, NEW.id),
               canonical_reason = CASE WHEN v_canon IS NULL THEN 'sole' ELSE 'alias' END,
               updated_at = now()
         WHERE question_id = NEW.id;
        IF v_canon IS NOT NULL THEN
            UPDATE public.trivia_question_curation SET canonical_reason = 'group_canonical', updated_at = now()
             WHERE question_id = v_canon AND canonical_reason = 'sole';
        END IF;
    END IF;
    RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.trivia_capture_engine_metadata_revision_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE
    v_current public.trivia_question_revisions%ROWTYPE;
    v_hash text;
    v_rev uuid;
    v_revision_no integer;
BEGIN
    IF NEW.engine_metadata IS NOT DISTINCT FROM OLD.engine_metadata THEN RETURN NULL; END IF;
    v_hash := public.trivia_question_content_hash_v1(NEW.question, NEW.options, NEW.correct_index,
        NEW.explanation, NEW.category, NEW.subcategory, NEW.difficulty);
    SELECT r.* INTO v_current
      FROM public.trivia_question_curation c
      JOIN public.trivia_question_revisions r ON r.id = c.current_revision_id
     WHERE c.question_id = NEW.id FOR UPDATE OF c;
    -- A simultaneous content update is captured by the existing content
    -- trigger, whose insert binder writes NEW.engine_metadata.
    IF NOT FOUND OR v_current.content_hash <> v_hash
       OR v_current.engine_metadata IS NOT DISTINCT FROM coalesce(NEW.engine_metadata, '{}'::jsonb) THEN
        RETURN NULL;
    END IF;
    SELECT coalesce(max(revision_no), 0) + 1 INTO v_revision_no
      FROM public.trivia_question_revisions WHERE question_id = NEW.id;
    INSERT INTO public.trivia_question_revisions (question_id, revision_no, content_hash, question, options,
        correct_index, explanation, category, subcategory, difficulty, fingerprint, content_version, source,
        reading_words, min_timer_seconds, structurally_valid, capture_reason, engine_metadata)
    VALUES (v_current.question_id, v_revision_no, v_current.content_hash, v_current.question, v_current.options,
        v_current.correct_index, v_current.explanation, v_current.category, v_current.subcategory,
        v_current.difficulty, v_current.fingerprint, v_current.content_version, v_current.source,
        v_current.reading_words, v_current.min_timer_seconds, v_current.structurally_valid,
        'content_update', coalesce(NEW.engine_metadata, '{}'::jsonb))
    RETURNING id INTO v_rev;
    UPDATE public.trivia_question_curation SET current_revision_id = v_rev, updated_at = now()
     WHERE question_id = NEW.id;
    RETURN NULL;
END $$;

CREATE TRIGGER trg_trivia_capture_engine_metadata_revision_v1
    AFTER UPDATE OF engine_metadata ON public.trivia_questions
    FOR EACH ROW EXECUTE FUNCTION public.trivia_capture_engine_metadata_revision_v1();

CREATE OR REPLACE FUNCTION public.trivia_submit_question_report_v2(
    p_user_id uuid, p_question_id uuid, p_reason text, p_note text DEFAULT NULL, p_session_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE
    s public.trivia_sessions%ROWTYPE;
    v_existing uuid;
    v_canon uuid;
    v_rev uuid;
    v_established boolean;
    v_valid boolean;
    v_id uuid;
    v_threshold integer;
    v_reporters integer;
    v_quarantined boolean := false;
BEGIN
    IF p_user_id IS NULL OR p_question_id IS NULL OR p_reason IS NULL
       OR p_reason NOT IN ('wrong_answer','unclear','duplicate','offensive','broken','other') THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_arguments');
    END IF;
    IF p_note IS NOT NULL AND length(p_note) > 500 THEN
        RETURN jsonb_build_object('success', false, 'error', 'note_too_long');
    END IF;
    IF p_session_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_required');
    END IF;
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id FOR SHARE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'session_not_found'); END IF;
    IF s.user_id IS DISTINCT FROM p_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_your_session');
    END IF;
    IF array_position(s.question_ids, p_question_id) IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'question_not_in_session');
    END IF;

    -- A report is evidence about the exact served question and immutable
    -- revision. Canonical siblings and the mutable current revision are never
    -- accepted as substitutes; canonical identity is used only for threshold
    -- serialization and serving exclusion.
    IF s.engine_version IS NOT NULL THEN
        SELECT a.revision_id INTO v_rev
          FROM public.trivia_session_answers a
         WHERE a.session_id = s.id AND a.question_id = p_question_id;
    ELSE
        BEGIN
            v_rev := (s.question_revision_ids ->> p_question_id::text)::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
            v_rev := NULL;
        END;
    END IF;
    IF v_rev IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.trivia_question_revisions r
         WHERE r.id = v_rev AND r.question_id = p_question_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable');
    END IF;
    SELECT c.canonical_question_id INTO v_canon
      FROM public.trivia_question_curation c
     WHERE c.question_id = p_question_id
     FOR SHARE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'question_not_found'); END IF;

    -- One reporter cannot race their limits, and one canonical question cannot
    -- race its quarantine threshold across aliases or simultaneous reporters.
    PERFORM pg_advisory_xact_lock(hashtextextended('trivia_report_user:' || p_user_id::text, 0));
    PERFORM pg_advisory_xact_lock(hashtextextended('trivia_report_canonical:' || v_canon::text, 0));
    SELECT id INTO v_existing FROM public.trivia_question_reports
     WHERE user_id = p_user_id AND question_id = p_question_id AND state IN ('open','triaged') LIMIT 1;
    IF v_existing IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'duplicate', true, 'report_id', v_existing);
    END IF;
    IF (SELECT count(*) FROM public.trivia_question_reports
         WHERE user_id = p_user_id AND created_at > now() - interval '24 hours') >= 10 THEN
        RETURN jsonb_build_object('success', false, 'error', 'daily_report_limit');
    END IF;
    IF (SELECT count(*) FROM public.trivia_question_reports
         WHERE user_id = p_user_id AND state IN ('open','triaged')) >= 25 THEN
        RETURN jsonb_build_object('success', false, 'error', 'open_report_limit');
    END IF;

    -- Horses are players: reporter establishment is based on account age, not
    -- actor type. Browser/API authentication remains the gate to this RPC.
    SELECT (p.created_at < now() - interval '24 hours')
      INTO v_established FROM public.profiles p WHERE p.id = p_user_id;
    v_established := coalesce(v_established, false);
    v_valid := v_established;

    INSERT INTO public.trivia_question_reports (question_id, user_id, reason, note, state, valid, session_id,
        revision_id, reporter_established, served_to_reporter)
    VALUES (p_question_id, p_user_id, p_reason, nullif(btrim(coalesce(p_note, '')), ''), 'open', v_valid,
        s.id, v_rev, v_established, true)
    RETURNING id INTO v_id;

    IF v_valid THEN
        SELECT report_quarantine_threshold INTO v_threshold FROM public.trivia_eligibility_policies
         ORDER BY policy_version DESC LIMIT 1;
        SELECT count(DISTINCT r.user_id) INTO v_reporters
          FROM public.trivia_question_reports r
          JOIN public.trivia_question_curation c ON c.question_id = r.question_id
         WHERE c.canonical_question_id = v_canon AND r.state IN ('open','triaged') AND r.valid;
        IF v_reporters >= coalesce(v_threshold, 3) THEN
            PERFORM public.trivia_quarantine_question_v1(v_canon, 'reports_threshold', 'report_threshold',
                'trivia_submit_question_report_v2', jsonb_build_object('valid_reporters', v_reporters));
            v_quarantined := true;
        END IF;
    END IF;
    RETURN jsonb_build_object('success', true, 'duplicate', false, 'report_id', v_id, 'valid', v_valid,
        'excluded_from_paid_pools', v_valid, 'quarantined', v_quarantined);
END $$;

-- Eligibility follows canonical report identity while the report row itself
-- retains the exact alias/revision that the player saw. A valid report against
-- an alias must exclude the canonical serving row immediately.
CREATE OR REPLACE VIEW public.trivia_question_eligibility_v1 WITH (security_invoker = true) AS
WITH pol AS (
    SELECT * FROM public.trivia_eligibility_policies ORDER BY policy_version DESC LIMIT 1
), rep AS (
    SELECT c.canonical_question_id, count(DISTINCT r.user_id)::integer AS n
      FROM public.trivia_question_reports r
      JOIN public.trivia_question_curation c ON c.question_id = r.question_id
     WHERE r.state IN ('open','triaged') AND r.valid
     GROUP BY c.canonical_question_id
), quar AS (
    SELECT DISTINCT question_id FROM public.trivia_question_quarantine WHERE released_at IS NULL
)
SELECT q.id AS question_id,
       c.current_revision_id AS revision_id,
       c.canonical_question_id,
       c.fingerprint,
       q.category, q.difficulty, q.quality_score, q.audit_verified,
       coalesce(rv.structurally_valid, false) AS structurally_valid,
       rv.content_version,
       rv.min_timer_seconds,
       coalesce(c.modes, '{}'::text[]) AS modes,
       (c.question_id IS NOT NULL AND q.id = c.canonical_question_id) AS is_canonical,
       (quar.question_id IS NOT NULL) AS quarantined,
       coalesce(rep.n, 0) AS open_valid_reports,
       c.last_reviewed_at,
       CASE WHEN c.last_reviewed_at IS NULL THEN NULL
            ELSE floor(extract(epoch FROM (now() - c.last_reviewed_at)) / 86400)::integer END AS review_age_days,
       q.source,
       pol.policy_version,
       array_remove(ARRAY[
           CASE WHEN c.question_id IS NULL OR rv.id IS NULL THEN 'no_revision' END,
           CASE WHEN rv.id IS NOT NULL AND NOT rv.structurally_valid THEN 'invalid_structure' END,
           CASE WHEN q.audit_verified IS NULL THEN 'audit_unset' END,
           CASE WHEN q.audit_verified IS FALSE THEN 'audit_failed' END,
           CASE WHEN coalesce(q.quality_score, -1) < pol.quality_threshold THEN 'low_quality' END,
           CASE WHEN rv.id IS NOT NULL AND NOT (rv.content_version = ANY (pol.supported_content_versions))
                THEN 'unsupported_rules_version' END,
           CASE WHEN q.source IS NOT NULL AND q.source = ANY (pol.unsupported_sources) THEN 'unsupported_source' END,
           CASE WHEN c.question_id IS NOT NULL AND q.id <> c.canonical_question_id THEN 'duplicate_alias' END,
           CASE WHEN quar.question_id IS NOT NULL THEN 'quarantined' END,
           CASE WHEN coalesce(rep.n, 0) > 0 THEN 'open_report' END,
           CASE WHEN c.question_id IS NOT NULL AND cardinality(c.modes) = 0 THEN 'no_mode' END,
           CASE WHEN pol.max_review_age_days IS NOT NULL
                 AND (c.last_reviewed_at IS NULL
                      OR c.last_reviewed_at < now() - make_interval(days => pol.max_review_age_days))
                THEN 'review_stale' END
       ], NULL) AS reject_reasons
  FROM public.trivia_questions q
 CROSS JOIN pol
  LEFT JOIN public.trivia_question_curation c ON c.question_id = q.id
  LEFT JOIN public.trivia_question_revisions rv ON rv.id = c.current_revision_id
  LEFT JOIN rep ON rep.canonical_question_id = c.canonical_question_id
  LEFT JOIN quar ON quar.question_id = q.id;

-- Lock every authority row used to grade a session in deterministic order and
-- turn any currently invalid bound question into durable, keyless evidence.
-- Question-row locks also serialize new quarantine inserts through the FK;
-- active quarantine-row locks serialize releases. Callers retain these locks
-- through settlement because nested functions share the outer transaction.
CREATE OR REPLACE FUNCTION public.trivia_p8_lock_and_void_session_questions_v1(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE
    s public.trivia_sessions%ROWTYPE;
    a public.trivia_session_answers%ROWTYPE;
    v_bound record;
    v_total integer;
    v_count integer;
    v_next_sequence integer;
    v_reason text;
    v_revision_id uuid;
    v_answers jsonb;
    v_stored jsonb;
    v_options jsonb;
    v_at timestamptz;
    v_now timestamptz := clock_timestamp();
    v_changed boolean := false;
BEGIN
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'session_not_found'); END IF;
    v_total := coalesce(cardinality(s.question_ids), 0);
    IF v_total < 1 OR (SELECT count(DISTINCT qid) FROM unnest(s.question_ids) q(qid)) <> v_total THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_roster_invalid');
    END IF;

    SELECT count(*) INTO v_count FROM (
        SELECT q.id FROM public.trivia_questions q
         WHERE q.id = ANY(s.question_ids) ORDER BY q.id FOR UPDATE
    ) locked_questions;
    IF v_count <> v_total THEN
        RETURN jsonb_build_object('success', false, 'error', 'question_validation_failed');
    END IF;
    PERFORM z.id FROM public.trivia_question_quarantine z
     WHERE z.question_id = ANY(s.question_ids) AND z.released_at IS NULL
     ORDER BY z.question_id, z.id FOR UPDATE;

    IF s.engine_version IS NOT NULL THEN
        SELECT count(*) INTO v_count FROM (
            SELECT x.position FROM public.trivia_session_answers x
             WHERE x.session_id = s.id ORDER BY x.position FOR UPDATE
        ) locked_answers;
        IF v_count <> v_total OR EXISTS (
            SELECT 1
              FROM unnest(s.question_ids) WITH ORDINALITY q(question_id, position)
              LEFT JOIN public.trivia_session_answers x
                ON x.session_id = s.id AND x.position = q.position
               AND x.question_id = q.question_id
             WHERE x.session_id IS NULL) THEN
            RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable');
        END IF;
        SELECT coalesce(max(sequence), 0) + 1 INTO v_next_sequence
          FROM public.trivia_session_answers WHERE session_id = s.id;
        FOR a IN
            SELECT * FROM public.trivia_session_answers
             WHERE session_id = s.id ORDER BY position
        LOOP
            SELECT CASE
                       WHEN r.structurally_valid IS FALSE THEN 'structural'
                       WHEN q.audit_verified IS FALSE THEN 'audit'
                       WHEN EXISTS (
                           SELECT 1 FROM public.trivia_question_quarantine z
                            WHERE z.question_id = a.question_id AND z.released_at IS NULL)
                           THEN 'quarantine'
                   END
              INTO v_reason
              FROM public.trivia_question_revisions r
              JOIN public.trivia_questions q ON q.id = r.question_id
             WHERE r.id = a.revision_id AND r.question_id = a.question_id;
            IF NOT FOUND THEN
                RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable');
            END IF;
            IF v_reason IS NOT NULL AND a.server_voided_at IS NULL THEN
                UPDATE public.trivia_session_answers
                   SET answered_at = coalesce(a.answered_at, v_now),
                       display_index = -1, original_index = NULL, is_correct = false,
                       outcome = 'skip',
                       sequence = coalesce(a.sequence, v_next_sequence),
                       server_voided_at = v_now, server_void_reason = v_reason
                 WHERE session_id = s.id AND position = a.position;
                IF a.sequence IS NULL THEN v_next_sequence := v_next_sequence + 1; END IF;
            END IF;
        END LOOP;
        RETURN jsonb_build_object('success', true);
    END IF;

    IF jsonb_typeof(s.question_revision_ids) IS DISTINCT FROM 'object' THEN
        RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable');
    END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(s.question_revision_ids)) <> v_total
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(s.question_revision_ids) k(key)
                   WHERE NOT EXISTS (
                       SELECT 1 FROM unnest(s.question_ids) q(question_id)
                        WHERE q.question_id::text = k.key)) THEN
        RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable');
    END IF;
    IF jsonb_typeof(s.answers) IS DISTINCT FROM 'object' THEN
        RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
    END IF;
    v_answers := s.answers;
    FOR v_bound IN
        SELECT q.question_id, q.ordinality::integer AS position
          FROM unnest(s.question_ids) WITH ORDINALITY q(question_id, ordinality)
         ORDER BY q.ordinality
    LOOP
        BEGIN
            v_revision_id := (s.question_revision_ids ->> v_bound.question_id::text)::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
            v_revision_id := NULL;
        END;
        IF v_revision_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable');
        END IF;
        SELECT CASE
                   WHEN r.structurally_valid IS FALSE THEN 'structural'
                   WHEN q.audit_verified IS FALSE THEN 'audit'
                   WHEN EXISTS (
                       SELECT 1 FROM public.trivia_question_quarantine z
                        WHERE z.question_id = v_bound.question_id AND z.released_at IS NULL)
                       THEN 'quarantine'
               END, r.options
          INTO v_reason, v_options
          FROM public.trivia_question_revisions r
          JOIN public.trivia_questions q ON q.id = r.question_id
         WHERE r.id = v_revision_id AND r.question_id = v_bound.question_id;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable');
        END IF;
        IF v_reason IS NOT NULL THEN
            v_stored := v_answers -> v_bound.question_id::text;
            -- Once authority has neutralized a legacy answer, that exact
            -- evidence is immutable even if the current invalidity reason
            -- later changes. Reject a malformed marker rather than repairing
            -- history into a different server claim.
            IF v_stored -> 'v' = 'true'::jsonb THEN
                IF jsonb_typeof(v_stored) IS DISTINCT FROM 'object' THEN
                    RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
                END IF;
                IF (SELECT count(*) FROM jsonb_object_keys(v_stored)) <> 5
                   OR NOT (v_stored ?& ARRAY['d','n','at','v','vr'])
                   OR v_stored -> 'v' IS DISTINCT FROM 'true'::jsonb
                   OR v_stored ->> 'd' IS DISTINCT FROM '-1'
                   OR jsonb_typeof(v_stored -> 'n') IS DISTINCT FROM 'number'
                   OR coalesce(v_stored ->> 'n', '') !~ '^[0-9]+$'
                   OR (v_stored ->> 'n')::integer <> v_bound.position - 1
                   OR jsonb_typeof(v_stored -> 'at') IS DISTINCT FROM 'string'
                   OR coalesce(v_stored ->> 'vr', '') NOT IN ('structural','audit','quarantine') THEN
                    RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
                END IF;
                BEGIN
                    v_at := (v_stored ->> 'at')::timestamptz;
                EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
                    RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
                END;
                CONTINUE;
            END IF;
            IF v_stored IS NOT NULL THEN
                IF jsonb_typeof(v_options) IS DISTINCT FROM 'array' THEN
                    RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable');
                END IF;
                IF jsonb_array_length(v_options) < 1 THEN
                    RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable');
                END IF;
                IF jsonb_typeof(v_stored) IS DISTINCT FROM 'object' THEN
                    RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
                END IF;
                IF (SELECT count(*) FROM jsonb_object_keys(v_stored)) <> 3
                   OR NOT (v_stored ?& ARRAY['d','n','at'])
                   OR jsonb_typeof(v_stored -> 'd') IS DISTINCT FROM 'number'
                   OR coalesce(v_stored ->> 'd', '') !~ '^-?[0-9]+$'
                   OR (v_stored ->> 'd')::integer < -1
                   OR (v_stored ->> 'd')::integer >= jsonb_array_length(v_options)
                   OR jsonb_typeof(v_stored -> 'n') IS DISTINCT FROM 'number'
                   OR coalesce(v_stored ->> 'n', '') !~ '^[0-9]+$'
                   OR (v_stored ->> 'n')::integer < 0
                   OR (v_stored ->> 'n')::integer >= v_total
                   OR jsonb_typeof(v_stored -> 'at') IS DISTINCT FROM 'string'
                   OR EXISTS (
                        SELECT 1 FROM jsonb_each(v_answers) other(key, value)
                         WHERE other.key <> v_bound.question_id::text
                           AND other.value -> 'v' IS DISTINCT FROM 'true'::jsonb
                           AND jsonb_typeof(other.value -> 'n') = 'number'
                           AND coalesce(other.value ->> 'n', '') ~ '^[0-9]+$'
                           AND (other.value ->> 'n')::integer = (v_stored ->> 'n')::integer) THEN
                    RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
                END IF;
                BEGIN
                    v_at := (v_stored ->> 'at')::timestamptz;
                EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
                    RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
                END;
            END IF;
            v_at := v_now;
            BEGIN
                IF jsonb_typeof(v_stored -> 'at') = 'string' THEN
                    v_at := (v_stored ->> 'at')::timestamptz;
                END IF;
            EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
                v_at := v_now;
            END;
            v_answers := jsonb_set(v_answers, ARRAY[v_bound.question_id::text],
                jsonb_build_object('d', -1, 'n', v_bound.position - 1, 'at', v_at,
                    'v', true, 'vr', v_reason), true);
            v_changed := true;
        END IF;
    END LOOP;
    IF v_changed AND v_answers IS DISTINCT FROM s.answers THEN
        UPDATE public.trivia_sessions SET answers = v_answers WHERE id = s.id;
    END IF;
    RETURN jsonb_build_object('success', true);
END $$;

-- Legacy first-answer path. The session, exact bound revision, live question
-- authority and quarantine evidence are locked before either a normal answer
-- or a durable neutral void is written. It deliberately returns no verdict,
-- key, explanation or solver metadata.
CREATE OR REPLACE FUNCTION public.trivia_legacy_session_answer_v1(
    p_session_id uuid, p_user_id uuid, p_question_id uuid,
    p_display_index integer, p_client_nonce uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE
    s public.trivia_sessions%ROWTYPE;
    r public.trivia_question_revisions%ROWTYPE;
    v_key text := p_question_id::text;
    v_revision_id uuid;
    v_position integer;
    v_total integer;
    v_perm jsonb;
    v_indexes integer[];
    v_expected integer[];
    v_stored jsonb;
    v_record jsonb;
    v_reason text;
    v_quarantined boolean;
    v_now timestamptz := clock_timestamp();
    v_at timestamptz;
    v_ordinal integer;
BEGIN
    IF p_session_id IS NULL OR p_user_id IS NULL OR p_question_id IS NULL
       OR p_display_index IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_arguments');
    END IF;
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'session_not_found'); END IF;
    IF s.user_id IS DISTINCT FROM p_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_your_session');
    END IF;
    IF s.engine_version IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_legacy_session');
    END IF;
    IF jsonb_typeof(s.answers) IS DISTINCT FROM 'object' THEN
        RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
    END IF;
    v_position := array_position(s.question_ids, p_question_id);
    v_total := coalesce(cardinality(s.question_ids), 0);
    IF v_position IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'question_not_in_session');
    END IF;
    BEGIN
        v_revision_id := (s.question_revision_ids ->> v_key)::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
        v_revision_id := NULL;
    END;
    IF v_revision_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable');
    END IF;
    SELECT r0.* INTO r
      FROM public.trivia_question_revisions r0
      JOIN public.trivia_questions q ON q.id = r0.question_id
     WHERE r0.id = v_revision_id AND r0.question_id = p_question_id
     FOR UPDATE OF q;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable');
    END IF;
    PERFORM z.id FROM public.trivia_question_quarantine z
     WHERE z.question_id = p_question_id AND z.released_at IS NULL
     ORDER BY z.id FOR UPDATE;
    v_quarantined := FOUND;
    v_reason := CASE WHEN r.structurally_valid IS FALSE THEN 'structural'
                     WHEN (SELECT q.audit_verified FROM public.trivia_questions q
                            WHERE q.id = p_question_id) IS FALSE THEN 'audit'
                     WHEN v_quarantined THEN 'quarantine' END;
    v_stored := s.answers -> v_key;

    -- A terminal session is historical evidence. Never reinterpret it under a
    -- later audit/quarantine change merely because an answer request retried.
    IF s.status <> 'open' THEN
        IF v_stored -> 'v' = 'true'::jsonb THEN
            IF jsonb_typeof(v_stored) IS DISTINCT FROM 'object' THEN
                RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
            END IF;
            IF (SELECT count(*) FROM jsonb_object_keys(v_stored)) <> 5
               OR NOT (v_stored ?& ARRAY['d','n','at','v','vr'])
               OR v_stored -> 'v' IS DISTINCT FROM 'true'::jsonb
               OR v_stored ->> 'd' IS DISTINCT FROM '-1'
               OR jsonb_typeof(v_stored -> 'n') IS DISTINCT FROM 'number'
               OR coalesce(v_stored ->> 'n', '') !~ '^[0-9]+$'
               OR (v_stored ->> 'n')::integer <> v_position - 1
               OR jsonb_typeof(v_stored -> 'at') IS DISTINCT FROM 'string'
               OR coalesce(v_stored ->> 'vr', '') NOT IN ('structural','audit','quarantine') THEN
                RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
            END IF;
            BEGIN
                v_at := (v_stored ->> 'at')::timestamptz;
            EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
                RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
            END;
            RETURN jsonb_build_object('success', true, 'recorded', true,
                'duplicate', true, 'fresh', false, 'stored', v_stored,
                'storedDisplayIndex', -1, 'outcome', 'voided', 'voided', true);
        END IF;
        RETURN jsonb_build_object('success', false, 'error', 'session_closed');
    END IF;

    -- A durable void remains byte-for-byte keyless evidence if the question is
    -- later repaired or a different live invalidity reason appears.
    IF v_stored -> 'v' = 'true'::jsonb THEN
        IF jsonb_typeof(v_stored) IS DISTINCT FROM 'object' THEN
            RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
        END IF;
        IF (SELECT count(*) FROM jsonb_object_keys(v_stored)) <> 5
           OR NOT (v_stored ?& ARRAY['d','n','at','v','vr'])
           OR v_stored ->> 'd' IS DISTINCT FROM '-1'
           OR jsonb_typeof(v_stored -> 'n') IS DISTINCT FROM 'number'
           OR coalesce(v_stored ->> 'n', '') !~ '^[0-9]+$'
           OR (v_stored ->> 'n')::integer <> v_position - 1
           OR jsonb_typeof(v_stored -> 'at') IS DISTINCT FROM 'string'
           OR coalesce(v_stored ->> 'vr', '') NOT IN ('structural','audit','quarantine') THEN
            RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
        END IF;
        BEGIN
            v_at := (v_stored ->> 'at')::timestamptz;
        EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
            RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
        END;
        RETURN jsonb_build_object('success', true, 'recorded', true,
            'duplicate', true, 'fresh', false, 'stored', v_stored,
            'storedDisplayIndex', -1, 'outcome', 'voided', 'voided', true);
    END IF;

    -- First answer wins even after expiry. Validate and replay an existing
    -- normal record before consulting mutable live authority; malformed
    -- evidence is never rewritten into a seemingly valid server void.
    IF v_stored IS NOT NULL THEN
        IF jsonb_typeof(r.options) IS DISTINCT FROM 'array' THEN
            RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable');
        END IF;
        IF jsonb_array_length(r.options) < 1 THEN
            RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable');
        END IF;
        IF jsonb_typeof(v_stored) IS DISTINCT FROM 'object' THEN
            RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
        END IF;
        IF (SELECT count(*) FROM jsonb_object_keys(v_stored)) <> 3
           OR NOT (v_stored ?& ARRAY['d','n','at'])
           OR jsonb_typeof(v_stored -> 'd') IS DISTINCT FROM 'number'
           OR coalesce(v_stored ->> 'd', '') !~ '^-?[0-9]+$'
           OR (v_stored ->> 'd')::integer < -1
           OR (v_stored ->> 'd')::integer >= jsonb_array_length(r.options)
           OR jsonb_typeof(v_stored -> 'n') IS DISTINCT FROM 'number'
           OR coalesce(v_stored ->> 'n', '') !~ '^[0-9]+$'
           OR (v_stored ->> 'n')::integer < 0
           OR (v_stored ->> 'n')::integer >= v_total
           OR jsonb_typeof(v_stored -> 'at') IS DISTINCT FROM 'string'
           OR EXISTS (
                SELECT 1 FROM jsonb_each(s.answers) other(key, value)
                 WHERE other.key <> v_key
                   AND other.value -> 'v' IS DISTINCT FROM 'true'::jsonb
                   AND jsonb_typeof(other.value -> 'n') = 'number'
                   AND coalesce(other.value ->> 'n', '') ~ '^[0-9]+$'
                   AND (other.value ->> 'n')::integer = (v_stored ->> 'n')::integer) THEN
            RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
        END IF;
        BEGIN
            v_at := (v_stored ->> 'at')::timestamptz;
        EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
            RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
        END;
        RETURN jsonb_build_object('success', true, 'recorded', true,
            'duplicate', true, 'fresh', false, 'stored', v_stored,
            'storedDisplayIndex', (v_stored ->> 'd')::integer, 'outcome', 'recorded');
    END IF;
    IF s.expires_at IS NOT NULL AND v_now > s.expires_at THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_expired');
    END IF;

    IF v_reason IS NOT NULL THEN
        v_record := jsonb_build_object('d', -1, 'n', v_position - 1, 'at', v_now,
            'v', true, 'vr', v_reason);
        UPDATE public.trivia_sessions
           SET answers = answers || jsonb_build_object(v_key, v_record)
         WHERE id = s.id;
        RETURN jsonb_build_object('success', true, 'recorded', true,
            'duplicate', false, 'fresh', true, 'stored', v_record,
            'storedDisplayIndex', -1, 'outcome', 'voided', 'voided', true);
    END IF;

    v_perm := s.permutations -> v_key;
    IF jsonb_typeof(r.options) IS DISTINCT FROM 'array' THEN
        RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable');
    END IF;
    IF jsonb_array_length(r.options) < 1
       OR jsonb_typeof(v_perm) IS DISTINCT FROM 'array'
       OR jsonb_array_length(v_perm) <> jsonb_array_length(r.options)
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_perm) e(value)
                   WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'number'
                      OR e.value::text !~ '^[0-9]+$') THEN
        RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable');
    END IF;
    SELECT array_agg(e.value::text::integer ORDER BY e.value::text::integer)
      INTO v_indexes FROM jsonb_array_elements(v_perm) e(value);
    SELECT array_agg(i ORDER BY i) INTO v_expected
      FROM generate_series(0, jsonb_array_length(r.options) - 1) i;
    IF v_indexes IS DISTINCT FROM v_expected THEN
        RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable');
    END IF;
    IF p_display_index < -1 OR p_display_index >= jsonb_array_length(r.options) THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_display_index');
    END IF;

    SELECT min(i) INTO v_ordinal
      FROM generate_series(0, v_total - 1) i
     WHERE NOT EXISTS (
         SELECT 1 FROM jsonb_each(coalesce(s.answers, '{}'::jsonb)) e(key, value)
          WHERE jsonb_typeof(e.value -> 'n') = 'number'
            AND coalesce(e.value ->> 'n', '') ~ '^[0-9]+$'
            AND (e.value ->> 'n')::integer = i);
    IF v_ordinal IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
    END IF;
    v_record := jsonb_build_object('d', p_display_index, 'n', v_ordinal, 'at', v_now);
    UPDATE public.trivia_sessions
       SET answers = coalesce(answers, '{}'::jsonb) || jsonb_build_object(v_key, v_record)
     WHERE id = s.id;
    RETURN jsonb_build_object('success', true, 'recorded', true,
        'duplicate', false, 'fresh', true, 'stored', v_record,
        'storedDisplayIndex', p_display_index, 'outcome', 'recorded');
END $$;

-- Atomic invalid-question path for both the bound V3 engine and legacy JSON
-- sessions. Invalidity and the first-answer mutation are decided under the
-- same session/answer lock, so a mutable API pre-read can never create a void.
CREATE OR REPLACE FUNCTION public.trivia_record_invalid_question_v1(
    p_session_id uuid, p_user_id uuid, p_question_id uuid, p_client_nonce uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE
    s public.trivia_sessions%ROWTYPE;
    a public.trivia_session_answers%ROWTYPE;
    r public.trivia_question_revisions%ROWTYPE;
    v_profile public.trivia_roster_profiles%ROWTYPE;
    v_now timestamptz := clock_timestamp();
    v_audit boolean;
    v_structural boolean;
    v_quarantined boolean;
    v_reason text;
    v_seq integer;
    v_key text := p_question_id::text;
    v_stored jsonb;
    v_revision_id uuid;
    v_position integer;
    v_at timestamptz;
BEGIN
    IF p_session_id IS NULL OR p_user_id IS NULL OR p_question_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_arguments');
    END IF;
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'session_not_found'); END IF;
    IF s.user_id IS DISTINCT FROM p_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_your_session');
    END IF;

    IF s.engine_version IS NOT NULL THEN
        SELECT * INTO a FROM public.trivia_session_answers
         WHERE session_id = p_session_id AND question_id = p_question_id FOR UPDATE;
        IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'question_not_in_session'); END IF;
        IF a.position < 1 OR a.position > coalesce(cardinality(s.question_ids), 0)
           OR s.question_ids[a.position] IS DISTINCT FROM a.question_id THEN
            RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable');
        END IF;
        IF a.server_voided_at IS NOT NULL THEN
            RETURN jsonb_build_object('success', true, 'recorded', true, 'duplicate', true,
                'storedDisplayIndex', -1, 'outcome', 'voided', 'voided', true);
        END IF;
        IF a.outcome IS NOT NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'answer_already_recorded');
        END IF;
        IF s.status <> 'open' THEN RETURN jsonb_build_object('success', false, 'error', 'session_closed'); END IF;
        IF s.expires_at IS NULL OR v_now > s.expires_at THEN
            RETURN jsonb_build_object('success', false, 'error', 'session_expired');
        END IF;
        SELECT * INTO v_profile FROM public.trivia_roster_profiles WHERE profile_id = s.roster_profile_id;
        IF v_profile.per_question_seconds IS NOT NULL AND a.opened_at IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'question_not_open');
        END IF;
        SELECT * INTO r FROM public.trivia_question_revisions
         WHERE id = a.revision_id AND question_id = a.question_id;
        IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'question_validation_failed'); END IF;
        SELECT q.audit_verified INTO v_audit FROM public.trivia_questions q
         WHERE q.id = a.question_id FOR UPDATE;
        IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'question_validation_failed'); END IF;
        PERFORM 1 FROM public.trivia_question_quarantine z
         WHERE z.question_id = a.question_id AND z.released_at IS NULL FOR UPDATE;
        v_quarantined := FOUND;
        v_reason := CASE
            WHEN r.structurally_valid IS FALSE THEN 'structural'
            WHEN v_audit IS FALSE THEN 'audit'
            WHEN v_quarantined THEN 'quarantine'
            ELSE NULL
        END;
        IF v_reason IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'question_still_valid');
        END IF;
        SELECT count(*) + 1 INTO v_seq FROM public.trivia_session_answers
         WHERE session_id = p_session_id AND sequence IS NOT NULL;
        UPDATE public.trivia_session_answers
           SET answered_at = v_now, display_index = -1, original_index = NULL,
               is_correct = false, outcome = 'skip', sequence = v_seq,
               client_nonce = p_client_nonce, server_voided_at = v_now,
               server_void_reason = v_reason
         WHERE session_id = p_session_id AND position = a.position;
        RETURN jsonb_build_object('success', true, 'recorded', true, 'duplicate', false,
            'storedDisplayIndex', -1, 'outcome', 'voided', 'voided', true);
    END IF;

    IF jsonb_typeof(s.answers) IS DISTINCT FROM 'object' THEN
        RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
    END IF;
    v_position := array_position(coalesce(s.question_ids, '{}'::uuid[]), p_question_id);
    IF v_position IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'question_not_in_session');
    END IF;
    v_stored := coalesce(s.answers, '{}'::jsonb) -> v_key;
    IF v_stored -> 'v' = 'true'::jsonb THEN
        IF jsonb_typeof(v_stored) IS DISTINCT FROM 'object' THEN
            RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
        END IF;
        IF (SELECT count(*) FROM jsonb_object_keys(v_stored)) <> 5
           OR NOT (v_stored ?& ARRAY['d','n','at','v','vr'])
           OR v_stored -> 'v' IS DISTINCT FROM 'true'::jsonb
           OR v_stored ->> 'd' IS DISTINCT FROM '-1'
           OR jsonb_typeof(v_stored -> 'n') IS DISTINCT FROM 'number'
           OR coalesce(v_stored ->> 'n', '') !~ '^[0-9]+$'
           OR (v_stored ->> 'n')::integer <> v_position - 1
           OR jsonb_typeof(v_stored -> 'at') IS DISTINCT FROM 'string'
           OR coalesce(v_stored ->> 'vr', '') NOT IN ('structural','audit','quarantine') THEN
            RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
        END IF;
        BEGIN
            v_at := (v_stored ->> 'at')::timestamptz;
        EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
            RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
        END;
        RETURN jsonb_build_object('success', true, 'recorded', true, 'duplicate', true,
            'storedDisplayIndex', -1, 'outcome', 'voided', 'voided', true);
    END IF;
    IF v_stored IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'answer_already_recorded');
    END IF;
    IF s.status <> 'open' THEN RETURN jsonb_build_object('success', false, 'error', 'session_closed'); END IF;
    IF s.expires_at IS NOT NULL AND v_now > s.expires_at THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_expired');
    END IF;
    BEGIN
        v_revision_id := (s.question_revision_ids ->> v_key)::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
        v_revision_id := NULL;
    END;
    IF v_revision_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable');
    END IF;
    SELECT rev.structurally_valid, q.audit_verified
      INTO v_structural, v_audit
      FROM public.trivia_question_revisions rev
      JOIN public.trivia_questions q ON q.id = rev.question_id
     WHERE rev.id = v_revision_id AND rev.question_id = p_question_id
     FOR UPDATE OF q;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'question_validation_failed'); END IF;
    PERFORM 1 FROM public.trivia_question_quarantine z
     WHERE z.question_id = p_question_id AND z.released_at IS NULL FOR UPDATE;
    v_quarantined := FOUND;
    v_reason := CASE
        WHEN v_structural IS FALSE THEN 'structural'
        WHEN v_audit IS FALSE THEN 'audit'
        WHEN v_quarantined THEN 'quarantine'
        ELSE NULL
    END;
    IF v_reason IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'question_still_valid');
    END IF;
    UPDATE public.trivia_sessions
       SET answers = coalesce(answers, '{}'::jsonb) || jsonb_build_object(v_key,
           jsonb_build_object('d', -1, 'n', v_position - 1,
                              'at', v_now, 'v', true, 'vr', v_reason))
     WHERE id = p_session_id;
    RETURN jsonb_build_object('success', true, 'recorded', true, 'duplicate', false,
        'storedDisplayIndex', -1, 'outcome', 'voided', 'voided', true);
END $$;

-- Strategy frequencies belong to the immutable question revision. EV is a
-- live authority claim: retain it only while that exact artifact still joins
-- the serving catalog to an unretired solver-provenance tuple.
CREATE OR REPLACE FUNCTION public.trivia_project_engine_metadata_v1(p_metadata jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE
    v_metadata jsonb := CASE WHEN jsonb_typeof(p_metadata) = 'object'
                             THEN p_metadata ELSE '{}'::jsonb END;
    v_ev jsonb := v_metadata -> 'ev_data';
    v_provenance jsonb;
    v_artifact_id uuid;
    v_audited_at timestamptz;
BEGIN
    IF jsonb_typeof(v_ev) IS DISTINCT FROM 'object' THEN RETURN v_metadata - 'ev_data'; END IF;
    v_provenance := v_ev -> 'provenance';
    IF jsonb_typeof(v_provenance) IS DISTINCT FROM 'object'
       OR v_ev ->> 'contract' IS DISTINCT FROM 'trivia-solver-ev/1'
       OR v_ev ->> 'unit' IS DISTINCT FROM 'bb'
       OR v_ev ->> 'source' IS DISTINCT FROM 'solved_spots_gold.strategy_matrix_v2.hand_evs_bb'
       OR v_ev ->> 'aggregation' IS DISTINCT FROM 'live_combo_class_mean'
       OR v_provenance ->> 'authority' IS DISTINCT FROM 'training_solver_provenance_authority'
       OR v_provenance ->> 'catalog' IS DISTINCT FROM 'training_solver_artifact_catalog'
       OR v_provenance ->> 'solver' IS DISTINCT FROM 'PioSOLVER'
       OR coalesce(v_provenance ->> 'artifact_id', '')
            !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR coalesce(v_provenance ->> 'solver_binary_checksum', '') !~ '^[0-9a-f]{64}$'
       OR coalesce(v_provenance ->> 'pipeline_commit', '') !~ '^[0-9a-f]{40}$'
       OR coalesce(v_provenance ->> 'manifest_checksum', '') !~ '^[0-9a-f]{64}$'
       OR coalesce(v_provenance ->> 'source_artifact_checksum', '') !~ '^[0-9a-f]{64}$'
       OR coalesce(v_provenance ->> 'source_combo_order_sha256', '') !~ '^[0-9a-f]{64}$'
       OR coalesce(v_provenance ->> 'training_game_contracts_sha256', '') !~ '^[0-9a-f]{64}$' THEN
        RETURN v_metadata - 'ev_data';
    END IF;
    BEGIN
        v_artifact_id := (v_provenance ->> 'artifact_id')::uuid;
        v_audited_at := (v_provenance ->> 'audited_at')::timestamptz;
    EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
        RETURN v_metadata - 'ev_data';
    END;
    IF NOT EXISTS (
        SELECT 1
          FROM public.training_solver_artifact_catalog catalog
          JOIN public.solved_spots_gold artifact ON artifact.id = catalog.artifact_id
          JOIN public.training_solver_provenance_authority authority
            ON authority.machine_id = artifact.machine_id
           AND authority.solver_version = artifact.solver_version
           AND authority.solver_binary_checksum = artifact.solver_binary_checksum
           AND authority.pipeline_commit = artifact.pipeline_commit
           AND authority.manifest_version = artifact.manifest_version
           AND authority.manifest_checksum = artifact.manifest_checksum
           AND authority.source_combo_order_sha256 = artifact.strategy_matrix_v2 ->> 'source_combo_order_sha256'
           AND authority.training_game_contracts_sha256 = artifact.strategy_matrix_v2 ->> 'training_game_contracts_sha256'
           AND authority.retired_at IS NULL
         WHERE catalog.artifact_id = v_artifact_id
           AND catalog.scenario_hash = v_provenance ->> 'scenario_hash'
           AND catalog.scenario_hash = artifact.scenario_hash
           AND catalog.game_type = artifact.game_type
           AND catalog.stack_depth = artifact.stack_depth
           AND catalog.street = artifact.street
           AND catalog.hero_position = artifact.strategy_matrix_v2 ->> 'position'
           AND artifact.quality_status = 'validated'
           AND artifact.strategy_matrix_v2 ->> 'solver' = 'PioSOLVER'
           AND artifact.solver_version = v_provenance ->> 'solver_version'
           AND artifact.solver_binary_checksum = v_provenance ->> 'solver_binary_checksum'
           AND artifact.pipeline_commit = v_provenance ->> 'pipeline_commit'
           AND artifact.manifest_version = v_provenance ->> 'manifest_version'
           AND artifact.manifest_checksum = v_provenance ->> 'manifest_checksum'
           AND artifact.source_artifact_checksum = v_provenance ->> 'source_artifact_checksum'
           AND artifact.strategy_matrix_v2 ->> 'source_combo_order_sha256'
                = v_provenance ->> 'source_combo_order_sha256'
           AND artifact.strategy_matrix_v2 ->> 'training_game_contracts_sha256'
                = v_provenance ->> 'training_game_contracts_sha256'
           AND artifact.audited_at = v_audited_at) THEN
        RETURN v_metadata - 'ev_data';
    END IF;
    RETURN v_metadata;
END $$;

-- Batch-safe immutable strategy context for session start/resume. The exact
-- served revisions are projected through live solver authority in one query;
-- answer keys, explanations and revision internals never leave this RPC.
CREATE OR REPLACE FUNCTION public.trivia_session_context_projection_v1(
    p_session_id uuid, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE
    s public.trivia_sessions%ROWTYPE;
    v_total integer;
    v_bound integer;
    v_joined integer;
    v_questions jsonb;
BEGIN
    IF p_session_id IS NULL OR p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_arguments');
    END IF;
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'session_not_found'); END IF;
    IF s.user_id IS DISTINCT FROM p_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_your_session');
    END IF;
    v_total := coalesce(cardinality(s.question_ids), 0);
    IF (SELECT count(DISTINCT qid) FROM unnest(coalesce(s.question_ids, '{}'::uuid[])) q(qid)) <> v_total THEN
        RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable');
    END IF;

    IF s.engine_version IS NOT NULL THEN
        WITH bound AS (
            SELECT a.position, a.question_id, a.revision_id
              FROM public.trivia_session_answers a
             WHERE a.session_id = s.id
        ), projected AS (
            SELECT b.position, b.question_id,
                   public.trivia_project_engine_metadata_v1(r.engine_metadata) AS engine_metadata
              FROM bound b
              JOIN public.trivia_question_revisions r
                ON r.id = b.revision_id AND r.question_id = b.question_id
              JOIN LATERAL (SELECT s.question_ids[b.position] AS expected_question_id) expected ON true
             WHERE expected.expected_question_id = b.question_id
        )
        SELECT (SELECT count(*) FROM bound), count(*),
               coalesce(jsonb_agg(jsonb_build_object(
                   'questionId', question_id,
                   'engineMetadata', coalesce(engine_metadata, '{}'::jsonb)) ORDER BY position), '[]'::jsonb)
          INTO v_bound, v_joined, v_questions
          FROM projected;
    ELSE
        IF jsonb_typeof(s.question_revision_ids) IS DISTINCT FROM 'object' THEN
            RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable');
        END IF;
        IF (SELECT count(*) FROM jsonb_object_keys(s.question_revision_ids)) <> v_total THEN
            RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable');
        END IF;
        WITH bound AS (
            SELECT q.ordinality::integer AS position, q.question_id,
                   CASE WHEN coalesce(s.question_revision_ids ->> q.question_id::text, '')
                                  ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                        THEN (s.question_revision_ids ->> q.question_id::text)::uuid END AS revision_id
              FROM unnest(coalesce(s.question_ids, '{}'::uuid[]))
                   WITH ORDINALITY q(question_id, ordinality)
        ), projected AS (
            SELECT b.position, b.question_id,
                   public.trivia_project_engine_metadata_v1(r.engine_metadata) AS engine_metadata
              FROM bound b
              JOIN public.trivia_question_revisions r
                ON r.id = b.revision_id AND r.question_id = b.question_id
        )
        SELECT (SELECT count(*) FROM bound), count(*),
               coalesce(jsonb_agg(jsonb_build_object(
                   'questionId', question_id,
                   'engineMetadata', coalesce(engine_metadata, '{}'::jsonb)) ORDER BY position), '[]'::jsonb)
          INTO v_bound, v_joined, v_questions
          FROM projected;
    END IF;
    IF v_bound <> v_total OR v_joined <> v_total THEN
        RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable');
    END IF;
    RETURN jsonb_build_object('success', true, 'questions', v_questions);
END $$;

-- Normal V3 answers retain the installed V3 behavior. A durable server void
-- is intercepted while its row is locked and never reveals a key/explanation.
CREATE OR REPLACE FUNCTION public.trivia_session_answer_v4(
    p_session_id uuid, p_user_id uuid, p_question_id uuid,
    p_display_index integer, p_client_nonce uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE s public.trivia_sessions%ROWTYPE; a public.trivia_session_answers%ROWTYPE;
        v_res jsonb; v_metadata jsonb;
BEGIN
    IF p_session_id IS NULL OR p_user_id IS NULL OR p_question_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_arguments');
    END IF;
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'session_not_found'); END IF;
    IF s.user_id IS DISTINCT FROM p_user_id THEN RETURN jsonb_build_object('success', false, 'error', 'not_your_session'); END IF;
    IF s.engine_version IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_engine_v3'); END IF;
    SELECT * INTO a FROM public.trivia_session_answers
     WHERE session_id = p_session_id AND question_id = p_question_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'question_not_in_session'); END IF;
    IF a.position < 1 OR a.position > coalesce(cardinality(s.question_ids), 0)
       OR s.question_ids[a.position] IS DISTINCT FROM a.question_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable');
    END IF;
    IF a.server_voided_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'recorded', true, 'duplicate', true,
            'position', a.position, 'sequence', a.sequence, 'storedDisplayIndex', -1,
            'outcome', 'voided', 'voided', true);
    END IF;
    -- A first normal answer must not rely on the browser to notice invalidity.
    -- The invalid recorder reacquires the same row locks, locks current
    -- question/quarantine authority, and either durably neutralizes the row or
    -- proves it is still valid before V3 grading is allowed to run.
    IF a.outcome IS NULL THEN
        v_res := public.trivia_record_invalid_question_v1(
            p_session_id, p_user_id, p_question_id, p_client_nonce);
        IF coalesce((v_res ->> 'success')::boolean, false) IS TRUE THEN
            RETURN v_res || jsonb_build_object(
                'questionId', p_question_id, 'position', a.position);
        END IF;
        IF v_res ->> 'error' <> 'question_still_valid' THEN RETURN v_res; END IF;
    END IF;
    v_res := public.trivia_session_answer_v3(
        p_session_id, p_user_id, p_question_id, p_display_index, p_client_nonce);
    -- Raw metadata stays inside the service-only RPC. The API projects its
    -- narrow solver contract only after the delegated V3 receipt reveals a
    -- verdict; no metadata crosses a delayed-reveal boundary.
    IF v_res ? 'wasCorrect' THEN
        SELECT public.trivia_project_engine_metadata_v1(r.engine_metadata) INTO v_metadata
          FROM public.trivia_question_revisions r
         WHERE r.id = a.revision_id AND r.question_id = a.question_id;
        v_res := v_res || jsonb_build_object('engineMetadata', coalesce(v_metadata, '{}'::jsonb));
    END IF;
    RETURN v_res;
END $$;

-- Bound revision review for resume/render consumers. This is service-only and
-- answer-gated; a durable server void never returns a key, explanation or raw
-- engine metadata.
CREATE OR REPLACE FUNCTION public.trivia_session_question_review_v1(
    p_session_id uuid, p_user_id uuid, p_question_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE
    s public.trivia_sessions%ROWTYPE;
    a public.trivia_session_answers%ROWTYPE;
    r public.trivia_question_revisions%ROWTYPE;
    v_profile public.trivia_roster_profiles%ROWTYPE;
    v_stored jsonb;
    v_revision_id uuid;
    v_position integer;
    v_perm jsonb;
    v_indexes integer[];
    v_expected integer[];
    v_at timestamptz;
    v_sealed_void boolean := false;
BEGIN
    IF p_session_id IS NULL OR p_user_id IS NULL OR p_question_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_arguments');
    END IF;
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id FOR SHARE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'session_not_found'); END IF;
    IF s.user_id IS DISTINCT FROM p_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_your_session');
    END IF;
    IF s.engine_version IS NULL THEN
        IF jsonb_typeof(s.answers) IS DISTINCT FROM 'object' THEN
            RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
        END IF;
        v_position := array_position(s.question_ids, p_question_id);
        IF v_position IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'question_not_in_session');
        END IF;
        v_stored := coalesce(s.answers, '{}'::jsonb) -> p_question_id::text;
        IF v_stored IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'answer_not_bound');
        END IF;
        BEGIN
            v_revision_id := (s.question_revision_ids ->> p_question_id::text)::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
            v_revision_id := NULL;
        END;
        IF v_revision_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable');
        END IF;
        IF v_stored -> 'v' = 'true'::jsonb THEN
            IF jsonb_typeof(v_stored) IS DISTINCT FROM 'object' THEN
                RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
            END IF;
            IF (SELECT count(*) FROM jsonb_object_keys(v_stored)) <> 5
               OR NOT (v_stored ?& ARRAY['d','n','at','v','vr'])
               OR v_stored -> 'v' IS DISTINCT FROM 'true'::jsonb
               OR v_stored ->> 'd' IS DISTINCT FROM '-1'
               OR jsonb_typeof(v_stored -> 'n') IS DISTINCT FROM 'number'
               OR coalesce(v_stored ->> 'n', '') !~ '^[0-9]+$'
               OR (v_stored ->> 'n')::integer <> v_position - 1
               OR jsonb_typeof(v_stored -> 'at') IS DISTINCT FROM 'string'
               OR coalesce(v_stored ->> 'vr', '') NOT IN ('structural','audit','quarantine') THEN
                RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
            END IF;
            BEGIN
                v_at := (v_stored ->> 'at')::timestamptz;
            EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
                RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
            END;
            RETURN jsonb_build_object('success', true, 'mode', s.mode,
                'questionId', p_question_id, 'position', v_position,
                'outcome', 'voided', 'voided', true);
        END IF;
    ELSE
        SELECT * INTO a FROM public.trivia_session_answers
         WHERE session_id = p_session_id AND question_id = p_question_id FOR SHARE;
        IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'question_not_in_session'); END IF;
        IF a.position < 1 OR a.position > coalesce(cardinality(s.question_ids), 0)
           OR s.question_ids[a.position] IS DISTINCT FROM a.question_id THEN
            RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable');
        END IF;
        v_position := a.position;
        v_revision_id := a.revision_id;
        IF a.server_voided_at IS NOT NULL THEN
            RETURN jsonb_build_object('success', true, 'mode', s.mode, 'questionId', p_question_id,
                'position', a.position, 'outcome', 'voided', 'voided', true);
        END IF;
        IF a.outcome IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'answer_not_bound');
        END IF;
        SELECT EXISTS (
            SELECT 1 FROM public.trivia_session_results sr
            CROSS JOIN LATERAL jsonb_array_elements(coalesce(sr.per_question, '[]'::jsonb)) pq(value)
             WHERE sr.session_id = s.id
               AND pq.value ->> 'question_id' = p_question_id::text
               AND pq.value ->> 'outcome' = 'void') INTO v_sealed_void;
        IF v_sealed_void THEN
            RETURN jsonb_build_object('success', true, 'mode', s.mode, 'questionId', p_question_id,
                'position', a.position, 'outcome', 'voided', 'voided', true);
        END IF;
        SELECT * INTO v_profile FROM public.trivia_roster_profiles
         WHERE profile_id = s.roster_profile_id;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'reveal_policy_unavailable');
        END IF;
        IF public.trivia_p3_revealed(s, v_profile.reveal_policy) IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false, 'error', 'answer_not_revealed');
        END IF;
    END IF;
    SELECT * INTO r FROM public.trivia_question_revisions
     WHERE id = v_revision_id AND question_id = p_question_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable'); END IF;
    IF s.engine_version IS NULL THEN
        IF jsonb_typeof(r.options) IS DISTINCT FROM 'array'
           OR jsonb_array_length(r.options) < 1 THEN
            RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable');
        END IF;
        IF jsonb_typeof(v_stored) IS DISTINCT FROM 'object' THEN
            RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
        END IF;
        IF (SELECT count(*) FROM jsonb_object_keys(v_stored)) <> 3
           OR NOT (v_stored ?& ARRAY['d','n','at'])
           OR jsonb_typeof(v_stored -> 'd') IS DISTINCT FROM 'number'
           OR coalesce(v_stored ->> 'd', '') !~ '^-?[0-9]+$'
           OR (v_stored ->> 'd')::integer < -1
           OR (v_stored ->> 'd')::integer >= jsonb_array_length(r.options)
           OR jsonb_typeof(v_stored -> 'n') IS DISTINCT FROM 'number'
           OR coalesce(v_stored ->> 'n', '') !~ '^[0-9]+$'
           OR (v_stored ->> 'n')::integer >= cardinality(s.question_ids)
           OR jsonb_typeof(v_stored -> 'at') IS DISTINCT FROM 'string'
           OR EXISTS (
                SELECT 1 FROM jsonb_each(s.answers) other(key, value)
                 WHERE other.key <> p_question_id::text
                   AND other.value -> 'v' IS DISTINCT FROM 'true'::jsonb
                   AND jsonb_typeof(other.value -> 'n') = 'number'
                   AND coalesce(other.value ->> 'n', '') ~ '^[0-9]+$'
                   AND (other.value ->> 'n')::integer = (v_stored ->> 'n')::integer) THEN
            RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
        END IF;
        BEGIN
            v_at := (v_stored ->> 'at')::timestamptz;
        EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
            RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
        END;
        SELECT EXISTS (
            SELECT 1
              FROM jsonb_array_elements(coalesce(
                       s.settlement_result -> 'api_response_v1' -> 'perQuestion', '[]'::jsonb)) pq(value)
             WHERE pq.value ->> 'questionId' = p_question_id::text
               AND pq.value -> 'voided' = 'true'::jsonb) INTO v_sealed_void;
        IF v_sealed_void THEN
            RETURN jsonb_build_object('success', true, 'mode', s.mode,
                'questionId', p_question_id, 'position', v_position,
                'outcome', 'voided', 'voided', true);
        END IF;
        v_perm := s.permutations -> p_question_id::text;
        IF jsonb_typeof(v_perm) IS DISTINCT FROM 'array'
           OR jsonb_array_length(v_perm) <> jsonb_array_length(r.options)
           OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_perm) e(value)
                       WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'number'
                          OR e.value::text !~ '^[0-9]+$') THEN
            RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable');
        END IF;
        SELECT array_agg(e.value::text::integer ORDER BY e.value::text::integer)
          INTO v_indexes FROM jsonb_array_elements(v_perm) e(value);
        SELECT array_agg(i ORDER BY i) INTO v_expected
          FROM generate_series(0, jsonb_array_length(r.options) - 1) i;
        IF v_indexes IS DISTINCT FROM v_expected THEN
            RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable');
        END IF;
    END IF;
    RETURN jsonb_build_object(
        'success', true,
        'mode', s.mode,
        'questionId', p_question_id,
        'revisionId', v_revision_id,
        'position', v_position,
        'question', r.question,
        'options', r.options,
        'category', r.category,
        'difficulty', r.difficulty,
        'correctIndex', r.correct_index,
        'explanation', r.explanation,
        'engineMetadata', public.trivia_project_engine_metadata_v1(r.engine_metadata),
        'source', r.source);
END $$;

-- Durable server voids remain neutral even if the underlying question is
-- subsequently repaired or released from quarantine.
CREATE OR REPLACE FUNCTION public.trivia_p3_grade(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE s public.trivia_sessions%ROWTYPE; v_p public.trivia_roster_profiles%ROWTYPE; g jsonb;
BEGIN
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id;
    IF NOT FOUND OR s.engine_version IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
    END IF;
    SELECT * INTO v_p FROM public.trivia_roster_profiles WHERE profile_id = s.roster_profile_id;
    WITH a AS (
        SELECT a.*, r.correct_index,
               (a.server_voided_at IS NOT NULL
                OR NOT r.structurally_valid
                OR q.audit_verified IS FALSE
                OR EXISTS (SELECT 1 FROM public.trivia_question_quarantine z
                            WHERE z.question_id = a.question_id AND z.released_at IS NULL)) AS void,
               CASE WHEN a.answered_at IS NOT NULL AND a.opened_at IS NOT NULL
                    THEN greatest(0, (extract(epoch FROM (a.answered_at - a.opened_at)) * 1000)::bigint) END AS elapsed_ms
          FROM public.trivia_session_answers a
          JOIN public.trivia_question_revisions r ON r.id = a.revision_id
          JOIN public.trivia_questions q ON q.id = a.question_id
         WHERE a.session_id = p_session_id)
    SELECT jsonb_build_object('success', true, 'session_id', p_session_id, 'mode', s.mode,
        'total', count(*), 'voided', count(*) FILTER (WHERE void),
        'graded_total', count(*) FILTER (WHERE NOT void),
        'answered', count(*) FILTER (WHERE NOT void AND outcome IN ('correct','wrong','skip')),
        'correct', count(*) FILTER (WHERE NOT void AND outcome = 'correct'),
        'score', count(*) FILTER (WHERE NOT void AND outcome = 'correct') * v_p.points_per_correct,
        'answer_time_ms_total', coalesce(sum(elapsed_ms)
            FILTER (WHERE NOT void AND outcome IN ('correct','wrong','skip')), 0),
        'per_question', jsonb_agg(jsonb_build_object('position', position, 'question_id', question_id,
            'outcome', CASE WHEN void THEN 'void' ELSE coalesce(outcome, 'unanswered') END,
            'correct', (NOT void AND outcome = 'correct'), 'display_index', display_index,
            'answered_at', answered_at, 'elapsed_ms', CASE WHEN void THEN NULL ELSE elapsed_ms END) ORDER BY position),
        'sequence', coalesce(jsonb_agg(jsonb_build_object('questionIndex', position - 1,
            'result', CASE WHEN outcome = 'skip' THEN 'skip' WHEN outcome = 'correct' THEN 'correct' ELSE 'wrong' END)
            ORDER BY sequence) FILTER (WHERE sequence IS NOT NULL AND NOT void), '[]'::jsonb))
      INTO g FROM a;
    RETURN g;
END $$;

-- Post-close solo review must preserve the same neutral-void boundary as the
-- answer/review RPCs. A void row intentionally omits the correct display index
-- so neither first settlement nor replay can turn invalid content into an
-- answer-key oracle.
CREATE OR REPLACE FUNCTION public.trivia_p3_solo_review(p_session_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
    SELECT coalesce(jsonb_agg(
        CASE WHEN a.server_voided_at IS NOT NULL OR pq ->> 'outcome' = 'void' THEN
            jsonb_build_object(
                'questionId', a.question_id,
                'wasCorrect', false,
                'outcome', 'void',
                'voided', true)
        ELSE
            jsonb_build_object(
                'questionId', a.question_id,
                'wasCorrect', coalesce(a.is_correct, false),
                'correctDisplayIndex', (
                    SELECT (e.ord - 1)::integer
                      FROM jsonb_array_elements_text(s.permutations -> a.question_id::text)
                           WITH ORDINALITY e(value, ord)
                     WHERE e.value::integer = r.correct_index),
                'outcome', pq ->> 'outcome',
                'voided', false)
        END ORDER BY a.position), '[]'::jsonb)
      FROM public.trivia_sessions s
      JOIN public.trivia_session_answers a ON a.session_id = s.id
      JOIN public.trivia_question_revisions r
        ON r.id = a.revision_id AND r.question_id = a.question_id
      LEFT JOIN public.trivia_session_results result_row ON result_row.session_id = s.id
      LEFT JOIN LATERAL (
          SELECT item.value
            FROM jsonb_array_elements(coalesce(result_row.per_question, '[]'::jsonb)) item(value)
           WHERE (item.value ->> 'position')::integer = a.position
      ) result_item(pq) ON true
     WHERE s.id = p_session_id
       AND s.status <> 'open'
       AND s.mode NOT IN ('pvp','tournaments')
$$;

-- Phase 8 finalization keeps the immutable session day and derives all player
-- telemetry from the authoritative grade. A server void is neither a player
-- skip nor a correct/wrong attempt, even if the underlying row later changes.
CREATE OR REPLACE FUNCTION public.trivia_p3_finalize_session_v4(
    p_session_id uuid, p_outcome text, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE
    s public.trivia_sessions%ROWTYPE;
    g jsonb;
    v_res public.trivia_session_results%ROWTYPE;
    v_authority jsonb;
    v_hash text;
    v_human boolean;
    v_fast bigint;
    v_play_date date;
    v_play_hour integer;
BEGIN
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'session_not_found'); END IF;
    SELECT * INTO v_res FROM public.trivia_session_results WHERE session_id = p_session_id;
    IF FOUND THEN RETURN to_jsonb(v_res) || jsonb_build_object('replayed', true); END IF;
    v_authority := public.trivia_p8_lock_and_void_session_questions_v1(p_session_id);
    IF coalesce((v_authority ->> 'success')::boolean, false) IS NOT TRUE THEN RETURN v_authority; END IF;
    IF s.created_at IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_created_at_missing');
    END IF;
    v_play_date := (s.created_at AT TIME ZONE 'America/Chicago')::date;
    v_play_hour := extract(hour FROM (s.created_at AT TIME ZONE 'America/Chicago'))::integer;
    g := public.trivia_p3_grade(p_session_id);
    IF coalesce((g ->> 'success')::boolean, false) IS NOT TRUE THEN RETURN g; END IF;
    v_hash := public.trivia_sha256_hex_v1((g - 'success')::text);
    INSERT INTO public.trivia_session_results (session_id, user_id, actor_type, mode, engine_version, snapshot_id,
        round_no, outcome, total, graded_total, answered, correct, voided, score, answer_time_ms_total,
        completed_at, per_question, result_hash, request_id)
    VALUES (s.id, s.user_id, s.actor_type, s.mode, s.engine_version, s.roster_snapshot_id, s.roster_round_no, p_outcome,
        (g ->> 'total')::integer, (g ->> 'graded_total')::integer, (g ->> 'answered')::integer,
        (g ->> 'correct')::integer, (g ->> 'voided')::integer, (g ->> 'score')::integer,
        (g ->> 'answer_time_ms_total')::bigint, clock_timestamp(), g -> 'per_question', v_hash, p_request_id)
    RETURNING * INTO v_res;

    v_human := s.actor_type = 'human';
    INSERT INTO public.trivia_question_result_events (user_id, question_id, mode, source_type, source_id,
        display_index, original_index, was_correct, was_skipped, actor_type)
    SELECT s.user_id, a.question_id, s.mode, 'session', s.id, a.display_index, a.original_index,
           CASE WHEN pq ->> 'outcome' = 'void' THEN NULL ELSE coalesce(a.is_correct, false) END,
           CASE WHEN pq ->> 'outcome' = 'void' THEN false ELSE a.outcome = 'skip' END,
           s.actor_type
      FROM public.trivia_session_answers a
      JOIN jsonb_array_elements(g -> 'per_question') pq ON (pq ->> 'position')::integer = a.position
     WHERE a.session_id = s.id AND a.outcome IS NOT NULL
    ON CONFLICT (source_type, source_id, user_id, question_id) DO NOTHING;

    IF v_human THEN
        INSERT INTO public.trivia_user_question_history AS h (user_id, question_id, seen_at, was_correct, mode)
        SELECT s.user_id, a.question_id, s.created_at,
               CASE WHEN pq ->> 'outcome' = 'void' THEN NULL
                    WHEN a.outcome IN ('correct','wrong','late','timeout') THEN coalesce(a.is_correct, false) END,
               s.mode
          FROM public.trivia_session_answers a
          JOIN jsonb_array_elements(g -> 'per_question') pq ON (pq ->> 'position')::integer = a.position
         WHERE a.session_id = s.id
        ON CONFLICT (user_id, question_id) DO UPDATE SET was_correct = EXCLUDED.was_correct, mode = EXCLUDED.mode,
            seen_at = greatest(h.seen_at, EXCLUDED.seen_at);

        UPDATE public.trivia_questions q SET times_correct = coalesce(q.times_correct, 0) + 1
          FROM public.trivia_session_answers a
          JOIN jsonb_array_elements(g -> 'per_question') pq ON (pq ->> 'position')::integer = a.position
         WHERE a.session_id = s.id AND a.question_id = q.id AND a.outcome = 'correct'
           AND pq ->> 'outcome' <> 'void';
        UPDATE public.trivia_questions q SET skipped_count = coalesce(q.skipped_count, 0) + 1
          FROM public.trivia_session_answers a
          JOIN jsonb_array_elements(g -> 'per_question') pq ON (pq ->> 'position')::integer = a.position
         WHERE a.session_id = s.id AND a.question_id = q.id AND a.outcome = 'skip'
           AND pq ->> 'outcome' <> 'void';

        INSERT INTO public.trivia_category_mastery AS m (user_id, category, total_answered, correct_count, mastery_level, updated_at)
        SELECT s.user_id, r.category, count(*), count(*) FILTER (WHERE a.outcome = 'correct'),
               least(10, greatest(1, floor((count(*) FILTER (WHERE a.outcome = 'correct'))::numeric
                   / count(*) * 10)::integer + 1)), now()
          FROM public.trivia_session_answers a
          JOIN public.trivia_question_revisions r ON r.id = a.revision_id
          JOIN jsonb_array_elements(g -> 'per_question') pq ON (pq ->> 'position')::integer = a.position
         WHERE a.session_id = s.id AND a.outcome IN ('correct','wrong') AND pq ->> 'outcome' <> 'void'
         GROUP BY r.category
        ON CONFLICT (user_id, category) DO UPDATE SET
            total_answered = m.total_answered + EXCLUDED.total_answered,
            correct_count = m.correct_count + EXCLUDED.correct_count,
            mastery_level = least(10, greatest(1, floor(((m.correct_count + EXCLUDED.correct_count)::numeric
                / nullif(m.total_answered + EXCLUDED.total_answered, 0)) * 10)::integer + 1)),
            updated_at = now();

        IF s.mode = 'daily' AND p_outcome = 'submitted' THEN
            INSERT INTO public.daily_trivia_plays AS d (user_id, played_date, was_correct, streak_at_time, created_at)
            VALUES (s.user_id, v_play_date, v_res.correct > 0,
                    coalesce((SELECT current_streak FROM public.trivia_streaks WHERE user_id = s.user_id), 0), now())
            ON CONFLICT (user_id, played_date) DO UPDATE SET was_correct = d.was_correct OR EXCLUDED.was_correct,
                streak_at_time = greatest(coalesce(d.streak_at_time, 0), EXCLUDED.streak_at_time);
        END IF;

        SELECT min((extract(epoch FROM (a.answered_at - a.opened_at)) * 1000)::bigint) INTO v_fast
          FROM public.trivia_session_answers a
          JOIN jsonb_array_elements(g -> 'per_question') pq ON (pq ->> 'position')::integer = a.position
         WHERE a.session_id = s.id AND a.outcome = 'correct' AND pq ->> 'outcome' <> 'void';
        INSERT INTO public.trivia_achievement_events (user_id, event_type, source_type, source_id, payload)
        VALUES (s.user_id, 'trivia.run.completed', 'session', s.id, jsonb_build_object('mode', s.mode,
            'outcome', p_outcome, 'correct', v_res.correct, 'graded_total', v_res.graded_total,
            'answered', v_res.answered, 'perfect', v_res.graded_total > 0 AND v_res.correct = v_res.graded_total,
            'answer_time_ms_total', v_res.answer_time_ms_total, 'fastest_correct_ms', v_fast,
            'local_hour', v_play_hour, 'engine', s.engine_version))
        ON CONFLICT DO NOTHING;
    END IF;
    UPDATE public.trivia_sessions SET stats_recorded_at = coalesce(stats_recorded_at, now()) WHERE id = s.id;
    RETURN to_jsonb(v_res) || jsonb_build_object('replayed', false);
END $$;

-- Reconstruct the complete legacy grade from locked database evidence. This
-- is the sole basis accepted by award_trivia_run_v4; caller-provided scoring
-- remains a comparison value, never payout authority.
CREATE OR REPLACE FUNCTION public.trivia_p8_legacy_grade_locked_v1(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE
    s public.trivia_sessions%ROWTYPE;
    r public.trivia_question_revisions%ROWTYPE;
    v_lock jsonb;
    v_bound record;
    v_total integer;
    v_voided integer := 0;
    v_answered integer := 0;
    v_correct integer := 0;
    v_points integer;
    v_revision_id uuid;
    v_stored jsonb;
    v_perm jsonb;
    v_indexes integer[];
    v_expected integer[];
    v_seen_ordinals integer[] := '{}'::integer[];
    v_answer_ordinal integer;
    v_display integer;
    v_original integer;
    v_correct_display integer;
    v_was_correct boolean;
    v_at timestamptz;
    v_review jsonb := '[]'::jsonb;
BEGIN
    v_lock := public.trivia_p8_lock_and_void_session_questions_v1(p_session_id);
    IF coalesce((v_lock ->> 'success')::boolean, false) IS NOT TRUE THEN RETURN v_lock; END IF;
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id;
    IF s.engine_version IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_legacy_session');
    END IF;
    v_total := coalesce(cardinality(s.question_ids), 0);
    IF jsonb_typeof(s.answers) IS DISTINCT FROM 'object' THEN
        RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
    END IF;
    IF EXISTS (
            SELECT 1 FROM jsonb_object_keys(s.answers) answer_key(key)
             WHERE NOT EXISTS (
                 SELECT 1 FROM unnest(s.question_ids) q(question_id)
                  WHERE q.question_id::text = answer_key.key)) THEN
        RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
    END IF;
    v_points := CASE s.mode
        WHEN 'arcade' THEN 200 WHEN 'survival' THEN 200 WHEN 'endless' THEN 200
        WHEN 'time-attack' THEN 200 WHEN 'tournaments' THEN 200 WHEN 'gto' THEN 150
        ELSE 100 END;

    FOR v_bound IN
        SELECT q.question_id, q.ordinality::integer AS position
          FROM unnest(s.question_ids) WITH ORDINALITY q(question_id, ordinality)
         ORDER BY q.ordinality
    LOOP
        BEGIN
            v_revision_id := (s.question_revision_ids ->> v_bound.question_id::text)::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
            v_revision_id := NULL;
        END;
        SELECT * INTO r FROM public.trivia_question_revisions
         WHERE id = v_revision_id AND question_id = v_bound.question_id;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable');
        END IF;
        IF jsonb_typeof(r.options) IS DISTINCT FROM 'array' OR jsonb_array_length(r.options) < 1 THEN
            RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable');
        END IF;
        v_perm := s.permutations -> v_bound.question_id::text;
        IF jsonb_typeof(v_perm) IS DISTINCT FROM 'array'
           OR jsonb_array_length(v_perm) <> jsonb_array_length(r.options)
           OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_perm) e(value)
                       WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'number'
                          OR e.value::text !~ '^[0-9]+$') THEN
            RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable');
        END IF;
        SELECT array_agg(e.value::text::integer ORDER BY e.value::text::integer)
          INTO v_indexes FROM jsonb_array_elements(v_perm) e(value);
        SELECT array_agg(i ORDER BY i) INTO v_expected
          FROM generate_series(0, jsonb_array_length(r.options) - 1) i;
        IF v_indexes IS DISTINCT FROM v_expected
           OR r.correct_index < 0 OR r.correct_index >= jsonb_array_length(r.options) THEN
            RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable');
        END IF;
        SELECT (e.ordinality - 1)::integer INTO v_correct_display
          FROM jsonb_array_elements(v_perm) WITH ORDINALITY e(value, ordinality)
         WHERE e.value::text::integer = r.correct_index;
        IF v_correct_display IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'revision_provenance_unavailable');
        END IF;

        v_stored := s.answers -> v_bound.question_id::text;
        IF v_stored -> 'v' = 'true'::jsonb THEN
            IF jsonb_typeof(v_stored) IS DISTINCT FROM 'object' THEN
                RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
            END IF;
            IF (SELECT count(*) FROM jsonb_object_keys(v_stored)) <> 5
               OR NOT (v_stored ?& ARRAY['d','n','at','v','vr'])
               OR v_stored -> 'v' IS DISTINCT FROM 'true'::jsonb
               OR v_stored ->> 'd' IS DISTINCT FROM '-1'
               OR jsonb_typeof(v_stored -> 'n') IS DISTINCT FROM 'number'
               OR coalesce(v_stored ->> 'n', '') !~ '^[0-9]+$'
               OR (v_stored ->> 'n')::integer <> v_bound.position - 1
               OR jsonb_typeof(v_stored -> 'at') IS DISTINCT FROM 'string'
               OR coalesce(v_stored ->> 'vr', '') NOT IN ('structural','audit','quarantine') THEN
                RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
            END IF;
            BEGIN
                v_at := (v_stored ->> 'at')::timestamptz;
            EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
                RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
            END;
            v_voided := v_voided + 1;
            v_review := v_review || jsonb_build_array(jsonb_build_object(
                'questionId', v_bound.question_id, 'wasCorrect', false,
                'correctDisplayIndex', -1, 'outcome', 'voided', 'voided', true));
            CONTINUE;
        END IF;

        v_was_correct := false;
        IF v_stored IS NOT NULL THEN
            IF jsonb_typeof(v_stored) IS DISTINCT FROM 'object' THEN
                RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
            END IF;
            IF (SELECT count(*) FROM jsonb_object_keys(v_stored)) <> 3
               OR NOT (v_stored ?& ARRAY['d','n','at'])
               OR jsonb_typeof(v_stored -> 'd') IS DISTINCT FROM 'number'
               OR coalesce(v_stored ->> 'd', '') !~ '^-?[0-9]+$'
               OR jsonb_typeof(v_stored -> 'n') IS DISTINCT FROM 'number'
               OR coalesce(v_stored ->> 'n', '') !~ '^[0-9]+$'
               OR jsonb_typeof(v_stored -> 'at') IS DISTINCT FROM 'string' THEN
                RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
            END IF;
            v_display := (v_stored ->> 'd')::integer;
            v_answer_ordinal := (v_stored ->> 'n')::integer;
            IF v_display < -1 OR v_display >= jsonb_array_length(r.options)
               OR v_answer_ordinal < 0 OR v_answer_ordinal >= v_total
               OR v_seen_ordinals @> ARRAY[v_answer_ordinal] THEN
                RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
            END IF;
            BEGIN
                v_at := (v_stored ->> 'at')::timestamptz;
            EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
                RETURN jsonb_build_object('success', false, 'error', 'answer_record_invalid');
            END;
            v_seen_ordinals := array_append(v_seen_ordinals, v_answer_ordinal);
            v_answered := v_answered + 1;
            IF v_display >= 0 THEN
                v_original := (v_perm ->> v_display)::integer;
                v_was_correct := v_original = r.correct_index;
            END IF;
        ELSE
            v_display := -1;
        END IF;
        IF v_was_correct THEN v_correct := v_correct + 1; END IF;
        v_review := v_review || jsonb_build_array(jsonb_build_object(
            'questionId', v_bound.question_id, 'wasCorrect', v_was_correct,
            'correctDisplayIndex', v_correct_display,
            'outcome', CASE WHEN v_was_correct THEN 'correct' ELSE 'wrong' END,
            'voided', false));
    END LOOP;
    RETURN jsonb_build_object(
        'success', true, 'total', v_total, 'graded_total', v_total - v_voided,
        'answered', v_answered, 'completion_answered', v_answered + v_voided,
        'correct', v_correct, 'voided', v_voided, 'score', v_correct * v_points,
        'per_question', v_review);
END $$;

-- p_total remains the authoritative graded denominator. Completion facts are
-- separate so a neutral server void cannot erase the Daily completion bonus.
-- The original session date is the immutable Daily accounting day.
CREATE OR REPLACE FUNCTION public.award_trivia_run_v4(
    p_session_id uuid, p_score integer, p_correct integer, p_total integer,
    p_answered integer, p_diamonds integer,
    p_completion_total integer, p_completion_answered integer, p_request_id uuid,
    p_settlement_snapshot jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE
    v_session public.trivia_sessions%ROWTYPE;
    v_award jsonb;
    v_bonus jsonb;
    v_result jsonb;
    v_score_id uuid;
    v_existing public.trivia_scores%ROWTYPE;
    v_streak public.trivia_streaks%ROWTYPE;
    v_was_open boolean;
    v_play_date date;
    v_total_for_stats integer;
    v_mode_cap integer;
    v_earned_today integer;
    v_clamped integer;
    v_bonus_amount integer := 0;
    v_new_streak integer := 0;
    v_gap integer;
    v_item_qty integer;
    v_snapshot_correct integer;
    v_snapshot_voided integer;
    v_api_snapshot jsonb;
    v_authority jsonb;
    v_grade jsonb;
BEGIN
    IF p_request_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'request_id_required'); END IF;
    SELECT * INTO v_session FROM public.trivia_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'session_not_found'); END IF;
    IF v_session.user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'session_owner_missing'); END IF;
    v_was_open := v_session.status = 'open';
    IF v_session.created_at IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_created_at_missing');
    END IF;
    v_play_date := (v_session.created_at AT TIME ZONE 'America/Chicago')::date;
    IF v_session.status = 'submitted' THEN
        IF v_session.settlement_result IS NOT NULL THEN
            RETURN v_session.settlement_result || jsonb_build_object('replayed', true);
        END IF;
        SELECT id INTO v_score_id FROM public.trivia_scores WHERE session_id = p_session_id LIMIT 1;
        RETURN jsonb_build_object('success', true, 'replayed', true, 'session_id', p_session_id,
            'score', v_session.score, 'correct_count', v_session.correct_count,
            'diamonds_awarded', coalesce(v_session.diamonds_awarded, 0), 'score_id', v_score_id);
    END IF;
    IF coalesce(p_score, 0) < 0 OR coalesce(p_correct, 0) < 0 OR coalesce(p_total, 0) < 0
       OR coalesce(p_answered, 0) < 0 OR coalesce(p_diamonds, 0) < 0
       OR coalesce(p_completion_total, 0) < 0 OR coalesce(p_completion_answered, 0) < 0
       OR coalesce(p_correct, 0) > coalesce(p_total, 0)
       OR coalesce(p_total, 0) > coalesce(p_completion_total, 0)
       OR coalesce(p_completion_answered, 0) > coalesce(p_completion_total, 0) THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_settlement_facts');
    END IF;

    -- Legacy grading still happens in the trusted API, but the review basis is
    -- independently rebuilt from locked database evidence in this payout
    -- transaction. The API values below are only an equality assertion.
    IF v_session.engine_version IS NULL THEN
        IF p_settlement_snapshot IS NULL
           OR jsonb_typeof(p_settlement_snapshot) IS DISTINCT FROM 'object' THEN
            RETURN jsonb_build_object('success', false, 'error', 'settlement_snapshot_invalid');
        END IF;
        IF jsonb_typeof(p_settlement_snapshot -> 'perQuestion') IS DISTINCT FROM 'array' THEN
            RETURN jsonb_build_object('success', false, 'error', 'settlement_snapshot_invalid');
        END IF;
        IF jsonb_array_length(p_settlement_snapshot -> 'perQuestion')
                <> coalesce(cardinality(v_session.question_ids), 0)
           OR coalesce(p_completion_total, -1) <> coalesce(cardinality(v_session.question_ids), 0)
           OR (p_settlement_snapshot ? 'deadlinePassed'
               AND p_settlement_snapshot -> 'deadlinePassed' NOT IN ('true'::jsonb, 'false'::jsonb)) THEN
            RETURN jsonb_build_object('success', false, 'error', 'settlement_snapshot_invalid');
        END IF;
        IF EXISTS (
            SELECT 1
              FROM jsonb_array_elements(p_settlement_snapshot -> 'perQuestion')
                   WITH ORDINALITY item(value, ordinality)
             WHERE jsonb_typeof(item.value) IS DISTINCT FROM 'object'
                OR item.value ->> 'questionId'
                    IS DISTINCT FROM v_session.question_ids[item.ordinality::integer]::text
                OR jsonb_typeof(item.value -> 'wasCorrect') IS DISTINCT FROM 'boolean'
                OR jsonb_typeof(item.value -> 'correctDisplayIndex') IS DISTINCT FROM 'number'
                OR coalesce(item.value ->> 'correctDisplayIndex', '') !~ '^-?[0-9]+$'
                OR coalesce(item.value ->> 'outcome', '') NOT IN ('correct','wrong','voided')
                OR jsonb_typeof(item.value -> 'voided') IS DISTINCT FROM 'boolean'
                OR CASE WHEN item.value -> 'voided' = 'true'::jsonb THEN
                         item.value -> 'wasCorrect' <> 'false'::jsonb
                         OR item.value ->> 'correctDisplayIndex' <> '-1'
                         OR item.value ->> 'outcome' <> 'voided'
                        ELSE
                         item.value ->> 'outcome' <> CASE
                             WHEN item.value -> 'wasCorrect' = 'true'::jsonb THEN 'correct' ELSE 'wrong' END
                     END) THEN
            RETURN jsonb_build_object('success', false, 'error', 'settlement_snapshot_invalid');
        END IF;
        SELECT count(*) FILTER (WHERE item.value -> 'wasCorrect' = 'true'::jsonb),
               count(*) FILTER (WHERE item.value -> 'voided' = 'true'::jsonb)
          INTO v_snapshot_correct, v_snapshot_voided
          FROM jsonb_array_elements(p_settlement_snapshot -> 'perQuestion') item(value);
        IF v_snapshot_correct <> coalesce(p_correct, 0)
           OR v_snapshot_voided <> coalesce(p_completion_total, 0) - coalesce(p_total, 0) THEN
            RETURN jsonb_build_object('success', false, 'error', 'settlement_snapshot_invalid');
        END IF;
        v_grade := public.trivia_p8_legacy_grade_locked_v1(p_session_id);
        IF coalesce((v_grade ->> 'success')::boolean, false) IS NOT TRUE THEN RETURN v_grade; END IF;
        IF coalesce(p_score, -1) <> (v_grade ->> 'score')::integer
           OR coalesce(p_correct, -1) <> (v_grade ->> 'correct')::integer
           OR coalesce(p_total, -1) <> (v_grade ->> 'graded_total')::integer
           OR coalesce(p_answered, -1) <> (v_grade ->> 'answered')::integer
           OR coalesce(p_completion_total, -1) <> (v_grade ->> 'total')::integer
           OR coalesce(p_completion_answered, -1) <> (v_grade ->> 'completion_answered')::integer
           OR p_settlement_snapshot -> 'perQuestion' IS DISTINCT FROM v_grade -> 'per_question' THEN
            RETURN jsonb_build_object('success', false, 'error', 'grade_changed');
        END IF;
    ELSIF p_settlement_snapshot IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'settlement_snapshot_not_applicable');
    ELSE
        v_authority := public.trivia_p8_lock_and_void_session_questions_v1(p_session_id);
        IF coalesce((v_authority ->> 'success')::boolean, false) IS NOT TRUE THEN RETURN v_authority; END IF;
        v_grade := public.trivia_p3_grade(p_session_id);
        IF coalesce((v_grade ->> 'success')::boolean, false) IS NOT TRUE THEN RETURN v_grade; END IF;
        SELECT count(*) FILTER (WHERE a.outcome IS NOT NULL OR a.server_voided_at IS NOT NULL)
          INTO v_snapshot_correct
          FROM public.trivia_session_answers a WHERE a.session_id = p_session_id;
        IF coalesce(p_score, -1) <> (v_grade ->> 'score')::integer
           OR coalesce(p_correct, -1) <> (v_grade ->> 'correct')::integer
           OR coalesce(p_total, -1) <> (v_grade ->> 'graded_total')::integer
           OR coalesce(p_answered, -1) <> (v_grade ->> 'answered')::integer
           OR coalesce(p_completion_total, -1) <> (v_grade ->> 'total')::integer
           OR coalesce(p_completion_answered, -1) <> coalesce(v_snapshot_correct, 0) THEN
            RETURN jsonb_build_object('success', false, 'error', 'grade_changed');
        END IF;
    END IF;
    IF v_session.status <> 'open' THEN RETURN jsonb_build_object('success', false, 'error', 'session_closed'); END IF;

    IF v_session.mode IN ('arcade','mtt','cash','icm','gto','mixed','endless','survival','time-attack')
       AND v_session.entry_state NOT IN ('charged','vip','continuation','ticket') THEN
        RETURN jsonb_build_object('success', false, 'error', 'entry_not_verified');
    END IF;
    v_total_for_stats := CASE WHEN v_session.mode IN ('endless','time-attack')
        THEN greatest(coalesce(p_answered, 0), coalesce(p_correct, 0))
        ELSE greatest(coalesce(p_total, 0), coalesce(p_correct, 0)) END;

    PERFORM pg_advisory_xact_lock(hashtextextended(
        v_session.user_id::text || ':' || v_session.mode || ':' || v_play_date::text, 0));
    v_mode_cap := CASE v_session.mode
        WHEN 'daily' THEN 10 WHEN 'history' THEN 10 WHEN 'rules' THEN 10 WHEN 'pro' THEN 10
        WHEN 'arcade' THEN 40 WHEN 'survival' THEN 80 WHEN 'mtt' THEN 40
        WHEN 'cash' THEN 40 WHEN 'icm' THEN 40 WHEN 'gto' THEN 60
        WHEN 'mixed' THEN 40 WHEN 'endless' THEN 40 WHEN 'time-attack' THEN 40 ELSE 0 END;
    SELECT coalesce(sum(diamonds_awarded), 0)::integer INTO v_earned_today
      FROM public.trivia_sessions
     WHERE user_id = v_session.user_id AND mode = v_session.mode
       AND status = 'submitted'
       AND (created_at AT TIME ZONE 'America/Chicago')::date = v_play_date;
    v_clamped := least(greatest(coalesce(p_diamonds, 0), 0), greatest(v_mode_cap - v_earned_today, 0));

    SELECT public.award_trivia_run(p_session_id, p_score, p_correct, p_total, v_clamped) INTO v_award;
    IF coalesce((v_award ->> 'success')::boolean, false) IS NOT TRUE THEN RETURN v_award; END IF;

    IF v_session.mode = 'daily' THEN
        SELECT * INTO v_existing FROM public.trivia_scores
         WHERE user_id = v_session.user_id AND mode = 'daily' AND play_date = v_play_date
         ORDER BY created_at LIMIT 1 FOR UPDATE;
        IF FOUND THEN
            IF v_existing.server_verified IS NOT TRUE OR coalesce(p_score, 0) > coalesce(v_existing.score, 0) THEN
                UPDATE public.trivia_scores
                   SET score = greatest(coalesce(p_score, 0), 0),
                       correct_count = greatest(coalesce(p_correct, 0), 0),
                       total_questions = v_total_for_stats, diamonds_earned = v_clamped,
                       session_id = p_session_id, server_verified = true
                 WHERE id = v_existing.id RETURNING id INTO v_score_id;
            ELSE
                v_score_id := v_existing.id;
            END IF;
        ELSE
            INSERT INTO public.trivia_scores(user_id, username, mode, score, correct_count, total_questions,
                diamonds_earned, play_date, session_id, server_verified)
            SELECT v_session.user_id, p.username, 'daily', greatest(coalesce(p_score, 0), 0),
                greatest(coalesce(p_correct, 0), 0), v_total_for_stats, v_clamped, v_play_date,
                p_session_id, true
              FROM public.profiles p WHERE p.id = v_session.user_id RETURNING id INTO v_score_id;
        END IF;
    ELSE
        INSERT INTO public.trivia_scores(user_id, username, mode, score, correct_count, total_questions,
            diamonds_earned, play_date, session_id, server_verified)
        SELECT v_session.user_id, p.username, v_session.mode, greatest(coalesce(p_score, 0), 0),
            greatest(coalesce(p_correct, 0), 0), v_total_for_stats, v_clamped, v_play_date,
            p_session_id, true
          FROM public.profiles p WHERE p.id = v_session.user_id RETURNING id INTO v_score_id;
    END IF;
    IF v_score_id IS NULL THEN RAISE EXCEPTION 'profile_not_found_for_trivia_score'; END IF;

    SELECT * INTO v_streak FROM public.trivia_streaks WHERE user_id = v_session.user_id FOR UPDATE;
    IF NOT FOUND THEN
        v_new_streak := CASE WHEN v_session.mode = 'daily' THEN 1 ELSE 0 END;
        INSERT INTO public.trivia_streaks(user_id, current_streak, best_streak, last_play_date,
            total_games_played, total_correct, updated_at)
        VALUES (v_session.user_id, v_new_streak, v_new_streak,
            CASE WHEN v_session.mode = 'daily' THEN v_play_date ELSE NULL END,
            1, greatest(coalesce(p_correct, 0), 0), now());
    ELSE
        v_new_streak := coalesce(v_streak.current_streak, 0);
        IF v_session.mode = 'daily'
           AND (v_streak.last_play_date IS NULL OR v_streak.last_play_date < v_play_date) THEN
            v_gap := CASE WHEN v_streak.last_play_date IS NULL THEN NULL
                          ELSE v_play_date - v_streak.last_play_date END;
            IF v_gap IS NULL THEN
                v_new_streak := 1;
            ELSIF v_gap = 1 THEN
                v_new_streak := v_new_streak + 1;
            ELSIF v_gap = 2 THEN
                UPDATE public.trivia_user_items SET quantity = quantity - 1, updated_at = now()
                 WHERE user_id = v_session.user_id AND item_type = 'streak_shield' AND quantity > 0
                RETURNING quantity INTO v_item_qty;
                IF FOUND THEN
                    v_new_streak := v_new_streak + 1;
                    INSERT INTO public.trivia_item_transactions(
                        user_id, item_type, amount, balance_after, transaction_type, reference_id, metadata)
                    VALUES (v_session.user_id, 'streak_shield', -1, v_item_qty, 'streak_protection',
                        'trivia_shield_' || p_session_id::text, jsonb_build_object('session_id', p_session_id));
                ELSE
                    v_new_streak := 1;
                END IF;
            ELSE
                v_new_streak := 1;
            END IF;
        END IF;
        UPDATE public.trivia_streaks
           SET current_streak = v_new_streak,
               best_streak = greatest(coalesce(best_streak, 0), v_new_streak),
               last_play_date = CASE WHEN v_session.mode = 'daily'
                    THEN CASE WHEN last_play_date IS NULL THEN v_play_date ELSE greatest(last_play_date, v_play_date) END
                    ELSE last_play_date END,
               total_games_played = coalesce(total_games_played, 0) + 1,
               total_correct = coalesce(total_correct, 0) + greatest(coalesce(p_correct, 0), 0),
               updated_at = now()
         WHERE user_id = v_session.user_id;
    END IF;

    IF v_was_open AND v_session.mode = 'daily'
       AND coalesce(p_completion_total, 0) >= 10
       AND coalesce(p_completion_answered, 0) >= p_completion_total THEN
        SELECT public.trivia_solo_credit(v_session.user_id, 10, 'trivia_daily_bonus',
            'Daily trivia completion bonus',
            'trivia_daily_bonus_' || v_session.user_id::text || '_' || v_play_date::text,
            'trivia_daily_bonus',
            'trivia_daily_bonus_' || v_session.user_id::text || '_' || v_play_date::text,
            'daily') INTO v_bonus;
        IF coalesce((v_bonus ->> 'success')::boolean, false) IS TRUE THEN
            v_bonus_amount := 10;
        ELSIF coalesce((v_bonus ->> 'duplicate')::boolean, false) IS NOT TRUE THEN
            RAISE EXCEPTION 'daily bonus rejected: %', coalesce(v_bonus ->> 'error', 'unknown');
        END IF;
    END IF;

    v_result := v_award || jsonb_build_object(
        'score_id', v_score_id,
        'daily_bonus_awarded', v_bonus_amount,
        'new_balance', coalesce(v_bonus -> 'new_balance', v_award -> 'new_balance'),
        'replayed', false);
    IF v_session.engine_version IS NULL THEN
        v_api_snapshot := jsonb_build_object(
            'success', true,
            'sessionId', p_session_id,
            'mode', v_session.mode,
            'correct', greatest(coalesce(p_correct, 0), 0),
            'total', greatest(coalesce(p_total, 0), 0),
            'servedTotal', greatest(coalesce(p_completion_total, 0), 0),
            'voided', greatest(coalesce(p_completion_total, 0) - coalesce(p_total, 0), 0),
            'score', greatest(coalesce(p_score, 0), 0),
            'scoreId', v_score_id,
            'diamondsAwarded', v_clamped,
            'dailyBonusAwarded', v_bonus_amount,
            'newBalance', coalesce(v_bonus -> 'new_balance', v_award -> 'new_balance'),
            'replayed', false,
            'deadlinePassed', coalesce(p_settlement_snapshot -> 'deadlinePassed', 'false'::jsonb),
            'perQuestion', p_settlement_snapshot -> 'perQuestion');
        v_result := v_result || jsonb_build_object('api_response_v1', v_api_snapshot);
    END IF;
    UPDATE public.trivia_sessions
       SET settlement_result = v_result, settlement_request_id = p_request_id
     WHERE id = p_session_id AND status = 'submitted' AND settlement_request_id IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'successful trivia settlement did not seal request identity'; END IF;
    RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.trivia_session_settle_solo_v4(
    p_session_id uuid, p_user_id uuid, p_diamonds integer,
    p_grade_basis jsonb, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE
    s public.trivia_sessions%ROWTYPE;
    g jsonb;
    v_award jsonb;
    v_r jsonb;
    v_authority jsonb;
    v_completion_answered integer;
BEGIN
    IF p_request_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'request_id_required'); END IF;
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'session_not_found'); END IF;
    IF s.user_id IS DISTINCT FROM p_user_id THEN RETURN jsonb_build_object('success', false, 'error', 'not_your_session'); END IF;
    IF s.engine_version IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_engine_v3'); END IF;
    IF s.mode IN ('pvp','tournaments') THEN RETURN jsonb_build_object('success', false, 'error', 'use_submit_v3'); END IF;
    IF s.status = 'submitted' THEN
        v_r := public.trivia_p3_finalize_session_v4(s.id, 'submitted', p_request_id);
        RETURN coalesce(s.settlement_result, '{}'::jsonb) || public.trivia_p3_result_receipt(v_r, 'submitted')
            || jsonb_build_object('replayed', true, 'per_question', public.trivia_p3_solo_review(s.id));
    END IF;
    IF s.status <> 'open' THEN RETURN jsonb_build_object('success', false, 'error', 'session_closed'); END IF;
    v_authority := public.trivia_p8_lock_and_void_session_questions_v1(s.id);
    IF coalesce((v_authority ->> 'success')::boolean, false) IS NOT TRUE THEN RETURN v_authority; END IF;
    g := public.trivia_p3_grade(s.id);
    IF p_grade_basis IS DISTINCT FROM g THEN
        RETURN jsonb_build_object('success', false, 'error', 'grade_changed');
    END IF;
    SELECT count(*) FILTER (WHERE a.outcome IS NOT NULL
        OR a.server_voided_at IS NOT NULL
        OR NOT r.structurally_valid
        OR q.audit_verified IS FALSE
        OR EXISTS (SELECT 1 FROM public.trivia_question_quarantine z
                    WHERE z.question_id = a.question_id AND z.released_at IS NULL))
      INTO v_completion_answered
      FROM public.trivia_session_answers a
      JOIN public.trivia_question_revisions r ON r.id = a.revision_id
      JOIN public.trivia_questions q ON q.id = a.question_id
     WHERE a.session_id = s.id;
    v_award := public.award_trivia_run_v4(
        s.id, (g ->> 'score')::int, (g ->> 'correct')::int,
        (g ->> 'graded_total')::int, (g ->> 'answered')::int,
        greatest(0, coalesce(p_diamonds, 0)), (g ->> 'total')::int,
        coalesce(v_completion_answered, 0), p_request_id, NULL);
    IF coalesce((v_award ->> 'success')::boolean, false) IS NOT TRUE THEN
        IF v_award ->> 'error' = 'session_expired' THEN
            PERFORM public.trivia_p3_finalize_session_v4(s.id, 'expired', p_request_id);
            INSERT INTO public.trivia_session_reconciliations (session_id, action, reason, actor)
            VALUES (s.id, 'expired', 'settle_after_deadline', 'trivia_session_settle_solo_v4')
            ON CONFLICT DO NOTHING;
        END IF;
        RETURN v_award;
    END IF;
    v_r := public.trivia_p3_finalize_session_v4(s.id, 'submitted', p_request_id);
    RETURN v_award || public.trivia_p3_result_receipt(v_r, 'submitted')
        || jsonb_build_object('per_question', public.trivia_p3_solo_review(s.id));
END $$;

ALTER TABLE public.trivia_gto_render_claims OWNER TO postgres;
ALTER FUNCTION public.trivia_claim_gto_render_v1(text,uuid,integer) OWNER TO postgres;
ALTER FUNCTION public.trivia_release_gto_render_v1(text,uuid) OWNER TO postgres;
ALTER FUNCTION public.trivia_session_settlement_request_guard_v1() OWNER TO postgres;
ALTER FUNCTION public.trivia_session_revision_map_guard_v1() OWNER TO postgres;
ALTER FUNCTION public.trivia_session_answer_guard_v1() OWNER TO postgres;
ALTER FUNCTION public.trivia_bind_revision_engine_metadata_v1() OWNER TO postgres;
ALTER FUNCTION public.trivia_capture_question_revision_v1() OWNER TO postgres;
ALTER FUNCTION public.trivia_capture_engine_metadata_revision_v1() OWNER TO postgres;
ALTER FUNCTION public.trivia_submit_question_report_v2(uuid,uuid,text,text,uuid) OWNER TO postgres;
ALTER FUNCTION public.trivia_p8_lock_and_void_session_questions_v1(uuid) OWNER TO postgres;
ALTER FUNCTION public.trivia_legacy_session_answer_v1(uuid,uuid,uuid,integer,uuid) OWNER TO postgres;
ALTER FUNCTION public.trivia_record_invalid_question_v1(uuid,uuid,uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.trivia_project_engine_metadata_v1(jsonb) OWNER TO postgres;
ALTER FUNCTION public.trivia_session_context_projection_v1(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.trivia_session_answer_v4(uuid,uuid,uuid,integer,uuid) OWNER TO postgres;
ALTER FUNCTION public.trivia_session_question_review_v1(uuid,uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.trivia_p3_grade(uuid) OWNER TO postgres;
ALTER FUNCTION public.trivia_p3_solo_review(uuid) OWNER TO postgres;
ALTER FUNCTION public.trivia_p3_finalize_session_v4(uuid,text,uuid) OWNER TO postgres;
ALTER FUNCTION public.trivia_p8_legacy_grade_locked_v1(uuid) OWNER TO postgres;
ALTER FUNCTION public.award_trivia_run_v4(uuid,integer,integer,integer,integer,integer,integer,integer,uuid,jsonb) OWNER TO postgres;
ALTER FUNCTION public.trivia_session_settle_solo_v4(uuid,uuid,integer,jsonb,uuid) OWNER TO postgres;

REVOKE ALL ON TABLE public.trivia_gto_render_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trivia_gto_render_claims TO service_role;
REVOKE SELECT (engine_metadata) ON public.trivia_question_revisions FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.trivia_claim_gto_render_v1(text,uuid,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trivia_release_gto_render_v1(text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trivia_session_settlement_request_guard_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_session_revision_map_guard_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_session_answer_guard_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_bind_revision_engine_metadata_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_capture_question_revision_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_capture_engine_metadata_revision_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_submit_question_report_v2(uuid,uuid,text,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trivia_p8_lock_and_void_session_questions_v1(uuid)
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_legacy_session_answer_v1(uuid,uuid,uuid,integer,uuid)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trivia_record_invalid_question_v1(uuid,uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trivia_project_engine_metadata_v1(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_session_context_projection_v1(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trivia_session_answer_v4(uuid,uuid,uuid,integer,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trivia_session_question_review_v1(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trivia_p3_grade(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_p3_solo_review(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_p3_finalize_session_v4(uuid,text,uuid)
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_p8_legacy_grade_locked_v1(uuid)
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.award_trivia_run_v4(uuid,integer,integer,integer,integer,integer,integer,integer,uuid,jsonb)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trivia_session_settle_solo_v4(uuid,uuid,integer,jsonb,uuid)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.trivia_claim_gto_render_v1(text,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_release_gto_render_v1(text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_submit_question_report_v2(uuid,uuid,text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_legacy_session_answer_v1(uuid,uuid,uuid,integer,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_record_invalid_question_v1(uuid,uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_session_context_projection_v1(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_session_answer_v4(uuid,uuid,uuid,integer,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_session_question_review_v1(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.award_trivia_run_v4(uuid,integer,integer,integer,integer,integer,integer,integer,uuid,jsonb)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_session_settle_solo_v4(uuid,uuid,integer,jsonb,uuid)
    TO service_role;

DO $$
DECLARE v_signature text;
BEGIN
    FOREACH v_signature IN ARRAY ARRAY[
        'public.trivia_claim_gto_render_v1(text,uuid,integer)',
        'public.trivia_release_gto_render_v1(text,uuid)',
        'public.trivia_submit_question_report_v2(uuid,uuid,text,text,uuid)',
        'public.trivia_legacy_session_answer_v1(uuid,uuid,uuid,integer,uuid)',
        'public.trivia_record_invalid_question_v1(uuid,uuid,uuid,uuid)',
        'public.trivia_session_context_projection_v1(uuid,uuid)',
        'public.trivia_session_answer_v4(uuid,uuid,uuid,integer,uuid)',
        'public.trivia_session_question_review_v1(uuid,uuid,uuid)',
        'public.award_trivia_run_v4(uuid,integer,integer,integer,integer,integer,integer,integer,uuid,jsonb)',
        'public.trivia_session_settle_solo_v4(uuid,uuid,integer,jsonb,uuid)'
    ] LOOP
        IF to_regprocedure(v_signature) IS NULL THEN
            RAISE EXCEPTION 'trivia p8 postcondition: function missing: %', v_signature;
        END IF;
        IF has_function_privilege('anon', v_signature, 'EXECUTE')
           OR has_function_privilege('authenticated', v_signature, 'EXECUTE') THEN
            RAISE EXCEPTION 'trivia p8 postcondition: browser execution leaked: %', v_signature;
        END IF;
        IF NOT has_function_privilege('service_role', v_signature, 'EXECUTE') THEN
            RAISE EXCEPTION 'trivia p8 postcondition: service execution missing: %', v_signature;
        END IF;
    END LOOP;

    IF has_function_privilege('service_role', 'public.trivia_p3_grade(uuid)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.trivia_p3_finalize_session_v4(uuid,text,uuid)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.trivia_p3_solo_review(uuid)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.trivia_session_settlement_request_guard_v1()', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.trivia_session_revision_map_guard_v1()', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.trivia_session_answer_guard_v1()', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.trivia_project_engine_metadata_v1(jsonb)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.trivia_p8_lock_and_void_session_questions_v1(uuid)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.trivia_p8_legacy_grade_locked_v1(uuid)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.trivia_capture_engine_metadata_revision_v1()', 'EXECUTE') THEN
        RAISE EXCEPTION 'trivia p8 postcondition: internal grade/finalizer leaked to service role';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'trivia_sessions'
                      AND column_name = 'settlement_request_id' AND data_type = 'uuid')
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'trivia_sessions'
                      AND column_name = 'question_revision_ids' AND data_type = 'jsonb' AND is_nullable = 'NO')
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'trivia_question_revisions'
                      AND column_name = 'engine_metadata' AND data_type = 'jsonb' AND is_nullable = 'NO')
       OR (SELECT count(*) FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'trivia_session_answers'
              AND column_name IN ('server_voided_at','server_void_reason')) <> 2 THEN
        RAISE EXCEPTION 'trivia p8 postcondition: evidence columns missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger
                    WHERE tgname = 'trg_trivia_session_settlement_request_guard_v1'
                      AND tgrelid = 'public.trivia_sessions'::regclass AND NOT tgisinternal)
       OR NOT EXISTS (SELECT 1 FROM pg_trigger
                    WHERE tgname = 'trg_trivia_session_revision_map_guard_v1'
                      AND tgrelid = 'public.trivia_sessions'::regclass AND NOT tgisinternal)
       OR NOT EXISTS (SELECT 1 FROM pg_trigger
                    WHERE tgname = 'trg_trivia_capture_engine_metadata_revision_v1'
                      AND tgrelid = 'public.trivia_questions'::regclass AND NOT tgisinternal)
       OR NOT EXISTS (SELECT 1 FROM pg_constraint
                      WHERE conname = 'trivia_session_answers_server_void_check'
                        AND conrelid = 'public.trivia_session_answers'::regclass) THEN
        RAISE EXCEPTION 'trivia p8 postcondition: evidence guard missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'trivia_question_revisions_content_metadata_key'
                      AND conrelid = 'public.trivia_question_revisions'::regclass)
       OR EXISTS (
            SELECT 1
              FROM public.trivia_question_curation c
              JOIN public.trivia_question_revisions r ON r.id = c.current_revision_id
              JOIN public.trivia_questions q ON q.id = c.question_id
             WHERE r.engine_metadata IS DISTINCT FROM coalesce(q.engine_metadata, '{}'::jsonb)) THEN
        RAISE EXCEPTION 'trivia p8 postcondition: current revision metadata provenance drifted';
    END IF;
    IF EXISTS (
        SELECT 1
          FROM public.trivia_sessions s
          CROSS JOIN LATERAL jsonb_each_text(s.question_revision_ids) m
          LEFT JOIN public.trivia_question_revisions r ON r.id = m.value::uuid
         WHERE r.id IS NULL OR r.question_id::text <> m.key) THEN
        RAISE EXCEPTION 'trivia p8 postcondition: legacy revision map contains invalid provenance';
    END IF;
    IF has_column_privilege('anon', 'public.trivia_question_revisions', 'engine_metadata', 'SELECT')
       OR has_column_privilege('authenticated', 'public.trivia_question_revisions', 'engine_metadata', 'SELECT') THEN
        RAISE EXCEPTION 'trivia p8 postcondition: revision metadata leaked to browser roles';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_class
                    WHERE oid = 'public.trivia_gto_render_claims'::regclass
                      AND relrowsecurity AND relforcerowsecurity)
       OR EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.trivia_gto_render_claims'::regclass) THEN
        RAISE EXCEPTION 'trivia p8 postcondition: render claim custody is not force-RLS closed';
    END IF;
    IF position('canonical_question_id' IN pg_get_viewdef('public.trivia_question_eligibility_v1'::regclass, true)) = 0
       OR position('count(DISTINCT r.user_id)' IN pg_get_viewdef('public.trivia_question_eligibility_v1'::regclass, true)) = 0 THEN
        RAISE EXCEPTION 'trivia p8 postcondition: canonical report eligibility projection missing';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname IN ('trivia_claim_gto_render_v1','trivia_release_gto_render_v1',
               'trivia_session_settlement_request_guard_v1',
               'trivia_session_revision_map_guard_v1','trivia_bind_revision_engine_metadata_v1',
               'trivia_session_answer_guard_v1','trivia_p8_lock_and_void_session_questions_v1',
               'trivia_capture_question_revision_v1','trivia_capture_engine_metadata_revision_v1',
               'trivia_submit_question_report_v2','trivia_legacy_session_answer_v1',
               'trivia_record_invalid_question_v1','trivia_session_context_projection_v1',
               'trivia_project_engine_metadata_v1',
               'trivia_session_answer_v4','trivia_session_question_review_v1',
               'trivia_p3_grade','trivia_p3_solo_review','trivia_p3_finalize_session_v4','trivia_p8_legacy_grade_locked_v1',
               'award_trivia_run_v4','trivia_session_settle_solo_v4')
           AND (p.prosecdef IS NOT TRUE OR p.proowner::regrole::text <> 'postgres'
                OR p.proconfig IS NULL
                OR NOT p.proconfig @> ARRAY['search_path=pg_catalog, public, extensions, pg_temp']::text[])) THEN
        RAISE EXCEPTION 'trivia p8 postcondition: function owner, definer, or search path drifted';
    END IF;
    IF position('p_grade_basis IS DISTINCT FROM g' IN pg_get_functiondef(
           'public.trivia_session_settle_solo_v4(uuid,uuid,integer,jsonb,uuid)'::regprocedure)) = 0
       OR position('v_was_open' IN pg_get_functiondef(
           'public.award_trivia_run_v4(uuid,integer,integer,integer,integer,integer,integer,integer,uuid,jsonb)'::regprocedure)) = 0
       OR position('server_voided_at IS NOT NULL' IN pg_get_functiondef(
           'public.trivia_p3_grade(uuid)'::regprocedure)) = 0
       OR position('engineMetadata' IN pg_get_functiondef(
           'public.trivia_session_answer_v4(uuid,uuid,uuid,integer,uuid)'::regprocedure)) = 0
       OR position('authority.retired_at IS NULL' IN pg_get_functiondef(
           'public.trivia_project_engine_metadata_v1(jsonb)'::regprocedure)) = 0
       OR position('revision_provenance_unavailable' IN pg_get_functiondef(
           'public.trivia_session_question_review_v1(uuid,uuid,uuid)'::regprocedure)) = 0
       OR position('lease_expires_at <= v_now' IN pg_get_functiondef(
           'public.trivia_claim_gto_render_v1(text,uuid,integer)'::regprocedure)) = 0
       OR position('v_play_date' IN pg_get_functiondef(
           'public.trivia_p3_finalize_session_v4(uuid,text,uuid)'::regprocedure)) = 0
       OR position('settlement result is immutable' IN pg_get_functiondef(
           'public.trivia_session_settlement_request_guard_v1()'::regprocedure)) = 0
       OR position('trivia_report_canonical:' IN pg_get_functiondef(
           'public.trivia_submit_question_report_v2(uuid,uuid,text,text,uuid)'::regprocedure)) = 0 THEN
        RAISE EXCEPTION 'trivia p8 postcondition: connected integrity contract missing';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- ============================================================================
-- ROLLBACK (Tier 3 - intentionally refused)
-- Revision metadata and historical session maps become immutable provenance as
-- soon as this migration commits. Removing them would make existing sessions
-- mutable again, so there is no honest destructive rollback. Ship a new forward
-- migration for any correction. The unreachable reversal sketch below documents
-- the affected objects but is not an executable recovery route.
-- ============================================================================
/*
BEGIN;

DO $$
BEGIN
    RAISE EXCEPTION 'Phase 8 provenance is irreversible; destructive rollback refused. Ship a forward fix.';
END $$;

DROP FUNCTION public.trivia_session_settle_solo_v4(uuid,uuid,integer,jsonb,uuid);
DROP FUNCTION public.award_trivia_run_v4(uuid,integer,integer,integer,integer,integer,integer,integer,uuid,jsonb);
DROP FUNCTION public.trivia_p3_finalize_session_v4(uuid,text,uuid);
DROP FUNCTION public.trivia_session_answer_v4(uuid,uuid,uuid,integer,uuid);
DROP FUNCTION public.trivia_record_invalid_question_v1(uuid,uuid,uuid,uuid);
DROP FUNCTION public.trivia_submit_question_report_v2(uuid,uuid,text,text,uuid);

CREATE OR REPLACE FUNCTION public.trivia_p3_grade(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE s public.trivia_sessions%ROWTYPE; v_p public.trivia_roster_profiles%ROWTYPE; g jsonb;
BEGIN
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id;
    IF NOT FOUND OR s.engine_version IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
    END IF;
    SELECT * INTO v_p FROM public.trivia_roster_profiles WHERE profile_id = s.roster_profile_id;
    WITH a AS (
        SELECT a.*, r.correct_index,
               (NOT r.structurally_valid OR q.audit_verified IS FALSE
                OR EXISTS (SELECT 1 FROM public.trivia_question_quarantine z
                            WHERE z.question_id = a.question_id AND z.released_at IS NULL)) AS void,
               CASE WHEN a.answered_at IS NOT NULL AND a.opened_at IS NOT NULL
                    THEN greatest(0, (extract(epoch FROM (a.answered_at - a.opened_at)) * 1000)::bigint) END AS elapsed_ms
          FROM public.trivia_session_answers a
          JOIN public.trivia_question_revisions r ON r.id = a.revision_id
          JOIN public.trivia_questions q ON q.id = a.question_id
         WHERE a.session_id = p_session_id)
    SELECT jsonb_build_object('success', true, 'session_id', p_session_id, 'mode', s.mode,
        'total', count(*), 'voided', count(*) FILTER (WHERE void),
        'graded_total', count(*) FILTER (WHERE NOT void),
        'answered', count(*) FILTER (WHERE outcome IN ('correct','wrong','skip')),
        'correct', count(*) FILTER (WHERE NOT void AND outcome = 'correct'),
        'score', count(*) FILTER (WHERE NOT void AND outcome = 'correct') * v_p.points_per_correct,
        'answer_time_ms_total', coalesce(sum(elapsed_ms) FILTER (WHERE outcome IN ('correct','wrong','skip')), 0),
        'per_question', jsonb_agg(jsonb_build_object('position', position, 'question_id', question_id,
            'outcome', CASE WHEN void THEN 'void' ELSE coalesce(outcome, 'unanswered') END,
            'correct', (NOT void AND outcome = 'correct'), 'display_index', display_index,
            'answered_at', answered_at, 'elapsed_ms', elapsed_ms) ORDER BY position),
        'sequence', coalesce(jsonb_agg(jsonb_build_object('questionIndex', position - 1,
            'result', CASE WHEN outcome = 'skip' THEN 'skip' WHEN outcome = 'correct' THEN 'correct' ELSE 'wrong' END)
            ORDER BY sequence) FILTER (WHERE sequence IS NOT NULL AND NOT void), '[]'::jsonb))
      INTO g FROM a;
    RETURN g;
END $$;

DROP TRIGGER trg_trivia_session_settlement_request_guard_v1 ON public.trivia_sessions;
DROP FUNCTION public.trivia_session_settlement_request_guard_v1();
ALTER TABLE public.trivia_session_answers
    DROP CONSTRAINT trivia_session_answers_server_void_check,
    DROP COLUMN server_void_reason,
    DROP COLUMN server_voided_at;
ALTER TABLE public.trivia_sessions DROP COLUMN settlement_request_id;

COMMIT;
*/

-- TIER: 3
-- AUTHOR: Antigravity (p3-solo-evaluator), authorized Trivia Phase 3 V3 solo readiness hardening
-- AFFECTS: public.trivia_solo_miss_status_v1(uuid,uuid), public.trivia_p3_expire_session(uuid,text)
-- IRREVERSIBLE: no
-- WHY:
--   1. In trivia_solo_miss_status_v1, the V3 branch calls
--      trivia_p8_lock_and_void_session_questions_v1(s.id), which neutralizes any newly
--      invalid/quarantined question across the entire roster (including future unanswered
--      positions 1..100 in Endless or 1..20 in Survival) with outcome='skip', sequence, and
--      server_voided_at. The immediately following V3 sequence/gap predicates failed to
--      exclude server_voided_at IS NOT NULL (and legacy gap max-position failed to exclude
--      v='true'), so any mid-run quarantine of a future question permanently bricked the
--      session with answer_sequence_invalid.
--   2. In trivia_p3_expire_session (called by trivia_expire_stale_sessions_v1), expired V3
--      sessions still called pre-Phase-8 trivia_p3_finalize_session instead of
--      trivia_p3_finalize_session_v4, skipping lock-and-void neutralization and void-safe
--      stats/history recording.
-- HOW:
--   Exclude server-voided rows from V3 sequence/monotonicity/gap upper-bound checks (while
--   allowing voided positions <= max_position in the contiguous gap check) and from the
--   legacy gap max-position upper bound. Point trivia_p3_expire_session at
--   trivia_p3_finalize_session_v4. Preserve exact signatures, SECURITY DEFINER, search_path,
--   and owner-only proacl (no browser or service_role grants).

BEGIN;
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;

DO $preflight$
BEGIN
    IF md5(pg_catalog.pg_get_functiondef('public.trivia_solo_miss_status_v1(uuid,uuid)'::regprocedure)) <> '6b7b9d1e00fb696cf6d1a360bff1fbd1' THEN
        RAISE EXCEPTION 'trivia_solo_miss_status_v1 predecessor changed; requalify before installation';
    END IF;
    IF md5(pg_catalog.pg_get_functiondef('public.trivia_p3_expire_session(uuid,text)'::regprocedure)) <> 'b4d7208fcae4fb25791a6237472d3249' THEN
        RAISE EXCEPTION 'trivia_p3_expire_session predecessor changed; requalify before installation';
    END IF;
    IF (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'trivia_solo_miss_status_v1') <> 1 THEN
        RAISE EXCEPTION 'ambiguous trivia_solo_miss_status_v1 overload';
    END IF;
    IF (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'trivia_p3_expire_session') <> 1 THEN
        RAISE EXCEPTION 'ambiguous trivia_p3_expire_session overload';
    END IF;
    IF to_regprocedure('public.trivia_p3_finalize_session_v4(uuid,text,uuid)') IS NULL THEN
        RAISE EXCEPTION 'trivia_p3_finalize_session_v4 prerequisite missing';
    END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.trivia_solo_miss_status_v1(p_session_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    s public.trivia_sessions%ROWTYPE;
    v_adoption jsonb;
    v_authority jsonb;
    v_grade jsonb;
    v_non_paid_misses integer := 0;
    v_terminal_failures integer := 0;
    v_roster_size integer := 0;
    v_required_correct integer;
    v_terminal_threshold integer := 3;
    v_boundary_order integer;
    v_overrun boolean := false;
    v_terminal_reached boolean := false;
BEGIN
    IF p_session_id IS NULL OR p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_arguments');
    END IF;
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'session_not_found'); END IF;
    IF s.user_id IS DISTINCT FROM p_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_your_session');
    END IF;
    IF s.mode NOT IN ('endless','survival') THEN
        RETURN jsonb_build_object('success', true, 'sessionId', s.id,
            'nonPaidMissCount', 0, 'terminalFailureCount', 0,
            'missLimit', 3, 'runMissLimitReached', false, 'overrun', false);
    END IF;

    v_adoption:=public.trivia_paid_skip_adopt_legacy_v1(s.id,p_user_id);
    IF coalesce((v_adoption->>'success')::boolean,false) IS NOT TRUE THEN
        RETURN v_adoption;
    END IF;
    -- Adoption can bind an open legacy answer map; reload the locked row before
    -- deriving sequence/terminal status.
    SELECT * INTO s FROM public.trivia_sessions WHERE id=s.id;

    v_roster_size := coalesce(cardinality(s.question_ids), 0);
    IF s.mode = 'survival' THEN
        IF s.survival_level IS NULL OR s.survival_level < 1 OR s.survival_level > 10 THEN
            RETURN jsonb_build_object('success', false, 'error', 'invalid_survival_level');
        END IF;
        v_required_correct := (ARRAY[17,18,18,19,19,19,20,20,20,20])[s.survival_level];
        -- Survival remains playable after the last mathematically tolerable
        -- miss.  The exact next wrong/skip/late/timeout event is admitted and
        -- becomes terminal; only later new events are refused.
        v_terminal_threshold := greatest(1, v_roster_size - v_required_correct + 1);
    END IF;

    IF s.engine_version IS NOT NULL THEN
        -- Open runs may neutralize a newly invalid question before counting.
        -- Submitted runs are sealed evidence: a later quarantine must never
        -- rewrite their answer rows or retroactively change terminal/high-score
        -- eligibility.
        IF s.status = 'open' THEN
            v_authority := public.trivia_p8_lock_and_void_session_questions_v1(s.id);
            IF coalesce((v_authority ->> 'success')::boolean, false) IS NOT TRUE THEN
                RETURN v_authority;
            END IF;
        END IF;
        IF EXISTS (
            SELECT 1 FROM public.trivia_session_answers a
             WHERE a.session_id=s.id AND a.outcome IS NOT NULL AND a.server_voided_at IS NULL
               AND NOT EXISTS (
                   SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                    WHERE paid.session_id=a.session_id AND paid.question_id=a.question_id
                      AND paid.source_binding='legacy_ledger_only')
               AND (a.sequence IS NULL OR a.sequence<1)
        ) OR (SELECT count(*) FROM public.trivia_session_answers a
               WHERE a.session_id=s.id AND a.outcome IS NOT NULL AND a.server_voided_at IS NULL
                 AND NOT EXISTS (
                     SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                      WHERE paid.session_id=a.session_id AND paid.question_id=a.question_id
                        AND paid.source_binding='legacy_ledger_only'))
             <> (SELECT count(DISTINCT a.sequence) FROM public.trivia_session_answers a
                  WHERE a.session_id=s.id AND a.outcome IS NOT NULL AND a.server_voided_at IS NULL
                    AND NOT EXISTS (
                        SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                         WHERE paid.session_id=a.session_id AND paid.question_id=a.question_id
                           AND paid.source_binding='legacy_ledger_only'))
        OR EXISTS (
            SELECT 1 FROM public.trivia_session_answers earlier
            JOIN public.trivia_session_answers later ON later.session_id=earlier.session_id
             AND later.sequence>earlier.sequence AND later.position<=earlier.position
             WHERE earlier.session_id=s.id AND earlier.outcome IS NOT NULL AND earlier.server_voided_at IS NULL
               AND later.outcome IS NOT NULL AND later.server_voided_at IS NULL
               AND NOT EXISTS (SELECT 1 FROM public.trivia_paid_skip_receipts_v1 p
                    WHERE p.session_id=earlier.session_id AND p.question_id=earlier.question_id
                      AND p.source_binding='legacy_ledger_only')
               AND NOT EXISTS (SELECT 1 FROM public.trivia_paid_skip_receipts_v1 p
                    WHERE p.session_id=later.session_id AND p.question_id=later.question_id
                      AND p.source_binding='legacy_ledger_only')
        ) OR EXISTS (
            SELECT 1 FROM generate_series(1,coalesce(greatest(
                (SELECT max(a.position) FROM public.trivia_session_answers a
                  WHERE a.session_id=s.id AND a.outcome IS NOT NULL AND a.server_voided_at IS NULL),
                (SELECT max(r.position) FROM public.trivia_paid_skip_receipts_v1 r
                  WHERE r.session_id=s.id AND r.source_binding='legacy_ledger_only')),0)) pos
             WHERE NOT EXISTS (SELECT 1 FROM public.trivia_session_answers a
                                WHERE a.session_id=s.id AND a.position=pos
                                  AND (a.outcome IS NOT NULL OR a.server_voided_at IS NOT NULL))
               AND NOT EXISTS (SELECT 1 FROM public.trivia_paid_skip_receipts_v1 r
                                WHERE r.session_id=s.id AND r.position=pos
                                  AND r.source_binding='legacy_ledger_only')
        ) THEN
            RETURN jsonb_build_object('success',false,'error','answer_sequence_invalid');
        END IF;
        WITH answer_events AS (
            SELECT a.question_id,a.position,a.sequence,a.server_voided_at,
                   a.position AS event_order,
                   a.outcome IN ('wrong','skip','late','timeout') AS failed,
                   (a.outcome IN ('wrong','skip','late','timeout') AND NOT EXISTS (
                        SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                         WHERE paid.session_id=a.session_id AND paid.question_id=a.question_id
                    )) AS non_paid_miss
              FROM public.trivia_session_answers a
             WHERE a.session_id=s.id AND a.outcome IS NOT NULL
               AND NOT EXISTS (
                   SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                    WHERE paid.session_id=a.session_id AND paid.question_id=a.question_id
                      AND paid.source_binding='legacy_ledger_only')
        ), ledger_events AS (
            SELECT r.question_id,r.position,r.position AS event_order
              FROM public.trivia_paid_skip_receipts_v1 r
             WHERE r.session_id=s.id AND r.source_binding='legacy_ledger_only'
        ), attempted AS (
            SELECT question_id,event_order,failed,non_paid_miss
              FROM answer_events WHERE server_voided_at IS NULL
            UNION ALL
            SELECT question_id,event_order,true,false FROM ledger_events
        ), terminal_events AS (
            SELECT event_order,
                   row_number() OVER (ORDER BY event_order)::integer AS failure_number
              FROM attempted
             WHERE CASE WHEN s.mode = 'endless' THEN non_paid_miss ELSE failed END
        )
        SELECT (SELECT count(*)::integer FROM attempted WHERE non_paid_miss),
               (SELECT count(*)::integer FROM terminal_events),
               (SELECT event_order FROM terminal_events
                 WHERE failure_number = v_terminal_threshold),
               EXISTS (
                   SELECT 1 FROM attempted a
                    WHERE a.event_order > coalesce(
                        (SELECT event_order FROM terminal_events
                          WHERE failure_number = v_terminal_threshold),
                        2147483647
                    )
               )
          INTO v_non_paid_misses, v_terminal_failures, v_boundary_order, v_overrun;
    ELSE
        -- This validator also neutralizes invalid bound questions and fails
        -- closed on malformed legacy answer evidence before any casts below.
        IF s.status = 'open' THEN
            v_grade := public.trivia_p8_legacy_grade_locked_v1(s.id);
            IF coalesce((v_grade ->> 'success')::boolean, false) IS NOT TRUE THEN
                RETURN v_grade;
            END IF;
            SELECT * INTO s FROM public.trivia_sessions WHERE id = s.id;
        END IF;
        IF jsonb_typeof(s.answers) IS DISTINCT FROM 'object' THEN
            RETURN jsonb_build_object('success',false,'error','answer_record_invalid');
        END IF;
        IF (SELECT count(*) FROM jsonb_each(s.answers) raw
             WHERE raw.value->'v' IS DISTINCT FROM 'true'::jsonb
               AND NOT EXISTS (
                   SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                    WHERE paid.session_id=s.id
                      AND paid.question_id=CASE WHEN raw.key
                           ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                           THEN raw.key::uuid END
                      AND paid.source_binding='legacy_ledger_only'))
           <> (SELECT count(*)
                 FROM unnest(s.question_ids) WITH ORDINALITY q(question_id,position)
                 JOIN LATERAL (SELECT s.answers->q.question_id::text value) answer
                   ON answer.value IS NOT NULL
                 JOIN public.trivia_question_revisions revision
                   ON revision.id=CASE WHEN coalesce(s.question_revision_ids->>q.question_id::text,'')
                        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                        THEN (s.question_revision_ids->>q.question_id::text)::uuid END
                  AND revision.question_id=q.question_id
                WHERE answer.value->'v' IS DISTINCT FROM 'true'::jsonb
                  AND jsonb_typeof(answer.value)='object'
                  AND coalesce(answer.value->>'n','')~'^[0-9]+$'
                  AND coalesce(answer.value->>'d','')~'^-?[0-9]+$'
                  AND (answer.value->>'d')::integer>=-1
                  AND ((answer.value->>'d')::integer=-1
                       OR (jsonb_typeof(s.permutations->q.question_id::text)='array'
                           AND (answer.value->>'d')::integer
                               <jsonb_array_length(s.permutations->q.question_id::text)))
                  AND NOT EXISTS (
                      SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                       WHERE paid.session_id=s.id AND paid.question_id=q.question_id
                         AND paid.source_binding='legacy_ledger_only'))
        OR (SELECT count(*)
              FROM unnest(s.question_ids) q(question_id)
             WHERE s.answers?q.question_id::text
               AND (s.answers->q.question_id::text)->'v' IS DISTINCT FROM 'true'::jsonb
               AND coalesce((s.answers->q.question_id::text)->>'n','')~'^[0-9]+$'
               AND NOT EXISTS (SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                    WHERE paid.session_id=s.id AND paid.question_id=q.question_id
                      AND paid.source_binding='legacy_ledger_only'))
           <> (SELECT count(DISTINCT ((s.answers->q.question_id::text)->>'n')::integer)
                 FROM unnest(s.question_ids) q(question_id)
                WHERE s.answers?q.question_id::text
                  AND (s.answers->q.question_id::text)->'v' IS DISTINCT FROM 'true'::jsonb
                  AND coalesce((s.answers->q.question_id::text)->>'n','')~'^[0-9]+$'
                  AND NOT EXISTS (SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                       WHERE paid.session_id=s.id AND paid.question_id=q.question_id
                         AND paid.source_binding='legacy_ledger_only'))
        OR EXISTS (
            WITH parsed AS (
                SELECT q.position::integer,(answer.value->>'n')::integer answer_order
                  FROM unnest(s.question_ids) WITH ORDINALITY q(question_id,position)
                  JOIN LATERAL (SELECT s.answers->q.question_id::text value) answer
                    ON answer.value IS NOT NULL
                 WHERE answer.value->'v' IS DISTINCT FROM 'true'::jsonb
                   AND coalesce(answer.value->>'n','')~'^[0-9]+$'
                   AND NOT EXISTS (SELECT 1 FROM public.trivia_paid_skip_receipts_v1 r
                        WHERE r.session_id=s.id AND r.question_id=q.question_id
                          AND r.source_binding='legacy_ledger_only')
            )
            SELECT 1 FROM parsed earlier JOIN parsed later
              ON later.answer_order>earlier.answer_order AND later.position<=earlier.position
        ) OR EXISTS (
            SELECT 1 FROM generate_series(1,coalesce(greatest(
                (SELECT max(q.position)::integer
                   FROM unnest(s.question_ids) WITH ORDINALITY q(question_id,position)
                  WHERE s.answers?q.question_id::text
                    AND (s.answers->q.question_id::text)->'v' IS DISTINCT FROM 'true'::jsonb),
                (SELECT max(r.position) FROM public.trivia_paid_skip_receipts_v1 r
                  WHERE r.session_id=s.id AND r.source_binding='legacy_ledger_only')),0)) pos
             WHERE NOT(s.answers?s.question_ids[pos]::text)
               AND NOT EXISTS (SELECT 1 FROM public.trivia_paid_skip_receipts_v1 r
                                WHERE r.session_id=s.id AND r.position=pos
                                  AND r.source_binding='legacy_ledger_only')
        ) THEN
            RETURN jsonb_build_object('success',false,'error','answer_sequence_invalid');
        END IF;
        WITH answer_events AS (
            SELECT q.question_id,q.position::integer,
                   q.position::integer AS event_order,
                   answer.value->'v' IS NOT DISTINCT FROM 'true'::jsonb AS voided,
                   ((answer.value ->> 'd')::integer = -1 OR
                    (s.permutations -> q.question_id::text
                        ->> (answer.value ->> 'd')::integer)::integer
                        IS DISTINCT FROM revision.correct_index) AS failed,
                   (((answer.value ->> 'd')::integer = -1 OR
                     (s.permutations -> q.question_id::text
                        ->> (answer.value ->> 'd')::integer)::integer
                        IS DISTINCT FROM revision.correct_index) AND NOT EXISTS (
                       SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                        WHERE paid.session_id = s.id
                          AND paid.question_id = q.question_id
                   )) AS non_paid_miss
              FROM unnest(s.question_ids) WITH ORDINALITY q(question_id, position)
              JOIN LATERAL (
                  SELECT s.answers -> q.question_id::text AS value
              ) answer ON answer.value IS NOT NULL
              JOIN public.trivia_question_revisions revision
                ON revision.id = (s.question_revision_ids ->> q.question_id::text)::uuid
               AND revision.question_id = q.question_id
             WHERE coalesce(answer.value->>'n','')~'^[0-9]+$'
               AND coalesce(answer.value->>'d','')~'^-?[0-9]+$'
               AND NOT EXISTS (
                   SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                    WHERE paid.session_id=s.id AND paid.question_id=q.question_id
                      AND paid.source_binding='legacy_ledger_only')
        ), ledger_events AS (
            SELECT r.question_id,r.position,r.position AS event_order
              FROM public.trivia_paid_skip_receipts_v1 r
             WHERE r.session_id=s.id AND r.source_binding='legacy_ledger_only'
        ), attempted AS (
            SELECT question_id,event_order,failed,non_paid_miss
              FROM answer_events WHERE NOT voided
            UNION ALL
            SELECT question_id,event_order,true,false FROM ledger_events
        ), terminal_events AS (
            SELECT event_order,
                   row_number() OVER (ORDER BY event_order)::integer AS failure_number
              FROM attempted
             WHERE CASE WHEN s.mode = 'endless' THEN non_paid_miss ELSE failed END
        )
        SELECT (SELECT count(*)::integer FROM attempted WHERE non_paid_miss),
               (SELECT count(*)::integer FROM terminal_events),
               (SELECT event_order FROM terminal_events
                 WHERE failure_number = v_terminal_threshold),
               EXISTS (
                   SELECT 1 FROM attempted a
                    WHERE a.event_order > coalesce(
                        (SELECT event_order FROM terminal_events
                          WHERE failure_number = v_terminal_threshold),
                        2147483647
                    )
               )
          INTO v_non_paid_misses, v_terminal_failures, v_boundary_order, v_overrun;
    END IF;

    v_terminal_reached := v_boundary_order IS NOT NULL;

    RETURN jsonb_build_object(
        'success', true,
        'sessionId', s.id,
        'mode', s.mode,
        'nonPaidMissCount', coalesce(v_non_paid_misses, 0),
        'terminalFailureCount', coalesce(v_terminal_failures, 0),
        'missLimit', v_terminal_threshold,
        'runMissLimitReached', v_terminal_reached,
        'overrun', coalesce(v_overrun, false),
        'boundaryOrder', v_boundary_order,
        'rosterSize', v_roster_size,
        'survivalLevel', CASE WHEN s.mode = 'survival' THEN s.survival_level ELSE NULL END,
        'requiredCorrect', v_required_correct,
        'maxPossibleCorrect', CASE WHEN s.mode = 'survival'
            THEN greatest(0, v_roster_size - coalesce(v_terminal_failures, 0))
            ELSE NULL END
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.trivia_p3_expire_session(p_session_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE s public.trivia_sessions%ROWTYPE;
BEGIN
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND OR s.status <> 'open' THEN RETURN; END IF;
    IF s.engine_version IS NOT NULL THEN
        PERFORM public.trivia_p3_finalize_session_v4(s.id, 'expired', NULL);
    END IF;
    UPDATE public.trivia_sessions SET status = 'expired' WHERE id = s.id AND status = 'open';
    INSERT INTO public.trivia_session_reconciliations (session_id, action, reason, evidence, actor)
    VALUES (s.id, 'expired', p_reason, jsonb_build_object('mode', s.mode, 'entry_state', s.entry_state,
            'expires_at', s.expires_at, 'created_at', s.created_at, 'engine', s.engine_version),
            'trivia_p3_expire_session')
    ON CONFLICT (session_id, action) DO NOTHING;
END $function$;

DO $postflight$
DECLARE
    v_miss_src text;
    v_expire_src text;
BEGIN
    SELECT p.prosrc INTO v_miss_src
      FROM pg_catalog.pg_proc p
     WHERE p.oid = 'public.trivia_solo_miss_status_v1(uuid,uuid)'::regprocedure;
    SELECT p.prosrc INTO v_expire_src
      FROM pg_catalog.pg_proc p
     WHERE p.oid = 'public.trivia_p3_expire_session(uuid,text)'::regprocedure;

    IF pg_catalog.strpos(v_miss_src, 'a.outcome IS NOT NULL AND a.server_voided_at IS NULL') = 0
       OR pg_catalog.strpos(v_miss_src, 'earlier.outcome IS NOT NULL AND earlier.server_voided_at IS NULL') = 0
       OR pg_catalog.strpos(v_miss_src, '(a.outcome IS NOT NULL OR a.server_voided_at IS NOT NULL)') = 0
       OR pg_catalog.strpos(v_miss_src, 'AND (s.answers->q.question_id::text)->''v'' IS DISTINCT FROM ''true''::jsonb') = 0 THEN
        RAISE EXCEPTION 'postcondition failed: trivia_solo_miss_status_v1 missing void-safe sequence guards';
    END IF;

    IF pg_catalog.strpos(v_expire_src, 'trivia_p3_finalize_session_v4(s.id, ''expired'', NULL)') = 0
       OR pg_catalog.strpos(v_expire_src, 'trivia_p3_finalize_session(') > 0 THEN
        RAISE EXCEPTION 'postcondition failed: trivia_p3_expire_session must call trivia_p3_finalize_session_v4';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc p
         WHERE p.oid = 'public.trivia_solo_miss_status_v1(uuid,uuid)'::regprocedure
           AND p.prosecdef
           AND p.proowner = 'postgres'::regrole
           AND p.proconfig = ARRAY['search_path=pg_catalog, public, extensions, pg_temp']
           AND p.proacl = ARRAY['postgres=X/postgres']::aclitem[]
    ) THEN
        RAISE EXCEPTION 'postcondition failed: trivia_solo_miss_status_v1 security attributes drifted';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc p
         WHERE p.oid = 'public.trivia_p3_expire_session(uuid,text)'::regprocedure
           AND p.prosecdef
           AND p.proowner = 'postgres'::regrole
           AND p.proconfig = ARRAY['search_path=pg_catalog, public, pg_temp']
           AND p.proacl = ARRAY['postgres=X/postgres']::aclitem[]
    ) THEN
        RAISE EXCEPTION 'postcondition failed: trivia_p3_expire_session security attributes drifted';
    END IF;
END
$postflight$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- FORWARD ROLLBACK: paste as a NEW migration; does not rewrite sessions, results, or ledger evidence.
/*
BEGIN;
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;

CREATE OR REPLACE FUNCTION public.trivia_solo_miss_status_v1(p_session_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    s public.trivia_sessions%ROWTYPE;
    v_adoption jsonb;
    v_authority jsonb;
    v_grade jsonb;
    v_non_paid_misses integer := 0;
    v_terminal_failures integer := 0;
    v_roster_size integer := 0;
    v_required_correct integer;
    v_terminal_threshold integer := 3;
    v_boundary_order integer;
    v_overrun boolean := false;
    v_terminal_reached boolean := false;
BEGIN
    IF p_session_id IS NULL OR p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_arguments');
    END IF;
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'session_not_found'); END IF;
    IF s.user_id IS DISTINCT FROM p_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_your_session');
    END IF;
    IF s.mode NOT IN ('endless','survival') THEN
        RETURN jsonb_build_object('success', true, 'sessionId', s.id,
            'nonPaidMissCount', 0, 'terminalFailureCount', 0,
            'missLimit', 3, 'runMissLimitReached', false, 'overrun', false);
    END IF;

    v_adoption:=public.trivia_paid_skip_adopt_legacy_v1(s.id,p_user_id);
    IF coalesce((v_adoption->>'success')::boolean,false) IS NOT TRUE THEN
        RETURN v_adoption;
    END IF;
    -- Adoption can bind an open legacy answer map; reload the locked row before
    -- deriving sequence/terminal status.
    SELECT * INTO s FROM public.trivia_sessions WHERE id=s.id;

    v_roster_size := coalesce(cardinality(s.question_ids), 0);
    IF s.mode = 'survival' THEN
        IF s.survival_level IS NULL OR s.survival_level < 1 OR s.survival_level > 10 THEN
            RETURN jsonb_build_object('success', false, 'error', 'invalid_survival_level');
        END IF;
        v_required_correct := (ARRAY[17,18,18,19,19,19,20,20,20,20])[s.survival_level];
        -- Survival remains playable after the last mathematically tolerable
        -- miss.  The exact next wrong/skip/late/timeout event is admitted and
        -- becomes terminal; only later new events are refused.
        v_terminal_threshold := greatest(1, v_roster_size - v_required_correct + 1);
    END IF;

    IF s.engine_version IS NOT NULL THEN
        -- Open runs may neutralize a newly invalid question before counting.
        -- Submitted runs are sealed evidence: a later quarantine must never
        -- rewrite their answer rows or retroactively change terminal/high-score
        -- eligibility.
        IF s.status = 'open' THEN
            v_authority := public.trivia_p8_lock_and_void_session_questions_v1(s.id);
            IF coalesce((v_authority ->> 'success')::boolean, false) IS NOT TRUE THEN
                RETURN v_authority;
            END IF;
        END IF;
        IF EXISTS (
            SELECT 1 FROM public.trivia_session_answers a
             WHERE a.session_id=s.id AND a.outcome IS NOT NULL
               AND NOT EXISTS (
                   SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                    WHERE paid.session_id=a.session_id AND paid.question_id=a.question_id
                      AND paid.source_binding='legacy_ledger_only')
               AND (a.sequence IS NULL OR a.sequence<1)
        ) OR (SELECT count(*) FROM public.trivia_session_answers a
               WHERE a.session_id=s.id AND a.outcome IS NOT NULL
                 AND NOT EXISTS (
                     SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                      WHERE paid.session_id=a.session_id AND paid.question_id=a.question_id
                        AND paid.source_binding='legacy_ledger_only'))
             <> (SELECT count(DISTINCT a.sequence) FROM public.trivia_session_answers a
                  WHERE a.session_id=s.id AND a.outcome IS NOT NULL
                    AND NOT EXISTS (
                        SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                         WHERE paid.session_id=a.session_id AND paid.question_id=a.question_id
                           AND paid.source_binding='legacy_ledger_only'))
        OR EXISTS (
            SELECT 1 FROM public.trivia_session_answers earlier
            JOIN public.trivia_session_answers later ON later.session_id=earlier.session_id
             AND later.sequence>earlier.sequence AND later.position<=earlier.position
             WHERE earlier.session_id=s.id AND earlier.outcome IS NOT NULL AND later.outcome IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM public.trivia_paid_skip_receipts_v1 p
                    WHERE p.session_id=earlier.session_id AND p.question_id=earlier.question_id
                      AND p.source_binding='legacy_ledger_only')
               AND NOT EXISTS (SELECT 1 FROM public.trivia_paid_skip_receipts_v1 p
                    WHERE p.session_id=later.session_id AND p.question_id=later.question_id
                      AND p.source_binding='legacy_ledger_only')
        ) OR EXISTS (
            SELECT 1 FROM generate_series(1,coalesce(greatest(
                (SELECT max(a.position) FROM public.trivia_session_answers a
                  WHERE a.session_id=s.id AND a.outcome IS NOT NULL),
                (SELECT max(r.position) FROM public.trivia_paid_skip_receipts_v1 r
                  WHERE r.session_id=s.id AND r.source_binding='legacy_ledger_only')),0)) pos
             WHERE NOT EXISTS (SELECT 1 FROM public.trivia_session_answers a
                                WHERE a.session_id=s.id AND a.position=pos AND a.outcome IS NOT NULL)
               AND NOT EXISTS (SELECT 1 FROM public.trivia_paid_skip_receipts_v1 r
                                WHERE r.session_id=s.id AND r.position=pos
                                  AND r.source_binding='legacy_ledger_only')
        ) THEN
            RETURN jsonb_build_object('success',false,'error','answer_sequence_invalid');
        END IF;
        WITH answer_events AS (
            SELECT a.question_id,a.position,a.sequence,a.server_voided_at,
                   a.position AS event_order,
                   a.outcome IN ('wrong','skip','late','timeout') AS failed,
                   (a.outcome IN ('wrong','skip','late','timeout') AND NOT EXISTS (
                        SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                         WHERE paid.session_id=a.session_id AND paid.question_id=a.question_id
                    )) AS non_paid_miss
              FROM public.trivia_session_answers a
             WHERE a.session_id=s.id AND a.outcome IS NOT NULL
               AND NOT EXISTS (
                   SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                    WHERE paid.session_id=a.session_id AND paid.question_id=a.question_id
                      AND paid.source_binding='legacy_ledger_only')
        ), ledger_events AS (
            SELECT r.question_id,r.position,r.position AS event_order
              FROM public.trivia_paid_skip_receipts_v1 r
             WHERE r.session_id=s.id AND r.source_binding='legacy_ledger_only'
        ), attempted AS (
            SELECT question_id,event_order,failed,non_paid_miss
              FROM answer_events WHERE server_voided_at IS NULL
            UNION ALL
            SELECT question_id,event_order,true,false FROM ledger_events
        ), terminal_events AS (
            SELECT event_order,
                   row_number() OVER (ORDER BY event_order)::integer AS failure_number
              FROM attempted
             WHERE CASE WHEN s.mode = 'endless' THEN non_paid_miss ELSE failed END
        )
        SELECT (SELECT count(*)::integer FROM attempted WHERE non_paid_miss),
               (SELECT count(*)::integer FROM terminal_events),
               (SELECT event_order FROM terminal_events
                 WHERE failure_number = v_terminal_threshold),
               EXISTS (
                   SELECT 1 FROM attempted a
                    WHERE a.event_order > coalesce(
                        (SELECT event_order FROM terminal_events
                          WHERE failure_number = v_terminal_threshold),
                        2147483647
                    )
               )
          INTO v_non_paid_misses, v_terminal_failures, v_boundary_order, v_overrun;
    ELSE
        -- This validator also neutralizes invalid bound questions and fails
        -- closed on malformed legacy answer evidence before any casts below.
        IF s.status = 'open' THEN
            v_grade := public.trivia_p8_legacy_grade_locked_v1(s.id);
            IF coalesce((v_grade ->> 'success')::boolean, false) IS NOT TRUE THEN
                RETURN v_grade;
            END IF;
            SELECT * INTO s FROM public.trivia_sessions WHERE id = s.id;
        END IF;
        IF jsonb_typeof(s.answers) IS DISTINCT FROM 'object' THEN
            RETURN jsonb_build_object('success',false,'error','answer_record_invalid');
        END IF;
        IF (SELECT count(*) FROM jsonb_each(s.answers) raw
             WHERE raw.value->'v' IS DISTINCT FROM 'true'::jsonb
               AND NOT EXISTS (
                   SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                    WHERE paid.session_id=s.id
                      AND paid.question_id=CASE WHEN raw.key
                           ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                           THEN raw.key::uuid END
                      AND paid.source_binding='legacy_ledger_only'))
           <> (SELECT count(*)
                 FROM unnest(s.question_ids) WITH ORDINALITY q(question_id,position)
                 JOIN LATERAL (SELECT s.answers->q.question_id::text value) answer
                   ON answer.value IS NOT NULL
                 JOIN public.trivia_question_revisions revision
                   ON revision.id=CASE WHEN coalesce(s.question_revision_ids->>q.question_id::text,'')
                        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                        THEN (s.question_revision_ids->>q.question_id::text)::uuid END
                  AND revision.question_id=q.question_id
                WHERE answer.value->'v' IS DISTINCT FROM 'true'::jsonb
                  AND jsonb_typeof(answer.value)='object'
                  AND coalesce(answer.value->>'n','')~'^[0-9]+$'
                  AND coalesce(answer.value->>'d','')~'^-?[0-9]+$'
                  AND (answer.value->>'d')::integer>=-1
                  AND ((answer.value->>'d')::integer=-1
                       OR (jsonb_typeof(s.permutations->q.question_id::text)='array'
                           AND (answer.value->>'d')::integer
                               <jsonb_array_length(s.permutations->q.question_id::text)))
                  AND NOT EXISTS (
                      SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                       WHERE paid.session_id=s.id AND paid.question_id=q.question_id
                         AND paid.source_binding='legacy_ledger_only'))
        OR (SELECT count(*)
              FROM unnest(s.question_ids) q(question_id)
             WHERE s.answers?q.question_id::text
               AND (s.answers->q.question_id::text)->'v' IS DISTINCT FROM 'true'::jsonb
               AND coalesce((s.answers->q.question_id::text)->>'n','')~'^[0-9]+$'
               AND NOT EXISTS (SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                    WHERE paid.session_id=s.id AND paid.question_id=q.question_id
                      AND paid.source_binding='legacy_ledger_only'))
           <> (SELECT count(DISTINCT ((s.answers->q.question_id::text)->>'n')::integer)
                 FROM unnest(s.question_ids) q(question_id)
                WHERE s.answers?q.question_id::text
                  AND (s.answers->q.question_id::text)->'v' IS DISTINCT FROM 'true'::jsonb
                  AND coalesce((s.answers->q.question_id::text)->>'n','')~'^[0-9]+$'
                  AND NOT EXISTS (SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                       WHERE paid.session_id=s.id AND paid.question_id=q.question_id
                         AND paid.source_binding='legacy_ledger_only'))
        OR EXISTS (
            WITH parsed AS (
                SELECT q.position::integer,(answer.value->>'n')::integer answer_order
                  FROM unnest(s.question_ids) WITH ORDINALITY q(question_id,position)
                  JOIN LATERAL (SELECT s.answers->q.question_id::text value) answer
                    ON answer.value IS NOT NULL
                 WHERE answer.value->'v' IS DISTINCT FROM 'true'::jsonb
                   AND coalesce(answer.value->>'n','')~'^[0-9]+$'
                   AND NOT EXISTS (SELECT 1 FROM public.trivia_paid_skip_receipts_v1 r
                        WHERE r.session_id=s.id AND r.question_id=q.question_id
                          AND r.source_binding='legacy_ledger_only')
            )
            SELECT 1 FROM parsed earlier JOIN parsed later
              ON later.answer_order>earlier.answer_order AND later.position<=earlier.position
        ) OR EXISTS (
            SELECT 1 FROM generate_series(1,coalesce(greatest(
                (SELECT max(q.position)::integer
                   FROM unnest(s.question_ids) WITH ORDINALITY q(question_id,position)
                  WHERE s.answers?q.question_id::text),
                (SELECT max(r.position) FROM public.trivia_paid_skip_receipts_v1 r
                  WHERE r.session_id=s.id AND r.source_binding='legacy_ledger_only')),0)) pos
             WHERE NOT(s.answers?s.question_ids[pos]::text)
               AND NOT EXISTS (SELECT 1 FROM public.trivia_paid_skip_receipts_v1 r
                                WHERE r.session_id=s.id AND r.position=pos
                                  AND r.source_binding='legacy_ledger_only')
        ) THEN
            RETURN jsonb_build_object('success',false,'error','answer_sequence_invalid');
        END IF;
        WITH answer_events AS (
            SELECT q.question_id,q.position::integer,
                   q.position::integer AS event_order,
                   answer.value->'v' IS NOT DISTINCT FROM 'true'::jsonb AS voided,
                   ((answer.value ->> 'd')::integer = -1 OR
                    (s.permutations -> q.question_id::text
                        ->> (answer.value ->> 'd')::integer)::integer
                        IS DISTINCT FROM revision.correct_index) AS failed,
                   (((answer.value ->> 'd')::integer = -1 OR
                     (s.permutations -> q.question_id::text
                        ->> (answer.value ->> 'd')::integer)::integer
                        IS DISTINCT FROM revision.correct_index) AND NOT EXISTS (
                       SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                        WHERE paid.session_id = s.id
                          AND paid.question_id = q.question_id
                   )) AS non_paid_miss
              FROM unnest(s.question_ids) WITH ORDINALITY q(question_id, position)
              JOIN LATERAL (
                  SELECT s.answers -> q.question_id::text AS value
              ) answer ON answer.value IS NOT NULL
              JOIN public.trivia_question_revisions revision
                ON revision.id = (s.question_revision_ids ->> q.question_id::text)::uuid
               AND revision.question_id = q.question_id
             WHERE coalesce(answer.value->>'n','')~'^[0-9]+$'
               AND coalesce(answer.value->>'d','')~'^-?[0-9]+$'
               AND NOT EXISTS (
                   SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                    WHERE paid.session_id=s.id AND paid.question_id=q.question_id
                      AND paid.source_binding='legacy_ledger_only')
        ), ledger_events AS (
            SELECT r.question_id,r.position,r.position AS event_order
              FROM public.trivia_paid_skip_receipts_v1 r
             WHERE r.session_id=s.id AND r.source_binding='legacy_ledger_only'
        ), attempted AS (
            SELECT question_id,event_order,failed,non_paid_miss
              FROM answer_events WHERE NOT voided
            UNION ALL
            SELECT question_id,event_order,true,false FROM ledger_events
        ), terminal_events AS (
            SELECT event_order,
                   row_number() OVER (ORDER BY event_order)::integer AS failure_number
              FROM attempted
             WHERE CASE WHEN s.mode = 'endless' THEN non_paid_miss ELSE failed END
        )
        SELECT (SELECT count(*)::integer FROM attempted WHERE non_paid_miss),
               (SELECT count(*)::integer FROM terminal_events),
               (SELECT event_order FROM terminal_events
                 WHERE failure_number = v_terminal_threshold),
               EXISTS (
                   SELECT 1 FROM attempted a
                    WHERE a.event_order > coalesce(
                        (SELECT event_order FROM terminal_events
                          WHERE failure_number = v_terminal_threshold),
                        2147483647
                    )
               )
          INTO v_non_paid_misses, v_terminal_failures, v_boundary_order, v_overrun;
    END IF;

    v_terminal_reached := v_boundary_order IS NOT NULL;

    RETURN jsonb_build_object(
        'success', true,
        'sessionId', s.id,
        'mode', s.mode,
        'nonPaidMissCount', coalesce(v_non_paid_misses, 0),
        'terminalFailureCount', coalesce(v_terminal_failures, 0),
        'missLimit', v_terminal_threshold,
        'runMissLimitReached', v_terminal_reached,
        'overrun', coalesce(v_overrun, false),
        'boundaryOrder', v_boundary_order,
        'rosterSize', v_roster_size,
        'survivalLevel', CASE WHEN s.mode = 'survival' THEN s.survival_level ELSE NULL END,
        'requiredCorrect', v_required_correct,
        'maxPossibleCorrect', CASE WHEN s.mode = 'survival'
            THEN greatest(0, v_roster_size - coalesce(v_terminal_failures, 0))
            ELSE NULL END
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.trivia_p3_expire_session(p_session_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE s public.trivia_sessions%ROWTYPE;
BEGIN
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND OR s.status <> 'open' THEN RETURN; END IF;
    IF s.engine_version IS NOT NULL THEN
        PERFORM public.trivia_p3_finalize_session(s.id, 'expired', NULL);
    END IF;
    UPDATE public.trivia_sessions SET status = 'expired' WHERE id = s.id AND status = 'open';
    INSERT INTO public.trivia_session_reconciliations (session_id, action, reason, evidence, actor)
    VALUES (s.id, 'expired', p_reason, jsonb_build_object('mode', s.mode, 'entry_state', s.entry_state,
            'expires_at', s.expires_at, 'created_at', s.created_at, 'engine', s.engine_version),
            'trivia_p3_expire_session')
    ON CONFLICT (session_id, action) DO NOTHING;
END $function$;

NOTIFY pgrst, 'reload schema';
COMMIT;
*/

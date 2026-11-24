-- =============================================================================
-- 20261124201200_trivia_club_nights_gameplay_lifecycle.sql
-- =============================================================================
-- TIER:        2 (additive Club Arena x Trivia Private Club Nights gameplay)
-- AFFECTS:     public.trivia_club_tournament_questions,
--              public.trivia_club_tournament_submissions,
--              public.trivia_club_tournament_start_v1,
--              public.trivia_club_tournament_questions_v1,
--              public.trivia_club_tournament_submit_v1,
--              public.trivia_club_tournament_complete_v1,
--              public.trivia_club_tournament_results_v1,
--              public.trivia_club_tournament_list_v1
-- LOCKS:       ZERO locks on existing live tables (no FKs to public.clubs,
--              public.club_members, public.profiles, public.trivia_questions,
--              or auth.users; authority and eligibility are enforced atomically
--              inside SECURITY DEFINER RPCs).
-- FINANCIAL:   Strictly free-roll bragging-rights club nights only
--              (entry_fee = 0). Zero diamond balance reads or mutations.
-- IRREVERSIBLE: no (additive tables + functions; see FORWARD ROLLBACK below)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Pre-flight verification (read-only metadata checks; zero table locks)
-- -----------------------------------------------------------------------------
DO $preflight$
DECLARE
    v_missing text[] := '{}'::text[];
BEGIN
    IF to_regclass('public.trivia_club_tournaments') IS NULL THEN v_missing := v_missing || 'trivia_club_tournaments'; END IF;
    IF to_regclass('public.trivia_club_tournament_entries') IS NULL THEN v_missing := v_missing || 'trivia_club_tournament_entries'; END IF;
    IF to_regclass('public.trivia_questions') IS NULL THEN v_missing := v_missing || 'trivia_questions'; END IF;
    IF to_regclass('public.trivia_eligible_question_pool_v1') IS NULL THEN v_missing := v_missing || 'trivia_eligible_question_pool_v1'; END IF;
    IF to_regclass('public.clubs') IS NULL THEN v_missing := v_missing || 'clubs'; END IF;
    IF to_regclass('public.club_members') IS NULL THEN v_missing := v_missing || 'club_members'; END IF;
    IF to_regclass('public.profiles') IS NULL THEN v_missing := v_missing || 'profiles'; END IF;

    IF cardinality(v_missing) > 0 THEN
        RAISE EXCEPTION 'pre-flight failed: required relations missing: %', array_to_string(v_missing, ', ');
    END IF;
END
$preflight$;

-- -----------------------------------------------------------------------------
-- 2. Snapshotted club tournament questions (answer keys strictly server-side)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trivia_club_tournament_questions (
    club_tournament_id uuid NOT NULL REFERENCES public.trivia_club_tournaments(id) ON DELETE CASCADE,
    position integer NOT NULL CHECK (position >= 1),
    question_id uuid NOT NULL,
    question_text text NOT NULL CHECK (char_length(btrim(question_text)) >= 1),
    options jsonb NOT NULL CHECK (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) >= 2),
    correct_index integer NOT NULL CHECK (correct_index >= 0),
    explanation text,
    category text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (club_tournament_id, position),
    UNIQUE (club_tournament_id, question_id)
);

ALTER TABLE public.trivia_club_tournament_questions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.trivia_club_tournament_questions FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Server-graded club tournament submissions (idempotent per user)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trivia_club_tournament_submissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    club_tournament_id uuid NOT NULL REFERENCES public.trivia_club_tournaments(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    answers jsonb NOT NULL CHECK (jsonb_typeof(answers) = 'array'),
    score integer NOT NULL CHECK (score >= 0),
    correct_count integer NOT NULL CHECK (correct_count >= 0),
    total_questions integer NOT NULL CHECK (total_questions >= 1),
    elapsed_ms integer NOT NULL CHECK (elapsed_ms >= 0),
    submitted_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (club_tournament_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_trivia_club_tournament_submissions_rank
    ON public.trivia_club_tournament_submissions (club_tournament_id, score DESC, elapsed_ms ASC, submitted_at ASC, user_id ASC);

CREATE INDEX IF NOT EXISTS idx_trivia_club_tournament_submissions_user
    ON public.trivia_club_tournament_submissions (user_id, submitted_at DESC);

ALTER TABLE public.trivia_club_tournament_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.trivia_club_tournament_submissions FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. RPC: trivia_club_tournament_start_v1
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_club_tournament_start_v1(
    p_host_user_id uuid,
    p_club_tournament_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_tournament public.trivia_club_tournaments%ROWTYPE;
    v_can_manage boolean := false;
    v_entrant_count integer := 0;
    v_inserted_count integer := 0;
BEGIN
    IF p_host_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'authentication_required');
    END IF;
    IF p_club_tournament_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_club_tournament_id');
    END IF;

    SELECT *
      INTO v_tournament
      FROM public.trivia_club_tournaments t
     WHERE t.id = p_club_tournament_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'club_tournament_not_found');
    END IF;

    -- Ironclad zero-diamond freeroll invariant: never start paid events without balanced escrow.
    IF v_tournament.entry_fee <> 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'paid_club_escrow_not_enabled');
    END IF;

    IF v_tournament.host_user_id = p_host_user_id THEN
        v_can_manage := true;
    ELSE
        SELECT EXISTS (
            SELECT 1
              FROM public.clubs c
              LEFT JOIN public.club_members cm
                ON cm.club_id = c.id
               AND cm.user_id = p_host_user_id
               AND cm.membership_lifecycle_status = 'active'
               AND COALESCE(cm.is_active, true) = true
               AND COALESCE(cm.status, 'active') IN ('active', 'approved', 'automatic')
               AND cm.role IN ('owner', 'co_owner', 'admin')
             WHERE c.id = v_tournament.club_id
               AND c.lifecycle_status = 'active'
               AND COALESCE(c.status, 'active') = 'active'
               AND (c.owner_id = p_host_user_id OR cm.user_id IS NOT NULL)
        ) INTO v_can_manage;
    END IF;

    IF NOT v_can_manage THEN
        RETURN jsonb_build_object('success', false, 'error', 'club_host_forbidden');
    END IF;

    IF v_tournament.status <> 'registration' THEN
        RETURN jsonb_build_object('success', false, 'error', 'tournament_not_in_registration');
    END IF;

    SELECT count(*)::integer
      INTO v_entrant_count
      FROM public.trivia_club_tournament_entries e
     WHERE e.club_tournament_id = p_club_tournament_id
       AND e.status = 'registered';

    IF v_entrant_count < 2 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'minimum_entrants_required',
            'entrantCount', v_entrant_count,
            'minimumEntrants', 2
        );
    END IF;

    -- Snapshot Phase 3 verified eligible tournament questions deterministically per event.
    DELETE FROM public.trivia_club_tournament_questions
     WHERE club_tournament_id = p_club_tournament_id;

    WITH eligible_dedup AS (
        SELECT DISTINCT ON (COALESCE(p.fingerprint, q.id::text))
            q.id AS question_id,
            pg_catalog.btrim(q.question) AS question_text,
            q.options,
            q.correct_index,
            q.explanation,
            COALESCE(NULLIF(pg_catalog.btrim(q.category), ''), 'general') AS category,
            pg_catalog.md5(p_club_tournament_id::text || ':' || q.id::text) AS sort_key
        FROM public.trivia_eligible_question_pool_v1 p
        JOIN public.trivia_questions q ON q.id = p.question_id
        WHERE 'tournaments' = ANY (p.modes)
          AND pg_catalog.jsonb_typeof(q.options) = 'array'
          AND pg_catalog.jsonb_array_length(q.options) >= 2
          AND q.correct_index >= 0
          AND q.correct_index < pg_catalog.jsonb_array_length(q.options)
          AND pg_catalog.btrim(COALESCE(q.question, '')) <> ''
        ORDER BY COALESCE(p.fingerprint, q.id::text), pg_catalog.md5(p_club_tournament_id::text || ':' || q.id::text)
    ),
    picked AS (
        SELECT
            question_id,
            question_text,
            options,
            correct_index,
            explanation,
            category,
            row_number() OVER (ORDER BY sort_key ASC, question_id ASC) AS pos
        FROM eligible_dedup
        ORDER BY sort_key ASC, question_id ASC
        LIMIT v_tournament.question_count
    )
    INSERT INTO public.trivia_club_tournament_questions (
        club_tournament_id,
        position,
        question_id,
        question_text,
        options,
        correct_index,
        explanation,
        category
    )
    SELECT
        p_club_tournament_id,
        pos::integer,
        question_id,
        question_text,
        options,
        correct_index,
        explanation,
        category
    FROM picked
    ORDER BY pos ASC;

    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

    IF v_inserted_count < v_tournament.question_count THEN
        DELETE FROM public.trivia_club_tournament_questions
         WHERE club_tournament_id = p_club_tournament_id;
        RETURN jsonb_build_object(
            'success', false,
            'error', 'insufficient_eligible_questions',
            'required', v_tournament.question_count,
            'available', v_inserted_count
        );
    END IF;

    UPDATE public.trivia_club_tournaments
       SET status = 'live',
           updated_at = now()
     WHERE id = p_club_tournament_id;

    RETURN jsonb_build_object(
        'success', true,
        'clubTournamentId', p_club_tournament_id,
        'status', 'live',
        'question_count', v_inserted_count,
        'questionCount', v_inserted_count,
        'entrant_count', v_entrant_count,
        'entrantCount', v_entrant_count
    );
END;
$fn$;

-- -----------------------------------------------------------------------------
-- 5. RPC: trivia_club_tournament_questions_v1 (strictly answer-free)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_club_tournament_questions_v1(
    p_user_id uuid,
    p_club_tournament_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_tournament public.trivia_club_tournaments%ROWTYPE;
    v_is_member boolean := false;
    v_is_registered boolean := false;
    v_already_submitted boolean := false;
    v_questions jsonb;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'authentication_required');
    END IF;
    IF p_club_tournament_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_club_tournament_id');
    END IF;

    SELECT *
      INTO v_tournament
      FROM public.trivia_club_tournaments t
     WHERE t.id = p_club_tournament_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'club_tournament_not_found');
    END IF;

    IF v_tournament.entry_fee <> 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'paid_club_escrow_not_enabled');
    END IF;

    SELECT EXISTS (
        SELECT 1
          FROM public.clubs c
          LEFT JOIN public.club_members cm
            ON cm.club_id = c.id
           AND cm.user_id = p_user_id
           AND cm.membership_lifecycle_status = 'active'
           AND COALESCE(cm.is_active, true) = true
           AND COALESCE(cm.status, 'active') IN ('active', 'approved', 'automatic')
         WHERE c.id = v_tournament.club_id
           AND c.lifecycle_status = 'active'
           AND COALESCE(c.status, 'active') = 'active'
           AND (c.owner_id = p_user_id OR cm.user_id IS NOT NULL)
    ) INTO v_is_member;

    IF NOT v_is_member THEN
        RETURN jsonb_build_object('success', false, 'error', 'club_membership_required');
    END IF;

    SELECT EXISTS (
        SELECT 1
          FROM public.trivia_club_tournament_entries e
         WHERE e.club_tournament_id = p_club_tournament_id
           AND e.user_id = p_user_id
           AND e.status = 'registered'
    ) INTO v_is_registered;

    IF NOT v_is_registered THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_registered_for_tournament');
    END IF;

    IF v_tournament.status <> 'live' THEN
        RETURN jsonb_build_object('success', false, 'error', 'tournament_not_live');
    END IF;

    SELECT EXISTS (
        SELECT 1
          FROM public.trivia_club_tournament_submissions s
         WHERE s.club_tournament_id = p_club_tournament_id
           AND s.user_id = p_user_id
    ) INTO v_already_submitted;

    -- Strictly answer-free projection: NEVER project correct_index or explanation.
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'position', q.position,
                'questionText', q.question_text,
                'options', q.options,
                'category', q.category
            )
            ORDER BY q.position ASC
        ),
        '[]'::jsonb
    )
      INTO v_questions
      FROM public.trivia_club_tournament_questions q
     WHERE q.club_tournament_id = p_club_tournament_id;

    RETURN jsonb_build_object(
        'success', true,
        'clubTournamentId', p_club_tournament_id,
        'title', v_tournament.title,
        'status', v_tournament.status,
        'questionCount', v_tournament.question_count,
        'alreadySubmitted', v_already_submitted,
        'questions', v_questions
    );
END;
$fn$;

-- -----------------------------------------------------------------------------
-- 6. RPC: trivia_club_tournament_submit_v1 (server-graded, idempotent)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_club_tournament_submit_v1(
    p_user_id uuid,
    p_club_tournament_id uuid,
    p_answers jsonb,
    p_elapsed_ms integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_tournament public.trivia_club_tournaments%ROWTYPE;
    v_is_member boolean := false;
    v_is_registered boolean := false;
    v_existing public.trivia_club_tournament_submissions%ROWTYPE;
    v_q record;
    v_raw_elem jsonb;
    v_choice integer;
    v_sanitized_answers jsonb := '[]'::jsonb;
    v_total_questions integer := 0;
    v_correct_count integer := 0;
    v_score integer := 0;
    v_elapsed_ms integer;
    v_entrant_count integer := 0;
    v_submission_count integer := 0;
    v_rank integer := 1;
    v_auto_completed boolean := false;
    v_final_status text;
    v_submitted_at timestamptz;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'authentication_required');
    END IF;
    IF p_club_tournament_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_club_tournament_id');
    END IF;

    SELECT *
      INTO v_tournament
      FROM public.trivia_club_tournaments t
     WHERE t.id = p_club_tournament_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'club_tournament_not_found');
    END IF;

    IF v_tournament.entry_fee <> 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'paid_club_escrow_not_enabled');
    END IF;

    SELECT EXISTS (
        SELECT 1
          FROM public.clubs c
          LEFT JOIN public.club_members cm
            ON cm.club_id = c.id
           AND cm.user_id = p_user_id
           AND cm.membership_lifecycle_status = 'active'
           AND COALESCE(cm.is_active, true) = true
           AND COALESCE(cm.status, 'active') IN ('active', 'approved', 'automatic')
         WHERE c.id = v_tournament.club_id
           AND c.lifecycle_status = 'active'
           AND COALESCE(c.status, 'active') = 'active'
           AND (c.owner_id = p_user_id OR cm.user_id IS NOT NULL)
    ) INTO v_is_member;

    IF NOT v_is_member THEN
        RETURN jsonb_build_object('success', false, 'error', 'club_membership_required');
    END IF;

    SELECT EXISTS (
        SELECT 1
          FROM public.trivia_club_tournament_entries e
         WHERE e.club_tournament_id = p_club_tournament_id
           AND e.user_id = p_user_id
           AND e.status = 'registered'
    ) INTO v_is_registered;

    IF NOT v_is_registered THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_registered_for_tournament');
    END IF;

    -- Idempotency check BEFORE status guard so a network retry right after
    -- auto-settlement still returns the caller's exact stored result.
    SELECT *
      INTO v_existing
      FROM public.trivia_club_tournament_submissions s
     WHERE s.club_tournament_id = p_club_tournament_id
       AND s.user_id = p_user_id;

    IF FOUND THEN
        SELECT count(*)::integer
          INTO v_entrant_count
          FROM public.trivia_club_tournament_entries e
         WHERE e.club_tournament_id = p_club_tournament_id
           AND e.status = 'registered';

        SELECT count(*)::integer
          INTO v_submission_count
          FROM public.trivia_club_tournament_submissions s
         WHERE s.club_tournament_id = p_club_tournament_id;

        SELECT ranked.r::integer
          INTO v_rank
          FROM (
              SELECT s.user_id,
                     row_number() OVER (ORDER BY s.score DESC, s.elapsed_ms ASC, s.submitted_at ASC, s.user_id ASC) AS r
                FROM public.trivia_club_tournament_submissions s
               WHERE s.club_tournament_id = p_club_tournament_id
          ) ranked
         WHERE ranked.user_id = p_user_id;

        RETURN jsonb_build_object(
            'success', true,
            'duplicate', true,
            'clubTournamentId', p_club_tournament_id,
            'status', v_tournament.status,
            'autoCompleted', false,
            'score', v_existing.score,
            'correctCount', v_existing.correct_count,
            'totalQuestions', v_existing.total_questions,
            'elapsedMs', v_existing.elapsed_ms,
            'rank', COALESCE(v_rank, 1),
            'submissionCount', v_submission_count,
            'entrantCount', v_entrant_count,
            'submittedAt', v_existing.submitted_at
        );
    END IF;

    IF v_tournament.status <> 'live' THEN
        RETURN jsonb_build_object('success', false, 'error', 'tournament_not_live');
    END IF;

    IF p_answers IS NULL OR pg_catalog.jsonb_typeof(p_answers) <> 'array' THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_answers');
    END IF;

    IF p_elapsed_ms IS NULL OR p_elapsed_ms < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_elapsed_ms');
    END IF;
    v_elapsed_ms := LEAST(p_elapsed_ms, 86400000);

    FOR v_q IN
        SELECT q.position, q.correct_index, pg_catalog.jsonb_array_length(q.options) AS option_count
          FROM public.trivia_club_tournament_questions q
         WHERE q.club_tournament_id = p_club_tournament_id
         ORDER BY q.position ASC
    LOOP
        v_total_questions := v_total_questions + 1;
        v_raw_elem := p_answers -> (v_q.position - 1);
        v_choice := -1;

        IF v_raw_elem IS NOT NULL AND pg_catalog.jsonb_typeof(v_raw_elem) = 'number' THEN
            BEGIN
                v_choice := (v_raw_elem::text)::integer;
                IF v_choice < 0 OR v_choice >= v_q.option_count THEN
                    v_choice := -1;
                END IF;
            EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
                v_choice := -1;
            END;
        END IF;

        IF v_choice = v_q.correct_index THEN
            v_correct_count := v_correct_count + 1;
        END IF;

        v_sanitized_answers := v_sanitized_answers || jsonb_build_array(v_choice);
    END LOOP;

    IF v_total_questions < 1 THEN
        RETURN jsonb_build_object('success', false, 'error', 'tournament_questions_missing');
    END IF;

    v_score := v_correct_count * 100;

    INSERT INTO public.trivia_club_tournament_submissions (
        club_tournament_id,
        user_id,
        answers,
        score,
        correct_count,
        total_questions,
        elapsed_ms
    ) VALUES (
        p_club_tournament_id,
        p_user_id,
        v_sanitized_answers,
        v_score,
        v_correct_count,
        v_total_questions,
        v_elapsed_ms
    )
    RETURNING submitted_at INTO v_submitted_at;

    SELECT count(*)::integer
      INTO v_entrant_count
      FROM public.trivia_club_tournament_entries e
     WHERE e.club_tournament_id = p_club_tournament_id
       AND e.status = 'registered';

    SELECT count(*)::integer
      INTO v_submission_count
      FROM public.trivia_club_tournament_submissions s
      JOIN public.trivia_club_tournament_entries e
        ON e.club_tournament_id = s.club_tournament_id
       AND e.user_id = s.user_id
       AND e.status = 'registered'
     WHERE s.club_tournament_id = p_club_tournament_id;

    v_final_status := v_tournament.status;
    IF v_entrant_count > 0 AND v_submission_count >= v_entrant_count THEN
        UPDATE public.trivia_club_tournaments
           SET status = 'settled',
               updated_at = now()
         WHERE id = p_club_tournament_id;
        v_auto_completed := true;
        v_final_status := 'settled';
    END IF;

    SELECT ranked.r::integer
      INTO v_rank
      FROM (
          SELECT s.user_id,
                 row_number() OVER (ORDER BY s.score DESC, s.elapsed_ms ASC, s.submitted_at ASC, s.user_id ASC) AS r
            FROM public.trivia_club_tournament_submissions s
           WHERE s.club_tournament_id = p_club_tournament_id
      ) ranked
     WHERE ranked.user_id = p_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'duplicate', false,
        'clubTournamentId', p_club_tournament_id,
        'status', v_final_status,
        'autoCompleted', v_auto_completed,
        'score', v_score,
        'correctCount', v_correct_count,
        'totalQuestions', v_total_questions,
        'elapsedMs', v_elapsed_ms,
        'rank', COALESCE(v_rank, 1),
        'submissionCount', v_submission_count,
        'entrantCount', v_entrant_count,
        'submittedAt', v_submitted_at
    );
END;
$fn$;

-- -----------------------------------------------------------------------------
-- 7. RPC: trivia_club_tournament_complete_v1
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_club_tournament_complete_v1(
    p_host_user_id uuid,
    p_club_tournament_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_tournament public.trivia_club_tournaments%ROWTYPE;
    v_can_manage boolean := false;
    v_already_settled boolean := false;
    v_entrant_count integer := 0;
    v_submission_count integer := 0;
    v_standings jsonb := '[]'::jsonb;
    v_champion jsonb := NULL;
BEGIN
    IF p_host_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'authentication_required');
    END IF;
    IF p_club_tournament_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_club_tournament_id');
    END IF;

    SELECT *
      INTO v_tournament
      FROM public.trivia_club_tournaments t
     WHERE t.id = p_club_tournament_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'club_tournament_not_found');
    END IF;

    IF v_tournament.entry_fee <> 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'paid_club_escrow_not_enabled');
    END IF;

    IF v_tournament.host_user_id = p_host_user_id THEN
        v_can_manage := true;
    ELSE
        SELECT EXISTS (
            SELECT 1
              FROM public.clubs c
              LEFT JOIN public.club_members cm
                ON cm.club_id = c.id
               AND cm.user_id = p_host_user_id
               AND cm.membership_lifecycle_status = 'active'
               AND COALESCE(cm.is_active, true) = true
               AND COALESCE(cm.status, 'active') IN ('active', 'approved', 'automatic')
               AND cm.role IN ('owner', 'co_owner', 'admin')
             WHERE c.id = v_tournament.club_id
               AND c.lifecycle_status = 'active'
               AND COALESCE(c.status, 'active') = 'active'
               AND (c.owner_id = p_host_user_id OR cm.user_id IS NOT NULL)
        ) INTO v_can_manage;
    END IF;

    IF NOT v_can_manage THEN
        RETURN jsonb_build_object('success', false, 'error', 'club_host_forbidden');
    END IF;

    IF v_tournament.status = 'settled' THEN
        v_already_settled := true;
    ELSIF v_tournament.status <> 'live' THEN
        RETURN jsonb_build_object('success', false, 'error', 'tournament_not_live');
    ELSE
        UPDATE public.trivia_club_tournaments
           SET status = 'settled',
               updated_at = now()
         WHERE id = p_club_tournament_id;
    END IF;

    SELECT count(*)::integer
      INTO v_entrant_count
      FROM public.trivia_club_tournament_entries e
     WHERE e.club_tournament_id = p_club_tournament_id
       AND e.status = 'registered';

    WITH ranked AS (
        SELECT
            row_number() OVER (ORDER BY s.score DESC, s.elapsed_ms ASC, s.submitted_at ASC, s.user_id ASC)::integer AS rank,
            s.user_id,
            COALESCE(
                NULLIF(pg_catalog.btrim(p.username), ''),
                NULLIF(pg_catalog.btrim(p.display_name), ''),
                NULLIF(pg_catalog.btrim(p.full_name), ''),
                'Club Member'
            ) AS display_name,
            s.score,
            s.correct_count,
            s.total_questions,
            s.elapsed_ms,
            s.submitted_at
        FROM public.trivia_club_tournament_submissions s
        LEFT JOIN public.profiles p ON p.id = s.user_id
        WHERE s.club_tournament_id = p_club_tournament_id
    )
    SELECT
        count(*)::integer,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'rank', r.rank,
                    'userId', r.user_id,
                    'displayName', r.display_name,
                    'score', r.score,
                    'correctCount', r.correct_count,
                    'totalQuestions', r.total_questions,
                    'elapsedMs', r.elapsed_ms,
                    'submittedAt', r.submitted_at,
                    'isChampion', (r.rank = 1)
                )
                ORDER BY r.rank ASC
            ),
            '[]'::jsonb
        ),
        (
            SELECT jsonb_build_object(
                'rank', c.rank,
                'userId', c.user_id,
                'displayName', c.display_name,
                'score', c.score,
                'correctCount', c.correct_count,
                'totalQuestions', c.total_questions,
                'elapsedMs', c.elapsed_ms
            )
            FROM ranked c
            WHERE c.rank = 1
            LIMIT 1
        )
      INTO v_submission_count, v_standings, v_champion
      FROM ranked r;

    RETURN jsonb_build_object(
        'success', true,
        'alreadySettled', v_already_settled,
        'clubTournamentId', p_club_tournament_id,
        'status', 'settled',
        'entrantCount', v_entrant_count,
        'submissionCount', v_submission_count,
        'champion', v_champion,
        'standings', v_standings
    );
END;
$fn$;

-- -----------------------------------------------------------------------------
-- 8. RPC: trivia_club_tournament_results_v1 (review unlocked ONLY when settled)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_club_tournament_results_v1(
    p_user_id uuid,
    p_club_tournament_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_tournament public.trivia_club_tournaments%ROWTYPE;
    v_is_member boolean := false;
    v_entrant_count integer := 0;
    v_submission_count integer := 0;
    v_viewer_submitted boolean := false;
    v_standings jsonb := '[]'::jsonb;
    v_champion jsonb := NULL;
    v_review jsonb := NULL;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'authentication_required');
    END IF;
    IF p_club_tournament_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_club_tournament_id');
    END IF;

    SELECT *
      INTO v_tournament
      FROM public.trivia_club_tournaments t
     WHERE t.id = p_club_tournament_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'club_tournament_not_found');
    END IF;

    SELECT EXISTS (
        SELECT 1
          FROM public.clubs c
          LEFT JOIN public.club_members cm
            ON cm.club_id = c.id
           AND cm.user_id = p_user_id
           AND cm.membership_lifecycle_status = 'active'
           AND COALESCE(cm.is_active, true) = true
           AND COALESCE(cm.status, 'active') IN ('active', 'approved', 'automatic')
         WHERE c.id = v_tournament.club_id
           AND c.lifecycle_status = 'active'
           AND COALESCE(c.status, 'active') = 'active'
           AND (c.owner_id = p_user_id OR cm.user_id IS NOT NULL)
    ) INTO v_is_member;

    IF NOT v_is_member THEN
        RETURN jsonb_build_object('success', false, 'error', 'club_membership_required');
    END IF;

    SELECT count(*)::integer
      INTO v_entrant_count
      FROM public.trivia_club_tournament_entries e
     WHERE e.club_tournament_id = p_club_tournament_id
       AND e.status = 'registered';

    SELECT EXISTS (
        SELECT 1
          FROM public.trivia_club_tournament_submissions s
         WHERE s.club_tournament_id = p_club_tournament_id
           AND s.user_id = p_user_id
    ) INTO v_viewer_submitted;

    WITH ranked AS (
        SELECT
            row_number() OVER (ORDER BY s.score DESC, s.elapsed_ms ASC, s.submitted_at ASC, s.user_id ASC)::integer AS rank,
            s.user_id,
            COALESCE(
                NULLIF(pg_catalog.btrim(p.username), ''),
                NULLIF(pg_catalog.btrim(p.display_name), ''),
                NULLIF(pg_catalog.btrim(p.full_name), ''),
                'Club Member'
            ) AS display_name,
            s.score,
            s.correct_count,
            s.total_questions,
            s.elapsed_ms,
            s.submitted_at
        FROM public.trivia_club_tournament_submissions s
        LEFT JOIN public.profiles p ON p.id = s.user_id
        WHERE s.club_tournament_id = p_club_tournament_id
    )
    SELECT
        count(*)::integer,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'rank', r.rank,
                    'userId', r.user_id,
                    'displayName', r.display_name,
                    'score', r.score,
                    'correctCount', r.correct_count,
                    'totalQuestions', r.total_questions,
                    'elapsedMs', r.elapsed_ms,
                    'submittedAt', r.submitted_at,
                    'isChampion', (v_tournament.status = 'settled' AND r.rank = 1),
                    'isViewer', (r.user_id = p_user_id)
                )
                ORDER BY r.rank ASC
            ),
            '[]'::jsonb
        ),
        CASE
            WHEN v_tournament.status = 'settled' THEN (
                SELECT jsonb_build_object(
                    'rank', c.rank,
                    'userId', c.user_id,
                    'displayName', c.display_name,
                    'score', c.score,
                    'correctCount', c.correct_count,
                    'totalQuestions', c.total_questions,
                    'elapsedMs', c.elapsed_ms
                )
                FROM ranked c
                WHERE c.rank = 1
                LIMIT 1
            )
            ELSE NULL
        END
      INTO v_submission_count, v_standings, v_champion
      FROM ranked r;

    -- Question review (correctIndex + explanation) is unlocked STRICTLY once settled.
    IF v_tournament.status = 'settled' THEN
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'position', q.position,
                    'questionText', q.question_text,
                    'options', q.options,
                    'correctIndex', q.correct_index,
                    'explanation', q.explanation,
                    'category', q.category
                )
                ORDER BY q.position ASC
            ),
            '[]'::jsonb
        )
          INTO v_review
          FROM public.trivia_club_tournament_questions q
         WHERE q.club_tournament_id = p_club_tournament_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'clubTournamentId', p_club_tournament_id,
        'title', v_tournament.title,
        'status', v_tournament.status,
        'questionCount', v_tournament.question_count,
        'entrantCount', v_entrant_count,
        'submissionCount', v_submission_count,
        'viewerSubmitted', v_viewer_submitted,
        'champion', v_champion,
        'standings', v_standings,
        'review', v_review
    );
END;
$fn$;

-- -----------------------------------------------------------------------------
-- 9. Upgrade trivia_club_tournament_list_v1 with live submission & champion info
--    (preserves 100% of existing keys and signature)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_club_tournament_list_v1(
    p_user_id uuid,
    p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_limit integer;
    v_clubs jsonb;
    v_items jsonb;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'authentication_required');
    END IF;

    v_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);

    WITH eligible_clubs AS (
        SELECT
            c.id,
            c.name,
            c.club_id AS club_code,
            COALESCE(c.avatar_url, c.logo_url) AS avatar_url,
            CASE
                WHEN c.owner_id = p_user_id THEN 'owner'
                ELSE COALESCE(cm.role, 'player')
            END AS role,
            (
                c.owner_id = p_user_id
                OR COALESCE(cm.role, 'player') IN ('owner', 'co_owner', 'admin')
            ) AS can_host
        FROM public.clubs c
        LEFT JOIN public.club_members cm
          ON cm.club_id = c.id
         AND cm.user_id = p_user_id
         AND cm.membership_lifecycle_status = 'active'
         AND COALESCE(cm.is_active, true) = true
         AND COALESCE(cm.status, 'active') IN ('active', 'approved', 'automatic')
        WHERE c.lifecycle_status = 'active'
          AND COALESCE(c.status, 'active') = 'active'
          AND (c.owner_id = p_user_id OR cm.user_id IS NOT NULL)
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', ec.id,
                'name', ec.name,
                'clubCode', ec.club_code,
                'avatarUrl', ec.avatar_url,
                'role', ec.role,
                'canHost', ec.can_host
            )
            ORDER BY ec.can_host DESC, ec.name ASC
        ),
        '[]'::jsonb
    )
      INTO v_clubs
      FROM eligible_clubs ec;

    WITH eligible_clubs AS (
        SELECT
            c.id,
            c.name,
            c.club_id AS club_code,
            (
                c.owner_id = p_user_id
                OR COALESCE(cm.role, 'player') IN ('owner', 'co_owner', 'admin')
            ) AS can_host
        FROM public.clubs c
        LEFT JOIN public.club_members cm
          ON cm.club_id = c.id
         AND cm.user_id = p_user_id
         AND cm.membership_lifecycle_status = 'active'
         AND COALESCE(cm.is_active, true) = true
         AND COALESCE(cm.status, 'active') IN ('active', 'approved', 'automatic')
        WHERE c.lifecycle_status = 'active'
          AND COALESCE(c.status, 'active') = 'active'
          AND (c.owner_id = p_user_id OR cm.user_id IS NOT NULL)
    ),
    ranked_tournaments AS (
        SELECT
            t.id,
            t.club_id,
            ec.name AS club_name,
            ec.club_code,
            t.host_user_id,
            COALESCE(
                NULLIF(pg_catalog.btrim(p.username), ''),
                NULLIF(pg_catalog.btrim(p.display_name), ''),
                NULLIF(pg_catalog.btrim(p.full_name), ''),
                'Club Host'
            ) AS host_display_name,
            t.title,
            t.invite_code,
            t.entry_fee,
            t.max_players,
            t.question_count,
            t.scheduled_start_at,
            t.status,
            t.created_at,
            COALESCE(ec_counts.entrant_count, 0) AS entrant_count,
            COALESCE(sub_counts.submission_count, 0) AS submission_count,
            EXISTS (
                SELECT 1
                  FROM public.trivia_club_tournament_entries ve
                 WHERE ve.club_tournament_id = t.id
                   AND ve.user_id = p_user_id
                   AND ve.status = 'registered'
            ) AS viewer_registered,
            (vs.id IS NOT NULL) AS viewer_submitted,
            vs.score AS viewer_score,
            champ.display_name AS champion_display_name,
            (t.host_user_id = p_user_id OR ec.can_host) AS viewer_can_manage
        FROM public.trivia_club_tournaments t
        JOIN eligible_clubs ec ON ec.id = t.club_id
        LEFT JOIN public.profiles p ON p.id = t.host_user_id
        LEFT JOIN LATERAL (
            SELECT count(*)::integer AS entrant_count
              FROM public.trivia_club_tournament_entries e
             WHERE e.club_tournament_id = t.id
               AND e.status = 'registered'
        ) ec_counts ON true
        LEFT JOIN LATERAL (
            SELECT count(*)::integer AS submission_count
              FROM public.trivia_club_tournament_submissions s
             WHERE s.club_tournament_id = t.id
        ) sub_counts ON true
        LEFT JOIN public.trivia_club_tournament_submissions vs
          ON vs.club_tournament_id = t.id
         AND vs.user_id = p_user_id
        LEFT JOIN LATERAL (
            SELECT COALESCE(
                NULLIF(pg_catalog.btrim(cp.username), ''),
                NULLIF(pg_catalog.btrim(cp.display_name), ''),
                NULLIF(pg_catalog.btrim(cp.full_name), ''),
                'Club Member'
            ) AS display_name
              FROM public.trivia_club_tournament_submissions cs
              LEFT JOIN public.profiles cp ON cp.id = cs.user_id
             WHERE cs.club_tournament_id = t.id
               AND t.status = 'settled'
             ORDER BY cs.score DESC, cs.elapsed_ms ASC, cs.submitted_at ASC, cs.user_id ASC
             LIMIT 1
        ) champ ON true
        WHERE t.status IN ('registration', 'live')
           OR t.scheduled_start_at >= now() - interval '14 days'
        ORDER BY
            CASE t.status
                WHEN 'live' THEN 0
                WHEN 'registration' THEN 1
                WHEN 'settled' THEN 2
                ELSE 3
            END ASC,
            t.scheduled_start_at ASC,
            t.created_at DESC
        LIMIT v_limit
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', rt.id,
                'clubId', rt.club_id,
                'clubName', rt.club_name,
                'clubCode', rt.club_code,
                'hostUserId', rt.host_user_id,
                'hostDisplayName', rt.host_display_name,
                'title', rt.title,
                'inviteCode', rt.invite_code,
                'entryFee', rt.entry_fee,
                'maxPlayers', rt.max_players,
                'questionCount', rt.question_count,
                'scheduledStartAt', rt.scheduled_start_at,
                'status', rt.status,
                'entrantCount', rt.entrant_count,
                'submissionCount', rt.submission_count,
                'viewerRegistered', rt.viewer_registered,
                'viewerSubmitted', rt.viewer_submitted,
                'viewerScore', rt.viewer_score,
                'championDisplayName', rt.champion_display_name,
                'viewerCanManage', rt.viewer_can_manage,
                'createdAt', rt.created_at
            )
        ),
        '[]'::jsonb
    )
      INTO v_items
      FROM ranked_tournaments rt;

    RETURN jsonb_build_object(
        'success', true,
        'financialMode', 'freeroll_v1',
        'clubs', COALESCE(v_clubs, '[]'::jsonb),
        'items', COALESCE(v_items, '[]'::jsonb)
    );
END;
$fn$;

-- -----------------------------------------------------------------------------
-- 10. Explicit function ACLs ({postgres=X/postgres,service_role=X/postgres})
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.trivia_club_tournament_start_v1(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_club_tournament_start_v1(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.trivia_club_tournament_questions_v1(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_club_tournament_questions_v1(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.trivia_club_tournament_submit_v1(uuid, uuid, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_club_tournament_submit_v1(uuid, uuid, jsonb, integer) TO service_role;

REVOKE ALL ON FUNCTION public.trivia_club_tournament_complete_v1(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_club_tournament_complete_v1(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.trivia_club_tournament_results_v1(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_club_tournament_results_v1(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.trivia_club_tournament_list_v1(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_club_tournament_list_v1(uuid, integer) TO service_role;

-- -----------------------------------------------------------------------------
-- 11. Postconditions
-- -----------------------------------------------------------------------------
DO $postconditions$
DECLARE
    v_fn regprocedure;
    v_tbl regclass;
BEGIN
    FOREACH v_tbl IN ARRAY ARRAY[
        'public.trivia_club_tournament_questions'::regclass,
        'public.trivia_club_tournament_submissions'::regclass
    ] LOOP
        IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = v_tbl) THEN
            RAISE EXCEPTION 'postcondition failed: RLS disabled on %', v_tbl;
        END IF;
        IF has_table_privilege('anon', v_tbl, 'SELECT,INSERT,UPDATE,DELETE')
           OR has_table_privilege('authenticated', v_tbl, 'SELECT,INSERT,UPDATE,DELETE') THEN
            RAISE EXCEPTION 'postcondition failed: browser privilege leak on %', v_tbl;
        END IF;
    END LOOP;

    FOREACH v_fn IN ARRAY ARRAY[
        'public.trivia_club_tournament_start_v1(uuid,uuid)'::regprocedure,
        'public.trivia_club_tournament_questions_v1(uuid,uuid)'::regprocedure,
        'public.trivia_club_tournament_submit_v1(uuid,uuid,jsonb,integer)'::regprocedure,
        'public.trivia_club_tournament_complete_v1(uuid,uuid)'::regprocedure,
        'public.trivia_club_tournament_results_v1(uuid,uuid)'::regprocedure,
        'public.trivia_club_tournament_list_v1(uuid,integer)'::regprocedure
    ] LOOP
        IF NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = v_fn)
           OR NOT EXISTS (
                SELECT 1 FROM unnest((SELECT p.proconfig FROM pg_proc p WHERE p.oid = v_fn)) s
                 WHERE s IN ('search_path=', 'search_path=""')
           ) THEN
            RAISE EXCEPTION 'postcondition failed: % is not a fixed-search-path SECURITY DEFINER', v_fn;
        END IF;
        IF has_function_privilege('anon', v_fn, 'EXECUTE')
           OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
            RAISE EXCEPTION 'postcondition failed: browser role can execute %', v_fn;
        END IF;
        IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
            RAISE EXCEPTION 'postcondition failed: service_role missing EXECUTE on %', v_fn;
        END IF;
    END LOOP;
END
$postconditions$;

NOTIFY pgrst, 'reload schema';

COMMIT;

/* FORWARD ROLLBACK
BEGIN;
REVOKE ALL ON FUNCTION public.trivia_club_tournament_results_v1(uuid, uuid) FROM service_role;
REVOKE ALL ON FUNCTION public.trivia_club_tournament_complete_v1(uuid, uuid) FROM service_role;
REVOKE ALL ON FUNCTION public.trivia_club_tournament_submit_v1(uuid, uuid, jsonb, integer) FROM service_role;
REVOKE ALL ON FUNCTION public.trivia_club_tournament_questions_v1(uuid, uuid) FROM service_role;
REVOKE ALL ON FUNCTION public.trivia_club_tournament_start_v1(uuid, uuid) FROM service_role;
DROP FUNCTION IF EXISTS public.trivia_club_tournament_results_v1(uuid, uuid);
DROP FUNCTION IF EXISTS public.trivia_club_tournament_complete_v1(uuid, uuid);
DROP FUNCTION IF EXISTS public.trivia_club_tournament_submit_v1(uuid, uuid, jsonb, integer);
DROP FUNCTION IF EXISTS public.trivia_club_tournament_questions_v1(uuid, uuid);
DROP FUNCTION IF EXISTS public.trivia_club_tournament_start_v1(uuid, uuid);
DROP TABLE IF EXISTS public.trivia_club_tournament_submissions;
DROP TABLE IF EXISTS public.trivia_club_tournament_questions;
NOTIFY pgrst, 'reload schema';
COMMIT;
*/

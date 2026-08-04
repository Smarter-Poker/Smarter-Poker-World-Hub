-- =======================================================================
-- 20260805090000_trivia_session_answers.sql
-- =======================================================================
-- TIER:        2                              (additive: one column, one RPC)
-- AUTHOR:      claude (cowork session, 2026-08-05)
-- AFFECTS:     tables: trivia_sessions  rpcs: record_trivia_session_answer
-- IRREVERSIBLE: no
--
-- WHY:
--   Server-authoritative grading (20260804210000) grades a run in one shot
--   at submit time, but the game UI shows right/wrong after every tap.
--   Revealing a verdict mid-run is only safe if the FIRST answer is binding;
--   otherwise a client could ask for the verdict and then "correct" its
--   answer at submit time. This adds the storage (trivia_sessions.answers)
--   and the atomic first-answer-wins writer used by
--   /api/trivia/session-answer. The stored answer ORDER (ordinal "n") also
--   lets sequence-dependent payouts (arcade's stake pot: build on correct,
--   bust on wrong) be recomputed server-side without trusting the client.
--   Design approved by Dan 2026-08-05 ("per-answer round trip").
--
-- HOW (high level):
--   - ALTER trivia_sessions ADD answers jsonb DEFAULT '{}'
--     (question_id -> {"d": displayIndex, "n": answerOrdinal})
--   - record_trivia_session_answer(): conditional UPDATE that only fires
--     when the question has no stored answer yet; concurrent duplicate
--     taps collapse to one row-win, losers read back the binding answer.
--   - EXECUTE revoked from anon/authenticated; service role only (the API
--     route is the only caller and it authenticates the user itself).
--
-- See .agent/workflows/migration-safety.md for the full protocol.
-- =======================================================================

BEGIN;

-- --- 1. PRE-FLIGHT ASSERTIONS ------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'trivia_sessions'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: public.trivia_sessions not found - apply 20260804210000_trivia_server_grading.sql first';
    END IF;
END $$;

-- --- 2. THE ACTUAL CHANGES ---------------------------------------------

ALTER TABLE public.trivia_sessions
    ADD COLUMN IF NOT EXISTS answers jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.trivia_sessions.answers IS
    'question_id -> {d: displayIndex, n: answerOrdinal}. Written only via record_trivia_session_answer (first answer wins). The ordinal preserves answer order so sequence-dependent payouts (arcade stake pot) are recomputed server-side at submit.';

CREATE OR REPLACE FUNCTION public.record_trivia_session_answer(
    p_session_id    uuid,
    p_user_id       uuid,
    p_question_id   uuid,
    p_display_index int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session public.trivia_sessions%ROWTYPE;
    v_key     text := p_question_id::text;
    v_stored  jsonb;
BEGIN
    IF p_session_id IS NULL OR p_user_id IS NULL OR p_question_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'missing_arguments');
    END IF;

    -- First-answer-wins, atomically: the row only updates if this question
    -- has no stored answer yet. "answers" on the right-hand side is the
    -- pre-update value, so the ordinal "n" is the count of answers that
    -- existed before this one - i.e. this answer's position in sequence.
    UPDATE public.trivia_sessions
       SET answers = answers || jsonb_build_object(
               v_key,
               jsonb_build_object(
                   'd', GREATEST(-1, COALESCE(p_display_index, -1)),
                   'n', (SELECT count(*) FROM jsonb_object_keys(answers))
               )
           )
     WHERE id = p_session_id
       AND user_id = p_user_id
       AND status = 'open'
       AND question_ids @> ARRAY[p_question_id]
       AND NOT (answers ? v_key)
    RETURNING * INTO v_session;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'stored', v_session.answers -> v_key,
            'fresh', true
        );
    END IF;

    -- No update: work out why. Ownership is part of the lookup so a leaked
    -- session id reveals nothing about another user's session.
    SELECT * INTO v_session
      FROM public.trivia_sessions
     WHERE id = p_session_id AND user_id = p_user_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
    END IF;
    IF v_session.status <> 'open' THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_closed');
    END IF;
    IF NOT (v_session.question_ids @> ARRAY[p_question_id]) THEN
        RETURN jsonb_build_object('success', false, 'error', 'question_not_in_session');
    END IF;
    v_stored := v_session.answers -> v_key;
    IF v_stored IS NOT NULL THEN
        -- Already answered: idempotent - hand back the binding first answer
        -- so a double-tap or a retry renders the same verdict.
        RETURN jsonb_build_object('success', true, 'stored', v_stored, 'fresh', false);
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'not_recorded');
END;
$$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default. Same lockdown as
-- award_trivia_run: the API route (service role) is the only caller.
REVOKE EXECUTE ON FUNCTION public.record_trivia_session_answer(uuid, uuid, uuid, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_trivia_session_answer(uuid, uuid, uuid, int) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_trivia_session_answer(uuid, uuid, uuid, int) TO service_role;

-- --- 3. POST-APPLY ASSERTIONS ------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'trivia_sessions'
          AND column_name = 'answers'
    ) THEN
        RAISE EXCEPTION 'post-apply failed: trivia_sessions.answers missing';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'record_trivia_session_answer'
    ) THEN
        RAISE EXCEPTION 'post-apply failed: record_trivia_session_answer missing';
    END IF;
END $$;

-- --- 4. SCHEMA-CACHE RELOAD (new RPC exposed through PostgREST) --------
NOTIFY pgrst, 'reload schema';

COMMIT;

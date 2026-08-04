-- ===========================================================================
-- TRIVIA SERVER-AUTHORITATIVE GRADING
-- ===========================================================================
-- WHY THIS EXISTS
--
-- Every solo trivia mode currently grades itself in the browser: the client
-- downloads trivia_questions.correct_index, counts its own correct answers,
-- computes its own diamond reward with calculateDiamonds(), and then calls
-- rpc('add_diamonds_to_balance') with an amount IT chose. Diamonds are real
-- currency in this product, so that flow is a mint button in devtools:
--
--     await supabase.rpc('add_diamonds_to_balance', { p_amount: 1000000, ... })
--
-- Tournaments already solved this (tournament-round-questions.js serves
-- questions with the answer key stripped and a server route grades them).
-- This migration is the storage + payout half of the same pattern for solo
-- play:
--
--   1. trivia_sessions records WHICH questions were served and in WHICH
--      display order, so grading never has to trust anything the client says
--      about what it was asked.
--   2. award_trivia_run() is the ONLY way a trivia run pays out. It flips the
--      session to 'submitted' with a conditional UPDATE that doubles as a
--      mutex (zero rows -> someone already claimed it), and it credits
--      diamonds through add_diamonds_to_balance with a stable reference id so
--      a retry or a double-submit can never double-pay.
--   3. EXECUTE is revoked from anon/authenticated. Only the service role (ie.
--      the API route, which computed the score itself) can call it. A browser
--      cannot invoke the payout function at all, with any arguments.
--
-- Idempotent: safe to run more than once (IF NOT EXISTS / DROP POLICY IF
-- EXISTS / CREATE OR REPLACE).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. SESSION TABLE - the server's record of what it served
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trivia_sessions (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    mode             text NOT NULL,
    -- The exact roster served. session-submit rejects any questionId that is
    -- not in here, which kills the "grade arbitrary question ids" hole.
    question_ids     uuid[] NOT NULL,
    -- { "<question_id>": [originalIndex, ...] } where the array position is
    -- the DISPLAY index the client rendered. The client sends back a display
    -- index; the server maps it home before comparing to the answer key.
    permutations     jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at       timestamptz DEFAULT now(),
    submitted_at     timestamptz,
    score            int,
    correct_count    int,
    diamonds_awarded int,
    status           text NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'submitted', 'expired'))
);

-- "my recent sessions", and the daily-cap sum for one user+mode.
CREATE INDEX IF NOT EXISTS trivia_sessions_user_created_idx
    ON public.trivia_sessions (user_id, created_at DESC);

-- Sweeping stale 'open' rows (expiry) without a full scan.
CREATE INDEX IF NOT EXISTS trivia_sessions_status_created_idx
    ON public.trivia_sessions (status, created_at);

-- ---------------------------------------------------------------------------
-- 2. RLS - readable by its owner, writable by nobody but the service role
-- ---------------------------------------------------------------------------
-- There is deliberately NO insert/update/delete policy. With RLS enabled and
-- no permissive policy, PostgREST rejects every client write. Only the
-- service-role key (which bypasses RLS) can open a session or record a
-- result, so a player cannot forge a session, extend one, re-open a submitted
-- one, or rewrite the stored permutation to make a wrong answer correct.
ALTER TABLE public.trivia_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trivia_sessions_select_own ON public.trivia_sessions;
CREATE POLICY trivia_sessions_select_own
    ON public.trivia_sessions
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. PAYOUT FUNCTION - the only path from "a run finished" to "diamonds moved"
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.award_trivia_run(
    p_session_id uuid,
    p_score      int,
    p_correct    int,
    p_total      int,
    p_diamonds   int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session public.trivia_sessions%ROWTYPE;
    v_score   int := GREATEST(0, COALESCE(p_score, 0));
    v_correct int := GREATEST(0, COALESCE(p_correct, 0));
    v_total   int := GREATEST(0, COALESCE(p_total, 0));
    v_award   int := GREATEST(0, COALESCE(p_diamonds, 0));
    v_result  jsonb;
    v_exists  boolean;
BEGIN
    IF p_session_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'missing_session_id');
    END IF;

    -- Structural sanity. The caller already computed these server-side, but a
    -- payout function that trusts its arguments blindly is one bad refactor
    -- away from being the mint button again.
    IF v_total > 0 AND v_correct > v_total THEN
        RETURN jsonb_build_object('success', false, 'error', 'correct_exceeds_total');
    END IF;

    -- Conditional UPDATE as mutex: exactly one concurrent caller can move a
    -- session out of 'open', so two parallel submits cannot both pay out.
    UPDATE public.trivia_sessions
       SET status           = 'submitted',
           submitted_at     = now(),
           score            = v_score,
           correct_count    = v_correct,
           diamonds_awarded = v_award
     WHERE id = p_session_id
       AND status = 'open'
    RETURNING * INTO v_session;

    IF NOT FOUND THEN
        SELECT EXISTS (SELECT 1 FROM public.trivia_sessions WHERE id = p_session_id)
          INTO v_exists;
        IF NOT v_exists THEN
            RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
        END IF;
        -- Already submitted or expired. Never pay twice.
        RETURN jsonb_build_object('success', false, 'error', 'already_submitted');
    END IF;

    IF v_award <= 0 THEN
        RETURN jsonb_build_object(
            'success', true,
            'session_id', p_session_id,
            'score', v_score,
            'correct_count', v_correct,
            'diamonds_awarded', 0,
            'new_balance', NULL
        );
    END IF;

    -- Stable reference id -> add_diamonds_to_balance dedups on it, so even a
    -- crash between the status flip and the credit cannot double-pay on retry.
    -- Named-argument notation so this keeps working if the RPC's parameter
    -- ORDER ever changes.
    --
    -- No EXCEPTION handler on purpose: if the credit raises, the whole
    -- function (including the status flip above) rolls back and the session
    -- stays 'open' so the run can be retried cleanly.
    SELECT public.add_diamonds_to_balance(
        p_user_id      => v_session.user_id,
        p_amount       => v_award,
        p_type         => 'trivia_run',
        p_description  => 'Trivia run reward (' || COALESCE(v_session.mode, 'unknown') || ')',
        p_reference_id => 'trivia_session_' || p_session_id::text
    ) INTO v_result;

    RETURN jsonb_build_object(
        'success', true,
        'session_id', p_session_id,
        'score', v_score,
        'correct_count', v_correct,
        'diamonds_awarded', v_award,
        -- The RPC answers success:false when it dedups an already-applied
        -- reference id. That is the desired outcome on a retry, not a failure.
        'deduped', COALESCE((v_result->>'success')::boolean, true) = false,
        'new_balance', (v_result->>'new_balance')
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. GRANTS - service role only
-- ---------------------------------------------------------------------------
-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, which would hand every
-- logged-in browser a payout function. Revoke it everywhere, then hand it back
-- to the service role alone. The API route is the only caller, and it is the
-- one that computed the score.
REVOKE EXECUTE ON FUNCTION public.award_trivia_run(uuid, int, int, int, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.award_trivia_run(uuid, int, int, int, int) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_trivia_run(uuid, int, int, int, int) TO service_role;

COMMENT ON TABLE public.trivia_sessions IS
    'Server-side record of a solo trivia run: which questions were served and in which display order. Written only by the service role.';
COMMENT ON FUNCTION public.award_trivia_run(uuid, int, int, int, int) IS
    'Atomically closes an open trivia session and credits diamonds via add_diamonds_to_balance with an idempotent reference id. Service role only.';

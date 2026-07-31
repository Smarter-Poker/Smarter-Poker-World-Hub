-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 80.5 — RLS HARDENING: LEADERBOARDS, STREAKS, ANSWER KEY
-- Date: 2026-07-26
--
-- ── 1. ANYONE COULD WRITE THE PUBLIC LEADERBOARD ───────────────────────────
-- archive/20260124_trivia_system_v2.sql:140 declares
--     CREATE POLICY "Users can insert their own scores" ON trivia_scores
--         FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
-- and line 167 grants INSERT to anon. The `OR user_id IS NULL` branch means an
-- UNAUTHENTICATED visitor could POST unlimited rows with any username and any
-- score straight into the table that feeds every public board
-- (daily.js:583, leaderboard.js, [mode].js). Fixed below; no shipped code
-- inserts a NULL user_id (verified across every mode's save path).
--
-- ── 2. SELF-SERVING STREAK LEADERBOARD ─────────────────────────────────────
-- "Users can manage their own streaks" is FOR ALL, so current_streak and
-- best_streak were writable to any value from the console — and
-- 20260317_fix_trivia_streaks_rls_leaderboard.sql made streaks publicly
-- readable so [mode].js:383 could rank the top ten by them. Writes now go
-- through update_trivia_streak(), which already existed as a SECURITY DEFINER
-- RPC and was called by nothing. It is hardened here (caller identity enforced,
-- row locked, insert race closed) and the client write policy is dropped.
--
-- ── 3. THE ANSWER KEY IS WORLD-READABLE ────────────────────────────────────
-- trivia_questions has SELECT USING (true) granted to anon, and every gameplay
-- page selects correct_index + explanation and grades in the browser. This
-- migration ships the replacement primitives — a key-free view and a
-- SECURITY DEFINER grading RPC — but does NOT yet revoke the columns, because
-- doing so before the pages migrate would break every solo mode at once.
-- The revoke is written out at the bottom of this file, commented, with the
-- exact list of call sites that must move first.
--
-- ⚠ CROSS-FILE FOLLOW-UP (see the fixer report):
--    pages/hub/trivia/[mode].js:845 must replace its raw
--    supabase.from('trivia_streaks').upsert({...}) with
--    supabase.rpc('update_trivia_streak', { p_user_id, p_score,
--    p_correct_count, p_xp_earned }). Until it does, streak writes fail
--    (logged, non-fatal) — note that that upsert is ALREADY broken: it omits
--    onConflict, so PostgREST targets the primary key `id`, which the payload
--    does not supply, and the write collides with the user_id UNIQUE index.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. trivia_scores — authenticated, owner-bound inserts only
-- ───────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can insert their own scores" ON public.trivia_scores;
CREATE POLICY "Users can insert their own scores"
    ON public.trivia_scores FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage scores" ON public.trivia_scores;
CREATE POLICY "Service role can manage scores"
    ON public.trivia_scores FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- anon keeps SELECT (the boards are public) but loses the ability to write.
REVOKE INSERT, UPDATE, DELETE ON public.trivia_scores FROM anon;
GRANT SELECT ON public.trivia_scores TO anon;
GRANT SELECT, INSERT ON public.trivia_scores TO authenticated;

-- Cheap plausibility bounds. Scores are still client-computed (the real fix is
-- routing every mode through /api/trivia/submit), but these stop the absurd
-- forgeries — a 2-billion-point daily run — from ever reaching a board.
-- NOT VALID so an existing row cannot abort the migration.
ALTER TABLE public.trivia_scores DROP CONSTRAINT IF EXISTS trivia_scores_plausibility_check;
ALTER TABLE public.trivia_scores
    ADD CONSTRAINT trivia_scores_plausibility_check CHECK (
        score            BETWEEN 0 AND 10000000
        AND correct_count    >= 0
        AND total_questions  BETWEEN 0 AND 5000
        AND COALESCE(xp_earned, 0)       BETWEEN 0 AND 1000000
        AND COALESCE(diamonds_earned, 0) BETWEEN 0 AND 100000
        AND COALESCE(time_spent, 0)      BETWEEN 0 AND 86400
    ) NOT VALID;
DO $$
BEGIN
    ALTER TABLE public.trivia_scores VALIDATE CONSTRAINT trivia_scores_plausibility_check;
EXCEPTION WHEN check_violation THEN
    RAISE WARNING 'trivia_scores contains implausible rows; constraint left NOT VALID '
                  '(it still applies to every NEW row). Inspect with: '
                  'SELECT * FROM trivia_scores WHERE score > 10000000 OR diamonds_earned > 100000;';
END $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 2. trivia_streaks — server-authoritative, race-free
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_trivia_streak(
    p_user_id       uuid,
    p_score         integer,
    p_correct_count integer,
    p_xp_earned     integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user       uuid;
    v_last_date  date;
    v_streak     integer;
    v_best       integer;
    v_today      date := CURRENT_DATE;
    v_correct    integer := GREATEST(COALESCE(p_correct_count, 0), 0);
    v_xp         integer := GREATEST(COALESCE(p_xp_earned, 0), 0);
BEGIN
    -- A client may only advance ITS OWN streak. The old signature took an
    -- arbitrary p_user_id and was GRANTed to authenticated.
    IF (SELECT auth.role()) = 'service_role' THEN
        v_user := COALESCE(p_user_id, (SELECT auth.uid()));
    ELSE
        v_user := (SELECT auth.uid());
    END IF;
    IF v_user IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
    END IF;

    -- Lock the row: two tabs finishing at once used to interleave a
    -- read-modify-write and lose one game's totals.
    SELECT s.last_play_date, s.current_streak, s.best_streak
      INTO v_last_date, v_streak, v_best
      FROM public.trivia_streaks s
     WHERE s.user_id = v_user
       FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.trivia_streaks (
            user_id, current_streak, best_streak, last_play_date,
            total_games_played, total_correct, total_xp_earned, updated_at
        )
        VALUES (v_user, 1, 1, v_today, 1, v_correct, v_xp, now())
        -- Closes the insert race between two simultaneous first games.
        ON CONFLICT (user_id) DO UPDATE SET
            total_games_played = public.trivia_streaks.total_games_played + 1,
            total_correct      = public.trivia_streaks.total_correct + v_correct,
            total_xp_earned    = public.trivia_streaks.total_xp_earned + v_xp,
            updated_at         = now()
        RETURNING current_streak, best_streak INTO v_streak, v_best;

        RETURN jsonb_build_object(
            'success', true, 'current_streak', COALESCE(v_streak, 1),
            'best_streak', COALESCE(v_best, 1), 'xp_earned', v_xp
        );
    END IF;

    v_streak := COALESCE(v_streak, 0);
    IF v_last_date = v_today - 1 THEN
        v_streak := v_streak + 1;          -- consecutive day
    ELSIF v_last_date IS NULL OR v_last_date < v_today - 1 THEN
        v_streak := 1;                     -- streak broken (or first play)
    END IF;
    -- v_last_date = v_today: already played today, streak unchanged.

    UPDATE public.trivia_streaks SET
        current_streak     = v_streak,
        best_streak        = GREATEST(COALESCE(best_streak, 0), v_streak),
        last_play_date     = v_today,
        total_games_played = COALESCE(total_games_played, 0) + 1,
        total_correct      = COALESCE(total_correct, 0) + v_correct,
        total_xp_earned    = COALESCE(total_xp_earned, 0) + v_xp,
        updated_at         = now()
    WHERE user_id = v_user
    RETURNING best_streak INTO v_best;

    RETURN jsonb_build_object(
        'success', true, 'current_streak', v_streak,
        'best_streak', v_best, 'xp_earned', v_xp
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_trivia_streak(uuid, integer, integer, integer) FROM public;
GRANT  EXECUTE ON FUNCTION public.update_trivia_streak(uuid, integer, integer, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.update_trivia_streak(uuid, integer, integer, integer) IS
    'Phase 80 — the ONLY supported way to advance a trivia streak. Enforces '
    'caller identity, locks the row, and closes the first-play insert race. '
    'Call from pages/hub/trivia/[mode].js instead of upserting trivia_streaks.';

-- Drop the client write path the RPC replaces.
DROP POLICY IF EXISTS "Users can manage their own streaks" ON public.trivia_streaks;
DROP POLICY IF EXISTS "Service role can manage streaks"    ON public.trivia_streaks;
CREATE POLICY "Service role can manage streaks"
    ON public.trivia_streaks FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

REVOKE INSERT, UPDATE, DELETE ON public.trivia_streaks FROM anon, authenticated;
GRANT SELECT ON public.trivia_streaks TO anon, authenticated;

-- The streak leaderboard ([mode].js:383 ranks the top ten) had no supporting
-- index and sorted the whole table on every load.
CREATE INDEX IF NOT EXISTS idx_trivia_streaks_current
    ON public.trivia_streaks (current_streak DESC);
CREATE INDEX IF NOT EXISTS idx_trivia_streaks_best
    ON public.trivia_streaks (best_streak DESC);


-- ───────────────────────────────────────────────────────────────────────────
-- 2b. trivia_tournament_entries — A PLAYER COULD SET THEIR OWN PRIZE
-- ───────────────────────────────────────────────────────────────────────────
-- archive/20260202_trivia_87x_enhancement.sql:116 (and the phase2 twin at :167)
-- declare
--     CREATE POLICY "Users can update own entries" ON trivia_tournament_entries
--         FOR UPDATE USING (auth.uid() = user_id);
-- with no WITH CHECK and no column restriction. `score`, `rank`, `payout`,
-- `correct_count` and `eliminated_round` all live on that row, and BOTH payout
-- rankers sort on them:
--     pages/api/trivia/tournament-lifecycle.js computeStandings()  -> score DESC
--     public.fn_trivia_tournament_payout()                          -> score DESC
-- So one line in the browser console —
--     supabase.from('trivia_tournament_entries')
--             .update({ score: 999999, eliminated_round: null }).eq('id', myEntryId)
-- — took the entire prize pool of a stake-bearing tournament. The 87x INSERT
-- policy is the same story: a client could mint an entry row without paying the
-- fee /api/trivia/tournament-enter charges.
--
-- Every legitimate write to this table is server-side and holds the service-role
-- key (tournament-enter.js, tournament-lifecycle.js, tournament-submit-round.js).
-- Verified: no file under pages/hub or src/components writes it — the only
-- client references are the two SELECTs in pages/hub/trivia/tournaments.js.
-- SELECT stays open so the lobby can render the field.

DROP POLICY IF EXISTS "Users can enter tournaments"   ON public.trivia_tournament_entries;
DROP POLICY IF EXISTS "Users can update own entries"  ON public.trivia_tournament_entries;
DROP POLICY IF EXISTS "Users can delete own entries"  ON public.trivia_tournament_entries;
DROP POLICY IF EXISTS "Service role manages tournament entries" ON public.trivia_tournament_entries;
CREATE POLICY "Service role manages tournament entries"
    ON public.trivia_tournament_entries FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

REVOKE INSERT, UPDATE, DELETE ON public.trivia_tournament_entries FROM anon, authenticated;
GRANT SELECT ON public.trivia_tournament_entries TO anon, authenticated;

COMMENT ON TABLE public.trivia_tournament_entries IS
    'Tournament entrants. WRITES ARE SERVICE-ROLE ONLY (phase 80): the archive '
    'policy "Users can update own entries" let a player set their own score, '
    'rank and payout, and both prize rankers sort on score. Entry creation goes '
    'through POST /api/trivia/tournament-enter, which charges the fee first.';


-- ───────────────────────────────────────────────────────────────────────────
-- 3. daily_trivia_plays — FK index + service-role write path
-- ───────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_daily_trivia_plays_question
    ON public.daily_trivia_plays (trivia_question_id)
    WHERE trivia_question_id IS NOT NULL;


-- ───────────────────────────────────────────────────────────────────────────
-- 4. ANSWER-KEY CONTAINMENT — the primitives, ready for the client migration
-- ───────────────────────────────────────────────────────────────────────────

-- 4a. A key-free projection of the pool. Identical to POOL_COLUMNS_NO_ANSWER in
--     src/lib/triviaQuestionLoader.js, so a page can switch to it by changing
--     only the .from() target.
CREATE OR REPLACE VIEW public.trivia_questions_public
WITH (security_invoker = true) AS
SELECT q.id,
       q.category,
       q.subcategory,
       q.difficulty,
       q.question,
       q.options,
       q.quality_score,
       q.theme,
       q.daily_date,
       q.order_index
  FROM public.trivia_questions q;

GRANT SELECT ON public.trivia_questions_public TO anon, authenticated;

COMMENT ON VIEW public.trivia_questions_public IS
    'Phase 80 — trivia_questions WITHOUT correct_index or explanation. '
    'security_invoker = true so the base table''s RLS still applies. Target for '
    'gameplay pages once they stop grading client-side.';

-- 4b. Grade one answer server-side: COMMIT, THEN REVEAL.
--
--     The reveal is gated on an answer actually having been committed. An
--     earlier draft of this function returned correct_index unconditionally for
--     any question id, which meant a client could dump the whole answer key with
--     a loop of `rpc('fn_trivia_grade_answer', { p_question_id: id,
--     p_selected: null })` — i.e. the "containment primitive" contained nothing,
--     and applying the 4c revoke below would have been purely cosmetic. Now:
--       * p_selected must be a real in-range choice (NULL/out-of-range is a
--         probe, and is refused without disclosing anything);
--       * the reveal is RECORDED in trivia_user_question_history, so the
--         question is burned out of that player's own 60-day pool whether they
--         were right or wrong, and every disclosure is attributable.
--     This bounds the leak rather than eliminating it: a determined client can
--     still walk the pool one commitment at a time, at the cost of exhausting
--     its own no-repeat window and leaving a complete audit trail. Eliminating
--     it entirely needs a per-session server-issued question token, which is a
--     product change, not an RLS change. Do NOT describe this as airtight.
--     VOLATILE (not STABLE) because it writes that commitment row.
CREATE OR REPLACE FUNCTION public.fn_trivia_grade_answer(
    p_question_id uuid,
    p_selected    integer
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user      uuid := (SELECT auth.uid());
    v_service   boolean := ((SELECT auth.role()) = 'service_role');
    v_correct   integer;
    v_expl      text;
    v_opts      integer;
BEGIN
    IF v_user IS NULL AND NOT v_service THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
    END IF;

    SELECT q.correct_index,
           q.explanation,
           CASE WHEN jsonb_typeof(q.options) = 'array' THEN jsonb_array_length(q.options) ELSE 0 END
      INTO v_correct, v_expl, v_opts
      FROM public.trivia_questions q
     WHERE q.id = p_question_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'question_not_found');
    END IF;

    -- No commitment, no reveal.
    IF p_selected IS NULL OR p_selected < 0 OR (v_opts > 0 AND p_selected >= v_opts) THEN
        RETURN jsonb_build_object('success', false, 'error', 'answer_required');
    END IF;

    IF v_user IS NOT NULL THEN
        -- FIRST answer wins: ON CONFLICT DO NOTHING leaves an existing
        -- commitment (and its was_correct verdict) untouched, so a second call
        -- cannot rewrite history to claim a question was answered correctly.
        INSERT INTO public.trivia_user_question_history (user_id, question_id, was_correct, seen_at)
        VALUES (v_user, p_question_id, (p_selected = v_correct), now())
        ON CONFLICT (user_id, question_id) DO NOTHING;
    END IF;

    RETURN jsonb_build_object(
        'success',       true,
        'was_correct',   (p_selected = v_correct),
        'correct_index', v_correct,
        'explanation',   v_expl
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_trivia_grade_answer(uuid, integer) FROM public;
GRANT  EXECUTE ON FUNCTION public.fn_trivia_grade_answer(uuid, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_trivia_grade_answer(uuid, integer) IS
    'Phase 80 — server-side grading for a single question. Pair with '
    'trivia_questions_public: fetch questions without the key, submit the '
    'chosen index, receive was_correct + explanation.';

-- 4c. ⚠ NOT EXECUTED — THE ACTUAL COLUMN LOCKDOWN.
--     Uncomment and apply ONLY after every one of these call sites has moved to
--     trivia_questions_public + fn_trivia_grade_answer, because PostgreSQL
--     requires SELECT on ALL columns for `SELECT *` and each of these grades in
--     the browser today:
--         pages/hub/trivia/[mode].js:270          pages/hub/trivia/endless.js
--         pages/hub/trivia/survival-game.js:366   pages/hub/trivia/mixed.js
--         pages/hub/trivia/time-attack.js         pages/hub/trivia/pvp.js
--         src/components/trivia/StrategyTrivia.jsx:309
--         pages/api/trivia/daily.js  (serves PUBLIC_QUESTION_COLUMNS to the client)
--     Server routes are unaffected: they all use the service-role key.
--
--   REVOKE SELECT ON public.trivia_questions FROM anon, authenticated;
--   GRANT  SELECT (id, category, subcategory, difficulty, question, options,
--                  quality_score, theme, daily_date, order_index)
--       ON public.trivia_questions TO anon, authenticated;

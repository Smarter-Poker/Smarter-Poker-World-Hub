-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 80.1 — THE 60-DAY NO-REPEAT GUARANTEE
-- Date: 2026-07-26
--
-- WHAT THIS FIXES
--   1. trivia_user_question_history had SELECT + INSERT RLS policies but NO
--      UPDATE policy (archive/20260202_trivia_87x_enhancement.sql:243). Every
--      game mode records history with
--        .upsert(rows, { onConflict: 'user_id,question_id' })
--      which is INSERT ... ON CONFLICT DO UPDATE. The moment ONE row in a batch
--      collided with an existing (user_id, question_id) pair, RLS denied the
--      UPDATE and the WHOLE statement failed — so an entire session recorded no
--      history at all. seen_at never refreshed, the dedup record stopped
--      growing, and the 60-day guarantee collapsed.
--        -> "Users can update own history" policy added below.
--
--   2. update_question_usage() (archive/20260202_trivia_question_pool.sql:20)
--      was plain LANGUAGE plpgsql, NOT SECURITY DEFINER. It fires on a CLIENT
--      insert into trivia_user_question_history and UPDATEs trivia_questions —
--      a table with no UPDATE policy for authenticated. Under the caller's RLS
--      the UPDATE matched 0 rows and silently no-opped, so last_used_at and
--      use_count were never maintained for real gameplay and
--      trivia_question_pool_stats has been reporting fiction.
--        -> Recreated SECURITY DEFINER. It now also maintains times_shown /
--           times_correct, which had NO writer anywhere in the codebase and
--           left trivia_question_player_stats (phase 54) permanently NULL.
--        -> A matching AFTER UPDATE trigger was added: with ON CONFLICT DO
--           UPDATE the row action is an UPDATE, so the AFTER INSERT trigger
--           never fired for a re-seen question.
--
--   3. src/lib/triviaQuestionLoader.js downloads the user's ENTIRE 60-day
--      history (up to 12,000 ids, paged 1,000 at a time) on every question
--      fetch, then filters client-side. get_unseen_questions() below does the
--      anti-join server-side in one indexed round trip. The loader already
--      prefers this RPC (loadQuestionsForUser step 1) and falls back silently
--      when it is absent, so applying this migration is a pure speed-up.
--
--   4. Indexes for the hot selection + leaderboard queries.
--
-- SAFE TO RE-RUN. No manual step required.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. trivia_user_question_history — make the WRITE path work
-- ───────────────────────────────────────────────────────────────────────────

-- The upsert's ON CONFLICT target is (user_id, question_id). 87x declared it,
-- but assert it here so a hand-built environment cannot silently lack it (in
-- which case PostgREST rejects the upsert with 42P10 "no unique constraint").
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'public.trivia_user_question_history'::regclass
           AND contype  = 'u'
           AND conkey   = ARRAY[
                 (SELECT attnum FROM pg_attribute
                   WHERE attrelid = 'public.trivia_user_question_history'::regclass
                     AND attname  = 'user_id'),
                 (SELECT attnum FROM pg_attribute
                   WHERE attrelid = 'public.trivia_user_question_history'::regclass
                     AND attname  = 'question_id')
               ]::smallint[]
    ) THEN
        BEGIN
            ALTER TABLE public.trivia_user_question_history
                ADD CONSTRAINT trivia_user_question_history_user_id_question_id_key
                UNIQUE (user_id, question_id);
        EXCEPTION
            WHEN duplicate_table OR duplicate_object THEN
                RAISE NOTICE 'unique(user_id,question_id) already present under another name';
            WHEN unique_violation THEN
                RAISE WARNING 'DUPLICATE (user_id, question_id) ROWS EXIST — dedup them, then re-run this migration';
        END;
    END IF;
END $$;

-- THE FIX: without this the upsert dies on the first collision and the whole
-- batch (an entire game session) is lost.
DROP POLICY IF EXISTS "Users can update own history" ON public.trivia_user_question_history;
CREATE POLICY "Users can update own history"
    ON public.trivia_user_question_history FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages question history" ON public.trivia_user_question_history;
CREATE POLICY "Service role manages question history"
    ON public.trivia_user_question_history FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

GRANT SELECT, INSERT, UPDATE ON public.trivia_user_question_history TO authenticated;

-- "seen ids for this user in the last 60 days", fast at scale.
-- INCLUDE (question_id) makes it an index-ONLY scan: the loader selects nothing
-- else, so the heap is never touched.
CREATE INDEX IF NOT EXISTS idx_trivia_uqh_user_seen_at
    ON public.trivia_user_question_history (user_id, seen_at DESC)
    INCLUDE (question_id);

-- Supports the get_unseen_questions anti-join from the questions side and any
-- "who has seen this question" analytics. question_id has no FK (87x never
-- declared one), so nothing else indexes it.
CREATE INDEX IF NOT EXISTS idx_trivia_uqh_question
    ON public.trivia_user_question_history (question_id);

COMMENT ON TABLE public.trivia_user_question_history IS
    'Per-player question exposure log backing the 60-day no-repeat guarantee. '
    'UNIQUE(user_id, question_id): a re-seen question UPDATEs seen_at rather '
    'than inserting a second row, so row count == distinct questions ever seen.';


-- ───────────────────────────────────────────────────────────────────────────
-- 2. update_question_usage() — SECURITY DEFINER + real player statistics
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_question_usage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.trivia_questions
       SET last_used_at  = GREATEST(COALESCE(last_used_at, NEW.seen_at), NEW.seen_at),
           use_count     = COALESCE(use_count, 0) + 1,
           times_shown   = COALESCE(times_shown, 0) + 1,
           times_correct = COALESCE(times_correct, 0)
                           + CASE WHEN NEW.was_correct IS TRUE THEN 1 ELSE 0 END
     WHERE id = NEW.question_id;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_question_usage() IS
    'Phase 80 — maintains trivia_questions.last_used_at/use_count/times_shown/'
    'times_correct from trivia_user_question_history writes. SECURITY DEFINER '
    'because it fires on CLIENT inserts and trivia_questions has no UPDATE '
    'policy for authenticated (the previous non-DEFINER version silently '
    'updated 0 rows for every real game ever played).';

DROP TRIGGER IF EXISTS trigger_update_question_usage ON public.trivia_user_question_history;
CREATE TRIGGER trigger_update_question_usage
    AFTER INSERT ON public.trivia_user_question_history
    FOR EACH ROW
    EXECUTE FUNCTION public.update_question_usage();

-- ON CONFLICT DO UPDATE performs an UPDATE, not an INSERT, so the AFTER INSERT
-- trigger above never fires for a question the player has seen before. Without
-- this second trigger every replay was invisible to the usage counters.
DROP TRIGGER IF EXISTS trigger_update_question_usage_upd ON public.trivia_user_question_history;
CREATE TRIGGER trigger_update_question_usage_upd
    AFTER UPDATE ON public.trivia_user_question_history
    FOR EACH ROW
    WHEN (NEW.seen_at IS DISTINCT FROM OLD.seen_at)
    EXECUTE FUNCTION public.update_question_usage();


-- ───────────────────────────────────────────────────────────────────────────
-- 3. get_unseen_questions() — the server-side 60-day anti-join
-- ───────────────────────────────────────────────────────────────────────────
--
-- Called by src/lib/triviaQuestionLoader.js loadQuestionsForUser() as:
--     supabase.rpc('get_unseen_questions', {
--         p_user: userId,
--         p_categories: string[] | null,
--         p_count: number
--     })
-- and the returned rows are used AS question objects, so the column list must
-- match POOL_COLUMNS in that file exactly:
--     id, category, difficulty, question, options, correct_index,
--     explanation, quality_score
-- The extra parameters all have defaults, which keeps the 3-argument PostgREST
-- call resolvable while letting server routes ask for more.
--
-- Ordering contract (mirrors filterAndShuffle's degradation ladder):
--     tier 1  unseen inside the window   — randomised
--     tier 2  seen inside the window     — OLDEST-SEEN FIRST
-- so a thin pool replays what the player saw eight weeks ago, never yesterday.

DROP FUNCTION IF EXISTS public.get_unseen_questions(uuid, text[], integer);
DROP FUNCTION IF EXISTS public.get_unseen_questions(uuid, text[], integer, text[], integer, integer);

CREATE OR REPLACE FUNCTION public.get_unseen_questions(
    p_user         uuid,
    p_categories   text[]  DEFAULT NULL,
    p_count        integer DEFAULT 20,
    p_difficulties text[]  DEFAULT NULL,
    p_min_quality  integer DEFAULT 6,
    p_window_days  integer DEFAULT 60
)
RETURNS TABLE (
    id            uuid,
    category      text,
    difficulty    text,
    question      text,
    options       jsonb,
    correct_index integer,
    explanation   text,
    quality_score integer
)
LANGUAGE plpgsql
-- VOLATILE (the default), NOT stable: the ORDER BY random() tie-break makes
-- this genuinely non-deterministic. Marking it STABLE let the planner hoist it
-- into an InitPlan and reuse ONE result for a whole query — five calls returned
-- the identical roster. supabase-js .rpc() POSTs, so volatility costs nothing.
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user    uuid;
    v_count   integer := LEAST(GREATEST(COALESCE(p_count, 20), 1), 500);
    v_quality integer := COALESCE(p_min_quality, 6);
    v_days    integer := LEAST(GREATEST(COALESCE(p_window_days, 60), 1), 365);
    v_role    text    := (SELECT auth.role());
BEGIN
    -- A client may only ask about ITSELF. Passing someone else's uuid would not
    -- leak private data (the result is just questions) but it would let a
    -- cheater probe another player's exposure set.
    IF v_role IS DISTINCT FROM 'service_role' AND (SELECT auth.uid()) IS NOT NULL THEN
        v_user := (SELECT auth.uid());
    ELSE
        v_user := p_user;
    END IF;

    RETURN QUERY
    WITH seen AS (
        SELECT h.question_id, MAX(h.seen_at) AS last_seen
          FROM public.trivia_user_question_history h
         WHERE h.user_id = v_user
           AND h.seen_at >= (now() - make_interval(days => v_days))
         GROUP BY h.question_id
    )
    SELECT q.id,
           q.category,
           q.difficulty,
           q.question,
           q.options,
           q.correct_index,
           q.explanation,
           q.quality_score
      FROM public.trivia_questions q
      LEFT JOIN seen s ON s.question_id = q.id
     WHERE COALESCE(q.quality_score, 0) >= v_quality
       AND (p_categories IS NULL
            OR array_length(p_categories, 1) IS NULL
            OR q.category = ANY (p_categories))
       AND (p_difficulties IS NULL
            OR array_length(p_difficulties, 1) IS NULL
            OR q.difficulty = ANY (p_difficulties))
     ORDER BY (s.question_id IS NOT NULL),   -- false (unseen) sorts first
              s.last_seen ASC NULLS FIRST,   -- then oldest-seen
              random()                       -- randomise inside each tier
     LIMIT v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_unseen_questions(uuid, text[], integer, text[], integer, integer) FROM public;
GRANT  EXECUTE ON FUNCTION public.get_unseen_questions(uuid, text[], integer, text[], integer, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_unseen_questions(uuid, text[], integer, text[], integer, integer) IS
    'Phase 80 — server-side 60-day no-repeat selection. Returns questions above '
    'the gameplay quality floor, unseen-first then oldest-seen, randomised '
    'within each tier. Replaces downloading up to 12,000 history ids per fetch. '
    'Column list must stay in sync with POOL_COLUMNS in src/lib/triviaQuestionLoader.js.';

-- Supports the anti-join''s outer scan: the quality floor plus the category /
-- difficulty predicates the loader always sends.
CREATE INDEX IF NOT EXISTS idx_trivia_questions_selection
    ON public.trivia_questions (category, difficulty, quality_score);

-- "everything above the floor" — used when no category filter is supplied
-- (mixed / endless / survival all call with p_categories = NULL).
CREATE INDEX IF NOT EXISTS idx_trivia_questions_quality_floor
    ON public.trivia_questions (quality_score)
    WHERE quality_score >= 6;


-- ───────────────────────────────────────────────────────────────────────────
-- 4. Leaderboard + hot-path indexes on trivia_scores
-- ───────────────────────────────────────────────────────────────────────────

-- All-time leaderboards (pages/hub/trivia/leaderboard.js, achievements.js).
CREATE INDEX IF NOT EXISTS idx_trivia_scores_score
    ON public.trivia_scores (score DESC);

-- "recent days, best first" — the shape used by every date-scoped board.
CREATE INDEX IF NOT EXISTS idx_trivia_scores_playdate_score
    ON public.trivia_scores (play_date DESC, score DESC);

-- pages/api/trivia/daily.js: user's own best daily row for `today`.
CREATE INDEX IF NOT EXISTS idx_trivia_scores_user_playdate
    ON public.trivia_scores (user_id, play_date DESC);

-- FK index that was never created — DELETE FROM auth.users had to seq-scan.
CREATE INDEX IF NOT EXISTS idx_trivia_scores_username
    ON public.trivia_scores (username)
    WHERE username IS NOT NULL;


-- ───────────────────────────────────────────────────────────────────────────
-- 5. One daily score row per player per day (server-enforced)
-- ───────────────────────────────────────────────────────────────────────────
-- Today only a client-side savePhaseRef guards this, and the daily leaderboard
-- aggregates raw rows — so a retry or a second tab double-counts. Wrapped in an
-- exception handler because an environment that already has duplicates must not
-- have the whole migration abort; the warning tells the operator to clean up.

DO $$
BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_trivia_scores_daily_once
        ON public.trivia_scores (user_id, play_date)
        WHERE mode = 'daily' AND user_id IS NOT NULL;
EXCEPTION
    WHEN unique_violation THEN
        RAISE WARNING
            'idx_trivia_scores_daily_once NOT created — duplicate daily rows exist. '
            'Clean up with: DELETE FROM trivia_scores a USING trivia_scores b '
            'WHERE a.mode = ''daily'' AND b.mode = ''daily'' AND a.user_id = b.user_id '
            'AND a.play_date = b.play_date AND a.score < b.score; then re-run.';
END $$;

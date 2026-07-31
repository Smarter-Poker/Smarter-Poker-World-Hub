-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 80.2 — TABLES THE APP WRITES TO THAT NO MIGRATION EVER CREATED
-- Date: 2026-07-26
--
-- Two tables are read and upserted by shipped gameplay code but exist in no
-- migration in this repository. Both call sites were downgraded to
-- console.warn (see the "created by no migration in this repo" comments in
-- endless.js:737 and survival-game.js:845) precisely because the writes were
-- failing, so today they simply lose data silently:
--
--   endless_high_scores   pages/hub/trivia/endless.js
--                           :189  select high_score  where user_id, mode='random'
--                           :235  realtime subscription on the table
--                           :747  upsert { user_id, mode, high_score, achieved_at }
--                                 with onConflict: 'user_id,mode'
--
--   survival_progress     pages/hub/trivia/survival-game.js
--                           :322  select highest_level, last_played  where user_id
--                           :839  upsert { user_id, highest_level, last_played }
--                                 with onConflict: 'user_id'
--
-- Column names, the mode discriminator and both ON CONFLICT targets below are
-- taken verbatim from those call sites.
--
-- SAFE TO RE-RUN. No manual step required.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- endless_high_scores — one best run per (player, endless variant)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.endless_high_scores (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- 'random' is the only variant endless.js ships today; the column exists so
    -- category-locked endless runs get their own board without a schema change.
    mode        text NOT NULL DEFAULT 'random',
    high_score  integer NOT NULL DEFAULT 0 CHECK (high_score >= 0),
    achieved_at timestamptz NOT NULL DEFAULT now(),
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT endless_high_scores_user_mode_key UNIQUE (user_id, mode)
);

-- The upsert's ON CONFLICT target. Assert it separately so a table that was
-- hand-created without the constraint is repaired rather than skipped.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.endless_high_scores'::regclass
           AND contype = 'u'
           AND pg_get_constraintdef(oid) = 'UNIQUE (user_id, mode)'
    ) THEN
        ALTER TABLE public.endless_high_scores
            ADD CONSTRAINT endless_high_scores_user_mode_key UNIQUE (user_id, mode);
    END IF;
EXCEPTION
    WHEN duplicate_table OR duplicate_object THEN NULL;
    WHEN unique_violation THEN
        RAISE WARNING 'endless_high_scores has duplicate (user_id, mode) rows — dedup then re-run';
END $$;

CREATE INDEX IF NOT EXISTS idx_endless_high_scores_board
    ON public.endless_high_scores (mode, high_score DESC);

ALTER TABLE public.endless_high_scores ENABLE ROW LEVEL SECURITY;

-- Public read: this is a leaderboard, and endless.js renders other players'
-- bests. Writes are owner-only.
DROP POLICY IF EXISTS "Endless high scores are viewable by all" ON public.endless_high_scores;
CREATE POLICY "Endless high scores are viewable by all"
    ON public.endless_high_scores FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert own endless high score" ON public.endless_high_scores;
CREATE POLICY "Users can insert own endless high score"
    ON public.endless_high_scores FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Required for the upsert: ON CONFLICT DO UPDATE is denied without it, which is
-- the exact failure mode that broke trivia_user_question_history for months.
DROP POLICY IF EXISTS "Users can update own endless high score" ON public.endless_high_scores;
CREATE POLICY "Users can update own endless high score"
    ON public.endless_high_scores FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages endless high scores" ON public.endless_high_scores;
CREATE POLICY "Service role manages endless high scores"
    ON public.endless_high_scores FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

GRANT SELECT ON public.endless_high_scores TO anon;
GRANT SELECT, INSERT, UPDATE ON public.endless_high_scores TO authenticated;

-- endless.js:235 subscribes to postgres_changes on this table. Realtime needs
-- full row images to deliver a useful payload for UPDATEs.
ALTER TABLE public.endless_high_scores REPLICA IDENTITY FULL;

COMMENT ON TABLE public.endless_high_scores IS
    'Phase 80 — best endless-mode streak per (user, variant). Written by '
    'pages/hub/trivia/endless.js with onConflict user_id,mode.';


-- ───────────────────────────────────────────────────────────────────────────
-- survival_progress — furthest survival level reached
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.survival_progress (
    -- user_id is the PRIMARY KEY, which is also the upsert's ON CONFLICT target
    -- (survival-game.js:844 passes onConflict: 'user_id').
    user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    highest_level integer NOT NULL DEFAULT 0 CHECK (highest_level >= 0),
    last_played   timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_survival_progress_level
    ON public.survival_progress (highest_level DESC);

ALTER TABLE public.survival_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Survival progress is viewable by all" ON public.survival_progress;
CREATE POLICY "Survival progress is viewable by all"
    ON public.survival_progress FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert own survival progress" ON public.survival_progress;
CREATE POLICY "Users can insert own survival progress"
    ON public.survival_progress FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own survival progress" ON public.survival_progress;
CREATE POLICY "Users can update own survival progress"
    ON public.survival_progress FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages survival progress" ON public.survival_progress;
CREATE POLICY "Service role manages survival progress"
    ON public.survival_progress FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

GRANT SELECT ON public.survival_progress TO anon;
GRANT SELECT, INSERT, UPDATE ON public.survival_progress TO authenticated;

-- The client sends highest_level = MAX(level, cached highest). A stale tab
-- could therefore send a LOWER value and erase real progress; clamp it here so
-- the row is monotonic regardless of what any client posts.
CREATE OR REPLACE FUNCTION public.fn_survival_progress_monotonic()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    NEW.highest_level := GREATEST(COALESCE(NEW.highest_level, 0), COALESCE(OLD.highest_level, 0));
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_survival_progress_monotonic ON public.survival_progress;
CREATE TRIGGER trg_survival_progress_monotonic
    BEFORE UPDATE ON public.survival_progress
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_survival_progress_monotonic();

COMMENT ON TABLE public.survival_progress IS
    'Phase 80 — furthest survival level reached per player. Written by '
    'pages/hub/trivia/survival-game.js with onConflict user_id. highest_level '
    'is clamped monotonic by trigger so a stale tab cannot roll it back.';

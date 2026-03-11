-- ================================================================
-- MIGRATION: diamond_arena_events table for arcade game sessions
-- Tracks game starts, completions, wins, losses for analytics + audit
-- Date: 2026-03-08
-- ================================================================

CREATE TABLE IF NOT EXISTS public.diamond_arena_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_type      TEXT NOT NULL CHECK (event_type IN ('game_start', 'game_complete', 'duel_start', 'duel_complete', 'jackpot_win')),
    game_type       TEXT,                           -- 'hand-snap', 'board-nuts', etc.
    score           INTEGER DEFAULT 0,
    correct_count   INTEGER DEFAULT 0,
    total_questions INTEGER DEFAULT 0,
    time_spent_ms   INTEGER DEFAULT 0,
    won             BOOLEAN DEFAULT FALSE,
    prize_awarded   INTEGER DEFAULT 0,              -- diamonds awarded on win
    entry_fee       INTEGER DEFAULT 0,              -- diamonds spent to play
    diamonds_delta  INTEGER DEFAULT 0,              -- net change (prize - fee)
    status          TEXT DEFAULT 'completed' CHECK (status IN ('active', 'completed', 'abandoned')),
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_diamond_arena_events_user ON public.diamond_arena_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diamond_arena_events_type ON public.diamond_arena_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diamond_arena_events_game ON public.diamond_arena_events (game_type, created_at DESC);

-- RLS
ALTER TABLE public.diamond_arena_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'diamond_arena_events' AND policyname = 'Users can view own events'
    ) THEN
        CREATE POLICY "Users can view own events" ON public.diamond_arena_events
            FOR SELECT USING (auth.uid() = user_id);
    END IF;
END $$;

-- Service role can insert on behalf of users (API routes)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'diamond_arena_events' AND policyname = 'Service role can insert events'
    ) THEN
        CREATE POLICY "Service role can insert events" ON public.diamond_arena_events
            FOR INSERT WITH CHECK (true);
    END IF;
END $$;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.diamond_arena_events;

-- ================================================================
-- diamond_arena_scores: leaderboard aggregates (if not already created)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.diamond_arena_scores (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    game_type       TEXT NOT NULL,
    high_score      INTEGER DEFAULT 0,
    total_wins      INTEGER DEFAULT 0,
    total_games     INTEGER DEFAULT 0,
    total_earned    INTEGER DEFAULT 0,               -- lifetime diamonds won
    best_streak     INTEGER DEFAULT 0,
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, game_type)
);

CREATE INDEX IF NOT EXISTS idx_diamond_arena_scores_game ON public.diamond_arena_scores (game_type, total_wins DESC);
ALTER TABLE public.diamond_arena_scores ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'diamond_arena_scores' AND policyname = 'Scores are public'
    ) THEN
        CREATE POLICY "Scores are public" ON public.diamond_arena_scores FOR SELECT USING (true);
    END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.diamond_arena_scores;

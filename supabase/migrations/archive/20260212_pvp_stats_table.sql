-- PvP Stats Table: Persistent win/loss tracking
-- Stores lifetime PvP stats per user

CREATE TABLE IF NOT EXISTS trivia_pvp_stats (
    user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    ties INTEGER NOT NULL DEFAULT 0,
    win_streak INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    total_diamonds_won INTEGER NOT NULL DEFAULT 0,
    total_diamonds_lost INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE trivia_pvp_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view stats" ON trivia_pvp_stats
    FOR SELECT USING (true);

CREATE POLICY "Users can insert own stats" ON trivia_pvp_stats
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own stats" ON trivia_pvp_stats
    FOR UPDATE USING (auth.uid() = user_id);

-- Service role bypass for cron/cleanup operations
CREATE POLICY "Service role full access on pvp_stats" ON trivia_pvp_stats
    FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE trivia_pvp_stats IS 'Persistent PvP win/loss/tie stats per user';

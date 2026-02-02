-- TRIVIA PHASE 2-4 DATABASE MIGRATIONS
-- Run in Supabase SQL Editor

-- ============================================
-- SURVIVAL MODE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS trivia_survival_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    correct_count INTEGER NOT NULL DEFAULT 0,
    time_survived INTEGER DEFAULT 0,
    diamonds_earned INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_survival_runs_correct ON trivia_survival_runs(correct_count DESC);
CREATE INDEX IF NOT EXISTS idx_survival_runs_user ON trivia_survival_runs(user_id);

-- RLS Policies
ALTER TABLE trivia_survival_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all survival runs"
    ON trivia_survival_runs FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can insert own survival runs"
    ON trivia_survival_runs FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- ============================================
-- PVP MATCHES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS trivia_pvp_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player1_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    player2_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    stake_amount INTEGER NOT NULL DEFAULT 10,
    winner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    player1_score INTEGER DEFAULT 0,
    player2_score INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'complete', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pvp_player1 ON trivia_pvp_matches(player1_id);
CREATE INDEX IF NOT EXISTS idx_pvp_player2 ON trivia_pvp_matches(player2_id);
CREATE INDEX IF NOT EXISTS idx_pvp_status ON trivia_pvp_matches(status);

-- RLS Policies
ALTER TABLE trivia_pvp_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their matches"
    ON trivia_pvp_matches FOR SELECT
    TO authenticated
    USING (auth.uid() = player1_id OR auth.uid() = player2_id);

CREATE POLICY "Users can create matches"
    ON trivia_pvp_matches FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = player1_id);

CREATE POLICY "Players can update their matches"
    ON trivia_pvp_matches FOR UPDATE
    TO authenticated
    USING (auth.uid() = player1_id OR auth.uid() = player2_id);

-- ============================================
-- FRIEND CHALLENGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS trivia_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenger_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    challenged_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stake_amount INTEGER NOT NULL DEFAULT 10,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'completed', 'expired')),
    challenger_score INTEGER,
    challenged_score INTEGER,
    winner_id UUID REFERENCES auth.users(id),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_challenges_challenger ON trivia_challenges(challenger_id);
CREATE INDEX IF NOT EXISTS idx_challenges_challenged ON trivia_challenges(challenged_id);
CREATE INDEX IF NOT EXISTS idx_challenges_status ON trivia_challenges(status);

-- RLS Policies
ALTER TABLE trivia_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their challenges"
    ON trivia_challenges FOR SELECT
    TO authenticated
    USING (auth.uid() = challenger_id OR auth.uid() = challenged_id);

CREATE POLICY "Users can create challenges"
    ON trivia_challenges FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = challenger_id);

CREATE POLICY "Users can update their challenges"
    ON trivia_challenges FOR UPDATE
    TO authenticated
    USING (auth.uid() = challenger_id OR auth.uid() = challenged_id);

-- ============================================
-- TOURNAMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS trivia_tournaments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    entry_fee INTEGER NOT NULL DEFAULT 25,
    prize_pool INTEGER DEFAULT 0,
    max_players INTEGER DEFAULT 100,
    current_players INTEGER DEFAULT 0,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'registration', 'active', 'complete', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tournament entries
CREATE TABLE IF NOT EXISTS trivia_tournament_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES trivia_tournaments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    score INTEGER DEFAULT 0,
    correct_count INTEGER DEFAULT 0,
    time_spent INTEGER DEFAULT 0,
    rank INTEGER,
    payout INTEGER DEFAULT 0,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tournament_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tournament_entries_tournament ON trivia_tournament_entries(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_entries_user ON trivia_tournament_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_tournament_entries_score ON trivia_tournament_entries(score DESC);

-- RLS Policies
ALTER TABLE trivia_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE trivia_tournament_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view tournaments"
    ON trivia_tournaments FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can view all entries"
    ON trivia_tournament_entries FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can enter tournaments"
    ON trivia_tournament_entries FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own entries"
    ON trivia_tournament_entries FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id);

-- ============================================
-- CATEGORY MASTERY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS trivia_category_mastery (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    correct_count INTEGER DEFAULT 0,
    total_count INTEGER DEFAULT 0,
    mastery_level INTEGER DEFAULT 0 CHECK (mastery_level >= 0 AND mastery_level <= 5),
    last_played TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, category)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_mastery_user ON trivia_category_mastery(user_id);

-- RLS
ALTER TABLE trivia_category_mastery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own mastery"
    ON trivia_category_mastery FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own mastery"
    ON trivia_category_mastery FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own mastery"
    ON trivia_category_mastery FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id);

-- ============================================
-- HINT USAGE TRACKING
-- ============================================
CREATE TABLE IF NOT EXISTS trivia_hint_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    hint_type TEXT NOT NULL CHECK (hint_type IN ('fifty_fifty', 'skip', 'extra_time')),
    diamonds_spent INTEGER NOT NULL,
    game_mode TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hint_usage_user ON trivia_hint_usage(user_id);

ALTER TABLE trivia_hint_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own hint usage"
    ON trivia_hint_usage FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can log hint usage"
    ON trivia_hint_usage FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- ============================================
-- DONE
-- ============================================

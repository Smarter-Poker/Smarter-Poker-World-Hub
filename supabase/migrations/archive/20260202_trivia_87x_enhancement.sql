-- Trivia 87x Enhancement - Database Migrations
-- Phase 1: Category Mastery + Question History

-- 1. Category Mastery Tracking
CREATE TABLE IF NOT EXISTS trivia_category_mastery (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    category TEXT NOT NULL,
    total_answered INT DEFAULT 0,
    correct_count INT DEFAULT 0,
    mastery_level INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, category)
);

-- Enable RLS
ALTER TABLE trivia_category_mastery ENABLE ROW LEVEL SECURITY;

-- Users can view/update their own mastery
CREATE POLICY "Users can view own mastery" ON trivia_category_mastery
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own mastery" ON trivia_category_mastery
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own mastery" ON trivia_category_mastery
    FOR UPDATE USING (auth.uid() = user_id);

-- 2. Question History (60-day non-repeat tracking)
CREATE TABLE IF NOT EXISTS trivia_user_question_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    question_id UUID NOT NULL,
    seen_at TIMESTAMPTZ DEFAULT now(),
    was_correct BOOLEAN,
    mode TEXT,
    UNIQUE(user_id, question_id)
);

-- Enable RLS
ALTER TABLE trivia_user_question_history ENABLE ROW LEVEL SECURITY;

-- Users can view/insert their own history
CREATE POLICY "Users can view own history" ON trivia_user_question_history
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own history" ON trivia_user_question_history
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Index for efficient 60-day lookups
CREATE INDEX IF NOT EXISTS idx_question_history_user_date 
    ON trivia_user_question_history(user_id, seen_at DESC);

-- 3. PvP Matches table
CREATE TABLE IF NOT EXISTS trivia_pvp_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenger_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    opponent_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    stake_amount INT DEFAULT 10,
    questions JSONB NOT NULL,
    challenger_score INT,
    opponent_score INT,
    winner_id UUID REFERENCES auth.users(id),
    status TEXT DEFAULT 'pending', -- pending, active, completed, expired
    category TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE trivia_pvp_matches ENABLE ROW LEVEL SECURITY;

-- Users can see matches they're involved in
CREATE POLICY "Users can view own matches" ON trivia_pvp_matches
    FOR SELECT USING (auth.uid() = challenger_id OR auth.uid() = opponent_id);
CREATE POLICY "Users can create matches" ON trivia_pvp_matches
    FOR INSERT WITH CHECK (auth.uid() = challenger_id);
CREATE POLICY "Users can update own matches" ON trivia_pvp_matches
    FOR UPDATE USING (auth.uid() = challenger_id OR auth.uid() = opponent_id);

-- 4. Weekly Tournament table
CREATE TABLE IF NOT EXISTS trivia_tournaments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    entry_fee INT DEFAULT 25,
    prize_pool INT DEFAULT 0,
    questions JSONB,
    status TEXT DEFAULT 'upcoming', -- upcoming, active, completed
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trivia_tournament_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID REFERENCES trivia_tournaments(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    score INT DEFAULT 0,
    time_spent INT DEFAULT 0,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tournament_id, user_id)
);

-- Enable RLS
ALTER TABLE trivia_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE trivia_tournament_entries ENABLE ROW LEVEL SECURITY;

-- Anyone can view tournaments
CREATE POLICY "Anyone can view tournaments" ON trivia_tournaments
    FOR SELECT USING (true);

-- Users can view/insert their own entries
CREATE POLICY "Users can view tournament entries" ON trivia_tournament_entries
    FOR SELECT USING (true);
CREATE POLICY "Users can enter tournaments" ON trivia_tournament_entries
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own entries" ON trivia_tournament_entries
    FOR UPDATE USING (auth.uid() = user_id);

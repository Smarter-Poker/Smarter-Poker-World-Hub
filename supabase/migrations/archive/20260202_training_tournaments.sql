-- Training Tournaments System
-- Competitive timed training challenges vs other players

-- Tournament definitions
CREATE TABLE IF NOT EXISTS training_tournaments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    game_id TEXT NOT NULL,
    
    -- Timing
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    entry_window_minutes INTEGER DEFAULT 30, -- How long after start can you enter
    
    -- Structure
    questions_count INTEGER DEFAULT 10,
    time_limit_seconds INTEGER DEFAULT 300, -- Total time to complete
    
    -- Entry
    entry_fee_diamonds INTEGER DEFAULT 0,
    max_entries INTEGER, -- NULL = unlimited
    entry_count INTEGER DEFAULT 0,
    
    -- Prizes (top 3)
    prize_1st INTEGER DEFAULT 500,
    prize_2nd INTEGER DEFAULT 250,
    prize_3rd INTEGER DEFAULT 100,
    
    -- Status
    status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'finalizing', 'complete', 'cancelled')),
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES auth.users(id)
);

-- Tournament entries
CREATE TABLE IF NOT EXISTS training_tournament_entries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tournament_id UUID REFERENCES training_tournaments(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Results
    score INTEGER DEFAULT 0,
    accuracy DECIMAL(5,2) DEFAULT 0,
    time_taken_seconds INTEGER,
    questions_answered INTEGER DEFAULT 0,
    questions_correct INTEGER DEFAULT 0,
    
    -- Status
    status TEXT DEFAULT 'registered' CHECK (status IN ('registered', 'playing', 'completed', 'forfeited')),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Ranking (calculated after tourney ends)
    final_rank INTEGER,
    prize_won INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tournament_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON training_tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_start ON training_tournaments(start_time);
CREATE INDEX IF NOT EXISTS idx_tournament_entries_tournament ON training_tournament_entries(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_entries_user ON training_tournament_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_tournament_entries_score ON training_tournament_entries(tournament_id, score DESC);

-- Enable RLS
ALTER TABLE training_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_tournament_entries ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can view tournaments" 
    ON training_tournaments FOR SELECT 
    USING (true);

CREATE POLICY "Users can view own entries" 
    ON training_tournament_entries FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view tournament leaderboards"
    ON training_tournament_entries FOR SELECT
    USING (true);

CREATE POLICY "Service manages tournaments"
    ON training_tournaments FOR ALL
    USING (true) WITH CHECK (true);

CREATE POLICY "Service manages entries"
    ON training_tournament_entries FOR ALL
    USING (true) WITH CHECK (true);

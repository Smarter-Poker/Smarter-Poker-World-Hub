-- Tournament bracket system tables and PvP queue RLS fix

-- Add bracket columns to trivia_tournaments
ALTER TABLE trivia_tournaments ADD COLUMN IF NOT EXISTS tournament_type TEXT DEFAULT 'bracket';
ALTER TABLE trivia_tournaments ADD COLUMN IF NOT EXISTS current_round INTEGER DEFAULT 0;
ALTER TABLE trivia_tournaments ADD COLUMN IF NOT EXISTS total_rounds INTEGER;
ALTER TABLE trivia_tournaments ADD COLUMN IF NOT EXISTS round_deadline TIMESTAMPTZ;
ALTER TABLE trivia_tournaments ADD COLUMN IF NOT EXISTS winners JSONB DEFAULT NULL;
ALTER TABLE trivia_tournaments ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ DEFAULT NULL;

-- Tournament rounds table for bracket tracking
CREATE TABLE IF NOT EXISTS trivia_tournament_rounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID REFERENCES trivia_tournaments(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    deadline TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'complete')),
    matchups JSONB DEFAULT '[]'::jsonb
);

ALTER TABLE trivia_tournament_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view rounds" ON trivia_tournament_rounds
    FOR SELECT USING (true);

CREATE POLICY "Service role manages rounds" ON trivia_tournament_rounds
    FOR ALL USING (auth.role() = 'service_role');

-- Add bracket info columns to tournament entries
ALTER TABLE trivia_tournament_entries ADD COLUMN IF NOT EXISTS eliminated_round INTEGER;
ALTER TABLE trivia_tournament_entries ADD COLUMN IF NOT EXISTS seed_number INTEGER;

-- Fix PvP queue RLS
DROP POLICY IF EXISTS "Users can insert own queue entry" ON trivia_pvp_queue;
DROP POLICY IF EXISTS "Authenticated users can insert" ON trivia_pvp_queue;
DROP POLICY IF EXISTS "Service role queue access" ON trivia_pvp_queue;

CREATE POLICY "Authenticated users can insert queue" ON trivia_pvp_queue
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can view own queue entries" ON trivia_pvp_queue
    FOR SELECT USING (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Users can update own queue entries" ON trivia_pvp_queue
    FOR UPDATE USING (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Users can delete own queue entries" ON trivia_pvp_queue
    FOR DELETE USING (auth.uid() = user_id OR auth.role() = 'service_role');

-- Tournament notification flags table
CREATE TABLE IF NOT EXISTS trivia_tournament_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    tournament_id UUID REFERENCES trivia_tournaments(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL CHECK (notification_type IN ('round_start', 'forfeit_warning', 'eliminated', 'winner')),
    message TEXT,
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE trivia_tournament_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" ON trivia_tournament_notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON trivia_tournament_notifications
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service role manages notifications" ON trivia_tournament_notifications
    FOR ALL USING (auth.role() = 'service_role');

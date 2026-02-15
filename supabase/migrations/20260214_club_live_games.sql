-- Club Live Games & Seat Reservations
-- For Club Pages: real-time game boards with seat selection and waitlists

-- Live games table
CREATE TABLE IF NOT EXISTS club_live_games (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    page_id UUID NOT NULL,
    game_name TEXT NOT NULL,
    game_type TEXT NOT NULL DEFAULT 'NLH',
    stakes TEXT NOT NULL DEFAULT '1/2',
    max_seats INTEGER NOT NULL DEFAULT 9,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'running', 'closed')),
    table_number TEXT,
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ
);

-- Seat reservations + waitlist
CREATE TABLE IF NOT EXISTS club_game_seats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    game_id UUID NOT NULL REFERENCES club_live_games(id) ON DELETE CASCADE,
    seat_number INTEGER,
    player_id UUID,
    player_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'seated', 'waitlist')),
    waitlist_position INTEGER,
    reserved_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,
    UNIQUE(game_id, seat_number)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_club_live_games_page_id ON club_live_games(page_id);
CREATE INDEX IF NOT EXISTS idx_club_live_games_status ON club_live_games(status);
CREATE INDEX IF NOT EXISTS idx_club_game_seats_game_id ON club_game_seats(game_id);
CREATE INDEX IF NOT EXISTS idx_club_game_seats_player_id ON club_game_seats(player_id);

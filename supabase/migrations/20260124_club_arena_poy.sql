-- ═══════════════════════════════════════════════════════════════════════════
-- CLUB ARENA & POY (Player of the Year) INTEGRATION
-- Connects Club Arena results to internal leaderboards and POY rankings
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- CLUB ARENA RESULTS — Raw game results from club.smarter.poker
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS club_arena_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    external_player_id TEXT, -- ID from club.smarter.poker if not linked
    club_id TEXT NOT NULL,
    club_name TEXT,
    game_type TEXT NOT NULL, -- 'tournament', 'cash', 'sit-n-go', 'spin-n-go'
    game_id TEXT, -- External game ID from club.smarter.poker
    placement INT, -- Final position (1st, 2nd, etc.)
    total_players INT, -- Total players in game
    buy_in INT DEFAULT 0, -- Entry cost in diamonds
    winnings INT DEFAULT 0, -- Prize won in diamonds
    net_profit INT GENERATED ALWAYS AS (winnings - buy_in) STORED,
    hands_played INT DEFAULT 0,
    duration_minutes INT DEFAULT 0,
    game_data JSONB DEFAULT '{}', -- Additional game-specific data
    verified BOOLEAN DEFAULT FALSE, -- Has been verified against external system
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_club_results_player ON club_arena_results(player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_club_results_club ON club_arena_results(club_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_club_results_game_type ON club_arena_results(game_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_club_results_external ON club_arena_results(external_player_id) WHERE external_player_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- CLUB ARENA LEADERBOARD — Aggregated stats per period
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS club_arena_leaderboard (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    period_type TEXT NOT NULL, -- 'daily', 'weekly', 'monthly', 'yearly', 'alltime'
    period_start DATE NOT NULL,
    -- Performance metrics
    total_profit INT DEFAULT 0,
    total_buy_ins INT DEFAULT 0,
    total_winnings INT DEFAULT 0,
    games_played INT DEFAULT 0,
    games_won INT DEFAULT 0, -- 1st place finishes
    games_cashed INT DEFAULT 0, -- Finished in the money
    -- Tournament specific
    tournaments_played INT DEFAULT 0,
    tournaments_won INT DEFAULT 0,
    final_tables INT DEFAULT 0,
    -- Cash game specific
    cash_sessions INT DEFAULT 0,
    cash_profit INT DEFAULT 0,
    -- Calculated stats
    roi DECIMAL(8,2) DEFAULT 0, -- Return on investment %
    avg_placement DECIMAL(5,2), -- Average finish position
    best_finish INT, -- Best placement
    biggest_win INT DEFAULT 0,
    -- POY contribution
    poy_points INT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(player_id, period_type, period_start)
);

CREATE INDEX IF NOT EXISTS idx_club_leaderboard_rank ON club_arena_leaderboard(period_type, period_start, total_profit DESC);
CREATE INDEX IF NOT EXISTS idx_club_leaderboard_poy ON club_arena_leaderboard(period_type, period_start, poy_points DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- POY (Player of the Year) RANKINGS — Unified ranking system
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS poy_rankings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    season_year INT NOT NULL DEFAULT EXTRACT(YEAR FROM NOW()),
    -- Point sources
    diamond_arcade_points INT DEFAULT 0,
    club_arena_points INT DEFAULT 0,
    tournament_points INT DEFAULT 0,
    achievement_points INT DEFAULT 0,
    bonus_points INT DEFAULT 0,
    -- Total (auto-calculated)
    total_points INT GENERATED ALWAYS AS (
        diamond_arcade_points + club_arena_points + tournament_points + achievement_points + bonus_points
    ) STORED,
    -- Ranking metadata
    current_rank INT,
    previous_rank INT,
    rank_change INT GENERATED ALWAYS AS (
        CASE WHEN previous_rank IS NOT NULL AND current_rank IS NOT NULL
        THEN previous_rank - current_rank
        ELSE 0 END
    ) STORED,
    peak_rank INT,
    -- Stats
    weeks_in_top_10 INT DEFAULT 0,
    weeks_at_1 INT DEFAULT 0,
    last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(player_id, season_year)
);

CREATE INDEX IF NOT EXISTS idx_poy_rankings_total ON poy_rankings(season_year, total_points DESC);
CREATE INDEX IF NOT EXISTS idx_poy_rankings_rank ON poy_rankings(season_year, current_rank);

-- ═══════════════════════════════════════════════════════════════════════════
-- POY POINT HISTORY — Track point changes over time
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS poy_point_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    season_year INT NOT NULL,
    points_earned INT NOT NULL,
    point_source TEXT NOT NULL, -- 'diamond_arcade', 'club_arena', 'tournament', 'achievement', 'bonus'
    source_id TEXT, -- ID of the game/tournament/achievement that earned points
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poy_history_player ON poy_point_history(player_id, season_year, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_poy_history_source ON poy_point_history(point_source, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- POY POINT CONFIGURATION — Configurable point values
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS poy_point_config (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL, -- 'diamond_arcade', 'club_arena', 'tournament', 'achievement'
    action TEXT NOT NULL,
    base_points INT NOT NULL,
    multiplier_formula TEXT, -- Optional formula for dynamic points
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default point configuration
INSERT INTO poy_point_config (id, category, action, base_points, description) VALUES
-- Diamond Arcade points
('arcade_win', 'diamond_arcade', 'game_win', 10, 'Win an arcade game'),
('arcade_perfect', 'diamond_arcade', 'perfect_score', 50, 'Perfect score in arcade game'),
('arcade_streak_5', 'diamond_arcade', 'win_streak_5', 100, '5 game win streak'),
('arcade_streak_10', 'diamond_arcade', 'win_streak_10', 250, '10 game win streak'),
('arcade_daily_top3', 'diamond_arcade', 'daily_leaderboard_top3', 200, 'Finish top 3 on daily leaderboard'),
('arcade_weekly_top10', 'diamond_arcade', 'weekly_leaderboard_top10', 500, 'Finish top 10 on weekly leaderboard'),
-- Club Arena points
('club_tournament_win', 'club_arena', 'tournament_win', 100, 'Win a tournament'),
('club_tournament_ft', 'club_arena', 'final_table', 50, 'Make a final table'),
('club_tournament_cash', 'club_arena', 'cash_finish', 25, 'Cash in a tournament'),
('club_sng_win', 'club_arena', 'sng_win', 50, 'Win a sit-n-go'),
('club_profit_1k', 'club_arena', 'profit_milestone_1k', 100, 'Earn 1000 diamonds profit'),
('club_profit_10k', 'club_arena', 'profit_milestone_10k', 500, 'Earn 10000 diamonds profit'),
-- Achievement points
('first_arcade_win', 'achievement', 'first_arcade_win', 50, 'Win first arcade game'),
('first_tournament_win', 'achievement', 'first_tournament_win', 100, 'Win first tournament'),
('weekly_active', 'achievement', 'weekly_active', 25, 'Play every day for a week')
ON CONFLICT (id) DO UPDATE SET
    base_points = EXCLUDED.base_points,
    description = EXCLUDED.description;

-- ═══════════════════════════════════════════════════════════════════════════
-- API KEYS — For webhook authentication
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS arena_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_hash TEXT NOT NULL UNIQUE, -- SHA256 hash of API key
    name TEXT NOT NULL,
    source TEXT NOT NULL, -- 'club_arena', 'external_tournament'
    permissions TEXT[] DEFAULT ARRAY['submit_results'],
    rate_limit_per_minute INT DEFAULT 100,
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

-- ═══════════════════════════════════════════════════════════════════════════
-- CORE FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Record a Club Arena game result
CREATE OR REPLACE FUNCTION record_club_arena_result(
    p_player_id UUID,
    p_club_id TEXT,
    p_club_name TEXT,
    p_game_type TEXT,
    p_game_id TEXT,
    p_placement INT,
    p_total_players INT,
    p_buy_in INT,
    p_winnings INT,
    p_hands_played INT DEFAULT 0,
    p_duration_minutes INT DEFAULT 0,
    p_game_data JSONB DEFAULT '{}'
) RETURNS JSONB AS $$
DECLARE
    v_result_id UUID;
    v_net_profit INT;
    v_poy_points INT := 0;
    v_season_year INT;
BEGIN
    v_net_profit := p_winnings - p_buy_in;
    v_season_year := EXTRACT(YEAR FROM NOW());

    -- Insert the result
    INSERT INTO club_arena_results (
        player_id, club_id, club_name, game_type, game_id,
        placement, total_players, buy_in, winnings,
        hands_played, duration_minutes, game_data, verified
    ) VALUES (
        p_player_id, p_club_id, p_club_name, p_game_type, p_game_id,
        p_placement, p_total_players, p_buy_in, p_winnings,
        p_hands_played, p_duration_minutes, p_game_data, TRUE
    ) RETURNING id INTO v_result_id;

    -- Calculate POY points based on result
    IF p_placement = 1 THEN
        -- Tournament/SNG win
        IF p_game_type IN ('tournament', 'sit-n-go', 'spin-n-go') THEN
            v_poy_points := CASE p_game_type
                WHEN 'tournament' THEN 100
                WHEN 'sit-n-go' THEN 50
                WHEN 'spin-n-go' THEN 30
                ELSE 25
            END;
            -- Bonus for larger fields
            v_poy_points := v_poy_points + (p_total_players / 10);
        END IF;
    ELSIF p_placement <= 3 AND p_total_players >= 10 THEN
        -- Final table / podium finish
        v_poy_points := 50;
    ELSIF p_placement <= CEIL(p_total_players * 0.15) THEN
        -- Cashed (top 15%)
        v_poy_points := 25;
    END IF;

    -- Update leaderboards (daily, weekly, monthly, yearly, alltime)
    INSERT INTO club_arena_leaderboard (
        player_id, period_type, period_start,
        total_profit, total_buy_ins, total_winnings,
        games_played, games_won, games_cashed,
        tournaments_played, tournaments_won, final_tables,
        best_finish, biggest_win, poy_points
    ) VALUES
    -- Daily
    (p_player_id, 'daily', CURRENT_DATE,
     v_net_profit, p_buy_in, p_winnings, 1,
     CASE WHEN p_placement = 1 THEN 1 ELSE 0 END,
     CASE WHEN p_winnings > p_buy_in THEN 1 ELSE 0 END,
     CASE WHEN p_game_type = 'tournament' THEN 1 ELSE 0 END,
     CASE WHEN p_game_type = 'tournament' AND p_placement = 1 THEN 1 ELSE 0 END,
     CASE WHEN p_placement <= 9 AND p_total_players >= 18 THEN 1 ELSE 0 END,
     p_placement, p_winnings, v_poy_points),
    -- Weekly
    (p_player_id, 'weekly', date_trunc('week', CURRENT_DATE)::DATE,
     v_net_profit, p_buy_in, p_winnings, 1,
     CASE WHEN p_placement = 1 THEN 1 ELSE 0 END,
     CASE WHEN p_winnings > p_buy_in THEN 1 ELSE 0 END,
     CASE WHEN p_game_type = 'tournament' THEN 1 ELSE 0 END,
     CASE WHEN p_game_type = 'tournament' AND p_placement = 1 THEN 1 ELSE 0 END,
     CASE WHEN p_placement <= 9 AND p_total_players >= 18 THEN 1 ELSE 0 END,
     p_placement, p_winnings, v_poy_points),
    -- Monthly
    (p_player_id, 'monthly', date_trunc('month', CURRENT_DATE)::DATE,
     v_net_profit, p_buy_in, p_winnings, 1,
     CASE WHEN p_placement = 1 THEN 1 ELSE 0 END,
     CASE WHEN p_winnings > p_buy_in THEN 1 ELSE 0 END,
     CASE WHEN p_game_type = 'tournament' THEN 1 ELSE 0 END,
     CASE WHEN p_game_type = 'tournament' AND p_placement = 1 THEN 1 ELSE 0 END,
     CASE WHEN p_placement <= 9 AND p_total_players >= 18 THEN 1 ELSE 0 END,
     p_placement, p_winnings, v_poy_points),
    -- Yearly
    (p_player_id, 'yearly', date_trunc('year', CURRENT_DATE)::DATE,
     v_net_profit, p_buy_in, p_winnings, 1,
     CASE WHEN p_placement = 1 THEN 1 ELSE 0 END,
     CASE WHEN p_winnings > p_buy_in THEN 1 ELSE 0 END,
     CASE WHEN p_game_type = 'tournament' THEN 1 ELSE 0 END,
     CASE WHEN p_game_type = 'tournament' AND p_placement = 1 THEN 1 ELSE 0 END,
     CASE WHEN p_placement <= 9 AND p_total_players >= 18 THEN 1 ELSE 0 END,
     p_placement, p_winnings, v_poy_points),
    -- All-time
    (p_player_id, 'alltime', '2024-01-01'::DATE,
     v_net_profit, p_buy_in, p_winnings, 1,
     CASE WHEN p_placement = 1 THEN 1 ELSE 0 END,
     CASE WHEN p_winnings > p_buy_in THEN 1 ELSE 0 END,
     CASE WHEN p_game_type = 'tournament' THEN 1 ELSE 0 END,
     CASE WHEN p_game_type = 'tournament' AND p_placement = 1 THEN 1 ELSE 0 END,
     CASE WHEN p_placement <= 9 AND p_total_players >= 18 THEN 1 ELSE 0 END,
     p_placement, p_winnings, v_poy_points)
    ON CONFLICT (player_id, period_type, period_start) DO UPDATE SET
        total_profit = club_arena_leaderboard.total_profit + EXCLUDED.total_profit,
        total_buy_ins = club_arena_leaderboard.total_buy_ins + EXCLUDED.total_buy_ins,
        total_winnings = club_arena_leaderboard.total_winnings + EXCLUDED.total_winnings,
        games_played = club_arena_leaderboard.games_played + 1,
        games_won = club_arena_leaderboard.games_won + EXCLUDED.games_won,
        games_cashed = club_arena_leaderboard.games_cashed + EXCLUDED.games_cashed,
        tournaments_played = club_arena_leaderboard.tournaments_played + EXCLUDED.tournaments_played,
        tournaments_won = club_arena_leaderboard.tournaments_won + EXCLUDED.tournaments_won,
        final_tables = club_arena_leaderboard.final_tables + EXCLUDED.final_tables,
        best_finish = LEAST(club_arena_leaderboard.best_finish, EXCLUDED.best_finish),
        biggest_win = GREATEST(club_arena_leaderboard.biggest_win, EXCLUDED.biggest_win),
        poy_points = club_arena_leaderboard.poy_points + EXCLUDED.poy_points,
        roi = CASE WHEN (club_arena_leaderboard.total_buy_ins + EXCLUDED.total_buy_ins) > 0
            THEN ((club_arena_leaderboard.total_profit + EXCLUDED.total_profit)::DECIMAL /
                  (club_arena_leaderboard.total_buy_ins + EXCLUDED.total_buy_ins)) * 100
            ELSE 0 END,
        updated_at = NOW();

    -- Update POY rankings
    IF v_poy_points > 0 THEN
        INSERT INTO poy_rankings (player_id, season_year, club_arena_points)
        VALUES (p_player_id, v_season_year, v_poy_points)
        ON CONFLICT (player_id, season_year) DO UPDATE SET
            club_arena_points = poy_rankings.club_arena_points + EXCLUDED.club_arena_points,
            updated_at = NOW();

        -- Record point history
        INSERT INTO poy_point_history (player_id, season_year, points_earned, point_source, source_id, description)
        VALUES (p_player_id, v_season_year, v_poy_points, 'club_arena', v_result_id::TEXT,
                p_game_type || ' - ' || CASE WHEN p_placement = 1 THEN 'WIN' ELSE '#' || p_placement END);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'result_id', v_result_id,
        'net_profit', v_net_profit,
        'poy_points_earned', v_poy_points
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update POY rankings from Diamond Arcade performance
CREATE OR REPLACE FUNCTION update_poy_from_arcade(
    p_player_id UUID,
    p_points INT,
    p_reason TEXT,
    p_source_id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_season_year INT;
BEGIN
    v_season_year := EXTRACT(YEAR FROM NOW());

    -- Update POY rankings
    INSERT INTO poy_rankings (player_id, season_year, diamond_arcade_points)
    VALUES (p_player_id, v_season_year, p_points)
    ON CONFLICT (player_id, season_year) DO UPDATE SET
        diamond_arcade_points = poy_rankings.diamond_arcade_points + p_points,
        updated_at = NOW();

    -- Record history
    INSERT INTO poy_point_history (player_id, season_year, points_earned, point_source, source_id, description)
    VALUES (p_player_id, v_season_year, p_points, 'diamond_arcade', p_source_id, p_reason);

    RETURN jsonb_build_object('success', true, 'points_added', p_points);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recalculate all POY rankings
CREATE OR REPLACE FUNCTION recalculate_poy_rankings(p_season_year INT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    v_season INT;
    v_count INT;
BEGIN
    v_season := COALESCE(p_season_year, EXTRACT(YEAR FROM NOW())::INT);

    -- Store previous ranks
    UPDATE poy_rankings SET previous_rank = current_rank WHERE season_year = v_season;

    -- Calculate new ranks based on total points
    WITH ranked AS (
        SELECT
            id,
            ROW_NUMBER() OVER (ORDER BY total_points DESC) as new_rank
        FROM poy_rankings
        WHERE season_year = v_season
    )
    UPDATE poy_rankings p SET
        current_rank = r.new_rank,
        peak_rank = LEAST(COALESCE(p.peak_rank, r.new_rank), r.new_rank),
        last_calculated_at = NOW()
    FROM ranked r
    WHERE p.id = r.id;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'season', v_season,
        'players_ranked', v_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get POY leaderboard
CREATE OR REPLACE FUNCTION get_poy_leaderboard(
    p_season_year INT DEFAULT NULL,
    p_limit INT DEFAULT 50
)
RETURNS JSONB AS $$
DECLARE
    v_season INT;
    v_results JSONB;
BEGIN
    v_season := COALESCE(p_season_year, EXTRACT(YEAR FROM NOW())::INT);

    SELECT jsonb_agg(row_data ORDER BY rank)
    INTO v_results
    FROM (
        SELECT jsonb_build_object(
            'rank', COALESCE(r.current_rank, ROW_NUMBER() OVER (ORDER BY r.total_points DESC)),
            'player_id', r.player_id,
            'username', p.username,
            'avatar_url', p.avatar_url,
            'total_points', r.total_points,
            'diamond_arcade_points', r.diamond_arcade_points,
            'club_arena_points', r.club_arena_points,
            'tournament_points', r.tournament_points,
            'achievement_points', r.achievement_points,
            'rank_change', r.rank_change,
            'peak_rank', r.peak_rank
        ) as row_data,
        COALESCE(r.current_rank, ROW_NUMBER() OVER (ORDER BY r.total_points DESC)) as rank
        FROM poy_rankings r
        JOIN profiles p ON p.id = r.player_id
        WHERE r.season_year = v_season
        ORDER BY r.total_points DESC
        LIMIT p_limit
    ) ranked;

    RETURN COALESCE(v_results, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get Club Arena leaderboard
CREATE OR REPLACE FUNCTION get_club_arena_leaderboard(
    p_period TEXT DEFAULT 'weekly',
    p_limit INT DEFAULT 50
)
RETURNS JSONB AS $$
DECLARE
    v_period_start DATE;
    v_results JSONB;
BEGIN
    v_period_start := CASE p_period
        WHEN 'daily' THEN CURRENT_DATE
        WHEN 'weekly' THEN date_trunc('week', CURRENT_DATE)::DATE
        WHEN 'monthly' THEN date_trunc('month', CURRENT_DATE)::DATE
        WHEN 'yearly' THEN date_trunc('year', CURRENT_DATE)::DATE
        ELSE '2024-01-01'::DATE
    END;

    SELECT jsonb_agg(row_data ORDER BY rank)
    INTO v_results
    FROM (
        SELECT jsonb_build_object(
            'rank', ROW_NUMBER() OVER (ORDER BY l.total_profit DESC),
            'player_id', l.player_id,
            'username', p.username,
            'avatar_url', p.avatar_url,
            'total_profit', l.total_profit,
            'games_played', l.games_played,
            'games_won', l.games_won,
            'tournaments_won', l.tournaments_won,
            'final_tables', l.final_tables,
            'roi', l.roi,
            'biggest_win', l.biggest_win,
            'poy_points', l.poy_points
        ) as row_data,
        ROW_NUMBER() OVER (ORDER BY l.total_profit DESC) as rank
        FROM club_arena_leaderboard l
        JOIN profiles p ON p.id = l.player_id
        WHERE l.period_type = p_period
        AND l.period_start = v_period_start
        ORDER BY l.total_profit DESC
        LIMIT p_limit
    ) ranked;

    RETURN COALESCE(v_results, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE club_arena_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_arena_leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE poy_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE poy_point_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE poy_point_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE arena_api_keys ENABLE ROW LEVEL SECURITY;

-- Club Arena results: users see own, public sees completed/verified
CREATE POLICY "Users see own results" ON club_arena_results FOR SELECT
    USING (auth.uid() = player_id OR verified = TRUE);

-- Club Arena leaderboard: public read
CREATE POLICY "Leaderboard is public" ON club_arena_leaderboard FOR SELECT USING (true);

-- POY rankings: public read
CREATE POLICY "POY rankings are public" ON poy_rankings FOR SELECT USING (true);

-- POY point history: users see own
CREATE POLICY "Users see own point history" ON poy_point_history FOR SELECT
    USING (auth.uid() = player_id);

-- POY config: public read
CREATE POLICY "POY config is public" ON poy_point_config FOR SELECT USING (true);

-- API keys: admin only (no public access)
CREATE POLICY "API keys admin only" ON arena_api_keys FOR SELECT USING (false);

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER club_arena_results_updated
    BEFORE UPDATE ON club_arena_results
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER poy_rankings_updated
    BEFORE UPDATE ON poy_rankings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

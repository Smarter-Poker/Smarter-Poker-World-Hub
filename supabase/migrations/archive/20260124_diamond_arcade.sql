-- ═══════════════════════════════════════════════════════════════════════════
-- DIAMOND ARCADE — Complete Gaming System
-- Skill-based games where users gamble diamonds against the house
-- 10% rake on all games (matching tournament rake)
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- ARCADE GAMES CONFIGURATION
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS arcade_games (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL, -- 'speed', 'skill', 'jackpot'
    entry_fee INTEGER NOT NULL DEFAULT 10,
    max_prize INTEGER NOT NULL DEFAULT 100,
    rake_percent DECIMAL(5,2) DEFAULT 10.00,
    duration_seconds INTEGER DEFAULT 60,
    questions_count INTEGER DEFAULT 10,
    min_accuracy_to_win DECIMAL(5,2) DEFAULT 0.50,
    icon TEXT,
    color TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert all arcade games
INSERT INTO arcade_games (id, name, description, category, entry_fee, max_prize, duration_seconds, questions_count, icon, color, sort_order) VALUES
-- Speed Games
('hand-snap', 'Hand Snap', 'Two hands flash - tap the winner FAST!', 'speed', 10, 50, 60, 20, '⚡', '#fbbf24', 1),
('board-nuts', 'Board Nuts', 'Identify the nuts from 4 options', 'speed', 15, 75, 60, 15, '🎯', '#22c55e', 2),
('chip-math', 'Chip Math', 'Quick pot odds calculations', 'speed', 10, 50, 60, 20, '🔢', '#3b82f6', 3),
('showdown', 'Showdown!', 'Rank 5 hands from best to worst', 'speed', 20, 100, 90, 10, '🃏', '#8b5cf6', 4),
-- Skill Games
('range-builder', 'Range Builder', 'Build the correct preflop range', 'skill', 25, 150, 120, 8, '🏗️', '#f97316', 5),
('spot-the-leak', 'Spot the Leak', 'Identify the mistake in the hand', 'skill', 20, 100, 90, 10, '🔍', '#ec4899', 6),
('ev-or-fold', 'EV or Fold', 'Is this play +EV? Make the call', 'skill', 30, 200, 120, 8, '📊', '#14b8a6', 7),
('gto-or-go', 'GTO or Go', 'GTO, Exploitative, or Punt?', 'skill', 20, 100, 90, 10, '🧮', '#6366f1', 8),
-- Jackpot Games
('double-or-nothing', 'Double or Nothing', 'One question. Right = 2x. Wrong = bust.', 'jackpot', 50, 100, 30, 1, '🎲', '#ef4444', 9),
('the-gauntlet', 'The Gauntlet', '10 in a row. Miss one = lose it all.', 'jackpot', 100, 1000, 300, 10, '💀', '#dc2626', 10),
('mystery-box', 'Mystery Box', 'Answer correctly for random 1x-10x multiplier', 'jackpot', 25, 250, 60, 5, '🎁', '#a855f7', 11)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    entry_fee = EXCLUDED.entry_fee,
    max_prize = EXCLUDED.max_prize;

-- ═══════════════════════════════════════════════════════════════════════════
-- ARCADE SESSIONS — Track every game played
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS arcade_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    game_id TEXT NOT NULL REFERENCES arcade_games(id),
    entry_fee INTEGER NOT NULL,
    score INTEGER DEFAULT 0,
    correct_count INTEGER DEFAULT 0,
    total_questions INTEGER DEFAULT 0,
    accuracy DECIMAL(5,4) DEFAULT 0,
    time_spent_ms INTEGER DEFAULT 0,
    prize_won INTEGER DEFAULT 0,
    rake_taken INTEGER DEFAULT 0,
    multiplier DECIMAL(5,2) DEFAULT 1.0,
    streak_bonus INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active', -- 'active', 'completed', 'abandoned'
    game_data JSONB DEFAULT '{}',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arcade_sessions_user ON arcade_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_arcade_sessions_game ON arcade_sessions(game_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_arcade_sessions_status ON arcade_sessions(status, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- DAILY ROTATION — Featured games change daily
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS arcade_daily_featured (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feature_date DATE NOT NULL UNIQUE,
    featured_games TEXT[] NOT NULL, -- Array of game_ids
    bonus_game TEXT, -- Game with 2x bonus
    daily_challenge_game TEXT, -- Today's challenge game
    daily_challenge_target INTEGER, -- Target score to beat
    jackpot_pool INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arcade_daily_date ON arcade_daily_featured(feature_date);

-- ═══════════════════════════════════════════════════════════════════════════
-- PROGRESSIVE JACKPOT
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS arcade_jackpot (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_amount INTEGER DEFAULT 0,
    last_winner_id UUID REFERENCES auth.users(id),
    last_winner_amount INTEGER,
    last_won_at TIMESTAMPTZ,
    contribution_percent DECIMAL(5,2) DEFAULT 2.00, -- 2% of rake goes to jackpot
    entries_this_week INTEGER DEFAULT 0,
    next_draw_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Initialize jackpot
INSERT INTO arcade_jackpot (pool_amount, next_draw_at)
VALUES (10000, NOW() + INTERVAL '7 days')
ON CONFLICT DO NOTHING;

-- Jackpot entries from perfect gauntlet runs
CREATE TABLE IF NOT EXISTS arcade_jackpot_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id UUID REFERENCES arcade_sessions(id),
    entry_type TEXT NOT NULL, -- 'perfect_gauntlet', 'daily_bonus', 'purchase'
    draw_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jackpot_entries_draw ON arcade_jackpot_entries(draw_date, user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- DAILY CHALLENGE — Everyone competes on the same challenge
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS arcade_daily_challenge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_date DATE NOT NULL UNIQUE,
    game_id TEXT NOT NULL REFERENCES arcade_games(id),
    question_seed TEXT NOT NULL, -- Seed for deterministic questions
    prize_pool INTEGER DEFAULT 5000,
    entry_fee INTEGER DEFAULT 25,
    entries_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arcade_daily_challenge_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id UUID NOT NULL REFERENCES arcade_daily_challenge(id),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id UUID REFERENCES arcade_sessions(id),
    score INTEGER NOT NULL,
    time_ms INTEGER NOT NULL,
    rank INTEGER,
    prize_won INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(challenge_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_challenge_score ON arcade_daily_challenge_entries(challenge_id, score DESC, time_ms ASC);

-- ═══════════════════════════════════════════════════════════════════════════
-- WIN STREAKS — Consecutive wins boost rewards
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS arcade_streaks (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    current_streak INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    last_game_won BOOLEAN DEFAULT FALSE,
    last_played_at TIMESTAMPTZ,
    total_games_played INTEGER DEFAULT 0,
    total_games_won INTEGER DEFAULT 0,
    total_diamonds_won INTEGER DEFAULT 0,
    total_diamonds_spent INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- LEADERBOARDS — Daily, Weekly, All-Time
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS arcade_leaderboard (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    period_type TEXT NOT NULL, -- 'daily', 'weekly', 'alltime'
    period_start DATE NOT NULL,
    total_profit INTEGER DEFAULT 0, -- diamonds won - diamonds spent
    games_played INTEGER DEFAULT 0,
    games_won INTEGER DEFAULT 0,
    best_multiplier DECIMAL(5,2) DEFAULT 1.0,
    highest_single_win INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, period_type, period_start)
);

CREATE INDEX IF NOT EXISTS idx_arcade_leaderboard_rank ON arcade_leaderboard(period_type, period_start, total_profit DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- ARCADE QUESTIONS — Game-specific question banks
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS arcade_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id TEXT NOT NULL REFERENCES arcade_games(id),
    difficulty TEXT DEFAULT 'medium', -- 'easy', 'medium', 'hard'
    question_type TEXT NOT NULL, -- 'hand_comparison', 'board_nuts', 'pot_odds', 'range', 'leak', 'ev', 'gto'
    question_data JSONB NOT NULL, -- Flexible structure per game type
    correct_answer JSONB NOT NULL,
    explanation TEXT,
    times_shown INTEGER DEFAULT 0,
    times_correct INTEGER DEFAULT 0,
    avg_time_ms INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arcade_questions_game ON arcade_questions(game_id, is_active, difficulty);

-- ═══════════════════════════════════════════════════════════════════════════
-- CORE FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Start an arcade game session
CREATE OR REPLACE FUNCTION start_arcade_game(
    p_user_id UUID,
    p_game_id TEXT
) RETURNS JSONB AS $$
DECLARE
    v_game arcade_games%ROWTYPE;
    v_balance INTEGER;
    v_session_id UUID;
    v_streak arcade_streaks%ROWTYPE;
BEGIN
    -- Get game config
    SELECT * INTO v_game FROM arcade_games WHERE id = p_game_id AND is_active = TRUE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Game not found');
    END IF;

    -- Check user balance
    SELECT diamond_balance INTO v_balance FROM profiles WHERE id = p_user_id;
    IF v_balance < v_game.entry_fee THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds', 'required', v_game.entry_fee, 'balance', v_balance);
    END IF;

    -- Deduct entry fee
    UPDATE profiles SET diamond_balance = diamond_balance - v_game.entry_fee WHERE id = p_user_id;

    -- Get or create streak record
    INSERT INTO arcade_streaks (user_id) VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO v_streak FROM arcade_streaks WHERE user_id = p_user_id;

    -- Create session
    INSERT INTO arcade_sessions (user_id, game_id, entry_fee, total_questions, game_data)
    VALUES (p_user_id, p_game_id, v_game.entry_fee, v_game.questions_count, jsonb_build_object('streak', v_streak.current_streak))
    RETURNING id INTO v_session_id;

    -- Update streak stats
    UPDATE arcade_streaks SET
        total_games_played = total_games_played + 1,
        total_diamonds_spent = total_diamonds_spent + v_game.entry_fee,
        last_played_at = NOW()
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'session_id', v_session_id,
        'game', jsonb_build_object(
            'id', v_game.id,
            'name', v_game.name,
            'entry_fee', v_game.entry_fee,
            'max_prize', v_game.max_prize,
            'duration_seconds', v_game.duration_seconds,
            'questions_count', v_game.questions_count
        ),
        'streak', v_streak.current_streak,
        'balance', v_balance - v_game.entry_fee
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Complete an arcade game session
CREATE OR REPLACE FUNCTION complete_arcade_game(
    p_session_id UUID,
    p_score INTEGER,
    p_correct_count INTEGER,
    p_time_spent_ms INTEGER,
    p_multiplier DECIMAL DEFAULT 1.0
) RETURNS JSONB AS $$
DECLARE
    v_session arcade_sessions%ROWTYPE;
    v_game arcade_games%ROWTYPE;
    v_base_prize INTEGER;
    v_rake INTEGER;
    v_final_prize INTEGER;
    v_streak_bonus INTEGER := 0;
    v_current_streak INTEGER;
    v_jackpot_contribution INTEGER;
    v_accuracy DECIMAL;
    v_won BOOLEAN;
BEGIN
    -- Get session
    SELECT * INTO v_session FROM arcade_sessions WHERE id = p_session_id AND status = 'active';
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Session not found or already completed');
    END IF;

    -- Get game config
    SELECT * INTO v_game FROM arcade_games WHERE id = v_session.game_id;

    -- Calculate accuracy
    v_accuracy := CASE WHEN v_session.total_questions > 0
        THEN p_correct_count::DECIMAL / v_session.total_questions
        ELSE 0 END;

    -- Determine if won (meets minimum accuracy)
    v_won := v_accuracy >= v_game.min_accuracy_to_win;

    -- Calculate prize based on accuracy tiers
    IF NOT v_won THEN
        v_base_prize := 0;
    ELSIF v_accuracy >= 0.95 THEN
        v_base_prize := v_game.max_prize;
    ELSIF v_accuracy >= 0.85 THEN
        v_base_prize := FLOOR(v_game.max_prize * 0.75);
    ELSIF v_accuracy >= 0.70 THEN
        v_base_prize := FLOOR(v_game.max_prize * 0.50);
    ELSE
        v_base_prize := FLOOR(v_game.max_prize * 0.25);
    END IF;

    -- Apply multiplier (for mystery box, etc)
    v_base_prize := FLOOR(v_base_prize * p_multiplier);

    -- Calculate rake (10%)
    v_rake := FLOOR(v_base_prize * (v_game.rake_percent / 100));
    v_final_prize := v_base_prize - v_rake;

    -- Jackpot contribution (2% of rake)
    v_jackpot_contribution := FLOOR(v_rake * 0.02);
    UPDATE arcade_jackpot SET pool_amount = pool_amount + v_jackpot_contribution;

    -- Update streak
    IF v_won THEN
        UPDATE arcade_streaks SET
            current_streak = current_streak + 1,
            best_streak = GREATEST(best_streak, current_streak + 1),
            last_game_won = TRUE,
            total_games_won = total_games_won + 1,
            total_diamonds_won = total_diamonds_won + v_final_prize
        WHERE user_id = v_session.user_id
        RETURNING current_streak INTO v_current_streak;

        -- Streak bonus: 10% per streak level, max 50%
        v_streak_bonus := FLOOR(v_final_prize * LEAST(v_current_streak * 0.10, 0.50));
        v_final_prize := v_final_prize + v_streak_bonus;
    ELSE
        UPDATE arcade_streaks SET
            current_streak = 0,
            last_game_won = FALSE
        WHERE user_id = v_session.user_id;
        v_current_streak := 0;
    END IF;

    -- Award prize
    IF v_final_prize > 0 THEN
        UPDATE profiles SET diamond_balance = diamond_balance + v_final_prize
        WHERE id = v_session.user_id;
    END IF;

    -- Update session
    UPDATE arcade_sessions SET
        score = p_score,
        correct_count = p_correct_count,
        accuracy = v_accuracy,
        time_spent_ms = p_time_spent_ms,
        prize_won = v_final_prize,
        rake_taken = v_rake,
        multiplier = p_multiplier,
        streak_bonus = v_streak_bonus,
        status = 'completed',
        completed_at = NOW()
    WHERE id = p_session_id;

    -- Update leaderboard
    INSERT INTO arcade_leaderboard (user_id, period_type, period_start, total_profit, games_played, games_won, highest_single_win)
    VALUES
        (v_session.user_id, 'daily', CURRENT_DATE, v_final_prize - v_session.entry_fee, 1, CASE WHEN v_won THEN 1 ELSE 0 END, v_final_prize),
        (v_session.user_id, 'weekly', date_trunc('week', CURRENT_DATE)::DATE, v_final_prize - v_session.entry_fee, 1, CASE WHEN v_won THEN 1 ELSE 0 END, v_final_prize),
        (v_session.user_id, 'alltime', '2024-01-01', v_final_prize - v_session.entry_fee, 1, CASE WHEN v_won THEN 1 ELSE 0 END, v_final_prize)
    ON CONFLICT (user_id, period_type, period_start) DO UPDATE SET
        total_profit = arcade_leaderboard.total_profit + EXCLUDED.total_profit,
        games_played = arcade_leaderboard.games_played + 1,
        games_won = arcade_leaderboard.games_won + EXCLUDED.games_won,
        highest_single_win = GREATEST(arcade_leaderboard.highest_single_win, EXCLUDED.highest_single_win),
        updated_at = NOW();

    RETURN jsonb_build_object(
        'success', true,
        'won', v_won,
        'accuracy', v_accuracy,
        'base_prize', v_base_prize,
        'rake', v_rake,
        'streak_bonus', v_streak_bonus,
        'final_prize', v_final_prize,
        'streak', v_current_streak,
        'multiplier', p_multiplier
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get today's featured games
CREATE OR REPLACE FUNCTION get_arcade_daily_featured()
RETURNS JSONB AS $$
DECLARE
    v_featured arcade_daily_featured%ROWTYPE;
    v_games JSONB;
    v_jackpot INTEGER;
BEGIN
    -- Get or create today's featured
    SELECT * INTO v_featured FROM arcade_daily_featured WHERE feature_date = CURRENT_DATE;

    IF NOT FOUND THEN
        -- Auto-generate featured games for today
        INSERT INTO arcade_daily_featured (feature_date, featured_games, bonus_game, daily_challenge_game, daily_challenge_target)
        SELECT
            CURRENT_DATE,
            ARRAY(SELECT id FROM arcade_games WHERE is_active = TRUE ORDER BY random() LIMIT 4),
            (SELECT id FROM arcade_games WHERE is_active = TRUE ORDER BY random() LIMIT 1),
            (SELECT id FROM arcade_games WHERE category = 'speed' ORDER BY random() LIMIT 1),
            800
        RETURNING * INTO v_featured;
    END IF;

    -- Get game details
    SELECT jsonb_agg(jsonb_build_object(
        'id', g.id,
        'name', g.name,
        'description', g.description,
        'category', g.category,
        'entry_fee', g.entry_fee,
        'max_prize', g.max_prize,
        'icon', g.icon,
        'color', g.color,
        'is_bonus', g.id = v_featured.bonus_game
    ))
    INTO v_games
    FROM arcade_games g
    WHERE g.id = ANY(v_featured.featured_games);

    -- Get jackpot
    SELECT pool_amount INTO v_jackpot FROM arcade_jackpot LIMIT 1;

    RETURN jsonb_build_object(
        'date', v_featured.feature_date,
        'featured_games', v_games,
        'bonus_game', v_featured.bonus_game,
        'daily_challenge', jsonb_build_object(
            'game_id', v_featured.daily_challenge_game,
            'target_score', v_featured.daily_challenge_target
        ),
        'jackpot_pool', v_jackpot,
        'resets_at', (CURRENT_DATE + 1)::TIMESTAMPTZ
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user arcade stats
CREATE OR REPLACE FUNCTION get_arcade_user_stats(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_streak arcade_streaks%ROWTYPE;
    v_today_stats RECORD;
    v_balance INTEGER;
BEGIN
    SELECT * INTO v_streak FROM arcade_streaks WHERE user_id = p_user_id;

    SELECT
        COALESCE(SUM(prize_won - entry_fee), 0) as today_profit,
        COUNT(*) as games_today,
        COALESCE(SUM(CASE WHEN prize_won > 0 THEN 1 ELSE 0 END), 0) as wins_today
    INTO v_today_stats
    FROM arcade_sessions
    WHERE user_id = p_user_id
    AND DATE(created_at) = CURRENT_DATE
    AND status = 'completed';

    SELECT diamond_balance INTO v_balance FROM profiles WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'balance', v_balance,
        'current_streak', COALESCE(v_streak.current_streak, 0),
        'best_streak', COALESCE(v_streak.best_streak, 0),
        'total_games', COALESCE(v_streak.total_games_played, 0),
        'total_won', COALESCE(v_streak.total_diamonds_won, 0),
        'total_spent', COALESCE(v_streak.total_diamonds_spent, 0),
        'win_rate', CASE WHEN COALESCE(v_streak.total_games_played, 0) > 0
            THEN ROUND((v_streak.total_games_won::DECIMAL / v_streak.total_games_played) * 100, 1)
            ELSE 0 END,
        'today', jsonb_build_object(
            'profit', v_today_stats.today_profit,
            'games', v_today_stats.games_today,
            'wins', v_today_stats.wins_today
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get arcade leaderboard
CREATE OR REPLACE FUNCTION get_arcade_leaderboard(
    p_period TEXT DEFAULT 'daily',
    p_limit INTEGER DEFAULT 20
)
RETURNS JSONB AS $$
DECLARE
    v_period_start DATE;
    v_results JSONB;
BEGIN
    v_period_start := CASE p_period
        WHEN 'daily' THEN CURRENT_DATE
        WHEN 'weekly' THEN date_trunc('week', CURRENT_DATE)::DATE
        ELSE '2024-01-01'::DATE
    END;

    SELECT jsonb_agg(row_data ORDER BY rank)
    INTO v_results
    FROM (
        SELECT jsonb_build_object(
            'rank', ROW_NUMBER() OVER (ORDER BY l.total_profit DESC),
            'user_id', l.user_id,
            'username', p.username,
            'avatar_url', p.avatar_url,
            'total_profit', l.total_profit,
            'games_played', l.games_played,
            'games_won', l.games_won,
            'win_rate', ROUND((l.games_won::DECIMAL / NULLIF(l.games_played, 0)) * 100, 1),
            'highest_win', l.highest_single_win
        ) as row_data,
        ROW_NUMBER() OVER (ORDER BY l.total_profit DESC) as rank
        FROM arcade_leaderboard l
        JOIN profiles p ON p.id = l.user_id
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

ALTER TABLE arcade_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE arcade_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE arcade_daily_featured ENABLE ROW LEVEL SECURITY;
ALTER TABLE arcade_jackpot ENABLE ROW LEVEL SECURITY;
ALTER TABLE arcade_jackpot_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE arcade_daily_challenge ENABLE ROW LEVEL SECURITY;
ALTER TABLE arcade_daily_challenge_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE arcade_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE arcade_leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE arcade_questions ENABLE ROW LEVEL SECURITY;

-- Games are public read
CREATE POLICY "Games are public" ON arcade_games FOR SELECT USING (true);

-- Sessions are user-specific
CREATE POLICY "Users see own sessions" ON arcade_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create own sessions" ON arcade_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own sessions" ON arcade_sessions FOR UPDATE USING (auth.uid() = user_id);

-- Featured games are public
CREATE POLICY "Featured is public" ON arcade_daily_featured FOR SELECT USING (true);

-- Jackpot is public read
CREATE POLICY "Jackpot is public" ON arcade_jackpot FOR SELECT USING (true);

-- Jackpot entries are user-specific
CREATE POLICY "Users see own jackpot entries" ON arcade_jackpot_entries FOR SELECT USING (auth.uid() = user_id);

-- Daily challenge is public
CREATE POLICY "Challenge is public" ON arcade_daily_challenge FOR SELECT USING (true);
CREATE POLICY "Challenge entries public read" ON arcade_daily_challenge_entries FOR SELECT USING (true);
CREATE POLICY "Users create own entries" ON arcade_daily_challenge_entries FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Streaks are user-specific
CREATE POLICY "Users see own streaks" ON arcade_streaks FOR SELECT USING (auth.uid() = user_id);

-- Leaderboard is public
CREATE POLICY "Leaderboard is public" ON arcade_leaderboard FOR SELECT USING (true);

-- Questions are public (for gameplay)
CREATE POLICY "Questions are public" ON arcade_questions FOR SELECT USING (is_active = true);

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED INITIAL QUESTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Hand Snap questions (hand vs hand comparisons)
INSERT INTO arcade_questions (game_id, difficulty, question_type, question_data, correct_answer, explanation) VALUES
-- Easy comparisons
('hand-snap', 'easy', 'hand_comparison', '{"hand1": {"cards": ["As", "Ah"]}, "hand2": {"cards": ["Ks", "Kh"]}, "board": ["Qd", "Jc", "Tc", "2h", "3s"]}', '{"winner": 1}', 'Pocket Aces beat Pocket Kings on this board'),
('hand-snap', 'easy', 'hand_comparison', '{"hand1": {"cards": ["Ac", "Kc"]}, "hand2": {"cards": ["7h", "2d"]}, "board": ["Ah", "Kd", "5c", "9s", "Jh"]}', '{"winner": 1}', 'AK makes two pair, 72 has nothing'),
('hand-snap', 'easy', 'hand_comparison', '{"hand1": {"cards": ["Qh", "Qd"]}, "hand2": {"cards": ["Jc", "Js"]}, "board": ["9c", "8d", "2h", "5s", "3c"]}', '{"winner": 1}', 'Queens over Jacks'),
('hand-snap', 'medium', 'hand_comparison', '{"hand1": {"cards": ["Kh", "Qh"]}, "hand2": {"cards": ["Ah", "2h"]}, "board": ["Jh", "Th", "9h", "2c", "5d"]}', '{"winner": 1}', 'King-high flush beats Ace-high flush? No! KQ has a straight flush!'),
('hand-snap', 'medium', 'hand_comparison', '{"hand1": {"cards": ["8s", "8c"]}, "hand2": {"cards": ["Ac", "Kd"]}, "board": ["8h", "7d", "6c", "5s", "4h"]}', '{"winner": 2}', 'AK makes a straight, beats set of 8s'),
('hand-snap', 'hard', 'hand_comparison', '{"hand1": {"cards": ["Jd", "Td"]}, "hand2": {"cards": ["Qd", "9d"]}, "board": ["Kd", "8d", "2d", "3c", "5h"]}', '{"winner": 2}', 'Both have flushes, Q-high beats J-high'),
-- More hand snap questions
('hand-snap', 'easy', 'hand_comparison', '{"hand1": {"cards": ["Ac", "Ad"]}, "hand2": {"cards": ["Kc", "Qc"]}, "board": ["Jc", "Tc", "9c", "2h", "3s"]}', '{"winner": 2}', 'KQc makes a straight flush!'),
('hand-snap', 'medium', 'hand_comparison', '{"hand1": {"cards": ["9h", "9s"]}, "hand2": {"cards": ["Th", "Ts"]}, "board": ["9c", "Td", "Jh", "Qc", "Kd"]}', '{"winner": 2}', 'Both have sets but TTT beats 999'),
('hand-snap', 'hard', 'hand_comparison', '{"hand1": {"cards": ["Ah", "5h"]}, "hand2": {"cards": ["Kh", "Qh"]}, "board": ["2h", "3h", "4h", "9c", "Jd"]}', '{"winner": 1}', 'A5 makes wheel straight flush!');

-- Board Nuts questions
INSERT INTO arcade_questions (game_id, difficulty, question_type, question_data, correct_answer, explanation) VALUES
('board-nuts', 'easy', 'board_nuts', '{"board": ["Ah", "Kh", "Qh", "2c", "7d"], "options": [["Jh", "Th"], ["Ac", "Ad"], ["Kc", "Kd"], ["Qc", "Qd"]]}', '{"correct": 0}', 'JhTh makes the Royal Flush'),
('board-nuts', 'easy', 'board_nuts', '{"board": ["9c", "9d", "9h", "2s", "5c"], "options": [["9s", "As"], ["Ac", "Ad"], ["5d", "5h"], ["Kc", "Kd"]]}', '{"correct": 0}', 'Quad nines is the nuts'),
('board-nuts', 'medium', 'board_nuts', '{"board": ["Jc", "Tc", "9c", "8c", "2h"], "options": [["Qc", "7c"], ["Ac", "Kc"], ["7c", "6c"], ["Qc", "Kc"]]}', '{"correct": 0}', 'Qc7c makes the Queen-high straight flush'),
('board-nuts', 'medium', 'board_nuts', '{"board": ["Ah", "Kd", "Qc", "Js", "3h"], "options": [["Tc", "9d"], ["Ac", "Ad"], ["Kc", "Kh"], ["Ts", "Th"]]}', '{"correct": 0}', 'T9 makes Broadway straight'),
('board-nuts', 'hard', 'board_nuts', '{"board": ["7h", "6h", "5h", "4c", "3d"], "options": [["8h", "4h"], ["9c", "8c"], ["Ah", "2h"], ["8d", "8c"]]}', '{"correct": 0}', '8h4h makes the 8-high straight flush');

-- Chip Math (pot odds) questions
INSERT INTO arcade_questions (game_id, difficulty, question_type, question_data, correct_answer, explanation) VALUES
('chip-math', 'easy', 'pot_odds', '{"pot": 100, "bet": 50, "question": "What pot odds are you getting?"}', '{"answer": "3:1", "numeric": 3}', 'Pot is 100, call 50, getting 150:50 = 3:1'),
('chip-math', 'easy', 'pot_odds', '{"pot": 200, "bet": 100, "question": "What pot odds are you getting?"}', '{"answer": "3:1", "numeric": 3}', 'Pot is 200, call 100, getting 300:100 = 3:1'),
('chip-math', 'medium', 'pot_odds', '{"pot": 150, "bet": 75, "question": "What pot odds are you getting?"}', '{"answer": "3:1", "numeric": 3}', '225:75 = 3:1'),
('chip-math', 'medium', 'pot_odds', '{"pot": 500, "bet": 250, "equity_needed": true}', '{"answer": "33%", "numeric": 33}', 'Need 250/(500+250+250) = 25% equity'),
('chip-math', 'hard', 'pot_odds', '{"pot": 847, "bet": 423, "equity_needed": true}', '{"answer": "25%", "numeric": 25}', 'Need 423/(847+423+423) ≈ 25% equity');

-- Double or Nothing questions (single high-stakes questions)
INSERT INTO arcade_questions (game_id, difficulty, question_type, question_data, correct_answer, explanation) VALUES
('double-or-nothing', 'hard', 'gto_decision', '{"situation": "BTN opens 2.5bb, you are in BB with A5s. What is the GTO play?", "options": ["Fold", "Call", "3-bet to 10bb", "3-bet all-in"]}', '{"correct": 2}', 'A5s is a standard 3-bet from BB vs BTN open'),
('double-or-nothing', 'hard', 'gto_decision', '{"situation": "You have AA UTG 100bb deep. GTO open size?", "options": ["2bb", "2.5bb", "3bb", "Limp"]}', '{"correct": 1}', 'Standard UTG open is 2.5bb in most GTO solutions'),
('double-or-nothing', 'hard', 'gto_decision', '{"situation": "Flop Kh7h2c. You have AhQh in position vs a c-bet. GTO play?", "options": ["Fold", "Call", "Raise small", "Raise big"]}', '{"correct": 1}', 'AhQh has nut flush draw and overcards - call and realize equity');

-- Gauntlet questions (10 progressively harder questions)
INSERT INTO arcade_questions (game_id, difficulty, question_type, question_data, correct_answer, explanation) VALUES
('the-gauntlet', 'easy', 'quick_quiz', '{"question": "How many cards in a standard deck?", "options": ["48", "52", "54", "56"]}', '{"correct": 1}', '52 cards'),
('the-gauntlet', 'easy', 'quick_quiz', '{"question": "What beats a flush?", "options": ["Straight", "Three of a kind", "Full house", "Two pair"]}', '{"correct": 2}', 'Full house beats flush'),
('the-gauntlet', 'medium', 'quick_quiz', '{"question": "In NLHE, if you have AK and the board is AKQJT rainbow, what do you have?", "options": ["Two pair", "Straight", "Full house", "Broadway"]}', '{"correct": 1}', 'The board plays - everyone has a straight'),
('the-gauntlet', 'medium', 'quick_quiz', '{"question": "What is the minimum raise in NLHE if villain bets 100?", "options": ["100", "150", "200", "Any amount"]}', '{"correct": 0}', 'Minimum raise is the size of the last bet/raise'),
('the-gauntlet', 'hard', 'quick_quiz', '{"question": "AKo vs 22 all-in preflop. Who is the favorite?", "options": ["AKo ~55%", "22 ~55%", "50/50", "AKo ~65%"]}', '{"correct": 1}', '22 is a slight favorite ~52-55%');

-- Mystery Box questions
INSERT INTO arcade_questions (game_id, difficulty, question_type, question_data, correct_answer, explanation) VALUES
('mystery-box', 'medium', 'mystery', '{"question": "What is the nickname for pocket Jacks?", "options": ["Hooks", "Fishhooks", "Brothers", "All of the above"]}', '{"correct": 0}', 'JJ is called Hooks or Fishhooks'),
('mystery-box', 'medium', 'mystery', '{"question": "The dead mans hand is Aces and..?", "options": ["Kings", "Queens", "Eights", "Twos"]}', '{"correct": 2}', 'Aces and Eights - Wild Bill Hickoks final hand'),
('mystery-box', 'medium', 'mystery', '{"question": "What position acts first post-flop?", "options": ["Button", "Small Blind", "Big Blind", "UTG"]}', '{"correct": 1}', 'Small blind acts first post-flop');

-- ════════════════════════════════════════════════════════════════════════════════
-- CREATE MISSING TABLES — 23 Tables for Smarter Poker World Hub
-- ════════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────────
-- 1. user_preferences - Store user preferences and settings
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    preferences JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id)
);
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_preferences" ON user_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_update_own_preferences" ON user_preferences FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_preferences" ON user_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- 2. training_streaks - Track training session streaks
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_streaks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_session_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id)
);
ALTER TABLE training_streaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_streaks" ON training_streaks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_update_own_streaks" ON training_streaks FOR UPDATE USING (auth.uid() = user_id);
CREATE INDEX idx_training_streaks_user_id ON training_streaks(user_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- 3. training_scenarios - Individual training scenarios/questions
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    scenario_data JSONB,
    difficulty_level INTEGER DEFAULT 1,
    category TEXT,
    use_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE training_scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_read_scenarios" ON training_scenarios FOR SELECT USING (true);
CREATE INDEX idx_training_scenarios_difficulty ON training_scenarios(difficulty_level);
CREATE INDEX idx_training_scenarios_category ON training_scenarios(category);

-- ───────────────────────────────────────────────────────────────────────────────
-- 4. training_achievement_definitions - Define available achievements
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_achievement_definitions (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    icon_url TEXT,
    threshold INTEGER DEFAULT 0,
    reward_diamonds INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE training_achievement_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_read_achievements" ON training_achievement_definitions FOR SELECT USING (true);
CREATE INDEX idx_training_achievements_category ON training_achievement_definitions(category);

-- ───────────────────────────────────────────────────────────────────────────────
-- 5. user_sessions - Track user sessions for multi-device support
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_name TEXT,
    ip_address INET,
    user_agent TEXT,
    last_active TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, device_name, ip_address)
);
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_sessions" ON user_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_last_active ON user_sessions(user_id, last_active);

-- ───────────────────────────────────────────────────────────────────────────────
-- 6. user_mfa_factors - Store MFA/2FA configuration
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_mfa_factors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    secret TEXT NOT NULL,
    enabled BOOLEAN DEFAULT false,
    backup_codes TEXT[] DEFAULT ARRAY[]::TEXT[],
    disabled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id)
);
ALTER TABLE user_mfa_factors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_mfa" ON user_mfa_factors FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX idx_user_mfa_factors_user_id ON user_mfa_factors(user_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- 7. commander_tournament_templates - Tournament template definitions
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commander_tournament_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID NOT NULL,
    name TEXT NOT NULL,
    tournament_type TEXT,
    buyin_amount NUMERIC(10,2),
    buyin_fee NUMERIC(10,2),
    starting_chips INTEGER,
    blind_structure JSONB,
    break_schedule JSONB,
    payout_structure JSONB,
    late_registration_levels INTEGER,
    allows_rebuys BOOLEAN DEFAULT false,
    rebuy_amount NUMERIC(10,2),
    rebuy_chips INTEGER,
    max_rebuys INTEGER,
    rebuy_end_level INTEGER,
    allows_addon BOOLEAN DEFAULT false,
    addon_amount NUMERIC(10,2),
    addon_chips INTEGER,
    max_entries INTEGER,
    settings JSONB,
    leaderboard_id UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE commander_tournament_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_read_templates" ON commander_tournament_templates FOR SELECT USING (true);
CREATE INDEX idx_commander_tournament_templates_venue ON commander_tournament_templates(venue_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- 8. commander_tournament_points - Track leaderboard points in tournaments
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commander_tournament_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL,
    player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    player_name TEXT,
    points INTEGER DEFAULT 0,
    finish_position INTEGER,
    entry_points INTEGER DEFAULT 0,
    rebuy_count INTEGER DEFAULT 0,
    addon_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE commander_tournament_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_read_points" ON commander_tournament_points FOR SELECT USING (true);
CREATE INDEX idx_commander_tournament_points_tournament ON commander_tournament_points(tournament_id);
CREATE INDEX idx_commander_tournament_points_player ON commander_tournament_points(player_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- 9. geeves_conversations - Poker strategy conversation history
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geeves_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE geeves_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_conversations" ON geeves_conversations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_create_conversations" ON geeves_conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_geeves_conversations_user_id ON geeves_conversations(user_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- 10. geeves_knowledge_cache - Cache of poker strategy answers
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geeves_knowledge_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_hash TEXT NOT NULL UNIQUE,
    query_text TEXT,
    answer_content TEXT,
    source TEXT,
    rating_sum INTEGER DEFAULT 0,
    total_ratings INTEGER DEFAULT 0,
    avg_rating NUMERIC(3,2),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE geeves_knowledge_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_read_cache" ON geeves_knowledge_cache FOR SELECT USING (true);
CREATE INDEX idx_geeves_knowledge_cache_query_hash ON geeves_knowledge_cache(query_hash);

-- ───────────────────────────────────────────────────────────────────────────────
-- 11. geeves_answer_ratings - User ratings of Geeves answers
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geeves_answer_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cache_id UUID NOT NULL REFERENCES geeves_knowledge_cache(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    feedback TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(cache_id, user_id)
);
ALTER TABLE geeves_answer_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_ratings" ON geeves_answer_ratings FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX idx_geeves_answer_ratings_user_id ON geeves_answer_ratings(user_id);
CREATE INDEX idx_geeves_answer_ratings_cache_id ON geeves_answer_ratings(cache_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- 12. god_mode_questions - Training questions for God Mode arena
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS god_mode_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL,
    question_text TEXT NOT NULL,
    question_data JSONB,
    difficulty INTEGER DEFAULT 1,
    correct_answer TEXT,
    explanation TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE god_mode_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_read_questions" ON god_mode_questions FOR SELECT USING (true);
CREATE INDEX idx_god_mode_questions_game_id ON god_mode_questions(game_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- 13. endless_high_scores - High scores for endless trivia mode
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS endless_high_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    high_score INTEGER DEFAULT 0,
    questions_answered INTEGER DEFAULT 0,
    accuracy NUMERIC(5,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id)
);
ALTER TABLE endless_high_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_scores" ON endless_high_scores FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "anyone_read_leaderboard" ON endless_high_scores FOR SELECT USING (true);
CREATE INDEX idx_endless_high_scores_user_id ON endless_high_scores(user_id);
CREATE INDEX idx_endless_high_scores_score ON endless_high_scores(high_score DESC);

-- ───────────────────────────────────────────────────────────────────────────────
-- 14. hand_private_state - Store private hand state in poker games
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hand_private_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hand_id UUID NOT NULL,
    player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    hole_cards TEXT,
    hand_strength TEXT,
    private_data JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE hand_private_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_hands" ON hand_private_state FOR SELECT USING (auth.uid() = player_id);
CREATE INDEX idx_hand_private_state_player_id ON hand_private_state(player_id);
CREATE INDEX idx_hand_private_state_hand_id ON hand_private_state(hand_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- 15. horse_relationships - Track relationships between content creator "horses"
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS horse_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id BIGINT NOT NULL,
    target_author_id BIGINT NOT NULL,
    relationship_type TEXT DEFAULT 'neutral',
    sentiment_score NUMERIC(3,2) DEFAULT 0,
    total_interactions INTEGER DEFAULT 0,
    positive_interactions INTEGER DEFAULT 0,
    negative_interactions INTEGER DEFAULT 0,
    last_interaction_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(author_id, target_author_id)
);
ALTER TABLE horse_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_read_relationships" ON horse_relationships FOR SELECT USING (true);
CREATE INDEX idx_horse_relationships_author ON horse_relationships(author_id);
CREATE INDEX idx_horse_relationships_target ON horse_relationships(target_author_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- 16. leak_hand_examples - Example hands showing specific leaks
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leak_hand_examples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    leak_id UUID NOT NULL,
    hand_history_id UUID NOT NULL,
    hand_data JSONB,
    situation_class TEXT,
    ev_loss NUMERIC(8,2),
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE leak_hand_examples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_read_examples" ON leak_hand_examples FOR SELECT USING (true);
CREATE INDEX idx_leak_hand_examples_leak_id ON leak_hand_examples(leak_id);
CREATE INDEX idx_leak_hand_examples_hand_id ON leak_hand_examples(hand_history_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- 17. newsletter_subscribers - Email newsletter subscriptions
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    subscribed_at TIMESTAMPTZ DEFAULT now(),
    unsubscribed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_subscription" ON newsletter_subscribers FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
CREATE INDEX idx_newsletter_subscribers_email ON newsletter_subscribers(email);
CREATE INDEX idx_newsletter_subscribers_user_id ON newsletter_subscribers(user_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- 18. tournament_alert_preferences - User preferences for tournament alerts
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournament_alert_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    min_buyin NUMERIC(10,2) DEFAULT 0,
    max_buyin NUMERIC(10,2),
    preferred_formats TEXT[] DEFAULT ARRAY[]::TEXT[],
    venues_filter TEXT[] DEFAULT ARRAY[]::TEXT[],
    notify_via_email BOOLEAN DEFAULT true,
    notify_via_push BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id)
);
ALTER TABLE tournament_alert_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_preferences" ON tournament_alert_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX idx_tournament_alert_preferences_user_id ON tournament_alert_preferences(user_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- 19. survival_progress - Track progress in survival trivia game
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS survival_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    highest_level INTEGER DEFAULT 0,
    last_played TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id)
);
ALTER TABLE survival_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_progress" ON survival_progress FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX idx_survival_progress_user_id ON survival_progress(user_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- 20. trivia_survival_runs - Individual survival game runs
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trivia_survival_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    level_reached INTEGER DEFAULT 0,
    correct_count INTEGER DEFAULT 0,
    incorrect_count INTEGER DEFAULT 0,
    diamonds_earned INTEGER DEFAULT 0,
    run_data JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE trivia_survival_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_runs" ON trivia_survival_runs FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX idx_trivia_survival_runs_user_id ON trivia_survival_runs(user_id);
CREATE INDEX idx_trivia_survival_runs_created ON trivia_survival_runs(user_id, created_at);

-- ───────────────────────────────────────────────────────────────────────────────
-- 21. user_poker_stats - Aggregate poker statistics per user
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_poker_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    hands_played INTEGER DEFAULT 0,
    vpip NUMERIC(5,2) DEFAULT 0,
    pfr NUMERIC(5,2) DEFAULT 0,
    aggression_factor NUMERIC(5,2) DEFAULT 0,
    cbet_freq NUMERIC(5,2) DEFAULT 0,
    fold_to_cbet NUMERIC(5,2) DEFAULT 0,
    check_raise_freq NUMERIC(5,2) DEFAULT 0,
    river_bluff_freq NUMERIC(5,2) DEFAULT 0,
    total_profit NUMERIC(12,2) DEFAULT 0,
    stats_data JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id)
);
ALTER TABLE user_poker_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_stats" ON user_poker_stats FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX idx_user_poker_stats_user_id ON user_poker_stats(user_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- 22. video_analysis - Store video analysis sessions
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS video_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    video_url TEXT NOT NULL,
    analysis_type TEXT,
    analysis_data JSONB,
    ai_feedback TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE video_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_analysis" ON video_analysis FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX idx_video_analysis_user_id ON video_analysis(user_id);
CREATE INDEX idx_video_analysis_status ON video_analysis(status);

-- ───────────────────────────────────────────────────────────────────────────────
-- 23. venues - Poker room venues
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS venues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    city TEXT,
    state TEXT,
    zip_code TEXT,
    country TEXT,
    status TEXT DEFAULT 'active',
    logo_url TEXT,
    address TEXT,
    phone TEXT,
    website TEXT,
    description TEXT,
    venue_data JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_read_venues" ON venues FOR SELECT USING (true);
CREATE INDEX idx_venues_city ON venues(city);
CREATE INDEX idx_venues_state ON venues(state);
CREATE INDEX idx_venues_status ON venues(status);
CREATE INDEX idx_venues_name ON venues(name);

-- ════════════════════════════════════════════════════════════════════════════════
-- END OF SCHEMA CREATION
-- ════════════════════════════════════════════════════════════════════════════════

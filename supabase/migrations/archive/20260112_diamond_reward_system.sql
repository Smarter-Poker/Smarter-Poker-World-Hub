-- ═══════════════════════════════════════════════════════════════════════════
-- YELLOW BALL: DIAMOND REWARD SYSTEM V1.0
-- Complete reward tracking with daily caps, streaks, and easter eggs
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. REWARD DEFINITIONS — All possible rewards
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reward_definitions (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL CHECK (category IN ('standard', 'easter_egg')),
    subcategory TEXT, -- For easter eggs: 'performance', 'timing_loyalty', 'strategy_mastery', 'social_viral', 'meta_interface', 'legacy_milestones'
    name TEXT NOT NULL,
    description TEXT,
    base_amount INTEGER NOT NULL,
    max_amount INTEGER, -- For variable rewards like daily_login
    is_repeatable BOOLEAN DEFAULT FALSE,
    cooldown_hours INTEGER DEFAULT 0, -- 0 = once per day, NULL = one-time only
    bypasses_cap BOOLEAN DEFAULT FALSE, -- referral_success bypasses daily cap
    rarity TEXT DEFAULT 'common' CHECK (rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary')),
    icon TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. USER REWARD CLAIMS — Track all claimed rewards
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reward_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reward_id TEXT NOT NULL REFERENCES reward_definitions(id),
    diamonds_awarded INTEGER NOT NULL,
    multiplier DECIMAL(3,2) DEFAULT 1.0,
    bypassed_cap BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}', -- Store context like streak day, level, etc.
    claimed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_reward_claims_user_date ON reward_claims(user_id, claimed_at);
CREATE INDEX IF NOT EXISTS idx_reward_claims_reward ON reward_claims(reward_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. USER DAILY STATS — Track daily earnings and caps
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_daily_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stat_date DATE NOT NULL DEFAULT CURRENT_DATE,
    diamonds_earned INTEGER DEFAULT 0,
    diamonds_earned_bypassed INTEGER DEFAULT 0, -- Referrals that bypassed cap
    login_streak INTEGER DEFAULT 0,
    first_training_completed BOOLEAN DEFAULT FALSE,
    perfect_scores_today INTEGER DEFAULT 0,
    levels_completed_today INTEGER DEFAULT 0,
    social_posts_today INTEGER DEFAULT 0,
    strategy_comments_today INTEGER DEFAULT 0,
    chart_study_minutes INTEGER DEFAULT 0,
    training_questions_answered INTEGER DEFAULT 0,
    easter_eggs_found TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, stat_date)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. USER EASTER EGG PROGRESS — Track permanent achievements
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_easter_eggs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    egg_id TEXT NOT NULL REFERENCES reward_definitions(id),
    progress INTEGER DEFAULT 0, -- For progressive achievements
    target INTEGER DEFAULT 1,
    unlocked BOOLEAN DEFAULT FALSE,
    unlocked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, egg_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. STREAK TRACKING — Dedicated table for login streaks
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_streaks (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_login_date DATE,
    streak_started_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- INSERT STANDARD REWARD DEFINITIONS
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO reward_definitions (id, category, name, description, base_amount, max_amount, is_repeatable, cooldown_hours, bypasses_cap, rarity, icon) VALUES
-- STANDARD PAYOUTS
('daily_login', 'standard', 'Daily Login', 'Login bonus that scales with streak (5-50 diamonds)', 5, 50, TRUE, 24, FALSE, 'common', '📅'),
('first_training_of_day', 'standard', 'First Training', 'Complete your first training session of the day', 25, NULL, TRUE, 24, FALSE, 'common', '🎯'),
('level_completion_85', 'standard', 'Level Mastery', 'Complete a level with 85%+ accuracy', 10, NULL, TRUE, 0, FALSE, 'common', '✅'),
('perfect_score_bonus', 'standard', 'Perfect Score', 'Bonus for 100% accuracy on a level', 5, NULL, TRUE, 0, FALSE, 'uncommon', '💯'),
('new_level_unlocked', 'standard', 'Level Unlocked', 'Unlock a new training level', 50, NULL, TRUE, 0, FALSE, 'uncommon', '🔓'),
('social_post_share', 'standard', 'Share Post', 'Share a hand, achievement, or thought', 15, NULL, TRUE, 0, FALSE, 'common', '📝'),
('strategy_comment', 'standard', 'Strategy Comment', 'Leave a thoughtful strategy comment', 5, NULL, TRUE, 0, FALSE, 'common', '💬'),
('xp_level_up', 'standard', 'XP Level Up', 'Reach a new XP level', 100, NULL, TRUE, 0, FALSE, 'rare', '⬆️'),
('gto_chart_study', 'standard', 'Chart Study', 'Study GTO charts for 3+ minutes', 10, NULL, TRUE, 0, FALSE, 'common', '📊'),
('referral_success', 'standard', 'Successful Referral', 'Refer a friend who verifies email & phone', 500, NULL, TRUE, 0, TRUE, 'epic', '👥')

ON CONFLICT (id) DO UPDATE SET
    description = EXCLUDED.description,
    base_amount = EXCLUDED.base_amount,
    max_amount = EXCLUDED.max_amount;

-- ═══════════════════════════════════════════════════════════════════════════
-- INSERT EASTER EGG DEFINITIONS (1-10: Performance)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO reward_definitions (id, category, subcategory, name, description, base_amount, is_repeatable, rarity, icon) VALUES
-- 1-10 PERFORMANCE
('egg_gto_machine', 'easter_egg', 'performance', 'GTO Machine', '100 questions, no hints', 100, FALSE, 'epic', '🤖'),
('egg_speed_demon', 'easter_egg', 'performance', 'Speed Demon', '20 correct answers < 3s each', 50, FALSE, 'rare', '⚡'),
('egg_optimizer', 'easter_egg', 'performance', 'The Optimizer', 'First-try fix on a Leak Signal', 40, FALSE, 'uncommon', '🔧'),
('egg_dead_reckoning', 'easter_egg', 'performance', 'Dead Reckoning', 'Level 5+ pass with 100% on first try', 200, FALSE, 'legendary', '🎯'),
('egg_calculated_risk', 'easter_egg', 'performance', 'Calculated Risk', '5 consecutive close-to-GTO alternate lines', 30, FALSE, 'uncommon', '📐'),
('egg_deep_diver', 'easter_egg', 'performance', 'Deep Diver', '60+ mins in Charts section in one day', 60, FALSE, 'rare', '🤿'),
('egg_night_owl', 'easter_egg', 'performance', 'The Night Owl', 'Complete training between 2AM-5AM', 50, FALSE, 'rare', '🦉'),
('egg_perfectionist', 'easter_egg', 'performance', 'The Perfectionist', '5 consecutive levels with 0 errors', 150, FALSE, 'epic', '✨'),
('egg_comeback_kid', 'easter_egg', 'performance', 'The Comeback Kid', 'Pass with 95% after 2 fails', 75, FALSE, 'rare', '💪'),
('egg_chart_navigator', 'easter_egg', 'performance', 'Chart Navigator', 'Interact with 10 charts in 5 mins', 30, FALSE, 'uncommon', '🗺️'),

-- 11-25 TIMING & LOYALTY
('egg_sunrise_grinder', 'easter_egg', 'timing_loyalty', 'Sunrise Grinder', 'Training at local sunrise time', 50, FALSE, 'rare', '🌅'),
('egg_anniversary', 'easter_egg', 'timing_loyalty', 'The Anniversary', 'Login 1 month to the minute after signup', 100, FALSE, 'epic', '🎂'),
('egg_lunch_break', 'easter_egg', 'timing_loyalty', 'Lunch Break', '3 games between 12PM-1PM', 20, FALSE, 'common', '🥪'),
('egg_weekend_warrior', 'easter_egg', 'timing_loyalty', 'Weekend Warrior', 'Hit 500 cap on Sat & Sun', 150, FALSE, 'epic', '⚔️'),
('egg_new_year', 'easter_egg', 'timing_loyalty', 'New Year, New Ranges', 'Play on Jan 1st', 203, FALSE, 'rare', '🎆'),
('egg_solidarity', 'easter_egg', 'timing_loyalty', 'Solidarity', 'Login at same time as 3 referrals', 75, FALSE, 'rare', '🤝'),
('egg_button_masher', 'easter_egg', 'timing_loyalty', 'Button Masher', 'Click logo 10 times rapidly', 5, FALSE, 'common', '👆'),
('egg_dark_mode_detective', 'easter_egg', 'timing_loyalty', 'Dark Mode Detective', 'Toggle theme 5 times in 10s', 10, FALSE, 'common', '🕵️'),
('egg_librarian', 'easter_egg', 'timing_loyalty', 'The Librarian', 'Search 20 specific player/game types', 30, FALSE, 'uncommon', '📚'),
('egg_precision_pointer', 'easter_egg', 'timing_loyalty', 'Precision Pointer', 'Hover every chart element before move', 15, FALSE, 'common', '🎯'),
('egg_explorer', 'easter_egg', 'timing_loyalty', 'The Explorer', 'Click every tab in Manager < 30s', 25, FALSE, 'uncommon', '🧭'),
('egg_jackpot', 'easter_egg', 'timing_loyalty', 'The Jackpot', '1/1000 chance Diamond Crit', 45, TRUE, 'legendary', '🎰'),
('egg_binary_king', 'easter_egg', 'timing_loyalty', 'Binary King', 'End day with 101 or 010 Diamonds', 20, FALSE, 'uncommon', '👑'),
('egg_developers_handshake', 'easter_egg', 'timing_loyalty', 'Developer''s Handshake', 'Scroll to bottom of Credits', 50, FALSE, 'rare', '🤝'),
('egg_ghost', 'easter_egg', 'timing_loyalty', 'The Ghost', '30-day streak with no missed tasks', 500, FALSE, 'legendary', '👻'),

-- 26-45 STRATEGY & MASTERY
('egg_machine', 'easter_egg', 'strategy_mastery', 'The Machine', '50-question session, median time < 1.5s', 100, FALSE, 'epic', '⚙️'),
('egg_pure_strategy', 'easter_egg', 'strategy_mastery', 'Pure Strategy', 'Pick 100% freq move 25 times in a row', 75, FALSE, 'rare', '♟️'),
('egg_mix_master', 'easter_egg', 'strategy_mastery', 'Mix Master', 'Identify 5 mixed strategies in a row', 50, FALSE, 'rare', '🎚️'),
('egg_punisher', 'easter_egg', 'strategy_mastery', 'The Punisher', 'Play correctly vs simulated whale line 10x', 40, FALSE, 'uncommon', '💀'),
('egg_folding_legend', 'easter_egg', 'strategy_mastery', 'Folding Legend', 'Find a GTO Fold with Top Pair', 60, FALSE, 'rare', '🃏'),
('egg_value_extractor', 'easter_egg', 'strategy_mastery', 'Value Extractor', 'Maximize EV in one level', 80, FALSE, 'epic', '💰'),
('egg_bluffcatcher', 'easter_egg', 'strategy_mastery', 'The Bluffcatcher', 'Correct call on triple-barrel bluff', 50, FALSE, 'rare', '🎣'),
('egg_range_architect', 'easter_egg', 'strategy_mastery', 'Range Architect', 'View full range of 1 position 50x', 40, FALSE, 'uncommon', '🏗️'),
('egg_equity_expert', 'easter_egg', 'strategy_mastery', 'Equity Expert', 'Guess equity within 2%', 30, FALSE, 'uncommon', '📈'),
('egg_blocker_pro', 'easter_egg', 'strategy_mastery', 'Blocker Pro', 'Win hand using specific blocker info', 45, FALSE, 'rare', '🛡️'),
('egg_overbet_outlaw', 'easter_egg', 'strategy_mastery', 'Overbet Outlaw', 'Execute 2x Pot overbet correctly', 35, FALSE, 'rare', '🤠'),
('egg_minimum_defense', 'easter_egg', 'strategy_mastery', 'Minimum Defense', 'Identify MDF correctly 3x', 55, FALSE, 'rare', '🛡️'),
('egg_sniper', 'easter_egg', 'strategy_mastery', 'The Sniper', 'Pass level with < 10s total on clock', 150, FALSE, 'legendary', '🎯'),
('egg_check_raise_king', 'easter_egg', 'strategy_mastery', 'Check-Raise King', 'Find 10 check-raise lines in 1 session', 40, FALSE, 'uncommon', '👑'),
('egg_tanker', 'easter_egg', 'strategy_mastery', 'The Tanker', 'Spend exactly 29s on a question', 20, FALSE, 'common', '⏱️'),
('egg_postflop_wizard', 'easter_egg', 'strategy_mastery', 'Post-Flop Wizard', '0 missed Turn/River decisions for 24h', 100, FALSE, 'epic', '🧙'),
('egg_preflop_bot', 'easter_egg', 'strategy_mastery', 'Pre-Flop Bot', '500 pre-flop decisions at 100% accuracy', 250, FALSE, 'legendary', '🤖'),
('egg_small_baller', 'easter_egg', 'strategy_mastery', 'Small Baller', 'Win level using only 33% pot sizing', 30, FALSE, 'uncommon', '🏀'),
('egg_polarizer', 'easter_egg', 'strategy_mastery', 'Polarizer', 'Identify polarized vs condensed range', 50, FALSE, 'rare', '⚡'),
('egg_indifference_point', 'easter_egg', 'strategy_mastery', 'Indifference Point', 'Make opponent EV zero', 100, FALSE, 'epic', '⚖️')

ON CONFLICT (id) DO NOTHING;

-- Continue Easter Eggs (46-65: Social/Viral)
INSERT INTO reward_definitions (id, category, subcategory, name, description, base_amount, is_repeatable, rarity, icon) VALUES
('egg_retweet_royalty', 'easter_egg', 'social_viral', 'Retweet Royalty', 'Developer shares your post', 500, FALSE, 'legendary', '👑'),
('egg_hashtag_hero', 'easter_egg', 'social_viral', 'Hashtag Hero', 'Use 3 main tags in 10 posts', 50, FALSE, 'uncommon', '#️⃣'),
('egg_recruiter', 'easter_egg', 'social_viral', 'The Recruiter', '2 referrals reach Level 5 same day', 200, FALSE, 'epic', '🎖️'),
('egg_video_star', 'easter_egg', 'social_viral', 'Video Star', 'Post Mac Studio Terminal use', 150, FALSE, 'rare', '🎬'),
('egg_comment_king', 'easter_egg', 'social_viral', 'Comment King', 'Strategy comment reaches 50 likes', 100, FALSE, 'rare', '💬'),
('egg_squad_goals', 'easter_egg', 'social_viral', 'Squad Goals', '5 referrals active simultaneously', 250, FALSE, 'epic', '👥'),
('egg_wall_of_fame', 'easter_egg', 'social_viral', 'Wall of Fame', 'Featured on Daily Top Grinder', 300, FALSE, 'legendary', '🏆'),
('egg_discord_diamond', 'easter_egg', 'social_viral', 'Discord Diamond', 'Reach Active role in Discord', 50, FALSE, 'uncommon', '💎'),
('egg_streamer', 'easter_egg', 'social_viral', 'Streamer''s Luck', 'Stream Orb for 1 hour', 200, FALSE, 'epic', '📺'),
('egg_ghost_writer', 'easter_egg', 'social_viral', 'The Ghost Writer', 'Tip added to loading screen', 500, FALSE, 'legendary', '✍️'),
('egg_feedback_loop', 'easter_egg', 'social_viral', 'Feedback Loop', 'Submit bug that gets fixed', 300, FALSE, 'epic', '🐛'),
('egg_social_butterfly', 'easter_egg', 'social_viral', 'Social Butterfly', 'Share a loss/learning moment', 40, FALSE, 'common', '🦋'),
('egg_stalking_success', 'easter_egg', 'social_viral', 'Stalking Success', 'Follow all 4 Agent accounts', 25, FALSE, 'common', '👀'),
('egg_bio_hacker', 'easter_egg', 'social_viral', 'Bio Hacker', 'Orb URL in social bio', 100, FALSE, 'rare', '🔗'),
('egg_group_chat_leader', 'easter_egg', 'social_viral', 'Group Chat Leader', 'Invite 3 to private study group', 60, FALSE, 'uncommon', '💬'),
('egg_diplomat', 'easter_egg', 'social_viral', 'The Diplomat', 'Refer someone from different country', 150, FALSE, 'rare', '🌍'),
('egg_meme_lord', 'easter_egg', 'social_viral', 'Meme Lord', 'Meme gets 20+ likes', 100, FALSE, 'rare', '😂'),
('egg_poll_master', 'easter_egg', 'social_viral', 'Poll Master', 'Vote in 10 Hand of the Day polls', 30, FALSE, 'common', '📊'),
('egg_ambassador', 'easter_egg', 'social_viral', 'The Ambassador', 'Reach 20 successful referrals', 1000, FALSE, 'legendary', '🏅'),
('egg_storyteller', 'easter_egg', 'social_viral', 'Storyteller', 'Share Level Up to IG/FB Story', 40, FALSE, 'common', '📱')

ON CONFLICT (id) DO NOTHING;

-- Easter Eggs (66-85: Meta/Interface)
INSERT INTO reward_definitions (id, category, subcategory, name, description, base_amount, is_repeatable, rarity, icon) VALUES
('egg_konami_code', 'easter_egg', 'meta_interface', 'Konami Code', 'Enter Up-Up-Down-Down on dash', 50, FALSE, 'rare', '🎮'),
('egg_terminal_junkie', 'easter_egg', 'meta_interface', 'Terminal Junkie', '10 commands without mouse', 75, FALSE, 'rare', '⌨️'),
('egg_collector', 'easter_egg', 'meta_interface', 'The Collector', 'Own 3 Orange Ball skins', 100, FALSE, 'epic', '🎨'),
('egg_deep_sleeper', 'easter_egg', 'meta_interface', 'Deep Sleeper', 'Leave Orb open for 24 hours', 50, FALSE, 'uncommon', '😴'),
('egg_efficiency_expert', 'easter_egg', 'meta_interface', 'Efficiency Expert', 'Login to Game in < 2s', 20, FALSE, 'common', '⚡'),
('egg_volume_control', 'easter_egg', 'meta_interface', 'Volume Control', 'Toggle mute 10 times in a heater', 5, FALSE, 'common', '🔊'),
('egg_window_shopper', 'easter_egg', 'meta_interface', 'Window Shopper', 'View store 5 days, buy nothing', 25, FALSE, 'uncommon', '🛍️'),
('egg_data_miner', 'easter_egg', 'meta_interface', 'Data Miner', 'Export hand history 10 times', 50, FALSE, 'rare', '⛏️'),
('egg_cleaner', 'easter_egg', 'meta_interface', 'The Cleaner', 'Clear all notifications', 10, FALSE, 'common', '🧹'),
('egg_zoomer', 'easter_egg', 'meta_interface', 'Zoomer', 'Change UI scaling 3 times', 15, FALSE, 'common', '🔍'),
('egg_ghost_user', 'easter_egg', 'meta_interface', 'The Ghost User', 'Login via Incognito mode', 20, FALSE, 'uncommon', '👻'),
('egg_toggle_titan', 'easter_egg', 'meta_interface', 'Toggle Titan', '50 Search filter switches', 30, FALSE, 'uncommon', '🎚️'),
('egg_scroll_marathon', 'easter_egg', 'meta_interface', 'Scroll Marathon', 'Scroll to bottom of leaderboard', 40, FALSE, 'common', '📜'),
('egg_architect', 'easter_egg', 'meta_interface', 'The Architect', 'Customize Dashboard layout', 50, FALSE, 'uncommon', '🏗️'),
('egg_multi_tabber', 'easter_egg', 'meta_interface', 'Multi-Tabber', '4 charts open in 4 windows', 100, FALSE, 'epic', '📑'),
('egg_refresh_rebel', 'easter_egg', 'meta_interface', 'Refresh Rebel', 'Refresh during loading screen', 5, FALSE, 'common', '🔄'),
('egg_hardware_enthusiast', 'easter_egg', 'meta_interface', 'Hardware Enthusiast', 'Access from 3 different IPs', 50, FALSE, 'rare', '💻'),
('egg_waiter', 'easter_egg', 'meta_interface', 'The Waiter', 'Wait 5 mins on Reward screen', 20, FALSE, 'uncommon', '⏳'),
('egg_minimalist', 'easter_egg', 'meta_interface', 'The Minimalist', 'Play with 0 HUD elements', 100, FALSE, 'epic', '🎯'),
('egg_color_blind', 'easter_egg', 'meta_interface', 'Color Blind', 'Change Yellow Ball to custom color', 30, FALSE, 'uncommon', '🎨')

ON CONFLICT (id) DO NOTHING;

-- Easter Eggs (86-100: Legacy/Milestones)
INSERT INTO reward_definitions (id, category, subcategory, name, description, base_amount, is_repeatable, rarity, icon) VALUES
('egg_centurion', 'easter_egg', 'legacy_milestones', 'The Centurion', '100-day login streak', 1000, FALSE, 'legendary', '💯'),
('egg_millionaire', 'easter_egg', 'legacy_milestones', 'Millionaire', '1,000,000 lifetime XP', 2500, FALSE, 'legendary', '💰'),
('egg_old_guard', 'easter_egg', 'legacy_milestones', 'Old Guard', 'Member for 1 year', 500, FALSE, 'epic', '🛡️'),
('egg_finisher', 'easter_egg', 'legacy_milestones', 'The Finisher', 'Complete every training game in DB', 2000, FALSE, 'legendary', '🏁'),
('egg_zero_leak', 'easter_egg', 'legacy_milestones', 'Zero Leak', '1,000 hands with no leak signals', 1500, FALSE, 'legendary', '💧'),
('egg_high_roller', 'easter_egg', 'legacy_milestones', 'High Roller', 'Spend 10k Diamonds in one day', 500, FALSE, 'epic', '🎲'),
('egg_oracle', 'easter_egg', 'legacy_milestones', 'The Oracle', 'Predict 10 GTO moves in a row', 300, FALSE, 'epic', '🔮'),
('egg_server_first', 'easter_egg', 'legacy_milestones', 'Server First', 'Be the first to pass a new level', 200, FALSE, 'rare', '🥇'),
('egg_diamond_hands', 'easter_egg', 'legacy_milestones', 'Diamond Hands', 'Hold 5k+ Diamonds for 30 days', 400, FALSE, 'epic', '💎'),
('egg_whale', 'easter_egg', 'legacy_milestones', 'The Whale', 'Reach 100 Referrals', 10000, FALSE, 'legendary', '🐋'),
('egg_beta_tester', 'easter_egg', 'legacy_milestones', 'Beta Tester', 'User ID within first 500 signups', 500, FALSE, 'epic', '🧪'),
('egg_level_100_boss', 'easter_egg', 'legacy_milestones', 'Level 100 Boss', 'Reach Level 100', 1000, FALSE, 'legendary', '👑'),
('egg_multi_level_master', 'easter_egg', 'legacy_milestones', 'Multi-Level Master', 'Clear 10 levels in 1 hour', 250, FALSE, 'epic', '⚡'),
('egg_daily_legend', 'easter_egg', 'legacy_milestones', 'Daily Legend', 'Hit 500 cap 30 days in a row', 1000, FALSE, 'legendary', '🌟'),
('egg_infinity', 'easter_egg', 'legacy_milestones', 'To Infinity', 'Earn 1,000,000 total diamonds', 5000, FALSE, 'legendary', '♾️')

ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTIONS: REWARD CLAIMING WITH RULES
-- ═══════════════════════════════════════════════════════════════════════════

-- Calculate streak multiplier
CREATE OR REPLACE FUNCTION get_streak_multiplier(streak_days INTEGER)
RETURNS DECIMAL(3,2) AS $$
BEGIN
    IF streak_days >= 7 THEN
        RETURN 2.0;
    ELSIF streak_days >= 4 THEN
        RETURN 1.5;
    ELSE
        RETURN 1.0;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Calculate daily login diamonds based on streak
CREATE OR REPLACE FUNCTION get_daily_login_diamonds(streak_days INTEGER)
RETURNS INTEGER AS $$
BEGIN
    -- Scale from 5 (day 1) to 50 (day 7+)
    RETURN LEAST(5 + (streak_days - 1) * 7, 50);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Core claim reward function with all rules
CREATE OR REPLACE FUNCTION claim_reward(
    p_user_id UUID,
    p_reward_id TEXT,
    p_metadata JSONB DEFAULT '{}'
) RETURNS JSONB AS $$
DECLARE
    v_reward reward_definitions%ROWTYPE;
    v_daily_stats user_daily_stats%ROWTYPE;
    v_user_streak user_streaks%ROWTYPE;
    v_diamonds INTEGER;
    v_multiplier DECIMAL(3,2) := 1.0;
    v_remaining_cap INTEGER;
    v_bypassed BOOLEAN := FALSE;
    v_result JSONB;
BEGIN
    -- Get reward definition
    SELECT * INTO v_reward FROM reward_definitions WHERE id = p_reward_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Reward not found');
    END IF;

    -- Get or create daily stats
    INSERT INTO user_daily_stats (user_id, stat_date)
    VALUES (p_user_id, CURRENT_DATE)
    ON CONFLICT (user_id, stat_date) DO NOTHING;
    
    SELECT * INTO v_daily_stats 
    FROM user_daily_stats 
    WHERE user_id = p_user_id AND stat_date = CURRENT_DATE;

    -- Get streak info
    SELECT * INTO v_user_streak FROM user_streaks WHERE user_id = p_user_id;

    -- Calculate base diamonds
    IF p_reward_id = 'daily_login' THEN
        v_diamonds := get_daily_login_diamonds(COALESCE(v_user_streak.current_streak, 1));
    ELSE
        v_diamonds := v_reward.base_amount;
    END IF;

    -- Apply streak multiplier for standard rewards
    IF v_reward.category = 'standard' THEN
        v_multiplier := get_streak_multiplier(COALESCE(v_user_streak.current_streak, 0));
        v_diamonds := FLOOR(v_diamonds * v_multiplier);
    END IF;

    -- Enforce minimum award
    v_diamonds := GREATEST(v_diamonds, 5);

    -- Check daily cap (500) unless reward bypasses
    IF v_reward.bypasses_cap THEN
        v_bypassed := TRUE;
    ELSE
        v_remaining_cap := 500 - v_daily_stats.diamonds_earned;
        IF v_remaining_cap <= 0 THEN
            RETURN jsonb_build_object(
                'success', false, 
                'error', 'Daily cap reached (500 diamonds)',
                'diamonds_earned_today', v_daily_stats.diamonds_earned
            );
        END IF;
        v_diamonds := LEAST(v_diamonds, v_remaining_cap);
    END IF;

    -- Record the claim
    INSERT INTO reward_claims (user_id, reward_id, diamonds_awarded, multiplier, bypassed_cap, metadata)
    VALUES (p_user_id, p_reward_id, v_diamonds, v_multiplier, v_bypassed, p_metadata);

    -- Update daily stats
    IF v_bypassed THEN
        UPDATE user_daily_stats 
        SET diamonds_earned_bypassed = diamonds_earned_bypassed + v_diamonds,
            updated_at = NOW()
        WHERE user_id = p_user_id AND stat_date = CURRENT_DATE;
    ELSE
        UPDATE user_daily_stats 
        SET diamonds_earned = diamonds_earned + v_diamonds,
            updated_at = NOW()
        WHERE user_id = p_user_id AND stat_date = CURRENT_DATE;
    END IF;

    -- Update user's wallet (assuming profiles table has diamonds column)
    UPDATE profiles 
    SET diamonds = COALESCE(diamonds, 0) + v_diamonds
    WHERE id = p_user_id;

    -- Build result
    v_result := jsonb_build_object(
        'success', true,
        'reward_id', p_reward_id,
        'diamonds_awarded', v_diamonds,
        'multiplier', v_multiplier,
        'bypassed_cap', v_bypassed,
        'streak', COALESCE(v_user_streak.current_streak, 0),
        'rarity', v_reward.rarity,
        'icon', v_reward.icon
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update login streak
CREATE OR REPLACE FUNCTION update_login_streak(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_streak user_streaks%ROWTYPE;
    v_new_streak INTEGER;
BEGIN
    SELECT * INTO v_streak FROM user_streaks WHERE user_id = p_user_id;
    
    IF NOT FOUND THEN
        -- First login ever
        INSERT INTO user_streaks (user_id, current_streak, longest_streak, last_login_date, streak_started_at)
        VALUES (p_user_id, 1, 1, CURRENT_DATE, NOW());
        RETURN 1;
    END IF;

    IF v_streak.last_login_date = CURRENT_DATE THEN
        -- Already logged in today
        RETURN v_streak.current_streak;
    ELSIF v_streak.last_login_date = CURRENT_DATE - 1 THEN
        -- Consecutive day - extend streak
        v_new_streak := v_streak.current_streak + 1;
        UPDATE user_streaks 
        SET current_streak = v_new_streak,
            longest_streak = GREATEST(longest_streak, v_new_streak),
            last_login_date = CURRENT_DATE,
            updated_at = NOW()
        WHERE user_id = p_user_id;
        RETURN v_new_streak;
    ELSE
        -- Streak broken - reset to 1
        UPDATE user_streaks 
        SET current_streak = 1,
            last_login_date = CURRENT_DATE,
            streak_started_at = NOW(),
            updated_at = NOW()
        WHERE user_id = p_user_id;
        RETURN 1;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user reward summary
CREATE OR REPLACE FUNCTION get_user_reward_summary(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
    v_daily_stats user_daily_stats%ROWTYPE;
    v_streak user_streaks%ROWTYPE;
    v_total_diamonds INTEGER;
    v_easter_eggs_found INTEGER;
BEGIN
    SELECT * INTO v_daily_stats 
    FROM user_daily_stats 
    WHERE user_id = p_user_id AND stat_date = CURRENT_DATE;

    SELECT * INTO v_streak FROM user_streaks WHERE user_id = p_user_id;

    SELECT COUNT(*) INTO v_easter_eggs_found
    FROM user_easter_eggs 
    WHERE user_id = p_user_id AND unlocked = TRUE;

    SELECT COALESCE(diamonds, 0) INTO v_total_diamonds
    FROM profiles WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'total_diamonds', v_total_diamonds,
        'diamonds_today', COALESCE(v_daily_stats.diamonds_earned, 0),
        'diamonds_remaining_cap', 500 - COALESCE(v_daily_stats.diamonds_earned, 0),
        'current_streak', COALESCE(v_streak.current_streak, 0),
        'longest_streak', COALESCE(v_streak.longest_streak, 0),
        'streak_multiplier', get_streak_multiplier(COALESCE(v_streak.current_streak, 0)),
        'easter_eggs_found', v_easter_eggs_found,
        'last_login', v_streak.last_login_date
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE reward_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_easter_eggs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_streaks ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "Users view own reward claims" ON reward_claims
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users view own daily stats" ON user_daily_stats
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users view own easter eggs" ON user_easter_eggs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users view own streaks" ON user_streaks
    FOR SELECT USING (auth.uid() = user_id);

-- Anyone can read reward definitions
CREATE POLICY "Anyone can read reward definitions" ON reward_definitions
    FOR SELECT USING (true);

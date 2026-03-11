-- ═══════════════════════════════════════════════════════════════════════════
-- YELLOW BALL: DIAMOND REWARD SYSTEM V2.0 — COMPLETE 100 PILLAR EASTER EGGS
-- Full 5-pillar achievement system with celebration triggers
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 🏟️ PILLAR 1: ARENA META & INTERACTION (1-20)
-- Rewards for exploring the interface efficiently
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO reward_definitions (id, category, subcategory, name, description, base_amount, is_repeatable, rarity, icon) VALUES
('pillar1_searcher', 'easter_egg', 'arena_meta', 'The Searcher', 'Use Sort & Filter 10 times to find specific simulations', 10, FALSE, 'common', '🔍'),
('pillar1_terminal_novice', 'easter_egg', 'arena_meta', 'Terminal Novice', 'Run your first logic-check command via interface', 20, FALSE, 'common', '⌨️'),
('pillar1_terminal_pro', 'easter_egg', 'arena_meta', 'Terminal Pro', 'Run 50 commands in a session without UI buttons', 100, FALSE, 'epic', '💻'),
('pillar1_archivist', 'easter_egg', 'arena_meta', 'The Archivist', 'Save 5 Leak Signals to your personal study folder', 15, FALSE, 'uncommon', '📁'),
('pillar1_night_vision', 'easter_egg', 'arena_meta', 'Night Vision', 'Toggle to Dark Mode during late-night session', 5, FALSE, 'common', '🌙'),
('pillar1_inspector', 'easter_egg', 'arena_meta', 'The Inspector', 'Review a GTO chart for 5+ minutes without clicking away', 25, FALSE, 'uncommon', '🔎'),
('pillar1_volume_control', 'easter_egg', 'arena_meta', 'Volume Control', 'Adjust sound settings to Focus Mode during Arena match', 5, FALSE, 'common', '🔊'),
('pillar1_multi_tabber', 'easter_egg', 'arena_meta', 'Multi-Tabber', 'Have 3 different training categories open simultaneously', 30, FALSE, 'uncommon', '📑'),
('pillar1_customizer', 'easter_egg', 'arena_meta', 'The Customizer', 'Change your Arena dashboard layout', 20, FALSE, 'common', '🎨'),
('pillar1_reader', 'easter_egg', 'arena_meta', 'The Reader', 'Open and scroll through Rules & Payouts table entirely', 10, FALSE, 'common', '📖'),
('pillar1_filter_master', 'easter_egg', 'arena_meta', 'Filter Master', 'Create a Custom View in the game searcher', 40, FALSE, 'rare', '⚙️'),
('pillar1_notification_clear', 'easter_egg', 'arena_meta', 'Notification Clear', 'Clear 20 unread milestone alerts', 10, FALSE, 'common', '🔔'),
('pillar1_tourist', 'easter_egg', 'arena_meta', 'The Tourist', 'Visit every sub-page in the Open Agent Manager', 50, FALSE, 'rare', '🗺️'),
('pillar1_quick_start', 'easter_egg', 'arena_meta', 'Quick Start', 'Enter a game within 5 seconds of logging in', 15, FALSE, 'uncommon', '⚡'),
('pillar1_window_shopper', 'easter_egg', 'arena_meta', 'The Window Shopper', 'View Diamond Store 7 days in a row without spending', 50, FALSE, 'rare', '🛍️'),
('pillar1_data_export', 'easter_egg', 'arena_meta', 'Data Export', 'Download your weekly performance CSV', 30, FALSE, 'uncommon', '📊'),
('pillar1_waiter', 'easter_egg', 'arena_meta', 'The Waiter', 'Stay on login screen for 2 minutes reading Pro Tip', 10, FALSE, 'common', '⏳'),
('pillar1_interface_explorer', 'easter_egg', 'arena_meta', 'Interface Explorer', 'Click on a Help tooltip for a complex GTO variable', 5, FALSE, 'common', '❓'),
('pillar1_optimizer', 'easter_egg', 'arena_meta', 'The Optimizer', 'Close background tabs to improve Arena performance', 15, FALSE, 'common', '🚀'),
('pillar1_hardware_flex', 'easter_egg', 'arena_meta', 'Hardware Flex', 'Log in from a Mac Studio', 100, FALSE, 'epic', '🖥️')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 📢 PILLAR 2: SOCIAL VELOCITY & RECRUITMENT (21-40)
-- Focus on 500-diamond referral bonus and organic growth
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO reward_definitions (id, category, subcategory, name, description, base_amount, is_repeatable, bypasses_cap, rarity, icon) VALUES
('pillar2_verified_referral', 'easter_egg', 'social_velocity', 'Verified Referral', 'Referred user completes Email + Phone verification', 500, TRUE, TRUE, 'epic', '✅'),
('pillar2_recruiter', 'easter_egg', 'social_velocity', 'The Recruiter', 'Reach 5 total verified referrals', 1000, FALSE, TRUE, 'legendary', '🎖️'),
('pillar2_social_share', 'easter_egg', 'social_velocity', 'Social Share', 'Post a Perfect Run screenshot to X/Twitter', 20, FALSE, FALSE, 'common', '📸'),
('pillar2_tag_team', 'easter_egg', 'social_velocity', 'Tag Team', 'Mention a friend in the Arena comments', 5, FALSE, FALSE, 'common', '👋'),
('pillar2_viral_clip', 'easter_egg', 'social_velocity', 'Viral Clip', 'Share a video of a 100% score level', 50, FALSE, FALSE, 'rare', '🎬'),
('pillar2_evangelist', 'easter_egg', 'social_velocity', 'The Evangelist', 'Link your social media profile to the Arena', 30, FALSE, FALSE, 'uncommon', '🔗'),
('pillar2_community_mentor', 'easter_egg', 'social_velocity', 'Community Mentor', 'Upvote 10 strategy comments from other users', 10, FALSE, FALSE, 'common', '👍'),
('pillar2_feedback_loop', 'easter_egg', 'social_velocity', 'Feedback Loop', 'Submit a suggestion via the feedback portal', 25, FALSE, FALSE, 'uncommon', '💡'),
('pillar2_diplomat', 'easter_egg', 'social_velocity', 'The Diplomat', 'Refer a user from a different geographic region', 100, FALSE, TRUE, 'rare', '🌍'),
('pillar2_bio_link', 'easter_egg', 'social_velocity', 'Bio Link', 'Put your referral link in your social bio', 50, FALSE, FALSE, 'rare', '📝'),
('pillar2_group_founder', 'easter_egg', 'social_velocity', 'Group Founder', 'Create a private study group for 5 people', 100, FALSE, FALSE, 'rare', '👥'),
('pillar2_influencer', 'easter_egg', 'social_velocity', 'The Influencer', 'Have your shared post get 10+ likes', 100, FALSE, FALSE, 'rare', '⭐'),
('pillar2_squad_goals', 'easter_egg', 'social_velocity', 'Squad Goals', 'Log in at the same time as one of your referrals', 25, FALSE, FALSE, 'uncommon', '🤝'),
('pillar2_assistant', 'easter_egg', 'social_velocity', 'The Assistant', 'Help a new user in the global chat', 15, FALSE, FALSE, 'common', '💬'),
('pillar2_social_streak', 'easter_egg', 'social_velocity', 'Social Streak', 'Share your progress for 5 consecutive days', 100, FALSE, FALSE, 'rare', '🔥'),
('pillar2_arena_reporter', 'easter_egg', 'social_velocity', 'Arena Reporter', 'Report a bug that gets verified by the AI', 200, FALSE, FALSE, 'epic', '🐛'),
('pillar2_commentator', 'easter_egg', 'social_velocity', 'The Commentator', 'Leave a high-quality strategy tip on a Hard level', 20, FALSE, FALSE, 'common', '📣'),
('pillar2_weekly_wrap', 'easter_egg', 'social_velocity', 'Weekly Wrap', 'Share your Weekly Stat Card to social media', 40, FALSE, FALSE, 'uncommon', '📈'),
('pillar2_bridge', 'easter_egg', 'social_velocity', 'The Bridge', 'Connect your Discord account', 30, FALSE, FALSE, 'uncommon', '🌉'),
('pillar2_legacy_recruiter', 'easter_egg', 'social_velocity', 'Legacy Recruiter', 'Have a referral successfully refer someone else', 250, FALSE, TRUE, 'epic', '👑')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 🧠 PILLAR 3: GTO & THEORY MASTERY (41-60)
-- Rewards for study habits and precision, not just volume
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO reward_definitions (id, category, subcategory, name, description, base_amount, is_repeatable, rarity, icon) VALUES
('pillar3_deep_study', 'easter_egg', 'gto_mastery', 'Deep Study', 'Review a sub-optimal line (Leak) for 3+ minutes', 20, FALSE, 'common', '📚'),
('pillar3_theory_king', 'easter_egg', 'gto_mastery', 'Theory King', 'Correctly guess the GTO frequency before clicking', 15, FALSE, 'uncommon', '👑'),
('pillar3_specialist', 'easter_egg', 'gto_mastery', 'The Specialist', 'Pass 5 levels in a single sub-category (e.g., 3-Bet Pots)', 50, FALSE, 'rare', '🎯'),
('pillar3_range_architect', 'easter_egg', 'gto_mastery', 'Range Architect', 'View the full range of a position before playing', 10, FALSE, 'common', '🏗️'),
('pillar3_perfectionist', 'easter_egg', 'gto_mastery', 'The Perfectionist', 'Finish a level with 0 sub-optimal flags', 25, FALSE, 'uncommon', '✨'),
('pillar3_mistake_learner', 'easter_egg', 'gto_mastery', 'Mistake Learner', 'Re-play a failed level and get 100% on second try', 40, FALSE, 'rare', '📈'),
('pillar3_chart_explorer', 'easter_egg', 'gto_mastery', 'Chart Explorer', 'View 20 unique GTO charts in one session', 60, FALSE, 'rare', '🗺️'),
('pillar3_analyst', 'easter_egg', 'gto_mastery', 'The Analyst', 'Compare two different board textures for 5 minutes', 30, FALSE, 'uncommon', '🔬'),
('pillar3_logic_check', 'easter_egg', 'gto_mastery', 'Logic Check', 'Use the Terminal to verify a hands EV', 50, FALSE, 'rare', '🖥️'),
('pillar3_grinder', 'easter_egg', 'gto_mastery', 'The Grinder', 'Stay in the Theory Orb for 2 hours straight', 100, FALSE, 'epic', '💪'),
('pillar3_equity_expert', 'easter_egg', 'gto_mastery', 'Equity Expert', 'Spend time in the equity calculator tool', 20, FALSE, 'common', '📊'),
('pillar3_blocker_scholar', 'easter_egg', 'gto_mastery', 'Blocker Scholar', 'Correctly identify why a hand was a GTO fold', 25, FALSE, 'uncommon', '🎓'),
('pillar3_solver', 'easter_egg', 'gto_mastery', 'The Solver', 'Input a custom hand into the training engine', 40, FALSE, 'rare', '🧮'),
('pillar3_zero_assistance', 'easter_egg', 'gto_mastery', 'Zero Assistance', 'Disable Hints for an entire session', 50, FALSE, 'rare', '🎯'),
('pillar3_sniper', 'easter_egg', 'gto_mastery', 'The Sniper', 'Spend less than 2 seconds on 10 consecutive GTO moves', 30, FALSE, 'uncommon', '🔫'),
('pillar3_tanker', 'easter_egg', 'gto_mastery', 'The Tanker', 'Use your full time bank to find Mixed Strategy', 15, FALSE, 'common', '⏱️'),
('pillar3_texture_master', 'easter_egg', 'gto_mastery', 'Texture Master', 'Complete a level across 5 different board textures', 40, FALSE, 'rare', '🃏'),
('pillar3_positional_pro', 'easter_egg', 'gto_mastery', 'Positional Pro', 'Play 10 hands from every seat at the table', 50, FALSE, 'rare', '🪑'),
('pillar3_generalist', 'easter_egg', 'gto_mastery', 'The Generalist', 'Play one hand in every game type (Cash, MTT, Short Deck)', 100, FALSE, 'epic', '🌐'),
('pillar3_pure_strategy', 'easter_egg', 'gto_mastery', 'Pure Strategy', 'Identify a 100% Frequency move 10 times in a row', 25, FALSE, 'uncommon', '♟️')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 📈 PILLAR 4: STREAK & LOYALTY (61-80)
-- Time-based rewards for showing up
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO reward_definitions (id, category, subcategory, name, description, base_amount, is_repeatable, rarity, icon) VALUES
('pillar4_morning_coffee', 'easter_egg', 'streak_loyalty', 'Morning Coffee', 'Log in between 6 AM and 9 AM', 10, FALSE, 'common', '☕'),
('pillar4_night_owl', 'easter_egg', 'streak_loyalty', 'The Night Owl', 'Log in between 12 AM and 3 AM', 20, FALSE, 'uncommon', '🦉'),
('pillar4_weekend_warrior', 'easter_egg', 'streak_loyalty', 'Weekend Warrior', 'Log in on both Saturday and Sunday', 50, FALSE, 'rare', '⚔️'),
('pillar4_anniversary', 'easter_egg', 'streak_loyalty', 'The Anniversary', 'Reach 30 days since your first Arena entry', 200, FALSE, 'epic', '🎂'),
('pillar4_loyalty_lock', 'easter_egg', 'streak_loyalty', 'Loyalty Lock', 'Hit a 7-day login streak', 100, FALSE, 'rare', '🔒'),
('pillar4_half_century', 'easter_egg', 'streak_loyalty', 'Half-Century', 'Reach a 50-day login streak', 500, FALSE, 'legendary', '5️⃣0️⃣'),
('pillar4_centurion', 'easter_egg', 'streak_loyalty', 'The Centurion', 'Reach a 100-day login streak', 1000, FALSE, 'legendary', '💯'),
('pillar4_lunch_break', 'easter_egg', 'streak_loyalty', 'Lunch Break', 'Complete 1 level between 12 PM and 1 PM', 15, FALSE, 'common', '🥪'),
('pillar4_daily_cap_hero', 'easter_egg', 'streak_loyalty', 'Daily Cap Hero', 'Reach the 500-diamond daily cap', 50, FALSE, 'rare', '🦸'),
('pillar4_consistent_learner', 'easter_egg', 'streak_loyalty', 'Consistent Learner', 'Spend at least 15 minutes in Arena for 3 days', 30, FALSE, 'uncommon', '📖'),
('pillar4_holiday', 'easter_egg', 'streak_loyalty', 'The Holiday', 'Log in on a major global holiday', 100, FALSE, 'rare', '🎄'),
('pillar4_clockwork', 'easter_egg', 'streak_loyalty', 'Clockwork', 'Log in at the exact same time 3 days in a row', 40, FALSE, 'rare', '⏰'),
('pillar4_return', 'easter_egg', 'streak_loyalty', 'The Return', 'Log in after a 48-hour break', 10, FALSE, 'common', '👋'),
('pillar4_marathon_man', 'easter_egg', 'streak_loyalty', 'Marathon Man', 'Complete 10 levels in a single 24-hour period', 150, FALSE, 'epic', '🏃'),
('pillar4_speed_runner', 'easter_egg', 'streak_loyalty', 'Speed Runner', 'Complete a level in under 60 seconds', 25, FALSE, 'uncommon', '⚡'),
('pillar4_dedicated', 'easter_egg', 'streak_loyalty', 'The Dedicated', 'Reach 500 total hands played', 200, FALSE, 'epic', '🎰'),
('pillar4_silver_member', 'easter_egg', 'streak_loyalty', 'Silver Member', 'Total lifetime diamonds earned reaches 5,000', 250, FALSE, 'rare', '🥈'),
('pillar4_gold_member', 'easter_egg', 'streak_loyalty', 'Gold Member', 'Total lifetime diamonds earned reaches 25,000', 1000, FALSE, 'legendary', '🥇'),
('pillar4_diamond_hands', 'easter_egg', 'streak_loyalty', 'Diamond Hands', 'Hold 1,000+ diamonds in balance for a week', 50, FALSE, 'rare', '💎'),
('pillar4_legend', 'easter_egg', 'streak_loyalty', 'The Legend', 'Reach the top 1% of the monthly leaderboard', 500, FALSE, 'legendary', '🏆')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 🎰 PILLAR 5: ARENA CHALLENGES & EASTER EGGS (81-100)
-- Random, hidden, or highly difficult achievements
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO reward_definitions (id, category, subcategory, name, description, base_amount, is_repeatable, rarity, icon) VALUES
('pillar5_jackpot', 'easter_egg', 'arena_challenges', 'The Jackpot', 'Random 0.1% chance on any correct answer', 777, TRUE, 'legendary', '🎰'),
('pillar5_binary_king', 'easter_egg', 'arena_challenges', 'Binary King', 'Finish a level with exactly 101 XP earned', 20, FALSE, 'uncommon', '👑'),
('pillar5_comeback', 'easter_egg', 'arena_challenges', 'The Comeback', 'Pass a level after failing the first 3 questions', 50, FALSE, 'rare', '💪'),
('pillar5_lucky_seven', 'easter_egg', 'arena_challenges', 'Lucky Seven', 'Earn exactly 77 diamonds in one session', 7, FALSE, 'uncommon', '7️⃣'),
('pillar5_ghost', 'easter_egg', 'arena_challenges', 'The Ghost', 'Finish a level without a single mouse click (Tab/Enter only)', 100, FALSE, 'epic', '👻'),
('pillar5_mirror_match', 'easter_egg', 'arena_challenges', 'Mirror Match', 'Get the exact same score as your previous run', 20, FALSE, 'uncommon', '🪞'),
('pillar5_underdog', 'easter_egg', 'arena_challenges', 'The Underdog', 'Pass a Very Hard level while below Level 10 XP', 150, FALSE, 'epic', '🐕'),
('pillar5_full_house', 'easter_egg', 'arena_challenges', 'Full House', 'View 5 different GTO charts in under 60 seconds', 30, FALSE, 'uncommon', '🏠'),
('pillar5_burner', 'easter_egg', 'arena_challenges', 'The Burner', 'Spend your first 1,000 diamonds in the Arena Rake', 100, FALSE, 'rare', '🔥'),
('pillar5_high_stakes', 'easter_egg', 'arena_challenges', 'High Stakes', 'Enter an Arena match with a fee of 500+ Diamonds', 50, FALSE, 'rare', '🎲'),
('pillar5_whale', 'easter_egg', 'arena_challenges', 'The Whale', 'Have 10 referrals reach Level 20 XP', 5000, FALSE, 'legendary', '🐋'),
('pillar5_konami', 'easter_egg', 'arena_challenges', 'Konami Code', 'Enter the secret keyboard sequence', 100, FALSE, 'epic', '🎮'),
('pillar5_oracle', 'easter_egg', 'arena_challenges', 'The Oracle', 'Correctly predict the Rake Burn for a major tournament', 200, FALSE, 'epic', '🔮'),
('pillar5_zero_hero', 'easter_egg', 'arena_challenges', 'Zero Hero', 'Reach the daily cap using only 5-diamond rewards', 250, FALSE, 'legendary', '0️⃣'),
('pillar5_collector', 'easter_egg', 'arena_challenges', 'The Collector', 'Unlock all 5 Theory Badges', 300, FALSE, 'epic', '🏅'),
('pillar5_shadow_boxer', 'easter_egg', 'arena_challenges', 'Shadow Boxer', 'Play against your own previous ghost data', 50, FALSE, 'rare', '🥊'),
('pillar5_alchemist', 'easter_egg', 'arena_challenges', 'The Alchemist', 'Convert a specific XP milestone into a Diamond bonus', 100, FALSE, 'rare', '⚗️'),
('pillar5_double_nothing', 'easter_egg', 'arena_challenges', 'Double or Nothing', 'Successfully gamble daily login reward in a 1v1', 0, TRUE, 'epic', '🎯'),
('pillar5_finisher', 'easter_egg', 'arena_challenges', 'The Finisher', 'Be the person to hit the Community Goal for the week', 500, FALSE, 'legendary', '🏁'),
('pillar5_architect', 'easter_egg', 'arena_challenges', 'The Architect', 'Design a custom training scenario that gets approved', 1000, FALSE, 'legendary', '📐')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- CELEBRATION TRIGGERS — Notify UI when rewards are earned
-- ═══════════════════════════════════════════════════════════════════════════

-- Create celebration log table
CREATE TABLE IF NOT EXISTS celebration_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reward_id TEXT NOT NULL,
    diamonds INTEGER NOT NULL,
    rarity TEXT NOT NULL,
    icon TEXT,
    multiplier DECIMAL(3,2) DEFAULT 1.0,
    message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    viewed_at TIMESTAMPTZ,
    dismissed BOOLEAN DEFAULT FALSE
);

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_celebration_queue_user ON celebration_queue(user_id, dismissed, created_at DESC);

-- Trigger function to queue celebrations
CREATE OR REPLACE FUNCTION queue_reward_celebration()
RETURNS TRIGGER AS $$
DECLARE
    v_reward reward_definitions%ROWTYPE;
    v_message TEXT;
BEGIN
    -- Get reward details
    SELECT * INTO v_reward FROM reward_definitions WHERE id = NEW.reward_id;
    
    -- Build celebration message based on rarity
    v_message := CASE v_reward.rarity
        WHEN 'legendary' THEN '🎊 LEGENDARY ACHIEVEMENT UNLOCKED!'
        WHEN 'epic' THEN '⭐ EPIC DISCOVERY!'
        WHEN 'rare' THEN '✨ RARE FIND!'
        ELSE '💎 DIAMONDS EARNED!'
    END;
    
    -- Queue the celebration
    INSERT INTO celebration_queue (user_id, reward_id, diamonds, rarity, icon, multiplier, message)
    VALUES (NEW.user_id, NEW.reward_id, NEW.diamonds_awarded, v_reward.rarity, v_reward.icon, NEW.multiplier, v_message);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to reward_claims
DROP TRIGGER IF EXISTS trigger_celebration ON reward_claims;
CREATE TRIGGER trigger_celebration
    AFTER INSERT ON reward_claims
    FOR EACH ROW
    EXECUTE FUNCTION queue_reward_celebration();

-- Function to get pending celebrations for a user
CREATE OR REPLACE FUNCTION get_pending_celebrations(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_celebrations JSONB;
BEGIN
    SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'reward_id', reward_id,
        'diamonds', diamonds,
        'rarity', rarity,
        'icon', icon,
        'multiplier', multiplier,
        'message', message,
        'created_at', created_at
    ) ORDER BY created_at DESC)
    INTO v_celebrations
    FROM celebration_queue
    WHERE user_id = p_user_id AND dismissed = FALSE;
    
    RETURN COALESCE(v_celebrations, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to dismiss a celebration
CREATE OR REPLACE FUNCTION dismiss_celebration(p_celebration_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE celebration_queue 
    SET dismissed = TRUE, viewed_at = NOW()
    WHERE id = p_celebration_id;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- TRAINING INTEGRATION — Auto-award rewards for training actions
-- ═══════════════════════════════════════════════════════════════════════════

-- Function to track training session actions and auto-award
CREATE OR REPLACE FUNCTION track_training_action(
    p_user_id UUID,
    p_action_type TEXT,
    p_metadata JSONB DEFAULT '{}'
) RETURNS JSONB AS $$
DECLARE
    v_result JSONB := '{"rewards": []}'::jsonb;
    v_reward_id TEXT;
    v_claim_result JSONB;
    v_accuracy INTEGER;
    v_level INTEGER;
    v_time_seconds INTEGER;
BEGIN
    -- Extract common metadata
    v_accuracy := (p_metadata->>'accuracy')::INTEGER;
    v_level := (p_metadata->>'level')::INTEGER;
    v_time_seconds := (p_metadata->>'time_seconds')::INTEGER;

    -- Check various conditions based on action type
    CASE p_action_type
        -- Level completion triggers
        WHEN 'level_complete' THEN
            IF v_accuracy >= 85 THEN
                v_claim_result := claim_reward(p_user_id, 'level_completion_85', p_metadata);
                v_result := jsonb_set(v_result, '{rewards}', v_result->'rewards' || jsonb_build_array(v_claim_result));
            END IF;
            IF v_accuracy = 100 THEN
                v_claim_result := claim_reward(p_user_id, 'perfect_score_bonus', p_metadata);
                v_result := jsonb_set(v_result, '{rewards}', v_result->'rewards' || jsonb_build_array(v_claim_result));
                -- Check for Perfectionist easter egg
                v_claim_result := claim_reward(p_user_id, 'pillar3_perfectionist', p_metadata);
                v_result := jsonb_set(v_result, '{rewards}', v_result->'rewards' || jsonb_build_array(v_claim_result));
            END IF;
            -- Speed Runner check
            IF v_time_seconds IS NOT NULL AND v_time_seconds < 60 THEN
                v_claim_result := claim_reward(p_user_id, 'pillar4_speed_runner', p_metadata);
                v_result := jsonb_set(v_result, '{rewards}', v_result->'rewards' || jsonb_build_array(v_claim_result));
            END IF;

        -- First training of day
        WHEN 'first_training' THEN
            v_claim_result := claim_reward(p_user_id, 'first_training_of_day', p_metadata);
            v_result := jsonb_set(v_result, '{rewards}', v_result->'rewards' || jsonb_build_array(v_claim_result));

        -- Level unlocked
        WHEN 'level_unlocked' THEN
            v_claim_result := claim_reward(p_user_id, 'new_level_unlocked', p_metadata);
            v_result := jsonb_set(v_result, '{rewards}', v_result->'rewards' || jsonb_build_array(v_claim_result));

        -- Chart study (3+ min)
        WHEN 'chart_study' THEN
            IF (p_metadata->>'minutes')::INTEGER >= 3 THEN
                v_claim_result := claim_reward(p_user_id, 'gto_chart_study', p_metadata);
                v_result := jsonb_set(v_result, '{rewards}', v_result->'rewards' || jsonb_build_array(v_claim_result));
            END IF;
            -- Inspector (5+ min)
            IF (p_metadata->>'minutes')::INTEGER >= 5 THEN
                v_claim_result := claim_reward(p_user_id, 'pillar1_inspector', p_metadata);
                v_result := jsonb_set(v_result, '{rewards}', v_result->'rewards' || jsonb_build_array(v_claim_result));
            END IF;

        -- Jackpot roll on correct answer
        WHEN 'correct_answer' THEN
            IF random() < 0.001 THEN -- 0.1% chance
                v_claim_result := claim_reward(p_user_id, 'pillar5_jackpot', p_metadata);
                v_result := jsonb_set(v_result, '{rewards}', v_result->'rewards' || jsonb_build_array(v_claim_result));
            END IF;

        ELSE
            -- Unknown action type, no reward
            NULL;
    END CASE;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE celebration_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own celebrations" ON celebration_queue
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users dismiss own celebrations" ON celebration_queue
    FOR UPDATE USING (auth.uid() = user_id);

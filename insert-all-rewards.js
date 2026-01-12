const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://kuklfnapbkmacvwxktbh.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo'
);

// Complete 100 Pillar Rewards
const ALL_REWARDS = [
    // ═══════════════════════════════════════════════════════════════════════════
    // PILLAR 1: ARENA META & INTERACTION (1-20)
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'pillar1_searcher', category: 'easter_egg', subcategory: 'arena_meta', name: 'The Searcher', description: 'Use Sort & Filter 10 times', base_amount: 10, is_repeatable: false, rarity: 'common', icon: '🔍' },
    { id: 'pillar1_terminal_novice', category: 'easter_egg', subcategory: 'arena_meta', name: 'Terminal Novice', description: 'Run your first logic-check command', base_amount: 20, is_repeatable: false, rarity: 'common', icon: '⌨️' },
    { id: 'pillar1_terminal_pro', category: 'easter_egg', subcategory: 'arena_meta', name: 'Terminal Pro', description: 'Run 50 commands without UI', base_amount: 100, is_repeatable: false, rarity: 'epic', icon: '💻' },
    { id: 'pillar1_archivist', category: 'easter_egg', subcategory: 'arena_meta', name: 'The Archivist', description: 'Save 5 Leak Signals to study folder', base_amount: 15, is_repeatable: false, rarity: 'uncommon', icon: '📁' },
    { id: 'pillar1_night_vision', category: 'easter_egg', subcategory: 'arena_meta', name: 'Night Vision', description: 'Toggle to Dark Mode at night', base_amount: 5, is_repeatable: false, rarity: 'common', icon: '🌙' },
    { id: 'pillar1_inspector', category: 'easter_egg', subcategory: 'arena_meta', name: 'The Inspector', description: 'Review a GTO chart for 5+ minutes', base_amount: 25, is_repeatable: false, rarity: 'uncommon', icon: '🔎' },
    { id: 'pillar1_volume_control', category: 'easter_egg', subcategory: 'arena_meta', name: 'Volume Control', description: 'Adjust sound to Focus Mode', base_amount: 5, is_repeatable: false, rarity: 'common', icon: '🔊' },
    { id: 'pillar1_multi_tabber', category: 'easter_egg', subcategory: 'arena_meta', name: 'Multi-Tabber', description: '3 training categories open at once', base_amount: 30, is_repeatable: false, rarity: 'uncommon', icon: '📑' },
    { id: 'pillar1_customizer', category: 'easter_egg', subcategory: 'arena_meta', name: 'The Customizer', description: 'Change your Arena dashboard layout', base_amount: 20, is_repeatable: false, rarity: 'common', icon: '🎨' },
    { id: 'pillar1_reader', category: 'easter_egg', subcategory: 'arena_meta', name: 'The Reader', description: 'Scroll through entire Rules table', base_amount: 10, is_repeatable: false, rarity: 'common', icon: '📖' },
    { id: 'pillar1_filter_master', category: 'easter_egg', subcategory: 'arena_meta', name: 'Filter Master', description: 'Create a Custom View in searcher', base_amount: 40, is_repeatable: false, rarity: 'rare', icon: '⚙️' },
    { id: 'pillar1_notification_clear', category: 'easter_egg', subcategory: 'arena_meta', name: 'Notification Clear', description: 'Clear 20 unread alerts', base_amount: 10, is_repeatable: false, rarity: 'common', icon: '🔔' },
    { id: 'pillar1_tourist', category: 'easter_egg', subcategory: 'arena_meta', name: 'The Tourist', description: 'Visit every sub-page in Agent Manager', base_amount: 50, is_repeatable: false, rarity: 'rare', icon: '🗺️' },
    { id: 'pillar1_quick_start', category: 'easter_egg', subcategory: 'arena_meta', name: 'Quick Start', description: 'Enter game within 5 seconds of login', base_amount: 15, is_repeatable: false, rarity: 'uncommon', icon: '⚡' },
    { id: 'pillar1_window_shopper', category: 'easter_egg', subcategory: 'arena_meta', name: 'Window Shopper', description: 'View Diamond Store 7 days without buying', base_amount: 50, is_repeatable: false, rarity: 'rare', icon: '🛍️' },
    { id: 'pillar1_data_export', category: 'easter_egg', subcategory: 'arena_meta', name: 'Data Export', description: 'Download your weekly performance CSV', base_amount: 30, is_repeatable: false, rarity: 'uncommon', icon: '📊' },
    { id: 'pillar1_waiter', category: 'easter_egg', subcategory: 'arena_meta', name: 'The Waiter', description: 'Stay on login screen 2 mins reading tips', base_amount: 10, is_repeatable: false, rarity: 'common', icon: '⏳' },
    { id: 'pillar1_interface_explorer', category: 'easter_egg', subcategory: 'arena_meta', name: 'Interface Explorer', description: 'Click on a Help tooltip', base_amount: 5, is_repeatable: false, rarity: 'common', icon: '❓' },
    { id: 'pillar1_optimizer', category: 'easter_egg', subcategory: 'arena_meta', name: 'The Optimizer', description: 'Close background tabs for performance', base_amount: 15, is_repeatable: false, rarity: 'common', icon: '🚀' },
    { id: 'pillar1_hardware_flex', category: 'easter_egg', subcategory: 'arena_meta', name: 'Hardware Flex', description: 'Log in from a Mac Studio', base_amount: 100, is_repeatable: false, rarity: 'epic', icon: '🖥️' },

    // ═══════════════════════════════════════════════════════════════════════════
    // PILLAR 2: SOCIAL VELOCITY & RECRUITMENT (21-40)
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'pillar2_verified_referral', category: 'easter_egg', subcategory: 'social_velocity', name: 'Verified Referral', description: 'Referred user verifies email+phone', base_amount: 500, is_repeatable: true, bypasses_cap: true, rarity: 'epic', icon: '✅' },
    { id: 'pillar2_recruiter', category: 'easter_egg', subcategory: 'social_velocity', name: 'The Recruiter', description: 'Reach 5 verified referrals', base_amount: 1000, is_repeatable: false, bypasses_cap: true, rarity: 'legendary', icon: '🎖️' },
    { id: 'pillar2_social_share', category: 'easter_egg', subcategory: 'social_velocity', name: 'Social Share', description: 'Post a Perfect Run screenshot', base_amount: 20, is_repeatable: false, rarity: 'common', icon: '📸' },
    { id: 'pillar2_tag_team', category: 'easter_egg', subcategory: 'social_velocity', name: 'Tag Team', description: 'Mention a friend in Arena comments', base_amount: 5, is_repeatable: false, rarity: 'common', icon: '👋' },
    { id: 'pillar2_viral_clip', category: 'easter_egg', subcategory: 'social_velocity', name: 'Viral Clip', description: 'Share a video of a 100% score level', base_amount: 50, is_repeatable: false, rarity: 'rare', icon: '🎬' },
    { id: 'pillar2_evangelist', category: 'easter_egg', subcategory: 'social_velocity', name: 'The Evangelist', description: 'Link social media to Arena', base_amount: 30, is_repeatable: false, rarity: 'uncommon', icon: '🔗' },
    { id: 'pillar2_community_mentor', category: 'easter_egg', subcategory: 'social_velocity', name: 'Community Mentor', description: 'Upvote 10 strategy comments', base_amount: 10, is_repeatable: false, rarity: 'common', icon: '👍' },
    { id: 'pillar2_feedback_loop', category: 'easter_egg', subcategory: 'social_velocity', name: 'Feedback Loop', description: 'Submit a suggestion via feedback', base_amount: 25, is_repeatable: false, rarity: 'uncommon', icon: '💡' },
    { id: 'pillar2_diplomat', category: 'easter_egg', subcategory: 'social_velocity', name: 'The Diplomat', description: 'Refer user from different region', base_amount: 100, is_repeatable: false, bypasses_cap: true, rarity: 'rare', icon: '🌍' },
    { id: 'pillar2_bio_link', category: 'easter_egg', subcategory: 'social_velocity', name: 'Bio Link', description: 'Put referral link in your social bio', base_amount: 50, is_repeatable: false, rarity: 'rare', icon: '📝' },
    { id: 'pillar2_group_founder', category: 'easter_egg', subcategory: 'social_velocity', name: 'Group Founder', description: 'Create a private study group for 5', base_amount: 100, is_repeatable: false, rarity: 'rare', icon: '👥' },
    { id: 'pillar2_influencer', category: 'easter_egg', subcategory: 'social_velocity', name: 'The Influencer', description: 'Shared post gets 10+ likes', base_amount: 100, is_repeatable: false, rarity: 'rare', icon: '⭐' },
    { id: 'pillar2_squad_goals', category: 'easter_egg', subcategory: 'social_velocity', name: 'Squad Goals', description: 'Log in same time as referral', base_amount: 25, is_repeatable: false, rarity: 'uncommon', icon: '🤝' },
    { id: 'pillar2_assistant', category: 'easter_egg', subcategory: 'social_velocity', name: 'The Assistant', description: 'Help a new user in global chat', base_amount: 15, is_repeatable: false, rarity: 'common', icon: '💬' },
    { id: 'pillar2_social_streak', category: 'easter_egg', subcategory: 'social_velocity', name: 'Social Streak', description: 'Share progress for 5 consecutive days', base_amount: 100, is_repeatable: false, rarity: 'rare', icon: '🔥' },
    { id: 'pillar2_arena_reporter', category: 'easter_egg', subcategory: 'social_velocity', name: 'Arena Reporter', description: 'Report a verified bug', base_amount: 200, is_repeatable: false, rarity: 'epic', icon: '🐛' },
    { id: 'pillar2_commentator', category: 'easter_egg', subcategory: 'social_velocity', name: 'The Commentator', description: 'Leave strategy tip on Hard level', base_amount: 20, is_repeatable: false, rarity: 'common', icon: '📣' },
    { id: 'pillar2_weekly_wrap', category: 'easter_egg', subcategory: 'social_velocity', name: 'Weekly Wrap', description: 'Share Weekly Stat Card to social', base_amount: 40, is_repeatable: false, rarity: 'uncommon', icon: '📈' },
    { id: 'pillar2_bridge', category: 'easter_egg', subcategory: 'social_velocity', name: 'The Bridge', description: 'Connect your Discord account', base_amount: 30, is_repeatable: false, rarity: 'uncommon', icon: '🌉' },
    { id: 'pillar2_legacy_recruiter', category: 'easter_egg', subcategory: 'social_velocity', name: 'Legacy Recruiter', description: 'Referral successfully refers someone', base_amount: 250, is_repeatable: false, bypasses_cap: true, rarity: 'epic', icon: '👑' },

    // ═══════════════════════════════════════════════════════════════════════════
    // PILLAR 3: GTO & THEORY MASTERY (41-60)
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'pillar3_deep_study', category: 'easter_egg', subcategory: 'gto_mastery', name: 'Deep Study', description: 'Review a Leak for 3+ minutes', base_amount: 20, is_repeatable: false, rarity: 'common', icon: '📚' },
    { id: 'pillar3_theory_king', category: 'easter_egg', subcategory: 'gto_mastery', name: 'Theory King', description: 'Guess GTO frequency before clicking', base_amount: 15, is_repeatable: false, rarity: 'uncommon', icon: '👑' },
    { id: 'pillar3_specialist', category: 'easter_egg', subcategory: 'gto_mastery', name: 'The Specialist', description: 'Pass 5 levels in single sub-category', base_amount: 50, is_repeatable: false, rarity: 'rare', icon: '🎯' },
    { id: 'pillar3_range_architect', category: 'easter_egg', subcategory: 'gto_mastery', name: 'Range Architect', description: 'View full range of position before play', base_amount: 10, is_repeatable: false, rarity: 'common', icon: '🏗️' },
    { id: 'pillar3_perfectionist', category: 'easter_egg', subcategory: 'gto_mastery', name: 'The Perfectionist', description: 'Finish level with 0 sub-optimal flags', base_amount: 25, is_repeatable: false, rarity: 'uncommon', icon: '✨' },
    { id: 'pillar3_mistake_learner', category: 'easter_egg', subcategory: 'gto_mastery', name: 'Mistake Learner', description: 'Re-play failed level, get 100%', base_amount: 40, is_repeatable: false, rarity: 'rare', icon: '📈' },
    { id: 'pillar3_chart_explorer', category: 'easter_egg', subcategory: 'gto_mastery', name: 'Chart Explorer', description: 'View 20 unique GTO charts in session', base_amount: 60, is_repeatable: false, rarity: 'rare', icon: '🗺️' },
    { id: 'pillar3_analyst', category: 'easter_egg', subcategory: 'gto_mastery', name: 'The Analyst', description: 'Compare two board textures for 5 mins', base_amount: 30, is_repeatable: false, rarity: 'uncommon', icon: '🔬' },
    { id: 'pillar3_logic_check', category: 'easter_egg', subcategory: 'gto_mastery', name: 'Logic Check', description: 'Use Terminal to verify hand EV', base_amount: 50, is_repeatable: false, rarity: 'rare', icon: '🖥️' },
    { id: 'pillar3_grinder', category: 'easter_egg', subcategory: 'gto_mastery', name: 'The Grinder', description: 'Stay in Theory Orb for 2 hours', base_amount: 100, is_repeatable: false, rarity: 'epic', icon: '💪' },
    { id: 'pillar3_equity_expert', category: 'easter_egg', subcategory: 'gto_mastery', name: 'Equity Expert', description: 'Spend time in equity calculator', base_amount: 20, is_repeatable: false, rarity: 'common', icon: '📊' },
    { id: 'pillar3_blocker_scholar', category: 'easter_egg', subcategory: 'gto_mastery', name: 'Blocker Scholar', description: 'Identify why a hand was GTO fold', base_amount: 25, is_repeatable: false, rarity: 'uncommon', icon: '🎓' },
    { id: 'pillar3_solver', category: 'easter_egg', subcategory: 'gto_mastery', name: 'The Solver', description: 'Input custom hand into training engine', base_amount: 40, is_repeatable: false, rarity: 'rare', icon: '🧮' },
    { id: 'pillar3_zero_assistance', category: 'easter_egg', subcategory: 'gto_mastery', name: 'Zero Assistance', description: 'Disable Hints for entire session', base_amount: 50, is_repeatable: false, rarity: 'rare', icon: '🎯' },
    { id: 'pillar3_sniper', category: 'easter_egg', subcategory: 'gto_mastery', name: 'The Sniper', description: '<2 seconds on 10 consecutive moves', base_amount: 30, is_repeatable: false, rarity: 'uncommon', icon: '🔫' },
    { id: 'pillar3_tanker', category: 'easter_egg', subcategory: 'gto_mastery', name: 'The Tanker', description: 'Use full time bank for Mixed Strategy', base_amount: 15, is_repeatable: false, rarity: 'common', icon: '⏱️' },
    { id: 'pillar3_texture_master', category: 'easter_egg', subcategory: 'gto_mastery', name: 'Texture Master', description: 'Complete level across 5 board textures', base_amount: 40, is_repeatable: false, rarity: 'rare', icon: '🃏' },
    { id: 'pillar3_positional_pro', category: 'easter_egg', subcategory: 'gto_mastery', name: 'Positional Pro', description: 'Play 10 hands from every seat', base_amount: 50, is_repeatable: false, rarity: 'rare', icon: '🪑' },
    { id: 'pillar3_generalist', category: 'easter_egg', subcategory: 'gto_mastery', name: 'The Generalist', description: 'Play in every game type', base_amount: 100, is_repeatable: false, rarity: 'epic', icon: '🌐' },
    { id: 'pillar3_pure_strategy', category: 'easter_egg', subcategory: 'gto_mastery', name: 'Pure Strategy', description: 'Identify 100% Frequency move 10x in row', base_amount: 25, is_repeatable: false, rarity: 'uncommon', icon: '♟️' },

    // ═══════════════════════════════════════════════════════════════════════════
    // PILLAR 4: STREAK & LOYALTY (61-80)
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'pillar4_morning_coffee', category: 'easter_egg', subcategory: 'streak_loyalty', name: 'Morning Coffee', description: 'Log in between 6-9 AM', base_amount: 10, is_repeatable: false, rarity: 'common', icon: '☕' },
    { id: 'pillar4_night_owl', category: 'easter_egg', subcategory: 'streak_loyalty', name: 'The Night Owl', description: 'Log in between 12-3 AM', base_amount: 20, is_repeatable: false, rarity: 'uncommon', icon: '🦉' },
    { id: 'pillar4_weekend_warrior', category: 'easter_egg', subcategory: 'streak_loyalty', name: 'Weekend Warrior', description: 'Log in on Saturday and Sunday', base_amount: 50, is_repeatable: false, rarity: 'rare', icon: '⚔️' },
    { id: 'pillar4_anniversary', category: 'easter_egg', subcategory: 'streak_loyalty', name: 'The Anniversary', description: 'Reach 30 days since first entry', base_amount: 200, is_repeatable: false, rarity: 'epic', icon: '🎂' },
    { id: 'pillar4_loyalty_lock', category: 'easter_egg', subcategory: 'streak_loyalty', name: 'Loyalty Lock', description: 'Hit a 7-day login streak', base_amount: 100, is_repeatable: false, rarity: 'rare', icon: '🔒' },
    { id: 'pillar4_half_century', category: 'easter_egg', subcategory: 'streak_loyalty', name: 'Half-Century', description: 'Reach a 50-day login streak', base_amount: 500, is_repeatable: false, rarity: 'legendary', icon: '5️⃣0️⃣' },
    { id: 'pillar4_centurion', category: 'easter_egg', subcategory: 'streak_loyalty', name: 'The Centurion', description: 'Reach a 100-day login streak', base_amount: 1000, is_repeatable: false, rarity: 'legendary', icon: '💯' },
    { id: 'pillar4_lunch_break', category: 'easter_egg', subcategory: 'streak_loyalty', name: 'Lunch Break', description: 'Complete 1 level between 12-1 PM', base_amount: 15, is_repeatable: false, rarity: 'common', icon: '🥪' },
    { id: 'pillar4_daily_cap_hero', category: 'easter_egg', subcategory: 'streak_loyalty', name: 'Daily Cap Hero', description: 'Reach the 500-diamond daily cap', base_amount: 50, is_repeatable: false, rarity: 'rare', icon: '🦸' },
    { id: 'pillar4_consistent_learner', category: 'easter_egg', subcategory: 'streak_loyalty', name: 'Consistent Learner', description: 'Spend 15+ mins in Arena for 3 days', base_amount: 30, is_repeatable: false, rarity: 'uncommon', icon: '📖' },
    { id: 'pillar4_holiday', category: 'easter_egg', subcategory: 'streak_loyalty', name: 'The Holiday', description: 'Log in on a major global holiday', base_amount: 100, is_repeatable: false, rarity: 'rare', icon: '🎄' },
    { id: 'pillar4_clockwork', category: 'easter_egg', subcategory: 'streak_loyalty', name: 'Clockwork', description: 'Log in at exact same time 3 days', base_amount: 40, is_repeatable: false, rarity: 'rare', icon: '⏰' },
    { id: 'pillar4_return', category: 'easter_egg', subcategory: 'streak_loyalty', name: 'The Return', description: 'Log in after a 48-hour break', base_amount: 10, is_repeatable: false, rarity: 'common', icon: '👋' },
    { id: 'pillar4_marathon_man', category: 'easter_egg', subcategory: 'streak_loyalty', name: 'Marathon Man', description: 'Complete 10 levels in 24 hours', base_amount: 150, is_repeatable: false, rarity: 'epic', icon: '🏃' },
    { id: 'pillar4_speed_runner', category: 'easter_egg', subcategory: 'streak_loyalty', name: 'Speed Runner', description: 'Complete level under 60 seconds', base_amount: 25, is_repeatable: false, rarity: 'uncommon', icon: '⚡' },
    { id: 'pillar4_dedicated', category: 'easter_egg', subcategory: 'streak_loyalty', name: 'The Dedicated', description: 'Reach 500 total hands played', base_amount: 200, is_repeatable: false, rarity: 'epic', icon: '🎰' },
    { id: 'pillar4_silver_member', category: 'easter_egg', subcategory: 'streak_loyalty', name: 'Silver Member', description: 'Lifetime diamonds reaches 5,000', base_amount: 250, is_repeatable: false, rarity: 'rare', icon: '🥈' },
    { id: 'pillar4_gold_member', category: 'easter_egg', subcategory: 'streak_loyalty', name: 'Gold Member', description: 'Lifetime diamonds reaches 25,000', base_amount: 1000, is_repeatable: false, rarity: 'legendary', icon: '🥇' },
    { id: 'pillar4_diamond_hands', category: 'easter_egg', subcategory: 'streak_loyalty', name: 'Diamond Hands', description: 'Hold 1,000+ diamonds for a week', base_amount: 50, is_repeatable: false, rarity: 'rare', icon: '💎' },
    { id: 'pillar4_legend', category: 'easter_egg', subcategory: 'streak_loyalty', name: 'The Legend', description: 'Reach top 1% monthly leaderboard', base_amount: 500, is_repeatable: false, rarity: 'legendary', icon: '🏆' },

    // ═══════════════════════════════════════════════════════════════════════════
    // PILLAR 5: ARENA CHALLENGES & EASTER EGGS (81-100)
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'pillar5_jackpot', category: 'easter_egg', subcategory: 'arena_challenges', name: 'The Jackpot', description: 'Random 0.1% chance on any answer', base_amount: 777, is_repeatable: true, rarity: 'legendary', icon: '🎰' },
    { id: 'pillar5_binary_king', category: 'easter_egg', subcategory: 'arena_challenges', name: 'Binary King', description: 'Finish level with exactly 101 XP', base_amount: 20, is_repeatable: false, rarity: 'uncommon', icon: '👑' },
    { id: 'pillar5_comeback', category: 'easter_egg', subcategory: 'arena_challenges', name: 'The Comeback', description: 'Pass after failing first 3 questions', base_amount: 50, is_repeatable: false, rarity: 'rare', icon: '💪' },
    { id: 'pillar5_lucky_seven', category: 'easter_egg', subcategory: 'arena_challenges', name: 'Lucky Seven', description: 'Earn exactly 77 diamonds in session', base_amount: 7, is_repeatable: false, rarity: 'uncommon', icon: '7️⃣' },
    { id: 'pillar5_ghost', category: 'easter_egg', subcategory: 'arena_challenges', name: 'The Ghost', description: 'Finish level with Tab/Enter only', base_amount: 100, is_repeatable: false, rarity: 'epic', icon: '👻' },
    { id: 'pillar5_mirror_match', category: 'easter_egg', subcategory: 'arena_challenges', name: 'Mirror Match', description: 'Get exact same score as previous run', base_amount: 20, is_repeatable: false, rarity: 'uncommon', icon: '🪞' },
    { id: 'pillar5_underdog', category: 'easter_egg', subcategory: 'arena_challenges', name: 'The Underdog', description: 'Pass Very Hard level below Level 10', base_amount: 150, is_repeatable: false, rarity: 'epic', icon: '🐕' },
    { id: 'pillar5_full_house', category: 'easter_egg', subcategory: 'arena_challenges', name: 'Full House', description: 'View 5 GTO charts in under 60 secs', base_amount: 30, is_repeatable: false, rarity: 'uncommon', icon: '🏠' },
    { id: 'pillar5_burner', category: 'easter_egg', subcategory: 'arena_challenges', name: 'The Burner', description: 'Spend first 1,000 diamonds in Rake', base_amount: 100, is_repeatable: false, rarity: 'rare', icon: '🔥' },
    { id: 'pillar5_high_stakes', category: 'easter_egg', subcategory: 'arena_challenges', name: 'High Stakes', description: 'Enter Arena match with 500+ fee', base_amount: 50, is_repeatable: false, rarity: 'rare', icon: '🎲' },
    { id: 'pillar5_whale', category: 'easter_egg', subcategory: 'arena_challenges', name: 'The Whale', description: '10 referrals reach Level 20 XP', base_amount: 5000, is_repeatable: false, rarity: 'legendary', icon: '🐋' },
    { id: 'pillar5_konami', category: 'easter_egg', subcategory: 'arena_challenges', name: 'Konami Code', description: 'Enter the secret keyboard sequence', base_amount: 100, is_repeatable: false, rarity: 'epic', icon: '🎮' },
    { id: 'pillar5_oracle', category: 'easter_egg', subcategory: 'arena_challenges', name: 'The Oracle', description: 'Predict Rake Burn for major tourney', base_amount: 200, is_repeatable: false, rarity: 'epic', icon: '🔮' },
    { id: 'pillar5_zero_hero', category: 'easter_egg', subcategory: 'arena_challenges', name: 'Zero Hero', description: 'Reach daily cap using only 5-diamond rewards', base_amount: 250, is_repeatable: false, rarity: 'legendary', icon: '0️⃣' },
    { id: 'pillar5_collector', category: 'easter_egg', subcategory: 'arena_challenges', name: 'The Collector', description: 'Unlock all 5 Theory Badges', base_amount: 300, is_repeatable: false, rarity: 'epic', icon: '🏅' },
    { id: 'pillar5_shadow_boxer', category: 'easter_egg', subcategory: 'arena_challenges', name: 'Shadow Boxer', description: 'Play against your own ghost data', base_amount: 50, is_repeatable: false, rarity: 'rare', icon: '🥊' },
    { id: 'pillar5_alchemist', category: 'easter_egg', subcategory: 'arena_challenges', name: 'The Alchemist', description: 'Convert XP milestone to Diamond bonus', base_amount: 100, is_repeatable: false, rarity: 'rare', icon: '⚗️' },
    { id: 'pillar5_double_nothing', category: 'easter_egg', subcategory: 'arena_challenges', name: 'Double or Nothing', description: 'Gamble daily reward in 1v1', base_amount: 0, is_repeatable: true, rarity: 'epic', icon: '🎯' },
    { id: 'pillar5_finisher', category: 'easter_egg', subcategory: 'arena_challenges', name: 'The Finisher', description: 'Hit Community Goal for the week', base_amount: 500, is_repeatable: false, rarity: 'legendary', icon: '🏁' },
    { id: 'pillar5_architect', category: 'easter_egg', subcategory: 'arena_challenges', name: 'The Architect', description: 'Design approved training scenario', base_amount: 1000, is_repeatable: false, rarity: 'legendary', icon: '📐' },
];

async function insertAllRewards() {
    console.log('💎 Inserting ALL 100 Diamond Pillar Rewards...\n');

    let success = 0;
    let errors = 0;

    for (const reward of ALL_REWARDS) {
        const { error } = await supabase
            .from('reward_definitions')
            .upsert(reward, { onConflict: 'id' });

        if (error) {
            console.log(`❌ ${reward.id}: ${error.message}`);
            errors++;
        } else {
            console.log(`✅ ${reward.id}`);
            success++;
        }
    }

    // Check total count
    const { count } = await supabase
        .from('reward_definitions')
        .select('*', { count: 'exact', head: true })
        .eq('category', 'easter_egg');

    console.log('\n═══════════════════════════════════════════════════');
    console.log(`✅ Inserted: ${success}`);
    console.log(`❌ Errors: ${errors}`);
    console.log(`📊 Total easter_egg rewards in database: ${count}`);
    console.log('═══════════════════════════════════════════════════\n');
}

insertAllRewards().catch(console.error);

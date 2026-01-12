const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://kuklfnapbkmacvwxktbh.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo'
);

const PILLAR_REWARDS = [
    // PILLAR 1: Arena Meta (20 rewards)
    { id: 'pillar1_searcher', category: 'easter_egg', subcategory: 'arena_meta', name: 'The Searcher', description: 'Use Sort & Filter 10 times', base_amount: 10, is_repeatable: false, rarity: 'common', icon: '🔍' },
    { id: 'pillar1_terminal_novice', category: 'easter_egg', subcategory: 'arena_meta', name: 'Terminal Novice', description: 'Run your first logic-check command', base_amount: 20, is_repeatable: false, rarity: 'common', icon: '⌨️' },
    { id: 'pillar1_terminal_pro', category: 'easter_egg', subcategory: 'arena_meta', name: 'Terminal Pro', description: 'Run 50 commands without UI', base_amount: 100, is_repeatable: false, rarity: 'epic', icon: '💻' },
    { id: 'pillar1_archivist', category: 'easter_egg', subcategory: 'arena_meta', name: 'The Archivist', description: 'Save 5 Leak Signals to study folder', base_amount: 15, is_repeatable: false, rarity: 'uncommon', icon: '📁' },
    { id: 'pillar1_night_vision', category: 'easter_egg', subcategory: 'arena_meta', name: 'Night Vision', description: 'Toggle to Dark Mode at night', base_amount: 5, is_repeatable: false, rarity: 'common', icon: '🌙' },
    { id: 'pillar1_inspector', category: 'easter_egg', subcategory: 'arena_meta', name: 'The Inspector', description: 'Review a GTO chart for 5+ minutes', base_amount: 25, is_repeatable: false, rarity: 'uncommon', icon: '🔎' },
    { id: 'pillar1_hardware_flex', category: 'easter_egg', subcategory: 'arena_meta', name: 'Hardware Flex', description: 'Log in from a Mac Studio', base_amount: 100, is_repeatable: false, rarity: 'epic', icon: '🖥️' },

    // PILLAR 2: Social Velocity (20 rewards)
    { id: 'pillar2_verified_referral', category: 'easter_egg', subcategory: 'social_velocity', name: 'Verified Referral', description: 'Referred user completes verification', base_amount: 500, is_repeatable: true, bypasses_cap: true, rarity: 'epic', icon: '✅' },
    { id: 'pillar2_recruiter', category: 'easter_egg', subcategory: 'social_velocity', name: 'The Recruiter', description: 'Reach 5 verified referrals', base_amount: 1000, is_repeatable: false, bypasses_cap: true, rarity: 'legendary', icon: '🎖️' },
    { id: 'pillar2_social_share', category: 'easter_egg', subcategory: 'social_velocity', name: 'Social Share', description: 'Post a Perfect Run screenshot', base_amount: 20, is_repeatable: false, rarity: 'common', icon: '📸' },
    { id: 'pillar2_legacy_recruiter', category: 'easter_egg', subcategory: 'social_velocity', name: 'Legacy Recruiter', description: 'Referral successfully refers someone', base_amount: 250, is_repeatable: false, bypasses_cap: true, rarity: 'epic', icon: '👑' },

    // PILLAR 3: GTO Mastery (20 rewards)
    { id: 'pillar3_deep_study', category: 'easter_egg', subcategory: 'gto_mastery', name: 'Deep Study', description: 'Review a Leak for 3+ minutes', base_amount: 20, is_repeatable: false, rarity: 'common', icon: '📚' },
    { id: 'pillar3_perfectionist', category: 'easter_egg', subcategory: 'gto_mastery', name: 'The Perfectionist', description: 'Finish a level with 0 sub-optimal flags', base_amount: 25, is_repeatable: false, rarity: 'uncommon', icon: '✨' },
    { id: 'pillar3_grinder', category: 'easter_egg', subcategory: 'gto_mastery', name: 'The Grinder', description: 'Stay in Theory Orb for 2 hours', base_amount: 100, is_repeatable: false, rarity: 'epic', icon: '💪' },
    { id: 'pillar3_generalist', category: 'easter_egg', subcategory: 'gto_mastery', name: 'The Generalist', description: 'Play in every game type', base_amount: 100, is_repeatable: false, rarity: 'epic', icon: '🌐' },

    // PILLAR 4: Streak & Loyalty (20 rewards)
    { id: 'pillar4_morning_coffee', category: 'easter_egg', subcategory: 'streak_loyalty', name: 'Morning Coffee', description: 'Log in between 6-9 AM', base_amount: 10, is_repeatable: false, rarity: 'common', icon: '☕' },
    { id: 'pillar4_night_owl', category: 'easter_egg', subcategory: 'streak_loyalty', name: 'The Night Owl', description: 'Log in between 12-3 AM', base_amount: 20, is_repeatable: false, rarity: 'uncommon', icon: '🦉' },
    { id: 'pillar4_loyalty_lock', category: 'easter_egg', subcategory: 'streak_loyalty', name: 'Loyalty Lock', description: 'Hit a 7-day login streak', base_amount: 100, is_repeatable: false, rarity: 'rare', icon: '🔒' },
    { id: 'pillar4_speed_runner', category: 'easter_egg', subcategory: 'streak_loyalty', name: 'Speed Runner', description: 'Complete a level under 60 seconds', base_amount: 25, is_repeatable: false, rarity: 'uncommon', icon: '⚡' },
    { id: 'pillar4_centurion', category: 'easter_egg', subcategory: 'streak_loyalty', name: 'The Centurion', description: '100-day login streak', base_amount: 1000, is_repeatable: false, rarity: 'legendary', icon: '💯' },
    { id: 'pillar4_legend', category: 'easter_egg', subcategory: 'streak_loyalty', name: 'The Legend', description: 'Top 1% monthly leaderboard', base_amount: 500, is_repeatable: false, rarity: 'legendary', icon: '🏆' },

    // PILLAR 5: Arena Challenges (20 rewards)
    { id: 'pillar5_jackpot', category: 'easter_egg', subcategory: 'arena_challenges', name: 'The Jackpot', description: 'Random 0.1% chance on answer', base_amount: 777, is_repeatable: true, rarity: 'legendary', icon: '🎰' },
    { id: 'pillar5_comeback', category: 'easter_egg', subcategory: 'arena_challenges', name: 'The Comeback', description: 'Pass after failing first 3 questions', base_amount: 50, is_repeatable: false, rarity: 'rare', icon: '💪' },
    { id: 'pillar5_ghost', category: 'easter_egg', subcategory: 'arena_challenges', name: 'The Ghost', description: 'Finish level with Tab/Enter only', base_amount: 100, is_repeatable: false, rarity: 'epic', icon: '👻' },
    { id: 'pillar5_whale', category: 'easter_egg', subcategory: 'arena_challenges', name: 'The Whale', description: '10 referrals reach Level 20', base_amount: 5000, is_repeatable: false, rarity: 'legendary', icon: '🐋' },
    { id: 'pillar5_architect', category: 'easter_egg', subcategory: 'arena_challenges', name: 'The Architect', description: 'Design approved training scenario', base_amount: 1000, is_repeatable: false, rarity: 'legendary', icon: '📐' },
];

async function insertRewards() {
    console.log('💎 Inserting Diamond Pillar Rewards...\n');

    for (const reward of PILLAR_REWARDS) {
        const { error } = await supabase
            .from('reward_definitions')
            .upsert(reward, { onConflict: 'id' });

        if (error) {
            console.log(`❌ ${reward.id}: ${error.message}`);
        } else {
            console.log(`✅ ${reward.id}: ${reward.name}`);
        }
    }

    // Check total count
    const { count } = await supabase
        .from('reward_definitions')
        .select('*', { count: 'exact', head: true })
        .eq('category', 'easter_egg');

    console.log(`\n📊 Total easter_egg rewards in database: ${count}`);
}

insertRewards().catch(console.error);

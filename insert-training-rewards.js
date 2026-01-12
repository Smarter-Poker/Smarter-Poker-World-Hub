const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://kuklfnapbkmacvwxktbh.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo'
);

// Base training rewards that are triggered automatically
const TRAINING_REWARDS = [
    // Base rewards for training actions
    { id: 'correct_answer_bonus', category: 'training', subcategory: 'core', name: 'Correct Answer', description: 'Answered a GTO question correctly', base_amount: 5, is_repeatable: true, rarity: 'common', icon: '✅' },
    { id: 'first_training_of_day', category: 'training', subcategory: 'daily', name: 'First Training', description: 'Started training for the first time today', base_amount: 10, is_repeatable: false, rarity: 'common', icon: '🌅' },
    { id: 'level_completion_85', category: 'training', subcategory: 'milestone', name: 'Level Mastered', description: 'Achieved 85% mastery on a level', base_amount: 50, is_repeatable: false, rarity: 'rare', icon: '🏆' },
    { id: 'perfect_score_bonus', category: 'training', subcategory: 'milestone', name: 'Perfect Score', description: 'Achieved 100% on a level', base_amount: 100, is_repeatable: false, rarity: 'epic', icon: '💯' },
    { id: 'new_level_unlocked', category: 'training', subcategory: 'milestone', name: 'New Level Unlocked', description: 'Unlocked a new training level', base_amount: 25, is_repeatable: false, rarity: 'uncommon', icon: '🔓' },
    { id: 'gto_chart_study', category: 'training', subcategory: 'study', name: 'Chart Student', description: 'Studied a GTO chart for 3+ minutes', base_amount: 15, is_repeatable: true, rarity: 'common', icon: '📊' },
];

async function insertTrainingRewards() {
    console.log('💎 Inserting Training Reward Definitions...\n');

    for (const reward of TRAINING_REWARDS) {
        const { error } = await supabase
            .from('reward_definitions')
            .upsert(reward, { onConflict: 'id' });

        if (error) {
            console.log(`❌ ${reward.id}: ${error.message}`);
        } else {
            console.log(`✅ ${reward.id}: ${reward.name}`);
        }
    }

    // Final count
    const { count } = await supabase
        .from('reward_definitions')
        .select('*', { count: 'exact', head: true });

    console.log(`\n📊 Total reward definitions in database: ${count}`);
    console.log('✅ Training rewards ready!');
}

insertTrainingRewards().catch(console.error);

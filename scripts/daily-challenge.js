// Generate daily challenges
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GAMES = [
    { id: 'cash-001', name: 'Preflop Opening Ranges', category: 'cash', difficulty: 1 },
    { id: 'cash-002', name: 'Continuation Betting', category: 'cash', difficulty: 2 },
    { id: 'cash-003', name: 'Check-Raise Flops', category: 'cash', difficulty: 3 },
    { id: 'mtt-001', name: 'Push/Fold Charts', category: 'mtt', difficulty: 1 },
    { id: 'mtt-007', name: 'ICM Pressure', category: 'mtt', difficulty: 3 },
    { id: 'adv-001', name: 'Range vs Range', category: 'advanced', difficulty: 4 },
];

async function generateDailyChallenge() {
    console.log('🎯 Generating daily challenges...');

    const today = new Date().toISOString().split('T')[0];

    // Check if today's challenge exists
    const { data: existing } = await supabase
        .from('training_daily_challenges')
        .select('id')
        .eq('challenge_date', today)
        .single();

    if (existing) {
        console.log(`Challenge for ${today} already exists`);
        return;
    }

    // Pick a random game
    const game = GAMES[Math.floor(Math.random() * GAMES.length)];
    const dayOfMonth = new Date().getDate();

    // Create challenge
    const challenge = {
        challenge_date: today,
        game_id: game.id,
        game_name: game.name,
        category: game.category,
        difficulty_level: Math.min(game.difficulty + Math.floor(dayOfMonth / 10), 10),
        target_score: 70 + (dayOfMonth % 20),
        diamond_reward: 10 + (game.difficulty * 5),
        bonus_objectives: JSON.stringify([
            { type: 'accuracy', threshold: 90, bonus_diamonds: 5 },
            { type: 'streak', threshold: 5, bonus_diamonds: 10 }
        ]),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };

    const { error } = await supabase
        .from('training_daily_challenges')
        .insert(challenge);

    if (error) {
        console.error('Error creating challenge:', error.message);
    } else {
        console.log(`✅ Created daily challenge for ${today}:`);
        console.log(`   Game: ${game.name}`);
        console.log(`   Difficulty: ${challenge.difficulty_level}`);
        console.log(`   Reward: ${challenge.diamond_reward} 💎`);
    }
}

generateDailyChallenge().catch(console.error);

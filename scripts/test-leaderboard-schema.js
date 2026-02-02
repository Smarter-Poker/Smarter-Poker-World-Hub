const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    // Get actual columns for training_leaderboard
    console.log('=== TRAINING_LEADERBOARD SCHEMA DISCOVERY ===');

    // Try minimal insert to see what columns are required
    const tests = [
        { user_id: '00000000-0000-0000-0000-000000000001' },
        { user_id: '00000000-0000-0000-0000-000000000001', game_slug: 'test' },
        { user_id: '00000000-0000-0000-0000-000000000001', game_id: 'test' },
        { user_id: '00000000-0000-0000-0000-000000000001', total_score: 100 },
        { user_id: '00000000-0000-0000-0000-000000000001', points: 100 },
    ];

    for (const t of tests) {
        const { error } = await sb.from('training_leaderboard').insert(t);
        if (error) {
            console.log('With', Object.keys(t).join('+'), ':', error.message.slice(0, 70));
        } else {
            console.log('With', Object.keys(t).join('+'), ': SUCCESS');
            await sb.from('training_leaderboard').delete().eq('user_id', '00000000-0000-0000-0000-000000000001');
            break;
        }
    }

    // Also check training_level_history full insert
    console.log('\\n=== TRAINING_LEVEL_HISTORY FULL INSERT ===')
    const { data: games } = await sb.from('game_registry').select('id, slug').limit(1);
    const levelInsert = {
        user_id: '00000000-0000-0000-0000-000000000001',
        game_id: games[0].slug,  // TEXT type
        level: 1,
        questions_answered: 25,
        questions_correct: 20,
        accuracy_percentage: 80,
        passed: true,
    };

    const { data, error } = await sb.from('training_level_history').insert(levelInsert).select();
    if (!error) {
        console.log('SUCCESS - Columns:', Object.keys(data[0]).join(', '));
        await sb.from('training_level_history').delete().eq('id', data[0].id);
    } else {
        console.log('FAILED:', error.message);
    }
})();

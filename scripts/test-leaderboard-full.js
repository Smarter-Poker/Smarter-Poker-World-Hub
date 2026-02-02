const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    // Discover training_leaderboard columns by inserting with leaderboard_type
    console.log('=== TRAINING_LEADERBOARD FULL SCHEMA ===');

    const insertAttempts = [
        { user_id: '00000000-0000-0000-0000-000000000001', leaderboard_type: 'daily' },
        { user_id: '00000000-0000-0000-0000-000000000001', leaderboard_type: 'daily', game_id: 'test' },
        { user_id: '00000000-0000-0000-0000-000000000001', leaderboard_type: 'daily', rank: 1 },
        { user_id: '00000000-0000-0000-0000-000000000001', leaderboard_type: 'daily', accuracy: 95 },
    ];

    for (const attempt of insertAttempts) {
        const { data, error } = await sb.from('training_leaderboard').insert(attempt).select();
        if (!error) {
            console.log('SUCCESS with:', Object.keys(attempt).join('+'));
            console.log('Full columns:', Object.keys(data[0]).join(', '));
            await sb.from('training_leaderboard').delete().eq('id', data[0].id);
            break;
        } else {
            console.log('With', Object.keys(attempt).join('+'), ':', error.message.slice(0, 60));
        }
    }
})();

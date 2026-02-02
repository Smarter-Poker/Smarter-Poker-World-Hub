const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    console.log('=== TRAINING_PROGRESS SCHEMA DISCOVERY ===');

    // Try minimal insert to see what columns exist
    const tests = [
        { user_id: '00000000-0000-0000-0000-000000000001', game_id: 'test' },
        { user_id: '00000000-0000-0000-0000-000000000001', game_id: 'test', level: 1 },
        { user_id: '00000000-0000-0000-0000-000000000001', game_id: 'test', score: 100 },
    ];

    for (const t of tests) {
        const { data, error } = await sb.from('training_progress').insert(t).select();
        if (!error) {
            console.log('SUCCESS with:', Object.keys(t).join('+'));
            console.log('Full columns:', Object.keys(data[0]).join(', '));
            await sb.from('training_progress').delete().eq('id', data[0].id);
            break;
        } else {
            console.log('With', Object.keys(t).join('+'), ':', error.message.slice(0, 70));
        }
    }
})();

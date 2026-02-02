const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    console.log('=== GAP 3: USER_TRAINING_PROGRESS VERIFICATION ===');

    // Check if training_progress table accepts inserts with our expected columns
    const testInsert = {
        user_id: '00000000-0000-0000-0000-000000000001',
        game_id: 'test-game',
        current_level: 1,
        highest_level_completed: 1,
        mastery_percentage: 10,
        total_questions_answered: 25,
        total_correct: 20,
        total_incorrect: 5,
    };

    const { data, error } = await sb.from('training_progress').insert(testInsert).select();
    if (!error) {
        console.log('✅ training_progress INSERT WORKS');
        console.log('Columns:', Object.keys(data[0]).join(', '));
        await sb.from('training_progress').delete().eq('user_id', '00000000-0000-0000-0000-000000000001');
    } else {
        console.log('❌ training_progress INSERT FAILED:', error.message);
    }

    // Check current record count
    const { count } = await sb.from('training_progress').select('*', { count: 'exact', head: true });
    console.log('Current record count:', count);

    console.log('');
    console.log('=== GAP 5: MEMORY_CHARTS_GOLD DATA ===');
    const { count: chartCount } = await sb.from('memory_charts_gold').select('*', { count: 'exact', head: true });
    console.log('memory_charts_gold record count:', chartCount);

    // Get sample chart data
    const { data: charts } = await sb.from('memory_charts_gold').select('*').limit(3);
    if (charts && charts.length > 0) {
        console.log('Sample columns:', Object.keys(charts[0]).join(', '));
    }
})();

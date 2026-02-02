const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    console.log('=== GOD_MODE_HAND_HISTORY TEST INSERT ===');

    // Test insert without game_id to see what columns exist
    const testInsert = {
        user_id: '00000000-0000-0000-0000-000000000001',
        source_file_id: 'test-file',
        variant_hash: 'test-hash',
        hero_hand: 'AsKs',
        board: '2h3h4h5d6c',
        level_at_play: 1,
        round_hand_number: 1,
        user_action: 'fold',
    };

    const { data, error } = await sb.from('god_mode_hand_history').insert(testInsert).select();

    if (!error) {
        console.log('Insert WITHOUT game_id SUCCEEDED');
        console.log('Columns:', Object.keys(data[0]).join(', '));
        await sb.from('god_mode_hand_history').delete().eq('id', data[0].id);
    } else {
        console.log('Insert WITHOUT game_id failed:', error.message);

        // Check if game_id is required
        if (error.message.includes('game_id')) {
            console.log('game_id IS required');

            // Get sample game_registry UUID
            const { data: games } = await sb.from('game_registry').select('id, slug').limit(1);
            if (games && games.length > 0) {
                console.log('Sample game UUID:', games[0].id, 'slug:', games[0].slug);

                // Try with UUID
                const testWithUUID = {
                    ...testInsert,
                    game_id: games[0].id,
                };

                const { data: d2, error: e2 } = await sb.from('god_mode_hand_history').insert(testWithUUID).select();
                if (!e2) {
                    console.log('Insert WITH UUID game_id SUCCEEDED');
                    console.log('Columns:', Object.keys(d2[0]).join(', '));
                    await sb.from('god_mode_hand_history').delete().eq('id', d2[0].id);
                } else {
                    console.log('Insert WITH UUID game_id failed:', e2.message);
                }
            }
        }
    }
})();

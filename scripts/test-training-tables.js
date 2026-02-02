const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    console.log('=== TESTING TRAINING TABLE GAME_ID TYPES ===');

    // Get a sample game UUID
    const { data: games } = await sb.from('game_registry').select('id, slug').limit(1);
    const gameUUID = games[0]?.id;
    const gameSlug = games[0]?.slug;
    console.log('Game UUID:', gameUUID, 'Slug:', gameSlug);

    // Test training_level_history with slug
    console.log('\\n--- training_level_history ---');
    const { error: e1 } = await sb.from('training_level_history').insert({
        user_id: '00000000-0000-0000-0000-000000000001',
        game_id: gameSlug,  // Try slug first
        level: 1,
    }).select();

    if (e1) {
        console.log('With slug FAILED:', e1.message.slice(0, 80));

        // Try with UUID
        const { error: e2 } = await sb.from('training_level_history').insert({
            user_id: '00000000-0000-0000-0000-000000000001',
            game_id: gameUUID,  // Try UUID
            level: 1,
        }).select();

        if (e2) {
            console.log('With UUID FAILED:', e2.message.slice(0, 80));
        } else {
            console.log('With UUID SUCCEEDED - game_id is UUID type');
            await sb.from('training_level_history').delete().eq('user_id', '00000000-0000-0000-0000-000000000001');
        }
    } else {
        console.log('With slug SUCCEEDED - game_id is TEXT type');
        await sb.from('training_level_history').delete().eq('user_id', '00000000-0000-0000-0000-000000000001');
    }

    // Test training_progress with slug
    console.log('\\n--- training_progress ---');
    const { error: e3 } = await sb.from('training_progress').insert({
        user_id: '00000000-0000-0000-0000-000000000001',
        game_id: gameSlug,
    }).select();

    if (e3) {
        console.log('With slug FAILED:', e3.message.slice(0, 80));

        // Try with UUID
        const { error: e4 } = await sb.from('training_progress').insert({
            user_id: '00000000-0000-0000-0000-000000000001',
            game_id: gameUUID,
        }).select();

        if (e4) {
            console.log('With UUID FAILED:', e4.message.slice(0, 80));
        } else {
            console.log('With UUID SUCCEEDED - game_id is UUID type');
            await sb.from('training_progress').delete().eq('user_id', '00000000-0000-0000-0000-000000000001');
        }
    } else {
        console.log('With slug SUCCEEDED - game_id is TEXT type');
        await sb.from('training_progress').delete().eq('user_id', '00000000-0000-0000-0000-000000000001');
    }

    // Test training_leaderboard
    console.log('\\n--- training_leaderboard ---');
    const { error: e5 } = await sb.from('training_leaderboard').insert({
        user_id: '00000000-0000-0000-0000-000000000001',
        game_id: gameSlug,
        score: 100,
    }).select();

    if (e5) {
        console.log('With slug FAILED:', e5.message.slice(0, 80));
    } else {
        console.log('With slug SUCCEEDED - game_id is TEXT type');
        await sb.from('training_leaderboard').delete().eq('user_id', '00000000-0000-0000-0000-000000000001');
    }
})();

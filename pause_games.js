require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    const { data, error } = await s
        .from('commander_games')
        .select('id, game_type, stakes, status, current_players')
        .in('status', ['active', 'running', 'waiting']);

    if (error) { console.log('ERR:', JSON.stringify(error)); return; }
    console.log('Found ' + (data || []).length + ' active games');

    if (!data || data.length === 0) {
        console.log('No active games to pause.');
        return;
    }

    // Set to 'breaking' — valid pause state, keeps seats intact
    const ids = data.map(g => g.id);
    const { data: updated, error: e2 } = await s
        .from('commander_games')
        .update({ status: 'breaking' })
        .in('id', ids)
        .select('id, status');

    if (e2) { console.log('Update ERR:', JSON.stringify(e2)); return; }
    console.log('Set ' + (updated || []).length + ' games to BREAKING. All seats and players preserved.');
})();

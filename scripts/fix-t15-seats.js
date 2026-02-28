const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync(require('path').join(__dirname, '..', '.env.local'), 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL="(.+?)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].replace(/"/g, '').trim();
const sb = createClient(url, key);

const GAME_ID = '615fe985-6895-4af9-9560-749c273b5371';

(async () => {
    const { data: existing } = await sb.from('commander_seats').select('seat_number, player_name').eq('game_id', GAME_ID);
    console.log('Existing T15 seats:', existing ? existing.length : 0);
    if (existing) existing.forEach(s => console.log('  S' + s.seat_number + ': ' + s.player_name));

    if (!existing || existing.length === 0) {
        const names = ['Hazel Graham', 'Scarlett Burns', 'Tyler Nichols'];
        for (let i = 0; i < names.length; i++) {
            const { error } = await sb.from('commander_seats').insert({
                game_id: GAME_ID, seat_number: i + 1, player_name: names[i],
                status: 'occupied', seated_at: new Date().toISOString(), buyin_amount: 300
            });
            console.log('Seat', i + 1, ':', error ? error.message : 'OK');
        }
        await sb.from('commander_games').update({ current_players: 3 }).eq('id', GAME_ID);
    }

    // Verify total counts
    const { count: seatTotal } = await sb.from('commander_seats').select('id', { count: 'exact' })
        .in('game_id', (await sb.from('commander_games').select('id').eq('venue_id', 1996).in('status', ['running', 'waiting'])).data.map(g => g.id))
        .eq('status', 'occupied');
    console.log('Total occupied seats across all games:', seatTotal);

    const { count: sessionTotal } = await sb.from('commander_table_sessions').select('id', { count: 'exact' })
        .eq('venue_id', 1996).eq('status', 'active');
    console.log('Total active sessions:', sessionTotal);
})();

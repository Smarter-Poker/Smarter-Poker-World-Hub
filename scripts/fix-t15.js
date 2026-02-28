const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync(require('path').join(__dirname, '..', '.env.local'), 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL="(.+?)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].replace(/"/g, '').trim();
const sb = createClient(url, key);
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

const GAME_ID = '615fe985-6895-4af9-9560-749c273b5371';

(async () => {
    // Find 7 unseated members
    const { data: allSeats } = await sb.from('commander_seats').select('player_name').eq('status', 'occupied');
    const seatedNames = new Set((allSeats || []).map(s => s.player_name));

    const { data: members } = await sb.from('commander_members')
        .select('id, first_name, last_name, membership_tier, member_number')
        .eq('venue_id', 1996);

    const unseated = (members || []).filter(m => !seatedNames.has(m.first_name + ' ' + m.last_name)).slice(0, 7);
    console.log('Found', unseated.length, 'unseated members');

    if (unseated.length === 0) {
        console.log('No unseated members - using first 7 members and creating new seats');
        process.exit(0);
    }

    for (let i = 0; i < unseated.length; i++) {
        const m = unseated[i];
        const name = m.first_name + ' ' + m.last_name;

        // Insert seat
        const { error: e1 } = await sb.from('commander_seats').insert({
            game_id: GAME_ID,
            seat_number: i + 1,
            player_name: name,
            player_id: m.id,
            status: 'occupied',
            seated_at: new Date(Date.now() - rand(1, 5) * 3600000).toISOString(),
            buyin_amount: [200, 300, 500, 500, 300, 200, 500][i],
        });
        if (e1) console.log('Seat error:', e1.message);

        // Insert session
        const { error: e2 } = await sb.from('commander_table_sessions').insert({
            venue_id: 1996,
            member_id: m.id,
            player_name: name,
            table_number: 15,
            seat_number: i + 1,
            time_allocated_minutes: rand(1440, 1800),
            time_added_minutes: 0,
            started_at: new Date().toISOString(),
            status: 'active',
            membership_tier: m.membership_tier,
            member_number: m.member_number,
        });
        if (e2) console.log('Session error:', e2.message);

        console.log('  Seated:', name, 'at S' + (i + 1));
    }

    // Update game
    await sb.from('commander_games').update({ current_players: unseated.length }).eq('id', GAME_ID);
    console.log('Done - T15 now has', unseated.length, 'players');
})();

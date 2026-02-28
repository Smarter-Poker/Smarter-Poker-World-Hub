const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync(require('path').join(__dirname, '..', '.env.local'), 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL="(.+?)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].replace(/"/g, '').trim();
const sb = createClient(url, key);

const VENUE_ID = 1996;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

async function fix() {
    console.log('=== FIXING MINOR ISSUES ===\n');

    // 1. Reset tables 16-20 to 'available' (no game running on them)
    const { data: tables } = await sb
        .from('commander_tables')
        .select('id, table_number, status, current_game_id')
        .eq('venue_id', VENUE_ID)
        .order('table_number');

    const activeGameIds = new Set();
    const { data: activeGames } = await sb
        .from('commander_games')
        .select('id, table_id')
        .eq('venue_id', VENUE_ID)
        .in('status', ['running', 'waiting']);

    (activeGames || []).forEach(g => activeGameIds.add(g.table_id));

    let fixed = 0;
    for (const t of (tables || [])) {
        if (t.status === 'in_use' && !activeGameIds.has(t.id)) {
            await sb.from('commander_tables')
                .update({ status: 'available', current_game_id: null, game_type: null, stakes: null })
                .eq('id', t.id);
            console.log('  Fixed table', t.table_number, '-> available (no active game)');
            fixed++;
        }
    }
    console.log('  Tables fixed:', fixed);

    // 2. Check dealer status field
    const { data: dealers } = await sb
        .from('commander_dealers')
        .select('id, name, status')
        .eq('venue_id', VENUE_ID);
    console.log('\n  Dealers:', (dealers || []).length);
    (dealers || []).forEach(d => console.log('   ', d.name, '| status:', d.status));

    // 3. Add waitlist entries for must-move games
    console.log('\n--- Adding waitlist entries for must-move queues ---');

    const PLAYER_NAMES = [
        'Tony Stark', 'Bruce Wayne', 'Peter Parker', 'Clark Kent',
        'Diana Prince', 'Barry Allen', 'Hal Jordan', 'Arthur Curry',
        'Natasha Romanoff', 'Wanda Maximoff', 'Sam Wilson', 'Scott Lang',
        'Carol Danvers', 'Hope Van Dyne', 'Shuri Udaku', 'T Challa',
        'Stephen Strange', 'James Rhodes', 'Clint Barton', 'Thor Odinson',
        'Steve Rogers', 'Pepper Potts', 'Nick Fury', 'Maria Hill',
    ];

    const GAME_STAKES = [
        { game_type: 'nlh', stakes: '1/2' },
        { game_type: 'nlh', stakes: '2/5' },
        { game_type: 'nlh', stakes: '5/10' },
        { game_type: 'plo', stakes: '1/2' },
        { game_type: 'plo', stakes: '2/5' },
    ];

    // Clear old waitlist for this venue first
    await sb.from('commander_waitlist')
        .delete()
        .eq('venue_id', VENUE_ID)
        .in('status', ['waiting', 'called']);

    const waitlistRows = [];
    let pos = 1;
    let nameIdx = 0;

    for (const gs of GAME_STAKES) {
        const numEntries = rand(3, 6);
        for (let i = 0; i < numEntries; i++) {
            waitlistRows.push({
                venue_id: VENUE_ID,
                game_type: gs.game_type,
                stakes: gs.stakes,
                player_name: PLAYER_NAMES[nameIdx % PLAYER_NAMES.length],
                position: i + 1,
                signup_method: pick(['walk_in', 'app', 'phone', 'kiosk']),
                status: i === 0 ? 'called' : 'waiting',
                call_count: i === 0 ? 1 : 0,
                last_called_at: i === 0 ? new Date().toISOString() : null,
                notes: i === 0 ? 'Called for seat' : null,
                estimated_wait_minutes: (i + 1) * 15,
            });
            nameIdx++;
        }
    }

    const { data: wlResult, error: wlErr } = await sb
        .from('commander_waitlist')
        .insert(waitlistRows)
        .select('id');

    if (wlErr) {
        console.error('  Waitlist error:', wlErr.message);
    } else {
        console.log('  Waitlist entries inserted:', wlResult?.length || waitlistRows.length);
        GAME_STAKES.forEach(gs => {
            const count = waitlistRows.filter(w => w.game_type === gs.game_type && w.stakes === gs.stakes).length;
            console.log('   ', gs.game_type.toUpperCase(), gs.stakes, ':', count, 'players waiting');
        });
    }

    console.log('\n=== DONE ===');
}
fix();

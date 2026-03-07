const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL="(.+?)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].replace(/"/g, '').trim();
const sb = createClient(url, key);

const VENUE_ID = 1996;
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

(async () => {
    console.log('=== Fixing remaining issues ===\n');

    // 1. Boost all sessions so they have 24-30 hrs remaining from NOW
    const { data: sessions } = await sb
        .from('commander_table_sessions')
        .select('id, player_name, started_at, time_allocated_minutes, time_added_minutes')
        .eq('venue_id', VENUE_ID)
        .eq('status', 'active');

    console.log('Active sessions:', sessions?.length);
    let boosted = 0;
    for (const s of (sessions || [])) {
        const elapsed = Math.floor((Date.now() - new Date(s.started_at).getTime()) / 1000);
        const currentAlloc = ((s.time_allocated_minutes || 0) + (s.time_added_minutes || 0)) * 60;
        const remaining = currentAlloc - elapsed;
        const targetHrs = rand(24, 30);
        const targetSeconds = targetHrs * 3600;

        if (remaining < 20 * 3600) {
            // Need to add more time so remaining = targetSeconds
            // remaining = alloc*60 - elapsed => alloc*60 = remaining + elapsed
            // new alloc = (targetSeconds + elapsed) / 60
            const newAlloc = Math.ceil((targetSeconds + elapsed) / 60);
            await sb.from('commander_table_sessions')
                .update({ time_allocated_minutes: newAlloc, time_added_minutes: 0 })
                .eq('id', s.id);
            boosted++;
        }
    }
    console.log('Boosted', boosted, 'low sessions');

    // 2. Add sessions for table 15 players (if missing)
    const { data: t15Seats } = await sb
        .from('commander_seats')
        .select('seat_number, player_name, game_id')
        .eq('status', 'occupied');

    // Get game -> table mapping
    const { data: games } = await sb.from('commander_games').select('id, table_id').eq('venue_id', VENUE_ID).in('status', ['running', 'waiting']);
    const { data: tables } = await sb.from('commander_tables').select('id, table_number').eq('venue_id', VENUE_ID);
    const tableNumById = {};
    (tables || []).forEach(t => { tableNumById[t.id] = t.table_number; });
    const gameTableNum = {};
    (games || []).forEach(g => { gameTableNum[g.id] = tableNumById[g.table_id]; });

    // Find seats at table 15
    const table15Seats = (t15Seats || []).filter(s => gameTableNum[s.game_id] === 15);
    console.log('\nTable 15 seats:', table15Seats.length);

    // Check existing sessions on table 15
    const { data: t15Sessions } = await sb
        .from('commander_table_sessions')
        .select('id')
        .eq('venue_id', VENUE_ID)
        .eq('table_number', 15)
        .eq('status', 'active');

    console.log('Existing table 15 sessions:', (t15Sessions || []).length);

    if ((t15Sessions || []).length === 0 && table15Seats.length > 0) {
        // Look up member IDs for these players
        const inserts = [];
        for (const seat of table15Seats) {
            const nameParts = seat.player_name.split(' ');
            const { data: member } = await sb.from('commander_members')
                .select('id, membership_tier, member_number')
                .eq('venue_id', VENUE_ID)
                .ilike('first_name', nameParts[0])
                .ilike('last_name', nameParts.slice(1).join(' '))
                .maybeSingle();

            inserts.push({
                venue_id: VENUE_ID,
                member_id: member?.id || null,
                player_name: seat.player_name,
                table_number: 15,
                seat_number: seat.seat_number,
                time_allocated_minutes: rand(1440, 1800), // 24-30 hours
                time_added_minutes: 0,
                started_at: new Date().toISOString(),
                status: 'active',
                membership_tier: member?.membership_tier || null,
                member_number: member?.member_number || null,
            });
        }

        if (inserts.length > 0) {
            const { error } = await sb.from('commander_table_sessions').insert(inserts);
            if (error) console.log('Insert error:', error.message);
            else console.log('Created', inserts.length, 'sessions for table 15');
        }
    }

    console.log('\n=== Done ===');
})();

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync(require('path').join(__dirname, '..', '.env.local'), 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL="(.+?)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].replace(/"/g, '').trim();
const sb = createClient(url, key);
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

(async () => {
    // Table 15 has 3 seats but the sessions were on OTHER tables
    // Need to update the old sessions for these 3 players to point to table 15
    const names = ['Hazel Graham', 'Scarlett Burns', 'Tyler Nichols'];

    for (let i = 0; i < names.length; i++) {
        const name = names[i];

        // Find their active session (which is on the wrong table)
        const { data: session } = await sb.from('commander_table_sessions')
            .select('id, table_number, seat_number')
            .eq('venue_id', 1996)
            .eq('player_name', name)
            .eq('status', 'active')
            .single();

        if (session) {
            // Update to table 15
            console.log(name + ': moving session from T' + session.table_number + ' to T15 S' + (i + 1));
            await sb.from('commander_table_sessions')
                .update({ table_number: 15, seat_number: i + 1 })
                .eq('id', session.id);
        } else {
            console.log(name + ': no active session found, creating new');
            const { data: member } = await sb.from('commander_members')
                .select('id, membership_tier, member_number')
                .eq('venue_id', 1996)
                .ilike('first_name', name.split(' ')[0])
                .ilike('last_name', name.split(' ').slice(1).join(' '))
                .single();

            await sb.from('commander_table_sessions').insert({
                venue_id: 1996,
                member_id: member ? member.id : null,
                player_name: name,
                table_number: 15,
                seat_number: i + 1,
                time_allocated_minutes: rand(1440, 1800),
                time_added_minutes: 0,
                started_at: new Date().toISOString(),
                status: 'active',
                membership_tier: member ? member.membership_tier : null,
                member_number: member ? member.member_number : null,
            });
        }
    }

    // Verify
    const { data: t15 } = await sb.from('commander_table_sessions')
        .select('player_name, table_number, seat_number')
        .eq('venue_id', 1996)
        .eq('table_number', 15)
        .eq('status', 'active');
    console.log('Table 15 active sessions:', (t15 || []).length);
    (t15 || []).forEach(s => console.log('  ' + s.player_name + ' S' + s.seat_number));

    const { count } = await sb.from('commander_table_sessions')
        .select('id', { count: 'exact' })
        .eq('venue_id', 1996)
        .eq('status', 'active');
    console.log('Total active sessions:', count);
})();

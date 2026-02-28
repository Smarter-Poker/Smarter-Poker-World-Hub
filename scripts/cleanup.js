const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync(require('path').join(__dirname, '..', '.env.local'), 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL="(.+?)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].replace(/"/g, '').trim();
const sb = createClient(url, key);

(async () => {
    // Find duplicate sessions (same player_name, multiple active sessions)
    const { data: sessions } = await sb.from('commander_table_sessions')
        .select('id, player_name, table_number, seat_number, created_at')
        .eq('venue_id', 1996)
        .eq('status', 'active')
        .order('created_at', { ascending: true });

    const seen = {};
    const dupes = [];
    (sessions || []).forEach(s => {
        if (seen[s.player_name]) {
            dupes.push(s); // Keep the earlier one, remove the later one
        } else {
            seen[s.player_name] = s;
        }
    });

    console.log('Duplicate sessions found:', dupes.length);
    for (const d of dupes) {
        console.log('  Ending:', d.player_name, 'T' + d.table_number, 'S' + d.seat_number);
        await sb.from('commander_table_sessions')
            .update({ status: 'ended', ended_at: new Date().toISOString(), ended_by: 'system-cleanup' })
            .eq('id', d.id);
    }

    const { count } = await sb.from('commander_table_sessions')
        .select('id', { count: 'exact' })
        .eq('venue_id', 1996)
        .eq('status', 'active');
    console.log('Active sessions after cleanup:', count);
})();

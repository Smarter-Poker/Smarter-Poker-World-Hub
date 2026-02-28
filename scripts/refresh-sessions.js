const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync(require('path').join(__dirname, '..', '.env.local'), 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL="(.+?)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].replace(/"/g, '').trim();
const sb = createClient(url, key);
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

(async () => {
    const { data: sessions } = await sb
        .from('commander_table_sessions')
        .select('id, started_at')
        .eq('venue_id', 1996)
        .eq('status', 'active');

    let boosted = 0;
    for (const s of (sessions || [])) {
        // Reset started_at to now and give 24-30 hours
        await sb.from('commander_table_sessions')
            .update({
                started_at: new Date().toISOString(),
                time_allocated_minutes: rand(1440, 1800),
                time_added_minutes: 0
            })
            .eq('id', s.id);
        boosted++;
    }
    console.log('Refreshed', boosted, 'sessions with 24-30 hours from now');
})();

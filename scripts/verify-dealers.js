const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL="(.+?)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].replace(/"/g, '').trim();
const sb = createClient(url, key);

(async () => {
    console.log('=== DEALER ASSIGNMENT VERIFICATION ===\n');

    // Active rotations
    const { data: rots } = await sb.from('commander_dealer_rotations')
        .select('dealer_name, table_number, started_at')
        .eq('venue_id', 1996).is('ended_at', null)
        .order('table_number');

    console.log(`Active rotations: ${rots?.length || 0}`);
    (rots || []).forEach(r => {
        const mins = Math.round((Date.now() - new Date(r.started_at).getTime()) / 60000);
        console.log(`  T${String(r.table_number).padStart(2)} -> ${r.dealer_name} (${mins} min at table)`);
    });

    // Tables in use
    const { data: tables } = await sb.from('commander_tables')
        .select('table_number')
        .eq('venue_id', 1996).eq('status', 'in_use')
        .order('table_number');

    const covered = new Set((rots || []).map(r => r.table_number));
    const missing = (tables || []).filter(t => !covered.has(t.table_number));
    console.log(`\nIn-use tables: ${tables?.length || 0}`);
    console.log(`Tables WITH dealer: ${covered.size}`);
    console.log(`Tables WITHOUT dealer: ${missing.length}`);
    if (missing.length > 0) {
        missing.forEach(m => console.log(`  ❌ T${m.table_number} — NO DEALER`));
    } else {
        console.log('  ✅ ALL tables covered');
    }

    // Dealer count
    const { count } = await sb.from('commander_dealers')
        .select('id', { count: 'exact' })
        .eq('venue_id', 1996).eq('is_active', true);
    console.log(`\nActive dealers: ${count}`);
    console.log(`  Dealing: ${covered.size}`);
    console.log(`  Available: ${count - covered.size}`);

    // Completed rotation history
    const { count: histCount } = await sb.from('commander_dealer_rotations')
        .select('id', { count: 'exact' })
        .eq('venue_id', 1996).not('ended_at', 'is', null);
    console.log(`\nCompleted rotation records: ${histCount}`);

    console.log('\n✅ VERIFICATION COMPLETE');
    process.exit(0);
})();

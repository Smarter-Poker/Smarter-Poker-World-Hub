const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.agent/skills/credentials/.env' });

const supabase = createClient('https://kuklfnapbkmacvwxktbh.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);

const manualMap = {
    'the bicycle hotel & casino': 2505,
    'lakes region casino': 2392,
    "rj's poker room": 2356,
    'hard rock casino cincinnati': 2617,
    'chicago charitable games': 2822,
    'rcg poker': 2824,
    'rockford charitable games': 2824,
    'wcc poker': 2827,
    'windy city poker championship': 2827,
    'the river card room': 1618,
    'resorts world las vegas': 2311,
    'chaser\'s poker room': 2351,
    'chasers poker room': 2351,
    'boston billiard club & casino': 2441,
    'bestbet jacksonville': 2318,
    'bestbet orange park': 2319,
    'bestbet st. augustine': 2320,
    'texas card house austin': 1637,
    'texas card house dallas': 1638,
    'texas card house houston': 1639,
    'texas card house spring': 1640,
    'texas card house rio grande valley': 1641,
    'texas card house': 1637, // default to austin if ambiguous
};

async function run() {
    const { data: venues } = await supabase.from('poker_venues').select('id, name');
    const venueMap = {};
    for (let v of venues) venueMap[v.name.toLowerCase().trim()] = v.id;

    let totalFixed = 0;
    let offset = 0;
    let hasMore = true;
    let unmappedSet = new Set();
    
    while (hasMore) {
        const { data: vdt } = await supabase.from('venue_daily_tournaments').select('*').is('venue_id', null).range(offset, offset + 999);
        if (!vdt || !vdt.length) break;

        let fixed = 0;
        for (let r of vdt) {
            if (!r.venue_name) continue;
            
            const lowerName = r.venue_name.toLowerCase().trim();
            let targetId = venueMap[lowerName] || manualMap[lowerName];
            
            if (!targetId) {
                for (let vName of Object.keys(venueMap)) {
                    // Try naive substring
                    if (vName.includes(lowerName) || lowerName.includes(vName)) {
                        targetId = venueMap[vName];
                        break;
                    }
                }
            }
            
            if (targetId) {
                const { error: updErr } = await supabase.from('venue_daily_tournaments').update({ venue_id: targetId }).eq('id', r.id);
                if (updErr) {
                    if (updErr.code === '23505') {
                        await supabase.from('venue_daily_tournaments').delete().eq('id', r.id);
                        fixed++;
                    } else {
                        console.error(`Failed to update ${r.id}:`, updErr);
                    }
                } else {
                    fixed++;
                }
            } else {
                unmappedSet.add(r.venue_name);
            }
        }
        totalFixed += fixed;
        
        offset += 1000;
        if (vdt.length < 1000) hasMore = false;
        
        // Account for deleted/updated rows shifting the offset
        // Actually, if we update/delete them, they no longer match `is('venue_id', null)`. 
        // So offset should NOT be incremented if we fixed everything in this batch.
        // Let's just adjust offset by how many were NOT fixed.
        offset = offset - 1000 + (1000 - fixed);
    }
    
    console.log(`Fixed ${totalFixed} broken FKs.`);
    if (unmappedSet.size > 0) {
        console.log(`Unmapped venues:\n`, Array.from(unmappedSet));
    }
}
run();

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.agent/skills/credentials/.env' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Known duplicate pairs based on Base Name
const DUPLICATES = [
    { target: 'Central Illinois Charitable Games', primaryId: null }, // Find by base name
    { target: 'Chicago Charitable Games', primaryId: null },
    { target: 'ACES Charity Poker', primaryId: null },
    { target: 'Lodge ', primaryId: null }, // Lodge Championship vs Lodge Poker
];

function getBaseName(name) {
    let base = name;
    if (base.includes(' - ')) base = base.split(' - ')[0];
    if (base.includes(' — ')) base = base.split(' — ')[0];
    base = base.trim();
    if (base.toLowerCase().startsWith('lodge ')) return 'Lodge';
    return base;
}

async function mergeDuplicateVenues(isDryRun = false) {
    console.log(`\n=== MERGING DUPLICATE VENUES ${isDryRun ? '(DRY RUN)' : ''} ===`);

    const { data: venues, error } = await supabase
        .from('poker_venues')
        .select('id, name, city, state, created_at')
        .order('id', { ascending: true }); // oldest first

    if (error) {
        console.error("Error fetching venues:", error.message);
        return;
    }

    // Group by base name
    const groups = {};
    for (const v of venues) {
        const base = getBaseName(v.name);
        if (!groups[base]) groups[base] = [];
        groups[base].push(v);
    }

    let mergedCount = 0;

    for (const [baseName, group] of Object.entries(groups)) {
        if (group.length > 1) {
            // Found a duplicate group!
            // First item (oldest) becomes the primary
            const primary = group[0];
            const obsolete = group.slice(1);

            console.log(`\n🔍 Found duplicates for base name "${baseName}":`);
            console.log(`  🌟 Primary Venue: [${primary.id}] ${primary.name}`);

            for (const obs of obsolete) {
                console.log(`  🗑️  Obsolete Venue to merge: [${obs.id}] ${obs.name}`);

                // Merge actions
                const tablesWithVenueFk = [
                    'venue_daily_tournaments',
                    'venue_tournaments',
                    'live_game_tracker',
                    'check_ins',
                    'venue_followers',
                    'venue_reviews'
                ];

                for (const table of tablesWithVenueFk) {
                    // Check if table exists / has data to update
                    const { count } = await supabase
                        .from(table)
                        .select('id', { count: 'exact', head: true })
                        .eq('venue_id', obs.id);
                    
                    if (count > 0) {
                        console.log(`       -> Found ${count} records in '${table}'`);
                        if (!isDryRun) {
                            const { error: updErr } = await supabase
                                .from(table)
                                .update({ venue_id: primary.id })
                                .eq('venue_id', obs.id);
                            
                            if (updErr) console.error(`       ❌ Error updating ${table}:`, updErr.message);
                            else console.log(`       ✅ Merged foreign keys in '${table}'`);
                        }
                    }
                }

                if (!isDryRun) {
                    const { error: delErr } = await supabase
                        .from('poker_venues')
                        .delete()
                        .eq('id', obs.id);
                    
                    if (delErr) console.error(`       ❌ Error deleting venue:`, delErr.message);
                    else {
                        console.log(`       ✅ Deleted duplicate venue [${obs.id}]`);
                        mergedCount++;
                    }
                }
            }
        }
    }

    console.log(`\n=== DONE ${isDryRun ? '(DRY RUN)' : ''} ===`);
    if (!isDryRun) {
        console.log(`Merged and deleted ${mergedCount} obsolete venues.`);
    }
}

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

mergeDuplicateVenues(isDryRun);

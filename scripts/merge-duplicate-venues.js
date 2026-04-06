const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.agent/skills/credentials/.env' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Manual mapping of Obsolete IDs to Primary IDs
const MERGE_MAP = [
    // ── IL Charitable Games ──
    { primaryId: 2805, obsolete: [2959] }, // Central Illinois Charitable Games
    { primaryId: 2802, obsolete: [2960] }, // Chicago Charitable Games

    // ── ACES Charity Poker ──
    // Merge Atmosphere Sports Bar & Del Rio into the base one
    { primaryId: 2817, obsolete: [2818] },

    // ── Lodge Series ──
    // 2658, 2633, 2718 are all series that take place at Lodge Poker Club (1828).
    // The user told us to merge them. The smartest move is to merge the 'series' venues into the 
    // actual physical venue where they take place [1828 Lodge Poker Club]!
    { primaryId: 1828, obsolete: [2633, 2658, 2718] }
];

async function mergeDuplicateVenues(isDryRun = false) {
    console.log(`\n=== MERGING EXPLICIT DUPLICATES ${isDryRun ? '(DRY RUN)' : ''} ===`);

    let mergedCount = 0;

    for (const group of MERGE_MAP) {
        const { primaryId, obsolete } = group;

        // Fetch primary
        const { data: primary, error } = await supabase
            .from('poker_venues')
            .select('id, name')
            .eq('id', primaryId)
            .single();

        if (error || !primary) {
            console.error(`❌ Could not find primary venue ${primaryId}`);
            continue;
        }

        console.log(`\n🌟 Primary Venue: [${primary.id}] ${primary.name}`);

        for (const obsId of obsolete) {
            const { data: obsVenue } = await supabase
                .from('poker_venues')
                .select('id, name')
                .eq('id', obsId)
                .single();
            
            if (!obsVenue) {
                console.log(`  ⚠️ Obsolete venue [${obsId}] not found. Skipping.`);
                continue;
            }

            console.log(`  🗑️  Obsolete Venue: [${obsVenue.id}] ${obsVenue.name}`);

            const tablesWithVenueFk = [
                'venue_daily_tournaments',
                'venue_tournaments',
                'live_game_tracker',
                'check_ins',
                'venue_followers',
                'poker_near_me_favorites', // Correct favorites table
                'venue_reviews'
            ];

            for (const table of tablesWithVenueFk) {
                const { count } = await supabase
                    .from(table)
                    .select('id', { count: 'exact', head: true })
                    .eq('venue_id', obsVenue.id);
                
                if (count > 0) {
                    console.log(`       -> Found ${count} records in '${table}'`);
                    if (!isDryRun) {
                        const { error: updErr } = await supabase
                            .from(table)
                            .update({ venue_id: primary.id })
                            .eq('venue_id', obsVenue.id);
                        
                        if (updErr) console.error(`       ❌ Error updating ${table}:`, updErr.message);
                        else console.log(`       ✅ Merged foreign keys in '${table}'`);
                    }
                }
            }

            if (!isDryRun) {
                const { error: delErr } = await supabase
                    .from('poker_venues')
                    .delete()
                    .eq('id', obsVenue.id);
                
                if (delErr) console.error(`       ❌ Error deleting venue:`, delErr.message);
                else {
                    console.log(`       ✅ Deleted duplicate venue [${obsVenue.id}]`);
                    mergedCount++;
                }
            }
        }
    }

    // Rename ACES Charity Poker base venue to just "ACES Charity Poker" since it moves
    if (!isDryRun) {
        const { error } = await supabase
            .from('poker_venues')
            .update({ name: 'ACES Charity Poker' })
            .eq('id', 2817);
        if (!error) console.log(`\n✅ Renamed ACES venue [2817] to "ACES Charity Poker"`);
    }

    console.log(`\n=== DONE ${isDryRun ? '(DRY RUN)' : ''} ===`);
    if (!isDryRun) console.log(`Merged and deleted ${mergedCount} obsolete venues.`);
}

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

mergeDuplicateVenues(isDryRun);

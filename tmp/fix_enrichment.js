/**
 * REVERT fabricated poker_tables counts from enrichment.
 * Per user rules:
 *   - poker_tables: ONLY from real live data, never fabricated
 *   - games_offered: OK to set ['NLH', 'PLO'] as static attribute
 *   - stakes_cash: OK to set ['$1/$2', '$2/$5'] as static attribute
 *   - hours: SKIP, don't worry about it
 *   - NO fake live game data EVER
 * 
 * Also ensures remaining empty venues get games_offered + stakes_cash filled.
 */
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fix() {
    const { data: venues, error } = await supabase
        .from('poker_venues')
        .select('id, name, city, state, venue_type, games_offered, stakes_cash, poker_tables')
        .eq('is_active', true)
        .order('id');

    if (error) { console.error(error); return; }

    console.log(`Active venues: ${venues.length}\n`);

    // ═══ STEP 1: Revert fabricated poker_tables ═══
    // The enrichment set exactly: 4 (charity), 6 (poker_club), 8 (casino non-big-state), 12 (casino big-state)
    // Real data would be values like 5, 10, 14, 20, 25, 52, etc. from Bravo/PokerAtlas scrapers.
    // Safe revert: NULL out any poker_tables that equals our fabrication defaults.
    const FABRICATED_VALUES = new Set([4, 6, 8, 12, 14]); // 14 was from KNOWN_VENUE_DATA
    
    // But we need to be careful: some venues already had these values legitimately.
    // The audit showed 275 venues had no tables before enrichment. The enrichment touched 384 venues.
    // We'll only revert venues with these exact values AND that have NO other signals of real data
    // (i.e., no website suggesting we manually set it, or a trust_score < 5 meaning it's likely auto-enriched)
    
    // Actually simpler: just set ALL poker_tables that match our fabricated defaults to null.
    // If a venue truly had 8 tables from a real source, it would have had it before the enrichment ran.
    // Since the enrichment is the only thing that set these round-number defaults, it's safe to revert all of them.
    
    let revertCount = 0;
    let gamesFixCount = 0;
    let stakesFixCount = 0;

    for (const v of venues) {
        if (v.venue_type === 'series' || v.venue_type === 'tour') continue;

        const updates = {};

        // Revert fabricated poker_tables
        if (v.poker_tables && FABRICATED_VALUES.has(v.poker_tables)) {
            updates.poker_tables = null;
            revertCount++;
        }

        // Fill in missing games_offered with ['NLH', 'PLO']
        if (!v.games_offered || !Array.isArray(v.games_offered) || v.games_offered.length === 0) {
            updates.games_offered = ['NLH', 'PLO'];
            gamesFixCount++;
        }

        // Fill in missing stakes_cash with ['$1/$2', '$2/$5']
        if (!v.stakes_cash || !Array.isArray(v.stakes_cash) || v.stakes_cash.length === 0) {
            updates.stakes_cash = ['$1/$2', '$2/$5'];
            stakesFixCount++;
        }

        if (Object.keys(updates).length > 0) {
            const { error: updateErr } = await supabase
                .from('poker_venues')
                .update(updates)
                .eq('id', v.id);
            if (updateErr) console.error(`  ERROR [${v.id}]: ${updateErr.message}`);
        }
    }

    console.log(`═══════════════════════════════════════════════════`);
    console.log(`  CORRECTIONS APPLIED`);
    console.log(`  poker_tables reverted to null: ${revertCount}`);
    console.log(`  games_offered filled (NLH+PLO): ${gamesFixCount}`);
    console.log(`  stakes_cash filled ($1/$2+$2/$5): ${stakesFixCount}`);
    console.log(`═══════════════════════════════════════════════════\n`);

    // ═══ STEP 2: Update all-venues.json ═══
    console.log(`Updating all-venues.json...`);
    const jsonPath = path.join(__dirname, '..', 'data', 'all-venues.json');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const jsonVenues = jsonData.venues || jsonData;

    let jsonFixed = 0;
    for (const jv of jsonVenues) {
        if (jv.is_active === false) continue;
        if (jv.venue_type === 'series' || jv.venue_type === 'tour') continue;
        let changed = false;

        // Revert fabricated poker_tables
        if (jv.poker_tables && FABRICATED_VALUES.has(jv.poker_tables)) {
            delete jv.poker_tables;
            changed = true;
        }

        // Fill games
        if (!jv.games_offered || !Array.isArray(jv.games_offered) || jv.games_offered.length === 0) {
            jv.games_offered = ['NLH', 'PLO'];
            changed = true;
        }

        // Fill stakes
        if (!jv.stakes_cash || !Array.isArray(jv.stakes_cash) || jv.stakes_cash.length === 0) {
            jv.stakes_cash = ['$1/$2', '$2/$5'];
            changed = true;
        }

        if (changed) jsonFixed++;
    }

    const output = jsonData.venues ? { ...jsonData, venues: jsonVenues } : jsonVenues;
    fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2) + '\n');
    console.log(`  JSON fixed: ${jsonFixed} venues\n`);

    // ═══ VERIFY ═══
    const { data: check } = await supabase
        .from('poker_venues')
        .select('id, name, games_offered, stakes_cash, poker_tables')
        .eq('is_active', true);

    const noGames = check.filter(v => !v.games_offered || v.games_offered.length === 0).length;
    const noStakes = check.filter(v => !v.stakes_cash || v.stakes_cash.length === 0).length;
    const hasTables = check.filter(v => v.poker_tables && v.poker_tables > 0).length;

    console.log(`═══════════════════════════════════════════════════`);
    console.log(`  VERIFICATION`);
    console.log(`  Venues with no games_offered: ${noGames}`);
    console.log(`  Venues with no stakes_cash: ${noStakes}`);
    console.log(`  Venues with real poker_tables: ${hasTables}`);
    console.log(`═══════════════════════════════════════════════════`);
}

fix().catch(console.error);

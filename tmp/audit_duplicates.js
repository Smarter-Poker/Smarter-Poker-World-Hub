/**
 * DEEP DIVE: Poker Near Me Venue Duplicate Audit
 * 
 * Identifies and generates cleanup SQL for:
 * 1. TRUE DUPLICATES - Same venue appearing twice (e.g., "Delaware Park" + "Delaware Park Casino")
 * 2. SERIES DUPLICATING BASE VENUES - "X Poker Series" entry that's really just a tournament at venue X
 * 3. NAME ISSUES - "American Place Casino Casino" (double word), etc.
 * 4. VENUES TO MERGE - Keep the richer record, delete the duplicate
 */
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Score a venue's "data richness" — higher = better/keep
 */
function richnessScore(v) {
    let score = 0;
    if (v.logo_url) score += 10;
    if (v.website) score += 5;
    if (v.phone) score += 3;
    if (v.address) score += 3;
    if (v.latitude && v.longitude) score += 5;
    if (v.games_offered && v.games_offered.length > 0) score += 10;
    if (v.stakes_cash && v.stakes_cash.length > 0) score += 8;
    if (v.hours_weekday) score += 3;
    if (v.hours_weekend) score += 3;
    if (v.poker_tables && v.poker_tables > 0) score += 5;
    if (v.has_tournaments) score += 3;
    if (v.trust_score) score += v.trust_score;
    // Prefer casino/poker_club over series
    if (v.venue_type === 'casino' || v.venue_type === 'poker_club') score += 20;
    if (v.venue_type === 'series') score -= 10;
    return score;
}

function normalize(str) {
    return str.toLowerCase()
        .replace(/poker\s*(room|series|classic|open|championship|tournament|event|invitational)/gi, '')
        .replace(/casino\s*(hotel|resort)?/gi, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();
}

async function audit() {
    const { data: venues, error } = await supabase
        .from('poker_venues')
        .select('id, name, city, state, venue_type, logo_url, latitude, longitude, address, phone, website, games_offered, stakes_cash, hours_weekday, hours_weekend, poker_tables, has_tournaments, trust_score, is_active')
        .order('id');

    if (error) { console.error(error); return; }

    console.log(`Total venues in database: ${venues.length}\n`);

    // ═══ 1. TRUE DUPLICATES (same normalized name + same city/state) ═══
    const groups = {};
    for (const v of venues) {
        if (!v.city || !v.state) continue;
        const key = `${normalize(v.name)}|${v.city.toLowerCase()}|${v.state.toLowerCase()}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(v);
    }

    const deleteIds = new Set();
    const keepIds = new Set();
    const mergeActions = [];
    const nameFixActions = [];

    console.log('═══════════════════════════════════════════════════');
    console.log('  CATEGORY 1: TRUE DUPLICATES (same venue name)');
    console.log('═══════════════════════════════════════════════════');

    for (const [key, vlist] of Object.entries(groups)) {
        if (vlist.length <= 1) continue;
        // Sort by richness, keep the richest
        vlist.sort((a, b) => richnessScore(b) - richnessScore(a));
        const keeper = vlist[0];
        const dupes = vlist.slice(1);
        
        console.log(`\n  Group [${key}]:`);
        console.log(`    KEEP  [${keeper.id}] ${keeper.name} (score: ${richnessScore(keeper)}) type: ${keeper.venue_type}`);
        for (const d of dupes) {
            console.log(`    DELETE [${d.id}] ${d.name} (score: ${richnessScore(d)}) type: ${d.venue_type}`);
            deleteIds.add(d.id);
        }
        keepIds.add(keeper.id);
        mergeActions.push({ keeper, dupes, reason: 'TRUE_DUPLICATE' });
    }

    // ═══ 2. SERIES/BASE VENUE PAIRS ═══
    console.log('\n\n═══════════════════════════════════════════════════');
    console.log('  CATEGORY 2: SERIES ENTRIES DUPLICATING BASE VENUES');
    console.log('═══════════════════════════════════════════════════');

    const venuesByCity = {};
    for (const v of venues) {
        if (!v.city || !v.state) continue;
        const cs = `${v.city.toLowerCase()}|${v.state.toLowerCase()}`;
        if (!venuesByCity[cs]) venuesByCity[cs] = [];
        venuesByCity[cs].push(v);
    }

    for (const [cs, vlist] of Object.entries(venuesByCity)) {
        if (vlist.length < 2) continue;
        for (let i = 0; i < vlist.length; i++) {
            for (let j = i + 1; j < vlist.length; j++) {
                const v1 = vlist[i];
                const v2 = vlist[j];
                
                // Already handled as true duplicate
                if (deleteIds.has(v1.id) || deleteIds.has(v2.id)) continue;
                
                const n1 = normalize(v1.name);
                const n2 = normalize(v2.name);
                
                // Skip if social club false positive (Houston TX)
                const raw1 = v1.name.toLowerCase();
                const raw2 = v2.name.toLowerCase();
                if (raw1.includes('social') && raw2.includes('social')) continue;
                
                if (n1.length > 3 && n2.length > 3 && (n1.includes(n2) || n2.includes(n1))) {
                    // One is a series, the other is a base venue — keep the base
                    const s1 = richnessScore(v1);
                    const s2 = richnessScore(v2);
                    const keeper = s1 >= s2 ? v1 : v2;
                    const dupe = s1 >= s2 ? v2 : v1;
                    
                    console.log(`\n  Pair in ${cs}:`);
                    console.log(`    KEEP  [${keeper.id}] ${keeper.name} (score: ${richnessScore(keeper)}) type: ${keeper.venue_type}`);
                    console.log(`    DELETE [${dupe.id}] ${dupe.name} (score: ${richnessScore(dupe)}) type: ${dupe.venue_type}`);
                    
                    deleteIds.add(dupe.id);
                    keepIds.add(keeper.id);
                    mergeActions.push({ keeper, dupes: [dupe], reason: 'SERIES_DUPLICATE' });
                }
            }
        }
    }

    // ═══ 3. NAME QUALITY ISSUES ═══
    console.log('\n\n═══════════════════════════════════════════════════');
    console.log('  CATEGORY 3: NAME QUALITY ISSUES');
    console.log('═══════════════════════════════════════════════════');

    // Check for double words (e.g., "Casino Casino")
    for (const v of venues) {
        const words = v.name.split(/\s+/);
        for (let i = 0; i < words.length - 1; i++) {
            if (words[i].toLowerCase() === words[i + 1].toLowerCase() && words[i].length > 2) {
                const fixed = words.filter((w, idx) => idx !== i + 1 || w.toLowerCase() !== words[i].toLowerCase()).join(' ');
                console.log(`  [${v.id}] "${v.name}" → "${fixed}" (repeated word: "${words[i]}")`);
                nameFixActions.push({ id: v.id, oldName: v.name, newName: fixed });
                break;
            }
        }
    }

    // ═══ 4. GENERATE SQL ═══
    console.log('\n\n═══════════════════════════════════════════════════');
    console.log('  GENERATED SQL');
    console.log('═══════════════════════════════════════════════════');

    if (deleteIds.size > 0) {
        const idsArr = [...deleteIds].sort((a, b) => a - b);
        console.log(`\n-- Delete ${idsArr.length} duplicate venues (soft-delete via is_active=false)`);
        console.log(`UPDATE poker_venues SET is_active = false WHERE id IN (${idsArr.join(', ')});`);
        console.log(`\n-- If you want to HARD delete instead:`);
        console.log(`-- DELETE FROM poker_venues WHERE id IN (${idsArr.join(', ')});`);
    }

    if (nameFixActions.length > 0) {
        console.log(`\n-- Fix ${nameFixActions.length} venue name issues`);
        for (const fix of nameFixActions) {
            console.log(`UPDATE poker_venues SET name = '${fix.newName.replace(/'/g, "''")}' WHERE id = ${fix.id}; -- was: "${fix.oldName}"`);
        }
    }

    // ═══ 5. SUMMARY ═══
    console.log('\n\n═══════════════════════════════════════════════════');
    console.log('  SUMMARY');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  Total duplicate venues to deactivate: ${deleteIds.size}`);
    console.log(`  Venues to keep (richer records): ${keepIds.size}`);
    console.log(`  Name fixes needed: ${nameFixActions.length}`);
    console.log(`  IDs to deactivate: [${[...deleteIds].sort((a,b)=>a-b).join(', ')}]`);
    console.log('');
}

audit().catch(console.error);

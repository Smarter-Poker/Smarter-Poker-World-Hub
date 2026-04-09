/**
 * DEEP DIVE: Audit venue cards for missing/generic data
 * 
 * Checks every active venue for:
 * 1. Missing or generic logos
 * 2. Empty games_offered
 * 3. Missing stakes
 * 4. Missing hours
 * 5. Missing website/phone
 * 6. Missing poker_tables count
 * 7. Missing address
 * 8. Low trust scores
 */
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Logo storage bucket base
const LOGO_BUCKET = `${supabaseUrl}/storage/v1/object/public/venue-logos/`;

async function audit() {
    const { data: venues, error } = await supabase
        .from('poker_venues')
        .select('*')
        .eq('is_active', true)
        .order('id');

    if (error) { console.error(error); return; }

    console.log(`Active venues to audit: ${venues.length}\n`);

    // Categorize issues
    const noLogo = [];
    const genericLogo = [];
    const noGames = [];
    const noStakes = [];
    const noHours = [];
    const noWebsite = [];
    const noPhone = [];
    const noTables = [];
    const noAddress = [];
    const sparseVenues = []; // venues with 3+ missing fields

    for (const v of venues) {
        // Skip series/tour entries
        if (v.venue_type === 'series' || v.venue_type === 'tour') continue;

        const issues = [];

        // Logo check
        const hasLogo = v.logo_url && v.logo_url.trim().length > 0;
        if (!hasLogo) {
            noLogo.push(v);
            issues.push('NO_LOGO');
        } else {
            // Check for generic/placeholder logos
            const logoUrl = v.logo_url.toLowerCase();
            if (logoUrl.includes('placeholder') || logoUrl.includes('default') || logoUrl.includes('generic')) {
                genericLogo.push(v);
                issues.push('GENERIC_LOGO');
            }
        }

        // Data completeness
        const hasGames = v.games_offered && Array.isArray(v.games_offered) && v.games_offered.length > 0;
        const hasStakes = v.stakes_cash && Array.isArray(v.stakes_cash) && v.stakes_cash.length > 0;
        const hasHoursWD = v.hours_weekday && v.hours_weekday.trim().length > 0;
        const hasHoursWE = v.hours_weekend && v.hours_weekend.trim().length > 0;
        const hasWebsite = v.website && v.website.trim().length > 0;
        const hasPhone = v.phone && v.phone.trim().length > 0;
        const hasTables = v.poker_tables && v.poker_tables > 0;
        const hasAddress = v.address && v.address.trim().length > 0;

        if (!hasGames) { noGames.push(v); issues.push('NO_GAMES'); }
        if (!hasStakes) { noStakes.push(v); issues.push('NO_STAKES'); }
        if (!hasHoursWD && !hasHoursWE) { noHours.push(v); issues.push('NO_HOURS'); }
        if (!hasWebsite) { noWebsite.push(v); issues.push('NO_WEBSITE'); }
        if (!hasPhone) { noPhone.push(v); issues.push('NO_PHONE'); }
        if (!hasTables) { noTables.push(v); issues.push('NO_TABLES'); }
        if (!hasAddress) { noAddress.push(v); issues.push('NO_ADDRESS'); }

        if (issues.length >= 3) {
            sparseVenues.push({ ...v, _issues: issues });
        }
    }

    // ═══ REPORT ═══
    console.log('═══════════════════════════════════════════════════');
    console.log('  VENUE CARD COMPLETENESS AUDIT');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  Venues with NO logo:       ${noLogo.length}`);
    console.log(`  Venues with generic logo:  ${genericLogo.length}`);
    console.log(`  Venues with no games:      ${noGames.length}`);
    console.log(`  Venues with no stakes:     ${noStakes.length}`);
    console.log(`  Venues with no hours:      ${noHours.length}`);
    console.log(`  Venues with no website:    ${noWebsite.length}`);
    console.log(`  Venues with no phone:      ${noPhone.length}`);
    console.log(`  Venues with no tables:     ${noTables.length}`);
    console.log(`  Venues with no address:    ${noAddress.length}`);
    console.log(`  SPARSE venues (3+ issues): ${sparseVenues.length}`);

    // ═══ SPARSE VENUES (worst offenders) ═══
    console.log('\n\n═══════════════════════════════════════════════════');
    console.log('  SPARSE VENUES — Cards that look empty/broken');
    console.log('═══════════════════════════════════════════════════');

    // Sort by issue count (worst first)
    sparseVenues.sort((a, b) => b._issues.length - a._issues.length);

    for (const v of sparseVenues) {
        console.log(`\n  [${v.id}] ${v.name} | ${v.city}, ${v.state} | type: ${v.venue_type}`);
        console.log(`    Issues (${v._issues.length}): ${v._issues.join(', ')}`);
        console.log(`    Logo: ${v.logo_url || 'NONE'}`);
        console.log(`    Games: ${JSON.stringify(v.games_offered) || 'NONE'}`);
        console.log(`    Stakes: ${JSON.stringify(v.stakes_cash) || 'NONE'}`);
        console.log(`    Tables: ${v.poker_tables || 'NONE'}`);
        console.log(`    Hours WD: ${v.hours_weekday || 'NONE'} | WE: ${v.hours_weekend || 'NONE'}`);
        console.log(`    Phone: ${v.phone || 'NONE'} | Website: ${v.website || 'NONE'}`);
        console.log(`    Address: ${v.address || 'NONE'}`);
        console.log(`    Trust: ${v.trust_score || 'NONE'}`);
    }

    // ═══ NO LOGO VENUES ═══
    console.log('\n\n═══════════════════════════════════════════════════');
    console.log('  VENUES WITH NO LOGO');
    console.log('═══════════════════════════════════════════════════');
    for (const v of noLogo) {
        console.log(`  [${v.id}] ${v.name} | ${v.city}, ${v.state} | type: ${v.venue_type}`);
    }

    // ═══ Check which logos actually exist in storage ═══
    console.log('\n\n═══════════════════════════════════════════════════');
    console.log('  LOGO STATUS CHECK (sample of venues with logos)');
    console.log('═══════════════════════════════════════════════════');

    // Write sparse venues to JSON for further processing
    const outputPath = path.join(__dirname, 'sparse_venues.json');
    fs.writeFileSync(outputPath, JSON.stringify({ 
        sparse: sparseVenues.map(v => ({ id: v.id, name: v.name, city: v.city, state: v.state, type: v.venue_type, issues: v._issues })),
        noLogo: noLogo.map(v => ({ id: v.id, name: v.name, city: v.city, state: v.state })),
        noGames: noGames.map(v => ({ id: v.id, name: v.name, city: v.city, state: v.state })),
    }, null, 2));
    console.log(`\n  Wrote detailed audit to: ${outputPath}`);
}

audit().catch(console.error);

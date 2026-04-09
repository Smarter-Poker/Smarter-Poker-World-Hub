/**
 * Upload REAL logos from Downloads folder to Supabase storage
 * and update venue records. No fake logos — all from real downloaded files.
 */
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Map: venue ID → path to real downloaded logo file
const LOGO_MAP = {
    1827: '/Users/smarter.poker/Downloads/BEST BET JACKSONVILLE.png',
    1889: '/Users/smarter.poker/Downloads/Rivers Pittsburgh Pittsburgh, PA ID- 2300.png',
    1993: '/Users/smarter.poker/Downloads/Peppermill Poker Room West Wendover, NV ID- 2855.jpeg',
    3089: '/Users/smarter.poker/Downloads/Oregon Poker Club - Stadiums Sports Bar Portland, OR ID- 1960 .jpeg',
    3121: '/Users/smarter.poker/Downloads/Rivers Chicago Chicago · Casino ID- 2313 .png',
    3125: '/Users/smarter.poker/Downloads/Daytona Beach Racing and Card Club Daytona Beach, FL ID- 2037.png',
};

async function uploadLogos() {
    console.log(`Uploading ${Object.keys(LOGO_MAP).length} real logos...\n`);
    
    let success = 0;
    let failed = 0;
    const results = {};

    for (const [idStr, filePath] of Object.entries(LOGO_MAP)) {
        const id = parseInt(idStr);
        
        if (!fs.existsSync(filePath)) {
            console.log(`  [${id}] FILE NOT FOUND: ${filePath}`);
            failed++;
            continue;
        }

        const fileBuffer = fs.readFileSync(filePath);
        const ext = path.extname(filePath).slice(1).toLowerCase();
        const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
        const storagePath = `${id}.${ext}`;

        console.log(`  [${id}] Uploading ${path.basename(filePath)} (${fileBuffer.length} bytes)...`);

        // Upload to Supabase storage
        const { error: uploadErr } = await supabase.storage
            .from('venue-logos')
            .upload(storagePath, fileBuffer, {
                contentType,
                upsert: true,
            });

        if (uploadErr) {
            console.error(`    ❌ Upload error: ${uploadErr.message}`);
            failed++;
            continue;
        }

        const logoUrl = `${supabaseUrl}/storage/v1/object/public/venue-logos/${storagePath}`;

        // Update venue record
        const { error: updateErr } = await supabase
            .from('poker_venues')
            .update({ logo_url: logoUrl })
            .eq('id', id);

        if (updateErr) {
            console.error(`    ❌ DB update error: ${updateErr.message}`);
            failed++;
            continue;
        }

        console.log(`    ✅ ${logoUrl}`);
        results[id] = logoUrl;
        success++;
    }

    console.log(`\n═══ RESULTS: ${success} uploaded, ${failed} failed ═══\n`);

    // Update all-venues.json
    if (Object.keys(results).length > 0) {
        const jsonPath = path.join(__dirname, '..', 'data', 'all-venues.json');
        const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        const jsonVenues = jsonData.venues || jsonData;

        for (const [idStr, logoUrl] of Object.entries(results)) {
            const id = parseInt(idStr);
            const jv = jsonVenues.find(v => v.id === id);
            if (jv) jv.logo_url = logoUrl;
        }

        const output = jsonData.venues ? { ...jsonData, venues: jsonVenues } : jsonVenues;
        fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2) + '\n');
        console.log(`Updated all-venues.json with ${Object.keys(results).length} logos`);
    }

    // Check remaining no-logo venues
    const { data: check } = await supabase.from('poker_venues')
        .select('id, name, logo_url, venue_type')
        .eq('is_active', true);
    const noLogo = check.filter(v => !v.logo_url && v.venue_type !== 'series' && v.venue_type !== 'tour');
    console.log(`\nRemaining venues with no logo: ${noLogo.length}`);
    noLogo.forEach(v => console.log(`  [${v.id}] ${v.name}`));
}

uploadLogos().catch(console.error);

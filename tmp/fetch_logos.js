/**
 * Fetch real logos for venues that are missing them.
 * Tries:
 *   1. Google Favicon API (high-res)
 *   2. Clearbit Logo API
 *   3. Direct website favicon
 * 
 * Downloads to tmp/logos/<id>.png then uploads to Supabase storage.
 */
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const VENUES_NEEDING_LOGOS = [
    { id: 1827, name: 'bestbet Jacksonville', domain: 'bestbetjax.com' },
    { id: 1889, name: 'Rivers Casino Pittsburgh', domain: 'riverspokerroom.com' },
    { id: 1993, name: 'Peppermill Resort Spa Casino', domain: 'peppermillreno.com' },
    { id: 2809, name: 'River Room Players Club', domain: 'riverroompoker.com' },
    { id: 3089, name: 'Oregon Poker Club - Rialto Pool Room', domain: null },
    { id: 3121, name: 'Rivers Chicago', domain: 'riverscasino.com' },
    { id: 3125, name: 'Daytona Racing & Card Club', domain: 'daytonapoker.com' },
];

function download(url) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http;
        mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return download(res.headers.location).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                res.resume();
                return;
            }
            const chunks = [];
            res.on('data', d => chunks.push(d));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

async function fetchLogo(venue) {
    const logoDir = path.join(__dirname, 'logos');
    if (!fs.existsSync(logoDir)) fs.mkdirSync(logoDir, { recursive: true });

    if (!venue.domain) {
        console.log(`  [${venue.id}] ${venue.name} — no domain, skipping`);
        return null;
    }

    // Try Google Favicon API (128px)
    const googleUrl = `https://www.google.com/s2/favicons?domain=${venue.domain}&sz=128`;
    // Try Clearbit
    const clearbitUrl = `https://logo.clearbit.com/${venue.domain}`;

    for (const [src, url] of [['Google', googleUrl], ['Clearbit', clearbitUrl]]) {
        try {
            const buf = await download(url);
            // Validate: must be > 1KB (avoid tiny placeholders)
            if (buf.length > 1024) {
                const ext = src === 'Clearbit' ? 'png' : 'png';
                const filePath = path.join(logoDir, `${venue.id}.${ext}`);
                fs.writeFileSync(filePath, buf);
                console.log(`  [${venue.id}] ${venue.name} — got logo from ${src} (${buf.length} bytes)`);
                return filePath;
            } else {
                console.log(`  [${venue.id}] ${venue.name} — ${src} returned tiny image (${buf.length}b), skipping`);
            }
        } catch (err) {
            console.log(`  [${venue.id}] ${venue.name} — ${src} failed: ${err.message}`);
        }
    }
    return null;
}

async function uploadLogo(venue, filePath) {
    const ext = path.extname(filePath).slice(1);
    const storagePath = `${venue.id}.${ext}`;
    
    const fileBuffer = fs.readFileSync(filePath);
    
    // Upload to Supabase storage
    const { error: uploadErr } = await supabase.storage
        .from('venue-logos')
        .upload(storagePath, fileBuffer, { 
            contentType: `image/${ext}`,
            upsert: true 
        });
    
    if (uploadErr) {
        console.error(`  [${venue.id}] Upload error: ${uploadErr.message}`);
        return null;
    }
    
    const logoUrl = `${supabaseUrl}/storage/v1/object/public/venue-logos/${storagePath}`;
    
    // Update venue record
    const { error: updateErr } = await supabase
        .from('poker_venues')
        .update({ logo_url: logoUrl })
        .eq('id', venue.id);
    
    if (updateErr) {
        console.error(`  [${venue.id}] DB update error: ${updateErr.message}`);
        return null;
    }
    
    console.log(`  [${venue.id}] ✅ Uploaded and linked: ${logoUrl}`);
    return logoUrl;
}

async function main() {
    console.log(`Fetching logos for ${VENUES_NEEDING_LOGOS.length} venues...\n`);
    
    let success = 0;
    let failed = 0;
    const results = {};
    
    for (const venue of VENUES_NEEDING_LOGOS) {
        const filePath = await fetchLogo(venue);
        if (filePath) {
            const logoUrl = await uploadLogo(venue, filePath);
            if (logoUrl) {
                results[venue.id] = logoUrl;
                success++;
            } else {
                failed++;
            }
        } else {
            failed++;
        }
    }
    
    console.log(`\n═══════════════════════════════════════════════════`);
    console.log(`  LOGO FETCH RESULTS`);
    console.log(`  Success: ${success}`);
    console.log(`  Failed: ${failed}`);
    console.log(`═══════════════════════════════════════════════════`);
    
    // Update all-venues.json for successful logos
    if (Object.keys(results).length > 0) {
        const jsonPath = path.join(__dirname, '..', 'data', 'all-venues.json');
        const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        const jsonVenues = jsonData.venues || jsonData;
        
        for (const [idStr, logoUrl] of Object.entries(results)) {
            const id = parseInt(idStr);
            const jv = jsonVenues.find(v => v.id === id);
            if (jv) {
                jv.logo_url = logoUrl;
            }
        }
        
        const output = jsonData.venues ? { ...jsonData, venues: jsonVenues } : jsonVenues;
        fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2) + '\n');
        console.log(`  Updated all-venues.json with ${Object.keys(results).length} logos`);
    }
}

main().catch(console.error);

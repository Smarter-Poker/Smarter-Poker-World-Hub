#!/usr/bin/env node
/**
 * Sync Verified PokerAtlas URLs to Database
 *
 * This script updates the database with verified PokerAtlas URLs from the JSON file.
 * It uses multiple matching strategies to find corresponding venues.
 *
 * Run with: node scripts/sync-verified-urls.js
 */

// Handle TLS certificate issues in some environments
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const CONFIG = {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY
};

if (!CONFIG.supabaseUrl || !CONFIG.supabaseKey) {
    console.error('❌ Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

// Normalize venue name for matching
function normalizeVenueName(name) {
    return name
        .toLowerCase()
        .replace(/[''`]/g, '')
        .replace(/&/g, 'and')
        .replace(/the\s+/gi, '')
        .replace(/hotel\s+(and\s+)?casino/gi, '')
        .replace(/casino\s+(and\s+)?hotel/gi, '')
        .replace(/resort\s+(and\s+)?casino/gi, '')
        .replace(/casino\s+(and\s+)?resort/gi, '')
        .replace(/poker\s+room/gi, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Get key words from a venue name
function getKeyWords(name) {
    const normalized = normalizeVenueName(name);
    const words = normalized.split(' ');
    // Filter out common words
    const stopWords = ['the', 'and', 'of', 'at', 'in', 'on', 'hotel', 'casino', 'resort', 'spa'];
    return words.filter(w => w.length > 2 && !stopWords.includes(w));
}

async function main() {
    console.log('═'.repeat(60));
    console.log('🔄 SYNCING VERIFIED POKERATLAS URLS TO DATABASE');
    console.log('═'.repeat(60));

    // Load verified venues
    const verifiedData = JSON.parse(fs.readFileSync('data/verified-poker-rooms.json', 'utf8'));
    const verifiedVenues = verifiedData.venues;
    console.log(`\n📋 Loaded ${verifiedVenues.length} verified venues from JSON\n`);

    // Get all venues from database
    const { data: dbVenues, error } = await supabase
        .from('poker_venues')
        .select('id, name, city, state, pokeratlas_url, pokeratlas_slug');

    if (error) {
        console.error('❌ Database error:', error.message);
        process.exit(1);
    }

    console.log(`📊 Found ${dbVenues.length} venues in database\n`);

    let matched = 0;
    let alreadySet = 0;
    let notFound = [];

    for (const verified of verifiedVenues) {
        const verifiedNorm = normalizeVenueName(verified.name);
        const verifiedKeyWords = getKeyWords(verified.name);

        // Try to find matching venue in database
        let bestMatch = null;
        let bestScore = 0;

        for (const dbVenue of dbVenues) {
            // Must match state
            if (dbVenue.state !== verified.state) continue;

            const dbNorm = normalizeVenueName(dbVenue.name);
            const dbKeyWords = getKeyWords(dbVenue.name);

            let score = 0;

            // Exact normalized match
            if (verifiedNorm === dbNorm) {
                score = 100;
            }
            // One contains the other
            else if (verifiedNorm.includes(dbNorm) || dbNorm.includes(verifiedNorm)) {
                score = 80;
            }
            // Keyword matching
            else {
                const commonKeywords = verifiedKeyWords.filter(w => dbKeyWords.includes(w));
                if (commonKeywords.length > 0) {
                    score = 50 + (commonKeywords.length * 10);
                }
            }

            // Bonus for city match
            if (dbVenue.city && verified.city &&
                normalizeVenueName(dbVenue.city) === normalizeVenueName(verified.city)) {
                score += 20;
            }

            if (score > bestScore) {
                bestScore = score;
                bestMatch = dbVenue;
            }
        }

        // Require minimum confidence score
        if (bestMatch && bestScore >= 60) {
            // Check if already set
            if (bestMatch.pokeratlas_url && bestMatch.pokeratlas_slug) {
                console.log(`⏭️  ${verified.name} -> Already configured`);
                alreadySet++;
                continue;
            }

            // Update database
            const { error: updateError } = await supabase
                .from('poker_venues')
                .update({
                    pokeratlas_url: verified.url,
                    pokeratlas_slug: verified.slug,
                    scrape_url: verified.url,
                    scrape_source: 'pokeratlas',
                    scrape_status: 'ready'
                })
                .eq('id', bestMatch.id);

            if (updateError) {
                console.log(`❌ Error updating ${verified.name}: ${updateError.message}`);
            } else {
                console.log(`✅ ${verified.name} -> ${bestMatch.name} (${verified.slug}) [score: ${bestScore}]`);
                matched++;
            }
        } else {
            notFound.push({ verified, bestMatch, bestScore });
        }
    }

    // Report
    console.log('\n' + '═'.repeat(60));
    console.log('📊 SYNC RESULTS');
    console.log('═'.repeat(60));
    console.log(`✅ Matched and updated: ${matched}`);
    console.log(`⏭️  Already configured: ${alreadySet}`);
    console.log(`⚠️  Not matched: ${notFound.length}`);

    if (notFound.length > 0) {
        console.log('\n📝 Unmatched venues (may need manual mapping):');
        notFound.slice(0, 20).forEach(({ verified, bestMatch, bestScore }) => {
            const matchInfo = bestMatch ? `best: "${bestMatch.name}" (score: ${bestScore})` : 'no match';
            console.log(`   • ${verified.name} (${verified.city}, ${verified.state}) - ${matchInfo}`);
        });
        if (notFound.length > 20) {
            console.log(`   ... and ${notFound.length - 20} more`);
        }
    }

    // Get updated counts
    const { count: totalWithUrls } = await supabase
        .from('poker_venues')
        .select('*', { count: 'exact', head: true })
        .not('pokeratlas_url', 'is', null);

    const { count: totalReady } = await supabase
        .from('poker_venues')
        .select('*', { count: 'exact', head: true })
        .eq('scrape_status', 'ready');

    console.log(`\n📈 Database Status:`);
    console.log(`   Total venues with PokerAtlas URLs: ${totalWithUrls}`);
    console.log(`   Total venues ready to scrape: ${totalReady}`);
    console.log('═'.repeat(60));
}

main().catch(console.error);

#!/usr/bin/env node
/**
 * Update database with verified PokerAtlas URLs
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const CONFIG = {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co',
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY
};

const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

async function main() {
    console.log('🔄 Updating database with verified PokerAtlas URLs\n');

    // Load verified venues
    const verifiedData = JSON.parse(fs.readFileSync('data/verified-poker-rooms.json', 'utf8'));
    const verifiedVenues = verifiedData.venues;

    console.log(`📋 Loaded ${verifiedVenues.length} verified venues\n`);

    let updated = 0;
    let notFound = [];

    for (const venue of verifiedVenues) {
        // Try multiple matching strategies
        const searchName = venue.name.toLowerCase();

        // Strategy 1: Exact name match
        let { data, error } = await supabase
            .from('poker_venues')
            .select('id, name')
            .ilike('name', venue.name)
            .limit(1);

        // Strategy 2: Partial match on first two words
        if (!data || data.length === 0) {
            const firstWords = venue.name.split(' ').slice(0, 2).join(' ');
            ({ data, error } = await supabase
                .from('poker_venues')
                .select('id, name')
                .ilike('name', `%${firstWords}%`)
                .eq('state', venue.state)
                .limit(1));
        }

        // Strategy 3: Match on city and state
        if (!data || data.length === 0) {
            const firstWord = venue.name.split(' ')[0];
            ({ data, error } = await supabase
                .from('poker_venues')
                .select('id, name')
                .ilike('name', `%${firstWord}%`)
                .ilike('city', venue.city)
                .limit(1));
        }

        if (data && data.length > 0) {
            const dbVenue = data[0];

            // Update with verified URL
            await supabase
                .from('poker_venues')
                .update({
                    pokeratlas_url: venue.url,
                    pokeratlas_slug: venue.slug,
                    scrape_url: venue.url,
                    scrape_source: 'pokeratlas',
                    scrape_status: 'ready'
                })
                .eq('id', dbVenue.id);

            console.log(`✅ ${venue.name} -> ${dbVenue.name} (${venue.slug})`);
            updated++;
        } else {
            console.log(`⚠️  Not found: ${venue.name} (${venue.city}, ${venue.state})`);
            notFound.push(venue);
        }
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`✅ Updated ${updated} venues with verified URLs`);
    console.log(`⚠️  ${notFound.length} venues not found in database`);

    // Get stats on remaining venues without URLs
    const { count: totalVenues } = await supabase
        .from('poker_venues')
        .select('*', { count: 'exact', head: true });

    const { count: withUrls } = await supabase
        .from('poker_venues')
        .select('*', { count: 'exact', head: true })
        .not('pokeratlas_url', 'is', null);

    console.log(`\n📊 Database Status:`);
    console.log(`   Total venues: ${totalVenues}`);
    console.log(`   With URLs: ${withUrls}`);
    console.log(`   Without URLs: ${totalVenues - withUrls}`);
}

main().catch(console.error);

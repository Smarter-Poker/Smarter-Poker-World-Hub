#!/usr/bin/env node
/**
 * Seed Venues from JSON to Database
 *
 * Populates the poker_venues table from tournament-venues.json
 * This is the SOURCE OF TRUTH for venues with daily tournaments.
 *
 * Run with: node scripts/seed-venues-from-json.js
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const CONFIG = {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY
};

if (!CONFIG.supabaseUrl || !CONFIG.supabaseKey) {
    console.error('Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

function generateSlug(name, city) {
    const base = `${name}-${city}`;
    return base
        .toLowerCase()
        .replace(/['']/g, '')
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function mapVenueType(type) {
    // Map JSON types to database enum values
    const typeMap = {
        'Casino': 'casino',
        'Card Room': 'card_room',
        'Poker Club': 'poker_club',
        'Home Game': 'home_game'
    };
    return typeMap[type] || 'casino';
}

async function main() {
    console.log('='.repeat(60));
    console.log('SEEDING VENUES FROM tournament-venues.json');
    console.log('='.repeat(60));

    // Load venues from JSON
    const jsonPath = path.join(__dirname, '../data/tournament-venues.json');
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const venues = data.venues;

    console.log(`\nLoaded ${venues.length} venues from JSON`);
    console.log(`Source: ${data.metadata?.source || 'tournament-venues.json'}`);
    console.log(`Last Updated: ${data.metadata?.lastUpdated || 'unknown'}\n`);

    let inserted = 0;
    let updated = 0;
    let errors = 0;

    for (const venue of venues) {
        const pokeratlasSlug = generateSlug(venue.name, venue.city);

        const venueData = {
            name: venue.name,
            city: venue.city,
            state: venue.state,
            venue_type: mapVenueType(venue.type),
            pokeratlas_slug: pokeratlasSlug,
            pokeratlas_url: venue.pokerAtlasUrl,
            scrape_url: venue.pokerAtlasUrl ? `${venue.pokerAtlasUrl}/tournaments` : null,
            scrape_source: 'pokeratlas',
            scrape_status: venue.pokerAtlasUrl ? 'ready' : 'no_url',
            is_active: true
        };

        // Try to find existing venue by name and state
        const { data: existing } = await supabase
            .from('poker_venues')
            .select('id')
            .eq('name', venue.name)
            .eq('state', venue.state)
            .single();

        if (existing) {
            // Update existing venue with scraper data
            const { error: updateError } = await supabase
                .from('poker_venues')
                .update({
                    pokeratlas_url: venueData.pokeratlas_url,
                    pokeratlas_slug: venueData.pokeratlas_slug,
                    scrape_url: venueData.scrape_url,
                    scrape_source: venueData.scrape_source,
                    scrape_status: venueData.scrape_status,
                    is_active: true
                })
                .eq('id', existing.id);

            if (updateError) {
                console.log(`  [ERROR] ${venue.name}: ${updateError.message}`);
                errors++;
            } else {
                updated++;
            }
        } else {
            // Insert new venue
            const { error: insertError } = await supabase
                .from('poker_venues')
                .insert(venueData);

            if (insertError) {
                console.log(`  [ERROR] ${venue.name}: ${insertError.message}`);
                errors++;
            } else {
                inserted++;
            }
        }
    }

    // Get final count
    const { count } = await supabase
        .from('poker_venues')
        .select('*', { count: 'exact', head: true });

    console.log('\n' + '='.repeat(60));
    console.log('SEEDING COMPLETE');
    console.log('='.repeat(60));
    console.log(`Venues in JSON:     ${venues.length}`);
    console.log(`Inserted:           ${inserted}`);
    console.log(`Updated:            ${updated}`);
    console.log(`Errors:             ${errors}`);
    console.log(`Total in Database:  ${count || 'unknown'}`);
    console.log('='.repeat(60));
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});

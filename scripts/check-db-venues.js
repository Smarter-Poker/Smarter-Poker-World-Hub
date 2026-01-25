#!/usr/bin/env node
/**
 * Check what venues are in the database
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log('📊 Checking database venues\n');

    // Get sample venues from each state
    const { data: venues, error } = await supabase
        .from('poker_venues')
        .select('id, name, city, state, pokeratlas_url')
        .limit(50);

    if (error) {
        console.log('❌ Error:', error.message);
        return;
    }

    console.log(`Found ${venues?.length || 0} venues (first 50):\n`);

    if (venues) {
        // Group by state
        const byState = {};
        venues.forEach(v => {
            if (!byState[v.state]) byState[v.state] = [];
            byState[v.state].push(v);
        });

        for (const [state, stateVenues] of Object.entries(byState)) {
            console.log(`\n${state}:`);
            stateVenues.forEach(v => {
                const url = v.pokeratlas_url ? '✓' : '✗';
                console.log(`  [${url}] ${v.name} (${v.city})`);
            });
        }
    }

    // Get total count
    const { count } = await supabase
        .from('poker_venues')
        .select('*', { count: 'exact', head: true });

    console.log(`\n\nTotal venues in database: ${count}`);

    // Count venues with URLs
    const { count: withUrl } = await supabase
        .from('poker_venues')
        .select('*', { count: 'exact', head: true })
        .not('pokeratlas_url', 'is', null);

    console.log(`Venues with PokerAtlas URLs: ${withUrl}`);
}

main().catch(console.error);

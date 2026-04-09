const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.agent/skills/credentials/.env' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findVenueIdColumns() {
    // We can't query information_schema from Supabase JS client usually, 
    // so we will query it using Postgrest swagger / API definition or just listing known tables.
    // Let's try calling rpc if we had one, but we don't.
    // Instead we'll just check common tables that might have it via REST.
    const potentialTables = [
        'venue_daily_tournaments',
        'venue_tournaments',
        'live_game_tracker',
        'check_ins',
        'venue_followers',
        'venue_reviews',
        'social_feed',
        'club_memberships',
        'leaderboards',
        'poker_tables',
        'waitlists'
    ];

    console.log("Checking tables for venue_id column...");
    for (const table of potentialTables) {
        const { data, error } = await supabase
            .from(table)
            .select('venue_id')
            .limit(1);
        
        if (error) {
            if (error.message.includes('Could not find') || error.code === 'PGRST204' || error.code === '42703') {
                // Doesn't exist
            } else {
                console.log(`Table ${table} error: ${error.message}`);
            }
        } else {
            console.log(`✅ Table '${table}' has venue_id column`);
        }
    }
}

findVenueIdColumns();

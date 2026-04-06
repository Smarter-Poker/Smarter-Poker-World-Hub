const { upsertVenue } = require('../scripts/utils/venue-upsert.js');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.agent/skills/credentials/.env' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testNodeUpsert() {
    console.log("Testing baseName enforcement...");
    const venueData = {
        name: "Lodge Poker Series — Austin Event",
        city: "Austin",
        state: "TX",
        address: "123 Test St",
        latitude: 30.2672,
        longitude: -97.7431
    };

    const status = await upsertVenue(supabase, venueData);
    console.log("Status:", status);
    
    // Check what the DB actually says now
    const { data } = await supabase.from('poker_venues').select('*').eq('name', 'Lodge Poker Series');
    // Actually the base name for Lodge is 'Lodge' according to python, wait! Let's check node version.
}

testNodeUpsert();

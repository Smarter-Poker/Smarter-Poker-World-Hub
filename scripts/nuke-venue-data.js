#!/usr/bin/env node
/**
 * NUKE VENUE DATA
 * Removes ALL corrupted venue data from Supabase
 * Preserves tournament_series table structure but removes venue links
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials');
    console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function nukeVenueData() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔥 NUKING ALL CORRUPTED VENUE DATA');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');

    // Step 1: Count existing data
    console.log('📊 Current data counts:');

    const { count: venueCount } = await supabase
        .from('poker_venues')
        .select('*', { count: 'exact', head: true });
    console.log(`   - poker_venues: ${venueCount || 0} records`);

    const { count: dailyCount } = await supabase
        .from('venue_daily_tournaments')
        .select('*', { count: 'exact', head: true });
    console.log(`   - venue_daily_tournaments: ${dailyCount || 0} records`);

    const { count: eventsCount } = await supabase
        .from('poker_events')
        .select('*', { count: 'exact', head: true });
    console.log(`   - poker_events: ${eventsCount || 0} records`);

    console.log('');
    console.log('🗑️  Deleting data...');

    // Step 2: Delete venue_daily_tournaments (references poker_venues)
    const { error: dailyError } = await supabase
        .from('venue_daily_tournaments')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows

    if (dailyError) {
        console.error('   ❌ venue_daily_tournaments:', dailyError.message);
    } else {
        console.log('   ✓ venue_daily_tournaments: CLEARED');
    }

    // Step 3: Delete poker_events (may have venue references)
    const { error: eventsError } = await supabase
        .from('poker_events')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows

    if (eventsError) {
        console.error('   ❌ poker_events:', eventsError.message);
    } else {
        console.log('   ✓ poker_events: CLEARED');
    }

    // Step 4: Delete poker_venues
    const { error: venuesError } = await supabase
        .from('poker_venues')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows

    if (venuesError) {
        console.error('   ❌ poker_venues:', venuesError.message);
    } else {
        console.log('   ✓ poker_venues: CLEARED');
    }

    // Step 5: Verify deletion
    console.log('');
    console.log('📊 Verifying deletion...');

    const { count: finalVenues } = await supabase
        .from('poker_venues')
        .select('*', { count: 'exact', head: true });

    const { count: finalDaily } = await supabase
        .from('venue_daily_tournaments')
        .select('*', { count: 'exact', head: true });

    const { count: finalEvents } = await supabase
        .from('poker_events')
        .select('*', { count: 'exact', head: true });

    console.log(`   - poker_venues: ${finalVenues || 0} records`);
    console.log(`   - venue_daily_tournaments: ${finalDaily || 0} records`);
    console.log(`   - poker_events: ${finalEvents || 0} records`);

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');

    if ((finalVenues || 0) === 0 && (finalDaily || 0) === 0 && (finalEvents || 0) === 0) {
        console.log('✅ ALL VENUE DATA SUCCESSFULLY REMOVED');
        console.log('   Database is clean and ready for fresh data import.');
    } else {
        console.log('⚠️  Some data may remain - check for errors above');
    }

    console.log('═══════════════════════════════════════════════════════════');
}

nukeVenueData().catch(console.error);

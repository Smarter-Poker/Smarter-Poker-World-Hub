#!/usr/bin/env node
/**
 * Sync Supabase Venues → JSON Registry
 * Dumps the truth from the `poker_venues` table into `data/all-venues.json` and `public/data/all-venues.json`
 */
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function exportVenues() {
    console.log('🔄 Fetching verified venues from Supabase...');
    
    // Fetch all active, scraped/verified venues
    const { data: venues, error } = await supabase
        .from('poker_venues')
        .select('*')
        .eq('is_active', true)
        .order('state', { ascending: true })
        .order('city', { ascending: true })
        .order('name', { ascending: true });
        
    if (error) {
        console.error('❌ Supabase fetch failed:', error.message);
        process.exit(1);
    }
    
    console.log(`✅ Loaded ${venues.length} active venues.`);
    
    // Convert to canonical JSON structure expected by Poker Near Me
    const formattedVenues = venues.map(v => ({
        id: v.id,
        name: v.name,
        slug: v.slug || v.pokeratlas_slug,
        website: v.website,
        address: v.address,
        city: v.city,
        state: v.state,
        phone: v.phone,
        venue_type: v.venue_type || 'card_room',
        has_tournaments: v.scrape_status === 'ready' || v.has_tournaments === true,
        poker_atlas_url: v.pokeratlas_url,
        hours: null, // UI handles this natively
        latitude: v.latitude || v.lat,
        longitude: v.longitude || v.lng,
        trust_score: v.data_quality === 'scraped_verified' ? 4.8 : (v.data_quality === 'manual_verified' ? 4.5 : 3.5),
        games_offered: v.games_offered || ['NLH'],
        stakes_cash: v.stakes_cash || null,
        poker_tables: v.poker_tables || null,
        hours_weekday: null,
        hours_weekend: null,
        about: v.description || null,
        logo_url: v.website ? `https://icons.duckduckgo.com/ip3/${new URL(v.website).hostname.replace('www.', '')}.ico` : null
    }));
    
    const output = {
        updated_at: new Date().toISOString(),
        total: formattedVenues.length,
        venues: formattedVenues
    };
    
    const jsonString = JSON.stringify(output, null, 2);
    
    const paths = [
        path.join(__dirname, '..', 'data', 'all-venues.json'),
        path.join(__dirname, '..', 'public', 'data', 'all-venues.json')
    ];
    
    for (const file of paths) {
        fs.writeFileSync(file, jsonString);
        console.log(`💾 Saved to ${file.split('Smarter-Poker-World-Hub/')[1] || file}`);
    }
    
    console.log('\n🎉 JSON registries successfully synchronized with backend!');
}

exportVenues();

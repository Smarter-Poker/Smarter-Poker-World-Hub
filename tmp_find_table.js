const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const envFile = fs.readFileSync('/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) return;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    env[key] = val;
});
const sup = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    // Check what tables exist - use the venues API route approach
    // First try poker_venues table
    const r1 = await sup.from('poker_venues').select('id, name, type, city, state').limit(2);
    if (!r1.error) {
        console.log('poker_venues columns:', Object.keys(r1.data[0] || {}).join(', '));
        console.log('poker_venues count:', r1.data.length);
        
        // Search for WSOPC
        const rw = await sup.from('poker_venues').select('id, name, type, city, state').ilike('name', '%WSOPC%');
        console.log('WSOPC in poker_venues:', JSON.stringify(rw.data));
        
        // Search for Grand Victoria
        const rgv = await sup.from('poker_venues').select('id, name, type, city, state').ilike('name', '%Grand Victoria%');
        console.log('Grand Victoria in poker_venues:', JSON.stringify(rgv.data));
        return;
    }
    console.log('poker_venues error:', r1.error.message);
    
    // Try venue_directory
    const r2 = await sup.from('venue_directory').select('*').limit(1);
    if (!r2.error) {
        console.log('venue_directory found');
        return;
    }
    console.log('venue_directory error:', r2.error.message);
}

run().catch(function(err) { console.error('Fatal:', err.message); });

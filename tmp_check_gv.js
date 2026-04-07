const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Parse .env.local properly
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

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY = env['SUPABASE_SERVICE_ROLE_KEY'];

console.log('URL:', SUPABASE_URL ? SUPABASE_URL.slice(0, 40) + '...' : 'MISSING');
console.log('KEY:', SERVICE_KEY ? SERVICE_KEY.slice(0, 20) + '...' : 'MISSING');

const sup = createClient(SUPABASE_URL, SERVICE_KEY);

async function run() {
    const { data: wsopc, error: e1 } = await sup
        .from('venues')
        .select('id, name, venue_type, city, state, trust_score')
        .ilike('name', '%WSOPC%');
    console.log('WSOPC venues:', JSON.stringify(wsopc, null, 2));
    if (e1) console.log('WSOPC error:', e1.message);

    const { data: gv, error: e2 } = await sup
        .from('venues')
        .select('id, name, venue_type, city, state, trust_score')
        .ilike('name', '%Grand Victoria%');
    console.log('Grand Victoria venues:', JSON.stringify(gv, null, 2));
    if (e2) console.log('GV error:', e2.message);
}

run().catch(err => console.error('Fatal:', err.message));

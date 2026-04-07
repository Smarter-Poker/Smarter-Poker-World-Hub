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
// Inspect columns
sup.from('venues').select('*').limit(1).then(function(r) {
    if(r.error) { console.log('ERROR:', r.error.message); return; }
    if(r.data && r.data[0]) console.log('Columns:', Object.keys(r.data[0]).join(', '));
    else console.log('No data');
});

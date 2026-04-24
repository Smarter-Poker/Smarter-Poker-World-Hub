/**
 * Fix unidirectional friendships - creates missing reverse rows
 * Run with: node scripts/fix-friendships.js
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';
// Use anon key if service key not available - the friendships table should be accessible
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_KEY) {
    console.error('No Supabase key found. Please set SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY');
    process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

(async () => {
    console.log('🔍 Querying all accepted friendships...');
    const { data: all, error } = await sb.from('friendships').select('id, user_id, friend_id').eq('status', 'accepted');
    if (error) { console.error('Query error:', error.message); return; }
    
    console.log(`📊 Total accepted friendship rows: ${all.length}`);
    
    // Build lookup set
    const pairSet = new Set();
    for (const f of all) pairSet.add(f.user_id + ':' + f.friend_id);
    
    // Find missing reverse rows
    const missingReverse = [];
    for (const f of all) {
        if (!pairSet.has(f.friend_id + ':' + f.user_id)) {
            missingReverse.push({ user_id: f.friend_id, friend_id: f.user_id });
        }
    }
    
    console.log(`⚠️  Missing reverse rows: ${missingReverse.length}`);
    
    if (missingReverse.length > 0) {
        console.log('🔧 Creating reverse rows...');
        let created = 0;
        let skipped = 0;
        for (const r of missingReverse) {
            const { error: e } = await sb.from('friendships').insert({ ...r, status: 'accepted' });
            if (!e) { created++; }
            else { skipped++; }
        }
        console.log(`✅ Created ${created} reverse rows (${skipped} skipped/already exist)`);
    } else {
        console.log('✅ All friendships are already bidirectional!');
    }
    
    // Verify counts for sample users
    console.log('\n📊 Verification (sample users):');
    const sampleUsers = [...new Set(all.slice(0, 20).map(f => f.user_id))].slice(0, 5);
    for (const uid of sampleUsers) {
        const [sentRes, recvRes] = await Promise.all([
            sb.from('friendships').select('friend_id').eq('user_id', uid).eq('status', 'accepted'),
            sb.from('friendships').select('user_id').eq('friend_id', uid).eq('status', 'accepted'),
        ]);
        const friendSet = new Set();
        (sentRes.data || []).forEach(r => friendSet.add(r.friend_id));
        (recvRes.data || []).forEach(r => friendSet.add(r.user_id));
        console.log(`  User ${uid.substr(0, 8)}... : sent=${(sentRes.data || []).length} recv=${(recvRes.data || []).length} unique=${friendSet.size}`);
    }
    
    console.log('\n🎯 Done!');
})();

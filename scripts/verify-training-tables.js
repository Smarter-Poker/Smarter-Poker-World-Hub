/**
 * 🔍 PHASE 1: DATABASE VERIFICATION
 * Run with: node scripts/verify-training-tables.js
 */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function verify() {
    console.log('🔍 PHASE 1: DATABASE VERIFICATION\n');

    // Check training_clinics
    const { data: clinics, error: e1 } = await supabase
        .from('training_clinics')
        .select('id, name, target_leak')
        .order('id')
        .limit(5);

    if (e1) {
        console.log('❌ training_clinics:', e1.message);
    } else {
        console.log('✅ training_clinics: EXISTS');
        clinics?.forEach(c => console.log(`   - ${c.id}: ${c.name}`));
    }

    // Check user_leaks
    const { error: e2 } = await supabase.from('user_leaks').select('id').limit(1);
    console.log(e2 ? `❌ user_leaks: ${e2.message}` : '✅ user_leaks: EXISTS');

    // Check xp_logs  
    const { error: e3 } = await supabase.from('xp_logs').select('id').limit(1);
    console.log(e3 ? `❌ xp_logs: ${e3.message}` : '✅ xp_logs: EXISTS');

    // Count total clinics
    const { count } = await supabase
        .from('training_clinics')
        .select('*', { count: 'exact', head: true });

    console.log('\n📊 SUMMARY:');
    console.log(`   Total clinics: ${count || 0}`);

    if (count === 28) {
        console.log('   ✅ All 28 clinics seeded correctly!');
    } else if (count > 0) {
        console.log(`   ⚠️ Expected 28 clinics, found ${count}`);
    } else {
        console.log('   ❌ No clinics found - run migration!');
    }
}

verify().catch(console.error);

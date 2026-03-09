require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Missing env vars.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function verify() {
    console.log('Verifying geeves_missed_questions table...');

    // Check if table exists by reading 1 row
    const { data: tableData, error: tableError } = await supabase
        .from('geeves_missed_questions')
        .select('*')
        .limit(1);

    if (tableError) {
        console.error('❌ Table not verified:', tableError.message);
        process.exit(1);
    }
    console.log('✅ Table geeves_missed_questions exists and is accessible via service_role.');

    // Attempt to invoke the RPC
    const { data: rpcData, error: rpcError } = await supabase.rpc('geeves_increment_missed_count', {
        p_hash: 'verification_test'
    });

    if (rpcError) {
        console.error('❌ RPC missing or failed:', rpcError.message);
        process.exit(1);
    }
    console.log('✅ RPC endpoints exist and are executable.');
    console.log('\n✅ 100% Verified');
}

verify();

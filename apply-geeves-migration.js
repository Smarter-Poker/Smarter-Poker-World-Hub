const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('❌ Missing environment variables');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function run() {
    console.log('Running Geeves migration...');
    const migrationPath = path.join(__dirname, 'supabase/migrations/20260308_geeves_missed_questions.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Remove comments to prevent issues with the RPC parser
    const cleanSql = sql.replace(/--.*$/gm, '').trim();

    console.log(`Executing ${cleanSql.length} bytes of SQL...`);

    const { data, error } = await supabase.rpc('exec_sql', { sql_query: cleanSql });

    if (error) {
        console.error('❌ RPC Failed:', error.message);

        // Try statement by statement fallback
        const statements = cleanSql.split(';').map(s => s.trim()).filter(Boolean);
        let fails = 0;
        for (const stmt of statements) {
            const { error: e2 } = await supabase.rpc('exec_sql', { sql_query: stmt + ';' });
            if (e2) {
                console.error('  Failed statement:', stmt.substring(0, 50));
                console.error('  Error:', e2.message);
                fails++;
            } else {
                console.log('  ✅ Success:', stmt.substring(0, 50));
            }
        }
        if (fails > 0) process.exit(1);
    } else {
        console.log('✅ Mass execution successful.');
    }

    // Verify table
    const { count, error: countError } = await supabase.from('geeves_missed_questions').select('*', { count: 'exact', head: true });
    if (countError) {
        console.error('❌ Verification failed:', countError.message);
        process.exit(1);
    }

    console.log(`✅ Table verified! Row count: ${count}`);
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});

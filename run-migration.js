#!/usr/bin/env node

/**
 * Run sports_clips table migration on production database
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('❌ Missing environment variables');
    console.error('   NEXT_PUBLIC_SUPABASE_URL:', !!SUPABASE_URL);
    console.error('   SUPABASE_SERVICE_ROLE_KEY:', !!SERVICE_ROLE_KEY);
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function runMigration() {
    console.log('\n🔧 Running sports_clips table migration...\n');

    // Read migration file
    const migrationPath = path.join(__dirname, 'supabase/migrations/20260129_sports_clips_table.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration SQL:');
    console.log(migrationSQL);
    console.log('\n');

    try {
        // Execute the migration
        const { data, error } = await supabase.rpc('exec_sql', {
            sql: migrationSQL
        });

        if (error) {
            // Try alternative method - direct query
            console.log('⚠️  RPC method failed, trying direct execution...\n');

            // Split into individual statements
            const statements = migrationSQL
                .split(';')
                .map(s => s.trim())
                .filter(s => s.length > 0 && !s.startsWith('--'));

            for (const statement of statements) {
                console.log(`Executing: ${statement.substring(0, 50)}...`);
                const { error: stmtError } = await supabase.rpc('exec_sql', { sql: statement });
                if (stmtError) {
                    console.error(`   ❌ Error:`, stmtError.message);
                } else {
                    console.log(`   ✅ Success`);
                }
            }
        } else {
            console.log('✅ Migration executed successfully!\n');
        }

        // Verify table was created
        console.log('🔍 Verifying table creation...\n');
        const { data: tableCheck, error: checkError } = await supabase
            .from('sports_clips')
            .select('count')
            .limit(1);

        if (checkError) {
            console.error('❌ Table verification failed:', checkError.message);
            console.log('\n⚠️  The table may not exist. You may need to run the migration manually in Supabase Dashboard.');
        } else {
            console.log('✅ Table exists and is accessible!\n');

            // Check row count
            const { count, error: countError } = await supabase
                .from('sports_clips')
                .select('*', { count: 'exact', head: true });

            if (!countError) {
                console.log(`📊 Current row count: ${count}\n`);
            }
        }

    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        console.log('\n📝 Manual migration required:');
        console.log('   1. Go to Supabase Dashboard → SQL Editor');
        console.log('   2. Paste and run the migration SQL from:');
        console.log('      supabase/migrations/20260129_sports_clips_table.sql');
        process.exit(1);
    }
}

runMigration().then(() => {
    console.log('✅ Migration complete!\n');
    process.exit(0);
}).catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});

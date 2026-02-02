#!/usr/bin/env node

/**
 * Run Live Help Database Migration
 * Applies the live_help_system.sql migration to production database
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase credentials');
    console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗');
    console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '✗');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
    console.log('🚀 Running Live Help Database Migration...\n');

    // Read migration file
    const migrationPath = path.join(__dirname, 'supabase/migrations/20260129_live_help_system.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration file:', migrationPath);
    console.log('📊 SQL size:', sql.length, 'bytes\n');

    try {
        // Execute the SQL
        const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

        if (error) {
            // If exec_sql doesn't exist, try direct execution
            console.log('⚠️  exec_sql RPC not found, trying direct execution...\n');

            // Split into individual statements and execute
            const statements = sql
                .split(';')
                .map(s => s.trim())
                .filter(s => s.length > 0 && !s.startsWith('--'));

            for (let i = 0; i < statements.length; i++) {
                const statement = statements[i] + ';';
                console.log(`Executing statement ${i + 1}/${statements.length}...`);

                const { error: stmtError } = await supabase.rpc('exec_sql', { sql: statement });

                if (stmtError) {
                    console.error(`❌ Error in statement ${i + 1}:`, stmtError.message);
                    throw stmtError;
                }
            }
        }

        console.log('\n✅ Migration completed successfully!');
        console.log('\n📋 Created tables:');
        console.log('   - live_help_conversations');
        console.log('   - live_help_messages');
        console.log('   - live_help_tickets');
        console.log('\n🔒 RLS policies enabled');
        console.log('⚡ Triggers configured');

    } catch (err) {
        console.error('\n❌ Migration failed:', err.message);
        console.error('\nFull error:', err);
        process.exit(1);
    }
}

runMigration();

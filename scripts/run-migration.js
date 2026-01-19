/**
 * Schema Migration Executor
 * Runs SQL migration to add missing columns
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
    console.log('\n=== Running Schema Migration ===\n');

    try {
        // Read migration file
        const migrationPath = path.join(process.cwd(), 'supabase/migrations/20260119_schema_enhancements.sql');
        const sql = await fs.readFile(migrationPath, 'utf8');

        console.log('📄 Loaded migration file');
        console.log('🚀 Executing SQL...\n');

        // Execute migration
        const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql }).catch(async () => {
            // Fallback: execute via REST API
            const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
                    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
                },
                body: JSON.stringify({ sql_query: sql })
            });

            if (!response.ok) {
                throw new Error(`Migration failed: ${response.statusText}`);
            }

            return { data: await response.json(), error: null };
        });

        if (error) {
            console.error('❌ Migration error:', error.message);
            console.log('\n⚠️  You may need to run this SQL manually in Supabase SQL Editor');
            console.log(`📁 File: ${migrationPath}\n`);
            return false;
        }

        console.log('✅ Migration executed successfully!\n');

        // Verify columns were added
        const { data: venueColumns } = await supabase
            .from('poker_venues')
            .select('*')
            .limit(1);

        if (venueColumns && venueColumns[0]) {
            console.log('📊 Updated poker_venues schema:');
            console.log(Object.keys(venueColumns[0]).join(', '));
            console.log('');
        }

        return true;

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.log('\n💡 Manual execution required:');
        console.log('1. Open Supabase SQL Editor');
        console.log('2. Copy contents of: supabase/migrations/20260119_schema_enhancements.sql');
        console.log('3. Execute the SQL\n');
        return false;
    }
}

// Main execution
runMigration().then(success => {
    process.exit(success ? 0 : 1);
});

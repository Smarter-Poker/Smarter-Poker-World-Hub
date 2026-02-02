const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Read env
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
    console.log('Running Live Help migration...');

    const sql = fs.readFileSync('./supabase/migrations/20260129_live_help_system.sql', 'utf8');

    // Split into statements
    const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s && !s.startsWith('--') && s.length > 5);

    console.log(`Found ${statements.length} SQL statements`);

    for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        console.log(`\nExecuting ${i + 1}/${statements.length}...`);
        console.log(stmt.substring(0, 100) + '...');

        try {
            const { error } = await supabase.rpc('exec_sql', { query: stmt });
            if (error) throw error;
            console.log('✓ Success');
        } catch (err) {
            console.error('✗ Error:', err.message);
        }
    }

    console.log('\n✅ Migration complete!');
}

runMigration().catch(console.error);

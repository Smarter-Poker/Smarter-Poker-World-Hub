#!/usr/bin/env node
/**
 * 🚀 EXECUTE TRAINING ENGINE MIGRATION
 * ═══════════════════════════════════════════════════════════════════════════
 * Runs the training engine schema SQL directly against Supabase
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    console.log('🚀 Training Engine Database Migration\n');

    // Initialize Supabase client
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Read SQL file
    const sqlPath = path.join(__dirname, '../supabase/migrations/20260118_training_engine_schema.sql');
    console.log(`📄 Reading SQL from: ${sqlPath}`);

    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Split into individual statements (simple split on semicolons)
    const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📊 Found ${statements.length} SQL statements\n`);

    let successCount = 0;
    let errorCount = 0;

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];

        // Skip comments and empty lines
        if (!stmt || stmt.startsWith('--')) continue;

        // Get first few words for logging
        const preview = stmt.substring(0, 60).replace(/\n/g, ' ');

        try {
            const { error } = await supabase.rpc('exec_sql', {
                sql_query: stmt + ';'
            });

            if (error) {
                console.error(`❌ [${i + 1}/${statements.length}] ${preview}...`);
                console.error(`   Error: ${error.message}\n`);
                errorCount++;
            } else {
                console.log(`✅ [${i + 1}/${statements.length}] ${preview}...`);
                successCount++;
            }
        } catch (err) {
            console.error(`❌ [${i + 1}/${statements.length}] ${preview}...`);
            console.error(`   Exception: ${err.message}\n`);
            errorCount++;
        }
    }

    console.log(`\n📊 Migration Complete:`);
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Errors: ${errorCount}\n`);

    // Verify tables
    console.log('🔍 Verifying tables...\n');

    const { count: clinicsCount } = await supabase
        .from('training_clinics')
        .select('*', { count: 'exact', head: true });

    const { count: leaksCount } = await supabase
        .from('user_leaks')
        .select('*', { count: 'exact', head: true });

    const { count: xpCount } = await supabase
        .from('xp_logs')
        .select('*', { count: 'exact', head: true });

    console.log(`📋 training_clinics: ${clinicsCount || 0} rows`);
    console.log(`📋 user_leaks: ${leaksCount || 0} rows`);
    console.log(`📋 xp_logs: ${xpCount || 0} rows\n`);

    if (clinicsCount === 28) {
        console.log('✅ All 28 clinics seeded successfully!\n');
    } else {
        console.log(`⚠️  Expected 28 clinics, found ${clinicsCount}\n`);
    }

    process.exit(errorCount > 0 ? 1 : 0);
}

runMigration().catch(err => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
});

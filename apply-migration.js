#!/usr/bin/env node
/**
 * Apply Diamond Reward System V2 Migration
 * Run with: node apply-migration.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.oZxe_-RYdGvfPHxg7EhSJx-E3Tl6nYG3YZGP8Q7bYc0';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function applyMigration() {
    console.log('💎 Diamond Reward System V2 - Applying Migration...\n');

    // Read the SQL file
    const sqlPath = path.join(__dirname, 'supabase/migrations/20260112_diamond_reward_system_v2.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    // Split by semicolons but be careful with function definitions
    const statements = [];
    let currentStatement = '';
    let inFunction = false;

    for (const line of sql.split('\n')) {
        if (line.includes('$$ LANGUAGE') || line.includes('$$;')) {
            inFunction = false;
        }
        if (line.includes('AS $$') || line.includes('RETURNS TRIGGER AS')) {
            inFunction = true;
        }

        currentStatement += line + '\n';

        if (line.trim().endsWith(';') && !inFunction) {
            if (currentStatement.trim() && !currentStatement.trim().startsWith('--')) {
                statements.push(currentStatement.trim());
            }
            currentStatement = '';
        }
    }

    console.log(`📋 Found ${statements.length} SQL statements to execute\n`);

    let success = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        const preview = stmt.substring(0, 80).replace(/\n/g, ' ');

        // Skip comments
        if (stmt.trim().startsWith('--')) {
            continue;
        }

        try {
            const { error } = await supabase.rpc('exec_sql', { sql_query: stmt });

            if (error) {
                if (error.message.includes('already exists') || error.message.includes('duplicate key')) {
                    console.log(`⏭️  ${i + 1}. Skipped (exists): ${preview}...`);
                    skipped++;
                } else {
                    console.log(`❌ ${i + 1}. Error: ${error.message.substring(0, 100)}`);
                    errors++;
                }
            } else {
                console.log(`✅ ${i + 1}. Success: ${preview}...`);
                success++;
            }
        } catch (e) {
            console.log(`❌ ${i + 1}. Exception: ${e.message.substring(0, 100)}`);
            errors++;
        }
    }

    console.log('\n═══════════════════════════════════════════════════');
    console.log(`✅ Success: ${success}`);
    console.log(`⏭️  Skipped: ${skipped}`);
    console.log(`❌ Errors: ${errors}`);
    console.log('═══════════════════════════════════════════════════\n');
}

applyMigration().catch(console.error);

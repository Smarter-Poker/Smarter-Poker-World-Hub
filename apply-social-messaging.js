#!/usr/bin/env node
/**
 * Apply Social Messaging System Migration
 * Run with: SUPABASE_SERVICE_KEY=your_key node apply-social-messaging.js
 * 
 * Get your service_role key from: Supabase Dashboard > Settings > API > service_role key
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
    console.error('❌ SUPABASE_SERVICE_KEY is required!');
    console.error('');
    console.error('Get your service_role key from:');
    console.error('  Supabase Dashboard > Settings > API > service_role key (secret)');
    console.error('');
    console.error('Run with: SUPABASE_SERVICE_KEY=your_key node apply-social-messaging.js');
    console.error('');
    console.error('Or add to .env.local:');
    console.error('  SUPABASE_SERVICE_KEY=your_service_role_key');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function applyMigration() {
    console.log('💬 Social Messaging System - Applying Migration...\n');

    // Read the SQL file
    const sqlPath = path.join(__dirname, 'supabase/migrations/20260112_social_messaging.sql');
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

        // Skip pure comments
        if (stmt.trim().startsWith('--')) {
            continue;
        }

        try {
            // Use raw SQL execution via rpc or direct query
            const { data, error } = await supabase.from('_migrations_placeholder_').select('*').limit(0);

            // Execute raw SQL using the Postgres function
            const result = await supabase.rpc('exec_sql', { sql_query: stmt });

            if (result.error) {
                const msg = result.error.message || '';
                if (msg.includes('already exists') || msg.includes('duplicate key') || msg.includes('relation') && msg.includes('already')) {
                    console.log(`⏭️  ${i + 1}. Skipped (exists): ${preview}...`);
                    skipped++;
                } else {
                    console.log(`❌ ${i + 1}. Error: ${msg.substring(0, 100)}`);
                    errors++;
                }
            } else {
                console.log(`✅ ${i + 1}. Success: ${preview}...`);
                success++;
            }
        } catch (e) {
            const msg = e.message || '';
            if (msg.includes('already exists')) {
                console.log(`⏭️  ${i + 1}. Skipped (exists): ${preview}...`);
                skipped++;
            } else {
                console.log(`❌ ${i + 1}. Exception: ${msg.substring(0, 100)}`);
                errors++;
            }
        }
    }

    console.log('\n═══════════════════════════════════════════════════');
    console.log(`✅ Success: ${success}`);
    console.log(`⏭️  Skipped: ${skipped}`);
    console.log(`❌ Errors: ${errors}`);
    console.log('═══════════════════════════════════════════════════\n');

    if (errors === 0) {
        console.log('🎉 Social Messaging System deployed successfully!\n');
    }
}

applyMigration().catch(console.error);

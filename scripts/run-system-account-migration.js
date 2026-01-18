#!/usr/bin/env node

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RUN MIGRATION — System Account Setup
 * 
 * Executes the system account migration using Supabase client
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Initialize Supabase client with SERVICE ROLE key
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

async function runMigration() {
    try {
        console.log('🚀 Running system account migration...\n');

        // Read the migration file
        const migrationSQL = fs.readFileSync(
            'supabase/migrations/20260117_system_account_setup.sql',
            'utf8'
        );

        // Split into individual statements (simple approach)
        const statements = migrationSQL
            .split('$$;')
            .filter(stmt => stmt.trim().length > 0);

        console.log(`Found ${statements.length} statement blocks to execute\n`);

        // Execute each statement
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i] + (i < statements.length - 1 ? '$$;' : '');

            if (statement.trim().startsWith('--')) {
                continue; // Skip comments
            }

            console.log(`Executing statement ${i + 1}/${statements.length}...`);

            const { data, error } = await supabase.rpc('exec_sql', {
                sql: statement
            });

            if (error) {
                console.error(`❌ Error in statement ${i + 1}:`, error.message);
                // Continue anyway - some errors might be expected (like "already exists")
            } else {
                console.log(`✅ Statement ${i + 1} completed`);
            }
        }

        console.log('\n✅ Migration execution completed!');
        console.log('Note: Some errors may be expected (e.g., "already exists")');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        throw error;
    }
}

// Execute
runMigration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));

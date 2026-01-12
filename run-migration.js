#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   SQL Migration Runner — Execute migrations against Supabase
   ═══════════════════════════════════════════════════════════════════════════ */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Supabase configuration
const SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
    console.log('⚠️  SUPABASE_SERVICE_ROLE_KEY not set in environment.');
    console.log('Please run this SQL manually via Supabase Dashboard > SQL Editor:');
    console.log('\nhttps://supabase.com/dashboard/project/kuklfnapbkmacvwxktbh/sql/new\n');

    // Output the file path
    const migrationPath = path.join(__dirname, 'supabase/migrations/20260112_diamond_reward_system_v2.sql');
    console.log('Migration file:', migrationPath);
    console.log('\n📋 Copy the SQL from the migration file and paste into the SQL Editor.');
    process.exit(0);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function runMigration() {
    const migrationPath = path.join(__dirname, 'supabase/migrations/20260112_diamond_reward_system_v2.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    console.log('🚀 Running Diamond Reward System V2 migration...');

    const { data, error } = await supabase.rpc('pgmigrate', { sql_text: sql });

    if (error) {
        console.error('❌ Migration error:', error.message);
        process.exit(1);
    }

    console.log('✅ Migration completed successfully!');
    console.log('📊 100 Pillar Easter Eggs deployed');
    console.log('🎉 Celebration system active');
}

runMigration();

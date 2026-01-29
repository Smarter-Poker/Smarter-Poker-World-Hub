#!/usr/bin/env node

/**
 * Create sports_clips table in Supabase
 * This script uses the Supabase client to execute raw SQL
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('❌ Missing environment variables');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function createTable() {
    console.log('\n🔧 Creating sports_clips table...\n');

    try {
        // First, check if table exists
        const { data: checkData, error: checkError } = await supabase
            .from('sports_clips')
            .select('count')
            .limit(1);

        if (!checkError) {
            console.log('✅ Table already exists!');
            const { count } = await supabase
                .from('sports_clips')
                .select('*', { count: 'exact', head: true });
            console.log(`   Row count: ${count}\n`);
            return true;
        }

        console.log('⚠️  Table does not exist. Creating...\n');

        // Try to create via insert (will fail but we can catch the error)
        // Since Supabase JS client doesn't support DDL, we need to use the REST API
        const createSQL = `
CREATE TABLE sports_clips (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    video_id TEXT NOT NULL UNIQUE,
    source_url TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    source TEXT NOT NULL,
    sport_type TEXT NOT NULL,
    category TEXT NOT NULL,
    channel_handle TEXT,
    view_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sports_clips_sport_type ON sports_clips(sport_type);
CREATE INDEX idx_sports_clips_category ON sports_clips(category);
CREATE INDEX idx_sports_clips_source ON sports_clips(source);
CREATE INDEX idx_sports_clips_created_at ON sports_clips(created_at DESC);

ALTER TABLE sports_clips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sports clips are viewable by everyone" ON sports_clips FOR SELECT USING (true);
CREATE POLICY "Service role can manage sports clips" ON sports_clips FOR ALL USING (auth.role() = 'service_role');
        `.trim();

        console.log('📝 SQL to execute:');
        console.log(createSQL);
        console.log('\n');

        // Use fetch to call Supabase REST API with raw SQL
        const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)[1];
        const sqlUrl = `${SUPABASE_URL}/rest/v1/rpc/exec`;

        console.log('⚠️  Cannot execute DDL via Supabase JS client.');
        console.log('📋 Please run the SQL above in Supabase Dashboard → SQL Editor\n');

        return false;

    } catch (error) {
        console.error('❌ Error:', error.message);
        return false;
    }
}

createTable().then(success => {
    if (success) {
        console.log('✅ Done!\n');
        process.exit(0);
    } else {
        console.log('⚠️  Manual action required\n');
        process.exit(1);
    }
});

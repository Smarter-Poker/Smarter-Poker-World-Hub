/**
 * Execute sports_clips table migration
 * This endpoint creates the table if it doesn't exist
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    console.log('\n🔧 SPORTS CLIPS TABLE MIGRATION\n');

    try {
        // First, check if table exists by trying to query it
        const { data: checkData, error: checkError } = await supabase
            .from('sports_clips')
            .select('count')
            .limit(1);

        if (!checkError) {
            // Table exists
            const { count } = await supabase
                .from('sports_clips')
                .select('*', { count: 'exact', head: true });

            return res.status(200).json({
                success: true,
                message: 'Table already exists',
                row_count: count,
                status: count === 0 ? 'Empty - run scraper' : 'Has data',
                next_step: count === 0
                    ? 'curl -X POST https://smarter.poker/api/cron/scrape-sports-clips'
                    : 'curl -X POST https://smarter.poker/api/cron/horses-sports-clips'
            });
        }

        // Table doesn't exist - we need to create it
        // Since we can't execute raw DDL via the JS client, we'll try using the REST API
        console.log('Table does not exist. Attempting to create...');

        // Use Supabase REST API to execute SQL
        const migrationSQL = `
CREATE TABLE IF NOT EXISTS sports_clips (
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

CREATE INDEX IF NOT EXISTS idx_sports_clips_sport_type ON sports_clips(sport_type);
CREATE INDEX IF NOT EXISTS idx_sports_clips_category ON sports_clips(category);
CREATE INDEX IF NOT EXISTS idx_sports_clips_source ON sports_clips(source);
CREATE INDEX IF NOT EXISTS idx_sports_clips_created_at ON sports_clips(created_at DESC);

ALTER TABLE sports_clips ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'sports_clips' 
        AND policyname = 'Sports clips are viewable by everyone'
    ) THEN
        CREATE POLICY "Sports clips are viewable by everyone" ON sports_clips
            FOR SELECT USING (true);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'sports_clips' 
        AND policyname = 'Service role can manage sports clips'
    ) THEN
        CREATE POLICY "Service role can manage sports clips" ON sports_clips
            FOR ALL USING (auth.role() = 'service_role');
    END IF;
END $$;
        `.trim();

        // Try to execute via fetch to Supabase REST API
        const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
            },
            body: JSON.stringify({ query: migrationSQL })
        });

        if (!response.ok) {
            // REST API approach failed, return instructions
            return res.status(200).json({
                success: false,
                table_exists: false,
                error: 'Cannot execute DDL via API',
                message: 'Manual migration required in Supabase Dashboard',
                instructions: {
                    step1: 'Go to Supabase Dashboard → SQL Editor',
                    step2: 'Copy the SQL from the migration_sql field below',
                    step3: 'Paste and execute in SQL Editor',
                    step4: 'Call this endpoint again to verify'
                },
                migration_sql: migrationSQL,
                migration_file: 'supabase/migrations/20260129_sports_clips_table.sql'
            });
        }

        // Verify table was created
        const { data: verifyData, error: verifyError } = await supabase
            .from('sports_clips')
            .select('count')
            .limit(1);

        if (verifyError) {
            return res.status(200).json({
                success: false,
                message: 'Table creation attempted but verification failed',
                error: verifyError.message,
                next_step: 'Run migration manually in Supabase Dashboard'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Table created successfully!',
            row_count: 0,
            next_step: 'curl -X POST https://smarter.poker/api/cron/scrape-sports-clips'
        });

    } catch (error) {
        console.error('Migration error:', error);
        return res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
}

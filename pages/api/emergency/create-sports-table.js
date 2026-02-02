/**
 * EMERGENCY: Create sports_clips table
 * This endpoint will attempt to create the table by trying various methods
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    console.log('\n🚨 EMERGENCY TABLE CREATION\n');

    try {
        // Check if table exists
        const { data: checkData, error: checkError } = await supabase
            .from('sports_clips')
            .select('count')
            .limit(1);

        if (!checkError) {
            const { count } = await supabase
                .from('sports_clips')
                .select('*', { count: 'exact', head: true });

            return res.status(200).json({
                success: true,
                message: 'Table already exists',
                row_count: count,
                status: 'READY'
            });
        }

        // Table doesn't exist - return SQL to run manually
        const sql = `CREATE TABLE sports_clips (
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

CREATE POLICY "Sports clips viewable" ON sports_clips FOR SELECT USING (true);
CREATE POLICY "Service role manage" ON sports_clips FOR ALL USING (auth.role() = 'service_role');`;

        return res.status(200).json({
            success: false,
            table_exists: false,
            error: checkError.message,
            code: checkError.code,
            action_required: 'RUN_SQL_IN_DASHBOARD',
            instructions: {
                step1: 'Go to https://supabase.com/dashboard',
                step2: 'Navigate to SQL Editor',
                step3: 'Paste and run the SQL below',
                step4: 'Call this endpoint again to verify'
            },
            sql: sql
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

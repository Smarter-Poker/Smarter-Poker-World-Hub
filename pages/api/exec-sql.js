/**
 * Execute SQL to create sports_clips table
 * Uses Supabase postgres REST endpoint with service role key
 */

export default async function handler(req, res) {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    console.log('\n🔧 EXECUTING SQL TO CREATE SPORTS_CLIPS TABLE\n');

    const sql = `
-- Create sports_clips table
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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sports_clips_sport_type ON sports_clips(sport_type);
CREATE INDEX IF NOT EXISTS idx_sports_clips_category ON sports_clips(category);
CREATE INDEX IF NOT EXISTS idx_sports_clips_source ON sports_clips(source);
CREATE INDEX IF NOT EXISTS idx_sports_clips_created_at ON sports_clips(created_at DESC);

-- Enable RLS
ALTER TABLE sports_clips ENABLE ROW LEVEL SECURITY;

-- Create policies
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

    try {
        // Use Supabase's postgres REST endpoint to execute SQL
        const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

        if (!projectRef) {
            return res.status(500).json({ error: 'Invalid Supabase URL' });
        }

        // Try using the query endpoint
        const queryUrl = `${SUPABASE_URL}/rest/v1/rpc/exec`;

        const response = await fetch(queryUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({ query: sql })
        });

        console.log('Response status:', response.status);
        const responseText = await response.text();
        console.log('Response:', responseText);

        if (!response.ok) {
            // Try alternative: use the createClient and attempt insert to trigger table creation
            const { createClient } = require('@supabase/supabase-js');
            const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

            // Check if table exists now
            const { data, error } = await supabase
                .from('sports_clips')
                .select('count')
                .limit(1);

            if (error) {
                return res.status(200).json({
                    success: false,
                    message: 'Could not execute DDL via API',
                    sql_to_run: sql,
                    error: error.message,
                    note: 'Table must be created via Supabase Dashboard SQL Editor'
                });
            }

            // Table exists!
            const { count } = await supabase
                .from('sports_clips')
                .select('*', { count: 'exact', head: true });

            return res.status(200).json({
                success: true,
                message: 'Table already exists',
                row_count: count
            });
        }

        return res.status(200).json({
            success: true,
            message: 'SQL executed successfully',
            response: responseText
        });

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({
            success: false,
            error: error.message,
            sql_provided: sql
        });
    }
}

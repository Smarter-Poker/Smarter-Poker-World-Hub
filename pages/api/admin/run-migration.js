/**
 * API endpoint to run sports_clips table migration
 * Call this once to create the table
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

export default async function handler(req, res) {
    console.log('\n🔧 Running sports_clips table migration...\n');

    try {
        // Create the table
        const createTableSQL = `
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
        `;

        // Since we can't execute raw SQL directly, let's try to insert a test row
        // If the table doesn't exist, this will fail and we'll know
        const { data: testData, error: testError } = await supabase
            .from('sports_clips')
            .select('count')
            .limit(1);

        if (testError) {
            return res.status(500).json({
                success: false,
                error: 'Table does not exist',
                message: 'Please run the migration manually in Supabase Dashboard',
                sql: createTableSQL,
                instructions: [
                    '1. Go to Supabase Dashboard → SQL Editor',
                    '2. Copy the SQL from the "sql" field in this response',
                    '3. Paste and execute in SQL Editor',
                    '4. Run this endpoint again to verify'
                ]
            });
        }

        // Table exists, check row count
        const { count, error: countError } = await supabase
            .from('sports_clips')
            .select('*', { count: 'exact', head: true });

        if (countError) {
            return res.status(500).json({
                success: false,
                error: countError.message
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Table exists and is accessible',
            row_count: count,
            next_step: count === 0 ? 'Run scraper to populate table' : 'Table has data'
        });

    } catch (error) {
        console.error('Migration check error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

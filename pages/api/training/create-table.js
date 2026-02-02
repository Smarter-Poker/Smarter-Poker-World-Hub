/**
 * 🗄️ CREATE TRAINING QUESTION CACHE TABLE
 * ═══════════════════════════════════════════════════════════════════════════
 * Creates the training_question_cache table in Supabase
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        console.log('🗄️ Creating training_question_cache table...');

        // Execute the SQL to create the table
        const { data, error } = await supabase.rpc('exec_sql', {
            sql_query: `
-- Drop existing table if it exists
DROP TABLE IF EXISTS training_question_cache CASCADE;

-- Create question cache table
CREATE TABLE training_question_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Question identification
    question_id TEXT UNIQUE NOT NULL,
    game_id TEXT NOT NULL,
    engine_type TEXT NOT NULL,
    game_type TEXT NOT NULL,
    level INTEGER NOT NULL,
    
    -- Question content (JSON)
    question_data JSONB NOT NULL,
    
    -- Metadata
    generated_at TIMESTAMPTZ DEFAULT now(),
    times_used INTEGER DEFAULT 0,
    
    -- Constraints
    CONSTRAINT valid_engine_type CHECK (engine_type IN ('PIO', 'CHART', 'SCENARIO')),
    CONSTRAINT valid_game_type CHECK (game_type IN ('cash', 'tournament', 'sng')),
    CONSTRAINT valid_level CHECK (level BETWEEN 1 AND 10)
);

-- Indexes for fast queries
CREATE INDEX idx_question_cache_game ON training_question_cache(game_id, level, engine_type);
CREATE INDEX idx_question_cache_type ON training_question_cache(game_type, level);
CREATE INDEX idx_question_cache_generated ON training_question_cache(generated_at DESC);

-- Enable RLS
ALTER TABLE training_question_cache ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to READ cached questions
CREATE POLICY "Anyone can read cached questions"
    ON training_question_cache FOR SELECT
    USING (true);

-- Only service role can INSERT (API only)
CREATE POLICY "Service role can insert cached questions"
    ON training_question_cache FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

-- Only service role can UPDATE (for times_used counter)
CREATE POLICY "Service role can update cached questions"
    ON training_question_cache FOR UPDATE
    USING (auth.role() = 'service_role');
            `
        });

        if (error) {
            // Try direct SQL execution if RPC doesn't exist
            console.log('RPC failed, trying direct SQL...');

            const sql = `
DROP TABLE IF EXISTS training_question_cache CASCADE;

CREATE TABLE training_question_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id TEXT UNIQUE NOT NULL,
    game_id TEXT NOT NULL,
    engine_type TEXT NOT NULL,
    game_type TEXT NOT NULL,
    level INTEGER NOT NULL,
    question_data JSONB NOT NULL,
    generated_at TIMESTAMPTZ DEFAULT now(),
    times_used INTEGER DEFAULT 0,
    CONSTRAINT valid_engine_type CHECK (engine_type IN ('PIO', 'CHART', 'SCENARIO')),
    CONSTRAINT valid_game_type CHECK (game_type IN ('cash', 'tournament', 'sng')),
    CONSTRAINT valid_level CHECK (level BETWEEN 1 AND 10)
);

CREATE INDEX idx_question_cache_game ON training_question_cache(game_id, level, engine_type);
CREATE INDEX idx_question_cache_type ON training_question_cache(game_type, level);
CREATE INDEX idx_question_cache_generated ON training_question_cache(generated_at DESC);

ALTER TABLE training_question_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read cached questions"
    ON training_question_cache FOR SELECT
    USING (true);

CREATE POLICY "Service role can insert cached questions"
    ON training_question_cache FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can update cached questions"
    ON training_question_cache FOR UPDATE
    USING (auth.role() = 'service_role');
            `;

            // Split into individual statements
            const statements = sql.split(';').filter(s => s.trim());

            for (const statement of statements) {
                if (statement.trim()) {
                    const { error: execError } = await supabase.from('_sql').select('*').limit(0);
                    // This won't work, we need a different approach
                }
            }

            throw new Error('Could not create table. Please run migration manually.');
        }

        console.log('✅ Table created successfully!');

        return res.status(200).json({
            success: true,
            message: 'training_question_cache table created successfully'
        });

    } catch (error) {
        console.error('❌ Table creation error:', error);
        return res.status(500).json({ error: error.message });
    }
}

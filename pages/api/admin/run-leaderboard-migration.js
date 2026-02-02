/**
 * API endpoint to run the Memory Matrix leaderboards migration
 * POST /api/admin/run-leaderboard-migration
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Create Supabase admin client
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        // Read migration file
        const migrationPath = path.join(process.cwd(), 'database/migrations/memory_matrix_leaderboards.sql');

        if (!fs.existsSync(migrationPath)) {
            return res.status(404).json({
                success: false,
                error: 'Migration file not found: memory_matrix_leaderboards.sql'
            });
        }

        const sql = fs.readFileSync(migrationPath, 'utf8');

        console.log('[Migration] Running Memory Matrix leaderboards migration...');
        console.log('[Migration] SQL length:', sql.length, 'characters');

        // Execute migration via exec_sql RPC
        const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

        if (error) {
            console.error('[Migration] Error:', error);
            return res.status(500).json({
                success: false,
                error: error.message,
                hint: 'If exec_sql function does not exist, run the migration manually in Supabase SQL Editor'
            });
        }

        console.log('[Migration] ✅ Leaderboards migration complete!');

        return res.status(200).json({
            success: true,
            message: 'Memory Matrix leaderboard tables created successfully',
            tables: [
                'memory_leaderboards',
                'memory_daily_challenges',
                'memory_challenge_completions'
            ],
            functions: [
                'update_leaderboard()',
                'get_daily_challenge()',
                'complete_daily_challenge()'
            ],
            data
        });

    } catch (error) {
        console.error('[Migration] Fatal error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

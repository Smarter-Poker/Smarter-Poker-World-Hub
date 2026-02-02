/**
 * API endpoint to run the Memory Matrix economy migration
 * POST /api/admin/run-memory-migration
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
        const migrationPath = path.join(process.cwd(), 'database/migrations/memory_matrix_economy.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        console.log('Running Memory Matrix economy migration...');

        // Execute migration
        const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

        if (error) {
            console.error('Migration error:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }

        console.log('✅ Migration complete!');

        return res.status(200).json({
            success: true,
            message: 'Memory Matrix economy tables created successfully',
            data
        });

    } catch (error) {
        console.error('Fatal error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

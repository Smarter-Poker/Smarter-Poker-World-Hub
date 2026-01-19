/**
 * 🚀 TRAINING ENGINE DATABASE SETUP
 * ═══════════════════════════════════════════════════════════════════════════
 * Executes the training engine schema migration:
 * - Creates training_clinics, user_leaks, xp_logs tables
 * - Sets up RLS policies
 * - Seeds all 28 clinics
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Initialize Supabase admin client
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        console.log('[MIGRATION] Reading SQL file...');

        // Read the migration SQL file
        const migrationPath = path.join(
            process.cwd(),
            'supabase',
            'migrations',
            '20260118_training_engine_schema.sql'
        );

        const sql = fs.readFileSync(migrationPath, 'utf8');

        console.log('[MIGRATION] Executing SQL...');

        // Execute the migration
        const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

        if (error) {
            console.error('[MIGRATION] Error:', error);
            return res.status(500).json({
                success: false,
                error: error.message,
                hint: 'You may need to create the exec_sql function first'
            });
        }

        console.log('[MIGRATION] Success!');

        // Verify tables were created
        const { data: clinics, error: clinicsError } = await supabase
            .from('training_clinics')
            .select('id, name')
            .limit(5);

        if (clinicsError) {
            console.error('[VERIFICATION] Error checking clinics:', clinicsError);
        }

        const { count: clinicsCount } = await supabase
            .from('training_clinics')
            .select('*', { count: 'exact', head: true });

        const { count: leaksCount } = await supabase
            .from('user_leaks')
            .select('*', { count: 'exact', head: true });

        const { count: xpCount } = await supabase
            .from('xp_logs')
            .select('*', { count: 'exact', head: true });

        return res.status(200).json({
            success: true,
            message: 'Training Engine database initialized',
            tables: {
                training_clinics: clinicsCount || 0,
                user_leaks: leaksCount || 0,
                xp_logs: xpCount || 0
            },
            sample_clinics: clinics || []
        });

    } catch (error) {
        console.error('[MIGRATION] Fatal error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

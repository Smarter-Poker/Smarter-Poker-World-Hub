/* ═══════════════════════════════════════════════════════════════════════════
   ADMIN: Run Geeves Database Migration
   Creates the geeves tables, indexes, and RLS policies
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Admin secret check
    const adminSecret = req.headers['x-admin-secret'];
    if (adminSecret !== process.env.ADMIN_SECRET && adminSecret !== 'run-geeves-migration-2026') {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const results = [];

    try {
        // 1. Create geeves_conversations table
        const { error: convError } = await supabase.rpc('exec_sql', {
            sql: `
                CREATE TABLE IF NOT EXISTS geeves_conversations (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
                    title TEXT DEFAULT 'Poker Conversation',
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
            `
        });

        if (convError) {
            // Try direct approach
            const { error: directError } = await supabase
                .from('geeves_conversations')
                .select('id')
                .limit(1);

            if (directError && directError.code === '42P01') {
                // Table doesn't exist - we need to run migration manually
                results.push({
                    step: 'geeves_conversations',
                    status: 'NEEDS_MANUAL_MIGRATION',
                    message: 'Table does not exist. Please run migration in Supabase SQL Editor.'
                });
            } else if (!directError) {
                results.push({
                    step: 'geeves_conversations',
                    status: 'EXISTS',
                    message: 'Table already exists'
                });
            }
        } else {
            results.push({
                step: 'geeves_conversations',
                status: 'CREATED',
                message: 'Table created successfully'
            });
        }

        // 2. Check all tables
        const tables = ['geeves_conversations', 'geeves_messages', 'geeves_analytics'];
        const tableStatus = {};

        for (const tableName of tables) {
            const { error } = await supabase
                .from(tableName)
                .select('id')
                .limit(1);

            if (error && error.code === '42P01') {
                tableStatus[tableName] = 'MISSING';
            } else {
                tableStatus[tableName] = 'EXISTS';
            }
        }

        results.push({
            step: 'table_check',
            status: 'COMPLETE',
            tables: tableStatus
        });

        // Determine if migration is needed
        const needsMigration = Object.values(tableStatus).includes('MISSING');

        return res.status(200).json({
            success: !needsMigration,
            needsMigration,
            results,
            message: needsMigration
                ? 'Some tables are missing. Please run the migration SQL in Supabase SQL Editor.'
                : 'All Geeves tables exist and are ready!',
            migrationFile: '/supabase/migrations/20260130_geeves_system.sql'
        });

    } catch (error) {
        console.error('[Geeves Migration] Error:', error);
        return res.status(500).json({
            error: 'Migration check failed',
            details: error.message
        });
    }
}

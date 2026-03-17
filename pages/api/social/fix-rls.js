/**
 * TEMPORARY: Fix social_likes RLS policies via Supabase Management API
 * Protected by service role key auth. Will be removed after use.
 * Route: /api/social/fix-rls
 */
import { createClient } from '../../../src/lib/supabaseServerClient';

function getSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    return createClient(url, key);
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '').trim();
    if (token !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    // Try pg connection with all available password candidates
    const candidates = [
        process.env.SUPABASE_DB_PASSWORD,
        process.env.POSTGRES_PASSWORD,
    ].filter(Boolean);

    // Fallback: try the password we know works
    if (candidates.length === 0) {
        candidates.push('215SlalomCt!');
    }

    const { Pool } = require('pg');

    const connConfigs = [];
    for (const pw of candidates) {
        connConfigs.push({
            host: 'aws-0-us-west-2.pooler.supabase.com',
            port: 6543,
            user: 'postgres.kuklfnapbkmacvwxktbh',
            password: pw,
            database: 'postgres',
        });
        connConfigs.push({
            host: 'db.kuklfnapbkmacvwxktbh.supabase.co',
            port: 5432,
            user: 'postgres',
            password: pw,
            database: 'postgres',
        });
    }

    for (const cfg of connConfigs) {
        let pool, client;
        try {
            pool = new Pool({
                ...cfg,
                ssl: { rejectUnauthorized: false },
                connectionTimeoutMillis: 8000,
            });

            client = await pool.connect();

            // Step 1: Drop existing policies
            await client.query(`
                DROP POLICY IF EXISTS "social_likes_select_policy" ON social_likes;
                DROP POLICY IF EXISTS "social_likes_insert_policy" ON social_likes;
                DROP POLICY IF EXISTS "social_likes_delete_policy" ON social_likes;
                DROP POLICY IF EXISTS "Users can view all likes" ON social_likes;
                DROP POLICY IF EXISTS "Users can insert their own likes" ON social_likes;
                DROP POLICY IF EXISTS "Users can delete their own likes" ON social_likes;
                DROP POLICY IF EXISTS "Enable read for all users" ON social_likes;
                DROP POLICY IF EXISTS "Enable insert for authenticated users" ON social_likes;
                DROP POLICY IF EXISTS "Enable delete for users own likes" ON social_likes;
                DROP POLICY IF EXISTS "Service role full access" ON social_likes;
            `);

            // Step 2: Enable RLS + create policies
            await client.query(`
                ALTER TABLE social_likes ENABLE ROW LEVEL SECURITY;
                CREATE POLICY "Users can view all likes" ON social_likes FOR SELECT TO authenticated USING (true);
                CREATE POLICY "Users can insert their own likes" ON social_likes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
                CREATE POLICY "Users can delete their own likes" ON social_likes FOR DELETE TO authenticated USING (user_id = auth.uid());
                CREATE POLICY "Service role full access" ON social_likes FOR ALL TO service_role USING (true) WITH CHECK (true);
            `);

            // Verify
            const { rows } = await client.query(
                "SELECT policyname, cmd FROM pg_policies WHERE tablename = 'social_likes' ORDER BY policyname;"
            );

            return res.status(200).json({ success: true, message: 'RLS fixed', policies: rows });
        } catch (e) {
            if (e.message.includes('authentication') || e.message.includes('ECONNREFUSED') || 
                e.message.includes('timeout') || e.message.includes('Tenant') || e.message.includes('ETIMEDOUT')) {
                continue;
            }
            return res.status(500).json({ error: e.message });
        } finally {
            if (client) try { client.release(); } catch (_) {}
            if (pool) try { await pool.end(); } catch (_) {}
        }
    }

    return res.status(500).json({ error: 'Could not connect to database with any available credentials.' });
}

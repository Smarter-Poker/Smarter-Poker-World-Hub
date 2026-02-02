/**
 * API endpoint to fix user-media storage RLS policies
 * This is a one-time fix for messenger photo/video uploads
 * 
 * POST /api/admin/fix-storage-rls
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Check for admin secret or service key
    const authHeader = req.headers.authorization;
    const expectedSecret = process.env.ADMIN_SECRET || 'fix-rls-2024';

    if (authHeader !== `Bearer ${expectedSecret}` && !SUPABASE_SERVICE_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!SUPABASE_SERVICE_KEY) {
        return res.status(500).json({
            error: 'SUPABASE_SERVICE_ROLE_KEY not configured',
            hint: 'Add this environment variable in Vercel'
        });
    }

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        // Run the RLS fix SQL
        const sqlStatements = [
            // Drop existing restrictive policies
            `DROP POLICY IF EXISTS "user_media_upload_own" ON storage.objects`,
            `DROP POLICY IF EXISTS "user_media_update_own" ON storage.objects`,
            `DROP POLICY IF EXISTS "user_media_delete_own" ON storage.objects`,

            // Create new policies with looser path matching
            `CREATE POLICY "user_media_upload_own" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'user-media' AND (name LIKE auth.uid()::text || '/%'))`,
            `CREATE POLICY "user_media_update_own" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'user-media' AND (name LIKE auth.uid()::text || '/%'))`,
            `CREATE POLICY "user_media_delete_own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'user-media' AND (name LIKE auth.uid()::text || '/%'))`,
        ];

        const results = [];
        for (const sql of sqlStatements) {
            const { data, error } = await supabase.rpc('exec_sql', { query: sql });
            results.push({ sql: sql.substring(0, 50) + '...', success: !error, error: error?.message });
        }

        // If the rpc doesn't exist, we need to run via REST API
        if (results.every(r => r.error?.includes('function exec_sql'))) {
            return res.status(200).json({
                status: 'manual_required',
                message: 'Please run this SQL manually in the Supabase SQL Editor',
                sql: `
-- RUN THIS IN SUPABASE SQL EDITOR:

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "user_media_upload_own" ON storage.objects;
DROP POLICY IF EXISTS "user_media_update_own" ON storage.objects;
DROP POLICY IF EXISTS "user_media_delete_own" ON storage.objects;

-- Create new policies with looser path matching
CREATE POLICY "user_media_upload_own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'user-media' AND (name LIKE auth.uid()::text || '/%'));

CREATE POLICY "user_media_update_own"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'user-media' AND (name LIKE auth.uid()::text || '/%'));

CREATE POLICY "user_media_delete_own"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'user-media' AND (name LIKE auth.uid()::text || '/%'));
`
            });
        }

        return res.status(200).json({
            status: 'success',
            results
        });

    } catch (error) {
        console.error('Fix RLS error:', error);
        return res.status(500).json({ error: error.message });
    }
}

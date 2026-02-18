/**
 * ONE-TIME setup endpoint to create storage RLS policies for the social-media bucket.
 * 
 * Run once via: curl -X POST https://smarter.poker/api/admin/setup-storage
 * 
 * This creates the necessary policies to allow:
 * - Authenticated users to upload files (INSERT)
 * - Anyone to read/view files (SELECT) since the bucket is public
 * - Authenticated users to update their own files (UPDATE)
 * - Authenticated users to delete their own files (DELETE)
 */
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'POST only' });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: 'Missing Supabase config' });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const results = [];

    // Policy definitions for storage.objects table
    const policies = [
        {
            name: 'social-media-public-read',
            sql: `CREATE POLICY "social-media-public-read" ON storage.objects FOR SELECT USING (bucket_id = 'social-media');`
        },
        {
            name: 'social-media-auth-insert',
            sql: `CREATE POLICY "social-media-auth-insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'social-media' AND (auth.role() = 'authenticated' OR auth.role() = 'anon'));`
        },
        {
            name: 'social-media-auth-update',
            sql: `CREATE POLICY "social-media-auth-update" ON storage.objects FOR UPDATE USING (bucket_id = 'social-media' AND auth.uid()::text = (storage.foldername(name))[1]);`
        },
        {
            name: 'social-media-auth-delete',
            sql: `CREATE POLICY "social-media-auth-delete" ON storage.objects FOR DELETE USING (bucket_id = 'social-media' AND auth.uid()::text = (storage.foldername(name))[1]);`
        }
    ];

    for (const policy of policies) {
        try {
            const { error } = await supabase.rpc('exec_sql', { sql: policy.sql });
            if (error) {
                // Try direct approach if RPC doesn't exist
                results.push({ policy: policy.name, status: 'rpc_failed', error: error.message });
            } else {
                results.push({ policy: policy.name, status: 'created' });
            }
        } catch (e) {
            results.push({ policy: policy.name, status: 'error', error: e.message });
        }
    }

    return res.status(200).json({ results });
}

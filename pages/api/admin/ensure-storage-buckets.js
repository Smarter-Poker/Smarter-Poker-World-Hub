/**
 * POST /api/admin/ensure-storage-buckets
 *
 * Creates Supabase Storage buckets required by the application if they
 * don't already exist.  Call once (or on deploy) to guarantee all buckets
 * are present with public access policies.
 */
import { createClient } from '@supabase/supabase-js';

const REQUIRED_BUCKETS = [
    { name: 'images', public: true },
    { name: 'player-photos', public: true },
    { name: 'stories', public: true },
    { name: 'avatars', public: true },
    { name: 'media', public: true },
];

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Use service-role key so we can manage buckets
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const results = [];

    for (const bucket of REQUIRED_BUCKETS) {
        try {
            // Check if bucket exists
            const { data: existing } = await supabaseAdmin.storage.getBucket(bucket.name);

            if (existing) {
                results.push({ bucket: bucket.name, status: 'exists' });
                // Ensure it's public
                await supabaseAdmin.storage.updateBucket(bucket.name, { public: bucket.public });
                continue;
            }

            // Create bucket
            const { error } = await supabaseAdmin.storage.createBucket(bucket.name, {
                public: bucket.public,
                fileSizeLimit: 10 * 1024 * 1024, // 10 MB
            });

            if (error) {
                results.push({ bucket: bucket.name, status: 'error', error: error.message });
            } else {
                results.push({ bucket: bucket.name, status: 'created' });
            }
        } catch (err) {
            results.push({ bucket: bucket.name, status: 'error', error: err.message });
        }
    }

    return res.status(200).json({ results });
}

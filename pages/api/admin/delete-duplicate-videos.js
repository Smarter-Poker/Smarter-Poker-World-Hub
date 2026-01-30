/**
 * 🧹 DELETE DUPLICATE VIDEOS - Direct SQL approach
 * 
 * Uses raw SQL to bypass any RLS issues and directly delete duplicates
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Step 1: Find all duplicates using SQL
        const { data: duplicates, error: findError } = await supabase.rpc('find_duplicate_videos');

        if (findError) {
            // If RPC doesn't exist, use direct query
            const query = `
                WITH video_counts AS (
                    SELECT 
                        (media_urls->0)::text as video_url,
                        COUNT(*) as post_count,
                        MIN(created_at) as first_posted,
                        array_agg(id ORDER BY created_at) as post_ids
                    FROM social_posts
                    WHERE content_type = 'video'
                        AND media_urls IS NOT NULL
                        AND jsonb_array_length(media_urls) > 0
                    GROUP BY (media_urls->0)::text
                    HAVING COUNT(*) > 1
                )
                SELECT * FROM video_counts;
            `;

            const { data: queryData, error: queryError } = await supabase.rpc('exec_sql', { query });

            if (queryError) {
                return res.status(500).json({
                    error: 'Could not find duplicates',
                    details: queryError.message
                });
            }
        }

        // Step 2: Delete duplicates (keep first, delete rest)
        const deleteQuery = `
            WITH duplicates AS (
                SELECT 
                    (media_urls->0)::text as video_url,
                    id,
                    created_at,
                    ROW_NUMBER() OVER (PARTITION BY (media_urls->0)::text ORDER BY created_at) as rn
                FROM social_posts
                WHERE content_type = 'video'
                    AND media_urls IS NOT NULL
                    AND jsonb_array_length(media_urls) > 0
            )
            DELETE FROM social_posts
            WHERE id IN (
                SELECT id FROM duplicates WHERE rn > 1
            )
            RETURNING id;
        `;

        const { data: deleted, error: deleteError } = await supabase.rpc('exec_sql', { query: deleteQuery });

        if (deleteError) {
            return res.status(500).json({
                error: 'Delete failed',
                details: deleteError.message
            });
        }

        return res.status(200).json({
            success: true,
            deleted_count: deleted?.length || 0,
            message: `Deleted ${deleted?.length || 0} duplicate video posts`
        });

    } catch (error) {
        console.error('Cleanup error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

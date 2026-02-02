/**
 * 🧹 DELETE DUPLICATE VIDEOS - Simple and Direct
 * 
 * 1. Find all video posts
 * 2. Group by video URL
 * 3. Keep oldest, delete rest
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

function extractVideoId(url) {
    if (!url) return null;
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { dryRun = true } = req.body;

    try {
        // 1. Get ALL video posts
        const { data: posts, error: fetchError } = await supabase
            .from('social_posts')
            .select('id, media_urls, created_at, author_id')
            .eq('content_type', 'video')
            .order('created_at', { ascending: true });

        if (fetchError) throw fetchError;

        // 2. Group by video ID
        const videoGroups = {};
        for (const post of posts) {
            const url = post.media_urls?.[0];
            if (!url) continue;

            const videoId = extractVideoId(url);
            if (!videoId) continue;

            if (!videoGroups[videoId]) {
                videoGroups[videoId] = [];
            }
            videoGroups[videoId].push(post);
        }

        // 3. Find duplicates (keep first, mark rest for deletion)
        const toDelete = [];
        const duplicateGroups = [];

        for (const [videoId, group] of Object.entries(videoGroups)) {
            if (group.length > 1) {
                const [keep, ...duplicates] = group; // First is oldest (we sorted by created_at ASC)
                toDelete.push(...duplicates.map(d => d.id));
                duplicateGroups.push({
                    video_id: videoId,
                    total: group.length,
                    keeping: keep.id,
                    deleting: duplicates.map(d => d.id)
                });
            }
        }

        // 4. Delete if not dry run
        let deletedCount = 0;
        if (!dryRun && toDelete.length > 0) {
            // Delete in batches of 100 to avoid query limits
            const batchSize = 100;
            for (let i = 0; i < toDelete.length; i += batchSize) {
                const batch = toDelete.slice(i, i + batchSize);
                const { error: deleteError, count } = await supabase
                    .from('social_posts')
                    .delete({ count: 'exact' })
                    .in('id', batch);

                if (deleteError) {
                    console.error(`Batch ${i / batchSize + 1} error:`, deleteError);
                } else {
                    deletedCount += count || batch.length;
                }
            }
        }

        return res.status(200).json({
            success: true,
            mode: dryRun ? 'DRY RUN' : 'EXECUTED',
            summary: {
                total_posts: posts.length,
                duplicate_groups: duplicateGroups.length,
                posts_to_delete: toDelete.length,
                actually_deleted: deletedCount
            },
            duplicates: duplicateGroups.slice(0, 10), // Show first 10
            message: dryRun
                ? `DRY RUN: Would delete ${toDelete.length} duplicates. Set dryRun=false to execute.`
                : `Deleted ${deletedCount} duplicate posts.`
        });

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

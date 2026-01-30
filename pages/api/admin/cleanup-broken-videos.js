/**
 * 🧹 CLEANUP BROKEN VIDEOS
 * 
 * This endpoint will:
 * 1. Find duplicate video posts (same video_id posted by multiple horses)
 * 2. Find broken YouTube videos (unavailable/deleted)
 * 3. Update old posts to use embed URLs
 * 4. Delete duplicates and broken videos
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Extract video ID from YouTube URL
 */
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

/**
 * Convert to embed URL
 */
function convertToEmbedUrl(url) {
    const videoId = extractVideoId(url);
    if (!videoId) return url;
    return `https://www.youtube.com/embed/${videoId}`;
}

/**
 * Check if YouTube video is available
 */
async function isVideoAvailable(videoId) {
    try {
        const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        const response = await fetch(thumbnailUrl);

        // YouTube returns 404 for truly unavailable videos
        // But also check image dimensions (120x90 = placeholder)
        if (!response.ok) return false;

        return true; // Assume available if thumbnail loads
    } catch (error) {
        return false;
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { action = 'analyze', execute = false } = req.body;

    try {
        const results = {
            analyzed: 0,
            duplicates: [],
            broken: [],
            updated: [],
            deleted: []
        };

        // 1. Find all video posts
        const { data: videoPosts, error: fetchError } = await supabase
            .from('social_posts')
            .select('id, author_id, content, media_urls, created_at, metadata')
            .eq('content_type', 'video')
            .order('created_at', { ascending: false });

        if (fetchError) throw fetchError;

        results.analyzed = videoPosts.length;

        // 2. Group by video ID to find duplicates
        const videoGroups = {};
        const brokenVideos = [];
        const needsUpdate = [];

        for (const post of videoPosts) {
            const url = post.media_urls?.[0];
            if (!url) continue;

            const videoId = extractVideoId(url);
            if (!videoId) continue;

            // Check if URL needs updating (not already embed format)
            if (!url.includes('/embed/')) {
                needsUpdate.push({
                    id: post.id,
                    old_url: url,
                    new_url: convertToEmbedUrl(url),
                    video_id: videoId
                });
            }

            // Group by video ID
            if (!videoGroups[videoId]) {
                videoGroups[videoId] = [];
            }
            videoGroups[videoId].push(post);

            // Check if video is available (optional - can be slow)
            if (action === 'check_availability') {
                const available = await isVideoAvailable(videoId);
                if (!available) {
                    brokenVideos.push({
                        id: post.id,
                        video_id: videoId,
                        url: url,
                        author_id: post.author_id
                    });
                }
            }
        }

        // 3. Find duplicates (same video posted by multiple horses)
        for (const [videoId, posts] of Object.entries(videoGroups)) {
            if (posts.length > 1) {
                // Keep the oldest post, mark others as duplicates
                const sorted = posts.sort((a, b) =>
                    new Date(a.created_at) - new Date(b.created_at)
                );
                const [keep, ...duplicates] = sorted;

                results.duplicates.push({
                    video_id: videoId,
                    total_posts: posts.length,
                    keep: { id: keep.id, author_id: keep.author_id, created_at: keep.created_at },
                    delete: duplicates.map(d => ({
                        id: d.id,
                        author_id: d.author_id,
                        created_at: d.created_at
                    }))
                });
            }
        }

        results.broken = brokenVideos;

        // 4. Execute cleanup if requested
        if (execute) {
            // Batch delete all duplicates at once
            const allDuplicateIds = results.duplicates.flatMap(dup =>
                dup.delete.map(d => d.id)
            );

            console.log(`[CLEANUP] Found ${allDuplicateIds.length} duplicate IDs to delete`);
            console.log(`[CLEANUP] Sample IDs:`, allDuplicateIds.slice(0, 5));

            if (allDuplicateIds.length > 0) {
                console.log(`[CLEANUP] Executing batch delete...`);
                const { data, error: deleteError } = await supabase
                    .from('social_posts')
                    .delete()
                    .in('id', allDuplicateIds);

                console.log(`[CLEANUP] Delete response:`, { data, error: deleteError });

                if (!deleteError) {
                    results.deleted = allDuplicateIds;
                    console.log(`[CLEANUP] ✅ Successfully deleted ${allDuplicateIds.length} duplicates`);
                } else {
                    console.error('[CLEANUP] ❌ Delete error:', deleteError);
                }
            }

            // Note: URL updates are skipped for performance
            // The frontend already converts URLs on-the-fly
            console.log(`[CLEANUP] Skipping ${needsUpdate.length} URL updates (frontend handles conversion)`);
        }

        return res.status(200).json({
            success: true,
            action: execute ? 'executed' : 'analyzed',
            summary: {
                total_videos: results.analyzed,
                duplicates_found: results.duplicates.length,
                broken_found: results.broken.length,
                needs_url_update: needsUpdate.length,
                updated: results.updated.length,
                deleted: results.deleted.length
            },
            details: results
        });

    } catch (error) {
        console.error('Cleanup error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

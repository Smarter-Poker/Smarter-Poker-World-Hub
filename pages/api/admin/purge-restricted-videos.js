/**
 * ADMIN: Purge Age-Restricted YouTube Videos from Social Feed
 * 
 * One-time cleanup endpoint that:
 * 1. Finds all social_posts with YouTube embed URLs in media_urls
 * 2. Validates each against YouTube oEmbed API
 * 3. Deletes posts with age-restricted or non-embeddable videos
 * 
 * Usage: GET /api/admin/purge-restricted-videos?confirm=true
 * Without confirm=true, runs in dry-run mode (report only)
 */

import { createClient } from '../../../src/lib/supabaseServerClient';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

export default async function handler(req, res) {
    // SECURITY: a missing CRON_SECRET is a server misconfiguration, not a grant.
    // This previously FAILED OPEN: the whole check was wrapped in
    // `if (process.env.CRON_SECRET && ...)` with no else, so an unset
    // CRON_SECRET skipped authentication entirely and left this destructive
    // post-purge endpoint world-callable.
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
        console.warn('[purge-restricted-videos] CRON_SECRET is not configured — rejecting request');
        return res.status(500).json({ error: 'Server misconfigured' });
    }

    // Auth check
    if (req.headers.authorization !== `Bearer ${cronSecret}`) {
        // Also allow admin access via query param for one-time use
        if (req.query.key !== cronSecret) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }

    const dryRun = req.query.confirm !== 'true';
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    try {
        // Fetch all video posts with YouTube embed URLs
        const { data: videoPosts, error } = await supabase
            .from('social_posts')
            .select('id, media_urls, content, author_id, created_at')
            .eq('content_type', 'video')
            .not('media_urls', 'is', null)
            .order('created_at', { ascending: false })
            .limit(500);

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        // Filter to YouTube-only posts
        const ytPosts = (videoPosts || []).filter(p => {
            const url = p.media_urls?.[0] || '';
            return url.includes('youtube.com') || url.includes('youtu.be');
        });

        console.log(`Found ${ytPosts.length} YouTube video posts to validate`);

        const results = {
            total: ytPosts.length,
            valid: 0,
            restricted: [],
            removed: [],
            errors: [],
        };

        // Validate each YouTube video
        for (const post of ytPosts) {
            const url = post.media_urls[0];
            const videoId = extractVideoId(url);
            if (!videoId) {
                results.errors.push({ id: post.id, url, reason: 'no_video_id' });
                continue;
            }

            try {
                const oembedRes = await fetch(
                    `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
                );

                if (!oembedRes.ok) {
                    // Age-restricted (401), embedding disabled (403), not found (404)
                    results.restricted.push({
                        id: post.id,
                        videoId,
                        status: oembedRes.status,
                        reason: oembedRes.status === 401 ? 'age_restricted' 
                              : oembedRes.status === 403 ? 'embed_disabled'
                              : oembedRes.status === 404 ? 'not_found'
                              : `http_${oembedRes.status}`,
                        caption: (post.content || '').slice(0, 50),
                    });

                    if (!dryRun) {
                        const { error: delError } = await supabase
                            .from('social_posts')
                            .delete()
                            .eq('id', post.id);

                        if (delError) {
                            results.errors.push({ id: post.id, reason: delError.message });
                        } else {
                            results.removed.push(post.id);
                        }
                    }
                } else {
                    // Check response body for embeddability
                    const body = await oembedRes.json();
                    if (!body.html || !body.html.includes('iframe')) {
                        results.restricted.push({
                            id: post.id,
                            videoId,
                            status: 200,
                            reason: 'not_embeddable',
                            caption: (post.content || '').slice(0, 50),
                        });

                        if (!dryRun) {
                            const { error: delError } = await supabase
                                .from('social_posts')
                                .delete()
                                .eq('id', post.id);

                            if (!delError) results.removed.push(post.id);
                        }
                    } else {
                        results.valid++;
                    }
                }

                // Rate limit: 100ms between YouTube API calls
                await new Promise(r => setTimeout(r, 100));

            } catch (err) {
                results.errors.push({ id: post.id, videoId, reason: err.message });
            }
        }

        return res.status(200).json({
            success: true,
            dryRun,
            message: dryRun 
                ? `DRY RUN: Found ${results.restricted.length} restricted videos. Add ?confirm=true to delete.`
                : `Deleted ${results.removed.length} restricted video posts.`,
            ...results,
        });

    } catch (err) {
        console.error('Purge error:', err);
        return res.status(500).json({ error: err.message });
    }
}

function extractVideoId(url) {
    if (!url) return null;
    const patterns = [
        /youtube\.com\/embed\/([a-zA-Z0-9_-]+)/,
        /youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/,
        /youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/,
        /youtu\.be\/([a-zA-Z0-9_-]+)/,
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

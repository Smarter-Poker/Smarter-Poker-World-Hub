/**
 * 🎬 POKERNEWS VIDEO AUTO-INGESTION (RSS)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Automatically fetches latest videos from PokerNews YouTube channel via RSS.
 * Ingests them as "social_reels" for the PokerNews bot persona.
 *
 * CHANNEL ID: UCSu1ww_wgD0XD66C1ESrIGQ (@pokernewsdotcom)
 * SCHEDULE: Runs every 2 hours
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import Parser from 'rss-parser';

// Initialize clients
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY // Service role required for inserts
);

const parser = new Parser({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
});

const POKERNEWS_CHANNEL_ID = 'UCSu1ww_wgD0XD66C1ESrIGQ';
const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${POKERNEWS_CHANNEL_ID}`;

// ═══════════════════════════════════════════════════════════════════════════
// WORKER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════
async function ingestLatestVideos() {
    const results = { found: 0, imported: 0, skipped: 0, errors: [] };

    try {
        const feed = await parser.parseURL(RSS_URL);
        results.found = feed.items.length;

        // 1. Find Author (PokerNews Bot)
        let { data: author } = await supabase
            .from('content_authors')
            .select('id, profile_id')
            .ilike('name', '%PokerNews%')
            .not('profile_id', 'is', null) // Must have authorized profile
            .maybeSingle();

        // Fallback Author
        if (!author) {
            const { data: fallback } = await supabase
                .from('content_authors')
                .select('id, profile_id')
                .not('profile_id', 'is', null)
                .limit(1)
                .maybeSingle();
            author = fallback;
        }

        if (!author || !author.profile_id) {
            throw new Error('No valid content_author found for video attribution');
        }

        // 2. Process Videos
        for (const item of feed.items) {
            const videoUrl = item.link;
            const title = item.title;
            const publishedAt = item.isoDate;

            // Check duplicate
            const { data: existing } = await supabase
                .from('social_reels')
                .select('id')
                .eq('video_url', videoUrl)
                .maybeSingle();

            if (existing) {
                results.skipped++;
                continue;
            }

            // Insert
            const { error } = await supabase
                .from('social_reels')
                .insert({
                    video_url: videoUrl,
                    caption: title,
                    is_public: true,
                    created_at: publishedAt,
                    author_id: author.profile_id
                });

            if (error) {
                results.errors.push(`Failed to insert "${title}": ${error.message}`);
                console.error('Insert Error:', error);
            } else {
                results.imported++;
            }
        }

    } catch (e) {
        throw e;
    }

    return results;
}

// ═══════════════════════════════════════════════════════════════════════════
// API HANDLER
// ═══════════════════════════════════════════════════════════════════════════
export default async function handler(req, res) {
    // Verify cron secret
    if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    // Security: validate cron auth for external callers
    const { validateCronAuth } = await import('../../../src/utils/cron-auth.js');
    if (!validateCronAuth(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }


    try {
        const results = await ingestLatestVideos();


        return res.status(200).json({
            success: true,
            timestamp: new Date().toISOString(),
            results
        });

    } catch (error) {
        console.error('❌ CRON FATAL:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

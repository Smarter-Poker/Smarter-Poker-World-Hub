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
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

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
        let feed;
        try {
            feed = await Promise.race([
                parser.parseURL(RSS_URL),
                new Promise((_, reject) => setTimeout(() => reject(new Error('RSS fetch timeout (15s)')), 15000)),
            ]);
        } catch (fetchErr) {
            console.warn('[PokerNews] RSS fetch failed (non-fatal):', fetchErr.message);
            results.errors.push(`RSS fetch failed: ${fetchErr.message}`);
            return results; // Return partial results instead of crashing
        }
        results.found = feed.items.length;

        // 1. Find Author (PokerNews Bot)
        let { data: author } = await getSupabase()
            .from('content_authors')
            .select('id, profile_id')
            .ilike('name', '%PokerNews%')
            .not('profile_id', 'is', null) // Must have authorized profile
            .maybeSingle();

        // Fallback Author
        if (!author) {
            const { data: fallback } = await getSupabase()
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
            const { data: existing } = await getSupabase()
                .from('social_reels')
                .select('id')
                .eq('video_url', videoUrl)
                .maybeSingle();

            if (existing) {
                results.skipped++;
                continue;
            }

            // Insert
            const { error } = await getSupabase()
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
  try {
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

  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}

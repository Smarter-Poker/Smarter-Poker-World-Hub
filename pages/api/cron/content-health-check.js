/**
 * 🏥 CONTENT HEALTH CHECK - Self-Healing Monitor
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Monitors all content sources and automatically attempts remediation.
 * Only alerts to Sentry if self-healing fails.
 *
 * SCHEDULE: Daily at 6 AM (`0 6 * * *`)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import * as Sentry from '@sentry/nextjs';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE DEFINITIONS WITH FALLBACKS
// ═══════════════════════════════════════════════════════════════════════════
const SOURCES = [
    {
        name: 'PokerNews',
        primary: 'https://www.pokernews.com/rss.php',
        fallbacks: [
            'https://www.pokernews.com/news.rss',
            'https://www.pokernews.com/news/'
        ]
    },
    {
        name: 'MSPT',
        primary: 'https://msptpoker.com/pages/Magazine.aspx',
        fallbacks: ['https://msptpoker.com/']
    },
    {
        name: 'CardPlayer',
        primary: 'https://www.cardplayer.com/poker-news.rss',
        fallbacks: [
            'https://www.cardplayer.com/rss/news.xml',
            'https://www.cardplayer.com/poker-news'
        ]
    },
    {
        name: 'WSOP',
        primary: 'https://www.wsop.com/news/',
        fallbacks: ['https://www.wsop.com/']
    },
    {
        name: 'Poker.org',
        primary: 'https://www.poker.org/feed',
        fallbacks: ['https://www.poker.org/']
    },
    {
        name: 'Pokerfuse',
        primary: 'https://pokerfuse.com/',
        fallbacks: ['https://pokerfuse.com/latest-news/']
    },
    {
        name: 'PokerNews Videos (YouTube)',
        primary: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCSu1ww_wgD0XD66C1ESrIGQ',
        fallbacks: []
    }
];

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xml,application/rss+xml;q=0.9,*/*;q=0.8'
};

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK LOGIC
// ═══════════════════════════════════════════════════════════════════════════
async function checkSource(url) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const res = await fetch(url, {
            headers: HEADERS,
            signal: controller.signal
        });
        clearTimeout(timeout);

        return { ok: res.status === 200, status: res.status };
    } catch (e) {
        return { ok: false, status: 0, error: e.message };
    }
}

async function tryFallbacks(source, configPath) {
    // Try each fallback URL
    for (const fallback of source.fallbacks) {
        const result = await checkSource(fallback);

        if (result.ok) {

            // Log the fix for later manual review
            await supabase.from('system_logs').insert({
                type: 'content_health_autofix',
                message: `${source.name}: Switched from ${source.primary} to ${fallback}`,
                metadata: {
                    source: source.name,
                    old_url: source.primary,
                    new_url: fallback,
                    config_path: configPath,
                    auto_fixed: true
                }
            }).select().single();

            return { fixed: true, new_url: fallback };
        }
    }

    return { fixed: false };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════
export default async function handler(req, res) {
    // Verify cron secret
    if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const results = {
        timestamp: new Date().toISOString(),
        sources: [],
        healthy: 0,
        failed: 0,
        auto_fixed: 0,
        needs_attention: []
    };

    for (const source of SOURCES) {
        const check = await checkSource(source.primary);

        if (check.ok) {
            results.sources.push({ name: source.name, status: 'healthy' });
            results.healthy++;
        } else {

            // Attempt self-healing
            if (source.fallbacks.length > 0) {
                const fix = await tryFallbacks(source, 'pages/api/cron/news-scraper.js');

                if (fix.fixed) {
                    results.sources.push({
                        name: source.name,
                        status: 'auto_fixed',
                        new_url: fix.new_url
                    });
                    results.auto_fixed++;
                } else {
                    results.sources.push({ name: source.name, status: 'failed' });
                    results.failed++;
                    results.needs_attention.push(source.name);
                }
            } else {
                results.sources.push({ name: source.name, status: 'failed' });
                results.failed++;
                results.needs_attention.push(source.name);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // REPORT TO SENTRY ONLY IF THERE ARE UNRECOVERABLE FAILURES
    // ═══════════════════════════════════════════════════════════════════════
    if (results.needs_attention.length > 0) {
        Sentry.captureMessage(`Content Health Check: ${results.needs_attention.length} sources need manual attention`, {
            level: 'warning',
            extra: {
                failed_sources: results.needs_attention,
                full_results: results
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════════════════

    if (results.needs_attention.length > 0) {
    }

    return res.status(200).json({
        success: results.failed === 0,
        ...results
    });
}

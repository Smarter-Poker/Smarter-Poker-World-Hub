/**
 * 🎬 VIDEO LIBRARY DAILY SCRAPER — OpenClaw Cron Endpoint
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Scrapes fresh YouTube videos from ALL 25 creators in the video library
 * every day at 6am UTC via Open Claw. Uses YouTube RSS feeds (no API key).
 *
 * CREATORS (25 total matching SOURCES in videoLibraryData.js):
 *   HCL, LODGE, TRITON, LATB, TCH, POKERGO
 *   WSOP, WPT, EPT
 *   BRAD_OWEN, NEEME, RAMPAGE, MARIANO, WOLFGANG, JOHNNIE, BOSKI, RYAN
 *   JLITTLE, POLK, BART, UPSWING
 *   NEGREANU, HELLMUTH, IVEY, DWAN, GARRETT
 *
 * SCHEDULE: Daily 6am UTC via OpenClaw (openclaw-cron-dispatcher.py)
 * ROUTE:    GET /api/cron/video-library-scraper
 * AUTH:     Bearer CRON_SECRET header
 * ══════════════════════════════════════════════════════════════════════════
 */

import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { validateCronAuth } from '../../../src/utils/cron-auth.js';

// ─── YouTube Atom RSS Parser ───────────────────────────────────────────────
async function fetchYouTubeRSS(channelId, maxItems = 15) {
    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/atom+xml,text/xml' }
        });
        clearTimeout(timeout);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return parseAtomFeed(await res.text(), maxItems);
    } catch (err) {
        clearTimeout(timeout);
        throw err;
    }
}

function parseAtomFeed(xml, maxItems) {
    const videos = [];
    const entryRx = /<entry>([\s\S]*?)<\/entry>/g;
    let m;
    while ((m = entryRx.exec(xml)) !== null && videos.length < maxItems) {
        const e = m[1];
        const videoId   = extractTag(e, 'yt:videoId');
        const title     = decodeXml(extractTag(e, 'title'));
        const published = extractTag(e, 'published');
        const views     = parseInt((extractAttr(e, 'media:statistics', 'views') || '0').replace(/,/g, ''), 10) || 0;
        const thumb     = extractAttr(e, 'media:thumbnail', 'url') || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        if (!videoId || !title) continue;
        videos.push({ youtube_video_id: videoId, title, published_at: published || new Date().toISOString(), views, thumbnail_url: thumb });
    }
    return videos;
}

function extractTag(xml, tag) { const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`)); return m ? m[1].trim() : null; }
function extractAttr(xml, tag, attr) { const m = xml.match(new RegExp(`<${tag}[^>]*${attr}="([^"]*)"[^>]*>`)); return m ? m[1] : null; }
function decodeXml(s) { return s ? s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1') : s; }
function formatViews(n) { if (!n) return '0'; if (n >= 1e6) return `${(n/1e6).toFixed(1)}M`; if (n >= 1e3) return `${(n/1e3).toFixed(0)}K`; return String(n); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── All 25 Creator Channel Registry ──────────────────────────────────────
// Channel IDs verified against VideoClipper.js POKER_SOURCES + direct lookup.
// YouTube RSS feed format: https://www.youtube.com/feeds/videos.xml?channel_id=UC...
const CREATORS = [
    // ── LIVE STREAMS ────────────────────────────────────────────────────
    { source_id: 'HCL',      name: 'Hustler Casino Live', channel_id: 'UCNJhx0JD6HoT1fz0Z3tZpSw', type: 'cash',       max: 20 },
    { source_id: 'LODGE',    name: 'The Lodge',            channel_id: 'UCMmDz3FxDKMZFpWTGAFKx7w', type: 'cash',       max: 15 },
    { source_id: 'TRITON',   name: 'Triton Poker',         channel_id: 'UCufGv_keDkYmMFnBxBXYFjA', type: 'tournament', max: 15 },
    { source_id: 'LATB',     name: 'Live at the Bike',     channel_id: 'UCO5tQXuWI7GEdOJ-EaRVwPA', type: 'cash',       max: 12 },
    { source_id: 'TCH',      name: 'TCH Live',             channel_id: 'UCWWzQiT3VWCQrx1aMWsE0VA', type: 'cash',       max: 10 },
    { source_id: 'POKERGO',  name: 'PokerGO',              channel_id: 'UCjFHqMMHDGUiOuIBXMGpZqg', type: 'cash',       max: 10 },

    // ── MAJOR TOURS ──────────────────────────────────────────────────────
    { source_id: 'WSOP',     name: 'WSOP',                 channel_id: 'UC4HpXSfRFPqZMhOKU9WVmEA', type: 'tournament', max: 15 },
    { source_id: 'WPT',      name: 'World Poker Tour',     channel_id: 'UCl4FwCxDwUY6LhJjx1QYBkA', type: 'tournament', max: 12 },
    { source_id: 'EPT',      name: 'EPT Poker',            channel_id: 'UCrM5f8qg7mPwDzFXaeLYG4g', type: 'tournament', max: 12 }, // PokerStars channel

    // ── TOP VLOGGERS ──────────────────────────────────────────────────────
    { source_id: 'BRAD_OWEN',name: 'Brad Owen',            channel_id: 'UCYL4GhBFZkjwqfkFaZoLDEw', type: 'cash',       max: 10 },
    { source_id: 'NEEME',    name: 'Andrew Neeme',         channel_id: 'UC0GqIBZBMBNpWXQmekP1XyQ', type: 'cash',       max:  8 },
    { source_id: 'RAMPAGE',  name: 'Rampage Poker',        channel_id: 'UCPkrA3FMbQtYjmr2Pc5GKUA', type: 'cash',       max:  8 },
    { source_id: 'MARIANO',  name: 'Mariano',              channel_id: 'UCqHm6kEhf0dS_jxzjhNDdwg', type: 'cash',       max:  8 },
    { source_id: 'WOLFGANG', name: 'Wolfgang Poker',       channel_id: 'UCnDYfVDzEZWPbqAr2R0n0Ag', type: 'cash',       max:  8 },
    { source_id: 'JOHNNIE',  name: 'JohnnieVibes',         channel_id: 'UCwLBKk52TJXPF5ioAyf4ZQg', type: 'cash',       max:  6 },
    { source_id: 'BOSKI',    name: 'Boski',                channel_id: 'UCIKcbEjFHI0fZ0-FcCtpmjw', type: 'cash',       max:  6 },
    { source_id: 'RYAN',     name: 'Ryan Depaulo',         channel_id: 'UCTtBMCMnWR8R7j4FYZqkKjg', type: 'cash',       max:  6 },

    // ── TRAINING / STRATEGY ───────────────────────────────────────────────
    { source_id: 'JLITTLE',  name: 'Jonathan Little',      channel_id: 'UCfkEEHfhMgHxEWOuiGMXxKQ', type: 'cash',       max: 10 },
    { source_id: 'POLK',     name: 'Doug Polk Poker',      channel_id: 'UCB_sfU5NC1dlIVj7pz7Y5NQ', type: 'cash',       max: 10 }, // Verified in VideoClipper.js
    { source_id: 'BART',     name: 'Bart Hanson',          channel_id: 'UCkifuJKGsNMrJQk6fkXe-UQ', type: 'cash',       max:  8 },
    { source_id: 'UPSWING',  name: 'Upswing Poker',        channel_id: 'UCvBhUfNVmHE6sUjRmkBhY_A', type: 'cash',       max: 10 },

    // ── CELEBRITY PROS ────────────────────────────────────────────────────
    { source_id: 'NEGREANU', name: 'Daniel Negreanu',      channel_id: 'UCbFzUMdz9UXBFU-Q1lPr6PA', type: 'cash',       max:  8 },
    { source_id: 'HELLMUTH', name: 'Phil Hellmuth',        channel_id: 'UCNQR5kUk0cDq0k21FdxDXpQ', type: 'tournament', max:  6 },
    { source_id: 'IVEY',     name: 'Phil Ivey',            channel_id: 'UCwi2BxWIhRTWbBzxXpyvCnA', type: 'cash',       max:  6 },
    { source_id: 'DWAN',     name: 'Tom Dwan',             channel_id: 'UC2Kuvv-ZPJQ2bXPE5JGiMaA', type: 'cash',       max:  6 },
    { source_id: 'GARRETT',  name: 'Garrett Adelstein',    channel_id: 'UC_XKahEMHHMdJtDX__R9b2w', type: 'cash',       max:  6 },
];

// ─── Main Ingestion Worker ─────────────────────────────────────────────────
async function scrapeVideoLibrary() {
    const supabase = getSupabaseAdmin();
    const startTime = Date.now();

    const summary = {
        creators_processed: 0,
        creators_failed:    0,
        total_found:        0,
        total_imported:     0,
        total_skipped:      0,
        total_errors:       [],
        creator_results:    [],
    };

    // Load ALL existing youtube_video_ids in one round-trip (fast dedup)
    const { data: existing } = await supabase.from('video_library_videos').select('youtube_video_id');
    const existingIds = new Set((existing || []).map(v => v.youtube_video_id));
    console.log(`[VidScraper] Dedup set: ${existingIds.size} existing videos`);

    for (const creator of CREATORS) {
        const cr = { source_id: creator.source_id, name: creator.name, found: 0, imported: 0, skipped: 0, error: null };

        try {
            let videos;
            try {
                videos = await fetchYouTubeRSS(creator.channel_id, creator.max);
            } catch (rssErr) {
                cr.error = `RSS: ${rssErr.message}`;
                summary.creators_failed++;
                summary.total_errors.push(`${creator.source_id}: ${rssErr.message}`);
                summary.creator_results.push(cr);
                await sleep(200);
                continue;
            }

            cr.found = videos.length;
            summary.total_found += videos.length;

            const newVids = videos.filter(v => !existingIds.has(v.youtube_video_id));
            cr.skipped = videos.length - newVids.length;
            summary.total_skipped += cr.skipped;

            if (newVids.length > 0) {
                const rows = newVids.map(v => ({
                    youtube_video_id: v.youtube_video_id,
                    source_id:        creator.source_id,
                    source_name:      creator.name,
                    type:             creator.type,
                    title:            v.title,
                    thumbnail_url:    v.thumbnail_url,
                    views_text:       formatViews(v.views),
                    views_count:      v.views,
                    published_at:     v.published_at,
                    video_url:        `https://www.youtube.com/watch?v=${v.youtube_video_id}`,
                    duration:         null,
                    scraped_at:       new Date().toISOString(),
                }));

                const { data: inserted, error: upsertErr } = await supabase
                    .from('video_library_videos')
                    .upsert(rows, { onConflict: 'youtube_video_id', ignoreDuplicates: true })
                    .select('id');

                if (upsertErr) {
                    cr.error = upsertErr.message;
                    summary.total_errors.push(`${creator.source_id}: ${upsertErr.message}`);
                } else {
                    cr.imported = inserted?.length ?? newVids.length;
                    summary.total_imported += cr.imported;
                    newVids.forEach(v => existingIds.add(v.youtube_video_id));
                    console.log(`[VidScraper] ${creator.source_id}: +${cr.imported} new`);
                }
            }

            summary.creators_processed++;

        } catch (err) {
            cr.error = err.message;
            summary.creators_failed++;
            summary.total_errors.push(`${creator.source_id}: ${err.message}`);
        }

        summary.creator_results.push(cr);
        await sleep(400); // Polite pacing between channels
    }

    summary.elapsed_ms = Date.now() - startTime;

    // Audit log — use correct schema (table_name, action, scrape_proof)
    try {
        await supabase.from('data_audit_log').insert({
            table_name:  'video_library_videos',
            action:      'scrape',
            scrape_proof: JSON.stringify({
                scraper:            'video_library_scraper',
                creators_processed: summary.creators_processed,
                creators_failed:    summary.creators_failed,
                total_found:        summary.total_found,
                total_imported:     summary.total_imported,
                total_skipped:      summary.total_skipped,
                elapsed_ms:         summary.elapsed_ms,
                errors:             summary.total_errors.slice(0, 10),
                ran_at:             new Date().toISOString(),
            }),
        });
    } catch (auditErr) {
        console.warn('[VidScraper] Audit log failed:', auditErr.message);
    }

    return summary;
}

// ─── API Handler ───────────────────────────────────────────────────────────
export default async function handler(req, res) {
    try {
        if (!validateCronAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

        console.log('[VidScraper] Starting daily RSS ingest...');
        const results = await scrapeVideoLibrary();
        console.log(`[VidScraper] Done: +${results.total_imported} imported from ${results.creators_processed} creators (${results.creators_failed} failed) in ${results.elapsed_ms}ms`);

        return res.status(200).json({
            success:   true,
            timestamp: new Date().toISOString(),
            summary: {
                creators_processed: results.creators_processed,
                creators_failed:    results.creators_failed,
                total_found:        results.total_found,
                total_imported:     results.total_imported,
                total_skipped:      results.total_skipped,
                elapsed_ms:         results.elapsed_ms,
                errors:             results.total_errors,
            },
            creator_results: results.creator_results,
        });
    } catch (err) {
        try { reportApiError(err, req); } catch (_) {}
        console.error('[VidScraper] Fatal:', err.message);
        if (!res.headersSent) return res.status(500).json({ success: false, error: err.message });
    }
}

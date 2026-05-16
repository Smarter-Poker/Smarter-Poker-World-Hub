/**
 * Venue Scraper — Receive Endpoint
 * 
 * Receives scraped venue data from Manus AI and persists to Supabase.
 * Handles daily tournament schedules and venue news/promotions.
 *
 * Auth: x-venue-scraper-key header
 * Method: POST only
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const VENUE_SCRAPER_SECRET = process.env.VENUE_SCRAPER_SECRET;

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'POST only' });
        }

        // Auth
        const secretKey = req.headers['x-venue-scraper-key'];
        if (!secretKey || !VENUE_SCRAPER_SECRET || secretKey !== VENUE_SCRAPER_SECRET) {
            return res.status(401).json({ error: 'Invalid scraper key' });
        }

        const { batch_id, source_tier, venues } = req.body;

        if (!venues || !Array.isArray(venues) || venues.length === 0) {
            return res.status(400).json({ error: 'venues array required' });
        }

        console.debug(`[Venue Receive] Batch ${batch_id || '?'}, Tier: ${source_tier || '?'}, Venues: ${venues.length}`);

        const results = {
            tournaments_upserted: 0,
            news_inserted: 0,
            venues_updated: 0,
            errors: [],
        };

        for (const venueData of venues) {
            try {
                const { venue_id, status, source_url, tournaments, news } = venueData;

                // Validate venue_id is a positive integer
                const vid = parseInt(venue_id, 10);
                if (isNaN(vid) || vid < 1) {
                    results.errors.push(`Invalid venue_id: ${venue_id}`);
                    continue;
                }

                if (status === 'failed') {
                    console.debug(`[Venue Receive] Venue ${vid} scrape failed — skipping`);
                    continue;
                }

                // ── Upsert daily tournaments ──
                if (tournaments && Array.isArray(tournaments) && tournaments.length > 0) {
                    // Delete existing tournaments for this venue (full refresh)
                    const { error: err_venue_daily_tournaments_wytc3 } = await getSupabase()
                      .from('venue_daily_tournaments')
                      .delete()
                        .eq('venue_id', vid);
                    if (err_venue_daily_tournaments_wytc3) console.warn('[Supabase] Silent mutation failed in venue_daily_tournaments:', err_venue_daily_tournaments_wytc3.message);

                    // Get venue name from the batch data
                    const venueName = venueData.venue_name || venueData.name || null;

                    const tournamentRows = tournaments
                        .filter(t => t.day_of_week) // must have at least a day
                        .map(t => ({
                            venue_id: vid,
                            venue_name: venueName || null,
                            day_of_week: String(t.day_of_week).trim(),
                            start_time: t.start_time ? String(t.start_time).trim() : null,
                            tournament_name: t.tournament_name ? String(t.tournament_name).trim() : null,
                            buy_in: t.buy_in != null && !isNaN(t.buy_in) ? parseFloat(t.buy_in) : null,
                            rebuy_addon: t.rebuy_addon ? String(t.rebuy_addon).trim() : null,
                            starting_stack: t.starting_stack != null && !isNaN(t.starting_stack) ? parseInt(t.starting_stack, 10) : null,
                            blind_levels: t.blind_levels ? String(t.blind_levels).trim() : null,
                            game_type: t.game_type ? String(t.game_type).trim().toUpperCase() : null,
                            format: t.format ? String(t.format).trim() : null,
                            guaranteed: t.guaranteed != null && !isNaN(t.guaranteed) ? parseFloat(t.guaranteed) : null,
                            source_url: source_url || null,
                            last_scraped: new Date().toISOString(),
                            is_active: true,
                        }));

                    if (tournamentRows.length > 0) {
                        const { error: tErr } = await getSupabase()
                            .from('venue_daily_tournaments')
                            .insert(tournamentRows);

                        if (tErr) {
                            console.warn(`[Venue Receive] Tournament insert error for venue ${vid}:`, tErr.message);
                            results.errors.push(`Venue ${vid} tournaments: ${tErr.message}`);
                        } else {
                            results.tournaments_upserted += tournamentRows.length;
                        }
                    }
                }

                // ── Insert venue news ──
                if (news && Array.isArray(news) && news.length > 0) {
                    const newsRows = news
                        .filter(n => n.title && n.title.trim().length > 0)
                        .map(n => ({
                            venue_id: vid,
                            title: String(n.title).trim(),
                            content: n.content ? String(n.content).trim() : null,
                            source_url: source_url || null,
                            image_url: n.image_url || null,
                            published_at: n.published_at || null,
                            scraped_at: new Date().toISOString(),
                            is_active: true,
                        }));

                    if (newsRows.length > 0) {
                        const { error: nErr } = await getSupabase()
                            .from('venue_news')
                            .insert(newsRows);

                        if (nErr) {
                            console.warn(`[Venue Receive] News insert error for venue ${vid}:`, nErr.message);
                            results.errors.push(`Venue ${vid} news: ${nErr.message}`);
                        } else {
                            results.news_inserted += newsRows.length;
                        }
                    }
                }

                // ── Update venue's last_scraped_at ──
                // This updates the JSON-sourced venue in Supabase (if it exists there)
                // For now, we track scraping metadata in scraper_runs
                results.venues_updated++;

            } catch (venueErr) {
                console.warn(`[Venue Receive] Error processing venue:`, venueErr.message);
                results.errors.push(`Venue ${venueData.venue_id || '?'}: ${venueErr.message}`);
            }
        }

        // ── Log the receive run ──
        try {
            const { error: err_scraper_runs_rz6n3 } = await getSupabase()
              .from('scraper_runs')
              .insert({
                    source: `venue-scraper-receive-${source_tier || 'unknown'}`,
                    status: results.errors.length === 0 ? 'success' : 'partial',
                    stats: results,
                    metadata: { batch_id, source_tier },
                    started_at: new Date().toISOString(),
                });
            if (err_scraper_runs_rz6n3) console.warn('[Supabase] Silent mutation failed in scraper_runs:', err_scraper_runs_rz6n3.message);
        } catch (logErr) {
            console.warn('[Venue Receive] Failed to log run:', logErr.message);
        }

        return res.status(200).json({
            success: true,
            batch_id,
            results,
        });

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[Venue Scraper Receive Error]', err);
        if (!res.headersSent) return res.status(500).json({ error: err.message });
    }
}

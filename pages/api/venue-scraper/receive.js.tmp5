/**
 * Venue Scraper — Receive Endpoint
 *
 * Receives scraped venue data from Manus AI and persists to Supabase.
 * Handles daily tournament schedules and venue news/promotions.
 *
 * Auth: x-venue-scraper-key header. Accepts either the raw VENUE_SCRAPER_SECRET
 *       (legacy) or a short-lived per-batch HMAC token minted by trigger.js.
 * Method: POST only
 */

import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        // Service role ONLY — never silently downgrade to the anon key. Writes here
        // target RLS-protected tables; running as anon fails (or partially applies)
        // while the endpoint still reports success.
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const VENUE_SCRAPER_SECRET = process.env.VENUE_SCRAPER_SECRET;

function safeEqual(a, b) {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
}

/**
 * Verifies a per-batch token of the form `<base64url(payload)>.<hmac-sha256-hex>`
 * where payload is JSON `{ b: <batch_id>, e: <expiry epoch seconds> }`.
 * Minted by pages/api/venue-scraper/trigger.js so the raw shared secret never
 * leaves the platform.
 */
function verifyBatchToken(token, secret) {
    if (typeof token !== 'string' || token.indexOf('.') === -1) return false;
    const dot = token.lastIndexOf('.');
    const payloadB64 = token.slice(0, dot);
    const signature = token.slice(dot + 1);
    if (!payloadB64 || !signature) return false;

    const expected = createHmac('sha256', secret).update(payloadB64).digest('hex');
    if (!safeEqual(signature, expected)) return false;

    try {
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
        if (!payload || typeof payload.e !== 'number') return false;
        return payload.e * 1000 > Date.now();
    } catch (_err) {
        return false;
    }
}

// Non-negotiable columns on venue_daily_tournaments (all NOT NULL).
function buildTournamentRow(t, ctx) {
    const dayOfWeek = t.day_of_week ? String(t.day_of_week).trim() : null;
    if (!dayOfWeek) return null;

    const startTime = t.start_time ? String(t.start_time).trim() : null;
    if (!startTime) return null;

    const buyIn = t.buy_in != null && !isNaN(t.buy_in) ? Math.round(parseFloat(t.buy_in)) : null;
    if (buyIn == null) return null;

    const gameType = t.game_type ? String(t.game_type).trim().toUpperCase() : 'NLH';
    const tournamentName = t.tournament_name
        ? String(t.tournament_name).trim()
        : `$${buyIn} ${gameType}`;

    return {
        venue_id: ctx.venueId,
        venue_name: ctx.venueName,
        day_of_week: dayOfWeek,
        event_date: null, // recurring weekly pattern
        start_time: startTime,
        tournament_name: tournamentName,
        buy_in: buyIn,
        rebuy_addon: t.rebuy_addon ? String(t.rebuy_addon).trim() : null,
        starting_stack: t.starting_stack != null && !isNaN(t.starting_stack) ? parseInt(t.starting_stack, 10) : null,
        blind_levels: t.blind_levels ? String(t.blind_levels).trim() : null,
        game_type: gameType,
        format: t.format ? String(t.format).trim() : null,
        guaranteed: t.guaranteed != null && !isNaN(t.guaranteed) ? Math.round(parseFloat(t.guaranteed)) : null,
        source_url: ctx.sourceUrl,
        last_scraped: ctx.scrapeTimestamp,
        is_active: true,
        // 15-Layer scrape-integrity provenance (all NOT NULL + trigger-enforced)
        data_quality: 'scraped_verified',
        scrape_html_hash: ctx.htmlHash,
        scrape_timestamp: ctx.scrapeTimestamp,
        scrape_batch_id: ctx.batchId,
    };
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'POST only' });
        }

        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
            console.warn('[Venue Receive] SUPABASE_SERVICE_ROLE_KEY missing — refusing to write as anon');
            return res.status(500).json({ error: 'Server misconfigured: service role key unavailable' });
        }

        // Auth — raw shared secret (legacy) or short-lived per-batch HMAC token.
        const secretKey = req.headers['x-venue-scraper-key'];
        if (!secretKey || !VENUE_SCRAPER_SECRET) {
            return res.status(401).json({ error: 'Invalid scraper key' });
        }
        const authOk =
            safeEqual(secretKey, VENUE_SCRAPER_SECRET) ||
            verifyBatchToken(secretKey, VENUE_SCRAPER_SECRET);
        if (!authOk) {
            return res.status(401).json({ error: 'Invalid scraper key' });
        }

        const { batch_id, source_tier, venues } = req.body;

        if (!venues || !Array.isArray(venues) || venues.length === 0) {
            return res.status(400).json({ error: 'venues array required' });
        }

        console.debug(`[Venue Receive] Batch ${batch_id || '?'}, Tier: ${source_tier || '?'}, Venues: ${venues.length}`);

        const batchId = String(batch_id || `receive-${Date.now()}`);

        const results = {
            venues_received: venues.length,
            tournaments_upserted: 0,
            tournaments_skipped: 0,
            tournaments_deactivated: 0,
            news_inserted: 0,
            news_duplicates: 0,
            venues_updated: 0,
            // Venues Manus reported as status:'failed'. Counted and listed so a
            // batch where every venue failed can never be logged as a clean run.
            venues_failed: 0,
            failures: [],
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
                    // Was a bare `continue` with no counter — a batch in which every
                    // venue failed was indistinguishable from a clean run.
                    results.venues_failed++;
                    if (results.failures.length < 50) {
                        results.failures.push(`Venue ${vid}: scrape reported status 'failed'${source_url ? ` (${source_url})` : ''}`);
                    }
                    console.warn(`[Venue Receive] Venue ${vid} scrape failed`);
                    continue;
                }

                // ── Upsert daily tournaments ──
                // NOTE: no delete-first refresh. venue_daily_tournaments carries a
                // 7-column unique key (venue_id, venue_name, day_of_week, event_date,
                // start_time, buy_in, game_type); we upsert on it and only retire rows
                // that this run did not refresh, after the upsert succeeded.
                if (tournaments && Array.isArray(tournaments) && tournaments.length > 0) {
                    // venue_name is NOT NULL — prefer the payload, fall back to the DB.
                    let venueName = venueData.venue_name || venueData.name || null;
                    if (!venueName) {
                        const { data: venueRow } = await getSupabase()
                            .from('poker_venues')
                            .select('name')
                            .eq('id', vid)
                            .maybeSingle();
                        venueName = venueRow?.name || null;
                    }

                    const sourceUrl = source_url ? String(source_url).trim() : null;

                    if (!venueName || !sourceUrl) {
                        results.errors.push(
                            `Venue ${vid} tournaments: missing ${!venueName ? 'venue_name' : 'source_url'} (required)`,
                        );
                    } else {
                        const scrapeTimestamp = new Date().toISOString();
                        const htmlHash = createHash('sha256')
                            .update(JSON.stringify({ venue_id: vid, source_url: sourceUrl, tournaments }))
                            .digest('hex');

                        const ctx = { venueId: vid, venueName, sourceUrl, scrapeTimestamp, htmlHash, batchId };
                        // Collapse rows that share the ON CONFLICT key BEFORE sending the
                        // batch: Postgres aborts the whole statement with 21000
                        // ("ON CONFLICT DO UPDATE command cannot affect row a second
                        // time") if one upsert payload contains the same key twice, and
                        // scraped payloads routinely repeat a tournament.
                        const rowsByKey = new Map();
                        for (const t of tournaments) {
                            const row = buildTournamentRow(t, ctx);
                            if (!row) {
                                results.tournaments_skipped++;
                                continue;
                            }
                            const key = [
                                row.venue_id,
                                row.venue_name,
                                row.day_of_week,
                                row.event_date,
                                row.start_time,
                                row.buy_in,
                                row.game_type,
                            ].join('\u0000');
                            if (rowsByKey.has(key)) results.tournaments_skipped++;
                            rowsByKey.set(key, row); // last write wins — richest payload usually comes last
                        }
                        const tournamentRows = Array.from(rowsByKey.values());

                        if (tournamentRows.length > 0) {
                            const { error: tErr } = await getSupabase()
                                .from('venue_daily_tournaments')
                                .upsert(tournamentRows, {
                                    onConflict:
                                        'venue_id,venue_name,day_of_week,event_date,start_time,buy_in,game_type',
                                });

                            if (tErr) {
                                console.warn(`[Venue Receive] Tournament upsert error for venue ${vid}:`, tErr.message);
                                results.errors.push(`Venue ${vid} tournaments: ${tErr.message}`);
                            } else {
                                results.tournaments_upserted += tournamentRows.length;

                                // Retire rows this batch did not refresh (schedule changed /
                                // tournament cancelled). Never delete — flag as stale so the
                                // public view (is_active + data_quality) stops showing them.
                                const { data: staleRows, error: staleErr } = await getSupabase()
                                    .from('venue_daily_tournaments')
                                    .update({ is_active: false, data_quality: 'stale' })
                                    .eq('venue_id', vid)
                                    .eq('is_active', true)
                                    .lt('scrape_timestamp', scrapeTimestamp)
                                    .select('id');

                                if (staleErr) {
                                    console.warn(`[Venue Receive] Stale sweep failed for venue ${vid}:`, staleErr.message);
                                    results.errors.push(`Venue ${vid} stale sweep: ${staleErr.message}`);
                                } else {
                                    results.tournaments_deactivated += Array.isArray(staleRows) ? staleRows.length : 0;
                                }
                            }
                        }
                    }
                }

                // ── Insert venue news (deduped on venue_id + title) ──
                if (news && Array.isArray(news) && news.length > 0) {
                    const candidates = news
                        .filter(n => n.title && String(n.title).trim().length > 0)
                        .map(n => {
                            // published_at must parse as a timestamp or the whole batch fails.
                            let publishedAt = null;
                            if (n.published_at) {
                                const parsed = Date.parse(n.published_at);
                                if (!isNaN(parsed)) publishedAt = new Date(parsed).toISOString();
                            }
                            return {
                                venue_id: vid,
                                title: String(n.title).trim(),
                                content: n.content ? String(n.content).trim() : null,
                                source_url: source_url || null,
                                image_url: n.image_url || null,
                                published_at: publishedAt,
                                scraped_at: new Date().toISOString(),
                                is_active: true,
                            };
                        });

                    if (candidates.length > 0) {
                        // venue_news has no unique constraint — dedupe by reading the
                        // venue's existing titles so repeat runs don't stack duplicates.
                        const { data: existingNews, error: exErr } = await getSupabase()
                            .from('venue_news')
                            .select('title')
                            .eq('venue_id', vid)
                            .eq('is_active', true);

                        if (exErr) {
                            console.warn(`[Venue Receive] News dedup lookup failed for venue ${vid}:`, exErr.message);
                            results.errors.push(`Venue ${vid} news: ${exErr.message}`);
                        } else {
                            const known = new Set(
                                (existingNews || []).map(r => String(r.title || '').trim().toLowerCase()),
                            );
                            const newsRows = [];
                            for (const row of candidates) {
                                const key = row.title.toLowerCase();
                                if (known.has(key)) {
                                    results.news_duplicates++;
                                    continue;
                                }
                                known.add(key);
                                newsRows.push(row);
                            }

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

        // ── Determine the true outcome of this batch ──
        // A batch in which EVERY venue failed to scrape is a failed run, even
        // though no exception was thrown while processing it.
        const allVenuesFailed = venues.length > 0 && results.venues_failed === venues.length;
        const clean = results.errors.length === 0 && results.venues_failed === 0;
        const runStatus = allVenuesFailed ? 'failed' : (clean ? 'success' : 'partial');
        if (allVenuesFailed) {
            console.warn(`[Venue Receive] TOTAL BATCH FAILURE: all ${venues.length} venues reported status 'failed' (batch ${batchId})`);
        }

        // ── Log the receive run ──
        try {
            const { error: err_scraper_runs_rz6n3 } = await getSupabase()
              .from('scraper_runs')
              .insert({
                    source: `venue-scraper-receive-${source_tier || 'unknown'}`,
                    status: runStatus,
                    stats: results,
                    metadata: {
                        batch_id,
                        source_tier,
                        venues_failed: results.venues_failed,
                        failures: results.failures.slice(0, 10),
                    },
                    started_at: new Date().toISOString(),
                });
            if (err_scraper_runs_rz6n3) console.warn('[Supabase] Silent mutation failed in scraper_runs:', err_scraper_runs_rz6n3.message);
        } catch (logErr) {
            console.warn('[Venue Receive] Failed to log run:', logErr.message);
        }

        const nothingWritten =
            results.tournaments_upserted === 0 && results.news_inserted === 0 &&
            (results.errors.length > 0 || allVenuesFailed);

        return res.status(nothingWritten ? 500 : 200).json({
            success: runStatus === 'success',
            status: runStatus,
            batch_id,
            results,
        });

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[Venue Scraper Receive Error]', err);
        if (!res.headersSent) return res.status(500).json({ error: err.message });
    }
}

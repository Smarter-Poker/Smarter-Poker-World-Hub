/**
 * Venue Tournament Scraper Cron Endpoint
 *
 * Scrapes daily tournament schedules from poker venues.
 * Run daily via Vercel Cron or GitHub Actions.
 *
 * GET /api/cron/venue-tournaments
 *   - Scrapes all venues that haven't been scraped in 24 hours
 *
 * GET /api/cron/venue-tournaments?state=NV
 *   - Scrapes only Nevada venues
 *
 * GET /api/cron/venue-tournaments?source=pokeratlas
 *   - Scrapes only PokerAtlas venues
 *
 * GET /api/cron/venue-tournaments?limit=50
 *   - Scrapes first 50 venues
 *
 * GET /api/cron/venue-tournaments?force=true
 *   - Re-scrape even if recently scraped
 */

import { createClient } from '@supabase/supabase-js';
import https from 'https';
import http from 'http';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const RATE_LIMIT_MS = 2000;

// Fetch URL with retry logic
async function fetchUrl(url, retries = 3) {
    const protocol = url.startsWith('https') ? https : http;

    return new Promise((resolve, reject) => {
        const request = protocol.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        }, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                let redirectUrl = response.headers.location;
                if (!redirectUrl.startsWith('http')) {
                    const urlObj = new URL(url);
                    redirectUrl = `${urlObj.protocol}//${urlObj.host}${redirectUrl}`;
                }
                return fetchUrl(redirectUrl, retries).then(resolve).catch(reject);
            }

            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }

            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => resolve(data));
        });

        request.on('error', async (error) => {
            if (retries > 0) {
                await sleep(1000);
                fetchUrl(url, retries - 1).then(resolve).catch(reject);
            } else {
                reject(error);
            }
        });

        request.setTimeout(15000, () => {
            request.destroy();
            reject(new Error('Timeout'));
        });
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Parse PokerAtlas tournament HTML
function parsePokerAtlasTournaments(html, venueName) {
    const tournaments = [];
    const rows = html.split(/<tr[^>]*>/gi);

    for (const row of rows) {
        if (!row.includes('$') || row.includes('<th')) continue;

        const cells = [];
        const cellMatches = row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi);
        for (const match of cellMatches) {
            cells.push(match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
        }

        if (cells.length < 2) continue;

        const fullText = cells.join(' ');

        const buyinMatch = fullText.match(/\$(\d{1,3}(?:,\d{3})*)/);
        if (!buyinMatch) continue;

        const buyin = parseInt(buyinMatch[1].replace(/,/g, ''));
        if (buyin < 10 || buyin > 50000) continue;

        const timeMatch = fullText.match(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)/i);
        if (!timeMatch) continue;

        const dayMatch = fullText.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun|Daily)/i);
        let dayOfWeek = 'Daily';
        if (dayMatch) {
            const dayMap = { 'mon': 'Monday', 'tue': 'Tuesday', 'wed': 'Wednesday', 'thu': 'Thursday', 'fri': 'Friday', 'sat': 'Saturday', 'sun': 'Sunday' };
            dayOfWeek = dayMap[dayMatch[1].toLowerCase().substring(0, 3)] || dayMatch[1];
        }

        const gtdMatch = fullText.match(/(?:GTD|Guaranteed)[:\s]*\$?([\d,]+)/i);

        let gameType = 'NLH';
        if (/\bPLO\b/i.test(fullText)) gameType = 'PLO';
        else if (/\bOmaha\b/i.test(fullText)) gameType = 'Omaha';

        let format = null;
        if (/turbo/i.test(fullText)) format = 'Turbo';
        else if (/deep\s*stack/i.test(fullText)) format = 'Deep Stack';
        else if (/bounty/i.test(fullText)) format = 'Bounty';

        tournaments.push({
            venue_name: venueName,
            day_of_week: dayOfWeek,
            start_time: timeMatch[1].toUpperCase().replace(/\s/g, ''),
            buy_in: buyin,
            game_type: gameType,
            format: format,
            guaranteed: gtdMatch ? parseInt(gtdMatch[1].replace(/,/g, '')) : null
        });
    }

    const seen = new Set();
    return tournaments.filter(t => {
        const key = `${t.day_of_week}-${t.start_time}-${t.buy_in}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// Parse direct website tournaments
function parseDirectWebsiteTournaments(html, venueName) {
    const tournaments = [];
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const blocks = text.split(/(?=\$\d)/);

    for (const block of blocks) {
        if (block.length > 500) continue;

        const buyinMatch = block.match(/\$(\d{1,3}(?:,\d{3})*)/);
        if (!buyinMatch) continue;

        const buyin = parseInt(buyinMatch[1].replace(/,/g, ''));
        if (buyin < 10 || buyin > 50000) continue;

        const timeMatch = block.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
        if (!timeMatch) continue;

        const dayMatch = block.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Daily)/i);

        tournaments.push({
            venue_name: venueName,
            day_of_week: dayMatch ? dayMatch[1] : 'Daily',
            start_time: timeMatch[1].toUpperCase().replace(/\s/g, ''),
            buy_in: buyin,
            game_type: /PLO|Omaha/i.test(block) ? 'PLO' : 'NLH',
            format: /turbo/i.test(block) ? 'Turbo' : null,
            guaranteed: null
        });
    }

    const seen = new Set();
    return tournaments.filter(t => {
        const key = `${t.day_of_week}-${t.start_time}-${t.buy_in}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export default async function handler(req, res) {
    // Verify cron secret if configured
    if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        // Allow in development or if no secret configured
        if (process.env.NODE_ENV === 'production' && process.env.CRON_SECRET) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }

    const { state, source, limit, force } = req.query;

    const stats = {
        venuesProcessed: 0,
        tournamentsFound: 0,
        tournamentsInserted: 0,
        errors: [],
        skipped: 0
    };

    try {
        // Build query
        let query = supabase
            .from('poker_venues')
            .select('id, name, city, state, scrape_source, scrape_url, pokeratlas_url, last_scraped')
            .eq('is_active', true)
            .order('name');

        if (state) query = query.eq('state', state.toUpperCase());
        if (source) query = query.eq('scrape_source', source);
        if (limit) query = query.limit(parseInt(limit));

        if (force !== 'true') {
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            query = query.or(`last_scraped.is.null,last_scraped.lt.${yesterday}`);
        }

        const { data: venues, error: queryError } = await query;

        if (queryError) {
            return res.status(500).json({ error: queryError.message });
        }

        // Process venues (limit to 50 for API timeout)
        const maxVenues = Math.min(venues.length, 50);

        for (let i = 0; i < maxVenues; i++) {
            const venue = venues[i];
            stats.venuesProcessed++;

            const scrapeSource = venue.scrape_source || 'manual';

            if (scrapeSource === 'manual' || !venue.scrape_url) {
                stats.skipped++;
                continue;
            }

            let url = venue.scrape_url;
            let tournaments = [];

            try {
                if (scrapeSource === 'pokeratlas') {
                    url = venue.pokeratlas_url || venue.scrape_url;
                    if (!url.endsWith('/tournaments')) {
                        url = url.replace(/\/$/, '') + '/tournaments';
                    }
                    const html = await fetchUrl(url);
                    tournaments = parsePokerAtlasTournaments(html, venue.name);

                } else if (scrapeSource === 'direct_website') {
                    url = venue.scrape_url;
                    if (!url.startsWith('http')) url = 'https://' + url;

                    const paths = ['', '/poker', '/poker/tournaments', '/tournaments'];
                    for (const path of paths) {
                        try {
                            const tryUrl = url.replace(/\/$/, '') + path;
                            const html = await fetchUrl(tryUrl);
                            tournaments = parseDirectWebsiteTournaments(html, venue.name);
                            if (tournaments.length > 0) {
                                url = tryUrl;
                                break;
                            }
                        } catch (e) {
                            // Try next path
                        }
                    }
                }

                stats.tournamentsFound += tournaments.length;

                if (tournaments.length > 0) {
                    for (const tournament of tournaments) {
                        tournament.venue_id = venue.id;
                        tournament.source_url = url;
                        tournament.last_scraped = new Date().toISOString();
                        tournament.is_active = true;

                        const { error: insertError } = await supabase
                            .from('venue_daily_tournaments')
                            .upsert(tournament, {
                                onConflict: 'venue_id,day_of_week,start_time,buy_in'
                            });

                        if (!insertError) stats.tournamentsInserted++;
                    }
                }

                await supabase
                    .from('poker_venues')
                    .update({
                        last_scraped: new Date().toISOString(),
                        scrape_status: tournaments.length > 0 ? 'complete' : 'no_tournaments'
                    })
                    .eq('id', venue.id);

            } catch (error) {
                stats.errors.push({ venue: venue.name, error: error.message });
                await supabase
                    .from('poker_venues')
                    .update({ scrape_status: 'error', last_scraped: new Date().toISOString() })
                    .eq('id', venue.id);
            }

            // Rate limiting
            if (i < maxVenues - 1) {
                await sleep(RATE_LIMIT_MS);
            }
        }

        return res.status(200).json({
            success: true,
            stats,
            remaining: venues.length - maxVenues
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message,
            stats
        });
    }
}

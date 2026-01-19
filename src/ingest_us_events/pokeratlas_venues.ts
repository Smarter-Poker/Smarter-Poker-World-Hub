/**
 * PokerAtlas Venue Calendar Crawler
 * Layer B: Crawl venue tournament calendars to catch standalone events and pseudo-series
 */

import * as cheerio from 'cheerio';
import { createHash } from 'crypto';
import type { Event, Series, SourceEntry } from './types';

const RATE_LIMIT_MS = 1000;
const MAX_RETRIES = 3;
const SERIES_CLUSTERING_WINDOW_DAYS = 21;

const SERIES_KEYWORDS = [
    'series', 'open', 'classic', 'championship', 'festival', 'showdown',
    'deepstack', 'poker open', 'poker classic', 'main event', 'heater',
    'shootout', 'madness', 'mania', 'blitz', 'slam', 'grand', 'major'
];

async function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<{ html: string; status: number }> {
    await delay(RATE_LIMIT_MS);

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'SmarterPoker-EventCrawler/1.0 (contact@smarter.poker)',
                    'Accept': 'text/html,application/xhtml+xml',
                },
            });

            if (!response.ok && attempt < retries) {
                await delay(RATE_LIMIT_MS * attempt);
                continue;
            }

            return { html: await response.text(), status: response.status };
        } catch (error) {
            if (attempt === retries) throw error;
            await delay(RATE_LIMIT_MS * attempt);
        }
    }
    throw new Error('Max retries exceeded');
}

// Try PokerAtlas API if key is available
async function fetchVenueEventsAPI(
    venueId: string,
    startDate: string,
    numDays: number = 365
): Promise<{ events: unknown[]; status: number } | null> {
    const apiKey = process.env.POKERATLAS_VENUE_KEY;
    if (!apiKey) return null;

    try {
        const url = `https://www.pokeratlas.com/api/live_tournaments?key=${apiKey}&venue_id=${venueId}&start_date_range=${startDate}&num_of_days=${numDays}`;
        const response = await fetch(url);
        if (!response.ok) return null;

        const data = await response.json();
        return { events: data.tournaments || [], status: response.status };
    } catch {
        return null;
    }
}

interface RawVenueEvent {
    event_name: string;
    start_datetime: string;
    buyin: number | null;
    guarantee: number | null;
    game: string | null;
    venue_name: string;
    city: string;
    state: string;
}

function parseVenueCalendar($: cheerio.CheerioAPI, venueUrl: string): RawVenueEvent[] {
    const events: RawVenueEvent[] = [];

    // Extract venue info
    const venueName = $('h1.venue-name, .venue-header h1, [class*="venue-name"]').first().text().trim() ||
        $('h1').first().text().trim();
    const locationText = $('.venue-location, [class*="location"]').first().text().trim();
    const locMatch = locationText.match(/([^,]+),\s*([A-Z]{2})/);
    const city = locMatch?.[1]?.trim() || '';
    const state = locMatch?.[2]?.trim() || '';

    // Parse tournament listings
    $('.tournament-row, .event-item, table.schedule tr, [class*="tournament"]').each((_, el) => {
        const row = $(el);

        const eventName = row.find('.event-name, .tournament-name, td:first-child').first().text().trim();
        const dateText = row.find('.event-date, .tournament-date, td:nth-child(2)').first().text().trim();
        const timeText = row.find('.event-time, .tournament-time, td:nth-child(3)').first().text().trim();
        const buyinText = row.find('.buyin, td:nth-child(4)').first().text().trim();
        const gtdText = row.find('.guarantee, .gtd, td:nth-child(5)').first().text().trim();
        const gameText = row.find('.game-type, td:nth-child(6)').first().text().trim();

        if (!eventName) return;

        const buyin = parseMoneyValue(buyinText);
        const guarantee = parseMoneyValue(gtdText);

        events.push({
            event_name: eventName,
            start_datetime: `${dateText} ${timeText}`.trim(),
            buyin,
            guarantee,
            game: gameText || null,
            venue_name: venueName,
            city,
            state,
        });
    });

    return events;
}

function parseMoneyValue(text: string): number | null {
    const match = text.replace(/,/g, '').match(/\$?([\d,]+)/);
    return match ? parseInt(match[1].replace(/,/g, ''), 10) : null;
}

function generateEventUid(venueName: string, eventName: string, startDate: string): string {
    const raw = `venue__${venueName}__${eventName}__${startDate}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
    return createHash('sha256').update(raw).digest('hex').slice(0, 24);
}

function generateInferredSeriesUid(venueName: string, clusterName: string, startDate: string): string {
    const raw = `inferred__${venueName}__${clusterName}__${startDate}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
    return `inferred__${createHash('sha256').update(raw).digest('hex').slice(0, 20)}`;
}

interface EventCluster {
    cluster_name: string;
    venue_name: string;
    city: string;
    state: string;
    events: RawVenueEvent[];
    start_date: string;
    end_date: string;
    confidence_score: number;
    rule_hits: string[];
}

function clusterIntoSeries(events: RawVenueEvent[]): {
    clusters: EventCluster[];
    standalone: RawVenueEvent[];
} {
    const clusters: EventCluster[] = [];
    const standalone: RawVenueEvent[] = [];
    const used = new Set<number>();

    // Sort by date
    const sorted = events.map((e, i) => ({ ...e, idx: i }))
        .sort((a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime());

    for (let i = 0; i < sorted.length; i++) {
        if (used.has(sorted[i].idx)) continue;

        const event = sorted[i];
        const eventDate = new Date(event.start_datetime);
        const eventNameLower = event.event_name.toLowerCase();

        // Check if this event has series keywords
        const matchedKeywords = SERIES_KEYWORDS.filter(kw => eventNameLower.includes(kw));

        if (matchedKeywords.length === 0) {
            standalone.push(event);
            used.add(event.idx);
            continue;
        }

        // Try to cluster with nearby events at same venue
        const cluster: RawVenueEvent[] = [event];
        used.add(event.idx);

        for (let j = i + 1; j < sorted.length; j++) {
            if (used.has(sorted[j].idx)) continue;

            const otherEvent = sorted[j];
            const otherDate = new Date(otherEvent.start_datetime);
            const daysDiff = Math.abs((otherDate.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24));

            if (daysDiff > SERIES_CLUSTERING_WINDOW_DAYS) break;
            if (otherEvent.venue_name !== event.venue_name) continue;

            // Check for shared naming tokens
            const otherNameLower = otherEvent.event_name.toLowerCase();
            const sharedKeywords = matchedKeywords.filter(kw => otherNameLower.includes(kw));

            if (sharedKeywords.length > 0) {
                cluster.push(otherEvent);
                used.add(otherEvent.idx);
            }
        }

        if (cluster.length >= 2) {
            const dates = cluster.map(e => new Date(e.start_datetime).getTime());
            clusters.push({
                cluster_name: matchedKeywords.join(' ').toUpperCase() + ' Events',
                venue_name: event.venue_name,
                city: event.city,
                state: event.state,
                events: cluster,
                start_date: new Date(Math.min(...dates)).toISOString().split('T')[0],
                end_date: new Date(Math.max(...dates)).toISOString().split('T')[0],
                confidence_score: Math.min(0.9, 0.5 + (matchedKeywords.length * 0.1) + (cluster.length * 0.05)),
                rule_hits: matchedKeywords,
            });
        } else {
            standalone.push(event);
        }
    }

    return { clusters, standalone };
}

export interface VenueCrawlResult {
    venue_url: string;
    events: Event[];
    inferred_series: Series[];
    source: SourceEntry;
    error?: string;
}

export async function crawlVenueCalendar(venueUrl: string): Promise<VenueCrawlResult> {
    const timestamp = new Date().toISOString();

    try {
        const { html, status } = await fetchWithRetry(venueUrl);

        if (status !== 200) {
            return {
                venue_url: venueUrl,
                events: [],
                inferred_series: [],
                source: { url: venueUrl, timestamp, http_status: status },
                error: `HTTP ${status}`,
            };
        }

        const $ = cheerio.load(html);
        const rawEvents = parseVenueCalendar($, venueUrl);
        const { clusters, standalone } = clusterIntoSeries(rawEvents);

        // Convert standalone events
        const standaloneEvents: Event[] = standalone.map(e => ({
            event_uid: generateEventUid(e.venue_name, e.event_name, e.start_datetime),
            series_uid: null,
            event_name: e.event_name,
            start_datetime: e.start_datetime,
            buyin: e.buyin,
            guarantee: e.guarantee,
            game: e.game,
            structure_json: null,
            source_url: venueUrl,
            source_kind: 'standalone_event_from_venue_calendar',
        }));

        // Convert clusters to inferred series + events
        const inferredSeries: Series[] = [];
        const clusterEvents: Event[] = [];

        for (const cluster of clusters) {
            const seriesUid = generateInferredSeriesUid(cluster.venue_name, cluster.cluster_name, cluster.start_date);

            inferredSeries.push({
                series_uid: seriesUid,
                series_name: `${cluster.venue_name} ${cluster.cluster_name}`,
                venue_name: cluster.venue_name,
                city: cluster.city,
                state: cluster.state,
                country: 'US',
                start_date: cluster.start_date,
                end_date: cluster.end_date,
                event_count: cluster.events.length,
                source_url: venueUrl,
                source_kind: 'inferred_series_from_venue_calendar',
            });

            for (const e of cluster.events) {
                clusterEvents.push({
                    event_uid: generateEventUid(e.venue_name, e.event_name, e.start_datetime),
                    series_uid: seriesUid,
                    event_name: e.event_name,
                    start_datetime: e.start_datetime,
                    buyin: e.buyin,
                    guarantee: e.guarantee,
                    game: e.game,
                    structure_json: { cluster_confidence: cluster.confidence_score, rule_hits: cluster.rule_hits },
                    source_url: venueUrl,
                    source_kind: 'inferred_series_from_venue_calendar',
                });
            }
        }

        const contentHash = createHash('sha256').update(html.slice(0, 10000)).digest('hex').slice(0, 16);

        return {
            venue_url: venueUrl,
            events: [...standaloneEvents, ...clusterEvents],
            inferred_series: inferredSeries,
            source: { url: venueUrl, timestamp, http_status: status, content_hash: contentHash },
        };

    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return {
            venue_url: venueUrl,
            events: [],
            inferred_series: [],
            source: { url: venueUrl, timestamp, http_status: 0, error: errMsg },
            error: errMsg,
        };
    }
}

export async function crawlAllVenues(venueUrls: string[]): Promise<{
    events: Event[];
    inferred_series: Series[];
    sources: SourceEntry[];
    stats: { total: number; succeeded: number; failed: number };
    failures: Array<{ url: string; error: string }>;
}> {
    const allEvents: Event[] = [];
    const allSeries: Series[] = [];
    const allSources: SourceEntry[] = [];
    const failures: Array<{ url: string; error: string }> = [];

    console.log(`[Layer B] Crawling ${venueUrls.length} venue calendars...`);

    for (let i = 0; i < venueUrls.length; i++) {
        if ((i + 1) % 20 === 0) {
            console.log(`[Layer B] Progress: ${i + 1}/${venueUrls.length} venues crawled`);
        }

        const result = await crawlVenueCalendar(venueUrls[i]);
        allSources.push(result.source);

        if (result.error) {
            failures.push({ url: venueUrls[i], error: result.error });
        } else {
            allEvents.push(...result.events);
            allSeries.push(...result.inferred_series);
        }
    }

    console.log(`[Layer B] Complete: ${allEvents.length} events, ${allSeries.length} inferred series`);

    return {
        events: allEvents,
        inferred_series: allSeries,
        sources: allSources,
        stats: {
            total: venueUrls.length,
            succeeded: venueUrls.length - failures.length,
            failed: failures.length,
        },
        failures,
    };
}

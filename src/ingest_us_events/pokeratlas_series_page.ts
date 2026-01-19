/**
 * PokerAtlas Series Page Parser
 * Parse individual series detail pages for full event schedules
 */

import * as cheerio from 'cheerio';
import { createHash } from 'crypto';
import type { Event, SourceEntry } from './types';

const RATE_LIMIT_MS = 1200;
const MAX_RETRIES = 3;

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

function generateEventUid(seriesUid: string, eventName: string, startDate: string): string {
    const raw = `${seriesUid}__${eventName}__${startDate}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
    return createHash('sha256').update(raw).digest('hex').slice(0, 24);
}

function parseMoneyValue(text: string): number | null {
    const match = text.replace(/,/g, '').match(/\$?([\d,]+)/);
    return match ? parseInt(match[1].replace(/,/g, ''), 10) : null;
}

function parseDatetime(text: string): string | null {
    // Try common formats: "Jan 15, 2026 7:00 PM", "1/15/2026 19:00", etc.
    const cleaned = text.trim();
    try {
        const date = new Date(cleaned);
        if (!isNaN(date.getTime())) {
            return date.toISOString();
        }
    } catch {
        // Ignore parse errors
    }

    // Return original if we can't parse
    return cleaned || null;
}

// Parse event schedule from series detail page
function parseEventSchedule($: cheerio.CheerioAPI, seriesUid: string, sourceUrl: string): Event[] {
    const events: Event[] = [];

    // Try various selectors for event tables/lists
    const eventRows = $('table.schedule tbody tr, .event-list .event-row, [class*="schedule"] tr, .tournament-event');

    eventRows.each((_, el) => {
        const row = $(el);

        // Extract event data - adjust selectors based on actual HTML
        const eventName = row.find('td:nth-child(1), .event-name, [class*="name"]').first().text().trim() ||
            row.find('a').first().text().trim();

        const dateText = row.find('td:nth-child(2), .event-date, [class*="date"]').first().text().trim();
        const timeText = row.find('td:nth-child(3), .event-time, [class*="time"]').first().text().trim();
        const buyinText = row.find('td:nth-child(4), .event-buyin, [class*="buyin"]').first().text().trim();
        const guaranteeText = row.find('td:nth-child(5), .event-guarantee, [class*="gtd"]').first().text().trim();
        const gameText = row.find('td:nth-child(6), .event-game, [class*="game"]').first().text().trim();

        if (!eventName) return;

        const startDatetime = parseDatetime(`${dateText} ${timeText}`);

        events.push({
            event_uid: generateEventUid(seriesUid, eventName, startDatetime || dateText),
            series_uid: seriesUid,
            event_name: eventName,
            start_datetime: startDatetime || dateText,
            buyin: parseMoneyValue(buyinText),
            guarantee: parseMoneyValue(guaranteeText),
            game: gameText || null,
            structure_json: null,
            source_url: sourceUrl,
            source_kind: 'canonical_pokeratlas_series_directory',
        });
    });

    return events;
}

// Alternative: Parse from JSON-LD or embedded data
function parseEventFromStructuredData($: cheerio.CheerioAPI, seriesUid: string, sourceUrl: string): Event[] {
    const events: Event[] = [];

    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            const json = JSON.parse($(el).html() || '{}');
            if (json['@type'] === 'Event' || (Array.isArray(json) && json[0]?.['@type'] === 'Event')) {
                const eventData = Array.isArray(json) ? json : [json];
                eventData.forEach(e => {
                    if (e['@type'] !== 'Event') return;
                    events.push({
                        event_uid: generateEventUid(seriesUid, e.name || '', e.startDate || ''),
                        series_uid: seriesUid,
                        event_name: e.name || '',
                        start_datetime: e.startDate || '',
                        buyin: parseMoneyValue(e.offers?.price?.toString() || ''),
                        guarantee: null,
                        game: null,
                        structure_json: e,
                        source_url: sourceUrl,
                        source_kind: 'canonical_pokeratlas_series_directory',
                    });
                });
            }
        } catch {
            // Ignore JSON parse errors
        }
    });

    return events;
}

export interface SeriesPageResult {
    events: Event[];
    source: SourceEntry;
    error?: string;
}

export async function parseSeriesPage(
    seriesUid: string,
    seriesUrl: string
): Promise<SeriesPageResult> {
    const timestamp = new Date().toISOString();

    try {
        const { html, status } = await fetchWithRetry(seriesUrl);

        if (status !== 200) {
            return {
                events: [],
                source: { url: seriesUrl, timestamp, http_status: status },
                error: `HTTP ${status}`,
            };
        }

        const $ = cheerio.load(html);

        // Try HTML parsing first
        let events = parseEventSchedule($, seriesUid, seriesUrl);

        // Fallback to structured data if no events found
        if (events.length === 0) {
            events = parseEventFromStructuredData($, seriesUid, seriesUrl);
        }

        const contentHash = createHash('sha256')
            .update(html.slice(0, 10000))
            .digest('hex')
            .slice(0, 16);

        return {
            events,
            source: {
                url: seriesUrl,
                timestamp,
                http_status: status,
                content_hash: contentHash,
            },
        };

    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return {
            events: [],
            source: { url: seriesUrl, timestamp, http_status: 0, error: errMsg },
            error: errMsg,
        };
    }
}

// Batch process multiple series pages
export async function parseAllSeriesPages(
    seriesList: Array<{ series_uid: string; detail_url: string }>
): Promise<{
    events: Event[];
    sources: SourceEntry[];
    failures: Array<{ url: string; error: string }>;
}> {
    const allEvents: Event[] = [];
    const allSources: SourceEntry[] = [];
    const failures: Array<{ url: string; error: string }> = [];

    console.log(`[Layer A] Parsing ${seriesList.length} series detail pages...`);

    for (let i = 0; i < seriesList.length; i++) {
        const { series_uid, detail_url } = seriesList[i];

        if ((i + 1) % 10 === 0) {
            console.log(`[Layer A] Progress: ${i + 1}/${seriesList.length} series pages parsed`);
        }

        const result = await parseSeriesPage(series_uid, detail_url);
        allSources.push(result.source);

        if (result.error) {
            failures.push({ url: detail_url, error: result.error });
        } else {
            allEvents.push(...result.events);
        }
    }

    console.log(`[Layer A] Parsed ${allEvents.length} events from ${seriesList.length} series pages`);
    if (failures.length > 0) {
        console.log(`[Layer A] ${failures.length} failures recorded`);
    }

    return { events: allEvents, sources: allSources, failures };
}

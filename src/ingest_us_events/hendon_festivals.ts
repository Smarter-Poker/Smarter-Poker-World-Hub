/**
 * Hendon Mob Festival Gap Detector
 * Layer C: Validate coverage by checking for missing US festivals
 */

import * as cheerio from 'cheerio';
import { createHash } from 'crypto';
import type { Gap, SourceEntry } from './types';

const HENDON_BASE = 'https://www.thehendonmob.com';
const RATE_LIMIT_MS = 2000;
const MAX_RETRIES = 2;

async function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<{ html: string; status: number }> {
    await delay(RATE_LIMIT_MS);

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'SmarterPoker-GapValidator/1.0 (contact@smarter.poker)',
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

interface HendonFestival {
    festival_name: string;
    venue: string | null;
    city: string | null;
    state: string | null;
    country: string;
    start_date: string | null;
    end_date: string | null;
    hendon_url: string;
}

function parseHendonFestivals($: cheerio.CheerioAPI): HendonFestival[] {
    const festivals: HendonFestival[] = [];

    // Hendon Mob festival listings - adjust selectors based on actual HTML
    $('table.listing tr, .festival-row, [class*="festival"]').each((_, el) => {
        const row = $(el);

        const nameEl = row.find('a[href*="/festival"]').first();
        const name = nameEl.text().trim();
        const url = nameEl.attr('href') || '';

        const locationText = row.find('.location, td:nth-child(2)').first().text().trim();
        const dateText = row.find('.dates, td:nth-child(3)').first().text().trim();

        if (!name || !url.includes('/festival')) return;

        // Parse location
        const locMatch = locationText.match(/([^,]+),\s*([A-Z]{2}),?\s*(US|USA)?/i);
        const city = locMatch?.[1]?.trim() || null;
        const state = locMatch?.[2]?.trim() || null;
        const country = (locMatch?.[3] || locationText.toLowerCase().includes('us')) ? 'US' : 'OTHER';

        // Parse dates
        const dateMatch = dateText.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/g);
        const startDate = dateMatch?.[0] || null;
        const endDate = dateMatch?.[1] || startDate;

        festivals.push({
            festival_name: name,
            venue: null, // Would need to parse from detail page
            city,
            state,
            country,
            start_date: startDate,
            end_date: endDate,
            hendon_url: url.startsWith('http') ? url : `${HENDON_BASE}${url}`,
        });
    });

    return festivals;
}

// Fuzzy name matching for gap detection
function normalizeForMatch(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function calculateMatchScore(hendon: HendonFestival, masterNames: Set<string>, masterVenues: Set<string>): {
    matched: boolean;
    score: number;
    matchAttempts: string[];
} {
    const attempts: string[] = [];
    let maxScore = 0;

    const normalizedName = normalizeForMatch(hendon.festival_name);
    attempts.push(`name: ${normalizedName}`);

    // Check direct name match
    if (masterNames.has(normalizedName)) {
        return { matched: true, score: 1.0, matchAttempts: attempts };
    }

    // Check partial name matches
    for (const masterName of masterNames) {
        const overlap = calculateWordOverlap(normalizedName, masterName);
        if (overlap > maxScore) maxScore = overlap;
        if (overlap > 0.6) {
            attempts.push(`partial_name_match: ${masterName} (${overlap.toFixed(2)})`);
            return { matched: true, score: overlap, matchAttempts: attempts };
        }
    }

    // Check venue + date combination
    if (hendon.venue) {
        const normalizedVenue = normalizeForMatch(hendon.venue);
        if (masterVenues.has(normalizedVenue)) {
            attempts.push(`venue_match: ${normalizedVenue}`);
            maxScore = Math.max(maxScore, 0.4);
        }
    }

    return { matched: maxScore > 0.5, score: maxScore, matchAttempts: attempts };
}

function calculateWordOverlap(a: string, b: string): number {
    const wordsA = new Set(a.split(' ').filter(w => w.length > 2));
    const wordsB = new Set(b.split(' ').filter(w => w.length > 2));

    if (wordsA.size === 0 || wordsB.size === 0) return 0;

    let matches = 0;
    for (const word of wordsA) {
        if (wordsB.has(word)) matches++;
    }

    return matches / Math.max(wordsA.size, wordsB.size);
}

export interface GapDetectionResult {
    gaps: Gap[];
    sources: SourceEntry[];
    stats: {
        hendon_festivals_found: number;
        us_festivals: number;
        matched: number;
        gaps: number;
    };
    error?: string;
}

export async function detectHendonGaps(
    masterSeriesNames: string[],
    masterVenueNames: string[]
): Promise<GapDetectionResult> {
    const sources: SourceEntry[] = [];
    const gaps: Gap[] = [];

    // Build normalized lookup sets
    const normalizedMasterNames = new Set(masterSeriesNames.map(normalizeForMatch));
    const normalizedVenues = new Set(masterVenueNames.map(normalizeForMatch));

    console.log('[Layer C] Starting Hendon Mob gap detection...');

    // Hendon festivals page (adjust URL as needed)
    const festivalPages = [
        `${HENDON_BASE}/festivals?region=US`,
        `${HENDON_BASE}/festivals?region=NA`,
    ];

    const allFestivals: HendonFestival[] = [];

    for (const pageUrl of festivalPages) {
        try {
            const { html, status } = await fetchWithRetry(pageUrl);
            sources.push({
                url: pageUrl,
                timestamp: new Date().toISOString(),
                http_status: status,
                content_hash: createHash('sha256').update(html.slice(0, 5000)).digest('hex').slice(0, 16),
            });

            if (status === 200) {
                const $ = cheerio.load(html);
                const festivals = parseHendonFestivals($);
                allFestivals.push(...festivals);
            }
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            sources.push({
                url: pageUrl,
                timestamp: new Date().toISOString(),
                http_status: 0,
                error: errMsg,
            });
        }
    }

    // Filter to US only
    const usFestivals = allFestivals.filter(f => f.country === 'US');
    console.log(`[Layer C] Found ${usFestivals.length} US festivals from Hendon`);

    // Check each festival against our master data
    let matchedCount = 0;
    for (const festival of usFestivals) {
        const { matched, score, matchAttempts } = calculateMatchScore(
            festival,
            normalizedMasterNames,
            normalizedVenues
        );

        if (matched) {
            matchedCount++;
        } else {
            gaps.push({
                gap_uid: createHash('sha256')
                    .update(`gap__${festival.hendon_url}`)
                    .digest('hex')
                    .slice(0, 24),
                festival_name: festival.festival_name,
                venue: festival.venue,
                city: festival.city,
                state: festival.state,
                start_date: festival.start_date,
                end_date: festival.end_date,
                hendon_url: festival.hendon_url,
                match_attempts: matchAttempts,
                confidence: 1 - score,
            });
        }
    }

    console.log(`[Layer C] Gap detection complete: ${matchedCount} matched, ${gaps.length} gaps`);

    return {
        gaps,
        sources,
        stats: {
            hendon_festivals_found: allFestivals.length,
            us_festivals: usFestivals.length,
            matched: matchedCount,
            gaps: gaps.length,
        },
    };
}

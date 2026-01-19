/**
 * PokerAtlas Series Directory Crawler
 * Layer A: Crawl ALL pages of the series directory with fail-closed semantics
 */

import * as cheerio from 'cheerio';
import { createHash } from 'crypto';
import type { Series, SourceEntry, CrawlResult, PageCrawlState } from './types';

const BASE_URL = 'https://www.pokeratlas.com/poker-tournament-series';
const RATE_LIMIT_MS = 1500;
const MAX_RETRIES = 3;

// Rate limiting
async function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Fetch with retries and rate limiting
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

            return {
                html: await response.text(),
                status: response.status,
            };
        } catch (error) {
            if (attempt === retries) {
                throw error;
            }
            await delay(RATE_LIMIT_MS * attempt);
        }
    }

    throw new Error('Max retries exceeded');
}

// Generate content hash for loop detection
function contentHash(html: string): string {
    // Normalize by extracting series links only
    const $ = cheerio.load(html);
    const links = $('a[href*="/poker-tournament-series/"]')
        .map((_, el) => $(el).attr('href'))
        .get()
        .sort()
        .join('|');
    return createHash('sha256').update(links).digest('hex').slice(0, 16);
}

// Parse series cards from a directory page
function parseSeriesCards($: cheerio.CheerioAPI): Array<{
    series_name: string;
    venue: string;
    city: string;
    state: string;
    start_date: string;
    end_date: string;
    event_count: number | null;
    detail_url: string;
}> {
    const series: Array<{
        series_name: string;
        venue: string;
        city: string;
        state: string;
        start_date: string;
        end_date: string;
        event_count: number | null;
        detail_url: string;
    }> = [];

    // PokerAtlas series cards - adjust selectors based on actual HTML structure
    $('.series-card, .tournament-series-item, [class*="series"]').each((_, el) => {
        const card = $(el);

        const nameEl = card.find('h2, h3, .series-name, [class*="name"]').first();
        const venueEl = card.find('.venue, [class*="venue"]').first();
        const locationEl = card.find('.location, [class*="location"]').first();
        const dateEl = card.find('.dates, [class*="date"]').first();
        const linkEl = card.find('a[href*="/poker-tournament-series/"]').first();
        const countEl = card.find('.event-count, [class*="count"]').first();

        const name = nameEl.text().trim();
        const venue = venueEl.text().trim();
        const location = locationEl.text().trim();
        const dateText = dateEl.text().trim();
        const detailUrl = linkEl.attr('href') || '';
        const countText = countEl.text().trim();

        if (!name || !detailUrl) return;

        // Parse location into city, state
        const locationMatch = location.match(/([^,]+),\s*([A-Z]{2})/);
        const city = locationMatch?.[1]?.trim() || '';
        const state = locationMatch?.[2]?.trim() || '';

        // Parse dates
        const dateMatch = dateText.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})/);
        const startDate = dateMatch?.[1] || '';
        const endDate = dateMatch?.[2] || '';

        // Parse event count
        const countMatch = countText.match(/(\d+)/);
        const eventCount = countMatch ? parseInt(countMatch[1], 10) : null;

        series.push({
            series_name: name,
            venue: venue,
            city,
            state,
            start_date: startDate,
            end_date: endDate,
            event_count: eventCount,
            detail_url: detailUrl.startsWith('http') ? detailUrl : `https://www.pokeratlas.com${detailUrl}`,
        });
    });

    return series;
}

// Detect pagination links
function detectPaginationLinks($: cheerio.CheerioAPI): {
    nextPage: string | null;
    allPageLinks: string[];
} {
    const allPageLinks: string[] = [];
    let nextPage: string | null = null;

    // Find pagination
    $('a[href*="page="], .pagination a, [class*="pagination"] a').each((_, el) => {
        const href = $(el).attr('href');
        if (href && href.includes('page=')) {
            const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
            allPageLinks.push(fullUrl);

            // Check if this is the "next" link
            const text = $(el).text().toLowerCase().trim();
            if (text.includes('next') || text === '>' || text === '→' || text === '»') {
                nextPage = fullUrl;
            }
        }
    });

    return { nextPage, allPageLinks: Array.from(new Set(allPageLinks)) };
}

// Check for uncrawled pages
function detectUncrawledPages(allLinks: string[], crawledPages: Set<string>): string[] {
    return allLinks.filter(url => !crawledPages.has(url));
}

// Main directory crawler
export async function crawlSeriesDirectory(): Promise<CrawlResult<{
    series: Array<{
        series_name: string;
        venue: string;
        city: string;
        state: string;
        start_date: string;
        end_date: string;
        event_count: number | null;
        detail_url: string;
    }>;
    state: PageCrawlState;
}>> {
    const sources: SourceEntry[] = [];
    const state: PageCrawlState = {
        pages_crawled: 0,
        last_page_detected: null,
        page_hashes: new Map(),
        all_series_urls: new Set(),
        termination_reason: null,
    };

    const allSeries: Array<{
        series_name: string;
        venue: string;
        city: string;
        state: string;
        start_date: string;
        end_date: string;
        event_count: number | null;
        detail_url: string;
    }> = [];

    const crawledPages = new Set<string>();
    let currentUrl = BASE_URL;
    let allPaginationLinks: string[] = [];

    console.log('[Layer A] Starting PokerAtlas series directory crawl...');

    while (currentUrl) {
        try {
            console.log(`[Layer A] Fetching page: ${currentUrl}`);
            const { html, status } = await fetchWithRetry(currentUrl);

            sources.push({
                url: currentUrl,
                timestamp: new Date().toISOString(),
                http_status: status,
            });

            if (status !== 200) {
                return {
                    success: false,
                    error: `HTTP ${status} on ${currentUrl}`,
                    sources,
                };
            }

            const $ = cheerio.load(html);
            const hash = contentHash(html);

            // Check for loop (same content as previous page)
            if (state.page_hashes.has(hash)) {
                state.termination_reason = 'content_loop_detected';
                break;
            }

            state.page_hashes.set(currentUrl, hash);
            state.pages_crawled++;
            crawledPages.add(currentUrl);

            // Parse series from this page
            const pageSeries = parseSeriesCards($);
            console.log(`[Layer A] Found ${pageSeries.length} series on page ${state.pages_crawled}`);

            // Check for zero new series (termination condition)
            const newSeries = pageSeries.filter(s => !state.all_series_urls.has(s.detail_url));
            if (newSeries.length === 0 && state.pages_crawled > 1) {
                state.termination_reason = 'zero_new_series';
                break;
            }

            newSeries.forEach(s => {
                state.all_series_urls.add(s.detail_url);
                allSeries.push(s);
            });

            // Get pagination info
            const { nextPage, allPageLinks } = detectPaginationLinks($);
            allPaginationLinks = Array.from(new Set([...allPaginationLinks, ...allPageLinks]));

            // Extract max page number
            const pageNumbers = allPaginationLinks
                .map(url => {
                    const match = url.match(/page=(\d+)/);
                    return match ? parseInt(match[1], 10) : 0;
                })
                .filter(n => n > 0);

            if (pageNumbers.length > 0) {
                state.last_page_detected = Math.max(...pageNumbers);
            }

            // Move to next page
            if (nextPage && !crawledPages.has(nextPage)) {
                currentUrl = nextPage;
            } else {
                // Check if there are uncrawled pages
                const uncrawled = detectUncrawledPages(allPaginationLinks, crawledPages);
                if (uncrawled.length > 0) {
                    currentUrl = uncrawled[0];
                } else {
                    state.termination_reason = 'no_next_link';
                    break;
                }
            }

        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            sources.push({
                url: currentUrl,
                timestamp: new Date().toISOString(),
                http_status: 0,
                error: errMsg,
            });

            return {
                success: false,
                error: `Failed to crawl ${currentUrl}: ${errMsg}`,
                sources,
            };
        }
    }

    // FAIL-CLOSED: Check if we missed any pages
    const uncrawledPages = detectUncrawledPages(allPaginationLinks, crawledPages);
    if (uncrawledPages.length > 0) {
        console.log(`[Layer A] WARNING: ${uncrawledPages.length} pages not crawled!`);
        return {
            success: false,
            error: `INCOMPLETE: ${uncrawledPages.length} pages not crawled: ${uncrawledPages.slice(0, 3).join(', ')}...`,
            sources,
            data: { series: allSeries, state },
        };
    }

    console.log(`[Layer A] Complete: ${allSeries.length} series from ${state.pages_crawled} pages`);
    state.termination_reason = state.termination_reason || 'complete';

    return {
        success: true,
        data: { series: allSeries, state },
        sources,
    };
}

// Export for testing
export { parseSeriesCards, detectPaginationLinks, contentHash };

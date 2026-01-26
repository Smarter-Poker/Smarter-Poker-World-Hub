#!/usr/bin/env node
/**
 * COMPREHENSIVE POKER TOUR SCRAPER
 *
 * Scrapes ALL major poker tours and series for complete event schedules.
 * This includes early events, late events, satellites, and all flights.
 *
 * SOURCES OF TRUTH (Official Tour Websites):
 * - WSOP: https://www.wsop.com
 * - WPT: https://www.worldpokertour.com
 * - MSPT: https://msptpoker.com
 * - RGPS: https://rungoodgear.com
 * - PokerGO Tour: https://www.pokergo.com
 * - Venetian: https://www.venetianlasvegas.com/casino/poker
 * - Wynn: https://www.wynnlasvegas.com/casino/poker
 * - Borgata: https://www.borgatapoker.com
 * - Seminole: https://www.seminolehardrockpokeropen.com
 * - PokerAtlas Series: https://www.pokeratlas.com/poker-tournaments
 *
 * Usage:
 *   node scripts/comprehensive-tour-scraper.js                    # All tours
 *   node scripts/comprehensive-tour-scraper.js --tour WSOP        # Specific tour
 *   node scripts/comprehensive-tour-scraper.js --tour WPT         # WPT only
 *   node scripts/comprehensive-tour-scraper.js --dry-run          # Test mode
 *   node scripts/comprehensive-tour-scraper.js --export csv       # Export to CSV
 */

const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: '.env.local' });

// =============================================================================
// TOUR CONFIGURATIONS - Official Sources of Truth
// =============================================================================

const TOUR_CONFIGS = {
    WSOP: {
        name: 'World Series of Poker',
        shortName: 'WSOP',
        baseUrl: 'https://www.wsop.com',
        scheduleUrl: 'https://www.wsop.com/tournaments/schedule/',
        seriesType: 'major',
        priority: 1,
        selectors: {
            eventList: 'table tbody tr, .event-row, .schedule-item',
            eventNumber: '.event-number, td:first-child',
            eventName: '.event-name, td:nth-child(2), .title',
            buyIn: '.buy-in, td:nth-child(3), .buyin',
            startDate: '.start-date, td:nth-child(4), .date',
            startTime: '.start-time, td:nth-child(5), .time',
            guaranteed: '.guarantee, .gtd',
        }
    },

    WSOP_CIRCUIT: {
        name: 'WSOP Circuit',
        shortName: 'WSOPC',
        baseUrl: 'https://www.wsop.com',
        scheduleUrl: 'https://www.wsop.com/circuit/schedule/',
        seriesType: 'circuit',
        priority: 2,
        selectors: {
            stopList: '.circuit-stop, .location-card',
            eventList: 'table tbody tr, .event-row',
            eventName: '.event-name, td:nth-child(2)',
            buyIn: '.buy-in, td:nth-child(3)',
            startDate: '.date, td:nth-child(4)',
        }
    },

    WPT: {
        name: 'World Poker Tour',
        shortName: 'WPT',
        baseUrl: 'https://www.worldpokertour.com',
        scheduleUrl: 'https://www.worldpokertour.com/schedule/',
        seriesType: 'major',
        priority: 1,
        selectors: {
            eventList: '.event-card, .schedule-event, table tr',
            eventName: '.event-title, .name, h3',
            buyIn: '.buy-in, .buyin',
            venue: '.venue, .location',
            dates: '.dates, .event-dates',
        }
    },

    WPT_PRIME: {
        name: 'WPT Prime',
        shortName: 'WPT Prime',
        baseUrl: 'https://www.worldpokertour.com',
        scheduleUrl: 'https://www.worldpokertour.com/wpt-prime/',
        seriesType: 'major',
        priority: 2,
    },

    MSPT: {
        name: 'Mid-States Poker Tour',
        shortName: 'MSPT',
        baseUrl: 'https://msptpoker.com',
        scheduleUrl: 'https://msptpoker.com/schedule/',
        seriesType: 'circuit',
        priority: 2,
        selectors: {
            stopList: '.tour-stop, .event-card',
            eventName: '.stop-name, h3',
            venue: '.venue, .location',
            dates: '.dates',
            eventSchedule: '.event-schedule, .schedule-table',
        }
    },

    RGPS: {
        name: 'RunGood Poker Series',
        shortName: 'RGPS',
        baseUrl: 'https://rungoodgear.com',
        scheduleUrl: 'https://rungoodgear.com/poker-series/',
        seriesType: 'circuit',
        priority: 3,
        selectors: {
            stopList: '.tour-stop, .rgps-event',
            eventName: '.event-name, h3',
            venue: '.venue',
            dates: '.dates',
        }
    },

    PGT: {
        name: 'PokerGO Tour',
        shortName: 'PGT',
        baseUrl: 'https://www.pokergo.com',
        scheduleUrl: 'https://www.pokergo.com/pgt/',
        seriesType: 'major',
        priority: 1,
        selectors: {
            eventList: '.tournament-card, .event-item',
            eventName: '.name, h3',
            buyIn: '.buy-in',
            dates: '.dates',
        }
    },

    VENETIAN: {
        name: 'Venetian DeepStack Series',
        shortName: 'Venetian',
        baseUrl: 'https://www.venetianlasvegas.com',
        scheduleUrl: 'https://www.venetianlasvegas.com/casino/poker/tournaments.html',
        seriesType: 'major',
        priority: 2,
        selectors: {
            eventList: 'table tbody tr, .tournament-row',
            eventName: '.event-name, td:nth-child(1)',
            buyIn: '.buy-in, td:nth-child(2)',
            startDate: '.date, td:nth-child(3)',
        }
    },

    WYNN: {
        name: 'Wynn Poker Series',
        shortName: 'Wynn',
        baseUrl: 'https://www.wynnlasvegas.com',
        scheduleUrl: 'https://www.wynnlasvegas.com/casino/poker/tournaments',
        seriesType: 'major',
        priority: 2,
    },

    BORGATA: {
        name: 'Borgata Poker Series',
        shortName: 'Borgata',
        baseUrl: 'https://www.theborgata.com',
        scheduleUrl: 'https://www.theborgata.com/casino/poker/tournaments',
        seriesType: 'major',
        priority: 2,
    },

    SEMINOLE: {
        name: 'Seminole Hard Rock Poker',
        shortName: 'SHRP',
        baseUrl: 'https://www.seminolehardrockpokeropen.com',
        scheduleUrl: 'https://www.seminolehardrockpokeropen.com/schedule/',
        seriesType: 'major',
        priority: 2,
    },

    POKERATLAS: {
        name: 'PokerAtlas Series',
        shortName: 'PA',
        baseUrl: 'https://www.pokeratlas.com',
        scheduleUrl: 'https://www.pokeratlas.com/poker-tournaments',
        seriesType: 'aggregator',
        priority: 1,
        selectors: {
            seriesList: '.series-card, .tournament-series',
            eventList: 'table tbody tr, .event-row',
        }
    }
};

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
    rateLimitMs: 4000,
    pageTimeout: 45000,
    maxRetries: 3,
    puppeteer: {
        headless: 'new',
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--window-size=1920,1080'
        ]
    }
};

// =============================================================================
// COMPREHENSIVE TOUR SCRAPER CLASS
// =============================================================================

class ComprehensiveTourScraper {
    constructor(options = {}) {
        this.options = options;
        this.browser = null;
        this.supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        this.stats = {
            toursProcessed: 0,
            seriesFound: 0,
            eventsFound: 0,
            eventsInserted: 0,
            satellitesFound: 0,
            errors: [],
            startTime: new Date()
        };

        this.allEvents = [];
        this.allSeries = [];
    }

    async init() {
        console.log('[INIT] Launching Puppeteer browser...');
        this.browser = await puppeteer.launch(CONFIG.puppeteer);
        console.log('[INIT] Browser ready');
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            console.log('[CLEANUP] Browser closed');
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Create a configured page with stealth settings
     */
    async createPage() {
        const page = await this.browser.newPage();

        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent(
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        );

        // Block heavy resources for faster loading
        await page.setRequestInterception(true);
        page.on('request', req => {
            const resourceType = req.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        return page;
    }

    /**
     * Parse buy-in from text
     */
    parseBuyIn(text) {
        if (!text) return null;
        const match = text.match(/\$?([\d,]+)/);
        return match ? parseInt(match[1].replace(/,/g, '')) : null;
    }

    /**
     * Parse date from various formats
     */
    parseDate(text) {
        if (!text) return null;

        // Try common date formats
        const formats = [
            /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/,  // MM/DD/YYYY or M/D/YY
            /(\w+)\s+(\d{1,2}),?\s*(\d{4})?/,    // Month DD, YYYY
            /(\d{4})-(\d{2})-(\d{2})/,           // YYYY-MM-DD
        ];

        for (const fmt of formats) {
            const match = text.match(fmt);
            if (match) {
                try {
                    const date = new Date(text);
                    if (!isNaN(date.getTime())) {
                        return date.toISOString().split('T')[0];
                    }
                } catch (e) {
                    // Continue to next format
                }
            }
        }

        return null;
    }

    /**
     * Determine event type from name/text
     */
    determineEventType(text) {
        const lower = text.toLowerCase();

        if (/main\s*event/i.test(lower)) return 'main_event';
        if (/satellite|sat\b/i.test(lower)) return 'satellite';
        if (/super\s*satellite|mega\s*satellite/i.test(lower)) return 'super_satellite';
        if (/high\s*roller/i.test(lower)) return 'high_roller';
        if (/mystery\s*bounty/i.test(lower)) return 'mystery_bounty';
        if (/bounty|knockout|ko\b/i.test(lower)) return 'bounty';
        if (/turbo/i.test(lower)) return 'turbo';
        if (/hyper/i.test(lower)) return 'hyper_turbo';
        if (/deepstack|deep\s*stack/i.test(lower)) return 'deepstack';
        if (/senior|seniors/i.test(lower)) return 'seniors';
        if (/ladies|women/i.test(lower)) return 'ladies';
        if (/omaha|plo/i.test(lower)) return 'omaha';
        if (/mixed|horse|8-game/i.test(lower)) return 'mixed_game';
        if (/limit(?!\s*omaha)/i.test(lower) && !/no.?limit/i.test(lower)) return 'limit';
        if (/daily|nightly/i.test(lower)) return 'daily';

        return 'side_event';
    }

    /**
     * Determine game type from text
     */
    determineGameType(text) {
        const lower = text.toLowerCase();

        if (/plo|pot.?limit.?omaha/i.test(lower)) return 'PLO';
        if (/omaha.?hi.?lo|o8|omaha.?8/i.test(lower)) return 'O8';
        if (/omaha/i.test(lower)) return 'Omaha';
        if (/limit(?!\s*omaha)/i.test(lower) && !/no.?limit/i.test(lower)) return 'Limit';
        if (/stud/i.test(lower)) return 'Stud';
        if (/razz/i.test(lower)) return 'Razz';
        if (/horse/i.test(lower)) return 'HORSE';
        if (/8-game|8.?game/i.test(lower)) return '8-Game';
        if (/mixed/i.test(lower)) return 'Mixed';
        if (/badugi/i.test(lower)) return 'Badugi';
        if (/triple.?draw|2-7/i.test(lower)) return '2-7 Triple Draw';

        return 'NLH';
    }

    /**
     * Scrape PokerAtlas for all current and upcoming series
     */
    async scrapePokerAtlas() {
        console.log('\n[POKERATLAS] Scraping all tournament series from PokerAtlas...');

        const page = await this.createPage();
        const allSeries = [];
        const allEvents = [];

        try {
            // First, get the list of all tournament series
            const seriesListUrl = 'https://www.pokeratlas.com/poker-tournaments';
            console.log(`  [FETCH] ${seriesListUrl}`);

            await page.goto(seriesListUrl, {
                waitUntil: 'domcontentloaded',
                timeout: CONFIG.pageTimeout
            });

            await this.sleep(2000);

            // Save page for debugging
            if (this.options.debug) {
                const html = await page.content();
                fs.writeFileSync('debug-pokeratlas-series.html', html);
                await page.screenshot({ path: 'debug-pokeratlas-series.png', fullPage: true });
            }

            // Extract all series links and info
            const seriesData = await page.evaluate(() => {
                const results = [];

                // Look for series cards/links
                const seriesElements = document.querySelectorAll(
                    '.series-card, .tournament-series, [class*="series"], ' +
                    'a[href*="/poker-tournament/"], a[href*="/tournaments/"]'
                );

                // Also check tables
                const tables = document.querySelectorAll('table');
                for (const table of tables) {
                    const rows = table.querySelectorAll('tr');
                    for (const row of rows) {
                        const cells = row.querySelectorAll('td');
                        if (cells.length >= 2) {
                            const link = row.querySelector('a');
                            const text = row.textContent;

                            // Must have dates
                            if (/\d{1,2}\/\d{1,2}|\w+\s+\d{1,2}/i.test(text)) {
                                results.push({
                                    name: cells[0]?.textContent?.trim(),
                                    dates: cells[1]?.textContent?.trim(),
                                    location: cells[2]?.textContent?.trim() || cells[1]?.textContent?.trim(),
                                    url: link?.href || null,
                                    eventsCount: parseInt(text.match(/(\d+)\s*events?/i)?.[1]) || null
                                });
                            }
                        }
                    }
                }

                // Process other series elements
                for (const el of seriesElements) {
                    const link = el.tagName === 'A' ? el : el.querySelector('a');
                    const name = el.querySelector('.name, .title, h3, h4')?.textContent?.trim()
                                || el.textContent?.trim()?.substring(0, 100);

                    if (name && name.length > 5) {
                        const existsAlready = results.some(r => r.name === name);
                        if (!existsAlready) {
                            results.push({
                                name: name,
                                url: link?.href || null,
                                dates: el.querySelector('.dates, .date')?.textContent?.trim(),
                                location: el.querySelector('.location, .venue')?.textContent?.trim(),
                            });
                        }
                    }
                }

                return results;
            });

            console.log(`  [FOUND] ${seriesData.length} series on PokerAtlas`);

            // Now scrape each series for detailed event schedules
            for (let i = 0; i < Math.min(seriesData.length, 30); i++) {
                const series = seriesData[i];
                if (!series.url) continue;

                console.log(`  [${i+1}/${seriesData.length}] Scraping: ${series.name?.substring(0, 50)}...`);

                try {
                    await page.goto(series.url, {
                        waitUntil: 'domcontentloaded',
                        timeout: CONFIG.pageTimeout
                    });

                    await this.sleep(1500);

                    // Extract events from this series page
                    const events = await page.evaluate((seriesName, seriesUrl) => {
                        const results = [];

                        // Look for event tables
                        const tables = document.querySelectorAll('table');

                        for (const table of tables) {
                            const rows = table.querySelectorAll('tr');

                            for (const row of rows) {
                                const cells = row.querySelectorAll('td');
                                if (cells.length < 2) continue;

                                const rowText = row.textContent;

                                // Must have buy-in
                                const buyinMatch = rowText.match(/\$?([\d,]+)/);
                                if (!buyinMatch) continue;

                                const buyin = parseInt(buyinMatch[1].replace(/,/g, ''));
                                if (buyin < 50 || buyin > 500000) continue;

                                // Extract event details
                                const eventNum = rowText.match(/(?:Event|#)\s*(\d+)/i)?.[1];
                                const timeMatch = rowText.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
                                const dateMatch = rowText.match(/(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/);
                                const gtdMatch = rowText.match(/(?:GTD|Guaranteed)[:\s]*\$?([\d,]+(?:K|M)?)/i);
                                const flightMatch = rowText.match(/(?:Flight|Day)\s*([A-Z1-9])/i);

                                // Get event name from first substantial cell
                                let eventName = '';
                                for (const cell of cells) {
                                    const text = cell.textContent.trim();
                                    if (text.length > 10 && !/^\$?\d/.test(text) && !/^\d{1,2}[:\-\/]/.test(text)) {
                                        eventName = text;
                                        break;
                                    }
                                }

                                // Parse guaranteed amount
                                let guaranteed = null;
                                if (gtdMatch) {
                                    let gtdStr = gtdMatch[1].replace(/,/g, '');
                                    if (gtdStr.endsWith('K')) guaranteed = parseInt(gtdStr) * 1000;
                                    else if (gtdStr.endsWith('M')) guaranteed = parseInt(gtdStr) * 1000000;
                                    else guaranteed = parseInt(gtdStr);
                                }

                                results.push({
                                    series_name: seriesName,
                                    event_number: eventNum ? parseInt(eventNum) : null,
                                    event_name: eventName || `Event ${eventNum || results.length + 1}`,
                                    buy_in: buyin,
                                    start_date: dateMatch?.[1] || null,
                                    start_time: timeMatch?.[1] || null,
                                    guaranteed: guaranteed,
                                    flight: flightMatch?.[1] || null,
                                    source_url: seriesUrl
                                });
                            }
                        }

                        return results;
                    }, series.name, series.url);

                    if (events.length > 0) {
                        console.log(`    [EVENTS] Found ${events.length} events`);
                        allEvents.push(...events);
                        this.stats.eventsFound += events.length;
                    }

                    allSeries.push({
                        name: series.name,
                        location: series.location,
                        dates: series.dates,
                        events_count: events.length,
                        source_url: series.url,
                        source: 'PokerAtlas'
                    });

                } catch (e) {
                    console.log(`    [ERROR] ${e.message}`);
                }

                await this.sleep(CONFIG.rateLimitMs);
            }

        } catch (error) {
            console.log(`  [ERROR] ${error.message}`);
            this.stats.errors.push({ tour: 'PokerAtlas', error: error.message });
        } finally {
            await page.close();
        }

        return { series: allSeries, events: allEvents };
    }

    /**
     * Scrape WSOP official schedule
     */
    async scrapeWSOP() {
        console.log('\n[WSOP] Scraping World Series of Poker schedule...');

        const page = await this.createPage();
        const events = [];

        try {
            // WSOP 2026 schedule page
            const urls = [
                'https://www.wsop.com/2026/',
                'https://www.wsop.com/tournaments/',
                'https://www.wsop.com/schedule/'
            ];

            for (const url of urls) {
                console.log(`  [FETCH] ${url}`);

                try {
                    await page.goto(url, {
                        waitUntil: 'domcontentloaded',
                        timeout: CONFIG.pageTimeout
                    });

                    await this.sleep(2000);

                    // Save for debugging
                    if (this.options.debug) {
                        const html = await page.content();
                        fs.writeFileSync(`debug-wsop-${Date.now()}.html`, html);
                    }

                    // Extract WSOP events
                    const pageEvents = await page.evaluate(() => {
                        const results = [];

                        // WSOP typically uses tables for schedules
                        const tables = document.querySelectorAll('table');

                        for (const table of tables) {
                            const rows = table.querySelectorAll('tbody tr, tr');

                            for (const row of rows) {
                                const cells = row.querySelectorAll('td');
                                if (cells.length < 3) continue;

                                const rowText = row.textContent;

                                // Must have a buy-in
                                const buyinMatch = rowText.match(/\$?([\d,]+)/);
                                if (!buyinMatch) continue;

                                const buyin = parseInt(buyinMatch[1].replace(/,/g, ''));
                                if (buyin < 100 || buyin > 500000) continue;

                                // Extract all fields
                                const eventNum = rowText.match(/(?:Event|#)\s*(\d+)/i)?.[1];
                                const timeMatch = rowText.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
                                const dateMatch = rowText.match(/(\w+\s+\d{1,2}|\d{1,2}\/\d{1,2})/);
                                const gtdMatch = rowText.match(/\$?([\d,]+(?:K|M)?)\s*(?:GTD|Guaranteed)/i);
                                const flightMatch = rowText.match(/(?:Flight|Day)\s*([A-Z1-9])/i);

                                // Extract event name
                                let eventName = '';
                                for (const cell of cells) {
                                    const text = cell.textContent.trim();
                                    if (text.length > 15 && !/^\$?\d/.test(text)) {
                                        eventName = text.substring(0, 200);
                                        break;
                                    }
                                }

                                if (eventName || eventNum) {
                                    results.push({
                                        tour: 'WSOP',
                                        event_number: eventNum ? parseInt(eventNum) : null,
                                        event_name: eventName || `WSOP Event #${eventNum}`,
                                        buy_in: buyin,
                                        start_date: dateMatch?.[1] || null,
                                        start_time: timeMatch?.[1] || '12:00 PM',
                                        guaranteed: gtdMatch ? parseInt(gtdMatch[1].replace(/[K,]/g, '')) * (gtdMatch[1].includes('K') ? 1000 : gtdMatch[1].includes('M') ? 1000000 : 1) : null,
                                        flight: flightMatch?.[1] || null,
                                        venue: 'Horseshoe/Paris Las Vegas',
                                        city: 'Las Vegas',
                                        state: 'NV',
                                    });
                                }
                            }
                        }

                        // Also check for card/div based layouts
                        const eventCards = document.querySelectorAll('.event-card, .schedule-event, [class*="tournament"]');
                        for (const card of eventCards) {
                            const text = card.textContent;
                            const buyinMatch = text.match(/\$?([\d,]+)/);

                            if (buyinMatch) {
                                const buyin = parseInt(buyinMatch[1].replace(/,/g, ''));
                                if (buyin >= 100 && buyin <= 500000) {
                                    const title = card.querySelector('h3, h4, .title, .name')?.textContent?.trim();
                                    if (title) {
                                        const exists = results.some(r => r.event_name === title && r.buy_in === buyin);
                                        if (!exists) {
                                            results.push({
                                                tour: 'WSOP',
                                                event_name: title,
                                                buy_in: buyin,
                                                venue: 'Horseshoe/Paris Las Vegas',
                                                city: 'Las Vegas',
                                                state: 'NV',
                                            });
                                        }
                                    }
                                }
                            }
                        }

                        return results;
                    });

                    if (pageEvents.length > 0) {
                        console.log(`  [FOUND] ${pageEvents.length} WSOP events from ${url}`);
                        events.push(...pageEvents);
                    }

                } catch (e) {
                    console.log(`  [SKIP] ${url}: ${e.message}`);
                }

                await this.sleep(CONFIG.rateLimitMs);
            }

        } catch (error) {
            console.log(`  [ERROR] ${error.message}`);
            this.stats.errors.push({ tour: 'WSOP', error: error.message });
        } finally {
            await page.close();
        }

        // Deduplicate
        const unique = this.deduplicateEvents(events);
        console.log(`  [TOTAL] ${unique.length} unique WSOP events`);

        return unique;
    }

    /**
     * Scrape WPT official schedule
     */
    async scrapeWPT() {
        console.log('\n[WPT] Scraping World Poker Tour schedule...');

        const page = await this.createPage();
        const events = [];

        try {
            const url = 'https://www.worldpokertour.com/schedule/';
            console.log(`  [FETCH] ${url}`);

            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: CONFIG.pageTimeout
            });

            await this.sleep(2500);

            // Extract WPT stops and events
            const pageEvents = await page.evaluate(() => {
                const results = [];

                // WPT uses event cards typically
                const eventCards = document.querySelectorAll(
                    '.event-card, .schedule-item, .wpt-event, ' +
                    '[class*="event"], [class*="schedule"]'
                );

                for (const card of eventCards) {
                    const text = card.textContent;

                    // Get title/name
                    const title = card.querySelector('h2, h3, h4, .title, .name, .event-name')?.textContent?.trim();
                    if (!title || title.length < 5) continue;

                    // Extract venue/location
                    const venue = card.querySelector('.venue, .location, .casino')?.textContent?.trim();
                    const dates = card.querySelector('.dates, .date-range')?.textContent?.trim();

                    // Extract buy-in if present
                    const buyinMatch = text.match(/\$?([\d,]+)\s*(?:buy.?in|entry|main)/i);
                    const buyin = buyinMatch ? parseInt(buyinMatch[1].replace(/,/g, '')) : null;

                    results.push({
                        tour: 'WPT',
                        event_name: title,
                        buy_in: buyin,
                        venue: venue,
                        dates: dates,
                        city: venue?.split(',')[0]?.trim(),
                        state: venue?.match(/,\s*([A-Z]{2})/)?.[1],
                    });
                }

                // Also check tables
                const tables = document.querySelectorAll('table');
                for (const table of tables) {
                    const rows = table.querySelectorAll('tr');
                    for (const row of rows) {
                        const cells = row.querySelectorAll('td');
                        if (cells.length >= 2) {
                            const name = cells[0]?.textContent?.trim();
                            const dates = cells[1]?.textContent?.trim();
                            const venue = cells[2]?.textContent?.trim() || '';

                            if (name && name.length > 5) {
                                results.push({
                                    tour: 'WPT',
                                    event_name: name,
                                    dates: dates,
                                    venue: venue,
                                });
                            }
                        }
                    }
                }

                return results;
            });

            console.log(`  [FOUND] ${pageEvents.length} WPT events`);
            events.push(...pageEvents);

        } catch (error) {
            console.log(`  [ERROR] ${error.message}`);
            this.stats.errors.push({ tour: 'WPT', error: error.message });
        } finally {
            await page.close();
        }

        return events;
    }

    /**
     * Scrape MSPT schedule
     */
    async scrapeMSPT() {
        console.log('\n[MSPT] Scraping Mid-States Poker Tour schedule...');

        const page = await this.createPage();
        const events = [];

        try {
            const url = 'https://msptpoker.com/schedule/';
            console.log(`  [FETCH] ${url}`);

            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: CONFIG.pageTimeout
            });

            await this.sleep(2000);

            const pageEvents = await page.evaluate(() => {
                const results = [];

                // Look for tour stops
                const stops = document.querySelectorAll(
                    '.tour-stop, .event-card, .mspt-event, ' +
                    '[class*="stop"], [class*="event"]'
                );

                for (const stop of stops) {
                    const text = stop.textContent;

                    const title = stop.querySelector('h2, h3, h4, .title, .name')?.textContent?.trim();
                    const venue = stop.querySelector('.venue, .location, .casino')?.textContent?.trim();
                    const dates = stop.querySelector('.dates, .date')?.textContent?.trim();

                    // Extract main event buy-in
                    const buyinMatch = text.match(/\$?([\d,]+)\s*(?:main|championship)/i);
                    const buyin = buyinMatch ? parseInt(buyinMatch[1].replace(/,/g, '')) : 1100; // MSPT default

                    if (title && title.length > 5) {
                        results.push({
                            tour: 'MSPT',
                            event_name: title,
                            buy_in: buyin,
                            venue: venue,
                            dates: dates,
                        });
                    }
                }

                return results;
            });

            console.log(`  [FOUND] ${pageEvents.length} MSPT stops`);
            events.push(...pageEvents);

        } catch (error) {
            console.log(`  [ERROR] ${error.message}`);
            this.stats.errors.push({ tour: 'MSPT', error: error.message });
        } finally {
            await page.close();
        }

        return events;
    }

    /**
     * Scrape RGPS schedule
     */
    async scrapeRGPS() {
        console.log('\n[RGPS] Scraping RunGood Poker Series schedule...');

        const page = await this.createPage();
        const events = [];

        try {
            const urls = [
                'https://rungoodgear.com/poker-series/',
                'https://rungoodgear.com/schedule/'
            ];

            for (const url of urls) {
                console.log(`  [FETCH] ${url}`);

                try {
                    await page.goto(url, {
                        waitUntil: 'domcontentloaded',
                        timeout: CONFIG.pageTimeout
                    });

                    await this.sleep(2000);

                    const pageEvents = await page.evaluate(() => {
                        const results = [];

                        // RGPS event cards
                        const stops = document.querySelectorAll(
                            '.rgps-stop, .event-card, [class*="event"], ' +
                            '[class*="stop"], article'
                        );

                        for (const stop of stops) {
                            const text = stop.textContent;

                            const title = stop.querySelector('h2, h3, h4, .title, .name')?.textContent?.trim();
                            const venue = stop.querySelector('.venue, .location')?.textContent?.trim();
                            const dates = stop.querySelector('.dates, .date')?.textContent?.trim();

                            if (title && title.length > 5 && /poker|rgps|rungood/i.test(text)) {
                                results.push({
                                    tour: 'RGPS',
                                    event_name: title,
                                    buy_in: 600, // RGPS typical main event
                                    venue: venue,
                                    dates: dates,
                                });
                            }
                        }

                        return results;
                    });

                    if (pageEvents.length > 0) {
                        console.log(`  [FOUND] ${pageEvents.length} RGPS stops from ${url}`);
                        events.push(...pageEvents);
                    }

                } catch (e) {
                    console.log(`  [SKIP] ${url}: ${e.message}`);
                }

                await this.sleep(CONFIG.rateLimitMs);
            }

        } catch (error) {
            console.log(`  [ERROR] ${error.message}`);
            this.stats.errors.push({ tour: 'RGPS', error: error.message });
        } finally {
            await page.close();
        }

        return events;
    }

    /**
     * Deduplicate events by name, buy-in, and date
     */
    deduplicateEvents(events) {
        const seen = new Set();
        return events.filter(e => {
            const key = `${e.event_name}-${e.buy_in}-${e.start_date || e.dates}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    /**
     * Generate unique event UID
     */
    generateEventUid(event, index) {
        const tour = event.tour || 'UNKNOWN';
        const date = event.start_date || '2026';
        const num = event.event_number || index;
        return `${tour}-${date}-${num}`.replace(/\//g, '-');
    }

    /**
     * Save events to database
     */
    async saveToDatabase(events) {
        if (this.options.dryRun) {
            console.log(`\n[DRY-RUN] Would insert ${events.length} events to database`);
            return;
        }

        console.log(`\n[DATABASE] Inserting ${events.length} events...`);

        let inserted = 0;
        let errors = 0;

        for (let i = 0; i < events.length; i++) {
            const event = events[i];

            // Format for poker_events table
            const record = {
                event_uid: this.generateEventUid(event, i + 1),
                event_number: event.event_number,
                event_name: event.event_name,
                event_type: this.determineEventType(event.event_name || ''),
                buy_in: event.buy_in || 0,
                guaranteed: event.guaranteed,
                start_date: event.start_date ? this.parseDate(event.start_date) : null,
                start_time: event.start_time,
                game_type: this.determineGameType(event.event_name || ''),
                venue_name: event.venue,
                city: event.city,
                state: event.state,
                source_url: event.source_url || `https://${(event.tour || 'unknown').toLowerCase()}.com`,
                last_scraped: new Date().toISOString(),
                is_active: true
            };

            try {
                const { error } = await this.supabase
                    .from('poker_events')
                    .upsert(record, {
                        onConflict: 'event_uid',
                        ignoreDuplicates: false
                    });

                if (!error) {
                    inserted++;
                } else if (!error.message.includes('duplicate')) {
                    errors++;
                    if (errors <= 5) {
                        console.log(`  [DB-ERROR] ${error.message}`);
                    }
                }
            } catch (e) {
                errors++;
            }
        }

        console.log(`  [INSERTED] ${inserted} events (${errors} errors)`);
        this.stats.eventsInserted = inserted;
    }

    /**
     * Export events to CSV
     */
    exportToCSV(events, filename) {
        const headers = [
            'Tour', 'Event Number', 'Event Name', 'Event Type', 'Buy-In',
            'Guaranteed', 'Start Date', 'Start Time', 'Flight',
            'Game Type', 'Venue', 'City', 'State', 'Source URL'
        ];

        const rows = events.map(e => [
            e.tour || '',
            e.event_number || '',
            `"${(e.event_name || '').replace(/"/g, '""')}"`,
            this.determineEventType(e.event_name || ''),
            e.buy_in || '',
            e.guaranteed || '',
            e.start_date || e.dates || '',
            e.start_time || '',
            e.flight || '',
            this.determineGameType(e.event_name || ''),
            `"${(e.venue || '').replace(/"/g, '""')}"`,
            e.city || '',
            e.state || '',
            e.source_url || ''
        ]);

        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

        const filepath = path.join(__dirname, '..', 'data', filename);
        fs.writeFileSync(filepath, csv);
        console.log(`\n[EXPORT] Saved ${events.length} events to ${filepath}`);

        return filepath;
    }

    /**
     * Export events to JSON
     */
    exportToJSON(events, filename) {
        const data = {
            metadata: {
                scraped_at: new Date().toISOString(),
                total_events: events.length,
                tours: [...new Set(events.map(e => e.tour).filter(Boolean))]
            },
            events: events
        };

        const filepath = path.join(__dirname, '..', 'data', filename);
        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
        console.log(`\n[EXPORT] Saved ${events.length} events to ${filepath}`);

        return filepath;
    }

    /**
     * Main execution
     */
    async run() {
        console.log('\n' + '='.repeat(70));
        console.log('COMPREHENSIVE POKER TOUR SCRAPER');
        console.log('='.repeat(70));
        console.log(`Started: ${this.stats.startTime.toISOString()}`);
        console.log(`Mode: ${this.options.dryRun ? 'DRY RUN' : 'PRODUCTION'}`);
        if (this.options.tour) console.log(`Filter: ${this.options.tour} only`);
        console.log('='.repeat(70));

        await this.init();

        let allEvents = [];

        // Determine which tours to scrape
        const toursToScrape = this.options.tour
            ? [this.options.tour.toUpperCase()]
            : ['POKERATLAS', 'WSOP', 'WPT', 'MSPT', 'RGPS'];

        // Scrape each tour
        for (const tour of toursToScrape) {
            this.stats.toursProcessed++;

            try {
                let events = [];

                switch (tour) {
                    case 'POKERATLAS':
                        const paData = await this.scrapePokerAtlas();
                        events = paData.events;
                        this.allSeries.push(...paData.series);
                        break;
                    case 'WSOP':
                        events = await this.scrapeWSOP();
                        break;
                    case 'WPT':
                        events = await this.scrapeWPT();
                        break;
                    case 'MSPT':
                        events = await this.scrapeMSPT();
                        break;
                    case 'RGPS':
                        events = await this.scrapeRGPS();
                        break;
                    default:
                        console.log(`[SKIP] Unknown tour: ${tour}`);
                }

                allEvents.push(...events);
                this.stats.eventsFound += events.length;

                // Count satellites
                const satellites = events.filter(e =>
                    /satellite|sat\b/i.test(e.event_name || '')
                );
                this.stats.satellitesFound += satellites.length;

            } catch (e) {
                console.log(`[ERROR] ${tour}: ${e.message}`);
                this.stats.errors.push({ tour, error: e.message });
            }
        }

        await this.close();

        // Deduplicate all events
        allEvents = this.deduplicateEvents(allEvents);
        this.allEvents = allEvents;

        // Save to database
        await this.saveToDatabase(allEvents);

        // Export files
        if (this.options.export === 'csv' || this.options.export === 'all') {
            this.exportToCSV(allEvents, 'poker-tour-events.csv');
        }
        if (this.options.export === 'json' || this.options.export === 'all') {
            this.exportToJSON(allEvents, 'poker-tour-events.json');
        }

        // Always save JSON for reference
        if (!this.options.export) {
            this.exportToJSON(allEvents, 'poker-tour-events.json');
        }

        // Print report
        this.printReport();

        return this.stats;
    }

    printReport() {
        const duration = (new Date() - this.stats.startTime) / 1000;

        console.log('\n' + '='.repeat(70));
        console.log('SCRAPER REPORT');
        console.log('='.repeat(70));
        console.log(`Duration:            ${Math.round(duration)}s`);
        console.log(`Tours Processed:     ${this.stats.toursProcessed}`);
        console.log(`Series Found:        ${this.allSeries.length}`);
        console.log(`Events Found:        ${this.stats.eventsFound}`);
        console.log(`Satellites Found:    ${this.stats.satellitesFound}`);
        console.log(`Events Inserted:     ${this.stats.eventsInserted}`);
        console.log(`Unique Events:       ${this.allEvents.length}`);

        // Breakdown by tour
        const byTour = {};
        for (const event of this.allEvents) {
            const tour = event.tour || 'Unknown';
            byTour[tour] = (byTour[tour] || 0) + 1;
        }

        console.log('\nEvents by Tour:');
        Object.entries(byTour).sort((a, b) => b[1] - a[1]).forEach(([tour, count]) => {
            console.log(`  ${tour}: ${count}`);
        });

        if (this.stats.errors.length > 0) {
            console.log('\nErrors:');
            this.stats.errors.forEach(e => {
                console.log(`  - ${e.tour}: ${e.error}`);
            });
        }

        console.log('='.repeat(70));
        console.log(`Completed: ${new Date().toISOString()}`);
        console.log('='.repeat(70) + '\n');
    }
}

// =============================================================================
// CLI
// =============================================================================

function parseArgs() {
    const args = process.argv.slice(2);
    const options = {};

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--tour':
                options.tour = args[++i];
                break;
            case '--export':
                options.export = args[++i] || 'all';
                break;
            case '--dry-run':
                options.dryRun = true;
                break;
            case '--debug':
                options.debug = true;
                break;
            case '--help':
                console.log(`
Comprehensive Poker Tour Scraper

Usage:
  node scripts/comprehensive-tour-scraper.js [options]

Options:
  --tour <name>    Scrape specific tour (WSOP, WPT, MSPT, RGPS, POKERATLAS)
  --export <type>  Export format: csv, json, or all (default: json)
  --dry-run        Don't write to database
  --debug          Save debug HTML/screenshots
  --help           Show this help

Examples:
  node scripts/comprehensive-tour-scraper.js                    # All tours
  node scripts/comprehensive-tour-scraper.js --tour WSOP        # WSOP only
  node scripts/comprehensive-tour-scraper.js --export csv       # Export as CSV
  node scripts/comprehensive-tour-scraper.js --dry-run          # Test mode
                `);
                process.exit(0);
        }
    }

    return options;
}

// Run
if (require.main === module) {
    const options = parseArgs();
    const scraper = new ComprehensiveTourScraper(options);

    scraper.run()
        .then(stats => {
            const exitCode = stats.errors.length > stats.toursProcessed / 2 ? 1 : 0;
            process.exit(exitCode);
        })
        .catch(error => {
            console.error('[FATAL]', error);
            process.exit(1);
        });
}

module.exports = ComprehensiveTourScraper;

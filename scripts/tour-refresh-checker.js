#!/usr/bin/env node
/**
 * TOUR REFRESH CHECKER
 *
 * Checks all traveling poker tour sources for updates.
 * Designed to run every 3 days via cron or scheduler.
 *
 * Features:
 * - Checks tour_source_registry for tours due for refresh
 * - Scrapes official tour websites for schedule updates
 * - Compares with existing data to detect changes
 * - Updates database with new/modified events
 * - Logs all changes for review
 *
 * Usage:
 *   node scripts/tour-refresh-checker.js                    # Check all due tours
 *   node scripts/tour-refresh-checker.js --tour WSOP        # Check specific tour
 *   node scripts/tour-refresh-checker.js --force            # Force check all tours
 *   node scripts/tour-refresh-checker.js --dry-run          # Preview without changes
 *   node scripts/tour-refresh-checker.js --report           # Generate status report
 *
 * Cron Example (run every 3 days at 3 AM):
 *   0 3 *\/3 * * cd /path/to/project && node scripts/tour-refresh-checker.js >> logs/tour-refresh.log 2>&1
 */

const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: '.env.local' });

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
    rateLimitMs: 4000,
    pageTimeout: 45000,
    maxRetries: 2,
    refreshIntervalDays: 3,
    puppeteer: {
        headless: 'new',
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--window-size=1920,1080'
        ]
    }
};

// Load tour registry
const TOUR_REGISTRY = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'data', 'tour-source-registry.json'), 'utf8')
);

// =============================================================================
// TOUR REFRESH CHECKER CLASS
// =============================================================================

class TourRefreshChecker {
    constructor(options = {}) {
        this.options = options;
        this.browser = null;
        this.supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        this.stats = {
            toursChecked: 0,
            toursUpdated: 0,
            newSeriesFound: 0,
            newEventsFound: 0,
            errors: [],
            changes: [],
            startTime: new Date()
        };
    }

    async init() {
        console.log('[INIT] Tour Refresh Checker starting...');
        console.log(`[INIT] Timestamp: ${this.stats.startTime.toISOString()}`);
        console.log(`[INIT] Mode: ${this.options.dryRun ? 'DRY RUN' : 'PRODUCTION'}`);

        this.browser = await puppeteer.launch(CONFIG.puppeteer);
        console.log('[INIT] Browser ready\n');
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get tours due for refresh from database or registry
     */
    async getToursDueForRefresh() {
        // Try to get from database first
        try {
            const { data, error } = await this.supabase
                .from('tours_due_for_refresh')
                .select('*');

            if (!error && data && data.length > 0) {
                console.log(`[DB] Found ${data.length} tours due for refresh in database`);
                return data;
            }
        } catch (e) {
            console.log('[DB] tours_due_for_refresh view not available, using registry');
        }

        // Fall back to registry file
        const tours = Object.entries(TOUR_REGISTRY.tours)
            .filter(([code, tour]) => {
                if (!tour.is_active && tour.is_active !== undefined) return false;
                if (tour.defunct_year) return false;
                if (this.options.tour && code !== this.options.tour.toUpperCase()) return false;
                return true;
            })
            .map(([code, tour]) => ({
                tour_code: code,
                tour_name: tour.tour_name,
                tour_type: tour.tour_type,
                schedule_url: tour.source_urls?.primary || tour.official_website,
                scrape_method: tour.scrape_config?.method || 'puppeteer',
                refresh_interval_days: tour.refresh_interval_days || 3,
                priority: tour.priority || 99
            }))
            .sort((a, b) => a.priority - b.priority);

        console.log(`[REGISTRY] Found ${tours.length} active tours`);
        return tours;
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

        // Block heavy resources
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
     * Check a single tour for updates
     */
    async checkTour(tour) {
        const tourCode = tour.tour_code;
        const tourConfig = TOUR_REGISTRY.tours[tourCode];

        if (!tourConfig) {
            console.log(`  [SKIP] No config found for ${tourCode}`);
            return { updated: false, error: 'No config' };
        }

        console.log(`\n[${tourCode}] Checking ${tourConfig.tour_name}...`);
        console.log(`  Source: ${tour.schedule_url}`);

        // Skip manual-only tours
        if (tourConfig.scrape_config?.method === 'manual') {
            console.log(`  [SKIP] Manual entry only`);
            return { updated: false, skipped: true };
        }

        const page = await this.createPage();
        let result = { updated: false, changes: [] };

        try {
            // Navigate to schedule page
            await page.goto(tour.schedule_url, {
                waitUntil: 'domcontentloaded',
                timeout: CONFIG.pageTimeout
            });

            await this.sleep(2000);

            // Extract current schedule data
            const currentData = await this.extractScheduleData(page, tourConfig);
            console.log(`  [FOUND] ${currentData.series?.length || 0} series, ${currentData.events?.length || 0} events`);

            // Compare with existing data
            const existingData = await this.getExistingData(tourCode);
            const changes = this.detectChanges(existingData, currentData, tourCode);

            if (changes.length > 0) {
                console.log(`  [CHANGES] Detected ${changes.length} changes:`);
                changes.forEach(c => console.log(`    - ${c.type}: ${c.description}`));

                result.updated = true;
                result.changes = changes;
                this.stats.changes.push(...changes.map(c => ({ ...c, tour: tourCode })));

                // Apply changes if not dry run
                if (!this.options.dryRun) {
                    await this.applyChanges(tourCode, currentData, changes);
                }
            } else {
                console.log(`  [OK] No changes detected`);
            }

            // Update last_checked timestamp
            if (!this.options.dryRun) {
                await this.updateTourCheckTimestamp(tourCode);
            }

            this.stats.toursChecked++;
            if (result.updated) this.stats.toursUpdated++;

        } catch (error) {
            console.log(`  [ERROR] ${error.message}`);
            this.stats.errors.push({ tour: tourCode, error: error.message });
            result.error = error.message;
        } finally {
            await page.close();
        }

        await this.sleep(CONFIG.rateLimitMs);
        return result;
    }

    /**
     * Extract schedule data from a page based on tour config
     */
    async extractScheduleData(page, tourConfig) {
        const selectors = tourConfig.scrape_config?.selectors || {};

        return await page.evaluate((selectors, tourName) => {
            const data = { series: [], events: [] };

            // Extract series/stops
            const stopElements = document.querySelectorAll(
                selectors.stop_list || '.tour-stop, .event-card, .series-card, [class*="stop"], [class*="event"]'
            );

            for (const el of stopElements) {
                const text = el.textContent || '';

                // Must have some identifying info
                if (text.length < 20) continue;

                const title = el.querySelector('h2, h3, h4, .title, .name')?.textContent?.trim();
                const venue = el.querySelector('.venue, .location, .casino')?.textContent?.trim();
                const dates = el.querySelector('.dates, .date, .date-range')?.textContent?.trim();

                if (title && title.length > 3) {
                    data.series.push({
                        name: title,
                        venue: venue,
                        dates: dates,
                        raw_text: text.substring(0, 500)
                    });
                }
            }

            // Extract individual events from tables
            const tables = document.querySelectorAll('table');
            for (const table of tables) {
                const rows = table.querySelectorAll('tbody tr, tr');

                for (const row of rows) {
                    const cells = row.querySelectorAll('td');
                    if (cells.length < 2) continue;

                    const rowText = row.textContent || '';

                    // Must have a buy-in indicator
                    const buyinMatch = rowText.match(/\$?([\d,]+)/);
                    if (!buyinMatch) continue;

                    const buyin = parseInt(buyinMatch[1].replace(/,/g, ''));
                    if (buyin < 50 || buyin > 500000) continue;

                    // Extract event details
                    let eventName = '';
                    for (const cell of cells) {
                        const cellText = cell.textContent?.trim();
                        if (cellText && cellText.length > 10 && !/^\$?\d/.test(cellText)) {
                            eventName = cellText.substring(0, 200);
                            break;
                        }
                    }

                    if (eventName) {
                        const dateMatch = rowText.match(/(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\w+\s+\d{1,2})/);
                        const gtdMatch = rowText.match(/\$?([\d,]+(?:K|M)?)\s*(?:GTD|Guaranteed)/i);

                        data.events.push({
                            name: eventName,
                            buy_in: buyin,
                            date: dateMatch?.[1] || null,
                            guaranteed: gtdMatch?.[1] || null
                        });
                    }
                }
            }

            return data;
        }, selectors, tourConfig.tour_name);
    }

    /**
     * Get existing data for a tour from database
     */
    async getExistingData(tourCode) {
        try {
            // Get existing series
            const { data: series } = await this.supabase
                .from('tournament_series')
                .select('*')
                .ilike('series_uid', `${tourCode}%`);

            // Get existing events
            const { data: events } = await this.supabase
                .from('poker_events')
                .select('*')
                .ilike('event_uid', `${tourCode}%`);

            return {
                series: series || [],
                events: events || []
            };
        } catch (e) {
            return { series: [], events: [] };
        }
    }

    /**
     * Detect changes between existing and current data
     */
    detectChanges(existing, current, tourCode) {
        const changes = [];

        // Check for new series
        const existingSeriesNames = new Set(
            existing.series.map(s => s.name?.toLowerCase() || s.series_name?.toLowerCase())
        );

        for (const series of current.series || []) {
            const normalizedName = series.name?.toLowerCase();
            if (normalizedName && !existingSeriesNames.has(normalizedName)) {
                // Check if it's actually new or just different naming
                const fuzzyMatch = existing.series.some(s =>
                    (s.name || s.series_name || '').toLowerCase().includes(normalizedName.substring(0, 20))
                );

                if (!fuzzyMatch) {
                    changes.push({
                        type: 'new_series',
                        description: `New series: ${series.name}`,
                        data: series
                    });
                    this.stats.newSeriesFound++;
                }
            }
        }

        // Check for new events (simplified comparison)
        const existingEventKeys = new Set(
            existing.events.map(e => `${e.event_name?.toLowerCase()}-${e.buy_in}`)
        );

        for (const event of current.events || []) {
            const key = `${event.name?.toLowerCase()}-${event.buy_in}`;
            if (!existingEventKeys.has(key)) {
                // Check for fuzzy match
                const fuzzyMatch = existing.events.some(e =>
                    e.event_name?.toLowerCase().includes(event.name?.toLowerCase().substring(0, 30)) &&
                    Math.abs((e.buy_in || 0) - (event.buy_in || 0)) < 100
                );

                if (!fuzzyMatch && event.name && event.buy_in) {
                    changes.push({
                        type: 'new_event',
                        description: `New event: ${event.name} ($${event.buy_in})`,
                        data: event
                    });
                    this.stats.newEventsFound++;
                }
            }
        }

        return changes;
    }

    /**
     * Apply detected changes to database
     */
    async applyChanges(tourCode, currentData, changes) {
        console.log(`  [APPLY] Applying ${changes.length} changes...`);

        for (const change of changes) {
            try {
                if (change.type === 'new_series') {
                    const seriesData = {
                        series_uid: `${tourCode}-${Date.now()}`,
                        name: change.data.name,
                        short_name: change.data.name?.substring(0, 30),
                        venue_name: change.data.venue,
                        scrape_url: TOUR_REGISTRY.tours[tourCode]?.source_urls?.primary,
                        scrape_status: 'verified',
                        last_scraped: new Date().toISOString()
                    };

                    const { error } = await this.supabase
                        .from('tournament_series')
                        .insert(seriesData);

                    if (error && !error.message?.includes('duplicate')) {
                        console.log(`    [WARN] Could not insert series: ${error.message}`);
                    }
                }

                if (change.type === 'new_event') {
                    const eventData = {
                        event_uid: `${tourCode}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                        event_name: change.data.name,
                        buy_in: change.data.buy_in,
                        start_date: change.data.date ? this.parseDate(change.data.date) : null,
                        source_url: TOUR_REGISTRY.tours[tourCode]?.source_urls?.primary,
                        last_scraped: new Date().toISOString(),
                        is_active: true
                    };

                    const { error } = await this.supabase
                        .from('poker_events')
                        .insert(eventData);

                    if (error && !error.message?.includes('duplicate')) {
                        console.log(`    [WARN] Could not insert event: ${error.message}`);
                    }
                }
            } catch (e) {
                console.log(`    [ERROR] Failed to apply change: ${e.message}`);
            }
        }
    }

    /**
     * Update tour check timestamp in registry
     */
    async updateTourCheckTimestamp(tourCode) {
        try {
            await this.supabase
                .from('tour_source_registry')
                .update({
                    last_checked_at: new Date().toISOString(),
                    scrape_status: 'active',
                    error_count: 0
                })
                .eq('tour_code', tourCode);
        } catch (e) {
            // Registry table might not exist yet
        }
    }

    /**
     * Parse date from various formats
     */
    parseDate(text) {
        if (!text) return null;

        try {
            // Handle common formats
            const date = new Date(text);
            if (!isNaN(date.getTime())) {
                return date.toISOString().split('T')[0];
            }
        } catch (e) {
            // Continue
        }

        return null;
    }

    /**
     * Generate status report
     */
    async generateReport() {
        console.log('\n' + '='.repeat(70));
        console.log('TOUR SOURCE STATUS REPORT');
        console.log('='.repeat(70));
        console.log(`Generated: ${new Date().toISOString()}\n`);

        // Get all tours from registry
        const tours = Object.entries(TOUR_REGISTRY.tours)
            .filter(([_, t]) => t.is_active !== false && !t.defunct_year)
            .sort((a, b) => (a[1].priority || 99) - (b[1].priority || 99));

        console.log(`Total Active Tours: ${tours.length}\n`);

        // Group by type
        const byType = {};
        tours.forEach(([code, tour]) => {
            const type = tour.tour_type || 'other';
            if (!byType[type]) byType[type] = [];
            byType[type].push({ code, ...tour });
        });

        for (const [type, typeTours] of Object.entries(byType)) {
            console.log(`\n${type.toUpperCase()} (${typeTours.length} tours):`);
            console.log('-'.repeat(50));

            for (const tour of typeTours) {
                const interval = tour.refresh_interval_days || 3;
                const method = tour.scrape_config?.method || 'unknown';
                console.log(`  ${tour.code.padEnd(15)} ${interval}d refresh, ${method}`);
                console.log(`    ${tour.source_urls?.primary || tour.official_website}`);
            }
        }

        // Refresh schedule summary
        console.log('\n' + '='.repeat(70));
        console.log('REFRESH SCHEDULE SUMMARY');
        console.log('='.repeat(70));

        const scheduleGroups = {
            '3-day': tours.filter(([_, t]) => (t.refresh_interval_days || 3) === 3),
            '7-day': tours.filter(([_, t]) => t.refresh_interval_days === 7),
            'manual': tours.filter(([_, t]) => t.scrape_config?.method === 'manual')
        };

        for (const [interval, group] of Object.entries(scheduleGroups)) {
            console.log(`\n${interval} refresh (${group.length} tours):`);
            console.log(`  ${group.map(([c]) => c).join(', ')}`);
        }

        console.log('\n' + '='.repeat(70));
    }

    /**
     * Main execution
     */
    async run() {
        // Generate report only
        if (this.options.report) {
            await this.generateReport();
            return this.stats;
        }

        await this.init();

        console.log('='.repeat(70));
        console.log('TOUR REFRESH CHECK');
        console.log('='.repeat(70));

        // Get tours to check
        let toursDue;
        if (this.options.force) {
            toursDue = await this.getToursDueForRefresh();
            console.log(`[FORCE] Checking all ${toursDue.length} tours`);
        } else if (this.options.tour) {
            toursDue = await this.getToursDueForRefresh();
            console.log(`[FILTER] Checking only ${this.options.tour}`);
        } else {
            toursDue = await this.getToursDueForRefresh();
        }

        // Filter to puppeteer-capable tours (skip manual)
        const toursToCheck = toursDue.filter(t => {
            const config = TOUR_REGISTRY.tours[t.tour_code];
            return config && config.scrape_config?.method !== 'manual';
        });

        console.log(`\nTours to check: ${toursToCheck.length}\n`);

        // Check each tour
        for (const tour of toursToCheck) {
            await this.checkTour(tour);
        }

        await this.close();

        // Print summary
        this.printSummary();

        // Log changes to file
        if (this.stats.changes.length > 0) {
            this.logChanges();
        }

        return this.stats;
    }

    /**
     * Print execution summary
     */
    printSummary() {
        const duration = (new Date() - this.stats.startTime) / 1000;

        console.log('\n' + '='.repeat(70));
        console.log('REFRESH CHECK SUMMARY');
        console.log('='.repeat(70));
        console.log(`Duration:           ${Math.round(duration)}s`);
        console.log(`Tours Checked:      ${this.stats.toursChecked}`);
        console.log(`Tours with Updates: ${this.stats.toursUpdated}`);
        console.log(`New Series Found:   ${this.stats.newSeriesFound}`);
        console.log(`New Events Found:   ${this.stats.newEventsFound}`);
        console.log(`Errors:             ${this.stats.errors.length}`);

        if (this.stats.changes.length > 0) {
            console.log('\nChanges Detected:');
            this.stats.changes.slice(0, 10).forEach(c => {
                console.log(`  [${c.tour}] ${c.type}: ${c.description}`);
            });
            if (this.stats.changes.length > 10) {
                console.log(`  ... and ${this.stats.changes.length - 10} more`);
            }
        }

        if (this.stats.errors.length > 0) {
            console.log('\nErrors:');
            this.stats.errors.forEach(e => {
                console.log(`  [${e.tour}] ${e.error}`);
            });
        }

        console.log('='.repeat(70));
        console.log(`Next scheduled check: ${new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()}`);
        console.log('='.repeat(70) + '\n');
    }

    /**
     * Log changes to file for review
     */
    logChanges() {
        const logsDir = path.join(__dirname, '..', 'logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }

        const logFile = path.join(logsDir, `tour-changes-${new Date().toISOString().split('T')[0]}.json`);

        const logData = {
            timestamp: new Date().toISOString(),
            summary: {
                tours_checked: this.stats.toursChecked,
                tours_updated: this.stats.toursUpdated,
                new_series: this.stats.newSeriesFound,
                new_events: this.stats.newEventsFound
            },
            changes: this.stats.changes,
            errors: this.stats.errors
        };

        fs.writeFileSync(logFile, JSON.stringify(logData, null, 2));
        console.log(`[LOG] Changes logged to ${logFile}`);
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
            case '--force':
                options.force = true;
                break;
            case '--dry-run':
                options.dryRun = true;
                break;
            case '--report':
                options.report = true;
                break;
            case '--help':
                console.log(`
Tour Refresh Checker

Checks all traveling poker tour sources for schedule updates.
Should be run every 3 days.

Usage:
  node scripts/tour-refresh-checker.js [options]

Options:
  --tour <code>  Check specific tour only (WSOP, WPT, MSPT, etc.)
  --force        Force check all tours regardless of schedule
  --dry-run      Preview changes without applying
  --report       Generate status report only
  --help         Show this help

Examples:
  node scripts/tour-refresh-checker.js                   # Check due tours
  node scripts/tour-refresh-checker.js --tour WSOP       # Check WSOP only
  node scripts/tour-refresh-checker.js --force           # Check all tours
  node scripts/tour-refresh-checker.js --dry-run         # Preview mode
  node scripts/tour-refresh-checker.js --report          # Status report

Cron Setup (every 3 days at 3 AM):
  0 3 */3 * * cd /path/to/project && node scripts/tour-refresh-checker.js
                `);
                process.exit(0);
        }
    }

    return options;
}

// Run
if (require.main === module) {
    const options = parseArgs();
    const checker = new TourRefreshChecker(options);

    checker.run()
        .then(stats => {
            const exitCode = stats.errors.length > stats.toursChecked / 2 ? 1 : 0;
            process.exit(exitCode);
        })
        .catch(error => {
            console.error('[FATAL]', error);
            process.exit(1);
        });
}

module.exports = TourRefreshChecker;

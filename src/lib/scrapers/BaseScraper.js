/**
 * Base Scraper Class
 * Foundation for all venue data scrapers
 *
 * Source Priority (from SKILL.md):
 * 1. PokerAtlas (~400 venues) - Primary source
 * 2. Venue official websites (~200 venues)
 * 3. Card Player / Hendon Mob (~50 venues)
 * 4. Web search discovery (~100 venues)
 * 5. Manual entry (~27 venues)
 */

import { createClient } from '@supabase/supabase-js';

export const SOURCE_PRIORITY = {
    POKERATLAS: 1,
    VENUE_WEBSITE: 2,
    CARDPLAYER: 3,
    HENDONMOB: 3,
    WEB_SEARCH: 4,
    MANUAL: 5
};

export const UPDATE_FREQUENCY = {
    POKERATLAS: 'daily',
    VENUE_WEBSITE: 'weekly',
    CARDPLAYER: 'weekly',
    HENDONMOB: 'weekly',
    MANUAL: 'on_request'
};

export class BaseScraper {
    constructor(config = {}) {
        this.sourceName = config.sourceName || 'unknown';
        this.sourcePriority = config.sourcePriority || SOURCE_PRIORITY.MANUAL;
        this.updateFrequency = config.updateFrequency || UPDATE_FREQUENCY.MANUAL;
        this.baseUrl = config.baseUrl || '';
        this.rateLimit = config.rateLimit || 1000; // ms between requests
        this.maxRetries = config.maxRetries || 3;
        this.timeout = config.timeout || 30000;

        // Initialize Supabase client
        this.supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        );

        this.lastRequestTime = 0;
        this.stats = {
            requestCount: 0,
            successCount: 0,
            errorCount: 0,
            venuesFound: 0,
            venuesUpdated: 0,
            venuesCreated: 0
        };
    }

    /**
     * Rate-limited fetch with retry logic
     */
    async fetch(url, options = {}) {
        // Rate limiting
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.rateLimit) {
            await this.sleep(this.rateLimit - timeSinceLastRequest);
        }
        this.lastRequestTime = Date.now();

        // Retry logic
        let lastError;
        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            try {
                this.stats.requestCount++;

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.timeout);

                const response = await fetch(url, {
                    ...options,
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'Smarter.Poker Venue Scraper (+https://smarter.poker)',
                        ...options.headers
                    }
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                this.stats.successCount++;
                return response;

            } catch (error) {
                lastError = error;
                this.stats.errorCount++;

                // Exponential backoff
                if (attempt < this.maxRetries - 1) {
                    await this.sleep(Math.pow(2, attempt) * 1000);
                }
            }
        }

        throw lastError;
    }

    /**
     * Sleep helper
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Log with source prefix
     */
    log(message, level = 'info') {
        const prefix = `[${this.sourceName}]`;
        const timestamp = new Date().toISOString();

        if (level === 'error') {
            console.error(`${timestamp} ${prefix} ERROR: ${message}`);
        } else if (level === 'warn') {
            console.warn(`${timestamp} ${prefix} WARN: ${message}`);
        } else {
            console.log(`${timestamp} ${prefix} ${message}`);
        }
    }

    /**
     * Save or update a venue in the database
     */
    async saveVenue(venueData) {
        try {
            // Check for existing venue by name + city + state
            const { data: existing } = await this.supabase
                .from('poker_venues')
                .select('id, source_priority, last_scraped_at')
                .eq('name', venueData.name)
                .eq('city', venueData.city)
                .eq('state', venueData.state)
                .maybeSingle();

            // Only update if our source has equal or higher priority
            if (existing) {
                if (this.sourcePriority <= (existing.source_priority || 5)) {
                    const { error } = await this.supabase
                        .from('poker_venues')
                        .update({
                            ...venueData,
                            source: this.sourceName,
                            source_priority: this.sourcePriority,
                            last_scraped_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', existing.id);

                    if (error) throw error;
                    this.stats.venuesUpdated++;
                    return { id: existing.id, action: 'updated' };
                } else {
                    this.log(`Skipping update for ${venueData.name} - lower priority source`, 'warn');
                    return { id: existing.id, action: 'skipped' };
                }
            } else {
                // Insert new venue
                const { data, error } = await this.supabase
                    .from('poker_venues')
                    .insert({
                        ...venueData,
                        source: this.sourceName,
                        source_priority: this.sourcePriority,
                        last_scraped_at: new Date().toISOString(),
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .select('id')
                    .maybeSingle();

                if (error) throw error;
                this.stats.venuesCreated++;
                return { id: data.id, action: 'created' };
            }
        } catch (error) {
            this.log(`Error saving venue ${venueData.name}: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Save tournament schedule for a venue
     */
    async saveTournamentSchedule(venueId, tournaments) {
        try {
            // Delete existing future tournaments from this source
            await this.supabase
                .from('venue_tournament_schedules')
                .delete()
                .eq('venue_id', venueId)
                .eq('source', this.sourceName)
                .gte('start_time', new Date().toISOString());

            // Insert new tournaments
            if (tournaments && tournaments.length > 0) {
                const { error } = await this.supabase
                    .from('venue_tournament_schedules')
                    .insert(tournaments.map(t => ({
                        ...t,
                        venue_id: venueId,
                        source: this.sourceName,
                        created_at: new Date().toISOString()
                    })));

                if (error) throw error;
            }

            return { count: tournaments?.length || 0 };
        } catch (error) {
            this.log(`Error saving tournament schedule: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Record scrape run in audit log
     */
    async recordScrapeRun(status, metadata = {}) {
        try {
            await this.supabase
                .from('scraper_runs')
                .insert({
                    source: this.sourceName,
                    status,
                    stats: this.stats,
                    metadata,
                    started_at: this.runStartTime,
                    completed_at: new Date().toISOString()
                });
        } catch (error) {
            this.log(`Error recording scrape run: ${error.message}`, 'error');
        }
    }

    /**
     * Main scrape method - override in subclasses
     */
    async scrape() {
        throw new Error('scrape() must be implemented by subclass');
    }

    /**
     * Run the scraper with logging and error handling
     */
    async run() {
        this.runStartTime = new Date().toISOString();
        this.log(`Starting scrape run`);

        try {
            await this.scrape();
            this.log(`Scrape completed: ${this.stats.venuesCreated} created, ${this.stats.venuesUpdated} updated`);
            await this.recordScrapeRun('success');
            return this.stats;
        } catch (error) {
            this.log(`Scrape failed: ${error.message}`, 'error');
            await this.recordScrapeRun('error', { error: error.message });
            throw error;
        }
    }

    /**
     * Get scrape stats
     */
    getStats() {
        return { ...this.stats };
    }
}

export default BaseScraper;

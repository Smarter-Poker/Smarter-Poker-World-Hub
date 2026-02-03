/**
 * Venue Scraper Framework
 * Entry point for all venue data scrapers
 *
 * Usage:
 *   import { PokerAtlasScraper, TournamentScheduleParser } from '@/lib/scrapers';
 *
 *   const scraper = new PokerAtlasScraper();
 *   await scraper.run();
 */

export { BaseScraper, SOURCE_PRIORITY, UPDATE_FREQUENCY } from './BaseScraper';
export { PokerAtlasScraper } from './PokerAtlasScraper';
export { TournamentScheduleParser, TOURNAMENT_TYPES } from './TournamentScheduleParser';

// Scraper registry for scheduling
export const SCRAPERS = {
    pokeratlas: {
        name: 'PokerAtlas',
        class: 'PokerAtlasScraper',
        schedule: '0 4 * * *', // Daily at 4 AM
        priority: 1,
        enabled: true
    }
    // Future scrapers:
    // cardplayer: { ... },
    // hendonmob: { ... },
};

/**
 * Run a specific scraper by name
 */
export async function runScraper(scraperName) {
    const config = SCRAPERS[scraperName];
    if (!config || !config.enabled) {
        throw new Error(`Scraper not found or disabled: ${scraperName}`);
    }

    // Dynamic import to avoid loading all scrapers
    const { [config.class]: ScraperClass } = await import(`./${config.class}`);
    const scraper = new ScraperClass();
    return scraper.run();
}

/**
 * Run all enabled scrapers
 */
export async function runAllScrapers() {
    const results = {};

    for (const [name, config] of Object.entries(SCRAPERS)) {
        if (config.enabled) {
            try {
                results[name] = await runScraper(name);
            } catch (error) {
                results[name] = { error: error.message };
            }
        }
    }

    return results;
}

/**
 * PokerAtlas Full Venue Scraper
 * 
 * Scrapes all poker venues from PokerAtlas.com state-by-state
 * Target: 450+ venues (casinos, card rooms, poker clubs)
 */

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');

// US States with poker venues (prioritized by density)
const POKER_STATES = [
    { code: 'CA', name: 'California', priority: 1 },      // 100+ card rooms
    { code: 'NV', name: 'Nevada', priority: 1 },          // 60+ rooms
    { code: 'TX', name: 'Texas', priority: 1 },           // 50+ clubs
    { code: 'FL', name: 'Florida', priority: 1 },         // 28+ rooms
    { code: 'PA', name: 'Pennsylvania', priority: 2 },    // 20+ rooms
    { code: 'NJ', name: 'New Jersey', priority: 2 },      // 10+ rooms
    { code: 'MI', name: 'Michigan', priority: 2 },
    { code: 'IL', name: 'Illinois', priority: 2 },
    { code: 'NY', name: 'New York', priority: 2 },
    { code: 'WA', name: 'Washington', priority: 2 },
    { code: 'CT', name: 'Connecticut', priority: 3 },
    { code: 'OH', name: 'Ohio', priority: 3 },
    { code: 'IN', name: 'Indiana', priority: 3 },
    { code: 'LA', name: 'Louisiana', priority: 3 },
    { code: 'MS', name: 'Mississippi', priority: 3 },
    { code: 'OK', name: 'Oklahoma', priority: 3 },
    { code: 'OR', name: 'Oregon', priority: 3 },
    { code: 'AZ', name: 'Arizona', priority: 3 },
    { code: 'CO', name: 'Colorado', priority: 3 },
    { code: 'MN', name: 'Minnesota', priority: 3 },
    // Add more states as needed
];

// Rate limiting configuration
const DELAY_MS = 2000; // 2 seconds between requests (polite scraping)
const MAX_RETRIES = 3;

class PokerAtlasScraper {
    constructor() {
        this.venues = [];
        this.errors = [];
        this.stats = {
            total: 0,
            casinos: 0,
            cardRooms: 0,
            pokerClubs: 0,
            errors: 0
        };
    }

    /**
     * Delay execution for polite scraping
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Fetch HTML from PokerAtlas with retry logic
     */
    async fetchPage(url, retries = 0) {
        try {
            console.log(`Fetching: ${url}`);
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                },
                timeout: 30000
            });
            return response.data;
        } catch (error) {
            if (retries < MAX_RETRIES) {
                console.log(`Retry ${retries + 1}/${MAX_RETRIES} for ${url}`);
                await this.delay(DELAY_MS * 2);
                return this.fetchPage(url, retries + 1);
            }
            throw error;
        }
    }

    /**
     * Scrape venues for a specific state
     */
    async scrapeState(state) {
        try {
            console.log(`\n=== Scraping ${state.name} (${state.code}) ===`);

            // PokerAtlas state page URL pattern
            const url = `https://www.pokeratlas.com/${state.code.toLowerCase()}/poker-rooms`;

            const html = await this.fetchPage(url);
            const $ = cheerio.load(html);

            // Parse venue listings (adjust selectors based on actual HTML structure)
            const venueElements = $('.poker-room-card, .venue-listing, .room-item');

            console.log(`Found ${venueElements.length} potential venues`);

            venueElements.each((i, element) => {
                try {
                    const venue = this.parseVenue($, $(element), state);
                    if (venue) {
                        this.venues.push(venue);
                        this.stats.total++;

                        // Categorize by type
                        if (venue.venue_type === 'casino') this.stats.casinos++;
                        else if (venue.venue_type === 'card_room') this.stats.cardRooms++;
                        else if (venue.venue_type === 'poker_club') this.stats.pokerClubs++;
                    }
                } catch (error) {
                    console.error(`Error parsing venue ${i}:`, error.message);
                    this.stats.errors++;
                }
            });

            console.log(`Scraped ${venueElements.length} venues from ${state.name}`);

        } catch (error) {
            console.error(`Error scraping ${state.name}:`, error.message);
            this.errors.push({
                state: state.code,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Parse individual venue from HTML element
     */
    parseVenue($, element, state) {
        // Extract venue data (adjust selectors based on actual HTML)
        const name = element.find('.room-name, .venue-name, h3, h4').first().text().trim();

        if (!name) return null;

        const address = element.find('.address, .location').first().text().trim();
        const city = element.find('.city').text().trim() || this.extractCity(address);
        const phone = element.find('.phone, .contact').text().trim();
        const website = element.find('a[href*="http"]').attr('href');
        const tables = parseInt(element.find('.tables, .table-count').text().match(/\d+/)?.[0] || '0');

        // Determine venue type based on name/description
        const venueType = this.categorizeVenue(name, element.text());

        return {
            name,
            venue_type: venueType,
            address: address || null,
            city: city || state.name, // Fallback to state name
            state: state.code,
            country: 'US',
            phone: phone || null,
            website: website || null,
            games_offered: this.extractGames(element.text()),
            stakes_cash: this.extractStakes(element.text()),
            poker_tables: tables || null,
            hours_weekday: null, // Will need detailed page scrape
            hours_weekend: null,
            lat: null, // Will geocode separately
            lng: null,
            is_featured: this.isFeaturedVenue(name),
            is_active: true,
            data_source: 'pokeratlas',
            scraped_at: new Date().toISOString()
        };
    }

    /**
     * Categorize venue type based on name and description
     */
    categorizeVenue(name, description) {
        const nameLower = name.toLowerCase();
        const descLower = description.toLowerCase();

        // Casino indicators
        if (nameLower.includes('casino') ||
            nameLower.includes('resort') ||
            nameLower.includes('hotel') ||
            descLower.includes('gaming floor')) {
            return 'casino';
        }

        // Card room indicators
        if (nameLower.includes('card room') ||
            nameLower.includes('cardroom') ||
            nameLower.includes('card club')) {
            return 'card_room';
        }

        // Poker club indicators (default for Texas, social clubs)
        if (nameLower.includes('poker club') ||
            nameLower.includes('social') ||
            nameLower.includes('club')) {
            return 'poker_club';
        }

        // Default to card_room for ambiguous cases
        return 'card_room';
    }

    /**
     * Extract city from address string
     */
    extractCity(address) {
        if (!address) return null;
        // Simple extraction: assume "City, State ZIP" format
        const match = address.match(/([^,]+),\s*[A-Z]{2}/);
        return match ? match[1].trim() : null;
    }

    /**
     * Extract games offered from description
     */
    extractGames(text) {
        const games = [];
        if (text.includes('Hold') || text.includes('NLH')) games.push('NLH');
        if (text.includes('Omaha') || text.includes('PLO')) games.push('PLO');
        if (text.includes('Mixed')) games.push('Mixed');
        if (text.includes('Stud')) games.push('Stud');
        return games.length > 0 ? games : ['NLH']; // Default to NLH
    }

    /**
     * Extract cash game stakes from description
     */
    extractStakes(text) {
        const stakes = [];
        const stakeMatches = text.match(/\$?\d+\/\$?\d+/g);
        if (stakeMatches) {
            stakeMatches.forEach(stake => {
                stakes.push(stake.replace(/\$/g, ''));
            });
        }
        return stakes.length > 0 ? stakes : ['1/2', '2/5']; // Default stakes
    }

    /**
     * Determine if venue should be featured
     */
    isFeaturedVenue(name) {
        const featured = [
            'Bellagio', 'Aria', 'Wynn', 'Venetian', 'MGM Grand',
            'Commerce', 'Bicycle', 'Hustler',
            'Borgata', 'Parx',
            'Seminole Hard Rock', 'Bestbet',
            'Foxwoods', 'Mohegan Sun'
        ];

        return featured.some(f => name.includes(f));
    }

    /**
     * Main scraping execution
     */
    async scrapeAll() {
        console.log('=== PokerAtlas Full Venue Scraper ===\n');
        console.log(`Target: ${POKER_STATES.length} states`);
        console.log(`Rate limit: ${DELAY_MS}ms between requests\n`);

        // Sort states by priority
        const sortedStates = POKER_STATES.sort((a, b) => a.priority - b.priority);

        for (const state of sortedStates) {
            await this.scrapeState(state);
            await this.delay(DELAY_MS); // Polite scraping
        }

        // Print summary
        console.log('\n=== Scraping Complete ===');
        console.log(`Total venues: ${this.stats.total}`);
        console.log(`  Casinos: ${this.stats.casinos}`);
        console.log(`  Card Rooms: ${this.stats.cardRooms}`);
        console.log(`  Poker Clubs: ${this.stats.pokerClubs}`);
        console.log(`Errors: ${this.stats.errors}`);

        return {
            venues: this.venues,
            stats: this.stats,
            errors: this.errors
        };
    }

    /**
     * Save results to JSON file
     */
    async saveResults(outputPath) {
        const results = {
            metadata: {
                scraped_at: new Date().toISOString(),
                total_venues: this.stats.total,
                stats: this.stats,
                errors: this.errors
            },
            venues: this.venues
        };

        await fs.writeFile(
            outputPath,
            JSON.stringify(results, null, 2),
            'utf8'
        );

        console.log(`\nResults saved to: ${outputPath}`);
    }
}

// Main execution
async function main() {
    const scraper = new PokerAtlasScraper();

    try {
        await scraper.scrapeAll();

        // Save to data directory
        const outputPath = path.join(__dirname, '../data/pokeratlas_full_venues.json');
        await scraper.saveResults(outputPath);

        console.log('\n✅ Scraping completed successfully!');
        console.log(`📊 Total venues collected: ${scraper.stats.total}`);

    } catch (error) {
        console.error('\n❌ Scraping failed:', error);
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    main();
}

module.exports = PokerAtlasScraper;

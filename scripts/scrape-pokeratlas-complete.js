/**
 * PokerAtlas Complete Scraper
 * Scrapes all US poker venues state-by-state
 */

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');

const US_STATES = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

class PokerAtlasScraper {
    constructor() {
        this.venues = [];
        this.stats = {
            states_scraped: 0,
            venues_found: 0,
            errors: 0
        };
    }

    async scrapeState(state) {
        const url = `https://www.pokeratlas.com/${state.toLowerCase()}/poker-rooms`;

        try {
            console.log(`📍 Scraping ${state}...`);

            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                },
                timeout: 10000
            });

            const $ = cheerio.load(response.data);
            const stateVenues = [];

            // Parse venue listings
            $('.poker-room-card, .venue-card, .location-card').each((i, elem) => {
                try {
                    const venue = this.parseVenueCard($, elem, state);
                    if (venue) {
                        stateVenues.push(venue);
                    }
                } catch (error) {
                    console.error(`   ⚠️  Parse error:`, error.message);
                }
            });

            console.log(`   ✅ Found ${stateVenues.length} venues`);
            this.venues.push(...stateVenues);
            this.stats.venues_found += stateVenues.length;
            this.stats.states_scraped++;

            // Polite delay
            await new Promise(resolve => setTimeout(resolve, 2000));

            return stateVenues;

        } catch (error) {
            console.error(`   ❌ Error scraping ${state}:`, error.message);
            this.stats.errors++;
            return [];
        }
    }

    parseVenueCard($, elem, state) {
        const $card = $(elem);

        // Extract venue data
        const name = $card.find('.venue-name, .room-name, h3, h4').first().text().trim();
        const city = $card.find('.city, .location').first().text().trim();
        const phone = $card.find('.phone').first().text().trim();
        const website = $card.find('a[href*="http"]').first().attr('href');

        // Extract tables count
        const tablesText = $card.text();
        const tablesMatch = tablesText.match(/(\d+)\s*tables?/i);
        const poker_tables = tablesMatch ? parseInt(tablesMatch[1]) : null;

        // Determine venue type
        let venue_type = 'casino';
        const nameLower = name.toLowerCase();
        if (nameLower.includes('card room') || nameLower.includes('cardroom')) {
            venue_type = 'card_room';
        } else if (nameLower.includes('club') || nameLower.includes('social')) {
            venue_type = 'poker_club';
        }

        if (!name || !city) return null;

        return {
            name: name.replace(/\s+/g, ' ').trim(),
            venue_type,
            city: city.replace(/\s+/g, ' ').trim(),
            state,
            phone: phone || null,
            website: website || null,
            poker_tables,
            games_offered: ['NLH'], // Default, will enrich later
            stakes_cash: [],
            is_featured: poker_tables && poker_tables > 50,
            source: 'pokeratlas',
            scraped_at: new Date().toISOString()
        };
    }

    async scrapeAll() {
        console.log('\n=== PokerAtlas Complete Scrape ===\n');
        console.log(`Target: ${US_STATES.length} states\n`);

        for (const state of US_STATES) {
            await this.scrapeState(state);
        }

        console.log('\n=== Scraping Complete ===');
        console.log(`States: ${this.stats.states_scraped}/${US_STATES.length}`);
        console.log(`Venues: ${this.stats.venues_found}`);
        console.log(`Errors: ${this.stats.errors}`);

        return this.venues;
    }

    async saveToFile() {
        const dataDir = path.join(process.cwd(), 'data');
        await fs.mkdir(dataDir, { recursive: true });

        const filepath = path.join(dataDir, 'pokeratlas_venues_full.json');
        await fs.writeFile(filepath, JSON.stringify(this.venues, null, 2));

        console.log(`\n💾 Saved to: ${filepath}`);
        console.log(`📊 Total venues: ${this.venues.length}\n`);
    }
}

// Main execution
async function main() {
    const scraper = new PokerAtlasScraper();

    try {
        await scraper.scrapeAll();
        await scraper.saveToFile();

        console.log('✅ Scraping successful!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Scraping failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = PokerAtlasScraper;

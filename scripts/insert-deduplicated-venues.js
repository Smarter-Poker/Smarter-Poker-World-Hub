/**
 * Deduplication & Insertion Script
 * Merges scraped data with existing database, avoiding duplicates
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

class DeduplicationService {
    constructor() {
        this.stats = {
            total_scraped: 0,
            new_venues: 0,
            duplicates: 0,
            updated: 0,
            errors: 0
        };
        this.mergeLog = [];
    }

    /**
     * Normalize string for comparison
     */
    normalize(str) {
        if (!str) return '';
        return str.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Calculate Levenshtein similarity (0-1)
     */
    levenshteinSimilarity(str1, str2) {
        const s1 = this.normalize(str1);
        const s2 = this.normalize(str2);

        if (s1 === s2) return 1;
        if (!s1 || !s2) return 0;

        const matrix = [];
        for (let i = 0; i <= s2.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= s1.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= s2.length; i++) {
            for (let j = 1; j <= s1.length; j++) {
                if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }

        const maxLen = Math.max(s1.length, s2.length);
        return 1 - (matrix[s2.length][s1.length] / maxLen);
    }

    /**
     * Check if two venues are duplicates
     */
    isDuplicate(venue1, venue2) {
        // Rule 1: Exact match
        if (
            this.normalize(venue1.name) === this.normalize(venue2.name) &&
            this.normalize(venue1.city) === this.normalize(venue2.city) &&
            venue1.state === venue2.state
        ) {
            return { match: true, type: 'exact', confidence: 1.0 };
        }

        // Rule 2: Fuzzy name match
        const nameSimilarity = this.levenshteinSimilarity(venue1.name, venue2.name);
        if (
            nameSimilarity > 0.9 &&
            this.normalize(venue1.city) === this.normalize(venue2.city) &&
            venue1.state === venue2.state
        ) {
            return { match: true, type: 'fuzzy', confidence: nameSimilarity };
        }

        // Rule 3: Phone match
        if (venue1.phone && venue2.phone) {
            const phone1 = venue1.phone.replace(/\D/g, '');
            const phone2 = venue2.phone.replace(/\D/g, '');
            if (phone1 === phone2 && phone1.length >= 10) {
                return { match: true, type: 'phone', confidence: 0.95 };
            }
        }

        // Rule 4: Website match
        if (venue1.website && venue2.website) {
            const domain1 = venue1.website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
            const domain2 = venue2.website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
            if (domain1 === domain2) {
                return { match: true, type: 'website', confidence: 0.98 };
            }
        }

        return { match: false };
    }

    /**
     * Merge venue data (prefer more complete)
     */
    mergeVenues(existing, scraped) {
        return {
            ...existing,
            // Update if scraped has better data
            phone: scraped.phone || existing.phone,
            website: scraped.website || existing.website,
            poker_tables: scraped.poker_tables || existing.poker_tables,
            games_offered: scraped.games_offered?.length > 0 ? scraped.games_offered : existing.games_offered,
            stakes_cash: scraped.stakes_cash?.length > 0 ? scraped.stakes_cash : existing.stakes_cash,
            is_featured: scraped.is_featured || existing.is_featured,
        };
    }

    /**
     * Process and insert venues
     */
    async processVenues(scrapedVenues) {
        console.log('\n=== Deduplication & Insertion ===\n');

        // Load existing venues
        console.log('📥 Loading existing venues...');
        const { data: existingVenues, error } = await supabase
            .from('poker_venues')
            .select('*');

        if (error) {
            throw new Error(`Failed to load existing venues: ${error.message}`);
        }

        console.log(`   Found ${existingVenues.length} existing venues\n`);

        this.stats.total_scraped = scrapedVenues.length;
        const toInsert = [];
        const toUpdate = [];

        // Process each scraped venue
        for (const scraped of scrapedVenues) {
            let isDupe = false;

            // Check against existing venues
            for (const existing of existingVenues) {
                const dupeCheck = this.isDuplicate(scraped, existing);

                if (dupeCheck.match) {
                    isDupe = true;
                    this.stats.duplicates++;

                    // Log the duplicate
                    this.mergeLog.push({
                        type: dupeCheck.type,
                        confidence: dupeCheck.confidence,
                        existing: existing.name,
                        scraped: scraped.name,
                        action: 'skipped'
                    });

                    console.log(`   🔄 Duplicate (${dupeCheck.type}): ${scraped.name} → ${existing.name}`);
                    break;
                }
            }

            if (!isDupe) {
                toInsert.push(scraped);
                this.stats.new_venues++;
                console.log(`   ✨ New venue: ${scraped.name} (${scraped.city}, ${scraped.state})`);
            }
        }

        // Batch insert new venues
        if (toInsert.length > 0) {
            console.log(`\n📤 Inserting ${toInsert.length} new venues...`);

            const BATCH_SIZE = 10;
            for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
                const batch = toInsert.slice(i, i + BATCH_SIZE);

                try {
                    const { error: insertError } = await supabase
                        .from('poker_venues')
                        .insert(batch);

                    if (insertError) {
                        console.error(`   ❌ Batch ${Math.floor(i / BATCH_SIZE) + 1} error:`, insertError.message);
                        this.stats.errors += batch.length;
                    } else {
                        console.log(`   ✅ Batch ${Math.floor(i / BATCH_SIZE) + 1} inserted`);
                    }

                    await new Promise(r => setTimeout(r, 500));
                } catch (error) {
                    console.error(`   ❌ Exception:`, error.message);
                    this.stats.errors += batch.length;
                }
            }
        }

        // Save merge log
        await this.saveMergeLog();

        console.log('\n=== Deduplication Complete ===');
        console.log(`Total Scraped: ${this.stats.total_scraped}`);
        console.log(`New Venues: ${this.stats.new_venues}`);
        console.log(`Duplicates: ${this.stats.duplicates}`);
        console.log(`Errors: ${this.stats.errors}`);

        return this.stats;
    }

    async saveMergeLog() {
        const dataDir = path.join(process.cwd(), 'data');
        await fs.mkdir(dataDir, { recursive: true });

        const filepath = path.join(dataDir, 'merge_log.json');
        await fs.writeFile(filepath, JSON.stringify(this.mergeLog, null, 2));

        console.log(`\n💾 Merge log saved: ${filepath}`);
    }
}

// Main execution
async function main() {
    const deduper = new DeduplicationService();

    try {
        // Load scraped data
        const dataPath = path.join(process.cwd(), 'data/pokeratlas_venues_full.json');
        const rawData = await fs.readFile(dataPath, 'utf8');
        const scrapedVenues = JSON.parse(rawData);

        console.log(`📂 Loaded ${scrapedVenues.length} scraped venues`);

        // Process and insert
        await deduper.processVenues(scrapedVenues);

        console.log('\n✅ Process complete!');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Process failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = DeduplicationService;

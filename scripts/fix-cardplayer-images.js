#!/usr/bin/env node
/**
 * Fix CardPlayer Article Images
 * 
 * Uses Puppeteer with stealth plugin to extract actual og:image URLs
 * from CardPlayer article pages and updates the database.
 * 
 * CardPlayer blocks simple HTTP requests with Cloudflare, but browser-based
 * access works. This script visits each article page and extracts the
 * og:image meta tag.
 */

require('dotenv').config({ path: '.env.local' });
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createClient } = require('@supabase/supabase-js');

puppeteer.use(StealthPlugin());

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CONFIG = {
    DELAY_BETWEEN_REQUESTS: 2000, // 2 seconds between requests
    TIMEOUT: 15000, // 15 second page timeout
    BATCH_SIZE: 10, // Process in batches
    MAX_RETRIES: 2
};

class CardPlayerImageFixer {
    constructor() {
        this.browser = null;
        this.stats = {
            total: 0,
            updated: 0,
            failed: 0,
            skipped: 0
        };
    }

    log(emoji, message) {
        console.log(`${emoji} ${message}`);
    }

    async initBrowser() {
        this.log('🚀', 'Launching browser...');
        this.browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920,1080'
            ]
        });
    }

    async closeBrowser() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }

    async extractOgImage(url) {
        const page = await this.browser.newPage();

        try {
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: CONFIG.TIMEOUT
            });

            // Extract og:image meta tag
            const ogImage = await page.evaluate(() => {
                const meta = document.querySelector('meta[property="og:image"]');
                return meta ? meta.getAttribute('content') : null;
            });

            return ogImage;
        } catch (error) {
            this.log('⚠️', `Error fetching ${url}: ${error.message}`);
            return null;
        } finally {
            await page.close();
        }
    }

    async getCardPlayerArticles() {
        this.log('📡', 'Fetching CardPlayer articles with fallback images...');

        const { data, error } = await supabase
            .from('poker_news')
            .select('id, title, source_url, image_url')
            .eq('source_name', 'CardPlayer')
            .like('image_url', '%pexels%')
            .not('source_url', 'is', null);

        if (error) {
            throw new Error(`Database query failed: ${error.message}`);
        }

        return data || [];
    }

    async updateArticleImage(id, imageUrl) {
        const { error } = await supabase
            .from('poker_news')
            .update({ image_url: imageUrl })
            .eq('id', id);

        if (error) {
            throw new Error(`Update failed: ${error.message}`);
        }
    }

    async processArticle(article) {
        const { id, title, source_url, image_url } = article;

        this.log('🔍', `Processing: ${title.substring(0, 50)}...`);

        // Skip if already has a real image
        if (image_url && image_url.includes('cardplayer.com')) {
            this.log('⏭️', 'Already has real image, skipping');
            this.stats.skipped++;
            return;
        }

        let retries = 0;
        let ogImage = null;

        while (retries < CONFIG.MAX_RETRIES && !ogImage) {
            ogImage = await this.extractOgImage(source_url);
            if (!ogImage) {
                retries++;
                if (retries < CONFIG.MAX_RETRIES) {
                    this.log('🔄', `Retry ${retries}/${CONFIG.MAX_RETRIES}...`);
                    await this.delay(1000);
                }
            }
        }

        if (ogImage && ogImage.includes('cardplayer.com')) {
            await this.updateArticleImage(id, ogImage);
            this.log('✅', `Updated with: ${ogImage.substring(0, 60)}...`);
            this.stats.updated++;
        } else {
            this.log('❌', `Could not extract image for: ${title.substring(0, 40)}...`);
            this.stats.failed++;
        }

        // Delay between requests to avoid rate limiting
        await this.delay(CONFIG.DELAY_BETWEEN_REQUESTS);
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async run() {
        console.log('\n========================================');
        console.log('  CardPlayer Image Fixer');
        console.log('  Extracting actual article thumbnails');
        console.log('========================================\n');

        try {
            // Get articles needing updates
            const articles = await this.getCardPlayerArticles();
            this.stats.total = articles.length;

            if (articles.length === 0) {
                this.log('✨', 'No CardPlayer articles with fallback images found!');
                return;
            }

            this.log('📊', `Found ${articles.length} articles to process`);

            // Initialize browser
            await this.initBrowser();

            // Process each article
            for (let i = 0; i < articles.length; i++) {
                this.log('📝', `[${i + 1}/${articles.length}]`);
                await this.processArticle(articles[i]);
            }

        } catch (error) {
            this.log('💥', `Fatal error: ${error.message}`);
            console.error(error);
        } finally {
            await this.closeBrowser();

            // Print summary
            console.log('\n========================================');
            console.log('  Summary');
            console.log('========================================');
            console.log(`  Total articles:  ${this.stats.total}`);
            console.log(`  Updated:         ${this.stats.updated}`);
            console.log(`  Failed:          ${this.stats.failed}`);
            console.log(`  Skipped:         ${this.stats.skipped}`);
            console.log('========================================\n');
        }
    }
}

// Run if called directly
if (require.main === module) {
    const fixer = new CardPlayerImageFixer();
    fixer.run().catch(console.error);
}

module.exports = CardPlayerImageFixer;

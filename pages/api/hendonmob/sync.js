/**
 * HENDONMOB SYNC API - Using Puppeteer with Stealth Plugin
 * Bypasses Cloudflare protection to scrape real HendonMob data
 * POST /api/hendonmob/sync
 */

import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Add stealth plugin to avoid Cloudflare detection
puppeteer.use(StealthPlugin());

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { userId, hendonUrl } = req.body;

    if (!userId || !hendonUrl) {
        return res.status(400).json({ error: 'Missing userId or hendonUrl' });
    }

    // Validate HendonMob URL
    if (!hendonUrl.includes('hendonmob.com')) {
        return res.status(400).json({ error: 'Invalid Hendon Mob URL' });
    }

    let browser = null;

    try {
        console.log(`Syncing HendonMob for user ${userId}: ${hendonUrl}`);

        // Launch browser with stealth mode
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920x1080',
            ]
        });

        const page = await browser.newPage();

        // Set a realistic user agent
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Set viewport
        await page.setViewport({ width: 1920, height: 1080 });

        // Navigate to the HendonMob page
        console.log('Navigating to HendonMob...');
        await page.goto(hendonUrl, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Wait for Cloudflare challenge to complete (if any)
        await page.waitForTimeout(5000);

        // Check if we're still on a Cloudflare challenge page
        const pageContent = await page.content();
        if (pageContent.includes('Just a moment') || pageContent.includes('Checking your browser')) {
            console.log('Cloudflare challenge detected, waiting...');
            await page.waitForTimeout(10000);
        }

        // Get the page content after waiting
        const html = await page.content();
        console.log('Page loaded, extracting stats...');

        // Parse stats from the page
        const stats = await page.evaluate(() => {
            const text = document.body.innerText;

            let totalEarnings = null;
            let totalCashes = null;
            let bestFinish = null;

            // Look for "Total Live Earnings" or similar
            const earningsMatch = text.match(/Total\s*(?:Live\s*)?Earnings[:\s]*\$?([\d,]+)/i);
            if (earningsMatch) {
                totalEarnings = parseInt(earningsMatch[1].replace(/,/g, ''), 10);
            }

            // Look for any large dollar amounts
            if (!totalEarnings) {
                const dollarMatches = text.match(/\$[\d,]+/g);
                if (dollarMatches && dollarMatches.length > 0) {
                    const amounts = dollarMatches.map(s => parseInt(s.replace(/[$,]/g, ''), 10));
                    totalEarnings = Math.max(...amounts);
                }
            }

            // Look for cashes/results count
            const cashesMatch = text.match(/(\d+)\s*(?:Cashes|Results|ITM)/i);
            if (cashesMatch) {
                totalCashes = parseInt(cashesMatch[1], 10);
            }

            // Look for rows in a results table
            if (!totalCashes) {
                const rows = document.querySelectorAll('table tr');
                if (rows.length > 1) {
                    totalCashes = rows.length - 1; // Subtract header row
                }
            }

            // Look for best finish
            const finishMatch = text.match(/(?:Best|1st|Winner|Won)[:\s]*/i);
            if (finishMatch || text.match(/1st\s*place/i)) {
                bestFinish = '1st';
            } else {
                const placeMatch = text.match(/(1st|2nd|3rd|\d+th)/i);
                if (placeMatch) {
                    bestFinish = placeMatch[1];
                }
            }

            return { totalEarnings, totalCashes, bestFinish };
        });

        await browser.close();
        browser = null;

        if (!stats.totalEarnings && !stats.totalCashes) {
            return res.status(400).json({
                error: 'Could not extract stats from HendonMob. The page may still be loading or the URL may be incorrect.',
                debug: { pageLength: html.length }
            });
        }

        console.log('Stats extracted:', stats);

        // Update the user's profile with the scraped data
        const { error: updateError } = await supabase
            .from('profiles')
            .update({
                hendon_total_cashes: stats.totalCashes,
                hendon_total_earnings: stats.totalEarnings,
                hendon_best_finish: stats.bestFinish,
                hendon_last_scraped: new Date().toISOString(),
            })
            .eq('id', userId);

        if (updateError) {
            console.error('Update error:', updateError);
            return res.status(500).json({ error: 'Failed to update profile' });
        }

        return res.status(200).json({
            success: true,
            total_cashes: stats.totalCashes,
            total_earnings: stats.totalEarnings,
            best_finish: stats.bestFinish,
        });

    } catch (error) {
        console.error('Sync error:', error);
        if (browser) {
            await browser.close();
        }
        return res.status(500).json({ error: 'Failed to sync: ' + error.message });
    }
}

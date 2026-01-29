/**
 * HENDONMOB SCRAPER API
 * Weekly cron job to scrape HendonMob profiles and update user stats
 * 
 * This endpoint should be called by Vercel Cron or external scheduler
 * POST /api/cron/hendon-scraper
 * 
 * Headers required:
 * - Authorization: Bearer CRON_SECRET
 */

import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

// Server-side Supabase client with service role
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Verify cron secret
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // Get all profiles with HendonMob URLs that need scraping
        // Either never scraped or scraped more than 7 days ago
        const { data: profiles, error: fetchError } = await supabase
            .from('profiles')
            .select('id, hendon_url, hendon_last_scraped')
            .not('hendon_url', 'is', null)
            .or('hendon_last_scraped.is.null,hendon_last_scraped.lt.' + new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

        if (fetchError) {
            console.error('Error fetching profiles:', fetchError);
            return res.status(500).json({ error: 'Failed to fetch profiles' });
        }

        if (!profiles || profiles.length === 0) {
            return res.status(200).json({ message: 'No profiles to scrape', count: 0 });
        }

        console.log(`Found ${profiles.length} profiles to scrape`);

        const results = [];

        for (const profile of profiles) {
            try {
                const scraped = await scrapeHendonMob(profile.hendon_url);

                if (scraped) {
                    // Update profile with scraped data
                    await supabase.rpc('fn_update_hendon_data', {
                        p_profile_id: profile.id,
                        p_total_cashes: scraped.totalCashes,
                        p_total_earnings: scraped.totalEarnings,
                        p_best_finish: scraped.bestFinish,
                        p_biggest_cash: scraped.biggestCash,
                    });

                    // Log success
                    await supabase.from('hendon_scrape_log').insert({
                        profile_id: profile.id,
                        hendon_url: profile.hendon_url,
                        status: 'success',
                        total_cashes: scraped.totalCashes,
                        total_earnings: scraped.totalEarnings,
                        best_finish: scraped.bestFinish,
                        biggest_cash: scraped.biggestCash,
                        raw_data: scraped.rawData,
                    });

                    results.push({ id: profile.id, status: 'success' });
                } else {
                    results.push({ id: profile.id, status: 'no_data' });
                }

                // Rate limiting - wait 2 seconds between requests
                await new Promise(r => setTimeout(r, 2000));

            } catch (scrapeError) {
                console.error(`Error scraping ${profile.hendon_url}:`, scrapeError);

                // Log failure
                await supabase.from('hendon_scrape_log').insert({
                    profile_id: profile.id,
                    hendon_url: profile.hendon_url,
                    status: 'failed',
                    error_message: scrapeError.message,
                });

                results.push({ id: profile.id, status: 'error', error: scrapeError.message });
            }
        }

        return res.status(200).json({
            message: 'Scraping complete',
            count: profiles.length,
            results
        });

    } catch (error) {
        console.error('Scraper error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Scrape HendonMob profile page
 * Returns { totalCashes, totalEarnings, bestFinish, biggestCash, rawData }
 */
async function scrapeHendonMob(url) {
    if (!url || !url.includes('thehendonmob.com')) {
        return null;
    }

    try {
        // Fetch the page with browser-like headers
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': 'https://www.google.com/',
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // Parse HendonMob structure
        // These selectors may need adjustment based on actual page structure
        let totalCashes = null;
        let totalEarnings = null;
        let bestFinish = null;
        let biggestCash = null;

        // Try to find stats in the page
        // HendonMob typically shows: Total Live Earnings, Cashes, etc.

        // Look for earnings (usually formatted like $1,234,567)
        const earningsMatch = html.match(/\$[\d,]+(?:\.\d{2})?/g);
        if (earningsMatch && earningsMatch.length > 0) {
            // Take the largest number as total earnings
            const amounts = earningsMatch.map(s => parseFloat(s.replace(/[$,]/g, '')));
            totalEarnings = Math.max(...amounts);
        }

        // Look for "X cashes" or similar
        const cashesMatch = html.match(/(\d+)\s*(?:cashes|cash|ITM)/i);
        if (cashesMatch) {
            totalCashes = parseInt(cashesMatch[1], 10);
        }

        // Look for finishes like "1st", "2nd", etc.
        const finishMatch = html.match(/1st|2nd|3rd|\d+th/i);
        if (finishMatch) {
            bestFinish = finishMatch[0];
        }

        // Look for biggest cash in tournament results table
        // HendonMob shows results with prize amounts
        $('table').each((i, table) => {
            $(table).find('tr').each((j, row) => {
                const cells = $(row).find('td');
                // Look for rows with prize money
                cells.each((k, cell) => {
                    const cellText = $(cell).text();
                    const prizeMatch = cellText.match(/\$[\d,]+(?:\.\d{2})?/);
                    if (prizeMatch) {
                        const amount = parseFloat(prizeMatch[0].replace(/[$,]/g, ''));
                        if (!biggestCash || amount > biggestCash) {
                            biggestCash = amount;
                        }
                    }
                });
            });
        });

        // Also try tables for more structured data
        $('table').each((i, table) => {
            const tableText = $(table).text().toLowerCase();
            if (tableText.includes('cashes') || tableText.includes('earnings')) {
                // Found stats table
                $(table).find('tr').each((j, row) => {
                    const cells = $(row).find('td');
                    if (cells.length >= 2) {
                        const label = $(cells[0]).text().toLowerCase();
                        const value = $(cells[1]).text().trim();

                        if (label.includes('cashes') && !totalCashes) {
                            totalCashes = parseInt(value.replace(/,/g, ''), 10);
                        }
                        if (label.includes('earnings') && !totalEarnings) {
                            totalEarnings = parseFloat(value.replace(/[$,]/g, ''));
                        }
                    }
                });
            }
        });

        return {
            totalCashes,
            totalEarnings,
            bestFinish,
            biggestCash,
            rawData: {
                url,
                scrapedAt: new Date().toISOString(),
                pageLength: html.length,
            }
        };

    } catch (error) {
        console.error('Scrape error:', error);
        throw error;
    }
}

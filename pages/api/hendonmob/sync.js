/**
 * HENDONMOB SYNC API
 * Manual sync endpoint for users to refresh their HendonMob stats
 * POST /api/hendonmob/sync
 * Body: { userId, hendonUrl }
 */

import { createClient } from '@supabase/supabase-js';

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
    if (!hendonUrl.includes('thehendonmob.com') && !hendonUrl.includes('hendonmob.com')) {
        return res.status(400).json({ error: 'Invalid Hendon Mob URL' });
    }

    try {
        console.log(`Syncing HendonMob for user ${userId}: ${hendonUrl}`);

        // Scrape the HendonMob page
        const scraped = await scrapeHendonMob(hendonUrl);

        if (!scraped) {
            return res.status(400).json({ error: 'Could not scrape HendonMob profile. Please check your URL.' });
        }

        // Update the user's profile with the scraped data
        const { error: updateError } = await supabase
            .from('profiles')
            .update({
                hendon_total_cashes: scraped.totalCashes,
                hendon_total_earnings: scraped.totalEarnings,
                hendon_best_finish: scraped.bestFinish,
                hendon_last_scraped: new Date().toISOString(),
            })
            .eq('id', userId);

        if (updateError) {
            console.error('Update error:', updateError);
            return res.status(500).json({ error: 'Failed to update profile' });
        }

        return res.status(200).json({
            success: true,
            total_cashes: scraped.totalCashes,
            total_earnings: scraped.totalEarnings,
            best_finish: scraped.bestFinish,
        });

    } catch (error) {
        console.error('Sync error:', error);
        return res.status(500).json({ error: 'Failed to sync: ' + error.message });
    }
}

/**
 * Scrape HendonMob profile page
 */
async function scrapeHendonMob(url) {
    if (!url) return null;

    try {
        // Normalize the URL
        let normalizedUrl = url.trim();
        if (!normalizedUrl.startsWith('http')) {
            normalizedUrl = 'https://' + normalizedUrl;
        }

        // Fetch the page with browser-like headers
        const response = await fetch(normalizedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();

        // Parse stats from the page
        let totalCashes = null;
        let totalEarnings = null;
        let bestFinish = null;

        // Look for earnings (usually formatted like $1,234,567)
        const earningsMatch = html.match(/\$[\d,]+(?:\.\d{2})?/g);
        if (earningsMatch && earningsMatch.length > 0) {
            const amounts = earningsMatch.map(s => parseFloat(s.replace(/[$,]/g, '')));
            totalEarnings = Math.max(...amounts);
        }

        // Look for cashes count
        const cashesMatch = html.match(/(\d+)\s*(?:cashes|cash|ITM|Results)/i);
        if (cashesMatch) {
            totalCashes = parseInt(cashesMatch[1], 10);
        }

        // Look for results count in a different format
        if (!totalCashes) {
            const resultsMatch = html.match(/(\d+)\s*results/i);
            if (resultsMatch) {
                totalCashes = parseInt(resultsMatch[1], 10);
            }
        }

        // Look for best finish (1st, 2nd, 3rd, etc.)
        const finishMatches = html.match(/(?:1st|2nd|3rd|\d+th)/gi);
        if (finishMatches && finishMatches.length > 0) {
            // Get the best (lowest) finish
            const finishes = finishMatches.map(f => {
                if (f.toLowerCase() === '1st') return 1;
                if (f.toLowerCase() === '2nd') return 2;
                if (f.toLowerCase() === '3rd') return 3;
                return parseInt(f, 10);
            }).filter(n => !isNaN(n) && n > 0);

            if (finishes.length > 0) {
                const best = Math.min(...finishes);
                if (best === 1) bestFinish = '1st';
                else if (best === 2) bestFinish = '2nd';
                else if (best === 3) bestFinish = '3rd';
                else bestFinish = `${best}th`;
            }
        }

        console.log('Scraped data:', { totalCashes, totalEarnings, bestFinish });

        return {
            totalCashes,
            totalEarnings,
            bestFinish,
        };

    } catch (error) {
        console.error('Scrape error:', error);
        throw error;
    }
}

/**
 * HENDONMOB SYNC API - Using ScraperAPI
 * Uses a scraping proxy service to bypass Cloudflare
 * POST /api/hendonmob/sync
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
    if (!hendonUrl.includes('hendonmob.com')) {
        return res.status(400).json({ error: 'Invalid Hendon Mob URL' });
    }

    try {
        console.log(`Syncing HendonMob for user ${userId}: ${hendonUrl}`);

        // Try ScraperAPI if available
        let html = null;

        if (process.env.SCRAPERAPI_KEY) {
            const scraperUrl = `http://api.scraperapi.com?api_key=${process.env.SCRAPERAPI_KEY}&url=${encodeURIComponent(hendonUrl)}&render=true`;
            const response = await fetch(scraperUrl, { timeout: 60000 });
            if (response.ok) {
                html = await response.text();
            }
        }

        // Fallback: try ZenRows if available
        if (!html && process.env.ZENROWS_KEY) {
            const zenUrl = `https://api.zenrows.com/v1/?apikey=${process.env.ZENROWS_KEY}&url=${encodeURIComponent(hendonUrl)}&js_render=true&antibot=true`;
            const response = await fetch(zenUrl, { timeout: 60000 });
            if (response.ok) {
                html = await response.text();
            }
        }

        // Fallback: try direct fetch (may work sometimes)
        if (!html) {
            try {
                const response = await fetch(hendonUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                    }
                });
                if (response.ok) {
                    html = await response.text();
                }
            } catch (e) {
                console.log('Direct fetch failed:', e.message);
            }
        }

        // If we still don't have HTML, try Google search method
        if (!html || html.includes('Just a moment') || html.length < 5000) {
            console.log('Using Google search fallback...');

            // Get player name from profile
            const { data: profile } = await supabase
                .from('profiles')
                .select('full_name')
                .eq('id', userId)
                .single();

            if (profile?.full_name) {
                const stats = await searchForStats(profile.full_name, hendonUrl);
                if (stats) {
                    return await saveAndReturn(res, userId, stats);
                }
            }

            return res.status(400).json({
                error: 'Could not access HendonMob. Please try again later or contact support.',
                suggestion: 'HendonMob may be blocking access. Try again in a few minutes.'
            });
        }

        // Parse stats from HTML
        const stats = parseHendonMobHtml(html);

        if (!stats.totalEarnings && !stats.totalCashes) {
            return res.status(400).json({
                error: 'Could not extract stats from HendonMob page. The player may not have any recorded results.',
            });
        }

        return await saveAndReturn(res, userId, stats);

    } catch (error) {
        console.error('Sync error:', error);
        return res.status(500).json({ error: 'Failed to sync: ' + error.message });
    }
}

async function saveAndReturn(res, userId, stats) {
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
}

function parseHendonMobHtml(html) {
    let totalEarnings = null;
    let totalCashes = null;
    let bestFinish = null;

    // Look for "Total Live Earnings" patterns
    const earningsPatterns = [
        /Total\s*(?:Live\s*)?Earnings[:\s]*\$?([\d,]+)/i,
        /Lifetime\s*Earnings[:\s]*\$?([\d,]+)/i,
        /All\s*Time\s*Earnings[:\s]*\$?([\d,]+)/i,
    ];

    for (const pattern of earningsPatterns) {
        const match = html.match(pattern);
        if (match) {
            totalEarnings = parseInt(match[1].replace(/,/g, ''), 10);
            break;
        }
    }

    // Fallback: find largest dollar amount
    if (!totalEarnings) {
        const dollarMatches = html.match(/\$[\d,]+/g);
        if (dollarMatches && dollarMatches.length > 0) {
            const amounts = dollarMatches.map(s => parseInt(s.replace(/[$,]/g, ''), 10)).filter(n => !isNaN(n));
            if (amounts.length > 0) {
                totalEarnings = Math.max(...amounts);
            }
        }
    }

    // Look for cashes/results count
    const cashesPatterns = [
        /(\d+)\s*(?:Live\s*)?Cashes/i,
        /(\d+)\s*Results/i,
        /(\d+)\s*ITM/i,
        /Cashes[:\s]*(\d+)/i,
    ];

    for (const pattern of cashesPatterns) {
        const match = html.match(pattern);
        if (match) {
            totalCashes = parseInt(match[1], 10);
            break;
        }
    }

    // Look for best finish
    if (html.match(/1st\s*(?:place)?|Winner|Won/i)) {
        bestFinish = '1st';
    } else {
        const placeMatch = html.match(/(1st|2nd|3rd|\d+th)/i);
        if (placeMatch) {
            bestFinish = placeMatch[1];
        }
    }

    return { totalCashes, totalEarnings, bestFinish };
}

async function searchForStats(playerName, hendonUrl) {
    // Extract player ID from URL
    const playerIdMatch = hendonUrl.match(/n=(\d+)/);
    const playerId = playerIdMatch ? playerIdMatch[1] : null;

    // Try DuckDuckGo Instant Answers (free, no API key)
    try {
        const query = `"${playerName}" Hendon Mob poker total live earnings`;
        const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
        const response = await fetch(ddgUrl);
        const data = await response.json();

        const text = `${data.AbstractText || ''} ${data.Answer || ''} ${JSON.stringify(data.RelatedTopics || [])}`;

        if (text.length > 50) {
            const stats = parseTextForStats(text);
            if (stats.totalEarnings || stats.totalCashes) {
                return stats;
            }
        }
    } catch (e) {
        console.error('DuckDuckGo search failed:', e);
    }

    return null;
}

function parseTextForStats(text) {
    let totalEarnings = null;
    let totalCashes = null;
    let bestFinish = null;

    // Look for dollar amounts
    const dollarMatches = text.match(/\$[\d,]+/g);
    if (dollarMatches) {
        const amounts = dollarMatches.map(s => parseInt(s.replace(/[$,]/g, ''), 10)).filter(n => !isNaN(n));
        if (amounts.length > 0) {
            totalEarnings = Math.max(...amounts);
        }
    }

    // Look for cashes
    const cashesMatch = text.match(/(\d+)\s*(?:cashes|results|ITM)/i);
    if (cashesMatch) {
        totalCashes = parseInt(cashesMatch[1], 10);
    }

    // Look for best finish
    if (text.match(/1st|first|winner|won/i)) {
        bestFinish = '1st';
    } else if (text.match(/2nd|second/i)) {
        bestFinish = '2nd';
    } else if (text.match(/3rd|third/i)) {
        bestFinish = '3rd';
    }

    return { totalCashes, totalEarnings, bestFinish };
}

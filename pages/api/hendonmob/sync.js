/**
 * HENDONMOB SYNC API - Free Google Search Method
 * Uses search engines to find indexed HendonMob stats (no API key required)
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

    if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
    }

    try {
        // Get player name from profile
        const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', userId)
            .single();

        const playerName = profile?.full_name;

        if (!playerName && !hendonUrl) {
            return res.status(400).json({ error: 'Please set your full name in your profile to match your Hendon Mob name' });
        }

        console.log(`Searching for HendonMob stats for: ${playerName}`);

        // Try multiple search methods
        let stats = null;

        // Method 1: DuckDuckGo Instant Answers (free, no key)
        if (playerName) {
            stats = await searchDuckDuckGo(playerName);
        }

        // Method 2: Try Bing Web Search (free tier available)
        if (!stats && playerName) {
            stats = await searchBing(playerName);
        }

        // Method 3: Try fetching from a poker stats aggregator
        if (!stats && playerName) {
            stats = await searchPokerDB(playerName);
        }

        // Method 4: Extract player ID from URL and search
        if (!stats && hendonUrl) {
            const playerIdMatch = hendonUrl.match(/n=(\d+)/);
            if (playerIdMatch) {
                stats = await searchByPlayerId(playerIdMatch[1], playerName);
            }
        }

        if (!stats || (!stats.totalEarnings && !stats.totalCashes)) {
            return res.status(400).json({
                error: 'Could not find stats. Make sure your Full Name matches your Hendon Mob profile exactly.',
                suggestion: `Searched for: "${playerName}". Try updating your name to match exactly.`
            });
        }

        const { error: updateError } = await supabase
            .from('profiles')
            .update({
                hendon_total_cashes: stats.totalCashes,
                hendon_total_earnings: stats.totalEarnings,
                hendon_best_finish: stats.bestFinish,
                hendon_biggest_cash: stats.biggestCash,
                hendon_last_scraped: new Date().toISOString(),
            })
            .eq('id', userId);

        if (updateError) {
            console.error('Update error:', updateError);
            return res.status(500).json({ error: 'Failed to save stats' });
        }

        return res.status(200).json({
            success: true,
            total_cashes: stats.totalCashes,
            total_earnings: stats.totalEarnings,
            best_finish: stats.bestFinish,
            biggest_cash: stats.biggestCash,
            source: stats.source,
        });

    } catch (error) {
        console.error('Sync error:', error);
        return res.status(500).json({ error: 'Sync failed: ' + error.message });
    }
}

/**
 * Search DuckDuckGo for player stats
 */
async function searchDuckDuckGo(playerName) {
    try {
        const queries = [
            `${playerName} Hendon Mob poker earnings`,
            `${playerName} poker tournament total live earnings`,
            `${playerName} WSOP earnings total`,
        ];

        for (const query of queries) {
            const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
            const response = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 10000
            });

            if (!response.ok) continue;

            const data = await response.json();
            const text = [
                data.AbstractText || '',
                data.Answer || '',
                data.Definition || '',
                ...(data.RelatedTopics || []).map(t => t.Text || ''),
            ].join(' ');

            if (text.length > 30) {
                const stats = parseStatsFromText(text);
                if (stats.totalEarnings || stats.totalCashes) {
                    stats.source = 'duckduckgo';
                    return stats;
                }
            }
        }
    } catch (e) {
        console.log('DuckDuckGo search failed:', e.message);
    }
    return null;
}

/**
 * Search Bing for player info
 */
async function searchBing(playerName) {
    try {
        // Use Bing's autosuggest/instant answers (free)
        const query = `${playerName} hendon mob poker`;
        const url = `https://www.bing.com/AS/Suggestions?qry=${encodeURIComponent(query)}&cvid=1`;

        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 5000
        });

        if (response.ok) {
            const text = await response.text();
            const stats = parseStatsFromText(text);
            if (stats.totalEarnings || stats.totalCashes) {
                stats.source = 'bing';
                return stats;
            }
        }
    } catch (e) {
        console.log('Bing search failed:', e.message);
    }
    return null;
}

/**
 * Search poker databases
 */
async function searchPokerDB(playerName) {
    try {
        // Try Global Poker Index (public data)
        const gpiUrl = `https://www.globalpokerindex.com/api/v1/players/search?q=${encodeURIComponent(playerName)}`;
        const response = await fetch(gpiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'application/json'
            },
            timeout: 10000
        });

        if (response.ok) {
            const data = await response.json();
            if (data.players && data.players.length > 0) {
                const player = data.players[0];
                return {
                    totalEarnings: player.total_earnings || player.lifetime_earnings,
                    totalCashes: player.cashes || player.itm_count,
                    bestFinish: player.best_finish || '1st',
                    source: 'gpi'
                };
            }
        }
    } catch (e) {
        console.log('PokerDB search failed:', e.message);
    }
    return null;
}

/**
 * Search by Hendon Mob player ID
 */
async function searchByPlayerId(playerId, playerName) {
    try {
        const query = `site:thehendonmob.com "${playerId}" ${playerName || ''} earnings`;
        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;

        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000
        });

        if (response.ok) {
            const data = await response.json();
            const text = [
                data.AbstractText || '',
                data.Answer || '',
                ...(data.RelatedTopics || []).map(t => t.Text || ''),
            ].join(' ');

            const stats = parseStatsFromText(text);
            if (stats.totalEarnings || stats.totalCashes) {
                stats.source = 'hendonmob_id';
                return stats;
            }
        }
    } catch (e) {
        console.log('Player ID search failed:', e.message);
    }
    return null;
}

/**
 * Extract stats from text
 */
function parseStatsFromText(text) {
    let totalEarnings = null;
    let totalCashes = null;
    let bestFinish = null;
    let biggestCash = null;

    // Find dollar amounts
    const dollarMatches = text.match(/\$[\d,]+(?:\.\d{2})?/g);
    if (dollarMatches && dollarMatches.length > 0) {
        const amounts = dollarMatches
            .map(s => parseInt(s.replace(/[$,\.]/g, ''), 10) / (s.includes('.') ? 100 : 1))
            .filter(n => !isNaN(n) && n > 0)
            .sort((a, b) => b - a); // Sort descending

        if (amounts.length > 0) {
            totalEarnings = amounts[0]; // Largest = total earnings
            // Second largest (or largest if only one) is likely biggest cash
            biggestCash = amounts.length > 1 ? amounts[1] : amounts[0];
            // If second largest seems too small relative to total, look for other patterns
            if (biggestCash < totalEarnings * 0.01) {
                biggestCash = null; // Will try other patterns
            }
        }
    }

    // Also look for "X million" or "X,XXX,XXX" patterns
    const millionMatch = text.match(/([\d.]+)\s*million/i);
    if (millionMatch) {
        const millions = parseFloat(millionMatch[1]) * 1000000;
        if (!totalEarnings || millions > totalEarnings) {
            totalEarnings = millions;
        }
    }

    // Look for "biggest cash" or "largest cash" patterns
    const bigCashPatterns = [
        /biggest\s*(?:single\s*)?cash[:\s]*\$?([\d,]+)/i,
        /largest\s*(?:single\s*)?cash[:\s]*\$?([\d,]+)/i,
        /best\s*(?:single\s*)?cash[:\s]*\$?([\d,]+)/i,
        /([\d,]+)\s*(?:was|is)\s*(?:his|her|their)?\s*biggest/i,
    ];
    for (const pattern of bigCashPatterns) {
        const match = text.match(pattern);
        if (match) {
            const val = parseInt(match[1].replace(/,/g, ''), 10);
            if (!isNaN(val) && val > 0) {
                biggestCash = val;
                break;
            }
        }
    }

    // Find cashes count
    const cashesPatterns = [
        /(\d+)\s*(?:live\s*)?cashes/i,
        /(\d+)\s*results/i,
        /(\d+)\s*ITM/i,
        /cashes[:\s]*(\d+)/i,
    ];
    for (const pattern of cashesPatterns) {
        const match = text.match(pattern);
        if (match) {
            totalCashes = parseInt(match[1], 10);
            break;
        }
    }

    // Find best finish
    if (text.match(/\b(1st|first|winner|won|victory|champion)\b/i)) {
        bestFinish = '1st';
    } else if (text.match(/\b(2nd|second|runner.?up)\b/i)) {
        bestFinish = '2nd';
    } else if (text.match(/\b(3rd|third)\b/i)) {
        bestFinish = '3rd';
    } else {
        const placeMatch = text.match(/(\d+)(?:st|nd|rd|th)\s*(?:place)?/i);
        if (placeMatch) {
            const num = parseInt(placeMatch[1], 10);
            bestFinish = num === 1 ? '1st' : num === 2 ? '2nd' : num === 3 ? '3rd' : `${num}th`;
        }
    }

    return { totalEarnings, totalCashes, bestFinish, biggestCash };
}

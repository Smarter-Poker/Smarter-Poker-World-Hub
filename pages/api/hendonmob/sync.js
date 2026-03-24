/**
 * HENDONMOB SYNC API - Direct HTML Scraping
 * Scrapes HendonMob profile page directly using fetch + cheerio
 * POST /api/hendonmob/sync
 * 
 * Uses multiple User-Agent strings and retry strategies to handle
 * HendonMob's anti-bot protections (403 responses).
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import * as cheerio from 'cheerio';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// Rotate user-agents to avoid 403
const USER_AGENTS = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
];

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // Require JWT auth
      const _token = req.headers.authorization?.replace('Bearer ', '');
      if (!_token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { data: { user: _authUser }, error: _authErr } = await getSupabase().auth.getUser(_token);
      if (_authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

      const userId = _authUser.id;
      const { hendonUrl } = req.body;

      try {
          // Get player profile
          const { data: profile } = await getSupabase()
              .from('profiles')
              .select('full_name, hendon_url')
              .eq('id', userId)
              .maybeSingle();

          const targetUrl = hendonUrl || profile?.hendon_url;

          if (!targetUrl || !targetUrl.includes('thehendonmob.com')) {
              return res.status(400).json({
                  success: false,
                  error: 'Please enter a valid Hendon Mob profile URL (e.g., https://pokerdb.thehendonmob.com/player.php?a=r&n=YOUR_ID)'
              });
          }

          // ── Try direct scrape first, then Google cache fallback ────────
          let stats = null;
          let source = 'unknown';

          // Strategy 1: Direct fetch with browser-like headers
          stats = await scrapeHendonMob(targetUrl);
          if (stats && (stats.totalEarnings || stats.totalCashes)) {
              source = 'direct_scrape';
          }

          // Strategy 2: Try Google cache version
          if (!stats || (!stats.totalEarnings && !stats.totalCashes)) {
              stats = await scrapeGoogleCache(targetUrl);
              if (stats && (stats.totalEarnings || stats.totalCashes)) {
                  source = 'google_cache';
              }
          }

          // Strategy 3: Try extracting player ID and hitting the JSON/API endpoint
          if (!stats || (!stats.totalEarnings && !stats.totalCashes)) {
              const playerIdMatch = targetUrl.match(/n=(\d+)/);
              if (playerIdMatch) {
                  stats = await scrapeHendonMobAlt(playerIdMatch[1]);
                  if (stats && (stats.totalEarnings || stats.totalCashes)) {
                      source = 'alt_endpoint';
                  }
              }
          }

          // Strategy 4: Search DuckDuckGo for the player's stats
          if (!stats || (!stats.totalEarnings && !stats.totalCashes)) {
              const playerName = profile?.full_name;
              if (playerName) {
                  stats = await searchForStats(playerName, targetUrl);
                  if (stats && (stats.totalEarnings || stats.totalCashes)) {
                      source = 'search';
                  }
              }
          }

          if (!stats || (!stats.totalEarnings && !stats.totalCashes)) {
              return res.status(400).json({
                  success: false,
                  error: 'Could not extract stats from Hendon Mob. The site may be temporarily blocking requests. Please try again in a few minutes.',
                  url: targetUrl,
              });
          }

          // Save to database
          const { error: updateError } = await getSupabase()
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
              return res.status(500).json({ success: false, error: 'Failed to save stats' });
          }

          return res.status(200).json({
              success: true,
              total_cashes: stats.totalCashes,
              total_earnings: stats.totalEarnings,
              best_finish: stats.bestFinish,
              biggest_cash: stats.biggestCash,
              source,
          });

      } catch (error) {
          console.error('Sync error:', error);
          return res.status(500).json({ success: false, error: 'Sync failed: ' + error.message });
      }

  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}

/**
 * Strategy 1: Direct scrape with rotating user-agents and full browser-like headers
 */
async function scrapeHendonMob(url) {
    for (const ua of USER_AGENTS) {
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': ua,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Referer': 'https://www.google.com/search?q=hendon+mob',
                    'Cache-Control': 'no-cache',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'cross-site',
                    'Sec-Fetch-User': '?1',
                    'Upgrade-Insecure-Requests': '1',
                    'Connection': 'keep-alive',
                },
            });

            if (response.status === 403 || response.status === 429) {
                console.log(`[HendonMob] Got ${response.status} with UA: ${ua.substring(0, 40)}...`);
                continue; // Try next UA
            }

            if (!response.ok) {
                console.log(`[HendonMob] Got ${response.status} for ${url}`);
                continue;
            }

            const html = await response.text();
            if (html.length < 500) continue; // Probably a block page

            return parseHendonMobHtml(html);
        } catch (e) {
            console.error(`[HendonMob] Fetch error with UA ${ua.substring(0, 30)}:`, e.message);
        }
    }
    return null;
}

/**
 * Strategy 2: Try Google's cached version of the page
 */
async function scrapeGoogleCache(url) {
    try {
        // Try Google webcache
        const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}&num=1&hl=en`;
        const response = await fetch(cacheUrl, {
            headers: {
                'User-Agent': USER_AGENTS[0],
                'Accept': 'text/html',
                'Accept-Language': 'en-US,en;q=0.9',
            },
        });

        if (response.ok) {
            const html = await response.text();
            if (html.length > 1000) {
                return parseHendonMobHtml(html);
            }
        }
    } catch (e) {
        console.log('[HendonMob] Google cache failed:', e.message);
    }
    return null;
}

/**
 * Strategy 3: Try alternative HendonMob endpoints (different URL formats)
 */
async function scrapeHendonMobAlt(playerId) {
    const altUrls = [
        `https://www.thehendonmob.com/player.php?a=r&n=${playerId}`,
        `https://pokerdb.thehendonmob.com/player.php?a=r&n=${playerId}`,
    ];

    for (const url of altUrls) {
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
                    'Accept': 'text/html,application/xhtml+xml',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Referer': 'https://www.thehendonmob.com/',
                },
                redirect: 'follow',
            });

            if (response.ok) {
                const html = await response.text();
                if (html.length > 500) {
                    return parseHendonMobHtml(html);
                }
            }
        } catch (e) {
            console.log(`[HendonMob] Alt fetch failed for ${url}:`, e.message);
        }
    }
    return null;
}

/**
 * Strategy 4: Search DuckDuckGo for player stats (fallback)
 */
async function searchForStats(playerName, hendonUrl) {
    try {
        const queries = [
            `${playerName} site:thehendonmob.com total live earnings`,
            `"${playerName}" poker tournament earnings cashes`,
        ];

        for (const query of queries) {
            const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
            const response = await fetch(url, {
                headers: { 'User-Agent': USER_AGENTS[0] },
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
                    return stats;
                }
            }
        }
    } catch (e) {
        console.log('[HendonMob] Search fallback failed:', e.message);
    }
    return null;
}

/**
 * Parse HendonMob HTML page with cheerio
 */
function parseHendonMobHtml(html) {
    const $ = cheerio.load(html);

    let totalCashes = null;
    let totalEarnings = null;
    let bestFinish = null;
    let biggestCash = null;

    // ── Parse structured tables ──────────────────────────────────────
    $('table').each((i, table) => {
        const tableText = $(table).text().toLowerCase();

        if (tableText.includes('cashes') || tableText.includes('earnings')) {
            $(table).find('tr').each((j, row) => {
                const cells = $(row).find('td');
                if (cells.length >= 2) {
                    const label = $(cells[0]).text().toLowerCase().trim();
                    const value = $(cells[1]).text().trim();

                    if (label.includes('cashes') && !totalCashes) {
                        const parsed = parseInt(value.replace(/,/g, ''), 10);
                        if (!isNaN(parsed)) totalCashes = parsed;
                    }
                    if ((label.includes('earnings') || label.includes('winnings')) && !totalEarnings) {
                        const parsed = parseFloat(value.replace(/[$,]/g, ''));
                        if (!isNaN(parsed)) totalEarnings = parsed;
                    }
                    if (label.includes('best') && label.includes('finish') && !bestFinish) {
                        bestFinish = value;
                    }
                }
            });
        }
    });

    // ── Regex fallback ───────────────────────────────────────────────
    if (!totalEarnings) {
        const earningsMatch = html.match(/Total\s+Live\s+Earnings[^$]*\$([\d,]+)/i);
        if (earningsMatch) {
            totalEarnings = parseFloat(earningsMatch[1].replace(/,/g, ''));
        }
    }

    if (!totalEarnings) {
        const dollarMatches = html.match(/\$[\d,]+(?:\.\d{2})?/g);
        if (dollarMatches && dollarMatches.length > 0) {
            const amounts = dollarMatches
                .map(s => parseFloat(s.replace(/[$,]/g, '')))
                .filter(n => !isNaN(n) && n > 0)
                .sort((a, b) => b - a);
            if (amounts.length > 0) totalEarnings = amounts[0];
        }
    }

    if (!totalCashes) {
        const cashesMatch = html.match(/(\d+)\s*(?:live\s*)?cashes/i);
        if (cashesMatch) {
            totalCashes = parseInt(cashesMatch[1], 10);
        }
    }

    // ── Biggest cash from results tables ─────────────────────────────
    $('table').each((i, table) => {
        const tableText = $(table).text();
        if (tableText.toLowerCase().includes('total live earnings')) return;

        const hasPrize = tableText.includes('$');
        const hasDate = tableText.toLowerCase().includes('date');
        const hasEvent = tableText.toLowerCase().includes('event') || tableText.toLowerCase().includes('tournament');

        if (hasPrize && (hasDate || hasEvent)) {
            $(table).find('tr').each((j, row) => {
                $(row).find('td').each((k, cell) => {
                    const cellText = $(cell).text();
                    const prizeMatch = cellText.match(/\$[\d,]+(?:\.\d{2})?/);
                    if (prizeMatch) {
                        const amount = parseFloat(prizeMatch[0].replace(/[$,]/g, ''));
                        if (totalEarnings && Math.abs(amount - totalEarnings) < 1) return;
                        if (!biggestCash || amount > biggestCash) {
                            biggestCash = amount;
                        }
                    }
                });
            });
        }
    });

    // ── Best finish ──────────────────────────────────────────────────
    if (!bestFinish) {
        if (html.match(/\b(1st|first|winner|champion)\b/i)) bestFinish = '1st';
        else if (html.match(/\b(2nd|second|runner.?up)\b/i)) bestFinish = '2nd';
        else if (html.match(/\b(3rd|third)\b/i)) bestFinish = '3rd';
        else {
            const placeMatch = html.match(/(\d+)(?:st|nd|rd|th)\s*(?:place)?/i);
            if (placeMatch) {
                const num = parseInt(placeMatch[1], 10);
                bestFinish = num === 1 ? '1st' : num === 2 ? '2nd' : num === 3 ? '3rd' : `${num}th`;
            }
        }
    }

    return { totalCashes, totalEarnings, bestFinish, biggestCash };
}

/**
 * Parse stats from search engine text snippets
 */
function parseStatsFromText(text) {
    let totalEarnings = null;
    let totalCashes = null;
    let bestFinish = null;
    let biggestCash = null;

    // Dollar amounts
    const dollarMatches = text.match(/\$[\d,]+(?:\.\d{2})?/g);
    if (dollarMatches && dollarMatches.length > 0) {
        const amounts = dollarMatches
            .map(s => parseInt(s.replace(/[$,\.]/g, ''), 10) / (s.includes('.') ? 100 : 1))
            .filter(n => !isNaN(n) && n > 0)
            .sort((a, b) => b - a);
        if (amounts.length > 0) {
            totalEarnings = amounts[0];
            biggestCash = amounts.length > 1 ? amounts[1] : null;
        }
    }

    // Cashes count
    const cashesPatterns = [/(\\d+)\s*(?:live\s*)?cashes/i, /(\d+)\s*results/i, /(\d+)\s*ITM/i];
    for (const pattern of cashesPatterns) {
        const match = text.match(pattern);
        if (match) { totalCashes = parseInt(match[1], 10); break; }
    }

    // Best finish
    if (text.match(/\b(1st|first|winner|champion)\b/i)) bestFinish = '1st';
    else if (text.match(/\b(2nd|second|runner.?up)\b/i)) bestFinish = '2nd';
    else if (text.match(/\b(3rd|third)\b/i)) bestFinish = '3rd';

    return { totalEarnings, totalCashes, bestFinish, biggestCash };
}

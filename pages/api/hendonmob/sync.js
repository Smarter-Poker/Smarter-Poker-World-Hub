/**
 * HENDONMOB SYNC API - Direct HTML Scraping
 * Scrapes HendonMob profile page directly using fetch + cheerio
 * POST /api/hendonmob/sync
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

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // Require JWT auth and verify caller
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

          // Use provided URL or the one saved in profile
          const targetUrl = hendonUrl || profile?.hendon_url;

          if (!targetUrl || !targetUrl.includes('thehendonmob.com')) {
              return res.status(400).json({
                  success: false,
                  error: 'Please enter a valid Hendon Mob profile URL (e.g., https://pokerdb.thehendonmob.com/player.php?a=r&n=YOUR_ID)'
              });
          }

          // ── Direct HTML scraping ──────────────────────────────────────────
          const stats = await scrapeHendonMob(targetUrl);

          if (!stats || (!stats.totalEarnings && !stats.totalCashes)) {
              return res.status(400).json({
                  success: false,
                  error: 'Could not extract stats from the Hendon Mob page. Please verify the URL is correct and the profile has tournament data.',
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
              source: 'direct_scrape',
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
 * Scrape HendonMob profile page directly
 * Returns { totalCashes, totalEarnings, bestFinish, biggestCash }
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
                'Cache-Control': 'no-cache',
            },
            signal: AbortSignal.timeout(30000), // 30s timeout
        });

        if (!response.ok) {
            throw new Error(`HendonMob returned HTTP ${response.status}`);
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        let totalCashes = null;
        let totalEarnings = null;
        let bestFinish = null;
        let biggestCash = null;

        // ── Method 1: Parse structured tables ──────────────────────────────
        // HendonMob profile pages have summary tables with labels like
        // "Total Live Earnings", "Cashes", etc.
        $('table').each((i, table) => {
            const tableText = $(table).text().toLowerCase();

            // Look for summary stats table (contains "cashes" or "earnings" labels)
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

        // ── Method 2: Regex fallback on full HTML ──────────────────────────
        if (!totalEarnings) {
            const earningsMatch = html.match(/Total\s+Live\s+Earnings[^$]*\$([\d,]+)/i);
            if (earningsMatch) {
                totalEarnings = parseFloat(earningsMatch[1].replace(/,/g, ''));
            }
        }

        if (!totalEarnings) {
            // Grab all dollar amounts ordered descending; largest is likely total earnings
            const dollarMatches = html.match(/\$[\d,]+(?:\.\d{2})?/g);
            if (dollarMatches && dollarMatches.length > 0) {
                const amounts = dollarMatches
                    .map(s => parseFloat(s.replace(/[$,]/g, '')))
                    .filter(n => !isNaN(n) && n > 0)
                    .sort((a, b) => b - a);
                if (amounts.length > 0) {
                    totalEarnings = amounts[0];
                }
            }
        }

        if (!totalCashes) {
            const cashesMatch = html.match(/(\d+)\s*(?:live\s*)?cashes/i);
            if (cashesMatch) {
                totalCashes = parseInt(cashesMatch[1], 10);
            }
        }

        // ── Biggest cash: scan tournament results tables ───────────────────
        $('table').each((i, table) => {
            const tableText = $(table).text();

            // Skip summary stats tables
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
                            // Skip if this equals total earnings (it's the summary, not a single cash)
                            if (totalEarnings && Math.abs(amount - totalEarnings) < 1) return;
                            if (!biggestCash || amount > biggestCash) {
                                biggestCash = amount;
                            }
                        }
                    });
                });
            }
        });

        // ── Best finish ────────────────────────────────────────────────────
        if (!bestFinish) {
            if (html.match(/\b(1st|first|winner|champion)\b/i)) {
                bestFinish = '1st';
            } else if (html.match(/\b(2nd|second|runner.?up)\b/i)) {
                bestFinish = '2nd';
            } else if (html.match(/\b(3rd|third)\b/i)) {
                bestFinish = '3rd';
            } else {
                const placeMatch = html.match(/(\d+)(?:st|nd|rd|th)\s*(?:place)?/i);
                if (placeMatch) {
                    const num = parseInt(placeMatch[1], 10);
                    bestFinish = num === 1 ? '1st' : num === 2 ? '2nd' : num === 3 ? '3rd' : `${num}th`;
                }
            }
        }

        return { totalCashes, totalEarnings, bestFinish, biggestCash };

    } catch (error) {
        console.error('Scrape error for', url, ':', error.message);
        throw error;
    }
}

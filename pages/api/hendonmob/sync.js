/**
 * HENDONMOB SYNC API - Accepts Client-Scraped Stats
 * 
 * Two modes:
 * 1. Client sends pre-scraped stats (from browser-side fetch via CORS proxy)
 * 2. Server attempts direct scrape as fallback
 * 
 * POST /api/hendonmob/sync
 * Body: { hendonUrl, stats?: { totalCashes, totalEarnings, bestFinish, biggestCash } }
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

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

    // Require JWT auth
    const _token = req.headers.authorization?.replace('Bearer ', '');
    if (!_token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { data: { user: _authUser }, error: _authErr } = await getSupabase().auth.getUser(_token);
    if (_authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

    const userId = _authUser.id;
    const { hendonUrl, stats: clientStats } = req.body;

    try {
        // Validate hendon URL
        const { data: profile } = await getSupabase()
            .from('profiles')
            .select('full_name, hendon_url')
            .eq('id', userId)
            .maybeSingle();

        const targetUrl = hendonUrl || profile?.hendon_url;

        if (!targetUrl || !targetUrl.includes('thehendonmob.com')) {
            return res.status(400).json({
                success: false,
                error: 'Please enter a valid Hendon Mob profile URL'
            });
        }

        // Use client-scraped stats if provided (browser can fetch HendonMob without 403)
        let stats = null;
        let source = 'unknown';

        if (clientStats && (clientStats.totalCashes || clientStats.totalEarnings)) {
            // Validate the client-provided stats are reasonable numbers
            const tc = parseInt(clientStats.totalCashes, 10);
            const te = parseFloat(clientStats.totalEarnings);
            const bc = clientStats.biggestCash ? parseFloat(clientStats.biggestCash) : null;

            // Basic sanity check: numbers must be positive and reasonable
            if ((tc > 0 || te > 0) && tc < 100000 && te < 500000000) {
                stats = {
                    totalCashes: tc || null,
                    totalEarnings: te || null,
                    bestFinish: clientStats.bestFinish || null,
                    biggestCash: bc || null,
                };
                source = 'client_scrape';
            }
        }

        if (!stats || (!stats.totalEarnings && !stats.totalCashes)) {
            return res.status(400).json({
                success: false,
                error: 'Could not extract stats. The browser may have been unable to reach HendonMob. Please try again.',
                needsClientScrape: true,
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

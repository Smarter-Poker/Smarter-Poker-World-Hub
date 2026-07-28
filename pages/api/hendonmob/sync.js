/**
 * HENDONMOB SYNC API
 * 
 * Accepts client-provided stats (from manual entry or Scrapling scraper)
 * and saves them to the database. Columns:
 * - hendon_total_cashes
 * - hendon_total_earnings
 * - hendon_biggest_cash
 * 
 * POST /api/hendonmob/sync
 * Body: { hendonUrl, stats: { totalCashes, totalEarnings, biggestCash } }
 * 
 * GET /api/hendonmob/sync  — returns current stats from DB
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

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

    // Require JWT auth
    const _token = req.headers.authorization?.replace('Bearer ', '');
    if (!_token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const _authUser = authData?.user;
    if (_authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

    const userId = _authUser.id;

    // ── GET: return current stats from DB ──
    if (req.method === 'GET') {
        const { data: profile } = await getSupabase()
            .from('profiles')
            .select('hendon_url, hendon_total_cashes, hendon_total_earnings, hendon_biggest_cash')
            .eq('id', userId)
            .maybeSingle();

        return res.status(200).json({
            success: true,
            total_cashes: profile?.hendon_total_cashes ?? null,
            total_earnings: profile?.hendon_total_earnings ?? null,
            biggest_cash: profile?.hendon_biggest_cash ?? null,
            hendon_url: profile?.hendon_url ?? null,
            source: 'database',
        });
    }

    // ── POST: save stats ──
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { hendonUrl, stats: clientStats } = req.body;

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

    // Validate client-provided stats
    if (!clientStats || (clientStats.totalCashes == null && clientStats.totalEarnings == null)) {
        return res.status(400).json({
            success: false,
            error: 'No stats provided. Please enter your cashes and/or earnings.',
        });
    }

    const tc = clientStats.totalCashes != null ? parseInt(clientStats.totalCashes, 10) : null;
    const te = clientStats.totalEarnings != null ? parseFloat(clientStats.totalEarnings) : null;
    const bc = clientStats.biggestCash != null ? parseFloat(clientStats.biggestCash) : null;

    // Basic sanity check — values must be non-negative and within reason
    if ((tc != null && (isNaN(tc) || tc < 0 || tc >= 100000)) ||
        (te != null && (isNaN(te) || te < 0 || te >= 500000000))) {
        return res.status(400).json({
            success: false,
            error: 'Invalid stats values. Cashes must be 0-99999, earnings must be non-negative.',
        });
    }

    // Build update — only include fields that have real values
    const updateData = {};
    if (tc != null && !isNaN(tc)) updateData.hendon_total_cashes = tc;
    if (te != null && !isNaN(te)) updateData.hendon_total_earnings = te;
    if (bc != null && !isNaN(bc) && bc >= 0) updateData.hendon_biggest_cash = bc;

    if (Object.keys(updateData || {}).length === 0) {
        return res.status(400).json({
            success: false,
            error: 'No valid stats to save.',
        });
    }

    {
        const { error: updateError } = await getSupabase()
            .from('profiles')
            .update(updateData)
            .eq('id', userId);

        if (updateError) {
            console.warn('Update error:', updateError);
            return res.status(500).json({ success: false, error: 'Failed to save stats' });
        }

        return res.status(200).json({
            success: true,
            total_cashes: tc ?? null,
            total_earnings: te ?? null,
            biggest_cash: bc ?? null,
            source: 'client_update',
        });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

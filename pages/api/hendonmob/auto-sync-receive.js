/**
 * HENDONMOB AUTO-SYNC RECEIVE ENDPOINT
 * 
 * Receives scraped stats from Manus AI agent and saves to DB.
 * REAL DATA ONLY — only saves what Manus explicitly extracted.
 * 
 * POST /api/hendonmob/auto-sync-receive
 * Body: { userId, stats: { totalCashes, totalEarnings, biggestCash } }
 * Header: X-Hendon-Sync-Token: <the one-run token auto-sync.js minted>
 *     or Authorization: Bearer <CRON_SECRET> (or x-admin-secret: <ADMIN_ROUTE_SECRET>)
 *
 * 2026-10-05 privacy audit: this used to accept X-Auto-Sync-Key with
 * HENDON_AUTO_SYNC_SECRET, and auto-sync.js pasted that same secret into
 * every prompt it sent to Manus, so the secret lives in a third party's task
 * history. It now accepts a server-side operator credential, or the one-run
 * token auto-sync.js minted for this Manus task: found by its SHA-256 in
 * public.hendon_sync_tokens, unexpired, unrevoked, and naming this userId.
 */

import crypto from 'crypto';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { requestHasPokerOpsSecret } from '../../../src/lib/poker-near-me/opsReadAuth';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

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

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'POST only' });
    }

    const { userId, stats } = req.body || {};

    if (!userId || !stats) {
        return res.status(400).json({ error: 'userId and stats required' });
    }

    // Validate userId is a UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
        return res.status(400).json({ error: 'Invalid userId format - must be a valid UUID' });
    }

    // Auth: a header-only operator secret (CRON_SECRET / ADMIN_ROUTE_SECRET),
    // or the one-run token of the Manus task that queued THIS account.
    let authorized = requestHasPokerOpsSecret(req);
    if (!authorized) {
        const raw = req.headers['x-hendon-sync-token'];
        const runToken = typeof raw === 'string' ? raw.trim() : '';
        if (/^[0-9a-f]{64}$/.test(runToken)) {
            const tokenHash = crypto.createHash('sha256').update(runToken).digest('hex');
            const { data: grant } = await getSupabase()
                .from('hendon_sync_tokens')
                .select('id')
                .eq('token_hash', tokenHash)
                .is('revoked_at', null)
                .gt('expires_at', new Date().toISOString())
                .contains('user_ids', [userId])
                .maybeSingle();
            authorized = Boolean(grant?.id);
        }
    }
    if (!authorized) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Build update — ONLY include fields that have real values
    const updateData = {};
    
    if (stats.totalCashes != null && !isNaN(stats.totalCashes)) {
        updateData.hendon_total_cashes = parseInt(stats.totalCashes, 10);
    }
    if (stats.totalEarnings != null && !isNaN(stats.totalEarnings)) {
        updateData.hendon_total_earnings = parseFloat(stats.totalEarnings);
    }
    if (stats.biggestCash != null && !isNaN(stats.biggestCash)) {
        updateData.hendon_biggest_cash = parseFloat(stats.biggestCash);
    }

    if (Object.keys(updateData || {}).length === 0) {
        return res.status(200).json({
            success: true,
            message: 'No valid stats to update',
            userId,
        });
    }

    try {
        const { error } = await getSupabase()
            .from('profiles')
            .update(updateData)
            .eq('id', userId);

        if (error) {
            console.warn('DB update error:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }

        console.debug(`[Auto-Sync] Updated user ${userId}:`, updateData);

        return res.status(200).json({
            success: true,
            userId,
            updated: updateData,
        });
    } catch (err) {
        try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
        console.warn('[Auto-Sync Receive Error]', err);
        return res.status(500).json({ error: err.message });
    }

  } catch (err) {
    console.warn('[API] Unhandled exception in handler:', err?.message || err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal server error', message: err?.message || 'Unknown error' });
    }
  }
}

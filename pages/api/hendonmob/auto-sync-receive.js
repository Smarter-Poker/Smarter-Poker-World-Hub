/**
 * HENDONMOB AUTO-SYNC RECEIVE ENDPOINT
 * 
 * Receives scraped stats from Manus AI agent and saves to DB.
 * REAL DATA ONLY — only saves what Manus explicitly extracted.
 * 
 * POST /api/hendonmob/auto-sync-receive
 * Body: { userId, stats: { totalCashes, totalEarnings, biggestCash } }
 * Header: X-Auto-Sync-Key: <secret>
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/apiErrorHandler';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

const AUTO_SYNC_SECRET = process.env.HENDON_AUTO_SYNC_SECRET || '';

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

    // Auth via secret key
    const secretKey = req.headers['x-auto-sync-key'];
    if (!secretKey || !AUTO_SYNC_SECRET || secretKey !== AUTO_SYNC_SECRET) {
        return res.status(401).json({ error: 'Invalid sync key' });
    }

    const { userId, stats } = req.body;

    if (!userId || !stats) {
        return res.status(400).json({ error: 'userId and stats required' });
    }

    // Validate userId is a UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
        return res.status(400).json({ error: 'Invalid userId format - must be a valid UUID' });
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

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  GET /api/store/diamond-transactions
 *  Returns the authenticated user's diamond transaction history
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
const { getServerUserWithFallback } = require('../../../src/lib/serverAuth');
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
      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // ENH-H: Rate limit to prevent abuse
      if (!applyRateLimit(req, res, LIMITS.read)) return;

      try {
          // Auth: local HMAC verify first, GoTrue network fallback if JWT secret missing
          const { user: localUser } = await getServerUserWithFallback(req, getSupabase());
          if (!localUser) {
              return res.status(401).json({ success: false, error: 'Authorization required' });
          }
          const userId = localUser.id;

          // Parse query params
          const limit = Math.min(parseInt(req.query.limit) || 50, 100);
          const offset = parseInt(req.query.offset) || 0;

          // ── BUG-1 FIX: Always fetch all types, client filters locally ──
          // No server-side type filter — client handles all filtering
          const query = getSupabase()
              .from('diamond_transactions')
              .select('*', { count: 'exact' })
              .eq('user_id', userId)
              .order('created_at', { ascending: false })
              .range(offset, offset + limit - 1);

          const { data, count, error } = await query;

          if (error) {
              console.warn('Transaction fetch error:', error);
              return res.status(500).json({ success: false, error: 'Failed to fetch transactions' });
          }

          // Also get current balance
          const { data: profile } = await getSupabase()
              .from('profiles')
              .select('diamonds, vip_expires_at')
              .eq('id', userId)
              .maybeSingle();

          // ── PERF-3: Allow browser to cache for 30s (rapid re-opens) ──
          res.setHeader('Cache-Control', 'private, max-age=30');

          return res.status(200).json({
              success: true,
              transactions: data || [],
              total: count || 0,
              balance: profile?.diamonds ?? 0,
              vip_expiration_date: profile?.vip_expires_at || null,
              limit,
              offset,
          });
      } catch (err) {
          console.warn('Diamond transactions error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * BANKROLL PROJECTION API
 * ═══════════════════════════════════════════════════════════════════════
 * Monte Carlo simulation for bankroll growth projections (on-demand only)
 * ═══════════════════════════════════════════════════════════════════════
 */

import { getServiceSupabase as getSupabase } from '../../../src/lib/apiSupabase';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { checkServerFeatureAccess } from '../../../src/lib/gates/serverFeatureGate';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { MIN_SESSIONS, projectionInputs, runProjection, sessionResults } from '../../../src/lib/bankroll/projectionMath.mjs';



export default async function handler(req, res) {
  try {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          if (!applyRateLimit(req, res, LIMITS.write)) return;
      }

      // BUG #249 FIX: Require JWT auth — prevent IDOR on bankroll data
      const _token = req.headers.authorization?.replace('Bearer ', '');
      if (!_token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const _authUser = authData?.user;
      if (authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      const inputs = projectionInputs(req.body || {});
      if (inputs.error) return res.status(400).json({ success: false, message: inputs.error });
      // BUG #240 FIX: Use JWT identity, not client-submitted userId
      const userId = _authUser.id;

      // SERVER-SIDE GUARD: Verify user has Bankroll Pro access
      const access = await checkServerFeatureAccess(getSupabase(), userId, 'bankroll_pro');
      if (!access.hasAccess) {
          return res.status(403).json({ success: false, error: 'Premium feature access required' });
      }

      try {
          // The last 100 gaming sessions: current rows only, no deposits,
          // withdrawals or expenses.
          const { data: entries, error } = await getSupabase()
              .from('bankroll_ledger')
              .select('gross_in, gross_out, entry_date, category, is_revision')
              .eq('user_id', userId)
              .eq('is_revision', false)
              .in('category', ['poker_cash', 'poker_mtt', 'casino_table', 'slots', 'sports'])
              .order('entry_date', { ascending: false })
              .order('created_at', { ascending: false })
              .limit(100);

          if (error) {
              console.warn('[Projection] Error:', error);
              return res.status(500).json({ success: false, message: 'Your sessions could not be read. Try again.' });
          }

          const results = sessionResults(entries || []);
          if (results.length < MIN_SESSIONS) {
              return res.status(200).json({
                  success: false,
                  message: `Log at least ${MIN_SESSIONS} gaming sessions to run a projection (you have ${results.length})`,
                  minRequired: MIN_SESSIONS,
                  currentCount: results.length
              });
          }

          return res.status(200).json({ success: true, ...runProjection(results, inputs) });

      } catch (error) {
          console.warn('[Projection] Server error:', error);
          return res.status(500).json({ success: false, error: 'Projection failed' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

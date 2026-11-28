import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * BANKROLL EXPORT API
 * Generate CSV or JSON export of ledger data (on-demand, user-initiated only)
 */

import { getServiceSupabase as getSupabase } from '../../../src/lib/apiSupabase';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { checkServerFeatureAccess } from '../../../src/lib/gates/serverFeatureGate';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { exportRow, fetchAllRows, ledgerCsv, summarizeLedger } from '../../../src/lib/bankroll/ledgerReport.mjs';


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

      // ═══ PREMIUM GATE ═══
      const access = await checkServerFeatureAccess(getSupabase(), _authUser.id, 'bankroll_pro');
      if (!access.hasAccess) {
          return res.status(403).json({ success: false, error: 'Premium feature access required' });
      }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      const { format = 'csv', dateRange } = req.body;

      // BUG #239 FIX: Use JWT user_id, not client-submitted userId (IDOR prevention)
      const userId = _authUser.id;

      try {
          // Every row, a page at a time: the old 500-row limit silently dropped
          // everything older than a player's 500th entry from the file.
          const entries = await fetchAllRows(() => {
              let query = getSupabase()
                  .from('bankroll_ledger')
                  .select('*')
                  .eq('user_id', userId)
                  .eq('is_revision', false);
              if (dateRange?.start) query = query.gte('entry_date', dateRange.start);
              if (dateRange?.end) query = query.lte('entry_date', dateRange.end);
              return query
                  .order('entry_date', { ascending: false })
                  .order('created_at', { ascending: false })
                  .order('id', { ascending: false });
          });

          if (!entries || entries.length === 0) {
              return res.status(200).json({
                  success: false,
                  message: 'No entries to export'
              });
          }

          const exportData = entries.map(exportRow);
          const totals = summarizeLedger(entries);
          // The client names the file with the player's own calendar day.
          const day = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.today || '')) ? req.body.today : new Date().toISOString().slice(0, 10);
          const summary = {
              entries: entries.length,
              sessions: totals.sessions,
              totalIn: totals.totalBuyIns,
              totalOut: totals.totalCashOuts,
              netPL: totals.sessionNet,
              expenses: totals.expenses,
              netAfterExpenses: totals.netAfterExpenses,
              deposits: totals.deposits,
              withdrawals: totals.withdrawals,
          };

          if (format === 'csv') {
              return res.status(200).json({
                  success: true,
                  format: 'csv',
                  filename: `bankroll_export_${day}.csv`,
                  content: ledgerCsv(exportData),
                  summary,
              });
          }

          // JSON format
          return res.status(200).json({
              success: true,
              format: 'json',
              filename: `bankroll_export_${day}.json`,
              data: exportData.map(({ category_id, ...row }) => row),
              summary: {
                  ...summary,
                  dateRange: {
                      earliest: entries[entries.length - 1]?.entry_date,
                      latest: entries[0]?.entry_date
                  }
              }
          });

      } catch (error) {
          console.warn('[Export] Server error:', error);
          return res.status(500).json({ success: false, error: 'Export failed' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

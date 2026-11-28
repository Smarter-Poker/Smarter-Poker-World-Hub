import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * BANKROLL EXPORT API
 * Generate CSV or JSON export of ledger data (on-demand, user-initiated only)
 */

import { getServiceSupabase as getSupabase } from '../../../src/lib/apiSupabase';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { checkServerFeatureAccess } from '../../../src/lib/gates/serverFeatureGate';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { clientDay, exportRequest, guardBankrollRequest } from '../../../src/lib/bankroll/apiGuard.mjs';
import { exportRow, fetchAllRows, ledgerCsv, summarizeLedger } from '../../../src/lib/bankroll/ledgerReport.mjs';


export default async function handler(req, res) {
  try {
      if (!applyRateLimit(req, res, LIMITS.write)) return;

      // Method, token and identity in one place (src/lib/bankroll/apiGuard.mjs):
      // a GET is 405 with Allow, a session-service outage is 503, not "sign in".
      const _authUser = await guardBankrollRequest(req, res, {
          methods: ['POST'],
          verify: (request) => getServerUserWithFallback(request, getSupabase()),
      });
      if (!_authUser) return;

      // ═══ PREMIUM GATE ═══
      const access = await checkServerFeatureAccess(getSupabase(), _authUser.id, 'bankroll_pro');
      if (!access.hasAccess) {
          return res.status(403).json({ success: false, error: 'Premium feature access required' });
      }

      // A bad date used to reach PostgREST and come back as a 500.
      const input = exportRequest(req.body);
      if (input.error) return res.status(400).json({ success: false, error: input.error });
      const { format } = input;

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
              if (input.start) query = query.gte('entry_date', input.start);
              if (input.end) query = query.lte('entry_date', input.end);
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
          const day = clientDay(req.body?.today);
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

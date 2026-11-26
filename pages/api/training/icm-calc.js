/**
 * API: ICM Calculator — Tournament Chip-to-Dollar Equity
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * POST /api/training/icm-calc
 *
 * Body: {
 *   stacks: [5000, 3000, 2000, 1000],   // chip counts
 *   prizes: [50, 30, 20],               // prize % or dollar amounts
 *   prizePool: 1000                     // total prize pool (optional if prizes are $)
 * }
 *
 * Returns ICM equity for each player using Malmuth-Harville model.
 *
 * Public calculator (Dan, 2026-10-12: "THEY SHOULD OPEN TO EVERYONE."). The
 * computation is pure: it reads and writes nothing in the database and nothing
 * per-user, so no token is required. The rate limit and validation remain.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/apiErrorHandler';

// ●●● Malmuth-Harville ICM Model ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Recursively calculates ICM equity using the Harville method.
 * For each finishing position, the probability of a player finishing in that
 * position is proportional to their chip share of the remaining chips.
 *
 * @param {number[]} stacks - Array of chip stacks
 * @param {number[]} prizes - Array of prize amounts (descending order)
 * @returns {number[]} ICM equity for each player in dollars
 */
import { tournamentEquity } from '../../../src/lib/poker/tournamentEquity.js';

// HANDLER
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default async function handler(req, res) {
  try {
      withTiming(res);
      if (!applyRateLimit(req, res, LIMITS.write)) return;

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'POST only' });
      }

      // Body size guard — stack/prize arrays are bounded
      const bodySize = JSON.stringify(req.body || {}).length;
      if (bodySize > 10240) {
          return res.status(413).json({ success: false, error: 'Request body too large' });
      }

      try {
          return res.status(200).json(tournamentEquity(req.body || {}));
      } catch (err) {
          if (err instanceof RangeError) return res.status(400).json({ success: false, error: err.message });
          console.warn('[ICM-Calc] Error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

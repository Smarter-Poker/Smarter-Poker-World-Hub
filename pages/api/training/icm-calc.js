import { getServerUserWithFallback } from '../../src/lib/serverAuth';
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
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';

// ●● Lazy Supabase getter (SSG-safe) ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        _supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }
    return _supabase;
}
// ●●● Malmuth-Harville ICM Model ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Recursively calculates ICM equity using the Harville method.
 * For each finishing position, the probability of a player finishing in that
 * position is proportional to their chip share of the remaining chips.
 *
 * @param {number[]} stacks - Array of chip stacks
 * @param {number[]} prizes - Array of prize amounts (descending order)
 * @returns {number[]} ICM equity for each player in dollars
 */
function computeICM(stacks, prizes) {
    // More prizes than players inflates every equity — truncate to player count
    prizes = (prizes || []).slice(0, stacks.length);
    const n = stacks.length;
    const totalChips = stacks.reduce((sum, s) => sum + s, 0);

    if (totalChips === 0) return stacks.map(() => 0);
    if (n === 1) return [prizes[0] || 0];

    const equities = new Array(n).fill(0);

    // Recursive helper: calculate probability of each player finishing in each position
    function recurse(remainingIndices, prizeIndex, probability) {
        if (prizeIndex >= prizes.length || remainingIndices.length === 0) return;
        if (remainingIndices.length === 1) {
            // Last player gets remaining prize(s)
            const idx = remainingIndices[0];
            let remainingPrize = 0;
            for (let p = prizeIndex; p < prizes.length; p++) {
                remainingPrize += prizes[p];
            }
            equities[idx] += probability * remainingPrize;
            return;
        }

        const remainingChips = remainingIndices.reduce((sum, i) => sum + stacks[i], 0);
        if (remainingChips === 0) return;

        for (const idx of remainingIndices) {
            const playerProb = stacks[idx] / remainingChips;
            if (playerProb <= 0) continue;

            // This player finishes in current position
            equities[idx] += probability * playerProb * prizes[prizeIndex];

            // Recurse for remaining players in next position
            const newRemaining = remainingIndices.filter(i => i !== idx);
            recurse(newRemaining, prizeIndex + 1, probability * playerProb);
        }
    }

    const allIndices = Array.from({ length: n }, (_, i) => i);
    recurse(allIndices, 0, 1.0);

    return equities;
}

/**
 * Calculate bubble factor — measures how much more valuable a chip is
 * for survival vs. accumulation near the money bubble.
 */
function computeBubbleFactor(stacks, prizes) {
    const n = stacks.length;
    const totalChips = stacks.reduce((sum, s) => sum + s, 0);
    if (totalChips === 0 || n < 2) return 1.0;

    const equities = computeICM(stacks, prizes);
    const chipEVs = stacks.map(s => (s / totalChips) * prizes.reduce((a, b) => a + b, 0));

    // Average ratio of ICM equity to chip EV
    let sumRatio = 0;
    let count = 0;
    for (let i = 0; i < n; i++) {
        if (chipEVs[i] > 0) {
            sumRatio += equities[i] / chipEVs[i];
            count++;
        }
    }

    // Bubble factor > 1 means chips are worth less than their linear chip value
    // (typical near the bubble)
    return count > 0 ? Math.round((sumRatio / count) * 100) / 100 : 1.0;
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
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
          // Auth check
          const token = req.headers.authorization?.replace('Bearer ', '');
          if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          const user = authData?.user;
          if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

          const { stacks = [], prizes = [], prizePool } = req.body;

          // Validation
          if (!Array.isArray(stacks) || stacks.length < 2) {
              return res.status(400).json({ success: false, error: 'Need at least 2 players' });
          }
          if (stacks.length > 9) {
              return res.status(400).json({ success: false, error: 'Maximum 9 players' });
          }
          if (!Array.isArray(prizes) || prizes.length === 0) {
              return res.status(400).json({ success: false, error: 'Prize structure required' });
          }

          // Parse stacks
          const parsedStacks = stacks.map(s => Math.max(0, parseInt(s, 10) || 0));
          const totalChips = parsedStacks.reduce((sum, s) => sum + s, 0);

          if (totalChips === 0) {
              return res.status(400).json({ success: false, error: 'Total chips must be > 0' });
          }

          // Parse prizes — if prizePool provided, treat prizes as percentages
          let parsedPrizes;
          const pool = parseFloat(prizePool) || 0;

          if (pool > 0) {
              // Prizes are percentages
              parsedPrizes = prizes.map(p => (parseFloat(p) || 0) / 100 * pool);
          } else {
              // Prizes are dollar amounts
              parsedPrizes = prizes.map(p => parseFloat(p) || 0);
          }

          const totalPrize = parsedPrizes.reduce((sum, p) => sum + p, 0);

          // Compute ICM
          const icmEquities = computeICM(parsedStacks, parsedPrizes);
          const bubbleFactor = computeBubbleFactor(parsedStacks, parsedPrizes);

          // Build results
          const results = parsedStacks.map((chips, i) => {
              const chipPct = totalChips > 0 ? (chips / totalChips) * 100 : 0;
              const chipEV = totalPrize > 0 ? (chipPct / 100) * totalPrize : 0;
              const icmDollars = icmEquities[i] || 0;
              const icmPct = totalPrize > 0 ? (icmDollars / totalPrize) * 100 : 0;
              const difference = icmDollars - chipEV;

              return {
                  player: i + 1,
                  chips,
                  chipPct: Math.round(chipPct * 10) / 10,
                  chipEV: Math.round(chipEV * 100) / 100,
                  icmDollars: Math.round(icmDollars * 100) / 100,
                  icmPct: Math.round(icmPct * 10) / 10,
                  difference: Math.round(difference * 100) / 100,
              };
          });

          return res.status(200).json({
              success: true,
              results,
              totalChips,
              totalPrizePool: Math.round(totalPrize * 100) / 100,
              bubbleFactor,
          });

      } catch (err) {
          console.warn('[ICM-Calc] Error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

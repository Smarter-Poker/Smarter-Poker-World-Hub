import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * API: Runout Report — Turn/River EV Impact Analysis
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * GET /api/training/runout-report
 *
 * Query params:
 *   scenarioHash: current scenario hash (the Flop/Turn node)
 *   gameType: game type (optional extra filter)
 *   stackDepth: stack depth (optional extra filter)
 *
 * Returns:
 *   { success, runouts: [{ card, ev_delta, eq_shift, has_data }] }
 *   Covers all 52 cards — 49 non-dead (3 on flop, or 4 on turn).
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { parseBoardFromHash, sanitizeParam, withTiming } from '../../../src/utils/trainingApiUtils';
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
// Card constants for building 52-card deck (used by runout simulation)
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['s', 'h', 'd', 'c'];
/**
 * Calculate aggregate "strategy aggression" as a proxy for EV
 * when hand_evs is not available. Higher raise/bet frequency = higher EV spot for IP player.
 */
function calculateAggressionIndex(strategyMatrix) {
    if (!strategyMatrix) return 0;
    const actions = strategyMatrix.actions || [];
    const frequencies = strategyMatrix.frequencies || {};

    let totalBetRaise = 0;
    let totalCheckCall = 0;
    let totalFold = 0;
    let handCount = 0;

    for (const action of actions) {
        const freqs = frequencies[action] || {};
        const a = action.toLowerCase();
        const isBetRaise = a === 'r' || a === 'b' || a === 'raise' || a === 'bet' || a === 'allin';
        const isFold = a === 'f' || a === 'fold';

        for (const [hand, freq] of Object.entries(freqs || {})) {
            if (freq > 0) {
                if (isBetRaise) totalBetRaise += freq;
                else if (isFold) totalFold += freq;
                else totalCheckCall += freq;
                handCount++;
            }
        }
    }

    // Aggression index: (bet+raise) - fold as a EV proxy
    const total = totalBetRaise + totalCheckCall + totalFold;
    if (total === 0) return 0;
    return ((totalBetRaise - totalFold) / total) * 100;
}

export default async function handler(req, res) {
  try {
      withTiming(res);
      if (!applyRateLimit(req, res, LIMITS.read)) return;

      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          // Auth check
          const token = req.headers.authorization?.replace('Bearer ', '');
          if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          const user = authData?.user;
          if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

          const { scenarioHash } = req.query;

          if (!scenarioHash) {
              return res.status(400).json({ success: false, error: 'scenarioHash is required' });
          }

          // Sanitize scenarioHash before using in .ilike() pattern query
          const safeHash = sanitizeParam(scenarioHash, 200);

          // Parse current board from hash
          const currentBoard = parseBoardFromHash(scenarioHash);
          const deadSet = new Set(currentBoard.map(c => c.toLowerCase()));

          // Build all 52 cards
          const allCards = [];
          for (const rank of RANKS) {
              for (const suit of SUITS) {
                  allCards.push(`${rank}${suit}`);
              }
          }

          // Get current spot's aggression index as baseline
          const { data: currentSpot } = await getSupabase()
              .from('solved_spots_gold')
              .select('strategy_matrix')
              .eq('scenario_hash', safeHash)
              .maybeSingle();

          const baselineAggression = currentSpot
              ? calculateAggressionIndex(currentSpot.strategy_matrix)
              : 0;

          // Query all child spots for possible runout cards
          // A child has the same scenario_hash but with 2 more characters (one more card)
          // Use the full current hash + 2 wildcard chars for precision

          const { data: childSpots, error } = await getSupabase()
              .from('solved_spots_gold')
              .select('scenario_hash, strategy_matrix, hand_evs')
              .ilike('scenario_hash', `${safeHash}__`)
              .limit(200);

          if (error) {
              console.warn('[RunoutReport] Query error:', error);
              return res.status(500).json({ success: false, error: 'Database query failed' });
          }

          // Build a map of next-card → child spot data
          const childMap = {};
          (childSpots || []).forEach(spot => {
              const childBoard = parseBoardFromHash(spot.scenario_hash);
              // Only consider spots that are exactly 1 card deeper
              if (childBoard.length === currentBoard.length + 1) {
                  const nextCard = childBoard[currentBoard.length];
                  if (nextCard) {
                      const childAggression = calculateAggressionIndex(spot.strategy_matrix);
                      childMap[nextCard.toLowerCase()] = {
                          aggression: childAggression,
                          ev_delta: childAggression - baselineAggression,
                          handEvs: spot.hand_evs,
                      };
                  }
              }
          });

          // Build the runout report for all 52 cards
          const runouts = {};
          allCards.forEach(card => {
              const key = card.toLowerCase();
              const isDead = deadSet.has(key);
              const childData = childMap[key];

              runouts[card] = {
                  card,
                  is_dead: isDead,
                  has_data: !isDead && !!childData,
                  ev_delta: childData?.ev_delta ?? null,
                  eq_shift: childData?.ev_delta ? (childData.ev_delta > 0 ? 'positive' : 'negative') : null,
              };
          });

          return res.status(200).json({
              success: true,
              runouts,
              currentBoard,
              childrenFound: Object.keys(childMap || {}).length,
              baselineAggression: Math.round(baselineAggression * 100) / 100,
          });

      } catch (err) {
          console.warn('[RunoutReport] Error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

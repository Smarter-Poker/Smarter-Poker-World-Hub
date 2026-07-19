/**
 * API: Spot Drill — Random Postflop GTO Quiz Spot
 * ═══════════════════════════════════════════════════════════════════════════
 * GET /api/training/spot-drill
 *
 * Query params:
 *   format: 'cash' | 'mtt' (default: all)
 *   position: 'BTN' | 'SB' | 'BB' | 'CO' etc (optional)
 *   stack: number (e.g., 100) (optional)
 *
 * Returns a random spot from solved_spots_gold with:
 *   - Board cards, hero hand, position, street
 *   - Correct GTO action + frequency
 *   - 3-4 action options (correct + distractors)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { parseBoardFromHash, extractPositionFromHash, sanitizeParam, withTiming } from '../../../src/utils/trainingApiUtils';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

// ── Lazy Supabase getter (SSG-safe) ─────────────────────────────
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
// ─── Helpers ──────────────────────────────────────────────────────────



function getStreetFromBoard(board) {
    if (board.length >= 5) return 'River';
    if (board.length >= 4) return 'Turn';
    if (board.length >= 3) return 'Flop';
    return 'Preflop';
}

// Standard GTO action distractor pool
const ACTION_POOL = [
    'Bet 33%', 'Bet 50%', 'Bet 66%', 'Bet 75%', 'Bet 100%', 'Bet 125%', 'Bet 150%',
    'Check', 'Fold', 'Call', 'Raise 2.5x', 'Raise 3x', 'All-In',
];

function generateOptions(correctAction, allActions) {
    const options = [correctAction];
    // Add other real actions from this spot first
    const otherReal = allActions.filter(a => a !== correctAction);
    for (const action of otherReal) {
        if (options.length >= 4) break;
        options.push(action);
    }
    // Fill remaining with distractors from the pool (Fisher-Yates shuffle)
    const shuffledPool = [...ACTION_POOL];
    for (let i = shuffledPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledPool[i], shuffledPool[j]] = [shuffledPool[j], shuffledPool[i]];
    }
    for (const action of shuffledPool) {
        if (options.length >= 4) break;
        const normalized = action.toLowerCase().trim();
        if (!options.some(o => o.toLowerCase().trim() === normalized)) {
            options.push(action);
        }
    }
    // Shuffle options with Fisher-Yates
    for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
    }
    return options;
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  try {
      withTiming(res);
      if (!applyRateLimit(req, res, LIMITS.read)) return;

      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'GET only' });
      }

      try {
          // Auth check
          const token = req.headers.authorization?.replace('Bearer ', '');
          if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
          const { data: authData, error: authErr } = await getSupabase().auth.getUser(token);
          const user = authData?.user;
          if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

          const { format, position, stack } = req.query;

          // Build query — get a random offset from total count
          let countQuery = getSupabase()
              .from('solved_spots_gold')
              .select('id', { count: 'exact', head: true });

          if (format === 'cash') countQuery = countQuery.ilike('game_type', '%cash%');
          if (format === 'mtt') countQuery = countQuery.ilike('game_type', '%mtt%');
          if (position) { const safePos = sanitizeParam(position, 10); if (safePos) countQuery = countQuery.ilike('scenario_hash', `%_${safePos}_%`); }
          if (stack) countQuery = countQuery.eq('stack_depth', parseInt(stack, 10));

          const { count, error: countErr } = await countQuery;
          if (countErr) {
              console.warn('[SpotDrill] Count error:', countErr);
              return res.status(500).json({ success: false, error: 'Database error' });
          }

          if (!count || count === 0) {
              return res.status(404).json({ success: false, error: 'No spots found matching filters' });
          }

          // Pick random offset
          const randomOffset = Math.floor(Math.random() * count);

          let spotQuery = getSupabase()
              .from('solved_spots_gold')
              .select('id, scenario_hash, game_type, stack_depth, strategy_matrix');

          if (format === 'cash') spotQuery = spotQuery.ilike('game_type', '%cash%');
          if (format === 'mtt') spotQuery = spotQuery.ilike('game_type', '%mtt%');
          if (position) { const safePos = sanitizeParam(position, 10); if (safePos) spotQuery = spotQuery.ilike('scenario_hash', `%_${safePos}_%`); }
          if (stack) spotQuery = spotQuery.eq('stack_depth', parseInt(stack, 10));

          spotQuery = spotQuery.range(randomOffset, randomOffset).limit(1);

          const { data: spots, error: spotErr } = await spotQuery;
          if (spotErr || !spots || spots.length === 0) {
              console.warn('[SpotDrill] Spot fetch error:', spotErr);
              return res.status(500).json({ success: false, error: 'Failed to fetch spot' });
          }

          const spot = spots[0];
          const matrix = spot.strategy_matrix || {};
          const actions = matrix.actions || [];
          const frequencies = matrix.frequencies || {};

          if (actions.length === 0) {
              // No action data — try again (skip this spot)
              return res.status(200).json({
                  success: false,
                  error: 'Spot has no action data — retry',
                  retry: true,
              });
          }

          // 2026-07-19 AUDIT FIX: `cash`/`spin` game_type families store RAW
          // combo weights (not 0-1 frequencies). Normalize per hand so the
          // ">10% frequency" filter and displayed percentages are correct
          // for every family. Argmax (the graded answer) is scale-invariant.
          const normalizedFreq = (hand) => {
              const raw = {};
              let handTotal = 0;
              for (const action of actions) {
                  const f = frequencies[action]?.[hand] || 0;
                  raw[action] = f;
                  handTotal += f;
              }
              const divisor = handTotal > 1.001 ? handTotal : 1;
              const out = {};
              for (const action of actions) out[action] = raw[action] / divisor;
              return out;
          };

          // Pick a random hand that has frequency data
          const allHands = Object.keys(frequencies[actions[0]] || {});
          const handsWithData = allHands.filter(hand => {
              const norm = normalizedFreq(hand);
              let maxFreq = 0;
              for (const action of actions) {
                  if (norm[action] > maxFreq) maxFreq = norm[action];
              }
              return maxFreq > 0.1; // Hand must have a clear action (>10% frequency)
          });

          if (handsWithData.length === 0) {
              return res.status(200).json({
                  success: false,
                  error: 'No hands with clear actions — retry',
                  retry: true,
              });
          }

          const randomHand = handsWithData[Math.floor(Math.random() * handsWithData.length)];

          // Find the correct GTO action (highest frequency for this hand)
          let correctAction = actions[0];
          let correctFreq = 0;
          const actionBreakdown = {};
          const handFreqs = normalizedFreq(randomHand);

          for (const action of actions) {
              const freq = handFreqs[action] || 0;
              actionBreakdown[action] = Math.round(freq * 1000) / 10; // percentage
              if (freq > correctFreq) {
                  correctFreq = freq;
                  correctAction = action;
              }
          }

          const board = parseBoardFromHash(spot.scenario_hash);
          const heroPosition = extractPositionFromHash(spot.scenario_hash);
          const street = getStreetFromBoard(board);
          const options = generateOptions(correctAction, actions);

          return res.status(200).json({
              success: true,
              spot: {
                  id: spot.id,
                  board,
                  street,
                  heroPosition,
                  stackDepth: spot.stack_depth,
                  gameType: spot.game_type,
                  heroHand: randomHand,
                  gtoAction: correctAction,
                  gtoFrequency: Math.round(correctFreq * 1000) / 10,
                  actionBreakdown,
                  options,
              },
          });

      } catch (err) {
          console.warn('[SpotDrill] Error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * API: Spot Drill — Random Postflop GTO Quiz Spot
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
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
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { parseBoardFromHash, extractPositionFromHash, sanitizeParam, withTiming } from '../../../src/utils/trainingApiUtils';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
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
// ●●● Helpers ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●



function getStreetFromBoard(board) {
    if (board.length >= 5) return 'River';
    if (board.length >= 4) return 'Turn';
    if (board.length >= 3) return 'Flop';
    return 'Preflop';
}

// Map raw solver action codes ('c', 'f', 'x', 'b33', 'r250', 'allin') to
// display labels so options, gtoAction, and grading share one vocabulary
const codeToLabel = (a) => {
    if (a === 'c') return 'Call';
    if (a === 'f') return 'Fold';
    if (a === 'x') return 'Check';
    const m = /^b(\d+)$/.exec(a);
    if (m) return `Bet ${m[1]}%`;
    const r = /^r(\d+)$/.exec(a);
    if (r) return `Raise ${r[1]}%`;
    if (a === 'allin') return 'All-In';
    return a;
};

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

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// HANDLER
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

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

          // ●●● 2026-07-19 AUDIT FIX (wave-1 live sweep): the old
          // exact-count + random-OFFSET sampling scanned deep into a 2M-row
          // filtered set — statement timeouts made this endpoint 500 on ~90%
          // of requests. Replace with a uuid-pivot sample: ids are uuid v4
          // (uniform), so `id >= random-uuid ORDER BY id LIMIT 1` is a single
          // indexed probe. Wrap-around to the first row if the pivot lands
          // past the last id. ●●●
          const randomUuid = require('crypto').randomUUID();

          const buildSpotQuery = (withPivot) => {
              let q = getSupabase()
                  .from('solved_spots_gold')
                  .select('id, scenario_hash, game_type, stack_depth, strategy_matrix');
              if (format === 'cash') q = q.ilike('game_type', '%cash%');
              if (format === 'mtt') q = q.ilike('game_type', '%mtt%');
              if (position) { const safePos = sanitizeParam(position, 10); if (safePos) q = q.ilike('scenario_hash', `%_${safePos}_%`); }
              if (stack) q = q.eq('stack_depth', parseInt(stack, 10));
              if (withPivot) q = q.gte('id', randomUuid);
              return q.order('id', { ascending: true }).limit(1);
          };

          let { data: spots, error: spotErr } = await buildSpotQuery(true);
          if (!spotErr && (!spots || spots.length === 0)) {
              // Pivot landed past the last matching id — wrap to the start
              ({ data: spots, error: spotErr } = await buildSpotQuery(false));
          }
          if (spotErr) {
              console.warn('[SpotDrill] Spot fetch error:', spotErr);
              return res.status(500).json({ success: false, error: 'Failed to fetch spot' });
          }
          if (!spots || spots.length === 0) {
              return res.status(404).json({ success: false, error: 'No spots found matching filters' });
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
          // Map raw solver codes to display labels and dedupe (e.g. 'c' -> 'Call'
          // colliding with pool 'Call') so grading compares like-for-like
          const displayCorrect = codeToLabel(correctAction);
          const displayActions = [...new Set(actions.map(codeToLabel))];
          const displayBreakdown = {};
          for (const [action, pct] of Object.entries(actionBreakdown)) {
              const label = codeToLabel(action);
              displayBreakdown[label] = Math.round(((displayBreakdown[label] || 0) + pct) * 10) / 10;
          }
          const options = generateOptions(displayCorrect, displayActions);

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
                  gtoAction: displayCorrect,
                  gtoFrequency: Math.round(correctFreq * 1000) / 10,
                  actionBreakdown: displayBreakdown,
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

import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
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
import { SolverPolicyService } from '../../../src/services/SolverPolicyService.js';

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
          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          const user = authData?.user;
          if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

          const { format, position, stack } = req.query;

          // UUID-pivot sampling stays indexed, but all row access and policy
          // interpretation is owned by the canonical service.
          const randomUuid = require('crypto').randomUUID();
          const policyService = new SolverPolicyService({ db: getSupabase() });
          const safePosition = position ? sanitizeParam(position, 10) : null;
          const filters = {
              gameTypeLike: format === 'cash' ? '%cash%' : format === 'mtt' ? '%mtt%' : undefined,
              position: safePosition || undefined,
              stackDepth: stack ? parseInt(stack, 10) : undefined,
              orderBy: 'id',
              ascending: true,
              // Normalization can reject an untrusted V1 row. Read a small
              // indexed window so one rejected pivot row cannot hide valid
              // policies that immediately follow it.
              limit: 25,
          };
          let result = await policyService.listSolvedRecords({ ...filters, idGte: randomUuid });
          if (result.records.length === 0) result = await policyService.listSolvedRecords(filters);
          const record = result.records[0];
          if (!record) {
              return res.status(404).json({ success: false, error: 'No trusted spots found matching filters' });
          }

          const handSeed = parseInt(randomUuid.replace(/-/g, '').slice(0, 8), 16);
          const randomHand = policyService.pickHolding(record, handSeed);
          if (!randomHand) {
              return res.status(200).json({
                  success: false, error: 'Spot has no policy holding - retry', retry: true,
              });
          }
          const key = policyService.keyForRecord(record);
          const answer = policyService.answerFromRecord(record, key, { holdingClass: randomHand });
          if (answer.kind === 'unavailable') {
              return res.status(200).json({
                  success: false, error: 'Spot has no policy answer - retry', retry: true,
              });
          }
          const correct = answer.actions.reduce((best, action) =>
              !best || action.frequency > best.frequency ? action : best, null);
          const displayBreakdown = Object.fromEntries(answer.actions.map((action) => [
              action.label, Math.round(action.frequency * 1000) / 10,
          ]));
          const options = generateOptions(correct.label, answer.actions.map((action) => action.label));
          const spot = record.metadata;
          const board = parseBoardFromHash(spot.scenario_hash);

          return res.status(200).json({
              success: true,
              spot: {
                  id: spot.id,
                  board,
                  street: getStreetFromBoard(board),
                  heroPosition: extractPositionFromHash(spot.scenario_hash),
                  stackDepth: spot.stack_depth,
                  gameType: spot.game_type,
                  heroHand: randomHand,
                  gtoAction: correct.label,
                  gtoFrequency: Math.round(correct.frequency * 1000) / 10,
                  actionBreakdown: displayBreakdown,
                  options,
                  solverPolicy: policyService.consumerEnvelope(answer, 'spot-drill'),
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

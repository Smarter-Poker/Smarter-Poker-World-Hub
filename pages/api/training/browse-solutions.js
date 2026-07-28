/**
 * API: Browse Solutions — Query solver data for the Solutions Browser
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * GET /api/training/browse-solutions
 * 
 * Query params:
 *   gameType: 'hu_cash' | 'mtt_6max_icm' | 'mtt_9max_icm' | 'postflop_complete' | 'turn_spin'
 *   stackDepth: number (e.g., 100)
 *   street: 'flop' | 'turn' | 'river' (default: flop)
 *   position: 'BTN' | 'SB' | 'BB' | etc (optional filter)
 *   spotId: string (optional — specific scenario_hash to load)
 *   page: number (default: 1)
 *   limit: number (default: 20, max: 50)
 * 
 * Returns:
 *   { spots: [...], total: number, page: number }
 *   Each spot: { id, scenario_hash, game_type, stack_depth, board, heroPosition, actions, handCount }
 *   If spotId is provided: full strategy_matrix with frequencies for all 1326 hands
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { parseBoardFromHash, extractPositionFromHash, getAllHands, sanitizeParam, VALID_STREETS, withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { v2ToAppMatrix } from '../../../src/utils/v2Matrix';

// ●● Lazy Supabase getter (SSG-safe) ●●●●●●●●●●●●●●●●●
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
export default async function handler(req, res) {
  try {
      withTiming(res);
      if (!applyRateLimit(req, res, LIMITS.read)) return;

      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // BUG FIX: No auth — paid GTO solver database exposed without gate
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

      try {
          const {
              gameType = 'hu_cash',
              stackDepth = '100',
              street = 'flop',
              position,
              spotId,
              page = '1',
              limit = '20',
          } = req.query;

          const pageNum = Math.max(1, parseInt(page, 10) || 1);
          const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
          const offset = (pageNum - 1) * limitNum;

          // Input validation
          const safeStreet = VALID_STREETS.includes(street) ? street : 'flop';

          // 2026-07-19: also allow lookup by scenario_hash — saved session
          // histories are compacted (bulk matrices stripped) and the replay
          // viewer re-fetches the solver matrix by hash on demand.
          const scenarioHash = req.query.scenarioHash ? sanitizeParam(req.query.scenarioHash, 200) : null;

          // If requesting a specific spot's full data
          if (spotId || scenarioHash) {
              let spotQuery = getSupabase()
                  .from('solved_spots_gold')
                  .select('id, scenario_hash, game_type, stack_depth, strategy_matrix, strategy_matrix_v2');
              spotQuery = spotId
                  ? spotQuery.eq('id', spotId)
                  : spotQuery.eq('scenario_hash', scenarioHash).limit(1);
              const { data: spotRows, error } = await spotQuery;
              const spot = Array.isArray(spotRows) ? spotRows[0] : spotRows;

              if (error || !spot) {
                  console.warn(`[BrowseSolutions] 404 Error. spotId: \"${spotId || scenarioHash}\", error:`, error);
                  return res.status(404).json({ success: false, error: 'Spot not found' });
              }

              // Prefer rebuilt PioSOLVER data (strategy_matrix_v2) when present
              const matrix = (spot.strategy_matrix_v2 ? v2ToAppMatrix(spot.strategy_matrix_v2) : null) || spot.strategy_matrix || {};
              const actions = matrix.actions || [];
              const frequencies = matrix.frequencies || {};

              // Build full 13×13 grid data for every hand.
              // 2026-07-19 AUDIT FIX: the `cash` and `spin` families (~2.1M rows)
              // store RAW combo weights instead of normalized 0-1 frequencies —
              // the old `freq * 1000 / 10` rendered values like \"5018%\".
              // Normalize per hand: if a hand's action mass exceeds 1, divide
              // each action by the hand total so the mix always sums to 100%.
              const allHands = getAllHands();
              const gridData = {};
              allHands.forEach(hand => {
                  const raw = {};
                  let handTotal = 0;
                  let hasData = false;
                  actions.forEach(action => {
                      const freq = frequencies[action]?.[hand];
                      if (freq !== undefined && freq >= 0) {
                          raw[action] = freq;
                          handTotal += freq;
                          hasData = true;
                      }
                  });
                  if (!hasData) {
                      gridData[hand] = null; // Hand not in range
                      return;
                  }
                  const divisor = handTotal > 1.001 ? handTotal : 1;
                  gridData[hand] = {};
                  Object.entries(raw).forEach(([action, freq]) => {
                      gridData[hand][action] = Math.round((freq / divisor) * 1000) / 10; // 0-100, 1 decimal
                  });
              });

              // Get EV data from matrix
              const handEVs = matrix.hand_evs || {};

              // Calculate range equity from hand EVs and frequencies
              let heroEqSum = 0;
              let villainEqSum = 0;
              let eqCount = 0;
              allHands.forEach(hand => {
                  const ev = handEVs[hand];
                  if (ev !== undefined && ev !== null && gridData[hand]) {
                      // Positive EV = Hero advantage, scale to 0-100 equity
                      const handEq = Math.max(0, Math.min(100, 50 + (ev * 2)));
                      heroEqSum += handEq;
                      villainEqSum += (100 - handEq);
                      eqCount++;
                  }
              });
              const rangeEquity = eqCount > 0 ? {
                  hero: Math.round((heroEqSum / eqCount) * 10) / 10,
                  villain: Math.round((villainEqSum / eqCount) * 10) / 10,
              } : { hero: 50, villain: 50 };

              return res.status(200).json({
                  success: true,
                  spot: {
                      id: spot.id,
                      scenarioHash: spot.scenario_hash,
                      gameType: spot.game_type,
                      stackDepth: spot.stack_depth,
                      board: parseBoardFromHash(spot.scenario_hash),
                      heroPosition: extractPositionFromHash(spot.scenario_hash),
                      actions,
                      gridData,
                      handEVs,
                      // Raw per-action/per-hand solver frequencies — consumed by
                      // HandReplayViewer's on-demand matrix refetch (2026-07-19)
                      rawFrequencies: frequencies,
                      handCount: Object.keys(gridData || {}).filter(h => gridData[h] !== null).length,
                      rangeEquity,
                  },
              });
          }

          // List spots with pagination
          let query = getSupabase()
              .from('solved_spots_gold')
              .select('id, scenario_hash, game_type, stack_depth', { count: 'exact' })
              .eq('game_type', gameType)
              .eq('stack_depth', parseInt(stackDepth, 10));

          // Filter by street (based on board card count in scenario_hash)
          // Flop = 3 cards (6 chars), Turn = 4 cards (8 chars), River = 5 cards (10 chars)
          if (position) {
              const safePosition = sanitizeParam(position, 10);
              if (safePosition) query = query.ilike('scenario_hash', `%_${safePosition}_%`);
          }

          // Order and paginate
          query = query.order('scenario_hash', { ascending: true }).range(offset, offset + limitNum - 1);

          const { data: spots, error, count } = await query;

          if (error) {
              console.warn('[BrowseSolutions] Query error:', error);
              return res.status(500).json({ success: false, error: 'Database query failed' });
          }

          // Enrich spots with parsed metadata (without heavy strategy_matrix)
          const enriched = (spots || []).map(s => ({
              id: s.id,
              scenarioHash: s.scenario_hash,
              gameType: s.game_type,
              stackDepth: s.stack_depth,
              board: parseBoardFromHash(s.scenario_hash),
              heroPosition: extractPositionFromHash(s.scenario_hash),
          }));

          return res.status(200).json({
              success: true,
              spots: enriched,
              total: count || 0,
              page: pageNum,
              limit: limitNum,
              totalPages: Math.ceil((count || 0) / limitNum),
          });

      } catch (err) {
          console.warn('[BrowseSolutions] Error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

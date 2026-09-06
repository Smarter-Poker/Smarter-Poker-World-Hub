import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
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
import { SolverPolicyService } from '../../../src/services/SolverPolicyService.js';

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

          const policyService = new SolverPolicyService({ db: getSupabase() });

          if (spotId || scenarioHash) {
              const { records } = await policyService.listSolvedRecords({
                  id: spotId || undefined,
                  scenarioHash: spotId ? undefined : scenarioHash,
                  limit: 1,
              });
              const record = records[0];
              if (!record) {
                  return res.status(404).json({ success: false, error: 'Trusted spot not found' });
              }
              const range = policyService.rangeGrid(record, getAllHands());
              const answer = policyService.consumerEnvelope(range.answer, 'browse-solutions');
              const handEVs = range.handEvs;
              let heroEqSum = 0;
              let villainEqSum = 0;
              let eqCount = 0;
              for (const hand of getAllHands()) {
                  const ev = handEVs[hand];
                  if (Number.isFinite(ev) && range.sourceGridData[hand]) {
                      const handEq = Math.max(0, Math.min(100, 50 + (ev * 2)));
                      heroEqSum += handEq;
                      villainEqSum += 100 - handEq;
                      eqCount += 1;
                  }
              }
              const rangeEquity = eqCount > 0 ? {
                  hero: Math.round((heroEqSum / eqCount) * 10) / 10,
                  villain: Math.round((villainEqSum / eqCount) * 10) / 10,
              } : { hero: 50, villain: 50 };
              const spot = record.metadata;
              return res.status(200).json({
                  success: true,
                  spot: {
                      id: spot.id, scenarioHash: spot.scenario_hash, gameType: spot.game_type,
                      stackDepth: spot.stack_depth, board: parseBoardFromHash(spot.scenario_hash),
                      heroPosition: extractPositionFromHash(spot.scenario_hash),
                      actions: range.sourceActions, actionDefinitions: answer.actions,
                      gridData: range.sourceGridData, canonicalGridData: range.gridData,
                      handEVs, rawFrequencies: range.rawFrequencies,
                      handCount: range.handCount, rangeEquity, solverPolicy: answer,
                  },
              });
          }

          const safePosition = position ? sanitizeParam(position, 10) : null;
          const metadata = await policyService.listSolvedMetadata({
              gameType: sanitizeParam(gameType, 80),
              stackDepth: parseInt(stackDepth, 10),
              street: safeStreet,
              position: safePosition || undefined,
              orderBy: 'scenario_hash',
              ascending: true,
              range: [offset, offset + limitNum - 1],
              limit: limitNum,
          }, { count: true });
          const enriched = metadata.rows.map((spot) => ({
              id: spot.id, scenarioHash: spot.scenario_hash, gameType: spot.game_type,
              stackDepth: spot.stack_depth, board: parseBoardFromHash(spot.scenario_hash),
              heroPosition: extractPositionFromHash(spot.scenario_hash),
          }));
          return res.status(200).json({
              success: true, spots: enriched, total: metadata.count || 0,
              page: pageNum, limit: limitNum,
              totalPages: Math.ceil((metadata.count || 0) / limitNum),
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

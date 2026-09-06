import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * SOLVER API — GTO Solver Query Foundation
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * API endpoint accepting custom spot definitions. Checks pre-computed
 * solutions DB first (instant) and returns an explicitly labelled modeled
 * baseline when the exact board is not present. It never claims that an
 * unconfigured remote worker will solve a queued request.
 * Rate limited: 10 requests/minute per user.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { heroIsInPosition } from '../../../src/engines/positionOrder';
import { SolverPolicyService } from '../../../src/services/SolverPolicyService.js';

// ●● Lazy Supabase getter (SSG-safe) ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        _supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        );
    }
    return _supabase;
}

// ●● Rate limiter (in-memory, per-instance) ●●●●●●●●●●●●●●●●●●●●●●
const rateLimitMap = new Map();
const RATE_LIMIT = 10;        // requests
const RATE_WINDOW = 60_000;   // 1 minute
const EVICT_THRESHOLD = 500;  // Evict stale entries when map exceeds this size

function checkRateLimit(userId) {
    const now = Date.now();
    const key = userId || 'anon';
    const entry = rateLimitMap.get(key) || { count: 0, windowStart: now };

    if (now - entry.windowStart > RATE_WINDOW) {
        entry.count = 1;
        entry.windowStart = now;
    } else {
        entry.count++;
    }

    rateLimitMap.set(key, entry);

    // Periodic eviction: purge expired entries to prevent unbounded memory growth
    if (rateLimitMap.size > EVICT_THRESHOLD) {
        for (const [k, v] of rateLimitMap) {
            if (now - v.windowStart > RATE_WINDOW * 2) rateLimitMap.delete(k);
        }
    }

    return entry.count <= RATE_LIMIT;
}

// ●● Auth helper ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
async function getUserFromToken(req) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return null;
    const token = auth.replace('Bearer ', '');

    try {
        // 2026-07-19 AUDIT FIX: previous code referenced an undeclared
        // `error` variable — the ReferenceError was swallowed by this catch,
        // so getUserFromToken always returned null and the endpoint 401'd
        // on every request, even with a valid token.
        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
        const user = authData?.user;
        if (authErr || !user) return null;
        return user;
    } catch {
        return null;
    }
}

// ●● Scenario hash generator ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
function hashScenario({ board, heroPosition, villainPosition, stackDepth, gameType, street }) {
    const parts = [
        gameType || 'cash',
        stackDepth || 100,
        heroPosition || 'BTN',
        villainPosition || 'BB',
        street || 'flop',
        ...(board || []).map(c => c.toLowerCase()).sort(),
    ];
    // Simple hash
    let hash = 0;
    const str = parts.join(':');
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return `spot_${Math.abs(hash).toString(36)}`;
}

const GAME_TYPE_MAP = {
    cash: 'hu_cash',
    mtt: 'mtt_hu_chipev',
    tournament: 'mtt_hu_chipev',
    sng: 'sng_hu',
};

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// API HANDLER
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default async function handler(req, res) {
  try {
      withTiming(res);
      // Only POST
      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // Body size guard — board/position data is bounded
      const bodySize = JSON.stringify(req.body || {}).length;
      if (bodySize > 10240) {
          return res.status(413).json({ success: false, error: 'Request body too large' });
      }


      // Auth check
      const user = await getUserFromToken(req);
      if (!user) {
          return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      // Rate limit
      if (!checkRateLimit(user.id)) {
          return res.status(429).json({
              success: false,
              error: 'Rate limit exceeded. Maximum 10 requests per minute.',
              retryAfter: 60,
          });
      }

      try {
          const {
              board, heroPosition, villainPosition, stackDepth, gameType, street, action,
              holding, tableSize, stacks, blinds, rake, tournamentUtility, payouts, bounties,
              publicActionHistory, legalActions, sidePotEligibility,
          } = req.body;

          if (!board || !Array.isArray(board) || board.length < 3) {
              return res.status(400).json({
                  success: false,
                  error: 'Board must be an array of at least 3 cards (e.g., ["Ah", "Kd", "7c"])',
              });
          }
          if (!heroPosition) {
              return res.status(400).json({
                  success: false, error: 'heroPosition is required (e.g., "BTN", "SB", "BB")',
              });
          }

          const policyService = new SolverPolicyService({ db: getSupabase() });
          const resolvedStreet = street || (board.length === 3 ? 'flop' : board.length === 4 ? 'turn' : 'river');
          const requestedStack = Number(stackDepth) || 100;
          const requestedGame = String(gameType || 'cash').toLowerCase();
          const pioGameType = GAME_TYPE_MAP[requestedGame] || 'hu_cash';
          const stackVector = Array.isArray(stacks) && stacks.length > 0 ? stacks : [
              { seat: 0, position: heroPosition, stackBb: requestedStack, active: true },
              { seat: 1, position: villainPosition || 'BB', stackBb: requestedStack, active: true },
          ];
          const key = policyService.createKey({
              variant: 'nlh',
              bettingStructure: 'no_limit',
              tableSize: tableSize || stackVector.length,
              positions: { hero: heroPosition, villains: [villainPosition || 'BB'] },
              stackVector,
              blinds: blinds || { complete: false },
              rake: rake || { complete: false },
              tournamentUtility: tournamentUtility || {
                  mode: ['mtt', 'tournament', 'sng'].includes(requestedGame) ? 'chip_ev' : 'cash',
                  complete: false,
              },
              payouts: payouts || [],
              bounties: bounties || [],
              street: resolvedStreet,
              board,
              holding: holding || [],
              publicActionHistory: publicActionHistory || { complete: false, actions: [] },
              legalActions: legalActions || [],
              sidePotEligibility: sidePotEligibility || { complete: false, pots: [] },
          });
          const resolved = await policyService.resolve({
              key, gameTypes: [pioGameType], mode: Array.isArray(holding) ? 'holding' : 'aggregate',
          });
          if (resolved.answer.kind !== 'unavailable') {
              const answer = policyService.consumerEnvelope(resolved.answer, 'solver-api');
              return res.status(200).json({
                  success: true,
                  status: 'solved',
                  source: answer.sourceArtifact.system,
                  matchQuality: answer.kind,
                  scenarioHash: answer.sourceArtifact.scenarioHash,
                  message: answer.kind === 'exact'
                      ? 'Exact provenance-sealed policy for the complete decision state.'
                      : 'Canonical policy for the matching source node; consult fallbackReason for limitations.',
                  solverPolicy: answer,
                  solution: {
                      actions: Object.fromEntries(answer.actions.map((entry) => [
                          entry.id, Math.round(entry.frequency * 1000) / 10,
                      ])),
                      board, heroPosition, villainPosition: villainPosition || 'BB',
                      stackDepth: requestedStack, gameType: pioGameType, street: resolvedStreet,
                      isEstimate: answer.kind !== 'exact',
                  },
              });
          }

          const scenarioHash = hashScenario({
              board, heroPosition, villainPosition, stackDepth, gameType, street: resolvedStreet,
          });
          const baselineStrategy = generateBaselineStrategy(
              board, heroPosition, action, villainPosition || 'BB',
          );
          const heuristic = policyService.heuristicAnswer(
              key,
              Object.entries(baselineStrategy.actions).map(([id, frequency]) => ({
                  id, family: id, label: id[0].toUpperCase() + id.slice(1),
                  frequency, legal: true, size: { unit: 'unknown', exact: false },
                  chipEvBb: baselineStrategy.evByAction[id],
              })),
              'no_policy_artifact_for_state',
          );
          const answer = policyService.consumerEnvelope(heuristic, 'solver-api');
          return res.status(200).json({
              success: true, status: 'estimate', source: 'modeled_baseline',
              matchQuality: 'no_policy_artifact', scenarioHash,
              message: 'No matching policy artifact was found. This is a labelled heuristic, not solver output.',
              solverPolicy: answer,
              solution: {
                  actions: baselineStrategy.actions, frequencies: baselineStrategy.frequencies,
                  evByAction: baselineStrategy.evByAction, board, heroPosition,
                  villainPosition: villainPosition || 'BB', stackDepth: requestedStack,
                  gameType: requestedGame, street: resolvedStreet, isEstimate: true,
              },
          });
      } catch (err) {
          console.warn('[Solver API] Error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// BASELINE STRATEGY GENERATOR
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Generate a reasonable GTO baseline strategy based on position + board texture.
 * Used as fallback when precise solver data isn't available.
 *
 * @param {string[]} board
 * @param {string} heroPosition
 * @param {string} currentAction
 * @param {string} villainPosition - required: whether hero is in position is a
 *   property of the PAIR of seats, not of hero's seat.
 */
function generateBaselineStrategy(board, heroPosition, currentAction, villainPosition) {
    // Board texture analysis
    const ranks = board.map(c => 'AKQJT98765432'.indexOf(c[0].toUpperCase()));
    const suits = board.map(c => c[c.length - 1].toLowerCase());
    const isMonotone = new Set(suits).size === 1;
    const isPaired = new Set(ranks).size < board.length;
    const hasHighCards = ranks.some(r => r <= 3); // A, K, Q, J

    // IP vs OOP — relative to the actual opponent.
    //
    // This used to be `['BTN','CO','SB'].includes(heroPosition)`. Two separate
    // errors: it never looked at the villain, and it listed the small blind as
    // an in-position seat when the SB acts FIRST postflop against every other
    // seat. A player drilling SB vs BB was handed the in-position baseline —
    // bet 55% on a high board instead of 35% — which is the opposite of the
    // spot they were actually in.
    const isIP = heroIsInPosition(heroPosition, villainPosition);

    let betFreq, checkFreq, raiseFreq, callFreq, foldFreq;

    if (isIP) {
        // In position: more betting, less checking
        betFreq = hasHighCards ? 55 : 45;
        checkFreq = 100 - betFreq;
        raiseFreq = isMonotone ? 10 : 15;
        callFreq = 35;
        foldFreq = isPaired ? 40 : 50;
    } else {
        // Out of position: more checking, less betting
        betFreq = hasHighCards ? 35 : 25;
        checkFreq = 100 - betFreq;
        raiseFreq = isMonotone ? 8 : 12;
        callFreq = isPaired ? 40 : 30;
        foldFreq = isPaired ? 35 : 45;
    }

    return {
        actions: {
            bet: betFreq,
            check: checkFreq,
        },
        frequencies: {
            b: betFreq,
            x: checkFreq,
        },
        evByAction: {
            bet: +(betFreq * 0.015).toFixed(2),
            check: +(checkFreq * 0.008).toFixed(2),
            raise: +(raiseFreq * 0.02).toFixed(2),
            call: +(callFreq * 0.01).toFixed(2),
            fold: 0,
        },
    };
}

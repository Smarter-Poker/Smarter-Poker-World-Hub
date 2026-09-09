import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * SOLVER API — GTO Solver Query Foundation
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * API endpoint accepting custom spot definitions. Checks pre-computed
 * solutions DB first (instant) and fails closed when the exact audited node
 * is unavailable. It never invents an estimated policy or claims that an
 * unconfigured remote worker will solve a queued request.
 * Rate limited: 10 requests/minute per user.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { heroIsInPosition } from '../../../src/engines/positionOrder';
import { v2ToAppMatrix } from '../../../src/utils/v2Matrix';
import {
    CustomSolverSpotContractError,
    customSolverRowMatchesRequest,
    normalizeCustomSolverSpot,
} from '../../../src/lib/training/customSolverSpotContract.mjs';

// ●● Lazy Supabase getter (SSG-safe) ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error('Solver service is not configured');
        }
        _supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
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

    try {
        // 2026-07-19 AUDIT FIX: previous code referenced an undeclared
        // `error` variable — the ReferenceError was swallowed by this catch,
        // so getUserFromToken always returned null and the endpoint 401'd
        // on every request, even with a valid token.
        const { user, error: authErr } = await getServerUserWithFallback(req, getSupabase());
        if (authErr || !user) return null;
        return user;
    } catch {
        return null;
    }
}

function aggregateSolverActions(strategyMatrix) {
    const actions = Array.isArray(strategyMatrix?.actions) ? strategyMatrix.actions : [];
    const frequencies = strategyMatrix?.frequencies || {};
    const totals = Object.fromEntries(actions.map((actionName) => [actionName, 0]));
    let hands = 0;

    const handNames = new Set();
    actions.forEach((actionName) => {
        Object.keys(frequencies[actionName] || {}).forEach((hand) => handNames.add(hand));
    });

    handNames.forEach((hand) => {
        const raw = actions.map((actionName) => Number(frequencies[actionName]?.[hand]) || 0);
        const total = raw.reduce((sum, value) => sum + Math.max(0, value), 0);
        if (total <= 0) return;
        actions.forEach((actionName, index) => {
            totals[actionName] += Math.max(0, raw[index]) / total;
        });
        hands += 1;
    });

    if (hands === 0) return null;
    const result = {};
    Object.entries(totals).forEach(([actionName, total]) => {
        result[actionName.toLowerCase()] = Math.round((total / hands) * 1000) / 10;
    });
    return result;
}

const SOLVER_QUERY_TIMEOUT_MS = 8_000;

async function catalogCandidates(args) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SOLVER_QUERY_TIMEOUT_MS);
    try {
        const query = getSupabase().rpc('training_solver_spot_candidates_v1', args);
        if (typeof query?.abortSignal !== 'function') {
            throw new Error('Solver catalog query does not support cancellation');
        }
        return await query.abortSignal(controller.signal);
    } finally {
        clearTimeout(timeout);
    }
}

async function findExactSolverStrategy(request) {
    // A hero who acts second needs the first actor's action in order to
    // identify a decision node. Custom Solve does not currently collect that
    // history, so serving r:0:c would silently assume a check.
    if (heroIsInPosition(request.heroPosition, request.villainPosition)) {
        return { status: 'node_context_required' };
    }

    const { data, error } = await catalogCandidates({
        p_family_stacks: [{
            game_type: request.pioGameType,
            stack_depth: request.stackDepth,
        }],
        p_position: request.heroPosition,
        p_lower_inclusive: null,
        p_lower_exclusive: null,
        p_upper_exclusive: null,
        p_limit: 3,
        p_artifact_id: null,
        p_scenario_hash: request.scenarioHash,
        p_street: request.street,
        p_offset: 0,
    });
    if (error) return { status: 'unavailable', error };
    if (!Array.isArray(data) || data.length === 0) return { status: 'missing' };

    const exactCandidates = [];
    for (const row of data) {
        if (!customSolverRowMatchesRequest(row, request)) continue;
        const matrix = v2ToAppMatrix(row.strategy_matrix_v2);
        const actions = aggregateSolverActions(matrix);
        if (actions && Object.keys(actions).length > 0) exactCandidates.push({ row, actions });
    }
    // Duplicate exact identities are an integrity failure. Never select one
    // nondeterministically and present it as authoritative.
    if (exactCandidates.length > 1) return { status: 'ambiguous' };
    if (exactCandidates.length === 0) return { status: 'missing' };
    return { status: 'exact', ...exactCandidates[0] };
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// API HANDLER
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default async function handler(req, res) {
  try {
      withTiming(res);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Vary', 'Authorization');
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
          let request;
          try {
              request = normalizeCustomSolverSpot(req.body);
          } catch (error) {
              if (error instanceof CustomSolverSpotContractError) {
                  return res.status(400).json({ success: false, code: error.code, error: error.message });
              }
              throw error;
          }

          const exact = await findExactSolverStrategy(request);
          if (exact.status === 'unavailable' || exact.status === 'ambiguous') {
              return res.status(503).json({
                  success: false,
                  code: exact.status === 'ambiguous'
                      ? 'SOLVER_IDENTITY_AMBIGUOUS'
                      : 'SOLVER_LOOKUP_UNAVAILABLE',
                  error: 'Verified solver lookup is temporarily unavailable',
              });
          }
          if (exact.status === 'exact') {
              return res.status(200).json({
                  success: true,
                  status: 'solved',
                  source: 'training_solver_artifact_catalog',
                  matchQuality: 'exact_root_node',
                  scenarioHash: exact.row.scenario_hash,
                  message: 'Aggregated frequencies from one identity-validated, provenance-audited root decision.',
                  solution: {
                      actions: exact.actions,
                      board: request.board,
                      heroPosition: request.heroPosition,
                      villainPosition: request.villainPosition,
                      stackDepth: exact.row.stack_depth,
                      gameType: exact.row.game_type,
                      street: exact.row.street,
                      decisionNode: exact.row.strategy_matrix_v2.node,
                      isEstimate: false,
                  },
              });
          }

          if (exact.status === 'node_context_required') {
              return res.status(422).json({
                  success: false,
                  code: 'SOLVER_NODE_CONTEXT_REQUIRED',
                  error: 'Hero acts second, so the preceding action is required to identify the exact decision node.',
              });
          }

          return res.status(404).json({
              success: false,
              code: 'AUDITED_SOLVER_ARTIFACT_NOT_FOUND',
              error: 'No single provenance-verified exact root decision was found.',
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

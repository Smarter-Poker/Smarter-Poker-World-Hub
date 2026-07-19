/**
 * 🔮 SOLVER API — GTO Solver Query Foundation
 * ═══════════════════════════════════════════════════════════════════════════
 * API endpoint accepting custom spot definitions. Checks pre-computed
 * solutions DB first (instant), queues unknown spots for remote solving.
 * Rate limited: 10 requests/minute per user.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';

// ── Lazy Supabase getter (SSG-safe) ─────────────────────────────
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

// ── Rate limiter (in-memory, per-instance) ──────────────────────
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

// ── Auth helper ─────────────────────────────────────────────────
async function getUserFromToken(req) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return null;
    const token = auth.replace('Bearer ', '');

    try {
        // 2026-07-19 AUDIT FIX: previous code referenced an undeclared
        // `error` variable — the ReferenceError was swallowed by this catch,
        // so getUserFromToken always returned null and the endpoint 401'd
        // on every request, even with a valid token.
        const { data: authData, error: authErr } = await getSupabase().auth.getUser(token);
        const user = authData?.user;
        if (authErr || !user) return null;
        return user;
    } catch {
        return null;
    }
}

// ── Scenario hash generator ─────────────────────────────────────
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

// ═══════════════════════════════════════════════════════════════════════════
// API HANDLER
// ═══════════════════════════════════════════════════════════════════════════

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
          const { board, heroPosition, villainPosition, stackDepth, gameType, street, action } = req.body;

          // Validate required fields
          if (!board || !Array.isArray(board) || board.length < 3) {
              return res.status(400).json({
                  success: false,
                  error: 'Board must be an array of at least 3 cards (e.g., ["Ah", "Kd", "7c"])',
              });
          }

          if (!heroPosition) {
              return res.status(400).json({
                  success: false,
                  error: 'heroPosition is required (e.g., "BTN", "SB", "BB")',
              });
          }

          const scenarioHash = hashScenario({ board, heroPosition, villainPosition, stackDepth, gameType, street });

          // 1) Check pre-computed solutions database
          const supabase = getSupabase();
          const { data: existing } = await supabase
              .from('training_scenarios')
              .select('gto_strategy, actions, frequencies, ev_data')
              .eq('scenario_hash', scenarioHash)
              .limit(1)
              .maybeSingle();

          if (existing) {
              // Return pre-computed solution
              return res.status(200).json({
                  success: true,
                  status: 'solved',
                  source: 'precomputed',
                  scenarioHash,
                  solution: {
                      actions: existing.gto_strategy || existing.actions || {},
                      frequencies: existing.frequencies || {},
                      evByAction: existing.ev_data || {},
                      board,
                      heroPosition,
                      villainPosition: villainPosition || 'BB',
                      stackDepth: stackDepth || 100,
                      gameType: gameType || 'cash',
                  },
              });
          }

          // 2) Not in DB — queue for solving (stub for remote PIO node)
          const queueEntry = {
              scenario_hash: scenarioHash,
              board: board.join(','),
              hero_position: heroPosition,
              villain_position: villainPosition || 'BB',
              stack_depth: stackDepth || 100,
              game_type: gameType || 'cash',
              street: street || (board.length === 3 ? 'flop' : board.length === 4 ? 'turn' : 'river'),
              status: 'queued',
              requested_by: user.id,
              requested_at: new Date().toISOString(),
          };

          // Try to insert into solver_queue (will succeed if table exists)
          try {
              const { error: err_solver_queue_diso4 } = await supabase.from('solver_queue').insert([queueEntry]);
              if (err_solver_queue_diso4) console.warn('[Supabase] Silent mutation failed in solver_queue:', err_solver_queue_diso4.message);
          } catch {
              // Table may not exist yet — that's OK for foundation phase
          }

          // 3) Return queued response with GTO baseline estimate
          const baselineStrategy = generateBaselineStrategy(board, heroPosition, action);

          return res.status(202).json({
              success: true,
              status: 'queued',
              source: 'baseline_estimate',
              scenarioHash,
              estimatedTime: '2-5 minutes (when solver node is connected)',
              message: 'Spot queued for precise solving. Showing GTO baseline estimate.',
              solution: {
                  actions: baselineStrategy.actions,
                  frequencies: baselineStrategy.frequencies,
                  evByAction: baselineStrategy.evByAction,
                  board,
                  heroPosition,
                  villainPosition: villainPosition || 'BB',
                  stackDepth: stackDepth || 100,
                  gameType: gameType || 'cash',
                  isEstimate: true,
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

// ═══════════════════════════════════════════════════════════════════════════
// BASELINE STRATEGY GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a reasonable GTO baseline strategy based on position + board texture.
 * Used as fallback when precise solver data isn't available.
 */
function generateBaselineStrategy(board, heroPosition, currentAction) {
    // Board texture analysis
    const ranks = board.map(c => 'AKQJT98765432'.indexOf(c[0].toUpperCase()));
    const suits = board.map(c => c[c.length - 1].toLowerCase());
    const isMonotone = new Set(suits).size === 1;
    const isPaired = new Set(ranks).size < board.length;
    const hasHighCards = ranks.some(r => r <= 3); // A, K, Q, J

    // IP vs OOP heuristic
    const ipPositions = ['BTN', 'CO', 'SB'];
    const isIP = ipPositions.includes(heroPosition);

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

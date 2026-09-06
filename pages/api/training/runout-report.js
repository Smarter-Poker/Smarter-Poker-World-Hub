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
// Card constants for building 52-card deck (used by runout simulation)
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['s', 'h', 'd', 'c'];
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

          const policyService = new SolverPolicyService({ db: getSupabase() });
          const currentResult = await policyService.listSolvedRecords({
              scenarioHash: safeHash, limit: 1,
          });
          const currentRecord = currentResult.records[0] || null;
          const baselinePolicy = currentRecord
              ? policyService.answerFromRecord(
                  currentRecord, policyService.keyForRecord(currentRecord), { mode: 'aggregate' },
              )
              : policyService.aggregateRecords([], {}, {});
          const baselineAggression = currentRecord
              ? policyService.aggressionIndex(currentRecord) ?? 0 : 0;

          const { records: childSpots } = await policyService.listSolvedRecords({
              scenarioHashLike: `${safeHash}__`, limit: 200,
          });
          const childMap = {};
          for (const record of childSpots) {
              const childBoard = parseBoardFromHash(record.metadata.scenario_hash);
              if (childBoard.length !== currentBoard.length + 1) continue;
              const nextCard = childBoard[currentBoard.length];
              if (!nextCard) continue;
              const childAggression = policyService.aggressionIndex(record);
              if (childAggression === null) continue;
              childMap[nextCard.toLowerCase()] = {
                  aggression: childAggression,
                  ev_delta: childAggression - baselineAggression,
              };
          }

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
              solverPolicy: policyService.consumerEnvelope(baselinePolicy, 'runout-report'),
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

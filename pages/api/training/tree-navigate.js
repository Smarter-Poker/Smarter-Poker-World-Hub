import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * API: Tree Navigate — Game Tree Traversal for the Solutions Browser
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * GET /api/training/tree-navigate
 *
 * Query params:
 *   scenarioHash: current scenario hash (e.g., 'hu_cash_BTN_100bb_7h8h2c')
 *   nextCard: the turn/river card to navigate to (e.g., 'Td')
 *   gameType: game type filter
 *   stackDepth: stack depth filter
 *
 * Returns:
 *   { success, childSpot: { id, scenarioHash, board, gridData, actions, handEVs, handCount }, siblings }
 *   siblings: list of other available runout cards that have solver data
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getAllHands, parseBoardFromHash, extractPositionFromHash, sanitizeParam, withTiming } from '../../../src/utils/trainingApiUtils';
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

          const { scenarioHash, nextCard, gameType, stackDepth } = req.query;

          if (!scenarioHash) {
              return res.status(400).json({ success: false, error: 'scenarioHash is required' });
          }

          // Sanitize query params used in Supabase queries
          const safeHash = sanitizeParam(scenarioHash, 200);

          const policyService = new SolverPolicyService({ db: getSupabase() });

          // Strategy 1: exact hash extension. Different runouts are never
          // substituted for the requested child node.
          if (nextCard) {
              const cardStr = sanitizeParam(nextCard, 4).toLowerCase();
              const hashParts = safeHash.split('_');
              const boardSegment = hashParts[hashParts.length - 1];
              const prefix = hashParts.slice(0, -1).join('_');
              const candidates = [...new Set([
                  `${safeHash}${cardStr}`,
                  `${prefix}_${boardSegment}${cardStr}`,
              ])];
              let record = null;
              for (const childHash of candidates) {
                  const found = await policyService.listSolvedRecords({
                      scenarioHash: childHash,
                      gameType: gameType ? sanitizeParam(gameType, 80) : undefined,
                      stackDepth: stackDepth ? Number(stackDepth) : undefined,
                      limit: 1,
                  });
                  if (found.records[0]) { record = found.records[0]; break; }
              }

              if (!record) {
                  return res.status(200).json({
                      success: false, error: 'No trusted policy found for this runout card',
                      queriedHash: candidates[0],
                  });
              }
              const range = policyService.rangeGrid(record, getAllHands());
              const answer = policyService.consumerEnvelope(range.answer, 'tree-navigation');
              const metadata = record.metadata;
              return res.status(200).json({
                  success: true,
                  childSpot: {
                      id: metadata.id, scenarioHash: metadata.scenario_hash,
                      gameType: metadata.game_type, stackDepth: metadata.stack_depth,
                      board: parseBoardFromHash(metadata.scenario_hash),
                      heroPosition: extractPositionFromHash(metadata.scenario_hash),
                      actions: answer.actions.map((entry) => entry.sourceCode || entry.id),
                      actionDefinitions: answer.actions,
                      gridData: range.gridData, handEVs: range.handEvs,
                      handCount: range.handCount, solverPolicy: answer,
                  },
              });
          }

          // Strategy 2: metadata-only list of available exact child hashes.
          const currentBoard = parseBoardFromHash(safeHash);
          const { rows: childSpots } = await policyService.listSolvedMetadata({
              scenarioHashLike: `${safeHash}__`,
              gameType: gameType ? sanitizeParam(gameType, 80) : undefined,
              stackDepth: stackDepth ? Number(stackDepth) : undefined,
              limit: 100,
          });
          const availableCards = new Set();
          for (const child of childSpots) {
              const childBoard = parseBoardFromHash(child.scenario_hash);
              if (childBoard.length > currentBoard.length) {
                  const card = childBoard[currentBoard.length];
                  if (card) availableCards.add(card);
              }
          }
          return res.status(200).json({
              success: true, currentBoard, availableCards: [...availableCards],
              childCount: availableCards.size,
          });
      } catch (err) {
          console.warn('[TreeNavigate] Error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

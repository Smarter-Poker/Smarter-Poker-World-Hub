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

          // ●●● STRATEGY 1: Exact hash extension ●●●●●●●●●●●●●●●●●●●●●●
          // If nextCard is provided, append it to the current board in the hash
          // to find the child node for the next street.
          if (nextCard) {
              const cardStr = sanitizeParam(nextCard, 4).toLowerCase();
              // Build the child hash by appending the card to the parent hash
              const childHash = `${safeHash}${cardStr}`;

              // Try exact match first
              let { data: childSpot, error } = await getSupabase()
                  .from('solved_spots_gold')
                  .select('id, scenario_hash, game_type, stack_depth, strategy_matrix, hand_evs')
                  .eq('scenario_hash', childHash)
                  .maybeSingle();

              // If exact match fails, try with appended card directly to the board part
              if (!childSpot) {
                  // Some hashes might have different separators or formats
                  // Try the child hash with underscore separation in case board is a separate segment
                  const hashParts = safeHash.split('_');
                  const boardSegment = hashParts[hashParts.length - 1];
                  const prefix = hashParts.slice(0, -1).join('_');
                  const altChildHash = `${prefix}_${boardSegment}${cardStr}`;

                  const { data: altSpots } = await getSupabase()
                      .from('solved_spots_gold')
                      .select('id, scenario_hash, game_type, stack_depth, strategy_matrix, hand_evs')
                      .eq('scenario_hash', altChildHash)
                      .limit(1);
                  childSpot = altSpots?.[0] || null;
              }

              if (childSpot) {
                  const matrix = childSpot.strategy_matrix || {};
                  const actions = matrix.actions || [];
                  const frequencies = matrix.frequencies || {};
                  const allHands = getAllHands();
                  const gridData = {};

                  // 2026-07-19 AUDIT FIX: normalize per hand — `cash`/`spin`
                  // families store raw combo weights, not 0-1 frequencies
                  // (old code rendered "5018%"-style values for those spots).
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
                      if (!hasData) { gridData[hand] = null; return; }
                      const divisor = handTotal > 1.001 ? handTotal : 1;
                      gridData[hand] = {};
                      Object.entries(raw).forEach(([action, freq]) => {
                          gridData[hand][action] = Math.round((freq / divisor) * 1000) / 10;
                      });
                  });

                  return res.status(200).json({
                      success: true,
                      childSpot: {
                          id: childSpot.id,
                          scenarioHash: childSpot.scenario_hash,
                          gameType: childSpot.game_type,
                          stackDepth: childSpot.stack_depth,
                          board: parseBoardFromHash(childSpot.scenario_hash),
                          heroPosition: extractPositionFromHash(childSpot.scenario_hash),
                          actions,
                          gridData,
                          handEVs: childSpot.hand_evs || {},
                          handCount: Object.keys(gridData || {}).filter(h => gridData[h] !== null).length,
                      },
                  });
              }

              // No child found
              return res.status(200).json({
                  success: false,
                  error: 'No solver data found for this runout card',
                  queriedHash: childHash,
              });
          }

          // ●●● STRATEGY 2: List available children ●●●●●●●●●●●●●●●●●●●●●●●●
          // Without nextCard, find all possible child nodes (next street extensions).
          // This powers the Card Selector Modal by showing which cards have data.
          const currentBoard = parseBoardFromHash(safeHash);

          // Query all spots that have the same hash prefix with exactly 2 more chars (1 card)
          const { data: childSpots, error } = await getSupabase()
              .from('solved_spots_gold')
              .select('scenario_hash')
              .ilike('scenario_hash', `${safeHash}__`)
              .limit(100);

          if (error) {
              console.warn('[TreeNavigate] Children query error:', error);
              return res.status(500).json({ success: false, error: 'Query failed' });
          }

          // Extract the unique next cards from child hashes
          const availableCards = new Set();
          (childSpots || []).forEach(s => {
              const childBoard = parseBoardFromHash(s.scenario_hash);
              if (childBoard.length > currentBoard.length) {
                  const nextCard = childBoard[currentBoard.length];
                  if (nextCard) availableCards.add(nextCard);
              }
          });

          return res.status(200).json({
              success: true,
              currentBoard,
              availableCards: [...availableCards],
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

import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * 🎮 GOD MODE ENGINE — Submit Action API
 * ═══════════════════════════════════════════════════════════════════════════
 * POST /api/god-mode/submit-action
 * 
 * Evaluates user's action against GTO solution and calculates damage.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { SolverPolicyService, holdingClass } from '../../../src/services/SolverPolicyService.js';
import { gradeSolverPolicyAction } from '../../../src/lib/training/godModePolicyGrading.js';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// Indifference threshold: actions with >= 40% freq are acceptable
const INDIFFERENCE_THRESHOLD = 0.40;
const MAX_CHIP_PENALTY = 25;

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      // Auth: verify JWT
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Auth required' });
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      try {
          const {
              gameId,
              userId: _clientUserId, // ignored - use JWT
              fileId,
              variantHash,
              action,
              sizing,
              heroHand,
              board,
              handData, // Full hand data from fetch-hand including solver_node
          } = req.body;

          // BUG #151 FIX: Always use JWT user.id, ignore client-supplied userId
          const userId = user.id;

          if (!gameId || !action) {
              return res.status(400).json({ error: 'Missing required fields' });
          }

          // Extract data from handData if provided
          const effectiveFileId = fileId || handData?.fileId;
          const effectiveVariantHash = variantHash || handData?.variantHash;
          const effectiveHeroHand = heroHand || handData?.hero_hand;
          const effectiveBoard = board || handData?.board;

          // Every source, including historical hand payloads and fallbacks,
          // is normalized through the canonical policy adapter before grading.
          const policyService = new SolverPolicyService({ db: getSupabase() });
          const heroCards = Array.isArray(effectiveHeroHand)
              ? effectiveHeroHand
              : String(effectiveHeroHand || '').match(/[2-9TJQKA][shdc]/gi) || [];
          let policy = null;
          // A browser-provided policy is never authoritative. Rebuild PIO
          // policy from the server-side artifact; static legacy hands are
          // explicitly downgraded below to a no-EV heuristic envelope.
          if (effectiveFileId
              && !String(effectiveFileId).startsWith('chart_')
              && !String(effectiveFileId).startsWith('bb_')
              && !String(effectiveFileId).startsWith('tt_')) {
              const { records } = await policyService.listSolvedRecords({
                  id: effectiveFileId, limit: 1,
              });
              const record = records[0];
              if (record) {
                  policy = policyService.answerFromRecord(
                      record, policyService.keyForRecord(record),
                      { holdingClass: holdingClass(heroCards) },
                  );
              }
          }
          if (!policy && handData?.solver_node?.actions) {
              policy = policyService.heuristicAnswer(
                  {},
                  Object.entries(handData.solver_node.actions).map(([id, value]) => ({
                      id, family: id, label: formatActionName(id),
                      frequency: Number(value?.frequency) || 0, legal: true,
                      size: { unit: 'unknown', exact: false },
                      // A historical payload has no source seal proving these
                      // values were measured. Preserve its action mix only.
                      chipEvBb: null,
                  })),
                  'legacy_hand_payload_without_canonical_provenance',
              );
          }
          if (!policy || policy.kind === 'unavailable') {
              return res.status(422).json({
                  error: 'No canonical policy is available for this hand. Fetch a fresh hand and retry.',
                  retry: true,
              });
          }
          policy = policyService.consumerEnvelope(policy, 'god-mode');

          // 2. Calculate damage
          const damageResult = gradeSolverPolicyAction({
              userAction: action,
              userSizing: sizing,
              policy,
              indifferenceThreshold: INDIFFERENCE_THRESHOLD,
              maxChipPenalty: MAX_CHIP_PENALTY,
          });

          // Extract level from gameId (e.g., "blind-vs-blind-level-3" → 3)
          const levelMatch = gameId.match(/level-(\d+)/i);
          const level = levelMatch ? parseInt(levelMatch[1], 10) : 1;

          // 2026-08-15 CHECK 13 fix: the round-number lookup queried
          // god_mode_sessions for hands_played/game_id/status/started_at — that
          // table's real schema is entirely different (actions/completed/
          // game_type/score) and the SESSION-PROGRESS table is
          // god_mode_user_session (keyed by game_registry uuid). The old query
          // 42703'd on every action, so the round number was always 1.
          // Resolve the game uuid first; it is also needed for the insert below.
          let gameUUID = null;
          if (gameId) {
              const { data: gameData } = await getSupabase()
                  .from('game_registry')
                  .select('id')
                  .eq('slug', gameId)
                  .maybeSingle();
              gameUUID = gameData?.id || null;
          }

          let roundNumber = 1;
          try {
              if (gameUUID) {
                  const { data: sessionData } = await getSupabase()
                      .from('god_mode_user_session')
                      .select('current_round_hands_played')
                      .eq('user_id', userId)
                      .eq('game_id', gameUUID)
                      .maybeSingle();
                  if (sessionData) {
                      roundNumber = (sessionData.current_round_hands_played || 0) + 1;
                  }
              }
          } catch (sessionError) {
              console.warn('Could not fetch session data:', sessionError.message);
          }

          // 3. Record in hand history
          try {

              // Only insert if we have a valid game UUID
              if (gameUUID) {
                  const { error: err_god_mode_hand_history_1b8b4 } = await getSupabase().from('god_mode_hand_history').insert({
                      user_id: user.id,
                      game_id: gameUUID,
                      source_file_id: effectiveFileId || 'unknown',
                      variant_hash: effectiveVariantHash || '0',
                      hero_hand: effectiveHeroHand || '',
                      board: effectiveBoard || '',
                      level_at_play: level,
                      round_hand_number: roundNumber,
                      user_action: action,
                      user_sizing: sizing,
                      gto_action: damageResult.gtoAction || 'unknown',
                      gto_frequency: damageResult.gtoFrequency || 0,
                      ev_of_user_action: damageResult.userEv,
                      ev_of_gto_action: damageResult.maxEv,
                      is_correct: damageResult.isCorrect || false,
                      is_indifferent: damageResult.isIndifferent || false,
                      chip_penalty: damageResult.chipPenalty || 0,
                  });
                  if (err_god_mode_hand_history_1b8b4) console.warn('[Supabase] Silent mutation failed in god_mode_hand_history:', err_god_mode_hand_history_1b8b4.message);
              } else {
              }
          } catch (dbError) {
              console.warn('Failed to record hand history:', dbError.message);
              // Continue even if recording fails
          }

          // 4. Return result
          return res.status(200).json({
              isCorrect: damageResult.isCorrect,
              isIndifferent: damageResult.isIndifferent,
              evLoss: damageResult.evLoss,
              chipPenalty: damageResult.chipPenalty,
              feedback: damageResult.feedback,
              gtoAction: damageResult.gtoAction,
              gtoFrequency: damageResult.gtoFrequency,
              solverPolicy: policy,
          });

      } catch (error) {
          console.warn('Submit action error:', error);
          return res.status(500).json({ error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Format action name for display
 */
function formatActionName(action) {
    if (action.includes('_')) {
        const [type, size] = action.split('_');
        return `${type.toUpperCase()} ${size}%`;
    }
    return action.toUpperCase();
}

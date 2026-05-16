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
      const { data: authData, error: authErr } = await getSupabase().auth.getUser(token);
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
              potSize = 100,
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
          const effectivePotSize = potSize || handData?.pot_size || 100;

          // 1. Get the solver node - prefer handData.solver_node (already processed)
          let solverNode = handData?.solver_node || null;

          // If no solver_node in handData, try database
          if (!solverNode && effectiveFileId && !effectiveFileId.startsWith('chart_') && !effectiveFileId.startsWith('bb_') && !effectiveFileId.startsWith('tt_')) {
              const { data: spotData } = await getSupabase()
                  .from('solved_spots_gold')
                  .select('strategy_matrix')
                  .eq('id', effectiveFileId)
                  .maybeSingle();

              if (spotData?.strategy_matrix) {
                  // Build solver node from strategy_matrix
                  const sm = spotData.strategy_matrix;
                  solverNode = { actions: {} };

                  if (sm.actions && sm.frequencies && sm.hand_evs) {
                      const hand = effectiveHeroHand?.replace(/[shdc]/g, '').slice(0, 2) || '';
                      const handEv = sm.hand_evs[hand] || 0;

                      for (const act of sm.actions) {
                          const freq = sm.frequencies[act]?.[hand] || 0;
                          solverNode.actions[act] = { frequency: freq, ev: handEv * freq };
                      }
                  }
              }
          }

          // Fallback to mock solver node only if nothing else
          if (!solverNode || Object.keys(solverNode.actions || {}).length === 0) {
              solverNode = getMockSolverNode(action);
          }

          // 2. Calculate damage
          const damageResult = calculateDamage(action, sizing, solverNode, effectivePotSize);

          // Extract level from gameId (e.g., "blind-vs-blind-level-3" → 3)
          const levelMatch = gameId.match(/level-(\d+)/i);
          const level = levelMatch ? parseInt(levelMatch[1], 10) : 1;

          // Get session data to track round number
          let roundNumber = 1;
          try {
              const { data: sessionData } = await getSupabase()
                  .from('god_mode_sessions')
                  .select('hands_played')
                  .eq('user_id', userId)
                  .eq('game_id', gameId)
                  .eq('status', 'active')
                  .order('started_at', { ascending: false })
                  .limit(1)
                  .maybeSingle();

              if (sessionData) {
                  roundNumber = (sessionData.hands_played || 0) + 1;
              }
          } catch (sessionError) {
              console.warn('Could not fetch session data:', sessionError.message);
          }

          // 3. Record in hand history
          try {
              // Lookup game UUID from game_registry by slug
              let gameUUID = null;
              if (gameId) {
                  const { data: gameData } = await getSupabase()
                      .from('game_registry')
                      .select('id')
                      .eq('slug', gameId)
                      .maybeSingle();
                  gameUUID = gameData?.id || null;
              }

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
                      ev_of_user_action: damageResult.userEv || 0,
                      ev_of_gto_action: damageResult.maxEv || 0,
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
 * Calculate damage based on user action vs GTO
 */
function calculateDamage(userAction, userSizing, solverNode, potSize) {
    const actions = solverNode?.actions || {};

    // Find matching action key
    const userActionKey = findMatchingAction(userAction, userSizing, actions);
    const userActionData = actions[userActionKey] || { frequency: 0, ev: 0 };

    // Get user's EV and frequency
    const userEv = userActionData.ev || 0;
    const userFreq = userActionData.frequency || 0;

    // Find max EV action
    let maxEv = 0;
    let maxEvAction = userAction;
    let maxEvFreq = 0;

    for (const [key, data] of Object.entries(actions || {})) {
        const ev = data.ev || 0;
        if (ev > maxEv) {
            maxEv = ev;
            maxEvAction = key;
            maxEvFreq = data.frequency || 0;
        }
    }

    // Calculate EV loss
    const evLoss = Math.max(0, maxEv - userEv);

    // Check for indifference (mixed strategy)
    const isIndifferent = userFreq >= INDIFFERENCE_THRESHOLD;

    // Determine correctness
    const isCorrect = (userActionKey === maxEvAction) || isIndifferent || evLoss < 0.5;

    // Calculate chip penalty
    let chipPenalty = 0;
    let feedback = '';

    if (isCorrect) {
        if (isIndifferent && userActionKey !== maxEvAction) {
            feedback = `✓ Mixed strategy — ${(userFreq * 100).toFixed(0)}% frequency is acceptable.`;
        } else {
            feedback = '✓ Perfect GTO play!';
        }
    } else {
        // Scale EV loss to chip penalty (0-25)
        const relativeLoss = potSize > 0 ? evLoss / potSize : evLoss / 100;
        chipPenalty = Math.min(MAX_CHIP_PENALTY, Math.max(1, Math.ceil(relativeLoss * 25)));

        const formattedAction = formatActionName(maxEvAction);
        feedback = `✗ ${formattedAction} was optimal (${(maxEvFreq * 100).toFixed(0)}%). EV loss: ${evLoss.toFixed(1)}`;
    }

    return {
        isCorrect,
        isIndifferent,
        evLoss,
        chipPenalty,
        feedback,
        gtoAction: maxEvAction,
        gtoFrequency: maxEvFreq,
        userEv,
        maxEv,
    };
}

/**
 * Find matching action in solver node
 */
function findMatchingAction(userAction, userSizing, actions) {
    const action = userAction.toLowerCase();

    // Direct match
    if (actions[action]) return action;

    // Match with sizing
    if (userSizing !== undefined && userSizing !== null) {
        const sizedKey = `${action}_${Math.round(userSizing)}`;
        if (actions[sizedKey]) return sizedKey;

        // Find closest sizing
        for (const key of Object.keys(actions || {})) {
            if (key.startsWith(action)) return key;
        }
    }

    // Partial match
    for (const key of Object.keys(actions || {})) {
        if (key.includes(action) || action.includes(key.split('_')[0])) {
            return key;
        }
    }

    // Handle aliases
    const aliases = {
        raise: ['bet', 'raise', 'bet_50', 'bet_66', 'bet_100'],
        bet: ['bet', 'raise', 'bet_50', 'bet_66', 'bet_100'],
        allin: ['allin', 'all_in', 'shove'],
    };

    if (aliases[action]) {
        for (const alias of aliases[action]) {
            if (actions[alias]) return alias;
        }
    }

    return action;
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

/**
 * Get mock solver node for demo purposes
 */
function getMockSolverNode(userAction) {
    // Return a plausible GTO strategy
    return {
        actions: {
            fold: { frequency: 0.1, ev: 0 },
            check: { frequency: 0.35, ev: 8 },
            call: { frequency: 0.35, ev: 10 },
            bet_50: { frequency: 0.15, ev: 12 },
            bet_100: { frequency: 0.05, ev: 9 },
            raise: { frequency: 0.15, ev: 12 },
        }
    };
}

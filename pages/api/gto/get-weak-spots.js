/**
 * Get Weak Spots API
 * 
 * Analyzes user's training session history to identify weakness patterns.
 * Returns top 3 areas where user needs improvement.
 * 
 * GET /api/gto/get-weak-spots
 * User identity is derived exclusively from the bearer token.
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/apiErrorHandler';

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
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Authorization');

  try {
    // BUG #244 FIX: Require JWT auth — these routes use paid AI APIs
    const _authSupa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const _token = req.headers.authorization?.replace('Bearer ', '');
    if (!_token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { data: authData, error: _authErr } = await _authSupa.auth.getUser(_token);
    const _authUser = authData?.user;
    if (_authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          const userId = _authUser.id; // Trust JWT, not client-supplied query param

          // Fetch recent training sessions
          const { data: sessions, error } = await getSupabase()
              .from('training_sessions')
              .select('position_stats, classification_counts, hand_history, game_id, level, attempt_id, training_attempts!training_sessions_attempt_fk!inner(id, user_id, status, practice_only)')
              .eq('user_id', userId)
              .eq('training_attempts.user_id', userId)
              .eq('training_attempts.status', 'completed')
              .not('attempt_id', 'is', null)
              .eq('training_attempts.practice_only', false)
              .order('created_at', { ascending: false })
              .limit(100);

          if (error) {
              console.warn('[GetWeakSpots] DB Error:', error);
              throw error;
          }

          if (!sessions || sessions.length === 0) {
              return res.status(200).json({
                  success: true,
                  weakSpots: [],
                  message: 'No training data yet. Play some games to get personalized insights!'
              });
          }

          // Analyze patterns across sessions
          const weakSpots = analyzeWeakSpots(sessions);

          return res.status(200).json({
              success: true,
              weakSpots,
              sessionsAnalyzed: sessions.length
          });

      } catch (error) {
          console.warn('[GetWeakSpots] Error:', error);
          return res.status(503).json({
              success: false,
              unavailable: true,
              code: 'VERIFIED_WEAK_SPOTS_UNAVAILABLE',
              error: 'Verified weak-spot history is temporarily unavailable',
          });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

function fieldOf(entry, key) {
    if (!entry || typeof entry !== 'object') return undefined;
    const nested = entry.handData;
    if (nested && typeof nested === 'object' && nested[key] !== undefined && nested[key] !== null) {
        return nested[key];
    }
    return entry[key];
}

export function analyzeWeakSpots(sessions) {
    const patterns = {
        positions: {},    // Track errors by position (UTG, CO, BTN, etc.)
        actions: {},      // Track errors by action type (fold, call, raise)
        handTypes: {},    // Track errors by hand category
        stackDepths: {}   // Track errors by stack depth
    };

    // Use only server-projected aggregates and the sealed hand history. The
    // retired Jarvis answers/leaks payloads were browser-authored and cannot
    // support personalized coaching claims.
    sessions.forEach(session => {
        const positionStats = session?.position_stats && typeof session.position_stats === 'object'
            ? session.position_stats
            : {};
        Object.entries(positionStats).forEach(([position, values]) => {
            const total = Number(values?.total) || 0;
            const correct = Number(values?.correct) || 0;
            const errors = Math.max(0, total - correct);
            if (errors > 0) {
                const key = String(position).toUpperCase();
                if (!key || key === 'UNKNOWN' || key === 'UNK') return;
                patterns.positions[key] = (patterns.positions[key] || 0) + errors;
            }
        });

        const history = Array.isArray(session?.hand_history) ? session.hand_history : [];
        history.forEach(entry => {
            const classification = String(fieldOf(entry, 'classification') || '').toLowerCase();
            const explicitCorrect = fieldOf(entry, 'isCorrect') ?? fieldOf(entry, 'is_correct');
            const isMistake = explicitCorrect === false
                || ['inaccuracy', 'wrong', 'blunder'].includes(classification);
            if (!isMistake) return;

            const action = fieldOf(entry, 'action') || fieldOf(entry, 'userAction');
            const correctAction = fieldOf(entry, 'correctAction')
                || fieldOf(entry, 'bestAction')
                || fieldOf(entry, 'recommendedAction');
            if (action && correctAction && action !== correctAction) {
                const actionError = `${action}_instead_of_${correctAction}`;
                patterns.actions[actionError] = (patterns.actions[actionError] || 0) + 1;
            }

            const hand = fieldOf(entry, 'hand')
                || fieldOf(entry, 'heroHand')
                || fieldOf(entry, 'heroCards');
            if (hand) {
                const handType = categorizeHand(hand);
                patterns.handTypes[handType] = (patterns.handTypes[handType] || 0) + 1;
            }
        });
    });

    // Convert to sorted weak spots array
    const weakSpots = [];

    // Position weaknesses
    const topPositions = getTopN(patterns.positions, 2);
    topPositions.forEach(([position, count]) => {
        if (count >= 2) {
            weakSpots.push({
                area: `${position} Play`,
                type: 'position',
                value: position,
                errorCount: count,
                recommendation: getPositionRecommendation(position)
            });
        }
    });

    // Hand type weaknesses
    const topHandTypes = getTopN(patterns.handTypes, 2);
    topHandTypes.forEach(([handType, count]) => {
        if (count >= 2) {
            weakSpots.push({
                area: `${handType}`,
                type: 'handType',
                value: handType,
                errorCount: count,
                recommendation: getHandTypeRecommendation(handType)
            });
        }
    });

    // Action pattern weaknesses  
    const topActions = getTopN(patterns.actions, 1);
    topActions.forEach(([action, count]) => {
        if (count >= 2) {
            weakSpots.push({
                area: formatActionPattern(action),
                type: 'action',
                value: action,
                errorCount: count,
                recommendation: 'Study the EV difference between these actions'
            });
        }
    });

    // Sort by error count and return top 3
    return weakSpots
        .sort((a, b) => b.errorCount - a.errorCount)
        .slice(0, 3);
}

function getTopN(obj, n) {
    return Object.entries(obj || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, n);
}

function categorizeHand(hand) {
    if (!hand) return 'Unknown';

    let normalized = hand;
    if (Array.isArray(hand)) {
        normalized = hand.map(card => {
            if (typeof card === 'string') return card.charAt(0);
            return card?.rank || '';
        }).join('');
    }
    if (typeof normalized !== 'string') return 'Unknown';
    hand = normalized;

    // Pocket pairs
    if (hand.length >= 2 && hand[0] === hand[1]) {
        const rank = hand[0];
        if ('AKQJ'.includes(rank)) return 'Premium Pairs';
        if ('T987'.includes(rank)) return 'Medium Pairs';
        return 'Small Pairs';
    }

    // Suited hands
    if (hand.includes('s')) {
        if (hand.startsWith('A')) return 'Suited Aces';
        if (['KQ', 'KJ', 'QJ'].some(p => hand.startsWith(p))) return 'Suited Broadways';
        return 'Suited Connectors';
    }

    // Offsuit
    if (hand.includes('o')) {
        if (['AK', 'AQ', 'AJ'].some(p => hand.startsWith(p))) return 'Offsuit Broadways';
        return 'Offsuit Hands';
    }

    return 'Mixed Hands';
}

function formatActionPattern(action) {
    return action
        .replace(/_/g, ' ')
        .replace('instead of', 'vs')
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

function getPositionRecommendation(position) {
    const recommendations = {
        'UTG': 'Focus on tighter UTG ranges - play only premium hands',
        'UTG+1': 'Early position requires discipline - stick to strong holdings',
        'MP': 'Middle position allows slight loosening - add some suited connectors',
        'HJ': 'Hijack can open wider - include more playable hands',
        'CO': 'Cutoff is a steal position - expand your opening range',
        'BTN': 'Button is the best position - play a wide range aggressively',
        'SB': 'Small blind defense is complex - focus on 3-betting or folding',
        'BB': 'Big blind gets good odds - defend wider but know postflop spots'
    };
    return recommendations[position] || 'Study position-specific ranges';
}

function getHandTypeRecommendation(handType) {
    const recommendations = {
        'Premium Pairs': 'Premium pairs should almost always be played for value',
        'Medium Pairs': 'Medium pairs need set mining opportunities at deeper stacks',
        'Small Pairs': 'Small pairs need implied odds - fold at shallow stacks',
        'Suited Aces': 'Suited aces have great playability - rarely fold them in position',
        'Suited Broadways': 'Suited broadways connect well with boards - play them actively',
        'Suited Connectors': 'Suited connectors need fold equity or implied odds',
        'Offsuit Broadways': 'Offsuit broadways are marginal - position matters most',
        'Offsuit Hands': 'Offsuit non-premium hands are often folds in early position'
    };
    return recommendations[handType] || 'Study hand equity and playability';
}

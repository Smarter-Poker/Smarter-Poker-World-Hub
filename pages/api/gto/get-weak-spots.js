/**
 * Get Weak Spots API
 * 
 * Analyzes user's training session history to identify weakness patterns.
 * Returns top 3 areas where user needs improvement.
 * 
 * GET /api/gto/get-weak-spots?userId=xxx
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // BUG #244 FIX: Require JWT auth — these routes use paid AI APIs
  const { createClient: _createAuthClient } = await import('@supabase/supabase-js');
  const _authSupa = _createAuthClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const _token = req.headers.authorization?.replace('Bearer ', '');
  if (!_token) return res.status(401).json({ success: false, error: 'Auth required' });
  const { data: { user: _authUser }, error: _authErr } = await _authSupa.auth.getUser(_token);
  if (_authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const { userId } = req.query;

        if (!userId) {
            return res.status(400).json({ success: false, error: 'userId required' });
        }

        // Fetch recent training sessions
        const { data: sessions, error } = await supabase
            .from('jarvis_training_sessions')
            .select('answers_data, leaks_detected, accuracy, game_id, level')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) {
            console.error('[GetWeakSpots] DB Error:', error);
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
        console.error('[GetWeakSpots] Error:', error);
        return res.status(500).json({
            success: false, error: 'Failed to analyze weak spots',
            success: false
        });
    }
}

function analyzeWeakSpots(sessions) {
    const patterns = {
        positions: {},    // Track errors by position (UTG, CO, BTN, etc.)
        actions: {},      // Track errors by action type (fold, call, raise)
        handTypes: {},    // Track errors by hand category
        stackDepths: {}   // Track errors by stack depth
    };

    let totalMistakes = 0;

    // Process each session's answer data
    sessions.forEach(session => {
        const answers = session.answers_data || [];
        const leaks = session.leaks_detected || [];

        // Process leaks if available
        leaks.forEach(leak => {
            if (leak.position) {
                patterns.positions[leak.position] = (patterns.positions[leak.position] || 0) + 1;
            }
            if (leak.action) {
                patterns.actions[leak.action] = (patterns.actions[leak.action] || 0) + 1;
            }
            if (leak.handType) {
                patterns.handTypes[leak.handType] = (patterns.handTypes[leak.handType] || 0) + 1;
            }
            totalMistakes++;
        });

        // Process raw answers if leaks not populated
        answers.forEach(answer => {
            if (!answer.correct) {
                if (answer.position) {
                    patterns.positions[answer.position] = (patterns.positions[answer.position] || 0) + 1;
                }
                if (answer.userAction && answer.userAction !== answer.correctAction) {
                    const actionError = `${answer.userAction}_instead_of_${answer.correctAction}`;
                    patterns.actions[actionError] = (patterns.actions[actionError] || 0) + 1;
                }
                if (answer.hand) {
                    const handType = categorizeHand(answer.hand);
                    patterns.handTypes[handType] = (patterns.handTypes[handType] || 0) + 1;
                }
                totalMistakes++;
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
    return Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n);
}

function categorizeHand(hand) {
    if (!hand) return 'Unknown';

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

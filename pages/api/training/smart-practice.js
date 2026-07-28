/**
 * API: Smart Practice — AI-Driven Training Recommendations
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Phase 17: Queries the analytics data to determine what the user should
 * practice next, then returns a pre-configured training plan.
 *
 * GET /api/training/smart-practice?gameId=xxx
 *
 * Returns:
 *   recommendation: {
 *     type: 'weak_position' | 'weak_street' | 'mistake_pattern' | 'spaced_review' | 'level_up',
 *     title: "Focus on BB Defense",
 *     description: "Your BB accuracy is 45% — 20pts below your average",
 *     targetPositions: ['BB'],
 *     targetStreet: 'flop',
 *     priority: 1-5,
 *     config: { ...trainerConfig overrides }
 *   },
 *   alternatives: [...more recommendations],
 *   analytics: { summary stats for display }
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { sanitizeParam, withTiming } from '../../../src/utils/trainingApiUtils';
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

// ●● Position and street config ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
const POSITIONS = ['BTN', 'CO', 'HJ', 'MP', 'UTG', 'SB', 'BB'];
const STREETS = ['PREFLOP', 'FLOP', 'TURN', 'RIVER'];

function buildRecommendations(sessions, answers, spacedRepDue) {
    const recommendations = [];

    // ●●● 1. Check for spaced repetition due spots ●●●●●●●●●●●●●●●
    if (spacedRepDue > 0) {
        recommendations.push({
            type: 'spaced_review',
            title: `Review ${spacedRepDue} Weak Spots`,
            description: `You have ${spacedRepDue} mistake${spacedRepDue > 1 ? 's' : ''} due for spaced repetition review. Reviewing now maximizes long-term retention.`,
            targetPositions: [],
            targetStreet: null,
            priority: spacedRepDue >= 5 ? 5 : spacedRepDue >= 2 ? 4 : 3,
            config: { mode: 'spaced_review' },
            reason: 'spaced_repetition_due',
        });
    }

    // ●●● 2. Analyze position accuracy ●●●●●●●●●●●●●●●●●●●●●●●●●●●
    const posStats = {};
    answers.forEach(a => {
        const pos = (a.hero_position || 'UNK').toUpperCase();
        if (!POSITIONS.includes(pos)) return;
        if (!posStats[pos]) posStats[pos] = { correct: 0, total: 0, evLoss: 0 };
        posStats[pos].total += 1;
        if (a.is_correct) posStats[pos].correct += 1;
        posStats[pos].evLoss += (a.ev_loss || 0);
    });

    // Find weakest position with enough data (>= 5 hands)
    const posEntries = Object.entries(posStats || {})
        .filter(([_, s]) => s.total >= 5)
        .map(([pos, s]) => ({
            pos,
            accuracy: Math.round((s.correct / s.total) * 100),
            avgEvLoss: parseFloat((s.evLoss / s.total).toFixed(3)),
            total: s.total,
        }))
        .sort((a, b) => a.accuracy - b.accuracy);

    if (posEntries.length >= 2) {
        const weakest = posEntries[0];
        const overall = Math.round(answers.filter(a => a.is_correct).length / answers.length * 100);
        const gap = overall - weakest.accuracy;

        if (gap >= 10 || weakest.accuracy < 60) {
            recommendations.push({
                type: 'weak_position',
                title: `Fix ${weakest.pos} Play`,
                description: `Your ${weakest.pos} accuracy is ${weakest.accuracy}%${gap >= 10 ? ` — ${gap}pts below your ${overall}% average` : ''}. ${weakest.total} hands analyzed.`,
                targetPositions: [weakest.pos],
                targetStreet: null,
                priority: weakest.accuracy < 40 ? 5 : weakest.accuracy < 55 ? 4 : 3,
                config: { targetPositions: [weakest.pos] },
                reason: 'low_position_accuracy',
                stats: { accuracy: weakest.accuracy, avgEvLoss: weakest.avgEvLoss, hands: weakest.total },
            });
        }
    }

    // ●●● 3. Analyze street accuracy ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
    const streetStats = {};
    answers.forEach(a => {
        const st = (a.street || 'unknown').toUpperCase();
        if (!STREETS.includes(st)) return;
        if (!streetStats[st]) streetStats[st] = { correct: 0, total: 0, evLoss: 0 };
        streetStats[st].total += 1;
        if (a.is_correct) streetStats[st].correct += 1;
        streetStats[st].evLoss += (a.ev_loss || 0);
    });

    const streetEntries = Object.entries(streetStats || {})
        .filter(([_, s]) => s.total >= 5)
        .map(([street, s]) => ({
            street,
            accuracy: Math.round((s.correct / s.total) * 100),
            avgEvLoss: parseFloat((s.evLoss / s.total).toFixed(3)),
            total: s.total,
        }))
        .sort((a, b) => a.accuracy - b.accuracy);

    if (streetEntries.length >= 2) {
        const weakest = streetEntries[0];
        if (weakest.accuracy < 65) {
            recommendations.push({
                type: 'weak_street',
                title: `${weakest.street.charAt(0)}${weakest.street.slice(1).toLowerCase()} Training`,
                description: `Your ${weakest.street.toLowerCase()} accuracy is ${weakest.accuracy}%. Focus on ${weakest.street.toLowerCase()} decisions.`,
                targetPositions: [],
                targetStreet: weakest.street.toLowerCase(),
                priority: weakest.accuracy < 45 ? 5 : 3,
                config: { targetStreet: weakest.street.toLowerCase() },
                reason: 'low_street_accuracy',
                stats: { accuracy: weakest.accuracy, avgEvLoss: weakest.avgEvLoss, hands: weakest.total },
            });
        }
    }

    // ●●● 4. Analyze mistake patterns (spot type clusters) ●●●●●●●
    const spotPatterns = {};
    answers.forEach(a => {
        if (a.classification === 'best' || a.classification === 'correct') return;
        if (!a.classification) return;
        const key = `${a.spot_type || 'general'}|${(a.hero_position || 'UNK').toUpperCase()}`;
        if (!spotPatterns[key]) {
            spotPatterns[key] = { spotType: a.spot_type || 'general', position: (a.hero_position || 'UNK').toUpperCase(), count: 0, evLoss: 0 };
        }
        spotPatterns[key].count += 1;
        spotPatterns[key].evLoss += (a.ev_loss || 0);
    });

    const topPattern = Object.values(spotPatterns || {}).sort((a, b) => b.evLoss - a.evLoss)[0];
    if (topPattern && topPattern.count >= 3) {
        const spotLabels = {
            facing_cbet: 'Facing C-bet', open_raise: 'Open Raise', '3bet_defense': '3-Bet Defense',
            blind_defense: 'Blind Defense', bb_defense: 'BB Defense', sb_play: 'SB Play',
            btn_play: 'BTN Play', check_raise: 'Check-Raise', squeeze: 'Squeeze', donk_bet: 'Donk Bet',
        };
        const label = spotLabels[topPattern.spotType] || topPattern.spotType;

        recommendations.push({
            type: 'mistake_pattern',
            title: `Drill: ${label} from ${topPattern.position}`,
            description: `${topPattern.count} mistakes in ${label} spots from ${topPattern.position}. Total -${topPattern.evLoss.toFixed(1)} EV leaked.`,
            targetPositions: [topPattern.position],
            targetStreet: null,
            priority: topPattern.count >= 5 ? 5 : 3,
            config: { targetPositions: [topPattern.position], spotType: topPattern.spotType },
            reason: 'recurring_mistake_pattern',
            stats: { count: topPattern.count, totalEvLoss: parseFloat(topPattern.evLoss.toFixed(2)) },
        });
    }

    // ●●● 5. Level progression recommendation ●●●●●●●●●●●●●●●●●●●●
    if (sessions.length >= 3) {
        const recent3 = sessions.slice(0, 3);
        const avgScore = Math.round(recent3.reduce((s, x) => s + (x.gtow_score || x.accuracy || 0), 0) / 3);
        const allPassed = recent3.every(s => s.level_passed);

        if (allPassed && avgScore >= 80) {
            const maxLevel = Math.max(...sessions.map(s => s.level || 1));
            recommendations.push({
                type: 'level_up',
                title: 'Ready for Next Level!',
                description: `You've passed your last ${recent3.length} sessions with ${avgScore}% avg score. Time to increase difficulty.`,
                targetPositions: [],
                targetStreet: null,
                priority: 2,
                config: { suggestedLevel: Math.min(maxLevel + 1, 12) },
                reason: 'consistent_high_performance',
                stats: { avgScore, consecutivePasses: recent3.length },
            });
        }
    }

    // ●●● 6. If no strong recommendations, suggest general practice
    if (recommendations.length === 0) {
        recommendations.push({
            type: 'general',
            title: 'General Practice',
            description: answers.length < 50
                ? 'Keep training to build up enough data for personalized recommendations. Need ~50 hands.'
                : 'Your performance is balanced! Keep up the great work with general practice.',
            targetPositions: [],
            targetStreet: null,
            priority: 1,
            config: {},
            reason: answers.length < 50 ? 'insufficient_data' : 'balanced_performance',
        });
    }

    // Sort by priority (highest first)
    return recommendations.sort((a, b) => b.priority - a.priority);
}

export default async function handler(req, res) {
    try {
        withTiming(res);
        if (!applyRateLimit(req, res, LIMITS.read)) return;

        if (req.method !== 'GET') {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
        const user = authData?.user;
        if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

        res.setHeader('Cache-Control', 'private, max-age=60, stale-while-revalidate=120');

        const rawGameId = req.query.gameId ? sanitizeParam(req.query.gameId, 100) : null;

        try {
            // Fetch recent sessions (30 days)
            const sinceDate = new Date(Date.now() - 30 * 86400000).toISOString();

            let sessQuery = getSupabase()
                .from('training_sessions')
                .select('id, gtow_score, accuracy, hands_played, total_ev_loss, level_passed, level, created_at')
                .eq('user_id', user.id)
                .gte('created_at', sinceDate)
                .order('created_at', { ascending: false })
                .limit(50);
            if (rawGameId) sessQuery = sessQuery.eq('game_id', rawGameId);

            let ansQuery = getSupabase()
                .from('training_answers')
                .select('is_correct, hero_position, street, classification, ev_loss, spot_type')
                .eq('user_id', user.id)
                .gte('answered_at', sinceDate)
                .limit(2000);
            if (rawGameId) ansQuery = ansQuery.eq('game_id', rawGameId);

            // Spaced repetition due count
            let srQuery = getSupabase()
                .from('training_spaced_repetition')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .lte('next_review_at', new Date().toISOString());

            const [sessResult, ansResult, srResult] = await Promise.all([
                sessQuery, ansQuery, srQuery,
            ]);

            const sessions = sessResult.data || [];
            const answers = ansResult.data || [];
            const spacedRepDue = srResult.count || 0;

            const recommendations = buildRecommendations(sessions, answers, spacedRepDue);

            return res.status(200).json({
                success: true,
                recommendation: recommendations[0] || null,
                alternatives: recommendations.slice(1),
                analytics: {
                    totalSessions: sessions.length,
                    totalHands: answers.length,
                    overallAccuracy: answers.length > 0
                        ? Math.round(answers.filter(a => a.is_correct).length / answers.length * 100)
                        : 0,
                    spacedRepDue,
                },
            });

        } catch (err) {
            console.warn('[SmartPractice] Error:', err);
            // Graceful fallback
            return res.status(200).json({
                success: true,
                recommendation: {
                    type: 'general',
                    title: 'General Practice',
                    description: 'Start a training session to build up your analytics data.',
                    targetPositions: [],
                    targetStreet: null,
                    priority: 1,
                    config: {},
                    reason: 'error_fallback',
                },
                alternatives: [],
                analytics: { totalSessions: 0, totalHands: 0, overallAccuracy: 0, spacedRepDue: 0 },
            });
        }

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[API Error]', err);
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

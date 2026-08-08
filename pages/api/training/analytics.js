import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * API: Training Analytics — Cross-Session Performance Intelligence
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Phase 16: Aggregates training_answers + training_sessions across ALL sessions
 * to produce trend data, breakdowns by position/street/action, and mistake patterns.
 *
 * GET /api/training/analytics
 *
 * Query params:
 *   gameId: optional game filter
 *   days: lookback window (default 30, max 365)
 *   type: 'full' | 'trends' | 'breakdown' | 'mistakes' (default: 'full')
 *
 * Returns:
 *   scoreTrend:       [{ date, gtowScore, handsPlayed, evLoss }]
 *   positionAccuracy: { BTN: { correct, total, evLoss }, ... }
 *   streetAccuracy:   { preflop: {...}, flop: {...}, turn: {...}, river: {...} }
 *   actionAccuracy:   { fold: {...}, call: {...}, raise: {...}, bet: {...} }
 *   mistakePatterns:  [{ spotType, position, street, count, avgEvLoss }]
 *   classificationTrend: [{ date, best, correct, inaccuracy, wrong, blunder }]
 *   milestones:       { totalHands, totalSessions, bestScore, currentStreak, ... }
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

// ●● Classification weights for scoring ●●●●●●●●●●●●●●●●●●●●●●●●●●
const CLASSIFICATION_WEIGHTS = {
    best: 1.0,
    correct: 0.8,
    inaccuracy: 0.4,
    wrong: 0.1,
    blunder: 0.0,
};

// ●● Aggregate answers into buckets ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
function aggregateByField(answers, field) {
    const buckets = {};
    answers.forEach(a => {
        const key = (a[field] || 'unknown').toUpperCase();
        if (!buckets[key]) {
            buckets[key] = { correct: 0, total: 0, evLoss: 0, classifications: {} };
        }
        buckets[key].total += 1;
        if (a.is_correct) buckets[key].correct += 1;
        buckets[key].evLoss += (a.ev_loss || 0);
        const cls = a.classification || 'unknown';
        buckets[key].classifications[cls] = (buckets[key].classifications[cls] || 0) + 1;
    });

    // Compute accuracy for each bucket
    Object.values(buckets || {}).forEach(b => {
        b.accuracy = b.total > 0 ? Math.round((b.correct / b.total) * 100) : 0;
        b.avgEvLoss = b.total > 0 ? parseFloat((b.evLoss / b.total).toFixed(3)) : 0;
    });

    return buckets;
}

// ●● Score-scale normalization ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// score_scale 2 = signed -100..+100 GTOW score (the current writer).
// score_scale 1 or null = legacy unsigned 0..100 rows. Normalize on read:
// signed = value * 2 - 100. Never mix the two scales in one series.
function normalizeGtowScore(rawScore, scoreScale) {
    if (rawScore === null || rawScore === undefined) return null;
    const v = Number(rawScore) || 0;
    return scoreScale === 2 ? v : v * 2 - 100;
}

// Signed GTOW score for one training_sessions row. Falls back to accuracy
// (always 0..100, i.e. scale-1 shaped) when gtow_score was never written.
function sessionSignedScore(s) {
    const fromScore = normalizeGtowScore(s.gtow_score, s.score_scale);
    if (fromScore !== null) return fromScore;
    const fromAccuracy = normalizeGtowScore(s.accuracy, 1);
    return fromAccuracy !== null ? fromAccuracy : 0;
}

// ●● Bucket answers + sessions by UTC day ●●●●●●●●●●●●●●●●●●●●●●●●
// Day-granular trend of accuracy / EV loss (from training_answers) and
// signed GTOW score (from training_sessions), sorted ascending by date.
function buildDailyTrend(sessions, answers) {
    const days = {};
    const dayOf = (ts) => (typeof ts === 'string' ? ts.slice(0, 10) : '');
    const bucket = (d) => {
        if (!days[d]) days[d] = { date: d, hands: 0, correct: 0, evLoss: 0, sessions: 0, scoreSum: 0, scoreCount: 0 };
        return days[d];
    };
    (answers || []).forEach(a => {
        const d = dayOf(a.answered_at);
        if (!d) return;
        const b = bucket(d);
        b.hands += 1;
        if (a.is_correct) b.correct += 1;
        b.evLoss += (a.ev_loss || 0);
    });
    (sessions || []).forEach(sess => {
        const d = dayOf(sess.created_at);
        if (!d) return;
        const b = bucket(d);
        b.sessions += 1;
        b.scoreSum += sessionSignedScore(sess);
        b.scoreCount += 1;
    });
    return Object.values(days || {})
        .map(d => ({
            date: d.date,
            hands: d.hands,
            sessions: d.sessions,
            accuracy: d.hands > 0 ? Math.round((d.correct / d.hands) * 100) : null,
            evLoss: parseFloat(d.evLoss.toFixed(3)),
            avgEvLoss: d.hands > 0 ? parseFloat((d.evLoss / d.hands).toFixed(3)) : null,
            gtowScoreAvg: d.scoreCount > 0 ? Math.round(d.scoreSum / d.scoreCount) : null,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
}

// ●● Build session score trend ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
function buildScoreTrend(sessions) {
    return sessions
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .map(s => ({
            id: s.id,
            gameId: s.game_id,
            date: s.created_at,
            // Signed -100..+100 regardless of the row's score_scale
            gtowScore: sessionSignedScore(s),
            accuracy: s.accuracy === null || s.accuracy === undefined ? null : s.accuracy,
            handsPlayed: s.hands_played || 0,
            evLoss: s.total_ev_loss || 0,
            avgEvPerHand: s.hands_played > 0 ? parseFloat(((s.total_ev_loss || 0) / s.hands_played).toFixed(3)) : 0,
            level: s.level || 1,
            passed: !!s.level_passed,
            bestStreak: s.best_streak || 0,
        }));
}

// ●● Build classification trend (per-session) ●●●●●●●●●●●●●●●●●●●●
function buildClassificationTrend(sessions) {
    return sessions
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .map(s => {
            const cc = s.classification_counts || {};
            return {
                date: s.created_at,
                best: cc.best || 0,
                correct: cc.correct || 0,
                inaccuracy: cc.inaccuracy || 0,
                wrong: cc.wrong || 0,
                blunder: cc.blunder || 0,
            };
        });
}

// ●● Extract mistake patterns from answers ●●●●●●●●●●●●●●●●●●●●●●●
function extractMistakePatterns(answers) {
    const patterns = {};
    answers.forEach(a => {
        if (!a.classification || a.classification === 'best' || a.classification === 'correct') return;

        const key = `${a.spot_type || 'general'}|${(a.hero_position || 'UNK').toUpperCase()}|${(a.street || 'unknown').toLowerCase()}`;
        if (!patterns[key]) {
            patterns[key] = {
                spotType: a.spot_type || 'general',
                position: (a.hero_position || 'UNK').toUpperCase(),
                street: (a.street || 'unknown').toLowerCase(),
                count: 0,
                totalEvLoss: 0,
                classifications: {},
            };
        }
        patterns[key].count += 1;
        patterns[key].totalEvLoss += (a.ev_loss || 0);
        const cls = a.classification;
        patterns[key].classifications[cls] = (patterns[key].classifications[cls] || 0) + 1;
    });

    return Object.values(patterns || {})
        .map(p => ({
            ...p,
            avgEvLoss: p.count > 0 ? parseFloat((p.totalEvLoss / p.count).toFixed(3)) : 0,
            severity: p.count * (p.totalEvLoss / Math.max(p.count, 1)), // count × avgEV = total impact
        }))
        .sort((a, b) => b.severity - a.severity)
        .slice(0, 20); // Top 20 patterns
}

// ●● Compute milestones ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
function computeMilestones(sessions, answers) {
    const totalSessions = sessions.length;
    const totalHands = answers.length;
    const totalCorrect = answers.filter(a => a.is_correct).length;
    const overallAccuracy = totalHands > 0 ? Math.round((totalCorrect / totalHands) * 100) : 0;
    const bestScore = sessions.length > 0 ? Math.max(...sessions.map(sessionSignedScore)) : 0;
    const totalEvLoss = answers.reduce((sum, a) => sum + (a.ev_loss || 0), 0);
    const avgEvPerHand = totalHands > 0 ? parseFloat((totalEvLoss / totalHands).toFixed(3)) : 0;

    // Streak: consecutive sessions with level_passed = true (most recent first)
    const sortedSessions = [...sessions].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    let currentStreak = 0;
    for (const s of sortedSessions) {
        if (s.level_passed) currentStreak++;
        else break;
    }

    const longestStreak = sessions.length > 0 ? Math.max(...sessions.map(s => s.best_streak || 0), 0) : 0;

    // Rolling averages (last 5 vs previous 5)
    const last5 = sortedSessions.slice(0, 5);
    const prev5 = sortedSessions.slice(5, 10);
    const last5Avg = last5.length > 0 ? Math.round(last5.reduce((s, x) => s + sessionSignedScore(x), 0) / last5.length) : 0;
    const prev5Avg = prev5.length > 0 ? Math.round(prev5.reduce((s, x) => s + sessionSignedScore(x), 0) / prev5.length) : null;

    // Classification totals
    const classificationTotals = {};
    answers.forEach(a => {
        const cls = a.classification || 'unknown';
        classificationTotals[cls] = (classificationTotals[cls] || 0) + 1;
    });

    return {
        totalSessions,
        totalHands,
        totalCorrect,
        overallAccuracy,
        bestScore,
        totalEvLoss: parseFloat(totalEvLoss.toFixed(2)),
        avgEvPerHand,
        currentStreak,
        longestStreak,
        last5Avg,
        prev5Avg,
        trending: prev5Avg !== null ? (last5Avg > prev5Avg ? 'up' : last5Avg < prev5Avg ? 'down' : 'flat') : null,
        trendDelta: prev5Avg !== null ? last5Avg - prev5Avg : null,
        classificationTotals,
    };
}

// ●● Action accuracy from answer_id patterns ●●●●●●●●●●●●●●●●●●●●●
function buildActionAccuracy(answers) {
    const actions = {};
    answers.forEach(a => {
        // Derive action type from answer_id or spot_type
        let action = 'unknown';
        const aid = (a.answer_id || '').toLowerCase();
        if (aid.includes('fold')) action = 'FOLD';
        else if (aid.includes('call')) action = 'CALL';
        else if (aid.includes('raise') || aid.includes('3bet') || aid.includes('4bet')) action = 'RAISE';
        else if (aid.includes('bet') || aid.includes('cbet')) action = 'BET';
        else if (aid.includes('check')) action = 'CHECK';
        else if (aid.includes('allin') || aid.includes('all-in') || aid.includes('jam')) action = 'ALL-IN';

        if (!actions[action]) {
            actions[action] = { correct: 0, total: 0, evLoss: 0, classifications: {} };
        }
        actions[action].total += 1;
        if (a.is_correct) actions[action].correct += 1;
        actions[action].evLoss += (a.ev_loss || 0);
        const cls = a.classification || 'unknown';
        actions[action].classifications[cls] = (actions[action].classifications[cls] || 0) + 1;
    });

    Object.values(actions || {}).forEach(b => {
        b.accuracy = b.total > 0 ? Math.round((b.correct / b.total) * 100) : 0;
        b.avgEvLoss = b.total > 0 ? parseFloat((b.evLoss / b.total).toFixed(3)) : 0;
    });

    return actions;
}

export default async function handler(req, res) {
    try {
        withTiming(res);
        if (!applyRateLimit(req, res, LIMITS.read)) return;

        if (req.method !== 'GET') {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        // Auth required
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
        const user = authData?.user;
        if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

        res.setHeader('Cache-Control', 'private, max-age=30, stale-while-revalidate=60');

        const rawGameId = req.query.gameId ? sanitizeParam(req.query.gameId, 100) : null;
        const rawDays = parseInt(req.query.days || '30', 10);
        const days = Math.min(Math.max(rawDays, 1), 365);
        const type = req.query.type || 'full';

        const sinceDate = new Date(Date.now() - days * 86400000).toISOString();

        try {
            // ●●● Fetch sessions ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
            let sessQuery = getSupabase()
                .from('training_sessions')
                .select('id, game_id, gtow_score, score_scale, hands_played, total_ev_loss, mistake_count, accuracy, correct_count, best_streak, level_passed, level, classification_counts, created_at')
                .eq('user_id', user.id)
                .gte('created_at', sinceDate)
                .order('created_at', { ascending: false })
                .limit(200);

            if (rawGameId) sessQuery = sessQuery.eq('game_id', rawGameId);

            const { data: sessions, error: sessErr } = await sessQuery;
            if (sessErr) {
                console.warn('[Analytics] Sessions query failed:', sessErr.message);
            }
            const safeSessions = sessions || [];

            // ●●● Fetch individual answers ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
            let ansQuery = getSupabase()
                .from('training_answers')
                .select('question_id, answer_id, is_correct, level, hero_position, villain_position, street, classification, ev_loss, spot_type, answered_at')
                .eq('user_id', user.id)
                .gte('answered_at', sinceDate)
                .order('answered_at', { ascending: false })
                .limit(5000);

            if (rawGameId) ansQuery = ansQuery.eq('game_id', rawGameId);

            const { data: answers, error: ansErr } = await ansQuery;
            if (ansErr) {
                console.warn('[Analytics] Answers query failed:', ansErr.message);
            }
            const safeAnswers = answers || [];

            // ●●● Build response based on type ●●●●●●●●●●●●●●●●●●●●●●●●●●
            const result = { success: true, days, gameId: rawGameId || 'ALL' };

            if (type === 'trends' || type === 'full') {
                result.scoreTrend = buildScoreTrend(safeSessions);
                result.classificationTrend = buildClassificationTrend(safeSessions);
                result.dailyTrend = buildDailyTrend(safeSessions, safeAnswers);
            }

            if (type === 'breakdown' || type === 'full') {
                result.positionAccuracy = aggregateByField(safeAnswers, 'hero_position');
                result.streetAccuracy = aggregateByField(safeAnswers, 'street');
                result.actionAccuracy = buildActionAccuracy(safeAnswers);
                result.spotAccuracy = aggregateByField(safeAnswers, 'spot_type');
                result.classificationBreakdown = aggregateByField(safeAnswers, 'classification');
            }

            if (type === 'mistakes' || type === 'full') {
                result.mistakePatterns = extractMistakePatterns(safeAnswers);
            }

            if (type === 'full') {
                result.milestones = computeMilestones(safeSessions, safeAnswers);
            }

            return res.status(200).json(result);

        } catch (err) {
            console.warn('[Analytics] Processing error:', err);
            return res.status(500).json({ success: false, error: 'Analytics processing failed' });
        }

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[API Error]', err);
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

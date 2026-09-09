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
import { buildQuestionConfusion } from '../../../src/lib/training/questionAnalytics.mjs';
import {
    runTrainingPersistenceQuery,
} from '../../../src/lib/training/trainingPersistence.mjs';

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

function measuredSolverEvLoss(answer) {
    if (answer?.solver_verified !== true || answer?.ev_loss_measured !== true) return null;
    const rawValue = answer?.ev_loss;
    if (rawValue === null || rawValue === undefined || rawValue === '') return null;
    const value = Number(rawValue);
    return Number.isFinite(value) ? value : null;
}

function addMeasuredEv(bucket, answer) {
    const evLoss = measuredSolverEvLoss(answer);
    if (evLoss === null) return;
    bucket.measuredEvLoss += evLoss;
    bucket.measuredEvDecisions += 1;
}

function finalizeMeasuredEv(bucket) {
    return {
        evLoss: bucket.measuredEvDecisions > 0
            ? Number(bucket.measuredEvLoss.toFixed(3))
            : null,
        avgEvLoss: bucket.measuredEvDecisions > 0
            ? Number((bucket.measuredEvLoss / bucket.measuredEvDecisions).toFixed(3))
            : null,
        measuredEvDecisions: bucket.measuredEvDecisions,
    };
}

// ●● Aggregate answers into buckets ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
function aggregateByField(answers, field) {
    const buckets = {};
    answers.forEach(a => {
        const key = (a[field] || 'unknown').toUpperCase();
        if (!buckets[key]) {
            buckets[key] = {
                correct: 0,
                total: 0,
                measuredEvLoss: 0,
                measuredEvDecisions: 0,
                classifications: {},
            };
        }
        buckets[key].total += 1;
        if (a.is_correct) buckets[key].correct += 1;
        addMeasuredEv(buckets[key], a);
        const cls = a.classification || 'unknown';
        buckets[key].classifications[cls] = (buckets[key].classifications[cls] || 0) + 1;
    });

    // Compute accuracy for each bucket
    Object.values(buckets || {}).forEach(b => {
        b.accuracy = b.total > 0 ? Math.round((b.correct / b.total) * 100) : 0;
        Object.assign(b, finalizeMeasuredEv(b));
        delete b.measuredEvLoss;
    });

    return buckets;
}

// ●● Score-scale normalization ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// score_scale 2 = signed -100..+100 GTOW score (the current writer).
// Legacy or unlabelled values are not promoted into verified history.
function normalizeGtowScore(rawScore, scoreScale) {
    const value = Number(rawScore);
    if (rawScore === null || rawScore === undefined || !Number.isFinite(value)) return null;
    // Authoritative Phase 6 analytics sessions are projected by
    // fn_save_training_session_v2 and always use the signed scale. A legacy
    // unsigned value is not silently promoted into verified history.
    return Number(scoreScale) === 2 ? value : null;
}

function sessionSignedScore(s) {
    return normalizeGtowScore(s.gtow_score, s.score_scale);
}

// ●● Bucket answers + sessions by UTC day ●●●●●●●●●●●●●●●●●●●●●●●●
// Day-granular trend of accuracy / EV loss (from training_answers) and
// signed GTOW score (from training_sessions), sorted ascending by date.
function buildDailyTrend(sessions, answers) {
    const days = {};
    const dayOf = (ts) => (typeof ts === 'string' ? ts.slice(0, 10) : '');
    const bucket = (d) => {
        if (!days[d]) days[d] = {
            date: d,
            hands: 0,
            correct: 0,
            measuredEvLoss: 0,
            measuredEvDecisions: 0,
            sessions: 0,
            scoreSum: 0,
            scoreCount: 0,
        };
        return days[d];
    };
    (answers || []).forEach(a => {
        const d = dayOf(a.answered_at);
        if (!d) return;
        const b = bucket(d);
        b.hands += 1;
        if (a.is_correct) b.correct += 1;
        addMeasuredEv(b, a);
    });
    (sessions || []).forEach(sess => {
        const d = dayOf(sess.created_at);
        if (!d) return;
        const b = bucket(d);
        b.sessions += 1;
        const score = sessionSignedScore(sess);
        if (score !== null) {
            b.scoreSum += score;
            b.scoreCount += 1;
        }
    });
    return Object.values(days || {})
        .map(d => ({
            date: d.date,
            hands: d.hands,
            sessions: d.sessions,
            accuracy: d.hands > 0 ? Math.round((d.correct / d.hands) * 100) : null,
            ...finalizeMeasuredEv(d),
            gtowScoreAvg: d.scoreCount > 0 ? Math.round(d.scoreSum / d.scoreCount) : null,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
}

// ●● Build session score trend ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
function buildScoreTrend(sessions, answers) {
    const measuredByAttempt = new Map();
    for (const answer of answers || []) {
        const attemptId = String(answer?.attempt_id || '');
        if (!attemptId) continue;
        if (!measuredByAttempt.has(attemptId)) {
            measuredByAttempt.set(attemptId, { measuredEvLoss: 0, measuredEvDecisions: 0 });
        }
        addMeasuredEv(measuredByAttempt.get(attemptId), answer);
    }
    return sessions
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .map(s => {
            const ev = measuredByAttempt.get(String(s.attempt_id || ''))
                || { measuredEvLoss: 0, measuredEvDecisions: 0 };
            const measured = finalizeMeasuredEv(ev);
            return {
                id: s.id,
                gameId: s.game_id,
                date: s.created_at,
                gtowScore: sessionSignedScore(s),
                accuracy: Number.isFinite(Number(s.accuracy)) ? Number(s.accuracy) : null,
                handsPlayed: Number(s.hands_played) || 0,
                evLoss: measured.evLoss,
                avgEvPerHand: measured.avgEvLoss,
                measuredEvDecisions: measured.measuredEvDecisions,
                level: Number(s.level) || 1,
                passed: s.level_passed === true,
                bestStreak: Number(s.best_streak) || 0,
            };
        });
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
                measuredEvLoss: 0,
                measuredEvDecisions: 0,
                classifications: {},
            };
        }
        patterns[key].count += 1;
        addMeasuredEv(patterns[key], a);
        const cls = a.classification;
        patterns[key].classifications[cls] = (patterns[key].classifications[cls] || 0) + 1;
    });

    return Object.values(patterns || {})
        .map(p => {
            const measured = finalizeMeasuredEv(p);
            const publicPattern = { ...p };
            delete publicPattern.measuredEvLoss;
            return {
                ...publicPattern,
                totalEvLoss: measured.evLoss,
                avgEvLoss: measured.avgEvLoss,
                measuredEvDecisions: measured.measuredEvDecisions,
                severity: measured.evLoss,
            };
        })
        .sort((a, b) => (
            (b.severity ?? Number.NEGATIVE_INFINITY)
            - (a.severity ?? Number.NEGATIVE_INFINITY)
            || b.count - a.count
        ))
        .slice(0, 20); // Top 20 patterns
}

// ●● Compute milestones ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
function computeMilestones(sessions, answers) {
    const totalSessions = sessions.length;
    const totalHands = answers.length;
    const totalCorrect = answers.filter(a => a.is_correct).length;
    const overallAccuracy = totalHands > 0 ? Math.round((totalCorrect / totalHands) * 100) : null;
    const authoritativeScores = sessions
        .map(sessionSignedScore)
        .filter(score => score !== null);
    const bestScore = authoritativeScores.length > 0 ? Math.max(...authoritativeScores) : null;
    const measured = { measuredEvLoss: 0, measuredEvDecisions: 0 };
    answers.forEach(answer => addMeasuredEv(measured, answer));
    const measuredSummary = finalizeMeasuredEv(measured);

    // Streak: consecutive sessions with level_passed = true (most recent first)
    const sortedSessions = [...sessions].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    let currentStreak = 0;
    for (const s of sortedSessions) {
        if (s.level_passed) currentStreak++;
        else break;
    }

    const longestStreak = sessions.length > 0 ? Math.max(...sessions.map(s => s.best_streak || 0), 0) : 0;

    // Rolling averages (last 5 vs previous 5)
    const scoredSessions = sortedSessions
        .map(sessionSignedScore)
        .filter(score => score !== null);
    const last5 = scoredSessions.slice(0, 5);
    const prev5 = scoredSessions.slice(5, 10);
    const average = values => values.length > 0
        ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
        : null;
    const last5Avg = average(last5);
    const prev5Avg = average(prev5);

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
        totalEvLoss: measuredSummary.evLoss,
        avgEvPerHand: measuredSummary.avgEvLoss,
        measuredEvDecisions: measuredSummary.measuredEvDecisions,
        currentStreak,
        longestStreak,
        last5Avg,
        prev5Avg,
        trending: last5Avg !== null && prev5Avg !== null
            ? (last5Avg > prev5Avg ? 'up' : last5Avg < prev5Avg ? 'down' : 'flat')
            : null,
        trendDelta: last5Avg !== null && prev5Avg !== null ? last5Avg - prev5Avg : null,
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
            actions[action] = {
                correct: 0,
                total: 0,
                measuredEvLoss: 0,
                measuredEvDecisions: 0,
                classifications: {},
            };
        }
        actions[action].total += 1;
        if (a.is_correct) actions[action].correct += 1;
        addMeasuredEv(actions[action], a);
        const cls = a.classification || 'unknown';
        actions[action].classifications[cls] = (actions[action].classifications[cls] || 0) + 1;
    });

    Object.values(actions || {}).forEach(b => {
        b.accuracy = b.total > 0 ? Math.round((b.correct / b.total) * 100) : 0;
        Object.assign(b, finalizeMeasuredEv(b));
        delete b.measuredEvLoss;
    });

    return actions;
}

export default async function handler(req, res) {
    try {
        withTiming(res);
        res.setHeader('Cache-Control', 'private, no-store, max-age=0');
        res.setHeader('Vary', 'Authorization');
        if (!applyRateLimit(req, res, LIMITS.read)) return;

        if (req.method !== 'GET') {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        // Auth required
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
        const user = authUser;
        if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

        const rawGameId = req.query.gameId ? sanitizeParam(req.query.gameId, 100) : null;
        const daysParam = Array.isArray(req.query.days) ? req.query.days[0] : (req.query.days || '30');
        if (!/^\d+$/.test(String(daysParam))) {
            return res.status(400).json({ success: false, error: 'Invalid days parameter' });
        }
        const rawDays = Number.parseInt(String(daysParam), 10);
        const days = Math.min(Math.max(rawDays, 1), 365);
        const typeParam = Array.isArray(req.query.type) ? req.query.type[0] : (req.query.type || 'full');
        const allowedTypes = new Set(['full', 'trends', 'breakdown', 'mistakes']);
        if (!allowedTypes.has(typeParam)) {
            return res.status(400).json({ success: false, error: 'Invalid analytics type' });
        }
        const type = typeParam;

        const sinceDate = new Date(Date.now() - days * 86400000).toISOString();

        try {
            // ●●● Fetch sessions ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
            const buildSessionQuery = () => {
                let query = getSupabase()
                    .from('training_sessions')
                    .select('id, attempt_id, game_id, gtow_score, score_scale, hands_played, total_ev_loss, mistake_count, accuracy, correct_count, best_streak, level_passed, level, classification_counts, created_at, training_attempts!training_sessions_attempt_fk!inner(id, user_id, status, practice_only, completed_at)')
                    .eq('user_id', user.id)
                    .eq('training_attempts.user_id', user.id)
                    .eq('training_attempts.status', 'completed')
                    .eq('training_attempts.practice_only', false)
                    .not('attempt_id', 'is', null)
                    .gte('created_at', sinceDate)
                    .order('created_at', { ascending: false })
                    .limit(200);
                if (rawGameId) query = query.eq('game_id', rawGameId);
                return query;
            };

            const { data: sessions, error: sessErr } = await runTrainingPersistenceQuery(
                buildSessionQuery,
                { label: 'TrainingAnalytics.sessions' },
            );
            if (sessErr) {
                console.warn('[Analytics] Sessions query failed:', sessErr.message);
                return res.status(503).json({
                    success: false,
                    unavailable: true,
                    code: 'TRAINING_ANALYTICS_UNAVAILABLE',
                    error: 'Training analytics are temporarily unavailable',
                });
            }
            const safeSessions = sessions || [];

            // ●●● Fetch individual answers ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
            const buildAnswerQuery = () => {
                let query = getSupabase()
                    .from('training_answers')
                    .select('attempt_id, game_id, question_id, answer_id, is_correct, level, hero_position, villain_position, street, classification, ev_loss, ev_loss_measured, spot_type, answered_at, solver_verified, evidence_metadata, training_attempts!training_answers_attempt_fk!inner(id, user_id, status, practice_only, completed_at)')
                    .eq('user_id', user.id)
                    .eq('training_attempts.user_id', user.id)
                    .eq('training_attempts.status', 'completed')
                    .eq('training_attempts.practice_only', false)
                    .not('attempt_id', 'is', null)
                    .gte('answered_at', sinceDate)
                    .order('answered_at', { ascending: false })
                    .limit(5000);
                if (rawGameId) query = query.eq('game_id', rawGameId);
                return query;
            };

            const { data: answers, error: ansErr } = await runTrainingPersistenceQuery(
                buildAnswerQuery,
                { label: 'TrainingAnalytics.answers' },
            );
            if (ansErr) {
                console.warn('[Analytics] Answers query failed:', ansErr.message);
                return res.status(503).json({
                    success: false,
                    unavailable: true,
                    code: 'TRAINING_ANALYTICS_UNAVAILABLE',
                    error: 'Training analytics are temporarily unavailable',
                });
            }
            const safeAnswers = answers || [];

            // ●●● Build response based on type ●●●●●●●●●●●●●●●●●●●●●●●●●●
            const result = { success: true, days, gameId: rawGameId || 'ALL' };

            if (type === 'trends' || type === 'full') {
                result.scoreTrend = buildScoreTrend(safeSessions, safeAnswers);
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
                result.questionConfusion = buildQuestionConfusion(safeAnswers);
            }

            if (type === 'full') {
                result.milestones = computeMilestones(safeSessions, safeAnswers);
            }

            return res.status(200).json(result);

        } catch (err) {
            console.warn('[Analytics] Processing error:', err);
            return res.status(503).json({
                success: false,
                unavailable: true,
                code: 'TRAINING_ANALYTICS_UNAVAILABLE',
                error: 'Training analytics are temporarily unavailable',
            });
        }

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[API Error]', err);
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

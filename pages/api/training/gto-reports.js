import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { sanitizeParam, withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { runTrainingPersistenceQuery } from '../../../src/lib/training/trainingPersistence.mjs';
import {
    finiteTrainingNumber,
    projectTrainingSessionEvidence,
} from '../../../src/lib/training/sessionEvidence.mjs';

/**
 * GET /api/training/gto-reports
 *
 * Historical route name retained for links and bookmarks. The response is a
 * verified Training performance report, not a play-frequency comparison. The
 * application does not record the opportunity denominators needed to infer
 * VPIP, PFR, three-bet, or GTO-frequency deviation from quiz accuracy.
 */

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

const VERIFIED_ATTEMPT_SELECT = 'training_attempts!training_sessions_attempt_fk!inner(id, user_id, status, practice_only)';
const PERIODS = new Set(['week', 'month', 'all']);

function emptyBucket(key = {}) {
    return {
        ...key,
        sessions: 0,
        hands: 0,
        correct: 0,
        classifications: { best: 0, correct: 0, inaccuracy: 0, wrong: 0, blunder: 0 },
        measuredEvLoss: 0,
        measuredEvDecisions: 0,
        scoreSum: 0,
        scoreCount: 0,
    };
}

function addSession(bucket, session) {
    bucket.sessions += 1;
    bucket.hands += Number(session.hands_played) || 0;
    bucket.correct += Number(session.correct_count) || 0;
    for (const [classification, count] of Object.entries(session.classification_counts || {})) {
        if (Object.hasOwn(bucket.classifications, classification)) {
            bucket.classifications[classification] += Number(count) || 0;
        }
    }
    if (session.measured_ev_decisions > 0 && session.total_ev_loss !== null) {
        bucket.measuredEvLoss += Number(session.total_ev_loss);
        bucket.measuredEvDecisions += Number(session.measured_ev_decisions);
    }
    if (session.gtow_score_signed !== null) {
        bucket.scoreSum += Number(session.gtow_score_signed);
        bucket.scoreCount += 1;
    }
}

function finalizeBucket(bucket) {
    return {
        ...bucket,
        accuracy: bucket.hands > 0
            ? Math.round((bucket.correct / bucket.hands) * 100)
            : null,
        verifiedScoreAverage: bucket.scoreCount > 0
            ? Number((bucket.scoreSum / bucket.scoreCount).toFixed(2))
            : null,
        totalMeasuredEvLoss: bucket.measuredEvDecisions > 0
            ? Number(bucket.measuredEvLoss.toFixed(4))
            : null,
        avgMeasuredEvLoss: bucket.measuredEvDecisions > 0
            ? Number((bucket.measuredEvLoss / bucket.measuredEvDecisions).toFixed(4))
            : null,
    };
}

export function buildVerifiedTrainingReport(rows, { period = 'all', gameId = '' } = {}) {
    const allSessions = (Array.isArray(rows) ? rows : []).map(projectTrainingSessionEvidence);
    const sessions = gameId
        ? allSessions.filter((session) => String(session.game_id || '') === gameId)
        : allSessions;
    const total = emptyBucket();
    const formats = new Map();
    const days = new Map();
    const positions = new Map();

    for (const session of sessions) {
        addSession(total, session);
        const formatId = String(session.game_id || 'unknown');
        if (!formats.has(formatId)) {
            formats.set(formatId, emptyBucket({
                gameId: formatId,
                gameName: session.game_name || formatId,
                lastPlayed: session.created_at || null,
            }));
        }
        addSession(formats.get(formatId), session);

        const day = typeof session.created_at === 'string' ? session.created_at.slice(0, 10) : '';
        if (day) {
            if (!days.has(day)) days.set(day, emptyBucket({ date: day }));
            addSession(days.get(day), session);
        }

        for (const [position, stats] of Object.entries(session.position_stats || {})) {
            if (!positions.has(position)) {
                positions.set(position, {
                    total: 0,
                    correct: 0,
                    measuredEvLoss: 0,
                    measuredEvDecisions: 0,
                });
            }
            const bucket = positions.get(position);
            bucket.total += Number(stats.total) || 0;
            bucket.correct += Number(stats.correct) || 0;
            if (stats.measuredEvDecisions > 0 && stats.evLoss !== null) {
                bucket.measuredEvLoss += Number(stats.evLoss);
                bucket.measuredEvDecisions += Number(stats.measuredEvDecisions);
            }
        }
    }

    const finalizedTotal = finalizeBucket(total);
    const byFormat = [...formats.values()]
        .map(finalizeBucket)
        .sort((a, b) => b.hands - a.hands || b.sessions - a.sessions);
    const byDate = [...days.values()]
        .map(finalizeBucket)
        .sort((a, b) => a.date.localeCompare(b.date));
    const positionReport = Object.fromEntries([...positions.entries()].map(([position, stats]) => [
        position,
        {
            total: stats.total,
            correct: stats.correct,
            accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : null,
            totalMeasuredEvLoss: stats.measuredEvDecisions > 0
                ? Number(stats.measuredEvLoss.toFixed(4))
                : null,
            avgMeasuredEvLoss: stats.measuredEvDecisions > 0
                ? Number((stats.measuredEvLoss / stats.measuredEvDecisions).toFixed(4))
                : null,
            measuredEvDecisions: stats.measuredEvDecisions,
        },
    ]));

    const formatsAcrossPeriod = new Map();
    for (const session of allSessions) {
        const key = String(session.game_id || 'unknown');
        if (!formatsAcrossPeriod.has(key)) {
            formatsAcrossPeriod.set(key, {
                gameId: key,
                gameName: session.game_name || key,
                sessions: 0,
            });
        }
        formatsAcrossPeriod.get(key).sessions += 1;
    }

    return {
        authority: {
            source: 'sealed_non_practice_training_attempts',
            scoreScale: 2,
            solverEv: 'measured_only',
            frequencyComparisonAvailable: false,
            frequencyComparisonReason: 'Training decisions do not contain complete action-opportunity denominators.',
        },
        period,
        gameId: gameId || null,
        totalSessions: finalizedTotal.sessions,
        totalQuestions: finalizedTotal.hands,
        totalCorrect: finalizedTotal.correct,
        overallAccuracy: finalizedTotal.accuracy,
        verifiedScoreAverage: finalizedTotal.verifiedScoreAverage,
        totalMeasuredEvLoss: finalizedTotal.totalMeasuredEvLoss,
        avgMeasuredEvLoss: finalizedTotal.avgMeasuredEvLoss,
        measuredEvDecisions: finalizedTotal.measuredEvDecisions,
        classifications: finalizedTotal.classifications,
        byFormat,
        byDate,
        positionReport,
        availableFormats: [...formatsAcrossPeriod.values()]
            .sort((a, b) => b.sessions - a.sessions),
        sessions: sessions.map((session) => ({
            id: session.id,
            completedAt: session.created_at,
            gameId: session.game_id || 'unknown',
            gameName: session.game_name || session.game_id || 'unknown',
            accuracy: finiteTrainingNumber(session.accuracy),
            verifiedScore: session.gtow_score_signed,
            handsPlayed: Number(session.hands_played) || 0,
            totalMeasuredEvLoss: session.total_ev_loss,
            avgMeasuredEvLoss: session.avg_ev_loss_per_measured_decision,
            measuredEvDecisions: session.measured_ev_decisions,
            level: Number(session.level) || 1,
            blunders: Number(session.classification_counts?.blunder) || 0,
        })),
    };
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

        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
        const { user, error: authErr } = await getServerUserWithFallback(req, getSupabase());
        if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

        const rawPeriod = Array.isArray(req.query.period) ? req.query.period[0] : (req.query.period || 'all');
        if (!PERIODS.has(rawPeriod)) {
            return res.status(400).json({ success: false, error: 'Invalid report period' });
        }
        const gameId = req.query.gameId ? sanitizeParam(req.query.gameId, 64).trim() : '';
        const now = Date.now();
        const since = rawPeriod === 'week'
            ? new Date(now - (7 * 86400000)).toISOString()
            : rawPeriod === 'month'
                ? new Date(now - (30 * 86400000)).toISOString()
                : null;

        const buildQuery = () => {
            let query = getSupabase()
                .from('training_sessions')
                .select(`id, game_id, game_name, gtow_score, score_scale, level, accuracy, hands_played, correct_count, classification_counts, position_stats, hand_history, attempt_id, created_at, ${VERIFIED_ATTEMPT_SELECT}`)
                .eq('user_id', user.id)
                .eq('training_attempts.user_id', user.id)
                .eq('training_attempts.status', 'completed')
                .not('attempt_id', 'is', null)
                .eq('training_attempts.practice_only', false)
                .order('created_at', { ascending: false })
                .limit(500);
            if (since) query = query.gte('created_at', since);
            return query;
        };

        const { data, error } = await runTrainingPersistenceQuery(buildQuery, {
            label: 'TrainingVerifiedReport.sessions',
        });
        if (error) throw error;

        return res.status(200).json({
            success: true,
            report: buildVerifiedTrainingReport(data, { period: rawPeriod, gameId }),
        });
    } catch (err) {
        try { reportApiError(err, req); } catch (_reportError) {
            console.warn('[App] Handled exception:', _reportError?.message || _reportError);
        }
        console.warn('[VerifiedTrainingReport] Error:', err);
        if (!res.headersSent) {
            return res.status(503).json({
                success: false,
                unavailable: true,
                code: 'TRAINING_GTO_REPORT_UNAVAILABLE',
                error: 'Verified Training report data is temporarily unavailable',
            });
        }
    }
}

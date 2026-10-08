import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * POST /api/trivia/session-submit
 * ===========================================================================
 * Grade a solo trivia run on the server and pay it out.
 *
 * -- WHY THIS EXISTS ------------------------------------------------------
 * The solo modes grade themselves in the browser and then call
 * rpc('add_diamonds_to_balance') with an amount they chose. Diamonds are real
 * currency. This route is the replacement: the client never had the answer
 * key, never computes the reward, and cannot call the payout function at all
 * (award_trivia_run has EXECUTE revoked from anon/authenticated).
 *
 * Everything the payout depends on comes from the server:
 *   - WHICH questions counted           -> trivia_sessions.question_ids
 *   - WHAT the right answer was         -> bound trivia_question_revisions
 *   - HOW display order maps to it      -> trivia_sessions.permutations
 *   - HOW MANY questions the run was    -> length of the stored roster
 *   - HOW MANY points / diamonds        -> computed here, then clamped
 *
 * Any `score`, `correctCount` or `diamonds` in the request body is ignored -
 * this route does not even read those fields.
 *
 * Body: { sessionId, answers: [{ questionId, displayIndex }], cashedOut? }
 * Auth: Bearer token or session cookie (getServerUserWithFallback).
 *
 * -- SERVER-RECORDED ANSWERS TAKE PRECEDENCE ------------------------------
 * When a run went through /api/trivia/session-answer (per-answer verdicts),
 * every revealed answer is already stored on the session row. Those stored
 * answers are BINDING here; questions that never went through session-answer
 * are unanswered. Otherwise
 * a replay could settle from browser-only answers that were never durably
 * bound and could not be reconstructed from the transaction record.
 * Arcade's stake pot is likewise recomputed from the stored answer SEQUENCE
 * (ordinal 'n'), never taken from the client.
 *
 * Returns:
 *   200 { success, correct, total, score, diamondsAwarded, newBalance,
 *         perQuestion: [{ questionId, wasCorrect, correctDisplayIndex }] }
 *   400 bad input
 *   401 not authenticated
 *   403 session belongs to someone else
 *   404 session not found
 *   409 already submitted
 *   410 session expired
 * ===========================================================================
 */

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { serviceClient } from './tournament-lifecycle';
import { getDailyDiamondsEarned, clampToCap } from '../../../src/lib/trivia/diamondCap';
import { getTodayCST, getTodayStartCST } from '../../../src/lib/trivia/getTodayCST';
import { calculateDiamonds, DAILY_DIAMOND_CAPS, getModeConfig } from '../../../src/lib/trivia/triviaEngine';
import { computeStakePot, ARCADE_MAX_RUN_PAYOUT, CASH_OUT_MIN_ANSWERED } from '../../../src/lib/trivia/arcadeStakes';
import {
    isTriviaPvpReleased,
    rejectUnavailableTriviaPvp,
} from '../../../src/lib/trivia/pvpReleaseControl.mjs';
import {
    areTriviaTournamentsReleased,
    rejectUnavailableTriviaTournament,
} from '../../../src/lib/trivia/tournamentReleaseControl.mjs';
import { validateTriviaAwardResponse } from '../../../src/lib/trivia/awardResponsePolicy.mjs';
import {
    CLIENT_TIMING_FIELDS,
    SELF_GRADED_FIELDS,
    findForbiddenFields,
    v3ErrorStatus,
} from '../../../src/lib/trivia/phase3Engine.mjs';
import {
    expectedSoloTransactionReceipts,
    verifySoloTransactionReceipts,
} from '../../../src/lib/trivia/settlementReceiptPolicy.mjs';

async function readSoloSettlementReceipt(sb, userId, sessionId, result) {
    const { data: settledSession, error: sessionError } = await sb
        .from('trivia_sessions')
        .select('id, user_id, mode, status, entry_cost, entry_state, created_at, submitted_at, settlement_request_id, engine_version')
        .eq('id', sessionId)
        .maybeSingle();
    if (sessionError || !settledSession || settledSession.user_id !== userId
        || settledSession.status !== 'submitted' || !settledSession.created_at
        || !settledSession.submitted_at) {
        return { ok: false, error: 'settlement_receipt_unavailable' };
    }
    const submittedAt = new Date(settledSession.submitted_at);
    const createdAt = new Date(settledSession.created_at);
    if (Number.isNaN(submittedAt.getTime()) || Number.isNaN(createdAt.getTime())) {
        return { ok: false, error: 'settlement_receipt_unavailable' };
    }
    const expected = expectedSoloTransactionReceipts({
        sessionId,
        userId,
        mode: settledSession.mode,
        entryCost: settledSession.entry_cost,
        entryState: settledSession.entry_state,
        diamondsAwarded: result?.diamondsAwarded,
        dailyBonusAwarded: result?.dailyBonusAwarded,
        chicagoDate: getTodayCST(createdAt),
    });
    if (!expected) return { ok: false, error: 'settlement_receipt_unavailable' };

    let rows = [];
    if (expected.length > 0) {
        const { data, error } = await sb
            .from('diamond_transactions')
            .select('id, amount, transaction_type, type, balance_after, reference_id, created_at')
            .eq('user_id', userId)
            .in('reference_id', expected.map(item => item.referenceId));
        if (error) return { ok: false, error: 'settlement_receipt_unavailable' };
        rows = data || [];
    }
    const verified = verifySoloTransactionReceipts(expected, rows);
    if (!verified.ok) return verified;
    let durableRequestId = typeof settledSession.settlement_request_id === 'string'
        ? settledSession.settlement_request_id
        : null;
    if (!durableRequestId && settledSession.engine_version) {
        const { data: resultRow, error: resultError } = await sb
            .from('trivia_session_results')
            .select('request_id')
            .eq('session_id', sessionId)
            .maybeSingle();
        if (resultError) return { ok: false, error: 'settlement_receipt_unavailable' };
        durableRequestId = typeof resultRow?.request_id === 'string' ? resultRow.request_id : null;
    }
    if (durableRequestId !== null && !UUID_RE.test(durableRequestId)) {
        return { ok: false, error: 'settlement_receipt_unavailable' };
    }
    return {
        ok: true,
        receipt: {
            sessionId,
            requestId: durableRequestId,
            settlementReference: `trivia_session_${sessionId}`,
            submittedAt: settledSession.submitted_at,
            scoreId: typeof result?.scoreId === 'string' ? result.scoreId : null,
            resultHash: typeof result?.resultHash === 'string' ? result.resultHash : null,
            transactions: verified.receipts,
        },
    };
}

function normalizeHighScoreProjection(value, mode, expectedCorrect = null) {
    if (mode !== 'endless') return { ok: true, projection: null };
    if (!Number.isInteger(expectedCorrect) || expectedCorrect < 0) {
        return { ok: false, error: 'invalid_high_score_projection' };
    }
    if (value?.status === 'ineligible'
        && value.reason === 'historical_run_boundary_overrun'
        && value.highScore === null && value.improved === false) {
        return { ok: true, projection: {
            status: 'ineligible',
            reason: value.reason,
            highScore: null,
            improved: false,
        } };
    }
    if (value?.status === 'pending'
        && ['boundary_status_unavailable', 'projection_unavailable'].includes(value.reason)
        && value.highScore === null && value.improved === false) {
        return { ok: true, projection: {
            status: 'pending',
            reason: value.reason,
            highScore: null,
            improved: false,
        } };
    }
    if (!value || value.success !== true || value.status !== 'persisted'
        || !Number.isInteger(value.verifiedCorrect) || value.verifiedCorrect < 0
        || value.verifiedCorrect !== expectedCorrect
        || !Number.isInteger(value.highScore) || value.highScore < value.verifiedCorrect
        || typeof value.improved !== 'boolean'
        || typeof value.replayed !== 'boolean'
        || typeof value.projectionId !== 'string' || !UUID_RE.test(value.projectionId)) {
        return { ok: false, error: 'invalid_high_score_projection' };
    }
    return { ok: true, projection: {
        status: value.status,
        highScore: value.highScore,
        improved: value.improved,
        verifiedCorrect: value.verifiedCorrect,
        replayed: value.replayed,
        projectionId: value.projectionId,
    } };
}

function authoritativeSurvivalLevel(session) {
    if (session?.mode !== 'survival') return { ok: true, survivalLevel: null };
    if (!Number.isInteger(session?.survival_level)
        || session.survival_level < 1 || session.survival_level > 10) {
        return { ok: false, error: 'invalid_survival_level_authority' };
    }
    return { ok: true, survivalLevel: session.survival_level };
}

const isPlainRecord = value => Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value);

function canonicalJson(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (isPlainRecord(value)) {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function normalizeStoredLegacyReview(value, rosterIds) {
    if (value == null) return { ok: true, review: null };
    if (!Array.isArray(value) || value.length > rosterIds.length) {
        return { ok: false, error: 'settlement_snapshot_invalid' };
    }
    const roster = new Set(rosterIds);
    const seen = new Set();
    const review = [];
    for (const item of value) {
        if (!isPlainRecord(item)
            || typeof item.questionId !== 'string'
            || !UUID_RE.test(item.questionId)
            || !roster.has(item.questionId)
            || seen.has(item.questionId)
            || typeof item.wasCorrect !== 'boolean'
            || !Number.isInteger(item.correctDisplayIndex)
            || item.correctDisplayIndex < -1
            || (item.outcome !== undefined && !['correct', 'wrong', 'voided'].includes(item.outcome))
            || (item.voided !== undefined && typeof item.voided !== 'boolean')) {
            return { ok: false, error: 'settlement_snapshot_invalid' };
        }
        seen.add(item.questionId);
        review.push({
            questionId: item.questionId,
            wasCorrect: item.wasCorrect,
            correctDisplayIndex: item.correctDisplayIndex,
            ...(item.outcome === undefined ? {} : { outcome: item.outcome }),
            ...(item.voided === undefined ? {} : { voided: item.voided }),
        });
    }
    return { ok: true, review };
}

/**
 * A submitted legacy session is a receipt replay, not another grading pass.
 * New settlements seal their complete response under api_response_v1. Older
 * sessions predate that snapshot, so they can only replay fields already
 * committed by award_trivia_run; unavailable review details stay unavailable.
 */
function projectStoredLegacySettlement(session) {
    const stored = session?.settlement_result;
    if (!isPlainRecord(stored)) {
        return { ok: false, error: 'settlement_result_unavailable' };
    }
    const rosterIds = Array.isArray(session.question_ids)
        ? session.question_ids.filter(id => typeof id === 'string' && UUID_RE.test(id))
        : [];
    if (rosterIds.length !== (session.question_ids || []).length
        || new Set(rosterIds).size !== rosterIds.length) {
        return { ok: false, error: 'settlement_snapshot_invalid' };
    }

    const snapshot = stored.api_response_v1;
    if (snapshot !== undefined) {
        if (!isPlainRecord(snapshot)
            || snapshot.success !== true
            || snapshot.sessionId !== session.id
            || snapshot.mode !== session.mode
            || !Number.isInteger(snapshot.correct) || snapshot.correct < 0
            || !Number.isInteger(snapshot.score) || snapshot.score < 0
            || !Number.isInteger(snapshot.diamondsAwarded) || snapshot.diamondsAwarded < 0
            || !Number.isInteger(snapshot.dailyBonusAwarded) || snapshot.dailyBonusAwarded < 0
            || (snapshot.scoreId !== null
                && (typeof snapshot.scoreId !== 'string' || !UUID_RE.test(snapshot.scoreId)))
            || (snapshot.newBalance !== null && !Number.isFinite(snapshot.newBalance))
            || !Number.isInteger(snapshot.total) || snapshot.total < 0
            || !Number.isInteger(snapshot.servedTotal) || snapshot.servedTotal < snapshot.total
            || !Number.isInteger(snapshot.voided) || snapshot.voided < 0
            || snapshot.total + snapshot.voided !== snapshot.servedTotal) {
            return { ok: false, error: 'settlement_snapshot_invalid' };
        }
        const review = normalizeStoredLegacyReview(snapshot.perQuestion, rosterIds);
        if (!review.ok || review.review === null) return { ok: false, error: 'settlement_snapshot_invalid' };
        return {
            ok: true,
            response: {
                success: true,
                sessionId: session.id,
                mode: session.mode,
                correct: snapshot.correct,
                total: snapshot.total,
                servedTotal: snapshot.servedTotal,
                voided: snapshot.voided,
                score: snapshot.score,
                scoreId: snapshot.scoreId,
                diamondsAwarded: snapshot.diamondsAwarded,
                dailyBonusAwarded: snapshot.dailyBonusAwarded,
                newBalance: snapshot.newBalance,
                replayed: true,
                deadlinePassed: snapshot.deadlinePassed === true,
                perQuestion: review.review,
            },
        };
    }

    const verified = validateTriviaAwardResponse(stored, {
        sessionId: session.id,
        score: stored.score,
        correct: stored.correct_count,
        diamonds: stored.diamonds_awarded,
    });
    if (!verified.ok) return { ok: false, error: 'settlement_result_invalid' };
    const receipt = verified.receipt;
    const storedReview = stored.settlement_review ?? stored.review ?? stored.per_question;
    const review = normalizeStoredLegacyReview(storedReview, rosterIds);
    if (!review.ok) return review;

    return {
        ok: true,
        response: {
            success: true,
            sessionId: session.id,
            mode: session.mode,
            correct: receipt.correct,
            score: receipt.score,
            scoreId: receipt.scoreId,
            diamondsAwarded: receipt.diamondsAwarded,
            dailyBonusAwarded: receipt.dailyBonusAwarded,
            newBalance: receipt.newBalance,
            replayed: true,
            ...(Number.isInteger(stored.total) && stored.total >= 0 ? { total: stored.total } : {}),
            ...(Number.isInteger(stored.served_total) && stored.served_total >= 0
                ? { servedTotal: stored.served_total }
                : {}),
            ...(Number.isInteger(stored.voided) && stored.voided >= 0 ? { voided: stored.voided } : {}),
            ...(review.review === null ? {} : { perQuestion: review.review }),
        },
    };
}

async function respondWithStoredLegacySettlement(res, sb, userId, session) {
    const survivalAuthority = authoritativeSurvivalLevel(session);
    if (!survivalAuthority.ok) {
        return res.status(502).json({ success: false, error: survivalAuthority.error });
    }
    const projected = projectStoredLegacySettlement(session);
    if (!projected.ok) {
        console.warn('[trivia session-submit] immutable replay unavailable:', projected.error);
        return res.status(502).json({ success: false, error: projected.error });
    }
    const evidence = await readSoloSettlementReceipt(sb, userId, session.id, projected.response);
    if (!evidence.ok) {
        console.warn('[trivia session-submit] settlement receipt unavailable:', evidence.error);
        return res.status(502).json({ success: false, error: evidence.error });
    }
    const replayRequestId = typeof session.settlement_request_id === 'string'
        && UUID_RE.test(session.settlement_request_id)
        ? session.settlement_request_id
        : session.id;
    const response = projected.response;
    const { data: replay, error: replayError } = await sb.rpc('award_trivia_run_v5', {
        p_session_id: session.id,
        p_score: Number.isInteger(response.score) ? response.score : 0,
        p_correct: Number.isInteger(response.correct) ? response.correct : 0,
        p_total: Number.isInteger(response.total) ? response.total : 0,
        p_answered: 0,
        p_diamonds: Number.isInteger(response.diamondsAwarded) ? response.diamondsAwarded : 0,
        p_completion_total: Number.isInteger(response.servedTotal) ? response.servedTotal : 0,
        p_completion_answered: 0,
        p_request_id: replayRequestId,
        p_settlement_snapshot: null,
    });
    if (replayError || replay?.success !== true) {
        const code = replay?.error || 'settlement_replay_failed';
        console.warn('[trivia session-submit] v5 immutable replay failed:', replayError?.message || code);
        return res.status(v3ErrorStatus(code)).json({ success: false, error: code });
    }
    const normalizedProjection = normalizeHighScoreProjection(
        replay.highScoreProjection, session.mode, projected.response.correct);
    if (!normalizedProjection.ok) {
        console.warn('[trivia session-submit] immutable high-score projection invalid:', normalizedProjection.error);
        return res.status(502).json({ success: false, error: normalizedProjection.error });
    }
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    return res.status(200).json({
        ...projected.response,
        ...(session.mode === 'survival'
            ? { survivalLevel: survivalAuthority.survivalLevel }
            : {}),
        receipt: evidence.receipt,
        ...(normalizedProjection.projection
            ? { highScoreProjection: normalizedProjection.projection }
            : {}),
    });
}

async function reloadStoredLegacySession(sb, userId, sessionId) {
    const { data, error } = await sb
        .from('trivia_sessions')
        .select('id, user_id, mode, question_ids, status, settlement_result, settlement_request_id, survival_level')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .maybeSingle();
    if (error || !data || data.status !== 'submitted') return null;
    return data;
}

/**
 * Engine v3 reward: today's formulas (calculateDiamonds / arcade stake pot / daily
 * caps) applied to the DATABASE grade. The database re-grades inside
 * trivia_session_settle_solo_v5 and refuses any stale grade basis
 * ('grade_changed').
 */
async function v3RewardDiamonds(sb, userId, mode, grade, ageMs, cashedOut, playDate) {
    const cfg = getModeConfig(mode);
    const limit = Number(cfg?.timeLimit);
    const elapsedSec = Number.isFinite(ageMs) ? Math.floor(ageMs / 1000) : 0;
    const timeRemaining = Number.isFinite(limit) && limit > 0 ? Math.max(0, limit - elapsedSec) : 0;
    const seq = Array.isArray(grade.sequence) ? grade.sequence : [];
    let raw;
    if (mode === 'arcade' && seq.length > 0) {
        const { pot, answered } = computeStakePot(seq);
        const runComplete = seq.length >= Number(grade.graded_total || 0);
        const legitimateCashOut = cashedOut === true && answered >= CASH_OUT_MIN_ANSWERED;
        raw = (runComplete || legitimateCashOut) ? Math.min(ARCADE_MAX_RUN_PAYOUT, Math.max(0, Math.floor(pot))) : 0;
    } else {
        raw = Math.max(0, Math.floor(calculateDiamonds(mode, Number(grade.correct) || 0, Number(grade.graded_total) || 0, timeRemaining) || 0));
    }
    const cap = DAILY_DIAMOND_CAPS[mode];
    if (!Number.isFinite(cap)) return 0;
    const [fromScores, fromSessions] = await Promise.all([
        getDailyDiamondsEarned(sb, userId, mode, playDate),
        sessionDiamondsForDay(sb, userId, mode, playDate),
    ]);
    return Math.max(0, Math.floor(clampToCap(Math.max(fromScores || 0, fromSessions || 0), raw, cap)));
}

async function submitV3(req, res, sb, userId, session) {
    const survivalAuthority = authoritativeSurvivalLevel(session);
    if (!survivalAuthority.ok) {
        return res.status(502).json({ success: false, error: survivalAuthority.error });
    }
    const sig = req.body?.contractSignature;
    const competitive = session.mode === 'pvp' || session.mode === 'tournaments';
    if ((sig != null || competitive) && sig !== session.contract_signature) {
        return res.status(409).json({ success: false, error: 'contract_mismatch' });
    }
    const requestId = typeof req.body?.requestId === 'string' && UUID_RE.test(req.body.requestId)
        ? req.body.requestId
        : session.id;
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    if (competitive) {
        const { data, error } = await sb.rpc('trivia_session_submit_v3', {
            p_session_id: session.id, p_user_id: userId, p_request_id: requestId,
        });
        if (error) return res.status(500).json({ success: false, error: 'grading_failed' });
        if (!data || data.success !== true) {
            return res.status(v3ErrorStatus(data?.error)).json({ success: false, error: data?.error || 'grading_failed' });
        }
        return res.status(200).json({
            success: true, sessionId: session.id, mode: session.mode, engine: 'trivia-engine/3',
            correct: data.correct, total: data.graded_total, score: data.score, voided: data.voided,
            replayed: data.replayed === true, diamondsAwarded: 0, resultHash: data.result_hash,
            ...(session.mode === 'survival'
                ? { survivalLevel: survivalAuthority.survivalLevel }
                : {}),
        });
    }
    const createdMs = session.created_at ? new Date(session.created_at).getTime() : NaN;
    const ageMs = Number.isFinite(createdMs) ? Date.now() - createdMs : Number.POSITIVE_INFINITY;
    const playDate = Number.isFinite(createdMs) ? getTodayCST(new Date(createdMs)) : null;
    if (!playDate || !/^\d{4}-\d{2}-\d{2}$/.test(playDate)) {
        return res.status(500).json({ success: false, error: 'invalid_session_time' });
    }
    let settled = null;
    for (let attempt = 0; attempt < 2; attempt++) {
        const { data: grade, error: gradeErr } = await sb.rpc('trivia_session_grade_v3', { p_session_id: session.id });
        if (gradeErr || !grade || grade.success !== true) {
            return res.status(500).json({ success: false, error: 'grading_failed' });
        }
        const diamonds = session.status === 'open'
            ? await v3RewardDiamonds(
                sb, userId, session.mode, grade, ageMs,
                req.body?.cashedOut === true, playDate,
            )
            : 0;
        const { data, error } = await sb.rpc('trivia_session_settle_solo_v5', {
            p_session_id: session.id, p_user_id: userId, p_diamonds: diamonds,
            p_grade_basis: grade, p_request_id: requestId,
        });
        if (error) return res.status(500).json({ success: false, error: 'award_failed' });
        settled = data;
        if (data?.error !== 'grade_changed') break;
    }
    if (!settled || settled.success !== true) {
        return res.status(v3ErrorStatus(settled?.error)).json({
            success: false,
            error: settled?.error || 'award_failed',
            ...(Number.isInteger(settled?.nonPaidMissCount)
                ? { nonPaidMissCount: settled.nonPaidMissCount }
                : {}),
            ...(Number.isInteger(settled?.terminalFailureCount)
                ? { terminalFailureCount: settled.terminalFailureCount }
                : {}),
            ...(Number.isInteger(settled?.missLimit) ? { missLimit: settled.missLimit } : {}),
            ...(typeof settled?.runMissLimitReached === 'boolean'
                ? { runMissLimitReached: settled.runMissLimitReached }
                : {}),
        });
    }
    const normalizedProjection = normalizeHighScoreProjection(
        settled.highScoreProjection, session.mode, settled.correct);
    if (!normalizedProjection.ok) {
        console.warn('[trivia session-submit] atomic high-score projection invalid:', normalizedProjection.error);
        return res.status(502).json({ success: false, error: normalizedProjection.error });
    }
    const response = {
        success: true, sessionId: session.id, mode: session.mode, engine: 'trivia-engine/3',
        correct: settled.correct, total: settled.graded_total, score: settled.score, voided: settled.voided,
        scoreId: settled.score_id ?? null, diamondsAwarded: Number(settled.diamonds_awarded) || 0,
        dailyBonusAwarded: Number(settled.daily_bonus_awarded) || 0,
        newBalance: settled.new_balance == null ? null : Number(settled.new_balance),
        replayed: settled.replayed === true, deadlinePassed: false,
        resultHash: typeof settled.result_hash === 'string' ? settled.result_hash : null,
        perQuestion: Array.isArray(settled.per_question) ? settled.per_question.map(p => {
            const voided = p.outcome === 'void';
            return {
                questionId: p.questionId,
                wasCorrect: voided ? false : p.wasCorrect === true,
                correctDisplayIndex: voided
                    ? -1
                    : (Number.isInteger(p.correctDisplayIndex) ? p.correctDisplayIndex : -1),
                outcome: voided ? 'voided' : p.outcome,
                voided,
            };
        }) : [],
        ...(session.mode === 'survival'
            ? { survivalLevel: survivalAuthority.survivalLevel }
            : {}),
    };
    const evidence = await readSoloSettlementReceipt(sb, userId, session.id, response);
    if (!evidence.ok) {
        console.warn('[trivia session-submit] settlement receipt unavailable:', evidence.error);
        return res.status(502).json({ success: false, error: evidence.error });
    }
    return res.status(200).json({
        ...response,
        receipt: evidence.receipt,
        ...(normalizedProjection.projection
            ? { highScoreProjection: normalizedProjection.projection }
            : {}),
    });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validPermutation(value, optionCount) {
    return Array.isArray(value)
        && value.length === optionCount
        && value.every(index => Number.isInteger(index) && index >= 0 && index < optionCount)
        && new Set(value).size === optionCount;
}

/** A session that was never submitted goes stale. Six hours. */
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Points a single correct answer is worth, per mode. Mirrors
 * MAX_POINTS_PER_QUESTION in pages/api/trivia/submit.js so a score produced
 * here always passes that route's plausibility ceiling
 * (score <= correct * perQuestionCap).
 */
const MAX_POINTS_PER_QUESTION = {
    daily: 100, history: 100, rules: 100, pro: 100, arcade: 200,
    mtt: 100, cash: 100, icm: 100, gto: 150,
    survival: 200, endless: 200, tournaments: 200,
    mixed: 100, 'time-attack': 200, pvp: 100,
};
const DEFAULT_MAX_POINTS_PER_QUESTION = 100;

/**
 * Diamonds already banked on the session's immutable CST play day from
 * server-graded sessions.
 *
 * getDailyDiamondsEarned() reads trivia_scores.diamonds_earned, which this
 * route does not write, so on its own it would report 0 forever and the daily
 * cap would never bind. Summing our own submitted sessions closes that gap;
 * the caller takes the LARGER of the two, so the cap holds no matter which
 * ledger a mode happens to write to.
 */
function nextChicagoDate(chicagoDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(chicagoDate || ''))) return null;
    const [year, month, day] = chicagoDate.split('-').map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + 1, 12));
    if (Number.isNaN(next.getTime())) return null;
    return [next.getUTCFullYear(), String(next.getUTCMonth() + 1).padStart(2, '0'),
        String(next.getUTCDate()).padStart(2, '0')].join('-');
}

async function sessionDiamondsForDay(sb, userId, mode, chicagoDate) {
    try {
        const nextDate = nextChicagoDate(chicagoDate);
        if (!nextDate) return Number.POSITIVE_INFINITY;
        const { data, error } = await sb
            .from('trivia_sessions')
            .select('diamonds_awarded')
            .eq('user_id', userId)
            .eq('mode', mode)
            .eq('status', 'submitted')
            .gte('created_at', getTodayStartCST(chicagoDate))
            .lt('created_at', getTodayStartCST(nextDate))
            .limit(1000);
        if (error) {
            // Fail closed: an unreadable ledger must not read as "nothing
            // earned today", which would hand out a fresh daily allowance.
            console.warn('[trivia session-submit] cap query failed, treating today as full:', error.message || error);
            return Number.POSITIVE_INFINITY;
        }
        return (data || []).reduce((sum, r) => sum + (r.diamonds_awarded || 0), 0);
    } catch (e) {
        console.warn('[trivia session-submit] cap query threw, treating today as full:', e?.message || e);
        return Number.POSITIVE_INFINITY;
    }
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }
        if (!applyRateLimit(req, res, LIMITS.write)) return;

        const sb = serviceClient();

        // --- AUTH (identity from the token/cookie, never from the body) ---
        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, sb);
        if (authErr || !authUser) {
            return res.status(401).json({ success: false, error: 'authentication_required' });
        }
        const userId = authUser.id;

        // --- INPUT -------------------------------------------------------
        const { sessionId, answers, cashedOut } = req.body || {};
        if (typeof sessionId !== 'string' || !UUID_RE.test(sessionId)) {
            return res.status(400).json({ success: false, error: 'invalid_session_id' });
        }
        if (!Array.isArray(answers)) {
            return res.status(400).json({ success: false, error: 'invalid_answers' });
        }
        // The retired self-graded protocol and client clocks are refused outright.
        const selfGraded = findForbiddenFields(req.body, SELF_GRADED_FIELDS);
        if (selfGraded.length > 0) {
            return res.status(400).json({ success: false, error: 'legacy_submission_shape', fields: selfGraded });
        }
        const forgedTiming = findForbiddenFields(req.body, CLIENT_TIMING_FIELDS);
        if (forgedTiming.length > 0) {
            return res.status(400).json({ success: false, error: 'client_timing_not_accepted', fields: forgedTiming });
        }

        // --- LOAD THE SESSION (service role; RLS blocks client writes) ----
        const { data: session, error: loadErr } = await sb
            .from('trivia_sessions')
            .select('id, user_id, mode, question_ids, question_revision_ids, permutations, status, created_at, expires_at, answers, settlement_result, settlement_request_id, score, correct_count, diamonds_awarded, engine_version, contract_signature, survival_level')
            .eq('id', sessionId)
            .maybeSingle();
        if (loadErr) {
            console.warn('[trivia session-submit] session load failed:', loadErr.message || loadErr);
            return res.status(500).json({ success: false, error: 'session_load_failed' });
        }
        if (!session) {
            return res.status(404).json({ success: false, error: 'session_not_found' });
        }
        // Ownership is checked against the token identity, so a leaked or
        // guessed session id cannot be cashed in by another account.
        if (session.user_id !== userId) {
            return res.status(403).json({ success: false, error: 'not_your_session' });
        }
        const survivalAuthority = authoritativeSurvivalLevel(session);
        if (!survivalAuthority.ok) {
            return res.status(502).json({ success: false, error: survivalAuthority.error });
        }
        if (session.mode === 'pvp' && !isTriviaPvpReleased(process.env)) {
            return rejectUnavailableTriviaPvp(res);
        }
        if (session.mode === 'tournaments' && !areTriviaTournamentsReleased(process.env)) {
            return rejectUnavailableTriviaTournament(res);
        }
        if (session.engine_version) {
            return await submitV3(req, res, sb, userId, session);
        }
        const replaying = session.status === 'submitted';
        if (session.status !== 'open' && !replaying) {
            return res.status(409).json({ success: false, error: 'session_closed' });
        }
        // Settlement replay is resolved before any mutable question, answer-key
        // or eligibility read. A later curation/quarantine change cannot alter
        // an already committed result or the review the player originally saw.
        if (replaying) {
            return await respondWithStoredLegacySettlement(res, sb, userId, session);
        }

        const createdMs = session.created_at ? new Date(session.created_at).getTime() : NaN;
        const ageMs = Number.isFinite(createdMs) ? Date.now() - createdMs : Number.POSITIVE_INFINITY;
        const playDate = Number.isFinite(createdMs) ? getTodayCST(new Date(createdMs)) : null;
        if (!playDate || !/^\d{4}-\d{2}-\d{2}$/.test(playDate)) {
            return res.status(500).json({ success: false, error: 'invalid_session_time' });
        }
        const expiresMs = session.expires_at ? new Date(session.expires_at).getTime() : NaN;
        const deadlinePassed = !replaying && (
            (Number.isFinite(expiresMs) && Date.now() > expiresMs)
            || (!Number.isFinite(expiresMs) && ageMs > SESSION_TTL_MS)
        );
        // `deadlinePassed` is advisory response metadata only. The locked
        // award_trivia_run_v5 delegates to the locked v4 award transaction and
        // is the deadline authority: checking
        // and closing here would leave a TOCTOU window in which another submit
        // could cross expires_at after this read but before the SQL award.

        const mode = session.mode;
        const storedRosterIds = Array.isArray(session.question_ids) ? session.question_ids : [];
        if (storedRosterIds.length === 0) {
            return res.status(400).json({ success: false, error: 'empty_session' });
        }
        const rosterIds = storedRosterIds
            .filter(id => typeof id === 'string' && UUID_RE.test(id));
        if (rosterIds.length !== storedRosterIds.length || new Set(rosterIds).size !== rosterIds.length) {
            console.warn('[trivia session-submit] stored roster is malformed');
            return res.status(500).json({ success: false, error: 'grading_failed' });
        }
        // --- COLLECT ANSWERS, DROPPING ANYTHING OFF-ROSTER ---------------
        // submit.js grades whatever ids the client sends, so a client could
        // hand it a hand-picked list of questions it already knew. Here an id
        // that was not served in THIS session is simply not gradeable.
        //
        // Only answers recorded through /api/trivia/session-answer count.
        // The submit body's array is accepted for wire compatibility but is
        // never a source of truth: every paid answer must have a durable,
        // timestamped first-answer-wins record before settlement.
        const serverAnswers = (session.answers && typeof session.answers === 'object')
            ? session.answers
            : {};
        const byId = new Map();
        for (const qid of rosterIds) {
            const rec = serverAnswers[qid];
            if (rec && Number.isInteger(rec.d)) byId.set(qid, rec.d);
        }
        // `answers` deliberately remains unread beyond shape validation.

        // --- THE ANSWER KEY, FETCHED SERVER-SIDE ONLY --------------------
        const revisionMap = session.question_revision_ids && typeof session.question_revision_ids === 'object'
            && !Array.isArray(session.question_revision_ids)
            ? session.question_revision_ids
            : {};
        const revisionIds = rosterIds.map(questionId => revisionMap[questionId]);
        if (revisionIds.some(revisionId => typeof revisionId !== 'string' || !UUID_RE.test(revisionId))) {
            return res.status(409).json({ success: false, error: 'revision_provenance_unavailable' });
        }
        const [keyResult, eligibilityResult] = await Promise.all([
            sb.from('trivia_question_revisions')
                .select('id, question_id, correct_index, options, structurally_valid')
                .in('id', revisionIds),
            sb.from('trivia_question_eligibility_v1')
                .select('question_id, structurally_valid, audit_verified, quarantined')
                .in('question_id', rosterIds),
        ]);
        if (keyResult.error || eligibilityResult.error) {
            const gradingError = keyResult.error || eligibilityResult.error;
            console.warn('[trivia session-submit] answer key/eligibility lookup failed:', gradingError.message || gradingError);
            return res.status(500).json({ success: false, error: 'grading_failed' });
        }
        const keyRows = keyResult.data || [];
        const keyById = new Map((keyRows || [])
            .filter(row => revisionMap[row.question_id] === row.id)
            .map(row => [row.question_id, row]));
        const eligibilityById = new Map((eligibilityResult.data || []).map(r => [r.question_id, r]));
        // Match trivia_p3_grade exactly. Serving-quality/review policy can
        // stop a row from entering a future roster, but only malformed
        // structure, a failed audit or active quarantine neutralizes a row
        // that was already served. Missing projections fail grading above;
        // they never silently become a player-selected void.
        const voidedIds = new Set(rosterIds.filter(qid => {
            const eligibility = eligibilityById.get(qid);
            return serverAnswers[qid]?.v === true
                || keyById.get(qid)?.structurally_valid === false
                || eligibility?.audit_verified === false
                || eligibility?.quarantined === true;
        }));
        if (keyById.size !== rosterIds.length || eligibilityById.size !== rosterIds.length) {
            console.warn('[trivia session-submit] grading projection incomplete');
            return res.status(500).json({ success: false, error: 'grading_failed' });
        }

        // --- GRADE -------------------------------------------------------
        // The denominator is the SERVED roster, not the answered subset.
        // Otherwise a client answers only the one question it knows and books
        // a 100% run with the perfect bonus.
        const stored = (session.permutations && typeof session.permutations === 'object')
            ? session.permutations
            : {};
        const perQuestion = [];
        let correct = 0;

        for (const qid of rosterIds) {
            const row = keyById.get(qid);
            if (voidedIds.has(qid)) {
                perQuestion.push({
                    questionId: qid,
                    wasCorrect: false,
                    correctDisplayIndex: -1,
                    outcome: 'voided',
                    voided: true,
                });
                continue;
            }
            const optionCount = Array.isArray(row?.options) ? row.options.length : 0;
            // The persisted permutation is part of the immutable session
            // evidence. Never recreate it under a later algorithm version.
            const order = stored[qid];
            if (!validPermutation(order, optionCount)) {
                return res.status(409).json({ success: false, error: 'revision_provenance_unavailable' });
            }

            const displayIndex = byId.has(qid) ? byId.get(qid) : -1;
            const originalIndex = (Number.isInteger(displayIndex)
                && displayIndex >= 0 && displayIndex < order.length)
                ? order[displayIndex]
                : -1;

            const key = Number.isInteger(row?.correct_index) ? row.correct_index : -1;
            const wasCorrect = key >= 0 && originalIndex === key;
            if (wasCorrect) correct += 1;

            // Feedback the client can render AFTER the fact. Handing back the
            // display position of the answer once the run is closed leaks
            // nothing: the run is already graded and paid.
            const correctDisplayIndex = key >= 0 ? order.indexOf(key) : -1;
            perQuestion.push({ questionId: qid, wasCorrect, correctDisplayIndex, outcome: wasCorrect ? 'correct' : 'wrong', voided: false });
        }

        const servedTotal = rosterIds.length;
        const voided = voidedIds.size;
        const total = Math.max(0, servedTotal - voided);

        // --- SCORE (server-computed, mirrors submit.js's ceiling) --------
        const perQuestionPoints = MAX_POINTS_PER_QUESTION[mode] ?? DEFAULT_MAX_POINTS_PER_QUESTION;
        const score = correct * perQuestionPoints;

        // --- DIAMONDS ----------------------------------------------------
        // Time bonus (arcade) is derived from the session's own created_at,
        // never from a client-reported clock.
        const cfg = getModeConfig(mode);
        const limit = Number(cfg?.timeLimit);
        const elapsedSec = Number.isFinite(ageMs) ? Math.floor(ageMs / 1000) : 0;
        const timeRemaining = Number.isFinite(limit) && limit > 0
            ? Math.max(0, limit - elapsedSec)
            : 0;

        // Arcade is a STAKES mode: the pot (build on correct, bust on wrong,
        // cash out from question CASH_OUT_MIN_ANSWERED) IS the reward. It is
        // recomputed here from the server-recorded answer sequence - never
        // read from the client. An arcade run abandoned mid-way without a
        // legitimate cash-out pays nothing, exactly like the game UI says.
        let rawDiamonds;
        const verdictById = new Map(perQuestion.filter(p => !p.voided).map(p => [p.questionId, p.wasCorrect]));
        const recordedSeq = rosterIds
            .map(qid => ({ qid, rec: serverAnswers[qid] }))
            .filter(x => !voidedIds.has(x.qid) && x.rec && Number.isInteger(x.rec.n))
            .sort((a, b) => a.rec.n - b.rec.n)
            .map(x => ({
                questionIndex: rosterIds.indexOf(x.qid),
                result: (Number.isInteger(x.rec.d) && x.rec.d >= 0)
                    ? (verdictById.get(x.qid) ? 'correct' : 'wrong')
                    : 'skip',
            }));
        if (mode === 'arcade' && recordedSeq.length > 0) {
            const { pot, answered } = computeStakePot(recordedSeq);
            const runComplete = recordedSeq.length >= total;
            const legitimateCashOut = cashedOut === true && answered >= CASH_OUT_MIN_ANSWERED;
            rawDiamonds = (runComplete || legitimateCashOut)
                ? Math.min(ARCADE_MAX_RUN_PAYOUT, Math.max(0, Math.floor(pot)))
                : 0;
        } else {
            rawDiamonds = Math.max(0, Math.floor(calculateDiamonds(mode, correct, total, timeRemaining) || 0));
        }

        let diamonds = 0;
        const cap = DAILY_DIAMOND_CAPS[mode];
        if (Number.isFinite(cap)) {
            const [fromScores, fromSessions] = await Promise.all([
                getDailyDiamondsEarned(sb, userId, mode, playDate),
                sessionDiamondsForDay(sb, userId, mode, playDate),
            ]);
            const earnedToday = Math.max(fromScores || 0, fromSessions || 0);
            diamonds = clampToCap(earnedToday, rawDiamonds, cap);
        } else {
            // No configured daily cap for this mode (pvp/tournaments pay out
            // through their own routes). Fail closed and pay nothing here
            // rather than run uncapped.
            diamonds = 0;
        }
        diamonds = Math.max(0, Math.floor(diamonds));

        // --- PAY OUT (atomic close + idempotent credit) ------------------
        const validAnswered = Array.from(byId.keys()).filter(qid => !voidedIds.has(qid)).length;
        const requestId = typeof req.body?.requestId === 'string' && UUID_RE.test(req.body.requestId)
            ? req.body.requestId
            : sessionId;
        const { data: award, error: awardErr } = await sb.rpc('award_trivia_run_v5', {
            p_session_id: sessionId,
            p_score: score,
            p_correct: correct,
            p_total: total,
            p_answered: validAnswered,
            p_diamonds: diamonds,
            p_completion_total: servedTotal,
            p_completion_answered: Math.min(servedTotal, validAnswered + voided),
            p_request_id: requestId,
            p_settlement_snapshot: { deadlinePassed, perQuestion },
        });
        if (awardErr) {
            console.warn('[trivia session-submit] award_trivia_run failed:', awardErr.message || awardErr);
            return res.status(500).json({ success: false, error: 'award_failed' });
        }
        if (award?.success === false) {
            // The function's conditional UPDATE lost the race, so another
            // request already closed and paid this session.
            const code = award.error === 'session_not_found' ? 404
                : award.error === 'session_expired' ? 410
                : 409;
            return res.status(code).json({
                success: false,
                error: award.error || 'award_rejected',
                ...(Number.isInteger(award?.nonPaidMissCount)
                    ? { nonPaidMissCount: award.nonPaidMissCount }
                    : {}),
                ...(Number.isInteger(award?.terminalFailureCount)
                    ? { terminalFailureCount: award.terminalFailureCount }
                    : {}),
                ...(Number.isInteger(award?.missLimit) ? { missLimit: award.missLimit } : {}),
                ...(typeof award?.runMissLimitReached === 'boolean'
                    ? { runMissLimitReached: award.runMissLimitReached }
                    : {}),
            });
        }
        const verifiedAward = validateTriviaAwardResponse(award, {
            sessionId,
            score: replaying ? session.score : score,
            correct: replaying ? session.correct_count : correct,
            ...(replaying
                ? { diamonds: session.diamonds_awarded, requireReplay: true }
                : { maxDiamonds: diamonds }),
        });
        if (!verifiedAward.ok) {
            console.warn('[trivia session-submit] malformed award receipt:', verifiedAward.error);
            return res.status(502).json({ success: false, error: 'invalid_award_receipt' });
        }
        const receipt = verifiedAward.receipt;
        // A competing request may have won the row lock after this request
        // loaded an open session. Its committed snapshot is authoritative;
        // never return the review computed above from a now-stale projection.
        if (receipt.replayed) {
            const storedSession = await reloadStoredLegacySession(sb, userId, sessionId);
            if (!storedSession) {
                return res.status(502).json({ success: false, error: 'settlement_result_unavailable' });
            }
            return await respondWithStoredLegacySettlement(res, sb, userId, storedSession);
        }
        const response = {
            success: true,
            sessionId,
            mode,
            correct: receipt.correct,
            total,
            servedTotal,
            voided,
            score: receipt.score,
            scoreId: receipt.scoreId,
            diamondsAwarded: receipt.diamondsAwarded,
            dailyBonusAwarded: receipt.dailyBonusAwarded,
            newBalance: receipt.newBalance,
            replayed: receipt.replayed,
            deadlinePassed,
            perQuestion,
        };
        const evidence = await readSoloSettlementReceipt(sb, userId, sessionId, response);
        if (!evidence.ok) {
            console.warn('[trivia session-submit] settlement receipt unavailable:', evidence.error);
            return res.status(502).json({ success: false, error: evidence.error });
        }

        if (canonicalJson(award?.api_response_v1) !== canonicalJson(response)) {
            console.warn('[trivia session-submit] atomic settlement snapshot mismatch');
            return res.status(502).json({ success: false, error: 'settlement_snapshot_unavailable' });
        }

        const normalizedProjection = normalizeHighScoreProjection(
            award?.highScoreProjection, mode, response.correct);
        if (!normalizedProjection.ok) {
            console.warn('[trivia session-submit] atomic high-score projection invalid:', normalizedProjection.error);
            return res.status(502).json({ success: false, error: normalizedProjection.error });
        }
        const completeResponse = {
            ...response,
            ...(mode === 'survival'
                ? { survivalLevel: survivalAuthority.survivalLevel }
                : {}),
            receipt: evidence.receipt,
            ...(normalizedProjection.projection
                ? { highScoreProjection: normalizedProjection.projection }
                : {}),
        };
        res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        return res.status(200).json(completeResponse);
    } catch (e) {
        console.warn('[trivia session-submit] unexpected:', e);
        try { reportApiError(e, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

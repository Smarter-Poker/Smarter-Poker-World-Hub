import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * POST /api/trivia/session-start
 * ===========================================================================
 * Open a server-authoritative solo trivia run and serve its questions WITHOUT
 * the answer key.
 *
 * -- WHY THIS EXISTS ------------------------------------------------------
 * Every solo mode today loads trivia_questions with correct_index, grades
 * itself in the browser, computes its own diamond reward and calls
 * rpc('add_diamonds_to_balance') with a client-chosen amount. Diamonds are
 * real currency, so the economy is mintable from devtools. Tournaments
 * already solved this in tournament-round-questions.js; this route is the
 * same pattern for solo play, and /api/trivia/session-submit is its grader.
 *
 * What leaves the server: id, question, options (already permuted), category,
 * difficulty. NEVER correct_index. NEVER explanation - an explanation names
 * the answer, so shipping it is the same leak with extra steps.
 *
 * The display order is a deterministic per-(user, session, question)
 * permutation from tournament-lifecycle (imported, never re-implemented, so
 * the two routes can never drift). It is ALSO persisted on the session row,
 * so grading does not depend on the algorithm staying byte-stable forever.
 *
 * Body: { mode, count?, category?, difficulty?, matchId? }
 * Auth: Bearer token or session cookie (getServerUserWithFallback).
 *
 * -- PVP (mode 'pvp') -----------------------------------------------------
 * PvP sessions are MATCH-BOUND: matchId is required and the roster is shared
 * by both players (drawn server-side by whichever player starts first and
 * persisted on the match row as bare question ids - never with the key).
 * Starting a pvp session also ESCROWS the player's stake server-side with an
 * idempotent reference (pvp_stake_<matchId>_<userId>); the browser-side
 * deduction this replaces called a diamond RPC that lost authenticated
 * EXECUTE on 2026-08-03. Sessions grade; /api/trivia/pvp-settle-match pays.
 * See startPvpSession below.
 *
 * Returns:
 *   200 { success, sessionId, mode, questionCount, questions: [...] }
 *   400 invalid mode / bad input
 *   401 not authenticated
 *   503 pool could not supply any playable question
 * ===========================================================================
 */

import { randomUUID } from 'crypto';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import {
    serviceClient,
    deterministicOptionOrder,
    optionOrderSeed
} from './tournament-lifecycle';
import {
    getSeenHistory,
    fetchRandomQuestionPool,
    filterAndShuffle,
    recordQuestionsSeen,
    DEFAULT_QUALITY_FLOOR
} from '../../../src/lib/triviaQuestionLoader';
import { getCategoriesForMode, ALL_CATEGORIES } from '../../../src/lib/trivia/triviaEngine';
import { getTodayCST } from '../../../src/lib/trivia/getTodayCST';
import {
    PVP_MATCH_JOIN_WINDOW_MS,
    PVP_QUESTION_COUNT,
    extractPvpRosterIds,
    samePvpRoster,
    validatePvpDurableSessionLink,
    validatePvpMatch,
    validatePvpSessionCreationReceipt,
} from '../../../src/lib/trivia/pvpSettlementPolicy.mjs';
import {
    isTriviaPvpReleased,
    rejectUnavailableTriviaPvp,
} from '../../../src/lib/trivia/pvpReleaseControl.mjs';
import {
    areTriviaTournamentsReleased,
    rejectUnavailableTriviaTournament,
} from '../../../src/lib/trivia/tournamentReleaseControl.mjs';
import {
    validateTriviaSessionCreationReceipt,
    validateTriviaSessionDeadline,
    validateTriviaSessionRoster,
} from '../../../src/lib/trivia/awardResponsePolicy.mjs';
import {
    ELIGIBLE_SERVING_SOURCE,
    FREE_FALLBACK_SOURCE,
    FREE_MODES,
    isFreeLegacyFallbackEnabled,
    isShadowSelectorEnabled,
    isSoloEngineV3Enabled,
    toSoloStartResponse,
    v3ErrorStatus,
} from '../../../src/lib/trivia/phase3Engine.mjs';
import {
    sanitizeSolverAnalysis,
    sanitizeStrategyContext,
} from '../../../src/lib/trivia/strategyContextPolicy.mjs';

const STRATEGY_CONTEXT_MODES = new Set(['mtt', 'cash', 'icm', 'gto']);
const IMMEDIATE_REVEAL_MODES = new Set([
    'daily', 'history', 'rules', 'pro', 'arcade', 'mtt', 'cash', 'icm', 'gto',
    'mixed', 'survival', 'endless', 'time-attack',
]);

function validPermutation(value, optionCount) {
    return Array.isArray(value)
        && value.length === optionCount
        && value.every(index => Number.isInteger(index) && index >= 0 && index < optionCount)
        && new Set(value).size === optionCount;
}

function solverMetadataAfterAnswer(rawMetadata) {
    const analysis = sanitizeSolverAnalysis(rawMetadata);
    return analysis ? {
        gtoFrequencies: analysis.frequencies,
        evData: analysis.ev,
        source: analysis.source,
    } : null;
}

function voidAnswerState() {
    return {
        storedDisplayIndex: -1,
        wasCorrect: false,
        outcome: 'voided',
        voided: true,
    };
}

function answerState({ storedDisplayIndex, order, correctIndex, explanation, engineMetadata, outcome }) {
    if (!Number.isInteger(storedDisplayIndex) || storedDisplayIndex < -1
        || !Array.isArray(order) || !Number.isInteger(correctIndex)) return null;
    const originalIndex = storedDisplayIndex >= 0 && storedDisplayIndex < order.length
        ? order[storedDisplayIndex]
        : -1;
    return {
        storedDisplayIndex,
        wasCorrect: originalIndex >= 0 && originalIndex === correctIndex,
        correctDisplayIndex: order.indexOf(correctIndex),
        outcome: typeof outcome === 'string'
            ? outcome
            : (storedDisplayIndex < 0 ? 'skip' : (originalIndex === correctIndex ? 'correct' : 'wrong')),
        explanation: typeof explanation === 'string' ? explanation : null,
        solverMetadata: solverMetadataAfterAnswer(engineMetadata),
    };
}

function withSafeContext(mode, question, metadata) {
    if (!STRATEGY_CONTEXT_MODES.has(mode)) return question;
    const context = sanitizeStrategyContext(metadata);
    return context ? { ...question, context } : question;
}

async function loadBoundStrategyContexts(sb, mode, sessionId, userId, questionIds) {
    if (!STRATEGY_CONTEXT_MODES.has(mode)) return new Map();
    const { data, error } = await sb.rpc('trivia_session_context_projection_v1', {
        p_session_id: sessionId,
        p_user_id: userId,
    });
    if (error || data?.success !== true || !Array.isArray(data.questions)) {
        console.warn('[trivia session-start] context projection failed:', error?.message || data?.error || 'invalid_response');
        throw new Error('session_resume_projection_failed');
    }
    const expected = new Set(questionIds);
    const rows = data.questions;
    if (rows.length !== expected.size
        || rows.some(row => !row || typeof row.questionId !== 'string' || !expected.has(row.questionId))
        || new Set(rows.map(row => row.questionId)).size !== expected.size) {
        throw new Error('session_resume_projection_failed');
    }
    return new Map(rows.map(row => [row.questionId, row.engineMetadata]));
}

async function loadBoundAnswerReviews(sb, sessionId, userId, answerRows) {
    const reviews = await Promise.all(answerRows.map(async row => {
        const { data, error } = await sb.rpc('trivia_session_question_review_v1', {
            p_session_id: sessionId,
            p_user_id: userId,
            p_question_id: row.question_id,
        });
        const authoritativeVoid = data?.voided === true && data?.outcome === 'voided';
        if (error || data?.success !== true
            || data.questionId !== row.question_id
            || (!authoritativeVoid && (
                data.revisionId !== row.revision_id
                || !Number.isInteger(data.correctIndex)
            ))) {
            console.warn('[trivia session-start] answer review failed:', error?.message || data?.error || 'invalid_response');
            throw new Error('session_resume_projection_failed');
        }
        return [row.question_id, data];
    }));
    return new Map(reviews);
}

async function enrichV3StartResponse(sb, mode, sessionId, userId, body) {
    const questions = Array.isArray(body?.questions) ? body.questions : [];
    const ids = questions.map(question => question?.id).filter(id => typeof id === 'string');
    if (ids.length === 0) return body;

    const [sessionResult, answerResult] = await Promise.all([
        sb.from('trivia_sessions').select('permutations').eq('id', sessionId).maybeSingle(),
        sb.from('trivia_session_answers')
            .select('question_id, revision_id, display_index, is_correct, outcome, server_voided_at')
            .eq('session_id', sessionId),
    ]);
    if (sessionResult.error || answerResult.error) {
        const error = sessionResult.error || answerResult.error;
        console.warn('[trivia session-start] v3 resume projection failed:', error?.message || error);
        throw new Error('session_resume_projection_failed');
    }

    const answerRows = Array.isArray(answerResult.data) ? answerResult.data : [];
    const answerQuestionIds = answerRows.map(row => row?.question_id);
    const revisionIds = answerRows.map(row => row?.revision_id);
    if (answerRows.length !== ids.length
        || new Set(answerQuestionIds).size !== ids.length
        || ids.some(id => !answerQuestionIds.includes(id))
        || revisionIds.some(id => typeof id !== 'string' || !PVP_UUID_RE.test(id))
        || new Set(revisionIds).size !== ids.length) {
        throw new Error('session_resume_revision_missing');
    }
    const answerById = new Map(answerRows.map(row => [row.question_id, row]));
    const permutations = sessionResult.data?.permutations && typeof sessionResult.data.permutations === 'object'
        ? sessionResult.data.permutations
        : {};
    const reviewRows = IMMEDIATE_REVEAL_MODES.has(mode)
        ? answerRows.filter(row => row?.outcome && !row.server_voided_at)
        : [];
    const [contextById, reviewById] = await Promise.all([
        loadBoundStrategyContexts(sb, mode, sessionId, userId, answerQuestionIds),
        loadBoundAnswerReviews(sb, sessionId, userId, reviewRows),
    ]);

    return {
        ...body,
        questions: questions.map(question => {
            const storedAnswer = answerById.get(question.id);
            let projected = withSafeContext(mode, question, contextById.get(question.id));
            if (!storedAnswer?.outcome || !IMMEDIATE_REVEAL_MODES.has(mode)) return projected;
            if (storedAnswer.server_voided_at) {
                return {
                    ...projected,
                    answerState: voidAnswerState(),
                };
            }
            const review = reviewById.get(question.id);
            if (review?.voided === true && review?.outcome === 'voided') {
                return { ...projected, answerState: voidAnswerState() };
            }
            const order = permutations[question.id];
            const optionCount = Array.isArray(question.options) ? question.options.length : 0;
            const state = review && validPermutation(order, optionCount)
                ? answerState({
                    storedDisplayIndex: storedAnswer.display_index == null ? -1 : storedAnswer.display_index,
                    order,
                    correctIndex: review.correctIndex,
                    explanation: review.explanation,
                    engineMetadata: review.engineMetadata,
                    outcome: storedAnswer.outcome,
                })
                : null;
            if (!state) throw new Error('session_resume_projection_failed');
            projected = { ...projected, answerState: state };
            return projected;
        }),
    };
}

/**
 * Phase 3 engine v3 (TRIVIA_P3_SOLO_ENGINE_V3=true): the database builds a private,
 * deterministic roster snapshot from the eligible pool, charges entry through today's
 * create_trivia_session_v2 path and returns an answer-free DTO. Also serves resumes of
 * any v3 session regardless of the flag, so a run started under v3 always finishes there.
 */
async function startOrResumeSoloV3(res, sb, userId, mode, sessionId, parentSessionId, resumeOnly) {
    const { data, error } = resumeOnly
        ? await sb.rpc('trivia_session_view_v3', { p_session_id: sessionId, p_user_id: userId })
        : await sb.rpc('trivia_start_solo_session_v3', {
            p_session_id: sessionId,
            p_user_id: userId,
            p_mode: mode,
            p_parent_session_id: mode === 'survival' ? (parentSessionId || null) : null,
        });
    if (error) {
        console.warn('[trivia session-start] v3 start failed:', error.message || error);
        return res.status(500).json({ success: false, error: 'session_create_failed' });
    }
    if (!data || data.success !== true) {
        const code = data?.error === 'insufficient_eligible_pool' ? 'no_questions_available' : (data?.error || 'session_create_failed');
        return res.status(v3ErrorStatus(data?.error)).json({ success: false, error: code });
    }
    if (data.mode !== mode) return res.status(409).json({ success: false, error: 'session_mode_conflict' });
    let body = toSoloStartResponse(data);
    try {
        body = await enrichV3StartResponse(sb, mode, sessionId, userId, body);
    } catch (_error) {
        return res.status(500).json({ success: false, error: 'session_resume_failed' });
    }
    if (resumeOnly) body.resumed = true;
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    return res.status(200).json(body);
}

/**
 * Allow-list of playable modes AND the per-mode ceiling on questions in one
 * run. Mirrors MAX_QUESTIONS in pages/api/trivia/submit.js exactly, so a
 * session can never be opened for a size that submit.js would reject as
 * implausible. An unknown mode is a 400 rather than a default, because a
 * default is how a caller ends up with the most generous cap in the table.
 */
const MAX_QUESTIONS = {
    daily: 30, history: 30, rules: 30, pro: 30, arcade: 30,
    mtt: 30, cash: 30, icm: 30, gto: 30, mixed: 30, pvp: 20, tournaments: 60,
    survival: 400, endless: 1000, 'time-attack': 400,
};

// The server, not the request body, defines the denominator for every run.
// Letting callers request `{ count: 1, difficulty: 'easy' }` turned one known
// answer into a perfect paid run. These values mirror the live game pages,
// including the long rosters used by timed/endless modes.
const SESSION_QUESTION_COUNTS = {
    daily: 10, history: 20, rules: 20, pro: 20, arcade: 20,
    mtt: 20, cash: 20, icm: 20, gto: 20, mixed: 21,
    survival: 20, endless: 100, 'time-attack': 60,
    // PvP is handled by startPvpSession and shares a fixed 20-question roster.
    pvp: PVP_QUESTION_COUNT, tournaments: 10,
};

const DEFAULT_COUNT = 20;
const VALID_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const PVP_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function expectedSoloQuestionCount(mode) {
    const modeCap = MAX_QUESTIONS[mode];
    return Math.max(1, Math.min(SESSION_QUESTION_COUNTS[mode] || DEFAULT_COUNT, modeCap));
}

/**
 * Canonical answer-free question rows for a fixed roster, in roster order.
 * PvP serves the MATCH's stored roster (both players must face the same
 * questions), so the generic pool draw does not apply here.
 */
async function fetchPvpRosterRows(sb, rosterIds) {
    const ids = (Array.isArray(rosterIds) ? rosterIds : [])
        .filter(id => typeof id === 'string' && PVP_UUID_RE.test(id));
    if (ids.length === 0) return [];
    const { data: rows, error } = await sb
        .from('trivia_questions')
        .select('id, question, options, category, difficulty')
        .in('id', ids);
    if (error) {
        console.warn('[trivia session-start] pvp roster fetch failed:', error.message || error);
        return [];
    }
    const byId = new Map((rows || []).map(r => [r.id, r]));
    return ids
        .map(id => byId.get(id))
        .filter(q => q && typeof q.id === 'string' && Array.isArray(q.options) && q.options.length >= 2);
}

async function serveExistingSoloSession(res, sb, userId, session, {
    resumed = true,
    newBalance = null,
} = {}) {
    if (!session || session.user_id !== userId || session.status !== 'open') {
        return res.status(409).json({ success: false, error: 'session_not_resumable' });
    }
    const expectedCount = expectedSoloQuestionCount(session.mode);
    const roster = validateTriviaSessionRoster(session.question_ids, expectedCount);
    if (!roster.ok) {
        return res.status(409).json({ success: false, error: roster.error });
    }
    const deadline = validateTriviaSessionDeadline(session.expires_at, {
        mode: session.mode,
        createdAt: session.created_at,
    });
    if (!deadline.ok) {
        return res.status(deadline.error === 'session_expired' ? 410 : 502)
            .json({ success: false, error: deadline.error });
    }

    const revisionMap = session.question_revision_ids && typeof session.question_revision_ids === 'object'
        && !Array.isArray(session.question_revision_ids)
        ? session.question_revision_ids
        : {};
    const revisionIds = roster.questionIds.map(id => revisionMap[id]);
    if (revisionIds.some(id => typeof id !== 'string' || !PVP_UUID_RE.test(id))) {
        return res.status(409).json({ success: false, error: 'revision_provenance_unavailable' });
    }
    const { data: rows, error: projectionError } = await sb
        .from('trivia_question_revisions')
        .select('id, question_id, question, options, category, difficulty')
        .in('id', revisionIds);
    if (projectionError) {
        console.warn('[trivia session-start] solo revision projection failed:', projectionError.message || projectionError);
        return res.status(500).json({ success: false, error: 'session_resume_failed' });
    }
    if (!Array.isArray(rows) || rows.length !== expectedCount) {
        return res.status(409).json({ success: false, error: 'revision_provenance_unavailable' });
    }
    const byQuestionId = new Map(rows.map(row => [row.question_id, row]));
    const stored = session.permutations && typeof session.permutations === 'object'
        ? session.permutations
        : {};
    const storedAnswers = session.answers && typeof session.answers === 'object'
        ? session.answers
        : {};
    let contextById;
    let reviewById;
    try {
        [contextById, reviewById] = await Promise.all([
            loadBoundStrategyContexts(sb, session.mode, session.id, userId, roster.questionIds),
            loadBoundAnswerReviews(sb, session.id, userId, roster.questionIds
                .filter(id => storedAnswers[id]
                    && storedAnswers[id].v !== true
                    && Number.isInteger(storedAnswers[id].d))
                .map(id => ({ question_id: id, revision_id: revisionMap[id] }))),
        ]);
    } catch (_error) {
        return res.status(500).json({ success: false, error: 'session_resume_failed' });
    }
    const questions = roster.questionIds.map(id => {
        const q = byQuestionId.get(id);
        if (!q || q.id !== revisionMap[id]) return null;
        const order = stored[id];
        if (!validPermutation(order, q.options.length)) return null;
        let projected = withSafeContext(session.mode, {
            id: q.question_id,
            question: q.question,
            options: order.map(index => q.options[index]),
            category: q.category ?? null,
            difficulty: q.difficulty ?? null,
            state: 'unanswered',
        }, contextById.get(id));
        const storedAnswer = storedAnswers[id] || null;
        if (storedAnswer?.v === true) {
            return { ...projected, state: 'answered', answerState: voidAnswerState() };
        }
        if (storedAnswer && Number.isInteger(storedAnswer.d)
            && validPermutation(order, q.options.length)) {
            const review = reviewById.get(id);
            if (review?.voided === true && review?.outcome === 'voided') {
                return { ...projected, state: 'answered', answerState: voidAnswerState() };
            }
            const state = answerState({
                storedDisplayIndex: storedAnswer.d,
                order,
                correctIndex: review?.correctIndex,
                explanation: review?.explanation,
                engineMetadata: review?.engineMetadata,
            });
            if (!state) return null;
            projected = { ...projected, state: 'answered', answerState: state };
        }
        return projected;
    }).filter(Boolean);
    if (questions.length !== expectedCount) {
        return res.status(409).json({ success: false, error: 'revision_provenance_unavailable' });
    }
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    return res.status(200).json({
        success: true,
        resumed,
        sessionId: session.id,
        mode: session.mode,
        questionCount: questions.length,
        questions,
        entryCost: session.entry_cost || 0,
        entryState: session.entry_state || 'legacy',
        expiresAt: session.expires_at || null,
        newBalance,
    });
}

/**
 * Serve an EXISTING pvp session (resume). The first session per player per
 * match is binding - answers already recorded through session-answer stay
 * binding - so a reconnecting client gets the same roster in the same stored
 * display order rather than a fresh (re-rollable) draw.
 */
async function servePvpSession(res, sb, userId, match, sessionId, resumed) {
    const { data: session, error } = await sb
        .from('trivia_sessions')
        .select('id, user_id, mode, status, question_ids, permutations, entry_cost, entry_state, created_at, submitted_at, expires_at')
        .eq('id', sessionId)
        .maybeSingle();
    if (error) {
        console.warn('[trivia session-start] pvp session load failed:', error.message || error);
        return res.status(500).json({ success: false, error: 'session_load_failed' });
    }
    if (!session || session.user_id !== userId || session.mode !== 'pvp') {
        return res.status(409).json({ success: false, error: 'session_link_invalid' });
    }
    if (session.status !== 'open') {
        // The bound session was already graded (or expired) - this match has
        // been played. No re-rolls.
        return res.status(409).json({ success: false, error: 'already_played' });
    }
    const deadline = validateTriviaSessionDeadline(session.expires_at, {
        mode: 'pvp',
        createdAt: session.created_at,
    });
    const matchDeadline = Date.parse(match.created_at) + PVP_MATCH_JOIN_WINDOW_MS;
    if (!deadline.ok
        || !Number.isFinite(matchDeadline)
        || Math.abs(deadline.expiresMs - matchDeadline) > 1_000) {
        const error = deadline.error === 'session_expired'
            ? 'session_expired'
            : 'session_deadline_invalid';
        return res.status(error === 'session_expired' ? 410 : 502)
            .json({ success: false, error });
    }
    if (!Array.isArray(match.questions)
        || match.questions.length !== PVP_QUESTION_COUNT
        || !Array.isArray(session.question_ids)
        || session.question_ids.length !== PVP_QUESTION_COUNT
        || !samePvpRoster(match.questions, session.question_ids)
        || session.entry_cost !== match.stake_amount
        || session.entry_state !== 'charged') {
        return res.status(409).json({ success: false, error: 'session_link_invalid' });
    }

    const rows = await fetchPvpRosterRows(sb, session.question_ids);
    if (rows.length !== PVP_QUESTION_COUNT) {
        return res.status(503).json({ success: false, error: 'no_questions_available' });
    }
    const stored = (session.permutations && typeof session.permutations === 'object')
        ? session.permutations
        : {};
    const questions = rows.map(q => {
        // Prefer the permutation persisted at serve time; recompute from the
        // shared helper only if it is missing (same rule session-submit uses).
        let order = Array.isArray(stored[q.id]) ? stored[q.id] : null;
        if (!order) {
            order = deterministicOptionOrder(q.options.length, optionOrderSeed(userId, session.id, q.id));
        }
        return {
            id: q.id,
            question: q.question,
            options: order.map(i => q.options[i]),
            category: q.category ?? null,
            difficulty: q.difficulty ?? null,
        };
    });

    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    return res.status(200).json({
        success: true,
        sessionId: session.id,
        matchId: match.id,
        mode: 'pvp',
        resumed: resumed === true,
        stake: Math.max(0, Math.floor(Number(match.stake_amount) || 0)),
        questionCount: questions.length,
        questions,
    });
}

/**
 * Phase 5 v2 matches bind both seats, their escrow and their engine v3 server
 * sessions atomically when the match is created (trivia_pvp_*_v2), so this
 * route only RESUMES the caller's own seat session. It never creates a
 * session, charges a stake or re-rolls a roster for a v2 match.
 */
async function serveV2PvpSeat(res, sb, userId, match) {
    const side = match.player1_id === userId ? 1 : 2;
    const { data: link, error: linkErr } = await sb
        .from('trivia_pvp_session_links')
        .select('session_id')
        .eq('match_id', match.id)
        .eq('side', side)
        .maybeSingle();
    if (linkErr) {
        console.warn('[trivia session-start] v2 pvp seat load failed:', linkErr.message || linkErr);
        return res.status(503).json({ success: false, error: 'pvp_storage_unavailable' });
    }
    if (!link?.session_id) {
        return res.status(409).json({ success: false, error: 'session_link_invalid' });
    }
    const { data, error } = await sb.rpc('trivia_session_view_v3', {
        p_session_id: link.session_id,
        p_user_id: userId,
    });
    if (error) {
        console.warn('[trivia session-start] v2 pvp seat view failed:', error.message || error);
        return res.status(500).json({ success: false, error: 'session_load_failed' });
    }
    if (!data || data.success !== true) {
        return res.status(v3ErrorStatus(data?.error)).json({ success: false, error: data?.error || 'session_load_failed' });
    }
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    return res.status(200).json({
        ...toSoloStartResponse(data),
        resumed: true,
        matchId: match.id,
        stake: Math.max(0, Math.floor(Number(match.stake_amount) || 0)),
    });
}

async function reloadPvpDurableBinding(sb, matchId, side) {
    const [matchResult, linkResult] = await Promise.all([
        sb.from('trivia_pvp_matches')
            .select('id, player1_id, player2_id, stake_amount, questions, status, created_at')
            .eq('id', matchId)
            .maybeSingle(),
        sb.from('trivia_pvp_session_links')
            .select('match_id, side, user_id, session_id')
            .eq('match_id', matchId)
            .eq('side', side)
            .maybeSingle(),
    ]);
    if (matchResult.error || linkResult.error) {
        console.warn('[trivia session-start] durable pvp binding reload failed:',
            matchResult.error?.message || linkResult.error?.message || 'unknown');
        return { ok: false, error: 'pvp_storage_unavailable' };
    }
    if (!matchResult.data || !linkResult.data) {
        return { ok: false, error: 'durable_session_link_missing' };
    }
    return { ok: true, match: matchResult.data, link: linkResult.data };
}

/**
 * PvP session start: verify participation, share (or seed) the roster,
 * escrow the stake, create + link the session. See the header for the flow;
 * the load-bearing invariants are:
 *
 *   1. The roster is drawn SERVER-SIDE (first player to start seeds it with
 *      an atomic questions-IS-NULL conditional write; the loser of that race
 *      adopts the winner's roster). The client cannot hand-pick questions it
 *      already knows.
 *   2. The stake charge precedes session creation and uses the idempotent
 *      reference pvp_stake_<matchId>_<userId>: retries dedup instead of
 *      double-charging, and a charge whose session insert then failed is
 *      finished by a retry (dedup -> proceed) or refunded by the pvp-settle
 *      sweep, which probes that same reference. No refund path lives here on
 *      purpose - refunding while the charge reference stays dedup-armed
 *      would let a retry play with a refunded (free) stake.
 *   3. The session link write is conditional on the column being NULL, so
 *      the first session per player is binding and a double-start cannot
 *      swap in a fresh roster after seeing verdicts.
 */
async function startPvpSession(req, res, sb, userId) {
    const { matchId } = req.body || {};
    if (typeof matchId !== 'string' || !PVP_UUID_RE.test(matchId)) {
        return res.status(400).json({ success: false, error: 'pvp_requires_match_id' });
    }

    const { data: match, error: matchErr } = await sb
        .from('trivia_pvp_matches')
        .select('id, player1_id, player2_id, stake_amount, questions, status, created_at, engine_version')
        .eq('id', matchId)
        .maybeSingle();
    if (matchErr) {
        console.warn('[trivia session-start] pvp match load failed:', matchErr.message || matchErr);
        return res.status(500).json({ success: false, error: 'match_load_failed' });
    }
    if (!match) {
        return res.status(404).json({ success: false, error: 'match_not_found' });
    }
    if (match.player1_id !== userId && match.player2_id !== userId) {
        return res.status(403).json({ success: false, error: 'not_your_match' });
    }
    if (match.engine_version) {
        return serveV2PvpSeat(res, sb, userId, match);
    }
    const matchValidation = validatePvpMatch(match, { requireActive: true });
    if (!matchValidation.ok) {
        return res.status(409).json({ success: false, error: matchValidation.error });
    }
    const createdMs = match.created_at ? new Date(match.created_at).getTime() : NaN;
    if (!Number.isFinite(createdMs) || Date.now() - createdMs > PVP_MATCH_JOIN_WINDOW_MS) {
        // Too old to join - the pvp-settle sweep owns this row now.
        return res.status(410).json({ success: false, error: 'match_expired' });
    }

    const isP1 = match.player1_id === userId;
    const side = isP1 ? 1 : 2;

    // --- RESUME ------------------------------------------------------------
    const { data: existingLink, error: linkErr } = await sb
        .from('trivia_pvp_session_links')
        .select('match_id, side, user_id, session_id')
        .eq('match_id', match.id)
        .eq('side', side)
        .maybeSingle();
    if (linkErr) {
        console.warn('[trivia session-start] pvp session-link load failed:', linkErr.message || linkErr);
        return res.status(503).json({ success: false, error: 'pvp_storage_unavailable' });
    }
    if (existingLink) {
        const binding = validatePvpDurableSessionLink({
            match,
            link: existingLink,
            expectedMatchId: match.id,
            expectedUserId: userId,
            expectedSide: side,
            expectedSessionId: existingLink.session_id,
            expectedRoster: match.questions,
            expectedStake: match.stake_amount,
        });
        if (!binding.ok) {
            return res.status(409).json({ success: false, error: 'session_link_invalid' });
        }
        return servePvpSession(res, sb, userId, binding.match, binding.sessionId, true);
    }

    // --- ROSTER (shared; first starter seeds it atomically) ----------------
    let rosterIds = extractPvpRosterIds(match.questions) || [];
    if (rosterIds.length === 0) {
        const wanted = MAX_QUESTIONS.pvp;
        const { ids: excludeIds } = await getSeenHistory(sb, userId, {});
        const pool = await fetchRandomQuestionPool(sb, {
            pageSize: Math.max(200, wanted * 5),
            minQuality: DEFAULT_QUALITY_FLOOR,
            excludeIds,
            want: wanted,
            attempts: 3,
            withoutAnswers: true,
            source: ELIGIBLE_SERVING_SOURCE,
            mode: 'pvp',
        });
        const drawn = filterAndShuffle(pool, excludeIds, wanted, {
            minQualityScore: DEFAULT_QUALITY_FLOOR,
        })
            .filter(q => q && typeof q.id === 'string' && Array.isArray(q.options) && q.options.length >= 2)
            .map(q => q.id)
            // BUGFIX (2026-08-12): filterAndShuffle's third argument is
            // minFallback - a FLOOR ("top up from seen questions if we came up
            // short"), never a cap. It returns the whole filtered pool, which
            // here is pageSize = max(200, wanted * 5) = 200 rows. Without this
            // slice the match roster was seeded with 200 questions and every
            // 1v1 battle rendered "Question 1 of 200".
            //
            // The two sibling call sites already do exactly this: the solo path
            // below ends `.slice(0, wanted)` and buildTriviaRoster in
            // src/lib/triviaQuestionLoader.js ends `ordered.slice(0, count)`.
            // The PvP seed was the only one missing it.
            .slice(0, wanted);
        if (drawn.length !== wanted) {
            return res.status(503).json({ success: false, error: 'no_questions_available' });
        }

        const { data: seeded, error: seedErr } = await sb
            .from('trivia_pvp_matches')
            .update({ questions: drawn })
            .eq('id', match.id)
            .is('questions', null)
            .select('id');
        if (seedErr) {
            console.warn('[trivia session-start] pvp roster seed failed:', seedErr.message || seedErr);
            return res.status(500).json({ success: false, error: 'roster_seed_failed' });
        }
        if (seeded && seeded.length > 0) {
            rosterIds = drawn;
        } else {
            // The opponent seeded first - adopt their roster so both players
            // face identical questions.
            const { data: fresh } = await sb
                .from('trivia_pvp_matches')
                .select('questions')
                .eq('id', match.id)
                .maybeSingle();
            rosterIds = extractPvpRosterIds(fresh?.questions) || [];
            if (rosterIds.length !== wanted) {
                return res.status(503).json({ success: false, error: 'no_questions_available' });
            }
        }
    }
    if (rosterIds.length !== PVP_QUESTION_COUNT) {
        return res.status(409).json({ success: false, error: 'invalid_match_roster' });
    }

    // Stake is moved only after a complete roster has been loaded. The atomic
    // RPC below debits, inserts the session and binds the match in one DB tx.
    const stake = Math.max(0, Math.floor(Number(match.stake_amount) || 0));

    // --- SERVE + PERSIST ----------------------------------------------------
    const picked = await fetchPvpRosterRows(sb, rosterIds);
    if (picked.length !== rosterIds.length) {
        // Charged but unservable roster: deliberately NO refund here (see the
        // function comment) - a retry finishes the start, and an abandoned
        // charge is refunded by the pvp-settle sweep.
        return res.status(503).json({ success: false, error: 'no_questions_available' });
    }

    const sessionId = randomUUID();
    const permutations = {};
    picked.forEach(q => {
        const order = deterministicOptionOrder(
            q.options.length,
            optionOrderSeed(userId, sessionId, q.id)
        );
        permutations[q.id] = order;
    });

    const { data: created, error: createErr } = await sb.rpc('create_trivia_pvp_session_v2', {
        p_session_id: sessionId,
        p_match_id: match.id,
        p_user_id: userId,
        p_question_ids: picked.map(q => q.id),
        p_permutations: permutations,
    });
    if (createErr || created?.success === false) {
        const code = created?.error || 'session_create_failed';
        console.warn('[trivia session-start] atomic pvp create failed:', createErr?.message || code);
        const status = code === 'insufficient_diamonds' ? 402
            : code === 'match_expired' ? 410
            : code === 'match_not_active' ? 409
            : 500;
        return res.status(status).json({ success: false, error: code });
    }
    const creationReceipt = validatePvpSessionCreationReceipt(created, sessionId);
    if (!creationReceipt.ok) {
        console.warn('[trivia session-start] malformed pvp creation receipt:', creationReceipt.error);
        return res.status(502).json({ success: false, error: 'invalid_session_create_receipt' });
    }
    // The RPC receipt is not itself a durable binding. Reload both sides of
    // that binding after the transaction and require the current match,
    // participant, roster, side and linked session id to agree exactly. This
    // is essential on duplicate/replay, where the linked id legitimately
    // differs from the freshly generated request id.
    const durable = await reloadPvpDurableBinding(sb, match.id, side);
    if (!durable.ok) {
        return res.status(502).json({ success: false, error: durable.error });
    }
    const durableValidation = validatePvpDurableSessionLink({
        match: durable.match,
        link: durable.link,
        expectedMatchId: match.id,
        expectedUserId: userId,
        expectedSide: side,
        expectedSessionId: creationReceipt.sessionId,
        expectedRoster: rosterIds,
        expectedStake: stake,
    });
    if (!durableValidation.ok) {
        console.warn('[trivia session-start] invalid durable pvp binding:', durableValidation.error);
        return res.status(502).json({ success: false, error: 'invalid_durable_session_binding' });
    }

    if (!creationReceipt.duplicate) {
        // Feed the 60-day no-repeat window. Fire-and-forget.
        recordQuestionsSeen(sb, userId, picked.map(q => q.id), 'pvp')
            .catch(e => console.warn('[trivia session-start] pvp history record failed:', e?.message || e));
    }

    // Loading the committed session also validates its exact deadline before
    // any question is served, covering both fresh creation and replay.
    return servePvpSession(
        res,
        sb,
        userId,
        durableValidation.match,
        durableValidation.sessionId,
        creationReceipt.duplicate,
    );
}

/**
 * Narrow a client-supplied category filter to the categories this mode is
 * allowed to draw from. Without the intersection a player could point any
 * mode at the single easiest category and farm its diamond reward.
 */
function resolveCategories(mode, raw) {
    const allowed = getCategoriesForMode(mode);
    if (raw == null) return allowed;
    const requested = (Array.isArray(raw) ? raw : [raw]).filter(c => typeof c === 'string');
    const allowedSet = new Set(allowed.length > 0 ? allowed : ALL_CATEGORIES);
    const picked = requested.filter(c => allowedSet.has(c));
    return picked.length > 0 ? picked : allowed;
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
        const { mode, category, difficulty, startNonce, parentSessionId } = req.body || {};
        if (typeof mode !== 'string' || !Object.prototype.hasOwnProperty.call(MAX_QUESTIONS, mode)) {
            return res.status(400).json({
                success: false,
                error: 'invalid_mode',
                allowed: Object.keys(MAX_QUESTIONS),
            });
        }

        // --- PVP: match-bound flow (shared roster + server stake escrow) --
        if (mode === 'pvp') {
            if (!isTriviaPvpReleased(process.env)) {
                return rejectUnavailableTriviaPvp(res);
            }
            return await startPvpSession(req, res, sb, userId);
        }
        if (mode === 'tournaments' && !areTriviaTournamentsReleased(process.env)) {
            return rejectUnavailableTriviaTournament(res);
        }

        if (typeof startNonce !== 'string' || !PVP_UUID_RE.test(startNonce)) {
            return res.status(400).json({ success: false, error: 'invalid_start_nonce' });
        }
        if (parentSessionId != null && (typeof parentSessionId !== 'string' || !PVP_UUID_RE.test(parentSessionId))) {
            return res.status(400).json({ success: false, error: 'invalid_parent_session_id' });
        }

        // A lost HTTP response must not charge or deal twice. The browser
        // retries with the same nonce, which is also the session UUID.
        const { data: existing, error: existingErr } = await sb
            .from('trivia_sessions')
            .select('id, user_id, mode, status, question_ids, question_revision_ids, permutations, entry_cost, entry_state, created_at, expires_at, answers, engine_version')
            .eq('id', startNonce)
            .maybeSingle();
        if (existingErr) {
            return res.status(500).json({ success: false, error: 'session_resume_failed' });
        }
        if (existing) {
            if (existing.mode !== mode) return res.status(409).json({ success: false, error: 'session_mode_conflict' });
            if (existing.engine_version) {
                if (existing.user_id !== userId || existing.status !== 'open') {
                    return res.status(409).json({ success: false, error: 'session_not_resumable' });
                }
                return startOrResumeSoloV3(res, sb, userId, mode, startNonce, parentSessionId, true);
            }
            return serveExistingSoloSession(res, sb, userId, existing);
        }
        if (isSoloEngineV3Enabled(process.env)) {
            return startOrResumeSoloV3(res, sb, userId, mode, startNonce, parentSessionId, false);
        }

        const wanted = expectedSoloQuestionCount(mode);

        const categories = resolveCategories(mode, category);
        // Survival legitimately ramps difficulty by level. Other modes never
        // expose a per-run difficulty selector, so ignore a forged filter.
        const diff = mode === 'survival' && typeof difficulty === 'string' && VALID_DIFFICULTIES.has(difficulty)
            ? difficulty
            : undefined;

        // --- DAILY: THE SHARED ROSTER, NOT A PRIVATE DRAW ----------------
        // Daily's product promise is that every player answers the SAME
        // questions (one roster per CST day, tagged daily_date/order_index
        // by the generate-trivia cron) and competes on one comparable
        // leaderboard. The generic pool draw below deals each player a
        // private random set, which silently broke that promise when daily
        // adopted server grading. Serve the tagged roster when it exists;
        // top up from the pool only when a day's roster is short (degraded,
        // but playable). Personal seen-history is deliberately NOT applied
        // to the shared roster - the roster IS the day's content.
        let picked = [];
        if (mode === 'daily') {
            const { data: rosterRows, error: rosterErr } = await sb
                .from(ELIGIBLE_SERVING_SOURCE)
                .select('id, question, options, category, difficulty')
                .eq('daily_date', getTodayCST())
                .gte('quality_score', DEFAULT_QUALITY_FLOOR)
                .order('order_index', { ascending: true })
                .order('id', { ascending: true })
                .limit(wanted);
            if (rosterErr) {
                console.warn('[trivia session-start] daily roster query failed:', rosterErr.message || rosterErr);
            }
            picked = (rosterRows || []).filter(q => q
                && typeof q.id === 'string'
                && Array.isArray(q.options)
                && q.options.length >= 2);
        }

        // --- LOAD THE POOL WITHOUT ANSWERS -------------------------------
        // loadQuestionsForUser() has no withoutAnswers option and its RPC fast
        // path returns whatever get_unseen_questions selects (which includes
        // the key), so this route drives the loader's lower-level pieces
        // instead: the same 60-day cross-mode exclusion, the same quality
        // floor, the same degradation ladder - but the no-answer column set.
        if (picked.length < wanted) {
            const { ids: excludeIds } = await getSeenHistory(sb, userId, {});
            const pool = await fetchRandomQuestionPool(sb, {
                category: categories,
                difficulty: diff,
                pageSize: Math.max(200, wanted * 5),
                minQuality: DEFAULT_QUALITY_FLOOR,
                excludeIds,
                want: wanted,
                attempts: 3,
                withoutAnswers: true,
                source: ELIGIBLE_SERVING_SOURCE,
                mode,
            });
            // Paid modes never fall back: an insufficient verified pool fails closed
            // below (503). Only free modes may top up from the relaxed pool, and only
            // behind TRIVIA_FREE_LEGACY_FALLBACK_ENABLED.
            if (FREE_MODES.has(mode) && isFreeLegacyFallbackEnabled(process.env)) {
                const eligibleIds = new Set(pool.map(q => q && q.id));
                const relaxed = await fetchRandomQuestionPool(sb, {
                    category: categories,
                    difficulty: diff,
                    pageSize: Math.max(200, wanted * 5),
                    minQuality: DEFAULT_QUALITY_FLOOR,
                    excludeIds,
                    want: wanted,
                    attempts: 2,
                    withoutAnswers: true,
                    source: FREE_FALLBACK_SOURCE,
                    mode,
                });
                for (const q of relaxed) if (q && !eligibleIds.has(q.id)) pool.push(q);
            }

            const ordered = filterAndShuffle(pool, excludeIds, wanted, {
                minQualityScore: DEFAULT_QUALITY_FLOOR,
            });
            const already = new Set(picked.map(q => q.id));
            const fill = ordered.filter(q => q
                && typeof q.id === 'string'
                && !already.has(q.id)
                && Array.isArray(q.options)
                && q.options.length >= 2);
            picked = [...picked, ...fill].slice(0, wanted);
        }

        const pickedRoster = validateTriviaSessionRoster(picked.map(q => q.id), wanted);
        if (!pickedRoster.ok) {
            return res.status(503).json({ success: false, error: 'no_questions_available' });
        }

        // --- PERMUTE + PERSIST THE SESSION -------------------------------
        // The id is minted here (not by the DB default) because it is part of
        // the permutation seed, and the seed has to be known before the row
        // exists.
        const sessionId = startNonce;
        const permutations = {};
        picked.forEach(q => {
            const order = deterministicOptionOrder(
                q.options.length,
                optionOrderSeed(userId, sessionId, q.id)
            );
            permutations[q.id] = order;
        });

        const { data: created, error: insertErr } = await sb.rpc('create_trivia_session_v2', {
            p_session_id: sessionId,
            p_user_id: userId,
            p_mode: mode,
            p_question_ids: picked.map(q => q.id),
            p_permutations: permutations,
            p_parent_session_id: mode === 'survival' ? (parentSessionId || null) : null,
        });
        if (insertErr || created?.success === false) {
            console.warn('[trivia session-start] atomic session create failed:', insertErr?.message || created?.error || insertErr);
            const error = created?.error || 'session_create_failed';
            const status = error === 'insufficient_diamonds' ? 402
                : error.startsWith('invalid_survival') || error === 'survival_continuation_used' ? 409
                : 500;
            return res.status(status).json({ success: false, error });
        }
        const sessionReceipt = validateTriviaSessionCreationReceipt(created, { mode });
        if (!sessionReceipt.ok) {
            console.warn('[trivia session-start] malformed session creation receipt:', sessionReceipt.error);
            const status = sessionReceipt.error === 'session_expired' ? 410 : 502;
            return res.status(status).json({ success: false, error: sessionReceipt.error });
        }
        if (created.duplicate) {
            const { data: racedSession, error: racedSessionError } = await sb
                .from('trivia_sessions')
                .select('id, user_id, mode, status, question_ids, question_revision_ids, permutations, entry_cost, entry_state, created_at, expires_at, answers')
                .eq('id', sessionId)
                .maybeSingle();
            if (racedSessionError || !racedSession) {
                return res.status(502).json({ success: false, error: 'session_resume_failed' });
            }
            return serveExistingSoloSession(res, sb, userId, racedSession);
        }

        // Phase 3 rollout: the v3 selector runs in shadow for every legacy start and
        // records a coverage comparison. No player-visible effect; failures ignored.
        if (isShadowSelectorEnabled(process.env)) {
            try {
                await sb.rpc('trivia_shadow_compare_v1', {
                    p_user_id: userId,
                    p_mode: mode,
                    p_legacy_question_ids: picked.map(q => q.id),
                });
            } catch (e) {
                console.warn('[trivia session-start] shadow compare failed:', e?.message || e);
            }
        }

        // Feed the 60-day no-repeat window. Fire-and-forget: a history write
        // failing must not cost the player their run.
        try {
            await recordQuestionsSeen(sb, userId, picked.map(q => q.id), mode);
        } catch (e) {
            console.warn('[trivia session-start] history record failed:', e?.message || e);
        }

        // Serve the exact revisions captured by the atomic insert trigger. A
        // concurrent curation edit can therefore never make the browser see a
        // different body/options/context than the revision used for grading.
        const { data: persistedSession, error: persistedError } = await sb
            .from('trivia_sessions')
            .select('id, user_id, mode, status, question_ids, question_revision_ids, permutations, entry_cost, entry_state, created_at, expires_at, answers')
            .eq('id', sessionId)
            .maybeSingle();
        if (persistedError || !persistedSession) {
            return res.status(502).json({ success: false, error: 'session_resume_failed' });
        }
        return serveExistingSoloSession(res, sb, userId, persistedSession, {
            resumed: false,
            newBalance: created.new_balance == null ? null : Number(created.new_balance),
        });
    } catch (e) {
        console.warn('[trivia session-start] unexpected:', e);
        try { reportApiError(e, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

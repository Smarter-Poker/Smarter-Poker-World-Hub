import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * POST /api/trivia/session-answer
 * =========================================================================
 * Record ONE answer for an open server-graded session and return its
 * verdict, so the game UI can keep instant right/wrong feedback without the
 * client ever holding the answer key.
 *
 * -- WHY THE ANSWER IS BINDING ------------------------------------------
 * Revealing a verdict mid-run is an oracle: if the client could answer
 * again after seeing it, it would just re-ask until "correct". So the FIRST
 * answer per question is persisted atomically (trivia_session_answer_v4 for
 * V3, trivia_legacy_session_answer_v1 for legacy, both first-answer-wins)
 * BEFORE
 * the verdict is returned, and session-submit
 * grades from the server-stored answers, never the client's copy of them.
 * A repeat call for the same question is idempotent: it re-grades the
 * stored first answer and returns the same verdict.
 *
 * Body: { sessionId, questionId, displayIndex, invalidQuestion?, clientNonce? }
 *   displayIndex is the option position the player tapped, in the permuted
 *   order this session served. displayIndex < 0 (or omitted) records a
 *   skip: neutral for arcade's stake pot, wrong for accuracy.
 *
 * Auth: Bearer token or session cookie (getServerUserWithFallback).
 *
 * Returns:
 *   200 { success, wasCorrect, correctDisplayIndex, storedDisplayIndex,
 *         fresh }
 *   400 bad input / question not in this session
 *   401 not authenticated
 *   404 session not found
 *   409 session already closed
 * =========================================================================
 */

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { serviceClient } from './tournament-lifecycle';
import {
    isTriviaPvpReleased,
    rejectUnavailableTriviaPvp,
} from '../../../src/lib/trivia/pvpReleaseControl.mjs';
import {
    areTriviaTournamentsReleased,
    rejectUnavailableTriviaTournament,
} from '../../../src/lib/trivia/tournamentReleaseControl.mjs';
import { validateTriviaSessionAnswerReceipt } from '../../../src/lib/trivia/awardResponsePolicy.mjs';
import {
    CLIENT_TIMING_FIELDS,
    SELF_GRADED_FIELDS,
    findForbiddenFields,
    v3ErrorStatus,
} from '../../../src/lib/trivia/phase3Engine.mjs';
import { sanitizeSolverAnalysis } from '../../../src/lib/trivia/strategyContextPolicy.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validPermutation(value, optionCount) {
    return Array.isArray(value)
        && value.length === optionCount
        && value.every(index => Number.isInteger(index) && index >= 0 && index < optionCount)
        && new Set(value).size === optionCount;
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }
        // Allow up to 60 answers per minute (a player tapping rapidly in Arcade mode)
        if (!applyRateLimit(req, res, { max: 60, windowMs: 60 * 1000 })) return;

        const sb = serviceClient();

        // --- AUTH (identity from the token/cookie, never from the body) ---
        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, sb);
        if (authErr || !authUser) {
            return res.status(401).json({ success: false, error: 'authentication_required' });
        }
        const userId = authUser.id;

        // --- INPUT --------------------------------------------------------
        const { sessionId, questionId, displayIndex } = req.body || {};
        if (typeof sessionId !== 'string' || !UUID_RE.test(sessionId)) {
            return res.status(400).json({ success: false, error: 'invalid_session_id' });
        }
        if (typeof questionId !== 'string' || !UUID_RE.test(questionId)) {
            return res.status(400).json({ success: false, error: 'invalid_question_id' });
        }
        const invalidQuestion = req.body?.invalidQuestion === true;
        const idx = invalidQuestion ? -1 : (Number.isInteger(displayIndex) ? displayIndex : -1);
        const nonce = typeof req.body?.clientNonce === 'string' && UUID_RE.test(req.body.clientNonce)
            ? req.body.clientNonce : null;
        // The server clock is the only clock and the server is the only grader:
        // client timing or a client verdict is refused, never silently ignored.
        const forgedTiming = findForbiddenFields(req.body, CLIENT_TIMING_FIELDS);
        if (forgedTiming.length > 0) {
            return res.status(400).json({ success: false, error: 'client_timing_not_accepted', fields: forgedTiming });
        }
        const selfGraded = findForbiddenFields(req.body, SELF_GRADED_FIELDS);
        if (selfGraded.length > 0) {
            return res.status(400).json({ success: false, error: 'legacy_submission_shape', fields: selfGraded });
        }

        // Resolve the server-owned mode before the first mutation. Competitive
        // controls apply to the generic grading route as well as their named
        // entry routes; a guessed session id cannot bypass containment.
        const { data: session, error: sessionErr } = await sb
            .from('trivia_sessions')
            .select('id, user_id, mode, status, question_ids, question_revision_ids, permutations, created_at, engine_version')
            .eq('id', sessionId)
            .maybeSingle();
        if (sessionErr) {
            console.warn('[trivia session-answer] session load failed:', sessionErr.message || sessionErr);
            return res.status(500).json({ success: false, error: 'session_load_failed' });
        }
        if (!session) return res.status(404).json({ success: false, error: 'session_not_found' });
        if (session.user_id !== userId) {
            return res.status(403).json({ success: false, error: 'not_your_session' });
        }
        if (session.mode === 'pvp' && !isTriviaPvpReleased(process.env)) {
            return rejectUnavailableTriviaPvp(res);
        }
        if (session.mode === 'tournaments' && !areTriviaTournamentsReleased(process.env)) {
            return rejectUnavailableTriviaTournament(res);
        }

        // A player cannot self-declare a hard question invalid to remove it
        // from grading. Validation and the first-answer write happen in one
        // locked database operation, for both V3 and legacy sessions. Doing a
        // view read here and recording later left a restore/report race where
        // the question could change state between those two operations.
        if (invalidQuestion) {
            const { data: invalid, error: invalidErr } = await sb.rpc('trivia_record_invalid_question_v1', {
                p_session_id: sessionId,
                p_user_id: userId,
                p_question_id: questionId,
                p_client_nonce: nonce,
            });
            if (invalidErr) {
                console.warn('[trivia session-answer] atomic invalid-question record failed:', invalidErr.message || invalidErr);
                return res.status(500).json({ success: false, error: 'record_failed' });
            }
            res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
            if (!invalid || invalid.success !== true) {
                const error = invalid?.error || 'record_rejected';
                const status = error === 'question_still_valid' || error === 'answer_already_recorded'
                    ? 409
                    : v3ErrorStatus(error);
                return res.status(status).json({
                    success: false,
                    error,
                    ...(error === 'question_still_valid' ? { retryable: true } : {}),
                });
            }
            // Deliberately construct the response instead of forwarding the
            // RPC object. An invalid-question acknowledgement never contains
            // a verdict, correct option, explanation or solver metadata.
            return res.status(200).json({
                success: true,
                sessionId,
                questionId,
                recorded: invalid.recorded === true,
                fresh: invalid.duplicate !== true,
                storedDisplayIndex: -1,
                outcome: 'voided',
                voided: true,
            });
        }

        // --- ENGINE V3: the database records, times and grades the answer ---
        if (session.engine_version) {
            const { data: v3, error: v3Err } = await sb.rpc('trivia_session_answer_v4', {
                p_session_id: sessionId,
                p_user_id: userId,
                p_question_id: questionId,
                p_display_index: idx,
                p_client_nonce: nonce,
            });
            if (v3Err) {
                console.warn('[trivia session-answer] v4 record failed:', v3Err.message || v3Err);
                return res.status(500).json({ success: false, error: 'record_failed' });
            }
            res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
            if (!v3 || v3.success !== true) {
                return res.status(v3ErrorStatus(v3?.error)).json({ success: false, error: v3?.error || 'record_rejected' });
            }
            const body = {
                success: true,
                sessionId,
                questionId,
                recorded: v3.recorded === true,
                fresh: v3.duplicate !== true,
                storedDisplayIndex: Number.isInteger(v3.storedDisplayIndex) ? v3.storedDisplayIndex : idx,
                outcome: v3.outcome,
            };
            const durableVoid = v3.voided === true
                || v3.serverVoided === true
                || v3.outcome === 'voided';
            if (durableVoid) {
                // A retry of a server-voided answer stays a neutral void. Do
                // not let an older/alternate RPC projection turn that durable
                // marker into an answer-key oracle on a duplicate request.
                body.storedDisplayIndex = -1;
                body.outcome = 'voided';
                body.voided = true;
                return res.status(200).json(body);
            }
            // Verdicts exist only when the roster profile's reveal policy allows them.
            if (typeof v3.wasCorrect === 'boolean') {
                body.wasCorrect = v3.wasCorrect;
                body.correctDisplayIndex = Number.isInteger(v3.correctDisplayIndex) ? v3.correctDisplayIndex : -1;
                body.explanation = typeof v3.explanation === 'string' ? v3.explanation : null;
                const analysis = sanitizeSolverAnalysis(v3.engineMetadata);
                body.solverMetadata = analysis ? {
                    gtoFrequencies: analysis.frequencies,
                    evData: analysis.ev,
                    source: analysis.source,
                } : null;
            }
            return res.status(200).json(body);
        }

        // --- LEGACY RECORD (atomic authority check + first answer) --------
        // This RPC locks the exact served revision and current quarantine /
        // invalidity authority before it writes anything. A question that is
        // no longer valid is durably recorded as a keyless neutral void in
        // the same transaction; the API never performs a check-then-write.
        const { data: recorded, error: recordErr } = await sb.rpc('trivia_legacy_session_answer_v1', {
            p_session_id: sessionId,
            p_user_id: userId,
            p_question_id: questionId,
            p_display_index: idx,
            p_client_nonce: nonce,
        });
        if (recordErr) {
            console.warn('[trivia session-answer] record failed:', recordErr.message || recordErr);
            return res.status(500).json({ success: false, error: 'record_failed' });
        }
        if (!recorded || recorded.success !== true) {
            const error = recorded?.error || 'record_rejected';
            return res.status(v3ErrorStatus(error)).json({ success: false, error });
        }
        if (recorded?.stored?.v === true) {
            // Legacy sessions carry the same durable server-void marker in
            // their JSON answer map. A caller that retries through the normal
            // answer shape must not turn that marker into an answer-key read.
            res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
            return res.status(200).json({
                success: true,
                sessionId,
                questionId,
                recorded: true,
                fresh: recorded?.fresh === true,
                storedDisplayIndex: -1,
                outcome: 'voided',
                voided: true,
            });
        }

        // --- GRADE THE STORED ANSWER (key never leaves the server raw) ----
        const { data: review, error: reviewErr } = await sb.rpc('trivia_session_question_review_v1', {
            p_session_id: sessionId,
            p_user_id: userId,
            p_question_id: questionId,
        });
        if (reviewErr || !review || review.success !== true) {
            const error = review?.error || 'grading_failed';
            console.warn('[trivia session-answer] bound revision lookup failed:',
                reviewErr?.message || error);
            return res.status(v3ErrorStatus(error)).json({ success: false, error });
        }
        if (review.voided === true || review.outcome === 'voided') {
            return res.status(200).json({
                success: true,
                sessionId,
                questionId,
                recorded: true,
                fresh: recorded?.fresh === true,
                storedDisplayIndex: -1,
                outcome: 'voided',
                voided: true,
            });
        }

        const optionCount = Array.isArray(review.options) ? review.options.length : 0;
        const answerReceipt = validateTriviaSessionAnswerReceipt(recorded, {
            requestedDisplayIndex: idx,
            optionCount,
            questionCount: Array.isArray(session.question_ids) ? session.question_ids.length : 0,
            sessionCreatedAt: session.created_at,
        });
        if (!answerReceipt.ok) {
            console.warn('[trivia session-answer] malformed persistence receipt:', answerReceipt.error);
            return res.status(502).json({ success: false, error: 'invalid_answer_persistence_receipt' });
        }
        const storedDisplayIndex = answerReceipt.storedDisplayIndex;
        const stored = (session?.permutations && typeof session.permutations === 'object')
            ? session.permutations
            : {};
        const order = stored[questionId];
        if (!validPermutation(order, optionCount)) {
            return res.status(409).json({ success: false, error: 'revision_provenance_unavailable' });
        }

        const originalIndex = (storedDisplayIndex >= 0 && storedDisplayIndex < order.length)
            ? order[storedDisplayIndex]
            : -1;
        const key = Number.isInteger(review.correctIndex) ? review.correctIndex : -1;
        const wasCorrect = key >= 0 && originalIndex === key;
        const correctDisplayIndex = key >= 0 ? order.indexOf(key) : -1;
        const analysis = sanitizeSolverAnalysis(review.engineMetadata);
        // Metadata can contain audit answer indexes and original answer text.
        // Return only solver-analysis fields, and only after the first answer
        // has been irreversibly bound above.
        const solverMetadata = analysis ? {
            gtoFrequencies: analysis.frequencies,
            evData: analysis.ev,
            source: analysis.source,
        } : null;

        // The answer is locked, so revealing the explanation now leaks
        // nothing the verdict does not already imply.
        res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        return res.status(200).json({
            success: true,
            sessionId,
            questionId,
            wasCorrect,
            correctDisplayIndex,
            storedDisplayIndex,
            fresh: answerReceipt.fresh,
            explanation: typeof review.explanation === 'string' ? review.explanation : null,
            solverMetadata,
        });
    } catch (e) {
        console.warn('[trivia session-answer] unexpected:', e);
        try { reportApiError(e, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

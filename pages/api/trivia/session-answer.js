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
 * answer per question is persisted atomically (record_trivia_session_answer,
 * first-answer-wins) BEFORE the verdict is returned, and session-submit
 * grades from the server-stored answers, never the client's copy of them.
 * A repeat call for the same question is idempotent: it re-grades the
 * stored first answer and returns the same verdict.
 *
 * Body: { sessionId, questionId, displayIndex }
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
import { reportApiError } from '../../../src/lib/sentryWrap';
import { serviceClient, deterministicOptionOrder, optionOrderSeed } from './tournament-lifecycle';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
        const idx = Number.isInteger(displayIndex) ? displayIndex : -1;

        // --- RECORD (atomic, first answer wins) ---------------------------
        const { data: recorded, error: recordErr } = await sb.rpc('record_trivia_session_answer', {
            p_session_id: sessionId,
            p_user_id: userId,
            p_question_id: questionId,
            p_display_index: idx,
        });
        if (recordErr) {
            console.warn('[trivia session-answer] record failed:', recordErr.message || recordErr);
            return res.status(500).json({ success: false, error: 'record_failed' });
        }
        if (!recorded || recorded.success === false) {
            const code = recorded?.error === 'session_not_found' ? 404
                : recorded?.error === 'session_closed' ? 409
                : 400;
            return res.status(code).json({ success: false, error: recorded?.error || 'record_rejected' });
        }
        const storedDisplayIndex = Number.isInteger(recorded?.stored?.d) ? recorded.stored.d : -1;

        // --- GRADE THE STORED ANSWER (key never leaves the server raw) ----
        const [{ data: session, error: sessErr }, { data: keyRow, error: keyErr }] = await Promise.all([
            sb.from('trivia_sessions')
                .select('permutations')
                .eq('id', sessionId)
                .maybeSingle(),
            sb.from('trivia_questions')
                .select('id, correct_index, options, explanation')
                .eq('id', questionId)
                .maybeSingle(),
        ]);
        if (sessErr || keyErr || !keyRow) {
            console.warn('[trivia session-answer] grade lookup failed:',
                (sessErr || keyErr)?.message || sessErr || keyErr || 'question_missing');
            return res.status(500).json({ success: false, error: 'grading_failed' });
        }

        const optionCount = Array.isArray(keyRow.options) ? keyRow.options.length : 0;
        const stored = (session?.permutations && typeof session.permutations === 'object')
            ? session.permutations
            : {};
        let order = Array.isArray(stored[questionId]) ? stored[questionId] : null;
        if (!order && optionCount > 0) {
            order = deterministicOptionOrder(optionCount, optionOrderSeed(userId, sessionId, questionId));
        }

        const originalIndex = (order && storedDisplayIndex >= 0 && storedDisplayIndex < order.length)
            ? order[storedDisplayIndex]
            : -1;
        const key = Number.isInteger(keyRow.correct_index) ? keyRow.correct_index : -1;
        const wasCorrect = key >= 0 && originalIndex === key;
        const correctDisplayIndex = order && key >= 0 ? order.indexOf(key) : -1;

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
            fresh: recorded.fresh !== false,
            explanation: typeof keyRow.explanation === 'string' ? keyRow.explanation : null,
        });
    } catch (e) {
        console.warn('[trivia session-answer] unexpected:', e);
        try { reportApiError(e, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

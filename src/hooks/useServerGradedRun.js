/**
 * useServerGradedRun - client adapter for server-authoritative trivia runs.
 * ===========================================================================
 * WHAT THIS IS FOR
 *
 * Solo modes currently receive correct_index, grade themselves, and call
 * rpc('add_diamonds_to_balance') with an amount they chose - a mint button in
 * devtools. /api/trivia/session-start and /api/trivia/session-submit replace
 * that flow. This hook is the client half, so each game page adopts the new
 * flow by swapping its loader + save call rather than by re-implementing the
 * protocol seven times (and drifting seven different ways).
 *
 * MIGRATION IS GATED ON PURPOSE - see SERVER_GRADING_ENABLED below: until
 * the trivia_sessions migration is applied, isEnabled() is false and callers
 * MUST keep their existing path. A page should read isEnabled() once and pick
 * a branch; it must never half-adopt (start a server session, then grade
 * locally), because that pays twice.
 *
 * USAGE (per game page):
 *
 *   const run = useServerGradedRun('endless');
 *   if (run.isEnabled) {
 *       const { questions } = await run.start({ count: 20 });
 *       // ...play. options are ALREADY in display order; there is no
 *       // correct_index, so the page cannot show right/wrong until submit.
 *       const result = await run.submit(answers); // [{questionId, displayIndex}]
 *       // result.perQuestion[i].wasCorrect / .correctDisplayIndex for review
 *   }
 *
 * The answers array records the DISPLAY index the player tapped. The server
 * maps it back through the permutation it stored at serve time.
 * ===========================================================================
 */

import { useCallback, useRef, useState } from 'react';

/**
 * Kill switch. Flip to true only AFTER
 * supabase/migrations/20260804210000_trivia_server_grading.sql is applied -
 * without the trivia_sessions table session-start returns 500 and a page that
 * already switched would be unplayable.
 *
 * Kept as a module constant rather than an env var so the value is visible in
 * the bundle diff during rollout, and so a page cannot be flipped on for some
 * users and off for others mid-run.
 */
export const SERVER_GRADING_ENABLED = true;

/** Modes that pay out through their own settlement routes, never through this one. */
const SELF_SETTLING_MODES = new Set(['pvp', 'tournaments']);

async function postJson(url, body, accessToken) {
    const headers = { 'Content-Type': 'application/json' };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const res = await fetch(url, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(body || {}),
    });
    let json = null;
    try { json = await res.json(); } catch (_e) { json = null; }
    if (!res.ok || !json || json.success === false) {
        const err = new Error((json && json.error) || `request_failed_${res.status}`);
        err.status = res.status;
        err.payload = json;
        throw err;
    }
    return json;
}

/**
 * @param {string} mode  one of the trivia mode ids (endless, survival, ...)
 * @param {object} [opts]
 * @param {string} [opts.accessToken] Supabase access token, when the page has
 *        one handy. Omit to rely on the session cookie.
 */
export default function useServerGradedRun(mode, opts = {}) {
    const [sessionId, setSessionId] = useState(null);
    const [isStarting, setIsStarting] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);

    // Synchronous guards. setState is async, so a double-tap can fire two
    // requests before React re-renders - the same class of bug that
    // double-charged lifelines.
    const startingRef = useRef(false);
    const submittingRef = useRef(false);
    const sessionRef = useRef(null);

    const isEnabled = SERVER_GRADING_ENABLED && !SELF_SETTLING_MODES.has(mode);

    const start = useCallback(async ({ count, category, difficulty } = {}) => {
        if (!isEnabled) throw new Error('server_grading_disabled');
        if (startingRef.current) return null;
        startingRef.current = true;
        setIsStarting(true);
        setError(null);
        try {
            const json = await postJson(
                '/api/trivia/session-start',
                { mode, count, category, difficulty },
                opts.accessToken
            );
            sessionRef.current = json.sessionId;
            setSessionId(json.sessionId);
            // questions[].options are already permuted; no correct_index.
            return { sessionId: json.sessionId, questions: json.questions || [] };
        } catch (e) {
            setError(e.message || 'start_failed');
            throw e;
        } finally {
            startingRef.current = false;
            setIsStarting(false);
        }
    }, [isEnabled, mode, opts.accessToken]);

    /**
     * Record ONE answer mid-run and get its verdict back
     * (/api/trivia/session-answer). The first answer per question is binding
     * server-side, so this is safe to retry: a repeat call returns the same
     * verdict for the stored answer. displayIndex < 0 records a skip.
     *
     * @param {{questionId: string, displayIndex: number}} arg
     * @returns {Promise<{wasCorrect: boolean, correctDisplayIndex: number,
     *           storedDisplayIndex: number, fresh: boolean,
     *           explanation: string|null}>}
     */
    const answer = useCallback(async ({ questionId, displayIndex } = {}) => {
        if (!isEnabled) throw new Error('server_grading_disabled');
        const id = sessionRef.current;
        if (!id) throw new Error('no_open_session');
        if (typeof questionId !== 'string') throw new Error('missing_question_id');
        return postJson(
            '/api/trivia/session-answer',
            {
                sessionId: id,
                questionId,
                displayIndex: Number.isInteger(displayIndex) ? displayIndex : -1,
            },
            opts.accessToken
        );
    }, [isEnabled, opts.accessToken]);

    /**
     * @param {Array<{questionId: string, displayIndex: number}>} answers
     * Unanswered questions may be omitted - the server scores over the roster
     * it served, so omitting one counts it wrong rather than shrinking the
     * denominator.
     * @param {object} [submitOpts]
     * @param {boolean} [submitOpts.cashedOut] Arcade: the player locked the
     *        stake pot instead of finishing the run. The server only honours
     *        it past the cash-out floor and recomputes the pot itself.
     */
    const submit = useCallback(async (answers, submitOpts = {}) => {
        if (!isEnabled) throw new Error('server_grading_disabled');
        const id = sessionRef.current;
        if (!id) throw new Error('no_open_session');
        if (submittingRef.current) return null;
        submittingRef.current = true;
        setIsSubmitting(true);
        setError(null);
        try {
            const clean = (Array.isArray(answers) ? answers : [])
                .filter(a => a && typeof a.questionId === 'string')
                .map(a => ({
                    questionId: a.questionId,
                    displayIndex: Number.isInteger(a.displayIndex) ? a.displayIndex : -1,
                }));
            const json = await postJson(
                '/api/trivia/session-submit',
                { sessionId: id, answers: clean, cashedOut: submitOpts.cashedOut === true },
                opts.accessToken
            );
            // The session is single-use; clear it so a retry cannot re-submit.
            sessionRef.current = null;
            setSessionId(null);
            return json;
        } catch (e) {
            // 409/410 mean the session is closed for good - do not let the page
            // sit on a dead id and retry forever.
            if (e.status === 409 || e.status === 410) {
                sessionRef.current = null;
                setSessionId(null);
            }
            setError(e.message || 'submit_failed');
            throw e;
        } finally {
            submittingRef.current = false;
            setIsSubmitting(false);
        }
    }, [isEnabled, opts.accessToken]);

    const reset = useCallback(() => {
        sessionRef.current = null;
        setSessionId(null);
        setError(null);
    }, []);

    return { isEnabled, sessionId, isStarting, isSubmitting, error, start, answer, submit, reset };
}

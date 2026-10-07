/**
 * useServerGradedRun - client adapter for server-authoritative trivia runs.
 * ===========================================================================
 * WHAT THIS IS FOR
 *
 * Solo modes use /api/trivia/session-start, /api/trivia/session-answer and
 * /api/trivia/session-submit so answer keys, grading, settlement and rewards
 * stay server-owned. This hook is the shared client adapter for that protocol.
 *
 * SERVER_GRADING_ENABLED remains an emergency kill switch. Callers read it
 * once and pick one complete branch; they must never start a server session
 * and then grade or pay locally.
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

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    clearSoloRunRecovery,
    createSoloRunRecovery,
    readSoloRunRecovery,
    writeSoloRunRecovery,
} from '../lib/trivia/soloRunRecovery.mjs';
import {
    createAccountOperationScope,
    isStaleAccountOperation,
    staleAccountOperationError,
} from '../lib/trivia/accountOperationScope.mjs';

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

/**
 * Modes this hook refuses outright. Tournaments have their own full pipeline
 * (tournament-round-questions / tournament-submit-round) and must never open
 * a generic session.
 *
 * 'pvp' is deliberately NOT in this set: pvp runs its GRADING through these
 * session routes (start with a matchId, per-tap answers, submit), and
 * session-submit pays 0 for pvp BY DESIGN - sessions grade, payment happens
 * in /api/trivia/pvp-settle-match from both players' server-graded counts.
 */
const SELF_SETTLING_MODES = new Set(['tournaments']);

function createStartNonce() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function browserStorage() {
    try {
        return typeof window !== 'undefined' ? window.localStorage : null;
    } catch (_error) {
        return null;
    }
}

const RETIRED_RECOVERY_ERRORS = new Set([
    'session_not_found',
    'not_your_session',
    'session_closed',
    'session_expired',
    'session_not_resumable',
    'session_mode_conflict',
]);

function recoveryCustodyError() {
    const error = new Error('recovery_custody_unavailable');
    error.code = 'recovery_custody_unavailable';
    return error;
}

async function postJson(url, body, resolveAccessToken) {
    const headers = { 'Content-Type': 'application/json' };
    const accessToken = typeof resolveAccessToken === 'function'
        ? await resolveAccessToken()
        : null;
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
 * @param {string} [opts.accountId] Required for every non-PvP run. It scopes
 *        the durable idempotency pointer that must be writable before entry
 *        charging or settlement can begin.
 * @param {string} [opts.accessToken] Supabase access token, when the page has
 *        one handy. Retained for existing solo-mode callers.
 * @param {() => (string|null|Promise<string|null>)} [opts.accessTokenProvider]
 *        Request-time token resolver for long-lived flows. PvP supplies the
 *        maintained refresh-aware resolver so same-user token rotation never
 *        leaves a committed match using the token captured at mount time.
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
    const startingOperationRef = useRef(null);
    const submittingOperationRef = useRef(null);
    const sessionRef = useRef(null);
    // Competitive engine-v3 sessions are bound to an immutable contract.
    // Keep the server-issued signature beside the session id and return it on
    // submit; omitting it makes the competitive submit route correctly refuse
    // the request with contract_mismatch.
    const contractSignatureRef = useRef(null);
    const pendingStartNonceRef = useRef(null);
    const settlementRequestIdRef = useRef(null);
    const recoveryRef = useRef(null);
    const [recoverableSession, setRecoverableSession] = useState(null);
    const lastSettlementRef = useRef(null);
    const [lastSettlement, setLastSettlement] = useState(null);

    const isEnabled = SERVER_GRADING_ENABLED && !SELF_SETTLING_MODES.has(mode);
    const accessToken = opts.accessToken;
    const accessTokenProvider = opts.accessTokenProvider;
    const accountId = typeof opts.accountId === 'string' && opts.accountId ? opts.accountId : null;
    const operationIdentity = `${String(mode || '')}\u0000${accountId || ''}`;
    const operationScopeRef = useRef(null);
    if (!operationScopeRef.current) operationScopeRef.current = createAccountOperationScope();
    // Advance synchronously during render. A response from the previous
    // account can resolve before effects run; the generation check below must
    // already see the new account in that window.
    operationScopeRef.current.transition(operationIdentity);
    const captureCurrentOperation = useCallback(() => {
        const snapshot = operationScopeRef.current.capture();
        // Old callbacks can outlive the render that created them. Confirm the
        // callback's captured account as well as the generation before it is
        // allowed to touch the hook's current refs.
        if (snapshot.identity !== operationIdentity) throw staleAccountOperationError();
        return snapshot;
    }, [operationIdentity]);
    const requireCurrentOperation = useCallback((snapshot) => {
        if (!operationScopeRef.current.isCurrent(snapshot)) {
            throw staleAccountOperationError();
        }
    }, []);
    const resolveAccessToken = useCallback(async () => {
        if (typeof accessTokenProvider === 'function') {
            const current = await accessTokenProvider();
            return typeof current === 'string' && current ? current : null;
        }
        return typeof accessToken === 'string' && accessToken ? accessToken : null;
    }, [accessToken, accessTokenProvider]);

    const persistRecovery = useCallback((record) => {
        if (mode === 'pvp' || !accountId) return null;
        const storage = browserStorage();
        const written = writeSoloRunRecovery(storage, record);
        // A successful setter is not enough: custody is the idempotency
        // boundary for charged solo runs, so read the exact pointer back
        // before an entry or settlement request is allowed to leave.
        const verified = written
            ? readSoloRunRecovery(storage, mode, accountId)
            : null;
        if (!verified || verified.sessionId !== written.sessionId
            || verified.phase !== written.phase
            || verified.settlementRequestId !== written.settlementRequestId) return null;
        recoveryRef.current = verified;
        setRecoverableSession(verified);
        return verified;
    }, [accountId, mode]);

    const retireRecovery = useCallback(() => {
        if (mode !== 'pvp' && accountId) {
            clearSoloRunRecovery(browserStorage(), mode, accountId);
        }
        recoveryRef.current = null;
        settlementRequestIdRef.current = null;
        setRecoverableSession(null);
    }, [accountId, mode]);

    // Re-adopt only a validated, account-and-mode-scoped pointer. The session
    // itself is not trusted until resume() makes the authenticated server read.
    useEffect(() => {
        // An auth or mode boundary invalidates every in-memory capability.
        // Keeping the previous session ref would let a newly-authenticated
        // account send a request against the prior account's run.
        sessionRef.current = null;
        contractSignatureRef.current = null;
        pendingStartNonceRef.current = null;
        settlementRequestIdRef.current = null;
        lastSettlementRef.current = null;
        startingRef.current = false;
        submittingRef.current = false;
        startingOperationRef.current = null;
        submittingOperationRef.current = null;
        setSessionId(null);
        setLastSettlement(null);
        setError(null);
        setIsStarting(false);
        setIsSubmitting(false);
        if (mode === 'pvp' || !accountId) {
            recoveryRef.current = null;
            setRecoverableSession(null);
            return;
        }
        const record = readSoloRunRecovery(browserStorage(), mode, accountId);
        recoveryRef.current = record;
        pendingStartNonceRef.current = record?.sessionId || null;
        settlementRequestIdRef.current = record?.settlementRequestId || null;
        setRecoverableSession(record);
    }, [accountId, mode]);

    const openSession = useCallback(async ({ count, category, difficulty, matchId, parentSessionId } = {}, requireRecovery = false) => {
        if (!isEnabled) throw new Error('server_grading_disabled');
        if (startingRef.current) return null;
        const operationScope = captureCurrentOperation();
        const operation = { operationScope };
        startingRef.current = true;
        startingOperationRef.current = operation;
        setIsStarting(true);
        setError(null);
        try {
            if (mode !== 'pvp' && !accountId) throw recoveryCustodyError();
            let recovery = recoveryRef.current;
            if (mode !== 'pvp' && accountId && !recovery) {
                recovery = readSoloRunRecovery(browserStorage(), mode, accountId);
                recoveryRef.current = recovery;
            }
            if (requireRecovery && !recovery) {
                const missing = new Error('no_recoverable_session');
                missing.code = 'no_recoverable_session';
                throw missing;
            }
            if (mode !== 'pvp') {
                pendingStartNonceRef.current = recovery?.sessionId
                    || pendingStartNonceRef.current
                    || createStartNonce();
                if (accountId) {
                    const custody = persistRecovery(createSoloRunRecovery({
                        mode,
                        accountId,
                        sessionId: pendingStartNonceRef.current,
                        phase: recovery?.phase || 'starting',
                        createdAt: recovery?.createdAt || Date.now(),
                        expiresAt: recovery?.expiresAt || null,
                        settlementRequestId: recovery?.settlementRequestId || null,
                    }));
                    if (!custody) throw recoveryCustodyError();
                    recovery = custody;
                }
            }
            // matchId is pvp-only: it binds the session to a match row, makes
            // the server share one roster between both players, and escrows
            // the stake server-side.
            const json = await postJson(
                '/api/trivia/session-start',
                {
                    mode,
                    count,
                    category,
                    difficulty,
                    matchId,
                    startNonce: mode === 'pvp' ? undefined : pendingStartNonceRef.current,
                    parentSessionId,
                },
                resolveAccessToken
            );
            requireCurrentOperation(operationScope);
            pendingStartNonceRef.current = null;
            sessionRef.current = json.sessionId;
            contractSignatureRef.current = json.contractSignature || null;
            lastSettlementRef.current = null;
            setLastSettlement(null);
            setSessionId(json.sessionId);
            if (mode !== 'pvp' && accountId) {
                persistRecovery(createSoloRunRecovery({
                    mode,
                    accountId,
                    sessionId: json.sessionId,
                    phase: 'active',
                    createdAt: recovery?.createdAt || Date.now(),
                    expiresAt: json.expiresAt || recovery?.expiresAt || null,
                }));
            }
            // questions[].options are already permuted; no correct_index.
            return {
                sessionId: json.sessionId,
                questions: json.questions || [],
                entryCost: Number(json.entryCost) || 0,
                entryState: json.entryState || 'free',
                newBalance: json.newBalance == null ? null : Number(json.newBalance),
                resumed: json.resumed === true,
                expiresAt: json.expiresAt || null,
                contract: json.contract || null,
                contractSignature: json.contractSignature || null,
            };
        } catch (e) {
            if (!operationScopeRef.current.isCurrent(operationScope) || isStaleAccountOperation(e)) {
                throw staleAccountOperationError();
            }
            const code = e?.payload?.error || e?.code || e?.message;
            if (mode !== 'pvp' && RETIRED_RECOVERY_ERRORS.has(code)) {
                pendingStartNonceRef.current = null;
                retireRecovery();
            }
            setError(e.message || 'start_failed');
            throw e;
        } finally {
            if (startingOperationRef.current === operation) {
                startingOperationRef.current = null;
                startingRef.current = false;
                if (operationScopeRef.current.isCurrent(operationScope)) setIsStarting(false);
            }
        }
    }, [accountId, captureCurrentOperation, isEnabled, mode, persistRecovery, requireCurrentOperation, resolveAccessToken, retireRecovery]);

    const start = useCallback((args = {}) => openSession(args, false), [openSession]);
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
    const answer = useCallback(async ({ questionId, displayIndex, invalidQuestion = false } = {}) => {
        if (!isEnabled) throw new Error('server_grading_disabled');
        const operationScope = captureCurrentOperation();
        const id = sessionRef.current;
        if (!id) throw new Error('no_open_session');
        if (typeof questionId !== 'string') throw new Error('missing_question_id');
        const verdict = await postJson(
            '/api/trivia/session-answer',
            {
                sessionId: id,
                questionId,
                displayIndex: Number.isInteger(displayIndex) ? displayIndex : -1,
                invalidQuestion: invalidQuestion === true,
            },
            resolveAccessToken
        );
        requireCurrentOperation(operationScope);
        return verdict;
    }, [captureCurrentOperation, isEnabled, requireCurrentOperation, resolveAccessToken]);

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
        const operationScope = captureCurrentOperation();
        const id = sessionRef.current;
        if (!id && lastSettlementRef.current) return lastSettlementRef.current;
        if (!id) throw new Error('no_open_session');
        if (submittingRef.current) return null;
        const operation = { operationScope };
        submittingRef.current = true;
        submittingOperationRef.current = operation;
        setIsSubmitting(true);
        setError(null);
        try {
            if (mode !== 'pvp' && !accountId) throw recoveryCustodyError();
            if (!settlementRequestIdRef.current) settlementRequestIdRef.current = createStartNonce();
            const recovery = recoveryRef.current;
            if (mode !== 'pvp') {
                if (!recovery) throw recoveryCustodyError();
                const custody = persistRecovery(createSoloRunRecovery({
                    ...recovery,
                    phase: 'settling',
                    settlementRequestId: settlementRequestIdRef.current,
                }));
                if (!custody) throw recoveryCustodyError();
            }
            const clean = (Array.isArray(answers) ? answers : [])
                .filter(a => a && typeof a.questionId === 'string')
                .map(a => ({
                    questionId: a.questionId,
                    displayIndex: Number.isInteger(a.displayIndex) ? a.displayIndex : -1,
                }));
            const json = await postJson(
                '/api/trivia/session-submit',
                {
                    sessionId: id,
                    answers: clean,
                    cashedOut: submitOpts.cashedOut === true,
                    contractSignature: contractSignatureRef.current,
                    requestId: settlementRequestIdRef.current,
                },
                resolveAccessToken
            );
            requireCurrentOperation(operationScope);
            lastSettlementRef.current = json;
            setLastSettlement(json);
            // The session is single-use in memory, but keep the durable
            // settling pointer until the result screen acknowledges custody.
            // A reload after the HTTP response but before React commits can
            // then replay the exact server receipt instead of losing it.
            sessionRef.current = null;
            contractSignatureRef.current = null;
            setSessionId(null);
            return json;
        } catch (e) {
            if (!operationScopeRef.current.isCurrent(operationScope) || isStaleAccountOperation(e)) {
                throw staleAccountOperationError();
            }
            const code = e?.payload?.error || e?.code || e?.message;
            // Unknown transport/5xx/409 outcomes retain the exact settlement
            // request and session identity. Only an authoritative terminal
            // read retires it; a retry can then replay the one server result.
            if (RETIRED_RECOVERY_ERRORS.has(code)) {
                sessionRef.current = null;
                contractSignatureRef.current = null;
                setSessionId(null);
                retireRecovery();
            }
            setError(e.message || 'submit_failed');
            throw e;
        } finally {
            if (submittingOperationRef.current === operation) {
                submittingOperationRef.current = null;
                submittingRef.current = false;
                if (operationScopeRef.current.isCurrent(operationScope)) setIsSubmitting(false);
            }
        }
    }, [accountId, captureCurrentOperation, isEnabled, mode, persistRecovery, requireCurrentOperation, resolveAccessToken, retireRecovery]);

    const resume = useCallback(async (args = {}) => {
        const operationScope = captureCurrentOperation();
        if (mode === 'pvp') return openSession(args, false);
        if (!accountId) return openSession(args, true);
        const recovery = recoveryRef.current
            || readSoloRunRecovery(browserStorage(), mode, accountId);
        if (!recovery) {
            const missing = new Error('no_recoverable_session');
            missing.code = 'no_recoverable_session';
            throw missing;
        }
        if (recovery.phase !== 'settling') return openSession(args, true);

        // A settlement response can be lost after the database committed.
        // Re-submit the exact session/request identity instead of asking the
        // start route to resume an already-closed session. Both engines grade
        // from durable server answers and replay the one settlement result.
        recoveryRef.current = recovery;
        sessionRef.current = recovery.sessionId;
        settlementRequestIdRef.current = recovery.settlementRequestId;
        setSessionId(recovery.sessionId);
        const settlement = await submit([], { recovering: true });
        requireCurrentOperation(operationScope);
        return {
            resumed: true,
            resumedSettlement: true,
            sessionId: recovery.sessionId,
            settlement,
        };
    }, [accountId, captureCurrentOperation, mode, openSession, requireCurrentOperation, submit]);

    const acknowledgeSettlement = useCallback(() => {
        try { captureCurrentOperation(); } catch (error) {
            if (isStaleAccountOperation(error)) return false;
            throw error;
        }
        if (!lastSettlementRef.current) return false;
        retireRecovery();
        return true;
    }, [captureCurrentOperation, retireRecovery]);

    const reset = useCallback(() => {
        try { captureCurrentOperation(); } catch (error) {
            if (isStaleAccountOperation(error)) return;
            throw error;
        }
        sessionRef.current = null;
        contractSignatureRef.current = null;
        pendingStartNonceRef.current = null;
        lastSettlementRef.current = null;
        setSessionId(null);
        setLastSettlement(null);
        setError(null);
        if (mode === 'pvp') {
            settlementRequestIdRef.current = null;
            retireRecovery();
            return;
        }
        // A UI reset is not proof that a charged server session was settled
        // or expired. Preserve its account-scoped recovery custody; deleting
        // it here would turn a malformed start response or render failure into
        // an orphaned entry charge. Only terminal server errors or an
        // acknowledged settlement retire solo custody.
        const recovery = recoveryRef.current
            || (accountId ? readSoloRunRecovery(browserStorage(), mode, accountId) : null);
        recoveryRef.current = recovery;
        settlementRequestIdRef.current = recovery?.settlementRequestId || null;
        setRecoverableSession(recovery);
    }, [accountId, captureCurrentOperation, mode, retireRecovery]);

    return {
        isEnabled,
        sessionId,
        isStarting,
        isSubmitting,
        error,
        hasRecoverableSession: Boolean(recoverableSession),
        recoverableSession,
        lastSettlement,
        acknowledgeSettlement,
        start,
        resume,
        answer,
        submit,
        reset,
    };
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import TriviaConsole from '../../../src/components/trivia/console/TriviaConsole';
import TriviaConsoleDialog from '../../../src/components/trivia/console/TriviaConsoleDialog';
import ResponsiveModeArt from '../../../src/components/trivia/console/ResponsiveModeArt';
import { TRIVIA_INTRO_ART_TOURNAMENTS } from '../../../src/config/triviaIntroArt.mjs';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { authedFetch } from '../../../src/lib/authUtils';
import { createCompetitiveJourneyTracker } from '../../../src/lib/trivia/competitiveJourneyAnalytics.mjs';
import { triviaTournamentPageReleaseResult } from '../../../src/lib/trivia/tournamentReleaseControl.mjs';
import {
    TournamentBracketViewport,
    TournamentEventLedger,
    TournamentFieldList,
    TournamentHistory,
    TournamentMyRun,
    TournamentQuestionStage,
    TournamentReceipt,
    TournamentResults,
    TournamentStateBanner,
    TournamentTabs,
} from '../../../src/components/trivia/tournaments/TournamentSections';
import {
    chooseTournamentInstance,
    createTournamentActionLease,
    createTournamentRequestAuthority,
    firstOpenQuestion,
    mergeOpenedQuestion,
    nextLockedPosition,
    pendingAfterTournamentContextSupersession,
    isTournamentActionCurrent,
    secondsUntil,
    serverNowMs,
    tournamentEntryDialogAction,
    tournamentErrorMessage,
    tournamentViewState,
} from '../../../src/components/trivia/tournaments/tournamentModel.mjs';

const PAGE_PATH = '/hub/trivia/tournaments';
const BRACKET_PAGE_SIZE = 64;
const FIELD_PAGE_SIZE = 50;
const RESULTS_PAGE_SIZE = 50;
const HISTORY_PAGE_SIZE = 20;
const EVENT_REQUEST_LANES = Object.freeze(['core', 'bracket', 'field', 'results', 'receipt', 'action']);

export function getServerSideProps() {
    return triviaTournamentPageReleaseResult(process.env);
}

class TournamentApiError extends Error {
    constructor(code, status, body = {}) {
        super(tournamentErrorMessage(code));
        this.name = 'TournamentApiError';
        this.code = code;
        this.status = status;
        this.body = body;
    }
}

function nightlyUrl(action, params = {}) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
    }
    const query = search.toString();
    return `/api/trivia/nightly/${action}${query ? `?${query}` : ''}`;
}

async function nightlyRequest(action, { method = 'GET', params, body, signal } = {}) {
    const response = await authedFetch(nightlyUrl(action, params), {
        method,
        signal,
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let payload = {};
    try {
        payload = await response.json();
    } catch {
        payload = {};
    }
    if (!response.ok || payload?.success !== true) {
        const code = response.status === 429 ? 'rate_limited' : payload?.error || 'internal_error';
        throw new TournamentApiError(code, response.status, payload);
    }
    return payload;
}

function createUuid() {
    const webCrypto = typeof crypto !== 'undefined' ? crypto : null;
    if (typeof webCrypto?.randomUUID === 'function') return webCrypto.randomUUID();
    if (typeof webCrypto?.getRandomValues !== 'function') throw new Error('secure_random_unavailable');
    const bytes = new Uint8Array(16);
    webCrypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function entryNonce(tournamentId) {
    const key = `trivia-nightly-entry:${tournamentId}`;
    try {
        const existing = sessionStorage.getItem(key);
        if (existing) return existing;
        const nonce = createUuid();
        sessionStorage.setItem(key, nonce);
        return nonce;
    } catch {
        return createUuid();
    }
}

function displayError(error) {
    if (error?.name === 'AbortError') return '';
    if (error instanceof TournamentApiError) return error.message;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return tournamentErrorMessage('offline');
    return tournamentErrorMessage('internal_error');
}

function calendarStamp(value) {
    const date = new Date(value || '');
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function downloadCalendarReminder(tournament) {
    const startsAt = calendarStamp(tournament?.startsAt);
    if (!startsAt || typeof document === 'undefined') return;
    const plannedEndAt = calendarStamp(tournament?.plannedEndAt);
    const title = String(tournament?.name || 'Smarter.Poker Nightly Trivia Tournament').replace(/[\r\n,;]/g, ' ');
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Smarter.Poker//Nightly Trivia//EN',
        'CALSCALE:GREGORIAN',
        'BEGIN:VEVENT',
        `UID:${tournament.tournamentId}@smarter.poker`,
        `DTSTAMP:${calendarStamp(new Date().toISOString())}`,
        `DTSTART:${startsAt}`,
        ...(plannedEndAt ? [`DTEND:${plannedEndAt}`] : []),
        `SUMMARY:${title}`,
        'DESCRIPTION:Nightly Trivia Tournament at 8 PM Central. Open Smarter.Poker to enter or resume your run.',
        `URL:https://smarter.poker${PAGE_PATH}`,
        'END:VEVENT',
        'END:VCALENDAR',
    ];
    const blob = new Blob([`${lines.join('\r\n')}\r\n`], { type: 'text/calendar;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `smarter-poker-nightly-trivia-${tournament.localDate || 'event'}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
}

export default function TournamentsPage() {
    useTrainingBus('trivia-tournaments');
    const { user, loading: authLoading } = useAvatar();
    const accountKey = authLoading ? 'auth-loading' : user?.id ? `account:${user.id}` : 'signed-out';

    // Account-owned tournament state lives below this keyed boundary. Logging
    // out or changing accounts destroys the complete prior instance (including
    // its request effects and refs) before a new account can render.
    return <TournamentPageExperience key={accountKey} user={user} authLoading={authLoading} />;
}

function TournamentPageExperience({ user, authLoading }) {
    const router = useRouter();
    const signedIn = Boolean(user?.id);

    const [pageState, setPageState] = useState('loading');
    const [pageError, setPageError] = useState('');
    const [online, setOnline] = useState(true);
    const [tournamentId, setTournamentId] = useState(null);
    const [tournament, setTournament] = useState(null);
    const [summary, setSummary] = useState(null);
    const [myRun, setMyRun] = useState(null);
    const [currentMatch, setCurrentMatch] = useState(null);
    const [receipt, setReceipt] = useState(null);
    const [bracket, setBracket] = useState(null);
    const [field, setField] = useState(null);
    const [results, setResults] = useState(null);
    const [history, setHistory] = useState(null);
    const [activeTab, setActiveTab] = useState('run');
    const [bracketRound, setBracketRound] = useState(1);
    const [bracketQuery, setBracketQuery] = useState('');
    const [fieldQuery, setFieldQuery] = useState('');
    const [fieldKind, setFieldKind] = useState('');
    const [loading, setLoading] = useState({ core: false, bracket: true, field: true, results: true, receipt: true, history: true });
    const [errors, setErrors] = useState({ core: '', bracket: '', field: '', results: '', receipt: '', history: '' });
    const [pending, setPending] = useState('');
    const [dialogError, setDialogError] = useState(null);
    const [session, setSession] = useState(null);
    const [activeQuestion, setActiveQuestion] = useState(null);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [playError, setPlayError] = useState('');
    const [clockAnchor, setClockAnchor] = useState({ serverTime: null, receivedAt: null });
    const [nowMs, setNowMs] = useState(Date.now());

    const bracketTouchedRef = useRef(false);
    const autoResumeRef = useRef(new Set());
    const timeoutSentRef = useRef(null);
    const answerNonceRef = useRef(new Map());
    const tournamentIdRef = useRef(null);
    const skipNextCoreLoadRef = useRef(null);
    const requestAuthorityRef = useRef(null);
    const journeyTrackerRef = useRef(null);
    if (!requestAuthorityRef.current) {
        requestAuthorityRef.current = createTournamentRequestAuthority();
    }
    if (!journeyTrackerRef.current) {
        journeyTrackerRef.current = createCompetitiveJourneyTracker();
    }

    useEffect(() => () => requestAuthorityRef.current.invalidateAll(), []);

    useEffect(() => {
        journeyTrackerRef.current.track('nightly_tournament', 'impression', {
            source: 'nightly_tournament',
            state: authLoading ? 'auth_loading' : signedIn ? pageState : 'signed_out',
        });
    }, [authLoading, pageState, signedIn]);

    useEffect(() => {
        if (!myRun?.entered || !receipt?.entry?.reference || !receipt?.entry?.journalId) return;
        journeyTrackerRef.current.track('nightly_tournament', 'commitment', {
            source: 'nightly_tournament',
            action: 'enter',
            state: 'ready',
        });
    }, [myRun?.entered, receipt?.entry?.journalId, receipt?.entry?.reference]);

    useEffect(() => {
        const settlementState = String(receipt?.settlement?.state || '').toLowerCase();
        if (!['settled', 'refunded', 'voided'].includes(settlementState)
            || !receipt?.settlement?.settlementId
            || !receipt?.settlement?.idempotencyKey) return;

        let settlementKind = null;
        if (settlementState === 'voided') settlementKind = 'void';
        else if (receipt?.refund) {
            if (!receipt.refund.reference) return;
            settlementKind = 'refund';
        } else if (Number(receipt?.payout?.amount) > 0) {
            if (!receipt.payout.reference) return;
            settlementKind = 'payout';
        } else if (settlementState === 'settled') settlementKind = 'zero_payout';
        if (!settlementKind) return;

        journeyTrackerRef.current.track('nightly_tournament', 'verified_settlement_receipt', {
            source: 'nightly_tournament',
            state: 'verified',
            settlement_kind: settlementKind,
        });
    }, [receipt]);

    const setLaneLoading = useCallback((lane, value) => {
        setLoading(current => ({ ...current, [lane]: value }));
    }, []);
    const setLaneError = useCallback((lane, value) => {
        setErrors(current => ({ ...current, [lane]: value }));
    }, []);
    const anchorClock = useCallback(payload => {
        if (!payload?.serverTime) return;
        const receivedAt = Date.now();
        setClockAnchor({ serverTime: payload.serverTime, receivedAt });
        setNowMs(serverNowMs(payload.serverTime, receivedAt, receivedAt));
    }, []);

    const resetTournamentContext = useCallback(() => {
        requestAuthorityRef.current.invalidate(EVENT_REQUEST_LANES);
        setPending('');
        setTournament(null);
        setSummary(null);
        setMyRun(null);
        setCurrentMatch(null);
        setReceipt(null);
        setBracket(null);
        setField(null);
        setResults(null);
        setSession(null);
        setActiveQuestion(null);
        setSelectedAnswer(null);
        setPlayError('');
        setDialogError(null);
        setBracketRound(1);
        setBracketQuery('');
        setFieldQuery('');
        setFieldKind('');
        setLoading(current => ({
            ...current,
            core: false,
            bracket: true,
            field: true,
            results: true,
            receipt: true,
        }));
        setErrors(current => ({
            ...current,
            core: '',
            bracket: '',
            field: '',
            results: '',
            receipt: '',
        }));
        bracketTouchedRef.current = false;
        autoResumeRef.current.clear();
        timeoutSentRef.current = null;
        answerNonceRef.current.clear();
    }, []);

    const beginTournamentAction = useCallback(() => (
        createTournamentActionLease(requestAuthorityRef.current, tournamentIdRef.current)
    ), []);

    const canAdoptTournamentAction = useCallback(actionLease => (
        isTournamentActionCurrent(
            requestAuthorityRef.current,
            actionLease,
            tournamentIdRef.current,
        )
    ), []);

    const beginTournamentContext = useCallback((nextTournamentId, { skipCoreLoad = false } = {}) => {
        const nextId = nextTournamentId || null;
        const changed = tournamentIdRef.current !== nextId;
        if (changed) resetTournamentContext();
        tournamentIdRef.current = nextId;
        skipNextCoreLoadRef.current = changed && skipCoreLoad ? nextId : null;
        setTournamentId(nextId);
        return changed;
    }, [resetTournamentContext]);

    useEffect(() => {
        const tick = window.setInterval(() => {
            setNowMs(serverNowMs(clockAnchor.serverTime, clockAnchor.receivedAt, Date.now()));
        }, 1000);
        return () => window.clearInterval(tick);
    }, [clockAnchor]);

    useEffect(() => {
        setOnline(navigator.onLine);
        const handleOnline = () => setOnline(true);
        const handleOffline = () => setOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    useEffect(() => {
        if (typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches) setActiveTab('bracket');
    }, []);

    const loadSchedule = useCallback(async (signal, requestLease) => {
        const payload = await nightlyRequest('schedule', { params: { days: 8 }, signal });
        if (!requestAuthorityRef.current.isCurrent(requestLease)) return null;
        anchorClock(payload);
        const requestedId = typeof router.query?.tournamentId === 'string' ? router.query.tournamentId : null;
        const selected = chooseTournamentInstance(payload.instances, requestedId);
        beginTournamentContext(selected?.tournamentId || null);
        setTournament(selected);
        if (!selected) setPageState('ready');
        return selected;
    }, [anchorClock, beginTournamentContext, router.query?.tournamentId]);

    const loadCore = useCallback(async (id, { signal, quiet = false } = {}) => {
        if (!id || !online) return;
        const requestLease = requestAuthorityRef.current.begin('core');
        if (!quiet) setLaneLoading('core', true);
        setLaneError('core', '');
        try {
            const summaryPromise = nightlyRequest('summary', { params: { tournamentId: id }, signal });
            const runPromise = signedIn
                ? nightlyRequest('my-run', { params: { tournamentId: id }, signal }).catch(error => ({ _error: error }))
                : Promise.resolve(null);
            const [summaryPayload, runPayload] = await Promise.all([summaryPromise, runPromise]);
            if (tournamentIdRef.current !== id || !requestAuthorityRef.current.isCurrent(requestLease)) return;
            anchorClock(summaryPayload);
            setSummary(summaryPayload);
            setTournament(summaryPayload.tournament);
            const currentRound = Number(summaryPayload.currentRound || 1);
            if (!bracketTouchedRef.current && currentRound > 0) setBracketRound(currentRound);
            if (runPayload?._error) {
                setLaneError('core', displayError(runPayload._error));
                setMyRun(null);
                setCurrentMatch(null);
            } else if (runPayload) {
                anchorClock(runPayload);
                setMyRun(runPayload);
                if (runPayload.current?.matchupId) {
                    try {
                        const matchup = await nightlyRequest('match', { params: { tournamentId: id, matchupId: runPayload.current.matchupId }, signal });
                        if (tournamentIdRef.current !== id || !requestAuthorityRef.current.isCurrent(requestLease)) return;
                        setCurrentMatch(matchup);
                    } catch (error) {
                        if (error?.name !== 'AbortError'
                            && tournamentIdRef.current === id
                            && requestAuthorityRef.current.isCurrent(requestLease)) {
                            setLaneError('core', displayError(error));
                        }
                    }
                } else {
                    setCurrentMatch(null);
                }
            } else {
                setMyRun(null);
                setCurrentMatch(null);
            }
            setPageState('ready');
        } catch (error) {
            if (error?.name === 'AbortError'
                || tournamentIdRef.current !== id
                || !requestAuthorityRef.current.isCurrent(requestLease)) return;
            const message = displayError(error);
            if (quiet) setLaneError('core', message);
            else {
                setPageError(message);
                setPageState('error');
            }
        } finally {
            if (tournamentIdRef.current === id
                && requestAuthorityRef.current.isCurrent(requestLease)) {
                setLaneLoading('core', false);
            }
        }
    }, [anchorClock, online, setLaneError, setLaneLoading, signedIn]);

    const loadBracket = useCallback(async (offset = 0, signal) => {
        if (!tournamentId || !online) return;
        const id = tournamentId;
        const requestLease = requestAuthorityRef.current.begin('bracket');
        setLaneLoading('bracket', true);
        setLaneError('bracket', '');
        try {
            const payload = await nightlyRequest('bracket', { params: { tournamentId: id, round: bracketRound, offset, limit: BRACKET_PAGE_SIZE }, signal });
            if (tournamentIdRef.current !== id || !requestAuthorityRef.current.isCurrent(requestLease)) return;
            setBracket(payload);
        } catch (error) {
            if (error?.name !== 'AbortError'
                && tournamentIdRef.current === id
                && requestAuthorityRef.current.isCurrent(requestLease)) {
                setLaneError('bracket', displayError(error));
            }
        } finally {
            if (tournamentIdRef.current === id && requestAuthorityRef.current.isCurrent(requestLease)) {
                setLaneLoading('bracket', false);
            }
        }
    }, [bracketRound, online, setLaneError, setLaneLoading, tournamentId]);

    const loadField = useCallback(async (offset = 0, signal) => {
        if (!tournamentId || !online) return;
        const id = tournamentId;
        const requestLease = requestAuthorityRef.current.begin('field');
        setLaneLoading('field', true);
        setLaneError('field', '');
        try {
            const payload = await nightlyRequest('field', { params: { tournamentId: id, offset, limit: FIELD_PAGE_SIZE, q: fieldQuery.trim(), kind: fieldKind }, signal });
            if (tournamentIdRef.current !== id || !requestAuthorityRef.current.isCurrent(requestLease)) return;
            setField(payload);
        } catch (error) {
            if (error?.name !== 'AbortError'
                && tournamentIdRef.current === id
                && requestAuthorityRef.current.isCurrent(requestLease)) {
                setLaneError('field', displayError(error));
            }
        } finally {
            if (tournamentIdRef.current === id && requestAuthorityRef.current.isCurrent(requestLease)) {
                setLaneLoading('field', false);
            }
        }
    }, [fieldKind, fieldQuery, online, setLaneError, setLaneLoading, tournamentId]);

    const loadResults = useCallback(async (offset = 0, signal) => {
        if (!tournamentId || !online) return;
        const id = tournamentId;
        const requestLease = requestAuthorityRef.current.begin('results');
        setLaneLoading('results', true);
        setLaneError('results', '');
        try {
            const payload = await nightlyRequest('results', { params: { tournamentId: id, offset, limit: RESULTS_PAGE_SIZE }, signal });
            if (tournamentIdRef.current !== id || !requestAuthorityRef.current.isCurrent(requestLease)) return;
            setResults(payload);
        } catch (error) {
            if (error?.name !== 'AbortError'
                && tournamentIdRef.current === id
                && requestAuthorityRef.current.isCurrent(requestLease)) {
                setLaneError('results', displayError(error));
            }
        } finally {
            if (tournamentIdRef.current === id && requestAuthorityRef.current.isCurrent(requestLease)) {
                setLaneLoading('results', false);
            }
        }
    }, [online, setLaneError, setLaneLoading, tournamentId]);

    const loadReceipt = useCallback(async signal => {
        if (!tournamentId || !signedIn || !online) return;
        const id = tournamentId;
        const requestLease = requestAuthorityRef.current.begin('receipt');
        setLaneLoading('receipt', true);
        setLaneError('receipt', '');
        try {
            const payload = await nightlyRequest('receipt', { params: { tournamentId: id }, signal });
            if (tournamentIdRef.current !== id || !requestAuthorityRef.current.isCurrent(requestLease)) return;
            setReceipt(payload);
        } catch (error) {
            if (error?.name === 'AbortError'
                || tournamentIdRef.current !== id
                || !requestAuthorityRef.current.isCurrent(requestLease)) return;
            if (error?.code === 'not_entered') setReceipt(null);
            else setLaneError('receipt', displayError(error));
        } finally {
            if (tournamentIdRef.current === id && requestAuthorityRef.current.isCurrent(requestLease)) {
                setLaneLoading('receipt', false);
            }
        }
    }, [online, setLaneError, setLaneLoading, signedIn, tournamentId]);

    const loadHistory = useCallback(async (offset = 0, signal) => {
        if (!signedIn || !online) return;
        const requestLease = requestAuthorityRef.current.begin('history');
        setLaneLoading('history', true);
        setLaneError('history', '');
        try {
            const payload = await nightlyRequest('history', { params: { offset, limit: HISTORY_PAGE_SIZE }, signal });
            if (requestAuthorityRef.current.isCurrent(requestLease)) {
                setHistory({ ...payload, offset, limit: HISTORY_PAGE_SIZE });
            }
        } catch (error) {
            if (error?.name !== 'AbortError' && requestAuthorityRef.current.isCurrent(requestLease)) {
                setLaneError('history', displayError(error));
            }
        } finally {
            if (requestAuthorityRef.current.isCurrent(requestLease)) setLaneLoading('history', false);
        }
    }, [online, setLaneError, setLaneLoading, signedIn]);

    const openHistoricalReceipt = useCallback(async historicalTournamentId => {
        if (!historicalTournamentId || pending || !signedIn) return;
        if (!online) {
            setLaneError('history', tournamentErrorMessage('offline'));
            return;
        }
        const requestLease = requestAuthorityRef.current.begin('context');
        setPending('history-receipt');
        setLaneError('history', '');
        try {
            const [summaryPayload, receiptPayload, runPayload] = await Promise.all([
                nightlyRequest('summary', { params: { tournamentId: historicalTournamentId } }),
                nightlyRequest('receipt', { params: { tournamentId: historicalTournamentId } }),
                nightlyRequest('my-run', { params: { tournamentId: historicalTournamentId } })
                    .catch(error => ({ _error: error })),
            ]);
            if (!requestAuthorityRef.current.isCurrent(requestLease)) return;
            beginTournamentContext(historicalTournamentId, { skipCoreLoad: true });
            anchorClock(summaryPayload);
            setSummary(summaryPayload);
            setTournament(summaryPayload.tournament || null);
            const currentRound = Number(summaryPayload.currentRound || 1);
            if (currentRound > 0) setBracketRound(currentRound);
            setReceipt(receiptPayload);
            setLaneLoading('receipt', false);
            if (runPayload?._error) {
                setLaneError('core', displayError(runPayload._error));
            } else {
                anchorClock(runPayload);
                setMyRun(runPayload);
                if (runPayload.current?.matchupId) autoResumeRef.current.add(runPayload.current.matchupId);
            }
            setPageState('ready');
            setActiveTab('receipt');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (error) {
            if (error?.name !== 'AbortError' && requestAuthorityRef.current.isCurrent(requestLease)) {
                setLaneError('history', displayError(error));
            }
        } finally {
            if (requestAuthorityRef.current.isCurrent(requestLease)) setPending('');
        }
    }, [anchorClock, beginTournamentContext, online, pending, setLaneError, setLaneLoading, signedIn]);

    const bootstrap = useCallback(async signal => {
        const requestLease = requestAuthorityRef.current.begin('context');
        setPending(pendingAfterTournamentContextSupersession);
        if (!online) {
            setPageError(tournamentErrorMessage('offline'));
            setPageState('error');
            return;
        }
        setPageState('loading');
        setPageError('');
        try {
            await loadSchedule(signal, requestLease);
        } catch (error) {
            if (error?.name === 'AbortError' || !requestAuthorityRef.current.isCurrent(requestLease)) return;
            setPageError(displayError(error));
            setPageState('error');
        }
    }, [loadSchedule, online]);

    useEffect(() => {
        if (authLoading) return undefined;
        const controller = new AbortController();
        void bootstrap(controller.signal);
        return () => controller.abort();
    }, [authLoading, bootstrap]);

    useEffect(() => {
        if (!tournamentId || authLoading) return undefined;
        if (skipNextCoreLoadRef.current === tournamentId) {
            skipNextCoreLoadRef.current = null;
            return undefined;
        }
        const controller = new AbortController();
        void loadCore(tournamentId, { signal: controller.signal });
        return () => controller.abort();
    }, [authLoading, loadCore, tournamentId]);

    useEffect(() => {
        if (!tournamentId || pageState !== 'ready') return undefined;
        const controller = new AbortController();
        void loadBracket(0, controller.signal);
        return () => controller.abort();
    }, [bracketRound, loadBracket, pageState, tournamentId]);

    useEffect(() => {
        const controller = new AbortController();
        if (activeTab === 'field' && !field) void loadField(0, controller.signal);
        if (activeTab === 'results' && !results) void loadResults(0, controller.signal);
        if (activeTab === 'receipt' && signedIn && !receipt) void loadReceipt(controller.signal);
        if (activeTab === 'history' && signedIn && !history) void loadHistory(0, controller.signal);
        return () => controller.abort();
    }, [activeTab, field, history, loadField, loadHistory, loadReceipt, loadResults, receipt, results, signedIn]);

    useEffect(() => {
        if (!signedIn || !myRun?.entered) return undefined;
        if (!['settled', 'settling', 'cancelled'].includes(tournament?.state) && activeTab !== 'receipt') return undefined;
        const controller = new AbortController();
        void loadReceipt(controller.signal);
        return () => controller.abort();
    }, [activeTab, loadReceipt, myRun?.entered, signedIn, tournament?.state]);

    useEffect(() => {
        if (!tournamentId || pageState !== 'ready' || !online) return undefined;
        let stopped = false;
        let timer = null;
        const controller = new AbortController();
        const activeRun = Boolean(myRun?.current);
        const activeEvent = ['held', 'live', 'settling'].includes(tournament?.state);
        const delay = activeRun ? 3000 : activeEvent ? 8000 : 45000;
        const poll = async () => {
            await loadCore(tournamentId, { quiet: true, signal: controller.signal });
            if (!stopped && (activeTab === 'bracket' || activeEvent)) {
                await loadBracket(bracket?.offset || 0, controller.signal);
            }
            if (!stopped) timer = window.setTimeout(poll, delay);
        };
        timer = window.setTimeout(poll, delay);
        return () => {
            stopped = true;
            controller.abort();
            if (timer) window.clearTimeout(timer);
        };
    }, [activeTab, bracket?.offset, loadBracket, loadCore, myRun?.current, online, pageState, tournament?.state, tournamentId]);

    const hydrateSession = useCallback(async (sessionDto, actionLease) => {
        if (!canAdoptTournamentAction(actionLease)) return false;
        setSession(sessionDto);
        setPlayError('');
        const alreadyOpen = firstOpenQuestion(sessionDto);
        if (alreadyOpen) {
            // A successful server view is the authority after an unknown answer
            // outcome. Re-enable the same unanswered question and re-arm its
            // timeout submission; answerNonceRef deliberately stays intact so
            // the retry keeps the original operation identity.
            setSelectedAnswer(null);
            timeoutSentRef.current = null;
            setActiveQuestion(alreadyOpen);
            journeyTrackerRef.current.track('nightly_tournament', 'play', {
                source: 'nightly_tournament',
                action: 'resume_play',
                state: 'playing',
            });
            return true;
        }
        const nextPosition = nextLockedPosition(sessionDto);
        if (nextPosition === null) {
            setActiveQuestion(null);
            await loadCore(actionLease.tournamentId, { quiet: true });
            return canAdoptTournamentAction(actionLease);
        }
        const opened = await nightlyRequest('play', {
            method: 'POST',
            body: { tournamentId: actionLease.tournamentId, action: 'question', position: nextPosition },
        });
        if (!canAdoptTournamentAction(actionLease)) return false;
        const merged = mergeOpenedQuestion(sessionDto, opened.question);
        setSession(merged);
        setActiveQuestion(opened.question);
        if (firstOpenQuestion(merged)) {
            journeyTrackerRef.current.track('nightly_tournament', 'play', {
                source: 'nightly_tournament',
                action: 'open_play',
                state: 'playing',
            });
        }
        return true;
    }, [canAdoptTournamentAction, loadCore]);

    const openOrResume = useCallback(async action => {
        if (!tournamentId || pending) return;
        const actionLease = beginTournamentAction();
        setPending(action === 'view' ? 'resume' : 'play');
        setPlayError('');
        try {
            journeyTrackerRef.current.track('nightly_tournament', 'intent', {
                source: 'nightly_tournament',
                action: action === 'view' ? 'resume_play' : 'open_play',
                state: action === 'view' ? 'resume' : 'ready',
            });
            const payload = await nightlyRequest('play', {
                method: 'POST',
                body: { tournamentId: actionLease.tournamentId, action },
            });
            if (!canAdoptTournamentAction(actionLease)) return;
            if (payload.seat_finished) {
                setSession(null);
                setActiveQuestion(null);
                await loadCore(actionLease.tournamentId, { quiet: true });
                return;
            }
            const adopted = await hydrateSession(payload.session || payload, actionLease);
            if (adopted && canAdoptTournamentAction(actionLease)) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        } catch (error) {
            if (!canAdoptTournamentAction(actionLease)) return;
            const message = displayError(error);
            if (action === 'view' && error?.code === 'no_session') setPlayError('No Open Session Was Found. Open The Round To Begin.');
            else if (error?.code === 'round_not_open' && error?.body?.opensAt) {
                setPlayError(`The Server Round Opens In ${Math.max(0, secondsUntil(error.body.opensAt, nowMs) || 0)} Seconds.`);
            } else setPlayError(message);
        } finally {
            if (canAdoptTournamentAction(actionLease)) setPending('');
        }
    }, [beginTournamentAction, canAdoptTournamentAction, hydrateSession, loadCore, nowMs, pending, tournamentId]);

    useEffect(() => {
        const matchupId = myRun?.current?.matchupId;
        if (!matchupId || myRun.current.phase !== 'playing' || session || autoResumeRef.current.has(matchupId)) return;
        autoResumeRef.current.add(matchupId);
        void openOrResume('view');
    }, [myRun, openOrResume, session]);

    const enterTournament = useCallback(async () => {
        if (!tournamentId || pending) return;
        if (!signedIn) {
            void router.push(`/auth/login?redirect=${encodeURIComponent(PAGE_PATH)}`);
            return;
        }
        const actionLease = beginTournamentAction();
        setPending('enter');
        try {
            journeyTrackerRef.current.track('nightly_tournament', 'intent', {
                source: 'nightly_tournament',
                action: 'enter',
                state: 'ready',
            });
            await nightlyRequest('enter', {
                method: 'POST',
                body: {
                    tournamentId: actionLease.tournamentId,
                    clientNonce: entryNonce(actionLease.tournamentId),
                },
            });
            if (!canAdoptTournamentAction(actionLease)) return;
            await loadCore(actionLease.tournamentId, { quiet: true });
            if (!canAdoptTournamentAction(actionLease)) return;
            await loadReceipt();
            if (canAdoptTournamentAction(actionLease)) setActiveTab('run');
        } catch (error) {
            if (canAdoptTournamentAction(actionLease)) {
                setDialogError({ code: error?.code || 'internal_error', message: displayError(error) });
            }
        } finally {
            if (canAdoptTournamentAction(actionLease)) setPending('');
        }
    }, [beginTournamentAction, canAdoptTournamentAction, loadCore, loadReceipt, pending, router, signedIn, tournamentId]);

    const refreshSession = useCallback(async () => {
        if (!tournamentId || pending) return;
        const actionLease = beginTournamentAction();
        setPending('resume');
        setPlayError('');
        try {
            const payload = await nightlyRequest('play', {
                method: 'POST',
                body: { tournamentId: actionLease.tournamentId, action: 'view' },
            });
            if (!canAdoptTournamentAction(actionLease)) return;
            await hydrateSession(payload, actionLease);
        } catch (error) {
            if (!canAdoptTournamentAction(actionLease)) return;
            setPlayError(displayError(error));
            setSession(null);
            setActiveQuestion(null);
            await loadCore(actionLease.tournamentId, { quiet: true });
        } finally {
            if (canAdoptTournamentAction(actionLease)) setPending('');
        }
    }, [beginTournamentAction, canAdoptTournamentAction, hydrateSession, loadCore, pending, tournamentId]);

    const submitAnswer = useCallback(async displayIndex => {
        if (!tournamentId || !activeQuestion?.id || pending) return;
        const actionLease = beginTournamentAction();
        const questionId = activeQuestion.id;
        setSelectedAnswer(displayIndex);
        setPending('answer');
        setPlayError('');
        const attemptKey = questionId;
        let nonce = answerNonceRef.current.get(attemptKey);
        if (!nonce) {
            nonce = createUuid();
            answerNonceRef.current.set(attemptKey, nonce);
        }
        try {
            const payload = await nightlyRequest('play', {
                method: 'POST',
                body: {
                    tournamentId: actionLease.tournamentId,
                    action: 'answer',
                    questionId,
                    displayIndex,
                    clientNonce: nonce,
                },
            });
            if (!canAdoptTournamentAction(actionLease)) return;
            setSelectedAnswer(null);
            if (payload.seat_finished) {
                setSession(null);
                setActiveQuestion(null);
                await loadCore(actionLease.tournamentId, { quiet: true });
            } else {
                const view = await nightlyRequest('play', {
                    method: 'POST',
                    body: { tournamentId: actionLease.tournamentId, action: 'view' },
                });
                if (!canAdoptTournamentAction(actionLease)) return;
                await hydrateSession(view, actionLease);
            }
        } catch (error) {
            if (!canAdoptTournamentAction(actionLease)) return;
            setPlayError(displayError(error));
            if (['answer_late', 'position_out_of_order', 'question_not_open', 'session_closed', 'session_expired'].includes(error?.code)) {
                setSelectedAnswer(null);
            }
        } finally {
            if (canAdoptTournamentAction(actionLease)) setPending('');
        }
    }, [activeQuestion, beginTournamentAction, canAdoptTournamentAction, hydrateSession, loadCore, pending, tournamentId]);

    const finishRound = useCallback(async () => {
        if (!tournamentId || pending) return;
        const actionLease = beginTournamentAction();
        setPending('finish');
        setPlayError('');
        try {
            await nightlyRequest('play', {
                method: 'POST',
                body: { tournamentId: actionLease.tournamentId, action: 'finish' },
            });
            if (!canAdoptTournamentAction(actionLease)) return;
            setSession(null);
            setActiveQuestion(null);
            await loadCore(actionLease.tournamentId, { quiet: true });
        } catch (error) {
            if (canAdoptTournamentAction(actionLease)) setPlayError(displayError(error));
        } finally {
            if (canAdoptTournamentAction(actionLease)) setPending('');
        }
    }, [beginTournamentAction, canAdoptTournamentAction, loadCore, pending, tournamentId]);

    const questionSeconds = useMemo(() => secondsUntil(activeQuestion?.deadlineAt, nowMs), [activeQuestion?.deadlineAt, nowMs]);
    useEffect(() => {
        if (!activeQuestion?.id || questionSeconds !== 0 || pending || timeoutSentRef.current === activeQuestion.id) return;
        timeoutSentRef.current = activeQuestion.id;
        void submitAnswer(-1);
    }, [activeQuestion?.id, pending, questionSeconds, submitAnswer]);
    useEffect(() => {
        setSelectedAnswer(null);
        timeoutSentRef.current = null;
    }, [activeQuestion?.id]);

    const signIn = useCallback(() => {
        void router.push(`/auth/login?redirect=${encodeURIComponent(PAGE_PATH)}`);
    }, [router]);

    const selectRound = useCallback(round => {
        bracketTouchedRef.current = true;
        setBracketRound(round);
        setBracket(null);
        setBracketQuery('');
    }, []);

    const viewState = tournamentViewState({ tournament, myRun, receipt, session, nowMs });
    const title = tournament?.name || 'Nightly Trivia Tournament';
    const entryDialogAction = tournamentEntryDialogAction(dialogError?.code);
    const terminalDialog = entryDialogAction === 'diamonds';
    const dialogPrimaryAction = entryDialogAction === 'diamonds'
        ? { label: 'Get Diamonds', onClick: () => router.push('/hub/diamond-store') }
        : entryDialogAction === 'retry'
            ? { label: 'Retry Entry', onClick: () => { setDialogError(null); void enterTournament(); } }
            : undefined;

    function renderCenterPane() {
        if (activeTab === 'field') {
            return <TournamentFieldList field={field} loading={loading.field} error={errors.field} query={fieldQuery} kind={fieldKind} onQuery={setFieldQuery} onKind={setFieldKind} onSearch={() => loadField(0)} onPage={offset => loadField(offset)} onRetry={() => loadField(field?.offset || 0)} />;
        }
        if (activeTab === 'results') {
            return <TournamentResults results={results} summary={summary} loading={loading.results} error={errors.results} onPage={offset => loadResults(offset)} onRetry={() => loadResults(results?.offset || 0)} />;
        }
        if (activeTab === 'receipt') {
            return <TournamentReceipt receipt={receipt} loading={loading.receipt} error={errors.receipt} signedIn={signedIn} onSignIn={signIn} onRetry={() => loadReceipt()} />;
        }
        if (activeTab === 'history') {
            return <TournamentHistory history={history} loading={loading.history} error={errors.history} signedIn={signedIn} pending={pending === 'history-receipt'} onSignIn={signIn} onOpenReceipt={openHistoricalReceipt} onPage={offset => loadHistory(offset)} onRetry={() => loadHistory(history?.offset || 0)} />;
        }
        return <TournamentBracketViewport bracket={bracket} summary={summary} myRun={myRun} loading={loading.bracket} error={errors.bracket} round={bracketRound} query={bracketQuery} onQuery={setBracketQuery} onRound={selectRound} onPage={offset => loadBracket(offset)} onRetry={() => loadBracket(bracket?.offset || 0)} />;
    }

    return (
        <TriviaErrorBoundary pageName="Tournaments">
            <PageTransition>
                <SEOHead
                    title="Nightly Trivia Tournament"
                    description="The Smarter.Poker Nightly Trivia Tournament Starts At 8 PM Central With Server-Timed Rounds, Disclosed Smarter Horses, Exact Diamond Terms, And Verifiable Settlement Receipts."
                    canonical={PAGE_PATH}
                />
                <div className="trivia-console-standalone trivia-tournaments-page" data-trivia-surface="tournaments" data-game-state={activeQuestion ? 'playing' : viewState}>
                    <UniversalHeader pageDepth={2} />
                    <main className="tt-shell" aria-labelledby="trivia-tournaments-title">
                        {pageState === 'loading' ? (
                            <TriviaConsole eyebrow="Nightly Bracket" title="Trivia Tournament" titleAs="h1" titleId="trivia-tournaments-title" subtitle="8 PM Central Every Night" pill="Loading" pillInk="muted">
                                <TournamentStateBanner title="Opening Tournament Desk" message="Reading The Official Schedule And Your Active Run." tone="muted" />
                            </TriviaConsole>
                        ) : null}

                        {pageState === 'error' ? (
                            <TriviaConsole
                                eyebrow="Nightly Bracket"
                                title="Tournament Unavailable"
                                titleAs="h1"
                                titleId="trivia-tournaments-title"
                                subtitle="No Entry Was Changed"
                                pill={online ? 'Retry' : 'Offline'}
                                pillInk="red"
                                secondaryAction={{ label: 'Back To Trivia', onClick: () => router.push('/hub/trivia') }}
                                primaryAction={{ label: 'Retry', onClick: () => bootstrap() }}
                            >
                                <TournamentStateBanner title={online ? 'Tournament Desk Did Not Answer' : 'Reconnect To Resume'} message={pageError} tone="red" role="alert" />
                            </TriviaConsole>
                        ) : null}

                        {pageState === 'ready' && !tournament ? (
                            <TriviaConsole
                                eyebrow="Nightly Bracket"
                                title="No Tournament Published"
                                titleAs="h1"
                                titleId="trivia-tournaments-title"
                                subtitle="8 PM Central Every Night"
                                pill="No Event"
                                pillInk="muted"
                                primaryAction={{ label: 'Refresh Schedule', onClick: () => bootstrap() }}
                            >
                                <ResponsiveModeArt art={TRIVIA_INTRO_ART_TOURNAMENTS} priority />
                                <TournamentStateBanner title="No Event In This Schedule Window" message="The Server Has Not Published A Nightly Tournament Yet. No Entry Or Diamond Hold Was Created." tone="muted" />
                            </TriviaConsole>
                        ) : null}

                        {pageState === 'ready' && tournament && activeQuestion ? (
                            <TriviaConsole
                                eyebrow="Nightly Tournament"
                                title={`Round ${myRun?.current?.roundNumber || summary?.currentRound || 1}`}
                                titleAs="h1"
                                titleId="trivia-tournaments-title"
                                subtitle={`Question ${activeQuestion.position} Of ${session?.questionCount || tournament.format?.questionsPerRound || ''}`}
                                pill={Number.isFinite(questionSeconds) ? `${questionSeconds} Sec` : 'Server Time'}
                                pillInk={Number.isFinite(questionSeconds) && questionSeconds <= 5 ? 'red' : 'gold'}
                            >
                                {!online ? <TournamentStateBanner title="Connection Lost" message="Your Answer State Remains On The Server. Reconnect And Resume Before Sending Another Action." tone="red" role="alert" /> : null}
                                <TournamentQuestionStage
                                    session={session}
                                    question={activeQuestion}
                                    secondsLeft={questionSeconds}
                                    selected={selectedAnswer}
                                    pending={Boolean(pending)}
                                    error={playError}
                                    onAnswer={submitAnswer}
                                    onSkip={() => submitAnswer(-1)}
                                    onFinish={finishRound}
                                    onRetry={refreshSession}
                                />
                            </TriviaConsole>
                        ) : null}

                        {pageState === 'ready' && tournament && !activeQuestion ? (
                            <TriviaConsole
                                eyebrow="8 PM CT Nightly"
                                title={title}
                                titleAs="h1"
                                titleId="trivia-tournaments-title"
                                subtitle="Server-Timed Single Elimination"
                                pill={viewState.replace(/-/g, ' ')}
                                pillInk={['open', 'entered', 'advance', 'champion', 'paid', 'refunded'].includes(viewState) ? 'green' : ['cancelled', 'refund', 'eliminated'].includes(viewState) ? 'red' : ['countdown', 'waiting', 'settling'].includes(viewState) ? 'gold' : 'blue'}
                            >
                                {!myRun?.entered && !tournament.viewer?.entered ? <ResponsiveModeArt art={TRIVIA_INTRO_ART_TOURNAMENTS} priority /> : null}
                                {!online ? <TournamentStateBanner title="Connection Lost" message="Displayed Tournament Data May Be Stale. Reconnect Before Entering Or Playing." tone="red" role="alert" /> : null}
                                {errors.core ? <TournamentStateBanner title="Run Refresh Delayed" message={errors.core} tone="red" role="alert" action={{ label: 'Retry Run', onClick: () => loadCore(tournamentId, { quiet: true }) }} /> : null}
                                {playError ? <TournamentStateBanner title="Round Not Opened" message={playError} tone="red" role="alert" action={{ label: 'Retry From Server', onClick: refreshSession }} /> : null}
                                <div className="tt-console-grid" data-active-tab={activeTab}>
                                    <TournamentEventLedger tournament={tournament} summary={summary} nowMs={nowMs} onReminder={() => downloadCalendarReminder(tournament)} />
                                    <TournamentTabs value={activeTab} onChange={setActiveTab} />
                                    <div className="tt-center">{renderCenterPane()}</div>
                                    <TournamentMyRun
                                        tournament={tournament}
                                        myRun={myRun}
                                        receipt={receipt}
                                        currentMatch={currentMatch}
                                        nowMs={nowMs}
                                        signedIn={signedIn}
                                        pending={pending}
                                        onEnter={enterTournament}
                                        onSignIn={signIn}
                                        onPlay={() => openOrResume('open')}
                                        onResume={() => openOrResume('view')}
                                    />
                                </div>
                            </TriviaConsole>
                        ) : null}
                    </main>
                </div>
                <TriviaConsoleDialog
                    open={Boolean(dialogError)}
                    onClose={() => setDialogError(null)}
                    eyebrow="Nightly Tournament"
                    title={terminalDialog ? 'Not Enough Diamonds' : 'Entry Not Completed'}
                    pill="No Charge"
                    pillInk="red"
                    secondaryAction={{ label: 'Close', onClick: () => setDialogError(null) }}
                    primaryAction={dialogPrimaryAction}
                >
                    <p className="trivia-console-copy tc-ink--red" role="alert">{dialogError?.message}</p>
                    <p className="trivia-console-copy tc-ink--muted">A Failed Or Duplicate Request Never Creates A Second Tournament Charge.</p>
                </TriviaConsoleDialog>
            </PageTransition>
            <HubPageSummary page="trivia-tournaments" />
        </TriviaErrorBoundary>
    );
}

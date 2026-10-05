/**
 * STRATEGY TRIVIA MODE - Shared component for MTT, Cash, ICM, GTO modes
 *
 * SERVER-AUTHORITATIVE RUNS: /api/trivia/session-start deals (and permutes)
 * the questions, session-answer grades each tap under the binding
 * first-answer rule, and session-submit caps and pays through a locked RPC.
 * The client never receives an answer key, never grades, and never credits
 * diamonds - the direct browser-side balance-credit RPC this component used
 * to settle through lost authenticated EXECUTE on 2026-08-03 (migration
 * 20260803140000), so every reward silently failed while the entry fee
 * still charged.
 */

import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../src/lib/supabase';
import { busEmit } from '../../../src/engine/EventBus';
import { getAccessToken, getAuthUser } from '../../../src/lib/authUtils';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import {
    calculateDiamonds,
    DAILY_DIAMOND_CAPS,
    TRIVIA_MODES,
    getModeConfig,
    getCategoryName,
} from '../../../src/lib/trivia/triviaEngine';
import useServerGradedRun from '../../../src/hooks/useServerGradedRun';
import { toTitleCase } from '../../../src/lib/trivia/titleCase';
import { formatTriviaDisplayNumber } from '../../lib/trivia/formatTriviaDisplayNumber';
import GTOScenarioDisplay from './GTOScenarioDisplay';
import ReportQuestionButton from './ReportQuestionButton';
import TriviaSkeleton from './TriviaSkeleton';
import TriviaConsole from './console/TriviaConsole';
import TriviaConsoleDialog from './console/TriviaConsoleDialog';
import ResponsiveModeArt from './console/ResponsiveModeArt';
import { TRIVIA_INTRO_ART_CASH, TRIVIA_INTRO_ART_GTO, TRIVIA_INTRO_ART_ICM, TRIVIA_INTRO_ART_MTT } from '../../config/triviaIntroArt.mjs';
import {
    buildStrategyQuestionContext,
    readStrategySolverMetadata,
    strategyQuestionIntegrity,
    strategyResumeProgress,
} from './strategyExperienceModel.mjs';
import { createSoloJourneyTracker } from '../../lib/trivia/soloJourneyAnalytics.mjs';
import {
    createAccountOperationScope,
    isStaleAccountOperation,
} from '../../lib/trivia/accountOperationScope.mjs';

/** Format poker text: enforce BB/SB spacing and capitalization rules */
function formatPokerText(text) {
    if (!text) return text;
    return text
        // Normalize "31 BB" / "31bb" -> "31BB" (compact form, no space).
        // The old comment claimed it ADDED a space and gave "31BB -> 31BB"
        // as the example, which contradicted the replacement below.
        .replace(/(\d+)\s*(BB|bb|Bb|bB)/g, '$1BB')
        // Capitalize poker position abbreviations
        .replace(/\b(btn|Btn)\b/gi, 'BTN')
        .replace(/\b(sb|Sb|sB)\b/g, 'SB')
        .replace(/\b(utg|Utg)\b/gi, 'UTG')
        .replace(/\b(hj|Hj)\b/gi, 'HJ')
        .replace(/\b(co|Co)\b/g, 'CO')
        .replace(/\b(mp|Mp)\b/g, 'MP')
        .replace(/\bip\b/gi, 'IP')
        .replace(/\boop\b/gi, 'OOP')
        // Hyphenated blind terms
        .replace(/\bbig[- ]blind\b/gi, 'Big-Blind')
        .replace(/\bsmall[- ]blind\b/gi, 'Small-Blind');
}
import DiamondEngine from '../../services/DiamondEngine';
import useVIP from '../../hooks/useVIP';
import { readOwnProfile } from '../../lib/ownProfile';

/**
 * Entry price for the strategy modes.
 *
 * TRIVIA_MODES is the single source of truth for entry cost. It now declares
 * diamondCost: 10 for mtt/cash/icm/gto, so the local
 * STRATEGY_ENTRY_COST_FALLBACK that used to live here is gone — the lobby's
 * advertised price, the direct-URL price and the actual charge all read the
 * same field and cannot drift apart.
 */
function getEntryCost(mode) {
    const configured = getModeConfig(mode)?.diamondCost;
    return Number.isFinite(configured) && configured > 0 ? configured : 0;
}

const QUESTIONS_PER_GAME = 20;

// Strategy mode configuration - display only. The question draw itself is
// server-side: /api/trivia/session-start resolves each mode through
// CATEGORY_MAPPINGS in triviaEngine.ts (gto spans five categories there,
// including gto_scenarios, which the old client-side list here was missing).
// Keeping a second category list in this file would just let the two drift.
const STRATEGY_MODES = {
    mtt: {
        title: 'MTT Scenarios',
        subtitle: 'Tournament Situations',
        station: 'Tournament Decision Room',
        description: 'Read The Blind Level, Stack Pressure, Position And Payout Stage Before You Commit To A Tournament Line.'
    },
    cash: {
        title: 'Cash Game',
        subtitle: 'Deep Stack Scenarios',
        station: 'High-Limit Cash Room',
        description: 'Work Through Real Cash-Table Decisions With Stakes, Effective Stack, Position, Street And Pot Context In View.'
    },
    icm: {
        title: 'ICM & Chip EV',
        subtitle: 'Equity Decisions',
        station: 'Tournament Equity Desk',
        description: 'Separate Chips Gained From Payout Equity Gained, Then Choose The Line That Fits The Actual Tournament Pressure.'
    },
    gto: {
        title: 'GTO Master',
        subtitle: 'Solver-Based Spots',
        station: 'Solver Analysis Booth',
        description: 'Lock Your Decision First, Then Read The Server-Released Frequency Mix, Range Distribution And EV Without Invented Solver Numbers.'
    }
};

// Each table's own destination art (intro-v1), distinct from its lobby
// thumbnail: a picture on the glass, every changing value printed beside it.
const MODE_ART = {
    mtt: TRIVIA_INTRO_ART_MTT,
    cash: TRIVIA_INTRO_ART_CASH,
    icm: TRIVIA_INTRO_ART_ICM,
    gto: TRIVIA_INTRO_ART_GTO,
};

// ════════════════════════════════════════════════
// Graphic Playing Card Renderer
// ════════════════════════════════════════════════
function PlayingCard({ card, size = 'inline' }) {
    if (!card) return null;

    const suit = card[card.length - 1]?.toLowerCase();
    const rank = card.slice(0, -1)?.toUpperCase();
    const SUIT_CONFIG = {
        s: { file: 'spades', label: 'Spades' },
        h: { file: 'hearts', label: 'Hearts' },
        d: { file: 'diamonds', label: 'Diamonds' },
        c: { file: 'clubs', label: 'Clubs' },
    };
    const config = SUIT_CONFIG[suit] || SUIT_CONFIG.s;

    const sizes = {
        inline: { width: 18, height: 26 },
        small: { width: 36, height: 50 },
        medium: { width: 52, height: 72 },
        large: { width: 68, height: 94 },
    };
    const s = sizes[size] || sizes.inline;
    const fileRank = rank === 'T' ? '10' : rank.toLowerCase();

    return (
        <img
            className="strategy-playing-card"
            src={`/cards/optimized/${config.file}_${fileRank}.png`}
            alt={`${rank} Of ${config.label}`}
            width={s.width}
            height={s.height}
            loading="lazy"
            decoding="async"
        />
    );
}

/**
 * Render poker card notation (Ah, Ks, 10d, 4c) as graphic cards.
 *
 * Two bugs fixed here:
 *  1. The regex carried the /i flag, so ordinary English matched: "as", "ah",
 *     "ad", "ac" all became playing cards. Canonical notation is an UPPERCASE
 *     rank plus a LOWERCASE suit, so the flag is gone.
 *  2. The pipeline title-cased FIRST, which manufactured "As" out of every
 *     mid-sentence "as" and then matched it. Matching now runs on the raw
 *     string and the caller's text transform (toTitleCase) is applied to the
 *     non-card fragments only.
 *
 * A lone letter-ranked token ("As", "Ad") is still ambiguous with English, so
 * letter ranks only render as a card when they sit next to another card token
 * ("AhKs", "Ah Ks 7d"). Digit ranks ("7d", "10c") are unambiguous and always
 * render. Worst case a real card renders as plain text — never the reverse.
 *
 * @param {string} text
 * @param {(s: string) => string} [transform] applied to non-card fragments
 */
function renderTextWithCards(text, transform) {
    if (!text) return null;
    const apply = typeof transform === 'function' ? transform : (s => s);
    const cardRegex = /\b(10|[2-9]|[TJQKA])([shdc])\b/g;

    const matches = [];
    let m;
    while ((m = cardRegex.exec(text)) !== null) {
        matches.push({ start: m.index, end: m.index + m[0].length, rank: m[1], suit: m[2] });
    }
    if (matches.length === 0) return apply(text);

    // A letter-ranked token counts only when it neighbours another candidate
    // (allowing at most one space between, e.g. "Ah Ks 7d").
    const isDigitRank = r => /^(10|[2-9])$/.test(r);
    const keep = matches.map((cur, i) => {
        if (isDigitRank(cur.rank)) return true;
        const prev = matches[i - 1];
        const next = matches[i + 1];
        const adjacent = (a, b) => a && b && (b.start - a.end) <= 1;
        return adjacent(prev, cur) || adjacent(cur, next);
    });

    const result = [];
    let cursor = 0;
    matches.forEach((match, i) => {
        if (!keep[i]) return;
        if (match.start > cursor) result.push(apply(text.slice(cursor, match.start)));
        result.push(
            <PlayingCard key={`c${match.start}`} card={`${match.rank}${match.suit}`} size="inline" />
        );
        cursor = match.end;
    });
    if (cursor < text.length) result.push(apply(text.slice(cursor)));
    return result;
}

export default function StrategyTrivia({ mode }) {
    const router = useRouter();
    const config = STRATEGY_MODES[mode] || STRATEGY_MODES.mtt;
    const soloJourneyTrackerRef = useRef(null);
    if (!soloJourneyTrackerRef.current) soloJourneyTrackerRef.current = createSoloJourneyTracker();
    const soloRunLifecycleRef = useRef({ active: false, settled: false, mode, state: 'playing' });
    const resumeRetryRef = useRef(false);

    useEffect(() => () => {
        const lifecycle = soloRunLifecycleRef.current;
        if (lifecycle.active && !lifecycle.settled) {
            soloJourneyTrackerRef.current.track(lifecycle.mode, 'abandon', {
                surface: 'strategy',
                abandon_state: lifecycle.state === 'settling' ? 'settling' : 'playing',
            });
        }
    }, []);

    // ═══════════════════════════════════════════════════════════════
    // HARDENED: Source VIP status from centralized useVIP hook
    // (server-verified via AvatarContext → /api/vip/check-status)
    // instead of independently calling DiamondEngine.isVIP()
    // ═══════════════════════════════════════════════════════════════
    const { isVip, userId: vipUserId, initializing: vipInitializing } = useVIP();
    // Reactive auth — was empty-deps useEffect with getAuthUser(). If auth
    // wasn't hydrated when the component first mounted (common during cold
    // SSR-hydration), localUserId stayed null forever and the user got an
    // anon flow even after login. Drives the init useEffect.
    const { user: avatarUser, loading: avatarLoading } = useAvatar();

    // Game state
    const [gameState, setGameState] = useState('lobby'); // lobby, playing, results
    const [showOutOfDiamonds, setShowOutOfDiamonds] = useState(false);
    const [questions, setQuestions] = useState([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [showResult, setShowResult] = useState(false);
    const [correctCount, setCorrectCount] = useState(0);

    // Current question's server verdict (wasCorrect / correctDisplayIndex /
    // explanation); null until session-answer resolves, cleared on advance.
    // The whole reveal is driven from this.
    const [verdict, setVerdict] = useState(null);
    const [answerPending, setAnswerPending] = useState(false);
    const [answerFailure, setAnswerFailure] = useState(null);
    // Locks taps from the moment of the tap until the question advances, so a
    // slow session-answer round-trip cannot accept a second answer.
    const answerLockRef = useRef(false);
    // Server settlement result, kept in a ref so a settlement retry re-uses
    // the already-paid result instead of re-submitting a closed session.
    const serverResultRef = useRef(null);

    // NOTE: the 50/50 and Skip lifelines are gone with the move to server
    // grading. 50/50 needs the answer key the client no longer receives. Skip
    // survived on endless/survival because their payout is per-correct and an
    // omitted question costs nothing there - but these modes are graded on
    // accuracy over the FULL served roster, so a server-scored skip counts as
    // unanswered (wrong). Charging 5 diamonds for an action strictly worse
    // than guessing is not defensible, so Skip is removed rather than
    // recharged through DiamondEngine.

    // Phase 68: actually-awarded amount + error message, surfaced from
    // finishGame to the results screen so the displayed diamonds match
    // reality when settlement fails (was always showing the calculated
    // amount even when the balance never moved).
    const [resultActualAwarded, setResultActualAwarded] = useState(null);
    const [resultAwardError, setResultAwardError] = useState(null);
    // Final tally for the results screen: server-graded correct / total.
    const [resultSummary, setResultSummary] = useState(null);
    const [resultCapped, setResultCapped] = useState(false);
    const [settlementReceipt, setSettlementReceipt] = useState(null);
    const [settlementReplayed, setSettlementReplayed] = useState(false);
    const [balanceRefreshDelayed, setBalanceRefreshDelayed] = useState(false);
    const [entryReceipt, setEntryReceipt] = useState(null);
    // Entry-flow error (session-start failure, signed-out, etc.)
    const [entryError, setEntryError] = useState(null);
    const [isPreparing, setIsPreparing] = useState(false);
    const [resumeNotice, setResumeNotice] = useState(null);
    const [isOnline, setIsOnline] = useState(true);
    const [runContract, setRunContract] = useState(null);
    const [runExpiresAt, setRunExpiresAt] = useState(null);
    const [timerSeconds, setTimerSeconds] = useState(null);

    // User data — userId from useVIP, fallback to getAuthUser
    const [localUserId, setLocalUserId] = useState(null);
    const authIdentityRef = useRef(null);
    const accountOperationScopeRef = useRef(null);
    if (!accountOperationScopeRef.current) {
        accountOperationScopeRef.current = createAccountOperationScope();
    }
    const userId = avatarLoading
        ? (vipUserId || localUserId)
        : (avatarUser?.id || getAuthUser()?.id || null);
    if (!avatarLoading) accountOperationScopeRef.current.transition(userId);
    const [userDiamonds, setUserDiamonds] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    // Server-authoritative run: session-start deals (and permutes) the
    // questions, session-answer grades each tap, session-submit caps and
    // pays. The durable adapter scopes recovery to this account and resolves
    // a fresh token for every request, so auth rotation and reload do not
    // orphan a charged run.
    const serverRun = useServerGradedRun(mode, {
        accountId: userId,
        accessTokenProvider: getAccessToken,
    });

    useEffect(() => {
        if (gameState === 'results' && settlementReceipt?.sessionId) {
            serverRun.acknowledgeSettlement();
        }
    }, [gameState, settlementReceipt?.sessionId, serverRun.acknowledgeSettlement]);

    const isStartingRef = useRef(false); // Prevent double-click race
    const startOperationRef = useRef(null);
    const answerOperationRef = useRef(null);
    // Per question index: { questionId, displayIndex } as recorded through
    // session-answer at tap time. This is what session-submit grades from;
    // questions that never reached session-answer are filled in as -1
    // (unanswered) at submit, which the server scores as wrong.
    const answersRef = useRef([]);

    const finishedRef = useRef(false);      // finishGame runs at most once per game
    const advanceLockRef = useRef(false);   // Next button double-click guard
    const gameSurfaceRef = useRef(null);
    const questionHeadingRef = useRef(null);
    const timedOutQuestionRef = useRef(null);

    // Entry price for this mode (config first, see getEntryCost).
    const entryCost = getEntryCost(mode);

    const currentQuestion = questions[currentQuestionIndex];
    const currentQuestionId = typeof currentQuestion?.id === 'string' && currentQuestion.id
        ? currentQuestion.id
        : null;
    const currentQuestionIntegrity = strategyQuestionIntegrity(currentQuestion);
    const currentContext = buildStrategyQuestionContext(mode, currentQuestion);
    const contractTimer = runContract?.timer && typeof runContract.timer === 'object'
        ? runContract.timer
        : null;
    const timerDeadline = currentQuestion?.deadlineAt
        || currentQuestion?.deadline_at
        || contractTimer?.deadlineAt
        || contractTimer?.deadline_at
        || null;
    const timerDeadlineMs = typeof timerDeadline === 'string' || typeof timerDeadline === 'number'
        ? Date.parse(String(timerDeadline))
        : NaN;
    const hasAuthoritativeShotClock = contractTimer?.kind === 'shot_clock'
        && Number.isFinite(timerDeadlineMs);

    // Initialize. Re-runs on auth resolution so the user is properly wired up
    // even if AvatarContext was still loading on first render.
    useEffect(() => {
        if (avatarLoading) return;
        const user = avatarUser || getAuthUser();
        const nextUserId = user?.id || null;
        const identityChanged = authIdentityRef.current !== nextUserId;
        const previousUserId = authIdentityRef.current;
        authIdentityRef.current = nextUserId;
        accountOperationScopeRef.current.transition(nextUserId);
        if (nextUserId) setLocalUserId(nextUserId);
        else setLocalUserId(null);
        if (identityChanged) {
            // A result or balance from account A must never survive under
            // account B. The old account's durable recovery record remains
            // stored under its own key and can be resumed after switching back.
            setUserDiamonds(0);
            setQuestions([]);
            setCurrentQuestionIndex(0);
            setSelectedAnswer(null);
            setShowResult(false);
            setCorrectCount(0);
            setVerdict(null);
            setAnswerPending(false);
            setAnswerFailure(null);
            setResultActualAwarded(null);
            setResultAwardError(null);
            setResultSummary(null);
            setResultCapped(false);
            setSettlementReceipt(null);
            setSettlementReplayed(false);
            setEntryReceipt(null);
            setEntryError(null);
            setRunContract(null);
            setRunExpiresAt(null);
            setResumeNotice(null);
            setIsPreparing(false);
            setBalanceRefreshDelayed(false);
            answersRef.current = [];
            serverResultRef.current = null;
            startOperationRef.current = null;
            answerOperationRef.current = null;
            isStartingRef.current = false;
            answerLockRef.current = false;
            finishedRef.current = false;
            if (previousUserId) setGameState('lobby');
        }
        if (user) {
            loadUserDiamonds(user.id);
            DiamondEngine.init(user.id);
        }
        setIsLoading(false);
    }, [avatarUser?.id, avatarLoading]);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const update = () => setIsOnline(window.navigator.onLine !== false);
        update();
        window.addEventListener('online', update);
        window.addEventListener('offline', update);
        return () => {
            window.removeEventListener('online', update);
            window.removeEventListener('offline', update);
        };
    }, []);

    async function loadUserDiamonds(uid) {
        const operationScope = accountOperationScopeRef.current.capture();
        if (operationScope.identity !== uid) return;
        try {
            const { data: profile } = await readOwnProfile(supabase, 'diamonds', { expectId: uid });
            if (authIdentityRef.current !== uid
                || !accountOperationScopeRef.current.isCurrent(operationScope)) return;
            if (profile) {
                setUserDiamonds(profile.diamonds || 0);
            }
        } catch (e) {
            console.warn('[StrategyTrivia] Failed to load diamonds:', e);
            // Never leave a prior account's balance visible after an auth
            // boundary if the fresh profile read fails.
            if (authIdentityRef.current === uid
                && accountOperationScopeRef.current.isCurrent(operationScope)) setUserDiamonds(0);
        }
    }

    async function adoptServedRun(served, operationScope) {
        if (!accountOperationScopeRef.current.isCurrent(operationScope)) return false;
        if (!served || !Array.isArray(served.questions) || served.questions.length === 0) {
            setEntryError('The Server Did Not Return A Playable Roster. Retry This Same Entry Request.');
            return false;
        }

        // Questions and options stay in the server's order. Reordering either
        // would break the persisted display-index mapping used by grading.
        const set = served.questions;
        soloJourneyTrackerRef.current.beginRun(served.sessionId || serverRun.sessionId);
        soloRunLifecycleRef.current = { active: true, settled: false, mode, state: 'playing' };
        const progress = strategyResumeProgress(set);
        const restoredCorrect = set.filter(question => question?.answerState?.wasCorrect === true).length;
        answersRef.current = set.map(question => {
            const state = question?.answerState || question?.answer || null;
            const displayIndex = Number(state?.storedDisplayIndex);
            return Number.isInteger(displayIndex)
                ? {
                    questionId: question.id,
                    displayIndex,
                    voided: state?.voided === true || state?.outcome === 'voided',
                }
                : null;
        });

        if (Number.isFinite(served.newBalance)) setUserDiamonds(served.newBalance);
        if (served.entryState === 'charged' && served.entryCost > 0 && served.resumed !== true) {
            busEmit.diamondsSpent(served.entryCost, `${config.title} Entry`);
        }

        finishedRef.current = false;
        advanceLockRef.current = false;
        answerLockRef.current = false;
        serverResultRef.current = null;
        setQuestions(set);
        setResultActualAwarded(null);
        setResultAwardError(null);
        setResultSummary(null);
        setResultCapped(false);
        setSettlementReceipt(null);
        setSettlementReplayed(false);
        setBalanceRefreshDelayed(false);
        setRunContract(served.contract && typeof served.contract === 'object' ? served.contract : null);
        setRunExpiresAt(served.expiresAt || null);
        setTimerSeconds(null);
        setEntryReceipt({
            sessionId: served.sessionId || serverRun.sessionId || null,
            entryCost: Number(served.entryCost) || 0,
            entryState: served.entryState || 'free',
            resumed: served.resumed === true,
        });
        setGameState('playing');
        setCurrentQuestionIndex(progress.firstUnanswered >= 0 ? progress.firstUnanswered : Math.max(0, set.length - 1));
        setCorrectCount(restoredCorrect);
        setVerdict(null);
        setSelectedAnswer(null);
        setAnswerPending(false);
        setAnswerFailure(null);
        setShowResult(false);
        setEntryError(null);
        setResumeNotice(served.resumed === true
            ? `Run Resumed At Question ${Math.min(set.length, progress.answered + 1)} Of ${set.length}. Previously Locked Answers Stay Binding.`
            : null);

        if (progress.allAnswered) {
            setResumeNotice('Every Answer Was Already Locked. Recovering The Authoritative Settlement Receipt.');
            await finishGame(set, restoredCorrect, operationScope);
        }
        return true;
    }

    /** Start a new server-owned run. An uncertain response keeps its durable
     * nonce, so the next tap retries the same entry instead of charging twice. */
    async function startGame() {
        if (isStartingRef.current) return;
        const operationScope = accountOperationScopeRef.current.capture();
        if (operationScope.identity !== (userId || null)) return;
        const startOperation = { operationScope };
        // Race: isVip is false until the async VIP check resolves.
        if (vipInitializing) return;
        if (entryError) {
            soloJourneyTrackerRef.current.track(mode, 'retry', { surface: 'strategy', retry_kind: 'start' });
        }
        isStartingRef.current = true;
        startOperationRef.current = startOperation;
        setEntryError(null);
        setResumeNotice(null);
        setIsPreparing(true);
        try {
            // Session-start needs an authenticated caller; fail with a clear
            // message instead of a generic start error.
            if (!userId) {
                setEntryError('Please Sign In To Play This Mode.');
                return;
            }
            if (!isOnline) {
                setEntryError('You Are Offline. Reconnect, Then Retry This Same Entry Request.');
                return;
            }

            // 1. Open the server session first. No charge has happened yet.
            let served;
            try {
                served = await serverRun.start({ count: QUESTIONS_PER_GAME });
                if (!accountOperationScopeRef.current.isCurrent(operationScope)) return;
            } catch (e) {
                console.warn('[StrategyTrivia] Server session start failed:', e?.message || e);
                if (!accountOperationScopeRef.current.isCurrent(operationScope)
                    || isStaleAccountOperation(e)) return;
                if (e?.status === 402) {
                    setShowOutOfDiamonds(true);
                    return;
                }
                setEntryError('The Start Result Could Not Be Confirmed. Retry Uses The Same Entry Request And Cannot Create A Second Charge.');
                return;
            }
            await adoptServedRun(served, operationScope);
        } finally {
            if (startOperationRef.current === startOperation) {
                startOperationRef.current = null;
                isStartingRef.current = false;
                if (accountOperationScopeRef.current.isCurrent(operationScope)) setIsPreparing(false);
            }
        }
    }

    async function resumeGame() {
        if (isStartingRef.current || typeof serverRun.resume !== 'function') return;
        const operationScope = accountOperationScopeRef.current.capture();
        if (operationScope.identity !== (userId || null)) return;
        const startOperation = { operationScope };
        if (resumeRetryRef.current) {
            soloJourneyTrackerRef.current.track(mode, 'retry', { surface: 'strategy', retry_kind: 'resume' });
            resumeRetryRef.current = false;
        }
        if (!userId) {
            router.push(`/auth/login?redirect=/hub/trivia/${mode}`);
            return;
        }
        if (!isOnline) {
            setEntryError('You Are Offline. Reconnect To Resume This Run.');
            return;
        }
        isStartingRef.current = true;
        startOperationRef.current = startOperation;
        setEntryError(null);
        setIsPreparing(true);
        try {
            const served = await serverRun.resume();
            if (!accountOperationScopeRef.current.isCurrent(operationScope)) return;
            if (served?.resumedSettlement === true && served.settlement) {
                soloRunLifecycleRef.current = { active: true, settled: false, mode, state: 'settling' };
                const recoveredEntry = Array.isArray(served.settlement?.receipt?.transactions)
                    ? served.settlement.receipt.transactions.find(transaction => transaction?.role === 'entry')
                    : null;
                const recoveredSettlement = {
                    ...served.settlement,
                    sessionId: served.settlement.sessionId || served.sessionId || serverRun.recoverableSession?.sessionId || null,
                    replayed: true,
                };
                finishedRef.current = false;
                serverResultRef.current = recoveredSettlement;
                setEntryReceipt({
                    sessionId: recoveredSettlement.sessionId,
                    entryCost: recoveredEntry && Number.isFinite(Number(recoveredEntry.amount))
                        ? Math.abs(Number(recoveredEntry.amount))
                        : 0,
                    entryState: recoveredEntry ? 'charged' : 'confirmed',
                    resumed: true,
                });
                setResumeNotice('The Existing Settlement Receipt Was Recovered. No New Entry Or Payout Was Created.');
                await finishGame([], Number(recoveredSettlement.correct) || 0, operationScope);
                return;
            }
            await adoptServedRun(served, operationScope);
        } catch (error) {
            console.warn('[StrategyTrivia] Session resume failed:', error?.message || error);
            if (!accountOperationScopeRef.current.isCurrent(operationScope)
                || isStaleAccountOperation(error)) return;
            resumeRetryRef.current = true;
            setEntryError(error?.status === 410
                ? 'The Server Confirmed That This Run Expired And Can No Longer Be Resumed.'
                : 'The Run Could Not Be Resumed Yet. Retry Keeps The Same Session And Entry Receipt.');
        } finally {
            if (startOperationRef.current === startOperation) {
                startOperationRef.current = null;
                isStartingRef.current = false;
                if (accountOperationScopeRef.current.isCurrent(operationScope)) setIsPreparing(false);
            }
        }
    }

    function handleTimeout() {
        gradeAnswer(-1); // records the timeout server-side and reveals the answer
    }

    /**
     * Per-answer server grading. Lock the tap immediately, record it with
     * /api/trivia/session-answer (the first answer per question is BINDING
     * server-side), then reveal from the verdict. A failed call unlocks so
     * the player can re-tap - the endpoint is idempotent per question, so a
     * retry cannot double-record. displayIndex -1 is the shot-clock timeout.
     */
    async function gradeAnswer(displayIndex, { retry = false, invalidQuestion = false } = {}) {
        const operationScope = accountOperationScopeRef.current.capture();
        if (operationScope.identity !== (userId || null)) return;
        const retryingSameIntent = retry
            && answerFailure
            && answerFailure.questionId === questions[currentQuestionIndex]?.id
            && answerFailure.displayIndex === displayIndex
            && answerFailure.invalidQuestion === invalidQuestion;
        if (answerLockRef.current || showResult || (selectedAnswer !== null && !retryingSameIntent)) return;
        if (retryingSameIntent) {
            soloJourneyTrackerRef.current.track(mode, 'retry', {
                surface: 'strategy',
                retry_kind: invalidQuestion ? 'invalid_question' : 'answer',
            });
        }
        const q = questions[currentQuestionIndex];
        if (!q || typeof q.id !== 'string') return;
        if (!isOnline) {
            setAnswerFailure({
                questionId: q.id,
                displayIndex,
                invalidQuestion,
                message: invalidQuestion
                    ? 'You Are Offline. Reconnect To Verify This Unavailable Question With The Server.'
                    : 'You Are Offline. Reconnect To Lock This Same Answer.',
            });
            if (displayIndex >= 0) setSelectedAnswer(displayIndex);
            return;
        }
        const answerOperation = { operationScope, questionId: q.id };
        answerLockRef.current = true;
        answerOperationRef.current = answerOperation;
        setAnswerPending(true);
        setAnswerFailure(null);
        if (displayIndex >= 0) setSelectedAnswer(displayIndex); // instant visual lock on the tap
        try {
            const v = await serverRun.answer({ questionId: q.id, displayIndex, invalidQuestion });
            if (!accountOperationScopeRef.current.isCurrent(operationScope)) return;
            // Solver/explanation metadata is reveal-only. Refuse any receipt
            // that is not for the exact session and question whose answer was
            // just bound before allowing that metadata into React state.
            if (v?.questionId !== q.id || v?.sessionId !== serverRun.sessionId) {
                const receiptError = new Error('answer_receipt_mismatch');
                receiptError.code = 'answer_receipt_mismatch';
                throw receiptError;
            }
            const storedDisplayIndex = Number.isInteger(v?.storedDisplayIndex)
                ? v.storedDisplayIndex
                : displayIndex;
            answersRef.current[currentQuestionIndex] = {
                questionId: q.id,
                displayIndex: storedDisplayIndex,
                voided: v?.voided === true || v?.outcome === 'voided',
            };
            setSelectedAnswer(storedDisplayIndex >= 0 ? storedDisplayIndex : null);
            setVerdict(v);
            setShowResult(true);
            // Side effects key off the server verdict, never a local compare.
            if (v?.voided === true || v?.outcome === 'voided') {
                setResumeNotice('The Server Verified This Question As Unavailable. It Was Voided And Does Not Count Against The Run.');
            } else if (v?.wasCorrect === true) {
                setCorrectCount(prev => prev + 1);
                busEmit.decisionCorrect(correctCount + 1);
            } else {
                busEmit.decisionIncorrect(correctCount);
                busEmit.screenShake('light');
            }
        } catch (e) {
            console.warn('[StrategyTrivia] Answer grading failed:', e?.message || e);
            if (!accountOperationScopeRef.current.isCurrent(operationScope)
                || isStaleAccountOperation(e)) return;
            const serverCode = e?.payload?.error || e?.code || e?.message;
            const requiresRefresh = invalidQuestion
                && serverCode === 'question_still_valid'
                && e?.payload?.retryable === true;
            // The server may have committed the first answer before the
            // response was lost. Keep the exact intent locked and retry only
            // that display index; allowing a different tap would make the UI
            // disagree with first-answer-wins persistence.
            setAnswerFailure({
                questionId: q.id,
                displayIndex,
                invalidQuestion,
                requiresRefresh,
                message: requiresRefresh
                    ? 'The Server Revalidated This Question. Refresh The Same Run To Restore Its Authoritative Play Data.'
                    : invalidQuestion
                        ? 'The Server Void Check Was Not Confirmed. Retry The Same Check; No Local Score Change Was Made.'
                        : displayIndex < 0
                            ? 'The Timeout Result Was Not Confirmed. Retry Records The Same Timeout.'
                            : 'The Answer Result Was Not Confirmed. Retry Locks This Same Answer.',
            });
            answerLockRef.current = false;
        } finally {
            if (answerOperationRef.current === answerOperation) {
                answerOperationRef.current = null;
                if (accountOperationScopeRef.current.isCurrent(operationScope)) setAnswerPending(false);
            }
        }
    }

    // Strategy tables are untimed unless the server-issued run contract says
    // otherwise. A shot clock is rendered and enforced only from its absolute
    // server deadline; the client never invents a 60-second rule or pauses an
    // authoritative deadline while the tab is hidden.
    useEffect(() => {
        if (!hasAuthoritativeShotClock || gameState !== 'playing' || showResult || !currentQuestion?.id) {
            setTimerSeconds(null);
            return undefined;
        }

        const tick = () => {
            const remaining = Math.max(0, Math.ceil((timerDeadlineMs - Date.now()) / 1000));
            setTimerSeconds(remaining);
            if (remaining === 0 && timedOutQuestionRef.current !== currentQuestion.id) {
                timedOutQuestionRef.current = currentQuestion.id;
                handleTimeout();
            }
        };
        tick();
        const intervalId = window.setInterval(tick, 250);
        return () => window.clearInterval(intervalId);
    }, [currentQuestion?.id, gameState, hasAuthoritativeShotClock, showResult, timerDeadlineMs]);

    function nextQuestion() {
        // Double-clicking Next used to run setCurrentQuestionIndex(prev+1)
        // twice, skipping a question with no answer recorded and misaligning
        // answers[] against questions[] for the rest of the game.
        if (advanceLockRef.current) return;
        advanceLockRef.current = true;

        if (currentQuestionIndex + 1 >= questions.length) {
            finishGame();
            return;
        }
        setCurrentQuestionIndex(prev => prev + 1);
        setVerdict(null);
        setSelectedAnswer(null);
        setAnswerFailure(null);
        setAnswerPending(false);
        setShowResult(false);
        answerLockRef.current = false;
    }

    // Release the advance lock once the new question has rendered.
    useEffect(() => {
        advanceLockRef.current = false;
        if (gameState === 'playing') questionHeadingRef.current?.focus();
    }, [currentQuestionIndex, gameState]);

    /**
     * Settle the run server-side. /api/trivia/session-submit grades from the
     * answers stored at tap time (the array below only fills in questions
     * that never reached session-answer), applies the accuracy tiers, the
     * perfect bonus and the per-mode daily cap, and pays through a locked
     * RPC. No client-side crediting, ever.
     *
     * Retry-safe: the settled result lives in serverResultRef, so a retry
     * after a network drop re-uses the already-paid result instead of
     * re-submitting a closed session, and finishedRef reopens on failure so
     * the results screen's retry button can run settlement again.
     */
    async function finishGame(
        questionSet = questions,
        correctOverride = correctCount,
        operationScope = accountOperationScopeRef.current.capture(),
    ) {
        if (operationScope.identity !== (userId || null)
            || !accountOperationScopeRef.current.isCurrent(operationScope)) return;
        const isCurrentAccountOperation = () => accountOperationScopeRef.current.isCurrent(operationScope);
        if (finishedRef.current) return;
        finishedRef.current = true;
        if (soloRunLifecycleRef.current.active) soloRunLifecycleRef.current.state = 'settling';

        const activeQuestions = Array.isArray(questionSet) ? questionSet : questions;

        let settled = serverResultRef.current;
        if (!settled) {
            const submitAnswers = activeQuestions.map((q, idx) => {
                const a = answersRef.current[idx];
                return {
                    questionId: q.id,
                    displayIndex: (a && Number.isInteger(a.displayIndex)) ? a.displayIndex : -1,
                };
                });
            try {
                settled = await serverRun.submit(submitAnswers);
                if (!isCurrentAccountOperation()) return;
                if (!settled) {
                    // The hook's in-flight guard swallowed a concurrent call;
                    // let that call finish the game instead of settling zeros.
                    finishedRef.current = false;
                    return;
                }
                serverResultRef.current = settled;
            } catch (e) {
                console.warn('[StrategyTrivia] CRITICAL: settlement failed - run not yet paid:', e?.message || e);
                if (!isCurrentAccountOperation() || isStaleAccountOperation(e)) return;
                soloJourneyTrackerRef.current.track(mode, 'settlement', {
                    surface: 'strategy',
                    settlement_outcome: 'failed',
                });
                // Reopen so the results screen's retry can run settlement
                // again. On a transient failure the session is still open
                // server-side (the hook only discards it on 409/410), so a
                // retry pays; correct/total shown meanwhile come from the
                // per-tap verdicts.
                finishedRef.current = false;
                setResultSummary({ correct: null, total: null, pending: true });
                setResultActualAwarded(null);
                setResultAwardError(e?.message || 'Settlement failed');
                setResultCapped(false);
                setSettlementReceipt(null);
                setSettlementReplayed(false);
                setGameState('results');
                return;
            }
        }

        const awarded = Number.isFinite(settled?.diamondsAwarded) ? settled.diamondsAwarded : 0;
        const serverCorrect = Number.isFinite(settled?.correct) ? settled.correct : correctOverride;
        const serverTotal = Number.isFinite(settled?.total) ? settled.total : activeQuestions.length;

        // Display-only cap awareness: the server pays the same accuracy tiers
        // as calculateDiamonds and clamps to the mode's daily cap, so an
        // award below the uncapped formula means the cap absorbed the rest.
        const rawExpected = calculateDiamonds(mode, serverCorrect, serverTotal, 0);
        const capped = awarded < rawExpected;
        setResultCapped(capped);

        // Local balance from the server's post-award number, with a fresh
        // profiles read as the fallback.
        if (Number.isFinite(settled?.newBalance)) {
            setUserDiamonds(settled.newBalance);
            setBalanceRefreshDelayed(false);
        } else if (userId) {
            try {
                const { data: freshProfile } = await readOwnProfile(supabase, 'diamonds', { expectId: userId });
                if (!isCurrentAccountOperation()) return;
                if (freshProfile) {
                    setUserDiamonds(freshProfile.diamonds || 0);
                    setBalanceRefreshDelayed(false);
                } else {
                    setBalanceRefreshDelayed(true);
                }
            } catch (e) {
                console.warn('[StrategyTrivia] Balance refresh failed:', e?.message || e);
                if (!isCurrentAccountOperation()) return;
                setBalanceRefreshDelayed(true);
            }
        }

        if (!isCurrentAccountOperation()) return;

        // A replay is proof of the original settlement, not a second earning
        // event. Do not duplicate wallet analytics or celebration side effects.
        if (settled?.replayed !== true && awarded > 0) {
            busEmit.diamondsEarned(awarded, `${config.title} Reward`);
        }
        if (settled?.replayed !== true && serverTotal > 0 && serverCorrect >= serverTotal) {
            busEmit.celebration('confetti');
        }

        // session-submit persists the verified score atomically with payout.
        // Client INSERT is intentionally revoked so leaderboard and wheel
        // tokens cannot be forged from devtools.

        // No client-side history write: session-start already recorded the
        // served roster into trivia_user_question_history at serve time, so
        // the 60-day non-repeat guarantee holds even for abandoned runs.

        setResultSummary({ correct: serverCorrect, total: serverTotal });
        setResultActualAwarded(awarded);
        setResultAwardError(null);
        // Preserve the server's durable evidence verbatim. In particular, do
        // not rebuild a shallow client receipt that drops transaction rows,
        // request identity, settlement reference or result hash.
        setSettlementReceipt(settled?.receipt && typeof settled.receipt === 'object'
            ? settled.receipt
            : null);
        setSettlementReplayed(settled?.replayed === true);
        setResumeNotice(null);
        setGameState('results');
        soloJourneyTrackerRef.current.track(mode, 'settlement', {
            surface: 'strategy',
            settlement_outcome: settled?.replayed === true ? 'replayed' : 'verified',
        });
        if (capped) {
            soloJourneyTrackerRef.current.track(mode, 'cap', { surface: 'strategy', cap_state: 'applied' });
        }
        soloJourneyTrackerRef.current.track(mode, 'completion', { surface: 'strategy' });
        soloRunLifecycleRef.current = { active: false, settled: true, mode, state: 'settling' };
    }

    // Keyboard shortcuts are scoped to the focused strategy surface. A key
    // pressed in the global header, report dialog or any interactive control
    // can never answer or advance a question behind that control.
    function handleGameKeyDown(event) {
        if (gameState !== 'playing' || event.metaKey || event.ctrlKey || event.altKey) return;
        const target = event.target;
        if (!gameSurfaceRef.current?.contains(target)) return;
        if (target?.closest?.('button, a, input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;

        if (!showResult && selectedAnswer === null && !answerFailure && currentQuestionIntegrity.ok) {
            let index = -1;
            if (/^[1-9]$/.test(event.key)) index = Number(event.key) - 1;
            else if (/^[a-jA-J]$/.test(event.key)) index = event.key.toLowerCase().charCodeAt(0) - 97;
            if (index >= 0 && index < (currentQuestion?.options?.length || 0)) {
                event.preventDefault();
                gradeAnswer(index);
            }
            return;
        }

        if (showResult && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            nextQuestion();
        }
    }


    if (isLoading) {
        // Was a bare 'Loading...' string on an empty page for the flagship
        // strategy modes; the shared skeleton is what every other trivia
        // entry point shows.
        return (
            <PageTransition>
                <div className="trivia-console-standalone">
                    <TriviaConsole title={config.title} eyebrow="Strategy Table" pill="Loading" titleAs="h1">
                        <TriviaSkeleton label={`Loading ${config.title}`} />
                    </TriviaConsole>
                </div>
            </PageTransition>
        );
    }

    const timerInk = hasAuthoritativeShotClock && timerSeconds != null && timerSeconds <= 10 ? 'red' : 'gold';
    const timerDisplay = showResult
        ? 'Locked'
        : hasAuthoritativeShotClock && timerSeconds != null
            ? timerSeconds
            : 'Untimed';
    const runExpiryLabel = runExpiresAt && Number.isFinite(Date.parse(runExpiresAt))
        ? new Date(runExpiresAt).toLocaleString()
        : null;
    const lobbyPrimaryAction = !userId
        ? { label: 'Sign In To Play', onClick: () => router.push(`/auth/login?redirect=/hub/trivia/${mode}`), disabled: vipInitializing }
        : serverRun.hasRecoverableSession
            ? { label: isPreparing ? 'Recovering Run' : 'Resume Run', onClick: resumeGame, disabled: isPreparing || !isOnline }
            : { label: isPreparing ? 'Dealing In' : entryError ? 'Retry Start' : 'Start Challenge', onClick: startGame, disabled: isPreparing || vipInitializing || !isOnline };
    const primaryAction = gameState === 'lobby'
        ? lobbyPrimaryAction
        : gameState === 'playing' && showResult
            ? { label: currentQuestionIndex + 1 >= questions.length ? 'See Results' : 'Next Question', onClick: nextQuestion }
            : gameState === 'results'
                ? resultAwardError
                    ? {
                        label: 'Retry Settlement',
                        onClick: () => {
                            soloJourneyTrackerRef.current.track(mode, 'retry', { surface: 'strategy', retry_kind: 'settlement' });
                            finishGame();
                        },
                        disabled: !isOnline,
                    }
                    : { label: isPreparing ? 'Dealing In' : 'Play Again', onClick: startGame, disabled: isPreparing || vipInitializing || !isOnline }
                : undefined;

    return (
        <PageTransition>
            <Head>
                <title>{config.title} - Smarter.Poker Trivia</title>
            </Head>

            <div className="strategy-trivia" data-strategy-mode={mode} data-game-state={gameState}>
                <UniversalHeader pageDepth={2} />

                <TriviaConsoleDialog
                    open={showOutOfDiamonds}
                    onClose={() => setShowOutOfDiamonds(false)}
                    eyebrow="Vault Access Required"
                    title="Not Enough Diamonds"
                    subtitle={`This Table Requires ${entryCost} Diamonds`}
                    pill="Balance"
                    pillInk="gold"
                    secondaryAction={{ label: 'Close', onClick: () => setShowOutOfDiamonds(false) }}
                    primaryAction={{ label: 'Get Diamonds', onClick: () => router.push('/hub/diamond-store') }}
                >
                    <p className="trivia-console-copy">
                        You Need {entryCost} Diamonds To Play. Visit The Diamond Store To Get More.
                    </p>
                    {userId ? (
                        <ul className="tc-rows">
                            <li className="tc-row">
                                <span className="tc-row__label">Your Balance</span>
                                <span className="tc-row__value tc-ink--red">{formatTriviaDisplayNumber(userDiamonds)} Diamonds</span>
                            </li>
                            <li className="tc-row">
                                <span className="tc-row__label">Entry</span>
                                <span className="tc-row__value">{entryCost} Diamonds</span>
                            </li>
                        </ul>
                    ) : null}
                </TriviaConsoleDialog>

                <div className="content">
                    <TriviaConsole
                        className="strategy-console"
                        eyebrow="Strategy Table"
                        title={config.title}
                        subtitle={config.subtitle}
                        pill={gameState === 'lobby' ? (isPreparing ? 'Dealing' : 'Ready') : gameState === 'playing' ? 'Live' : 'Results'}
                        pillInk={gameState === 'playing' ? 'green' : 'blue'}
                        titleAs="h1"
                        secondaryAction={gameState === 'results'
                            ? { label: 'Back To Lobby', onClick: () => router.push('/hub/trivia') }
                            : undefined}
                        primaryAction={primaryAction}
                    >
                    {entryError && (
                        <p className="strategy-alert tc-ink--red" role="alert">
                            {entryError}
                        </p>
                    )}
                    {!isOnline && (
                        <p className="strategy-alert tc-ink--gold" role="status">
                            Offline. Your Current Run Identity Is Preserved. Reconnect To Continue.
                        </p>
                    )}
                    {resumeNotice && (
                        <p className="strategy-alert tc-ink--blue" role="status" aria-live="polite">
                            {resumeNotice}
                        </p>
                    )}

                    {/* LOBBY STATE: the mode's text-free scene on the glass,
                        then the live table terms as engraved rows. The
                        console's own action starts the run. */}
                    {gameState === 'lobby' && (
                        <div className="strategy-lobby">
                            <div className="strategy-lobby__art">
                                <ResponsiveModeArt art={MODE_ART[mode] || MODE_ART.mtt} priority />
                            </div>
                            <div className="strategy-lobby__brief">
                                <p className="strategy-station tc-label">{config.station}</p>
                                <p className="strategy-description">{config.description}</p>
                                {serverRun.hasRecoverableSession && (
                                    <p className="strategy-recovery tc-ink--gold" role="status">
                                        A Previous Run Is Ready To Resume. Its Locked Answers And Entry Receipt Stay Binding.
                                    </p>
                                )}
                            {/* Questions are dealt by the server when the game
                                starts, so the only wait worth showing is the
                                session-start + charge round-trip itself. */}
                                {isPreparing && (
                                    <p className="strategy-status tc-label" role="status">{serverRun.hasRecoverableSession ? 'Recovering Run' : 'Dealing In'}</p>
                                )}
                                <ul className="tc-rows strategy-terms" aria-label={`${config.title} Table Terms`}>
                                <li className="tc-row">
                                    <span className="tc-row__label">Questions</span>
                                    <span className="tc-row__value">{QUESTIONS_PER_GAME}</span>
                                </li>
                                <li className="tc-row">
                                    <span className="tc-row__label">Decision Clock</span>
                                    <span className="tc-row__value">Confirmed When Run Starts</span>
                                </li>
                                <li className="tc-row">
                                    <span className="tc-row__label">Entry</span>
                                    <span className="tc-row__value">{isVip ? 'Free With VIP' : <>{entryCost} Diamonds</>}</span>
                                </li>
                                {/* Reward copy mirrors what session-submit
                                    actually pays: the base reward needs 70%+
                                    accuracy, the bonus needs a perfect run,
                                    and the mode's daily cap bounds the total. */}
                                <li className="tc-row">
                                    <span className="tc-row__label">Reward At 70% Accuracy</span>
                                    <span className="tc-row__value tc-ink--green">{TRIVIA_MODES[mode]?.diamondReward || 5} Diamonds</span>
                                </li>
                                <li className="tc-row">
                                    <span className="tc-row__label">Perfect Score Bonus</span>
                                    <span className="tc-row__value tc-ink--green">+{TRIVIA_MODES[mode]?.perfectBonus || 10} Diamonds</span>
                                </li>
                                <li className="tc-row">
                                    <span className="tc-row__label">Daily Reward Cap</span>
                                    <span className="tc-row__value">{DAILY_DIAMOND_CAPS[mode] || 40} Diamonds</span>
                                </li>
                                {userId && (
                                    <li className="tc-row">
                                        <span className="tc-row__label">Your Balance</span>
                                        <span className="tc-row__value tc-ink--gold">{formatTriviaDisplayNumber(userDiamonds)} Diamonds</span>
                                    </li>
                                )}
                                </ul>
                            </div>
                        </div>
                    )}

                    {/* PLAYING STATE */}
                    {gameState === 'playing' && currentQuestion && (
                        <div
                            ref={gameSurfaceRef}
                            className="game-area"
                            tabIndex={-1}
                            onKeyDown={handleGameKeyDown}
                        >
                            {/* The contract rail never invents a clock. These
                                four strategy modes are untimed today; a live
                                countdown appears only for a server-issued
                                shot-clock deadline. */}
                            <div className="game-header">
                                <div className="progress tc-label" role="status" aria-live="polite">
                                    Question {currentQuestionIndex + 1} Of {questions.length}
                                </div>
                                <div className="strategy-clock" data-warning={timerInk === 'red' ? 'true' : 'false'}>
                                    <span className="strategy-clock__label">Decision Clock</span>
                                    <span className={`strategy-clock__value tc-ink--${timerInk}`} aria-hidden="true">
                                        {timerDisplay}
                                    </span>
                                    <span className="sr-only" role="timer" aria-live="assertive">
                                        {showResult
                                            ? 'Decision Locked'
                                            : hasAuthoritativeShotClock && [30, 10, 5, 0].includes(timerSeconds)
                                            ? `${timerSeconds} seconds remaining`
                                            : 'Untimed Decision'}
                                    </span>
                                </div>
                            </div>

                            {(runExpiryLabel || entryReceipt) && (
                                <ul className="tc-rows strategy-run-contract" aria-label="Run Contract">
                                    <li className="tc-row">
                                        <span className="tc-row__label">Entry State</span>
                                        <span className="tc-row__value">{toTitleCase(entryReceipt?.entryState || 'Confirmed')}</span>
                                    </li>
                                    {runExpiryLabel && (
                                        <li className="tc-row">
                                            <span className="tc-row__label">Session Expires</span>
                                            <span className="tc-row__value">{runExpiryLabel}</span>
                                        </li>
                                    )}
                                </ul>
                            )}

                            <section className="strategy-context" aria-labelledby="strategy-context-heading">
                                <h2 id="strategy-context-heading" className="strategy-context__heading tc-label">
                                    {currentContext.heading}
                                </h2>
                                <ul className="tc-rows">
                                    {currentContext.items.map(item => (
                                        <li className="tc-row" key={item.label}>
                                            <span className="tc-row__label">{item.label}</span>
                                            <span className={`tc-row__value${item.ink ? ` tc-ink--${item.ink}` : ''}`}>{item.value}</span>
                                        </li>
                                    ))}
                                </ul>
                            </section>

                            <div className="question-content-area">
                                <p className="category-badge tc-label">
                                    {toTitleCase(getCategoryName(currentQuestion.category))}
                                </p>

                                <h2 ref={questionHeadingRef} className="question-text" tabIndex={-1}>
                                    {/* Card detection runs on the RAW text and the
                                        title-caser is applied to the remaining
                                        fragments — title-casing first turned every
                                        mid-sentence "as" into the ace of spades. */}
                                    {renderTextWithCards(
                                        currentQuestion.question,
                                        s => formatPokerText(toTitleCase(s))
                                    )}
                                </h2>
                            </div>

                            {!currentQuestionIntegrity.ok && !showResult && (
                                <div className="strategy-question-fault" role="alert">
                                    <p className="strategy-alert tc-ink--red">
                                        {currentQuestionId
                                            ? 'This Question Is Missing Required Play Data And Cannot Accept An Answer. Verify It With The Server To Void It Without Affecting Your Score.'
                                            : 'This Question Is Missing Its Server Identity. Refresh The Same Run To Restore The Authoritative Question Before Continuing.'}
                                    </p>
                                    <button
                                        type="button"
                                        className="tc-word"
                                        onClick={currentQuestionId
                                            ? () => gradeAnswer(-1, { invalidQuestion: true })
                                            : resumeGame}
                                        disabled={answerPending || isPreparing || Boolean(answerFailure) || !isOnline}
                                    >
                                        {currentQuestionId ? 'Verify And Void Question' : 'Refresh Question From Server'}
                                    </button>
                                    <ReportQuestionButton
                                        key={`${serverRun.sessionId || 'no-session'}:${currentQuestion.id}`}
                                        questionId={currentQuestion.id}
                                        sessionId={serverRun.sessionId}
                                        accountId={userId}
                                        userToken={getAccessToken()}
                                    />
                                </div>
                            )}

                            {currentQuestionIntegrity.ok && (
                            <div className="bottom-actions-area" data-revealed={showResult ? 'true' : 'false'}>
                                <div className="options">
                                    {/* Options are rendered in the server's display
                                        order, verbatim - reshuffling them would break
                                        the display-index mapping the grader uses. The
                                        reveal highlights come from the verdict's
                                        correctDisplayIndex; before it resolves there
                                        is nothing to leak. */}
                                    {currentQuestion.options.map((option, index) => {
                                        const revealCorrectIndex = (showResult && verdict) ? verdict.correctDisplayIndex : null;
                                        let optionClass = 'option';
                                        if (revealCorrectIndex != null) {
                                            if (index === revealCorrectIndex) {
                                                optionClass += ' correct';
                                            } else if (index === selectedAnswer) {
                                                optionClass += ' incorrect';
                                            }
                                        }

                                        const letter = String.fromCharCode(65 + index);
                                        return (
                                            <button
                                                key={index}
                                                type="button"
                                                className={optionClass}
                                                onClick={() => gradeAnswer(index)}
                                                disabled={showResult || selectedAnswer !== null || answerPending || Boolean(answerFailure)}
                                                data-trivia-answer
                                                aria-pressed={selectedAnswer === index}
                                                aria-label={`Answer ${letter}: ${option}`}
                                            >
                                                <span className="option-letter" aria-hidden>
                                                    {letter}
                                                </span>
                                                <span className="option-text">
                                                    {renderTextWithCards(option, s => formatPokerText(toTitleCase(s)))}
                                                </span>
                                                {revealCorrectIndex != null && index === revealCorrectIndex && (
                                                    <span className="sr-only">Correct Answer</span>
                                                )}
                                                {revealCorrectIndex != null && index === selectedAnswer && index !== revealCorrectIndex && (
                                                    <span className="sr-only">Your Answer, Incorrect</span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* The 50/50 and Skip lifeline buttons that lived
                                    here are gone with the move to server grading -
                                    see the note by the serverRun declaration. */}
                            </div>
                            )}

                            {answerPending && (
                                <p className="strategy-answer-state tc-ink--blue" role="status" aria-live="polite">
                                    Locking This Answer With The Server
                                </p>
                            )}
                            {answerFailure && (
                                <div className="strategy-answer-retry" role="alert">
                                    <p className="strategy-alert tc-ink--red">{answerFailure.message}</p>
                                    <button
                                        type="button"
                                        className="tc-word"
                                        onClick={answerFailure.requiresRefresh
                                            ? resumeGame
                                            : () => gradeAnswer(answerFailure.displayIndex, {
                                                retry: true,
                                                invalidQuestion: answerFailure.invalidQuestion === true,
                                            })}
                                        disabled={answerPending || isPreparing || !isOnline}
                                    >
                                        {answerFailure.requiresRefresh
                                            ? 'Refresh Question From Server'
                                            : answerFailure.invalidQuestion
                                                ? 'Retry Same Void Check'
                                                : answerFailure.displayIndex < 0
                                                    ? 'Retry Same Timeout'
                                                    : 'Retry Same Answer'}
                                    </button>
                                </div>
                            )}

                            {/* Analysis panel — real solver metadata only.
                                Everything here is driven by the SERVER
                                verdict: the question object carries no
                                correct_index and no explanation, so the
                                reveal (badge, best line, coaching text)
                                reads correctDisplayIndex / wasCorrect /
                                explanation from session-answer. */}
                            {showResult && verdict && (() => {
                                const options = Array.isArray(currentQuestion.options) ? currentQuestion.options : [];
                                const wasVoided = verdict.voided === true || verdict.outcome === 'voided';
                                const solver = readStrategySolverMetadata(
                                    verdict.solverMetadata,
                                    verdict.correctDisplayIndex >= 0
                                        ? (options[verdict.correctDisplayIndex] || '')
                                        : '',
                                    options
                                );
                                const hasSolverData = solver.frequencyRows.length > 0 || Boolean(solver.evAnalysis);
                                const wasCorrect = verdict.wasCorrect === true;
                                const correctText = verdict.correctDisplayIndex >= 0
                                    ? (options[verdict.correctDisplayIndex] || '')
                                    : '';

                                return (
                                    <div className="answer-analysis">
                                        {/* Result verdict */}
                                        <p
                                            className={`answer-verdict tc-ink--${wasVoided ? 'blue' : wasCorrect ? 'green' : 'red'}`}
                                            data-correct={wasVoided ? 'voided' : wasCorrect ? 'true' : 'false'}
                                            role="status"
                                        >
                                            {wasVoided ? 'Question Voided' : wasCorrect ? 'Correct' : 'Incorrect'}
                                        </p>

                                        {wasVoided ? (
                                            <div className="coaching-notes">
                                                <p className="coaching-notes__head tc-label">Authoritative Review</p>
                                                <p className="coaching-notes__body">
                                                    The Server Verified That This Question Is Unavailable. It Is Excluded From The Graded Total And Does Not Affect Your Score.
                                                </p>
                                            </div>
                                        ) : hasSolverData ? (
                                            <GTOScenarioDisplay
                                                key={`${userId}:${serverRun.sessionId}:${currentQuestion.id}`}
                                                questionId={currentQuestion.id}
                                                sessionId={serverRun.sessionId}
                                                accountId={userId}
                                                mode={mode}
                                                category={currentQuestion.category}
                                                accessToken={getAccessToken()}
                                                action={solver.preferredAction || correctText}
                                                preferredFrequency={solver.preferredFrequency}
                                                explanation={verdict.explanation}
                                                evAnalysis={solver.evAnalysis}
                                                alternateLines={solver.alternateLines}
                                                frequencyRows={solver.frequencyRows}
                                                rangeSummary={solver.rangeSummary}
                                                isCorrectAnswer={wasCorrect}
                                                showDetails={true}
                                            />
                                        ) : (
                                            /* No solver metadata on this question: show the
                                               question's own coaching notes rather than an
                                               invented EV number and confidence figure. */
                                            <div className="coaching-notes">
                                                <p className="coaching-notes__head tc-label">Coaching Notes</p>
                                                <ul className="tc-rows">
                                                    <li className="tc-row">
                                                        <span className="tc-row__label">Best Line</span>
                                                        <span className="tc-row__value coaching-notes__answer">
                                                            {renderTextWithCards(
                                                                correctText,
                                                                s => formatPokerText(toTitleCase(s))
                                                            )}
                                                        </span>
                                                    </li>
                                                </ul>
                                                {verdict.explanation && (
                                                    <p className="coaching-notes__body">
                                                        {renderTextWithCards(
                                                            verdict.explanation,
                                                            s => formatPokerText(s)
                                                        )}
                                                    </p>
                                                )}
                                                {!verdict.explanation && (
                                                    <p className="coaching-notes__body tc-ink--muted">
                                                        No Solver Frequency, Range Or EV Data Was Released For This Question.
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                        <ReportQuestionButton
                                            key={currentQuestion.id}
                                            questionId={currentQuestion.id}
                                            sessionId={serverRun.sessionId}
                                            accountId={userId}
                                            userToken={getAccessToken()}
                                            onDone={(report) => soloJourneyTrackerRef.current.track(mode, 'report', {
                                                surface: 'strategy',
                                                report_outcome: report?.deduped === true ? 'deduped' : 'recorded',
                                            })}
                                        />
                                    </div>
                                );
                            })()}

                            {/* The next action lives in the console foot. */}
                        </div>
                    )}

                    {/* RESULTS STATE — every number here is the server's:
                        summary from session-submit's correct/total, awarded
                        from diamondsAwarded (already cap-clamped and paid). */}
                    {gameState === 'results' && (() => {
                        const summary = resultSummary || { correct: correctCount, total: questions.length };
                        const settlementPending = summary.pending === true || resultAwardError;
                        const pct = !settlementPending && summary.total > 0 ? summary.correct / summary.total : 0;
                        const awarded = resultActualAwarded;
                        return (
                            <div className="results">
                                <p className="result-status tc-label">
                                    {settlementPending ? 'Settlement Pending' : pct >= 0.8 ? 'Expert Result' : pct >= 0.5 ? 'Strong Result' : 'Session Complete'}
                                </p>
                                <h2>{settlementPending ? 'Run Complete' : 'Challenge Complete!'}</h2>

                                <p className="score-main" aria-label={settlementPending ? 'Score Pending Authoritative Settlement' : `${summary.correct} Of ${summary.total} Correct`}>
                                    <span className={`score-num tc-ink--${!settlementPending && pct >= 0.7 ? 'green' : 'silver'}`}>
                                        {settlementPending ? '--' : summary.correct}
                                    </span>
                                    <span className="score-total tc-ink--muted">{settlementPending ? 'Pending' : `/ ${summary.total}`}</span>
                                </p>

                                <ul className="tc-rows">
                                    <li className="tc-row">
                                        <span className="tc-row__label">Correct Answers</span>
                                        <span className="tc-row__value">
                                            {settlementPending ? 'Pending Server Receipt' : `${summary.correct} Of ${summary.total}`}
                                        </span>
                                    </li>
                                    <li className="tc-row">
                                        <span className="tc-row__label">Diamonds Awarded</span>
                                        <span className={`tc-row__value diamonds-earned tc-ink--${awarded == null ? 'red' : awarded > 0 ? 'gold' : 'muted'}`}>
                                            {awarded == null ? 'Pending Authoritative Settlement' : `+${formatTriviaDisplayNumber(awarded)} Diamonds`}
                                        </span>
                                    </li>
                                    {entryReceipt && (
                                        <li className="tc-row">
                                            <span className="tc-row__label">Entry Receipt</span>
                                            <span className="tc-row__value">
                                                {entryReceipt.entryState === 'charged'
                                                    ? `${formatTriviaDisplayNumber(entryReceipt.entryCost)} Diamonds Charged`
                                                    : ['free', 'vip', 'continuation'].includes(entryReceipt.entryState)
                                                        ? 'No Entry Charge'
                                                        : 'Confirmed In Settlement Receipt'}
                                            </span>
                                        </li>
                                    )}
                                    {entryReceipt?.sessionId && (
                                        <li className="tc-row">
                                            <span className="tc-row__label">Run Receipt</span>
                                            <span className="tc-row__value strategy-receipt-id">{entryReceipt.sessionId}</span>
                                        </li>
                                    )}
                                    {settlementReceipt?.settlementReference && (
                                        <li className="tc-row">
                                            <span className="tc-row__label">Settlement Reference</span>
                                            <span className="tc-row__value strategy-receipt-id">{settlementReceipt.settlementReference}</span>
                                        </li>
                                    )}
                                    {settlementReceipt?.scoreId && (
                                        <li className="tc-row">
                                            <span className="tc-row__label">Score Record</span>
                                            <span className="tc-row__value strategy-receipt-id">{settlementReceipt.scoreId}</span>
                                        </li>
                                    )}
                                    {settlementReceipt?.requestId && (
                                        <li className="tc-row">
                                            <span className="tc-row__label">Settlement Request</span>
                                            <span className="tc-row__value strategy-receipt-id">{settlementReceipt.requestId}</span>
                                        </li>
                                    )}
                                    {settlementReceipt?.resultHash && (
                                        <li className="tc-row">
                                            <span className="tc-row__label">Result Hash</span>
                                            <span className="tc-row__value strategy-receipt-id">{settlementReceipt.resultHash}</span>
                                        </li>
                                    )}
                                    {settlementReceipt?.submittedAt && Number.isFinite(Date.parse(settlementReceipt.submittedAt)) && (
                                        <li className="tc-row">
                                            <span className="tc-row__label">Settled At</span>
                                            <span className="tc-row__value">{new Date(settlementReceipt.submittedAt).toLocaleString()}</span>
                                        </li>
                                    )}
                                    {settlementReplayed && (
                                        <li className="tc-row">
                                            <span className="tc-row__label">Settlement State</span>
                                            <span className="tc-row__value tc-ink--blue">Recovered From Existing Receipt</span>
                                        </li>
                                    )}
                                    {userId && !settlementPending && (
                                        <li className="tc-row">
                                            <span className="tc-row__label">Your Balance</span>
                                            <span className="tc-row__value">{formatTriviaDisplayNumber(userDiamonds)} Diamonds</span>
                                        </li>
                                    )}
                                    {/* The Play Again plate is too narrow for the
                                        price, so the next entry is printed here. */}
                                    {!settlementPending && (
                                        <li className="tc-row">
                                            <span className="tc-row__label">Next Entry</span>
                                            <span className="tc-row__value">{isVip ? 'Free With VIP' : <>{entryCost} Diamonds</>}</span>
                                        </li>
                                    )}
                                </ul>

                                {Array.isArray(settlementReceipt?.transactions) && settlementReceipt.transactions.length > 0 && (
                                    <section className="strategy-transactions" aria-labelledby="strategy-transactions-heading">
                                        <h3 id="strategy-transactions-heading" className="tc-label">Diamond Transaction Record</h3>
                                        <ul className="tc-rows">
                                            {settlementReceipt.transactions.map((transaction, index) => (
                                                <li className="tc-row" key={transaction?.id || transaction?.referenceId || index}>
                                                    <span className="tc-row__label">
                                                        {toTitleCase(String(transaction?.role || 'Transaction').replace(/_/g, ' '))}
                                                    </span>
                                                    <span className="tc-row__value strategy-transaction-value">
                                                        {transaction?.amount !== null
                                                            && transaction?.amount !== undefined
                                                            && Number.isFinite(Number(transaction.amount))
                                                            ? `${Number(transaction.amount) > 0 ? '+' : ''}${formatTriviaDisplayNumber(Number(transaction.amount))} Diamonds`
                                                            : 'Recorded'}
                                                        {transaction?.referenceId ? ` | ${transaction.referenceId}` : ''}
                                                        {transaction?.id ? ` | ID ${transaction.id}` : ''}
                                                        {transaction?.balanceAfter !== null
                                                            && transaction?.balanceAfter !== undefined
                                                            && Number.isFinite(Number(transaction.balanceAfter))
                                                            ? ` | Balance ${formatTriviaDisplayNumber(Number(transaction.balanceAfter))}`
                                                            : ''}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </section>
                                )}

                                {resultCapped && (
                                    <p className="results-note tc-ink--gold">
                                        Daily Reward Cap Reached For {config.title}. Play For The Score, Come Back Tomorrow For More Diamonds.
                                    </p>
                                )}

                                {balanceRefreshDelayed && !settlementPending && (
                                    <p className="results-note tc-ink--gold" role="status">
                                        Settlement Is Confirmed, But The Wallet Balance Refresh Is Delayed. The Transaction Receipt Above Remains Authoritative.
                                    </p>
                                )}

                                {resultAwardError && (
                                    <p className="strategy-alert tc-ink--red" role="alert">
                                        The Settlement Receipt Is Still Pending ({toTitleCase(String(resultAwardError).replace(/_/g, ' '))}). Retry The Same Run; Do Not Start A New Entry.
                                        {/* finishGame reopened finishedRef on failure and
                                            the console action retries the same run. */}
                                    </p>
                                )}
                            </div>
                        );
                    })()}
                    </TriviaConsole>
                </div>
            </div>
        </PageTransition>
    );
}

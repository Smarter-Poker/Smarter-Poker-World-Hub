/**
 * ENDLESS MODE - All Categories Random
 * Route: /hub/trivia/endless
 *
 * Endless questions from ALL categories combined randomly.
 * Answer until you miss three (wrong answers and timeouts both count).
 *
 * Server-authoritative run: /api/trivia/session-start deals (and permutes)
 * one 100-question roster for the whole run, session-answer grades each tap
 * under the binding-first-answer rule, and session-submit caps and pays per
 * correct answer - the client never receives an answer key.
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import TriviaConsole from '../../../src/components/trivia/console/TriviaConsole';
import ResponsiveModeArt from '../../../src/components/trivia/console/ResponsiveModeArt';
import { TRIVIA_INTRO_ART_ENDLESS } from '../../../src/config/triviaIntroArt.mjs';
import { toTitleCase } from '../../../src/lib/trivia/titleCase';
import { formatTriviaDisplayNumber } from '../../../src/lib/trivia/formatTriviaDisplayNumber';
import DiamondEngine from '../../../src/services/DiamondEngine';
import GameCostPopup from '../../../src/components/gates/GameCostPopup';
import { busEmit } from '../../../src/engine/EventBus';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { playHeartbeat, closeHeartbeatAudio } from '../../../src/lib/heartbeatAudio';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import TriviaAnswerOption from '../../../src/components/trivia/TriviaAnswerOption';
import useTriviaQuestion from '../../../src/hooks/useTriviaQuestion';
import useTriviaTimer from '../../../src/hooks/useTriviaTimer';
import useServerGradedRun from '../../../src/hooks/useServerGradedRun';
import { isRetiredTriviaRunError } from '../../../src/lib/trivia/runRecoveryPolicy.mjs';
import { shareResult } from '../../../src/lib/trivia/shareResult';
import { DAILY_DIAMOND_CAPS } from '../../../src/lib/trivia/triviaEngine';
import ReportQuestionButton from '../../../src/components/trivia/ReportQuestionButton';
import { getAccessToken } from '../../../src/lib/authUtils';
import * as triviaAudio from '../../../src/lib/trivia/triviaAudio';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { readOwnProfile } from '../../../src/lib/ownProfile';
import {
    createAccountOperationScope,
    isStaleAccountOperation,
    shouldGateAccountOwnedRender,
} from '../../../src/lib/trivia/accountOperationScope.mjs';
import {
    isIneligibleEndlessHighScoreProjection,
    isPersistedEndlessHighScoreProjection,
    isTerminalEndlessHighScoreProjection,
} from '../../../src/lib/trivia/highScoreProjectionPolicy.mjs';
import Phase9SettlementReceipt from '../../../src/components/trivia/phase9/Phase9SettlementReceipt';
import Phase9RunReview from '../../../src/components/trivia/phase9/Phase9RunReview';
import { projectPhase9Recovery } from '../../../src/components/trivia/phase9/phase9RunModel.mjs';
import usePhase9ReducedMotion from '../../../src/components/trivia/phase9/usePhase9ReducedMotion';

const GAME_ENTRY_COST = 10; // restored with server-graded adoption - rewards pay via award_trivia_run now

// Roster size requested from /api/trivia/session-start. Endless ends on the
// third miss, which realistically lands well under 100 answers; unanswered
// served questions cost nothing (payout is per-correct and the submit omits
// them). If a player actually clears all 100, the run ends there - a fresh
// game is a fresh session.
const QUESTIONS_PER_SESSION = 100;

// The run ends on the third miss. Wrong answers and shot-clock timeouts both
// count; server-recorded paid skips do not.
const MAX_MISSES = 3;

// Daily cap comes from triviaEngine so the lobby price and the payout ceiling
// can never disagree. Display-only here: the ACTUAL clamp is applied by
// /api/trivia/session-submit when it settles the run.
const DAILY_DIAMOND_CAP = Number.isFinite(DAILY_DIAMOND_CAPS.endless) ? DAILY_DIAMOND_CAPS.endless : 40;

function authoritativeEndlessSettlement(settlement) {
    if (!Number.isInteger(settlement?.correct)
        || settlement.correct < 0
        || settlement.correct > QUESTIONS_PER_SESSION
        || !Number.isInteger(settlement?.diamondsAwarded)
        || settlement.diamondsAwarded < 0) return null;
    const projection = settlement?.highScoreProjection;
    if (isPersistedEndlessHighScoreProjection(projection)
        && projection.verifiedCorrect !== settlement.correct) return null;
    return {
        correct: settlement.correct,
        diamondsAwarded: settlement.diamondsAwarded,
    };
}

export default function EndlessModePage() {
    useTrainingBus('trivia-endless');
    const router = useRouter();
    const { user: avatarUser, loading: authLoading } = useAvatar();

    const [gameState, setGameState] = useState('ready'); // ready, playing, saving, saving_error, gameover
    const [questions, setQuestions] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    // TRAIN-WIRE-TRIVIA-HOOK-4 — selectedAnswer/showResult managed by shared hook
    const currentQuestion = questions[currentIndex];
    const trivia = useTriviaQuestion(currentQuestion);
    // TRAIN-WIRE-TRIVIA-TIMER-4 — shared shot-clock hook (autoResumeOnVisible=false: explicit Resume UI)
    const timer = useTriviaTimer({
        initialTime: 24,
        showResult: trivia.showResult,
        gameState,
        onTimeout: handleTimeOut,
        autoResumeOnVisible: false,
    });
    const [streak, setStreak] = useState(0);
    const [diamondsEarned, setDiamondsEarned] = useState(0);
    // Misses this run (wrong answers + timeouts). The third one ends the game.
    const [misses, setMisses] = useState(0);
    // What session-submit ACTUALLY credited after the server applied the daily
    // cap. The results screen used to render the raw client running total, so
    // a capped player was told they earned diamonds that never reached their
    // balance.
    const [awardedDiamonds, setAwardedDiamonds] = useState(null);
    const [settlementResult, setSettlementResult] = useState(null);
    const [userId, setUserId] = useState(null);
    const accountOperationScopeRef = useRef(null);
    if (!accountOperationScopeRef.current) {
        accountOperationScopeRef.current = createAccountOperationScope();
    }
    // Authentication loading is an authority boundary, not permission to
    // keep mutating the previously resolved account. The durable recovery
    // pointer remains account-scoped and is re-adopted after identity resolves.
    const resolvedAccountId = authLoading
        ? null
        : (avatarUser?.id || getAuthUser()?.id || null);
    accountOperationScopeRef.current.transition(resolvedAccountId);
    const [isLoading, setIsLoading] = useState(true);
    const [highScore, setHighScore] = useState(0);
    const [highScoreResolved, setHighScoreResolved] = useState(false);
    const [highScorePersistenceError, setHighScorePersistenceError] = useState('');
    const [confirmedNewHighScore, setConfirmedNewHighScore] = useState(false);
    const [isVip, setIsVip] = useState(false);
    const [showOutOfDiamonds, setShowOutOfDiamonds] = useState(false);
    // Settings panel visibility. Deliberately NOT part of the persisted
    // `settings` object — it used to be stored inside it, so localStorage
    // 'trivia_settings' carried showPanel:true and the panel auto-opened over
    // the board on every future session (and in survival-game, which shares
    // the same storage key).
    const [showSettingsPanel, setShowSettingsPanel] = useState(false);
    const [accessToken, setAccessToken] = useState(null);
    const [loadError, setLoadError] = useState(null);

    // Server-authoritative run: session-start deals, session-answer grades
    // each tap, session-submit caps and pays. No client-side crediting.
    const serverRun = useServerGradedRun('endless', { accountId: resolvedAccountId });
    // Current question's server verdict (wasCorrect / correctDisplayIndex);
    // null until session-answer resolves, cleared on advance. The reveal is
    // driven entirely from this - the client holds no answer key.
    const [verdict, setVerdict] = useState(null);
    // Locks taps from the moment of the tap until the question advances, so a
    // slow session-answer round-trip cannot accept a second answer.
    const answerLockRef = useRef(false);
    // Answers actually recorded by the server this game, in tap order:
    // { questionId, displayIndex }. This is what session-submit grades from;
    // paid skips are binding -1 answers with a separate immutable receipt.
    const sessionAnswersRef = useRef([]);
    const accountLoadRef = useRef(0);
    const accountIdentityRef = useRef(null);
    const startOperationRef = useRef(null);
    const forceNewStartRef = useRef(false);
    const answerOperationRef = useRef(null);
    const lifelineOperationRef = useRef(null);

    const [userDiamonds, setUserDiamonds] = useState(0);

    // Lifeline usage tracking (max 3 per game, skip costs 5 diamonds).
    // NOTE: the 50/50 and Double Chance lifelines are gone with the move to
    // server grading - 50/50 needs the answer key the client no longer
    // receives, and Double Chance needs a second attempt the binding
    // first-answer rule cannot honour. Skip survives through the dedicated
    // paid-skip authority, which atomically binds a distinct -1 answer.
    const [lifelinesUsedThisGame, setLifelinesUsedThisGame] = useState(0);
    const LIFELINE_COST = 5;
    const MAX_LIFELINES_PER_GAME = 3;
    // Only the server receipt owns entitlement and balance. A cached balance
    // or VIP read may be stale, so it must never block a valid request before
    // the paid-skip authority can answer (including an authoritative 402).
    const lifelineLocked = lifelinesUsedThisGame >= MAX_LIFELINES_PER_GAME;

    // Skip Question Lifeline state
    const [skipUsedThisQuestion, setSkipUsedThisQuestion] = useState(false);
    // Surfaced when a lifeline purchase or an answer submission fails (was
    // previously a console.warn only, so the button just looked dead).
    const [actionError, setActionError] = useState(null);
    const [timeoutRetryQuestionId, setTimeoutRetryQuestionId] = useState(null);
    const [isTimeoutRetrying, setIsTimeoutRetrying] = useState(false);

    // 24-Second Shot Clock State
    const [screenShake, setScreenShake] = useState(false);
    const [isPaused, setIsPaused] = useState(false); // Visibility-based pause
    const heartbeatIntervalRef = useRef(null);

    useEffect(() => {
        if (!authLoading) return;
        timer.setIsTimerRunning(false);
        setIsPaused(true);
        setGameState(previous => previous === 'ready' ? previous : 'ready');
    }, [authLoading, timer.setIsTimerRunning]);

    // Refs to avoid stale closures in setTimeout-triggered saveGameResult
    const streakRef = useRef(0);
    const diamondsEarnedRef = useRef(0);
    const missesRef = useRef(0);
    const currentIndexRef = useRef(0);
    const answerTimeoutRef = useRef(null); // Cleanup on unmount
    const isStartingRef = useRef(false); // Prevent double-click race
    // FIX(audit #8): synchronous in-flight lock for paid lifelines. The "used"
    // state flags are set only AFTER the awaited charge, so a double-tap
    // passed the guards twice and produced two deductions for a single
    // lifeline.
    const lifelineBusyRef = useRef(false);

    // Game Settings (persist to localStorage)
    const [settings, setSettings] = useState({
        haptics: true,      // Vibration feedback
        audio: true,        // Heartbeat sounds
        screenShake: true,  // Screen shake effect
        intensity: 'high'   // 'low', 'medium', 'high'
    });

    const startTimeRef = useRef(null);
    const [gameDurationSec, setGameDurationSec] = useState(0);
    const reduceMotion = usePhase9ReducedMotion();

    // ── SOUND: one switch, globally ──────────────────────────────────
    // triviaAudio owns the mute flag for the whole trivia system. This page
    // used to keep an independent `settings.audio` boolean, so muting here left
    // TriviaGame loud (and vice versa) — three separate mute switches in total.
    // settings.audio is now a read-only mirror of !triviaAudio.isMuted().
    useEffect(() => {
        const sync = (m) => setSettings(prev => (prev.audio === !m ? prev : { ...prev, audio: !m }));
        sync(triviaAudio.isMuted());
        return triviaAudio.onMuteChange(sync);
    }, []);

    // Initialize
    useEffect(() => {
        if (authLoading) return;
        const resolvedUser = avatarUser || getAuthUser();
        const nextAccountId = resolvedUser?.id || null;
        const identityChanged = accountIdentityRef.current !== nextAccountId;
        accountIdentityRef.current = nextAccountId;
        const operationScope = accountOperationScopeRef.current.transition(nextAccountId);
        const request = ++accountLoadRef.current;
        let cancelled = false;
        const isCurrent = () => !cancelled
            && accountLoadRef.current === request
            && accountOperationScopeRef.current.isCurrent(operationScope);
        if (identityChanged) {
            startOperationRef.current = null;
            forceNewStartRef.current = false;
            answerOperationRef.current = null;
            lifelineOperationRef.current = null;
            isStartingRef.current = false;
            answerLockRef.current = false;
            lifelineBusyRef.current = false;
            savePhaseRef.current = 0;
            serverResultRef.current = null;
            sessionAnswersRef.current = [];
            setQuestions([]);
            setUserDiamonds(0);
            setIsVip(false);
            setAccessToken(null);
            setAwardedDiamonds(null);
            setSettlementResult(null);
            setSaveErrorPayload(null);
            setActionError(null);
            setStreak(0);
            setDiamondsEarned(0);
            setMisses(0);
            setLifelinesUsedThisGame(0);
            setSkipUsedThisQuestion(false);
            setTimeoutRetryQuestionId(null);
            setIsTimeoutRetrying(false);
            setHighScore(0);
            setHighScoreResolved(false);
            setHighScorePersistenceError('');
            setConfirmedNewHighScore(false);
            streakRef.current = 0;
            diamondsEarnedRef.current = 0;
            missesRef.current = 0;
            currentIndexRef.current = 0;
            setGameState('ready');
        }
        async function init() {
            const user = resolvedUser;
            if (user) {
                setUserId(user.id);
                try { setAccessToken(getAccessToken()); } catch (e) { /* anonymous report still allowed */ }
                // Check VIP status
                await DiamondEngine.init(user.id);
                const vipStatus = await DiamondEngine.isVIP();
                if (!isCurrent()) return;
                setIsVip(vipStatus);
                // Load the read-only public projection for the lobby. A failed
                // read is not a zero score; completed runs are compared and
                // projected by the server settlement authority below.
                try {
                    const { data, error } = await supabase
                        .from('endless_high_scores')
                        .select('high_score')
                        .eq('user_id', user.id)
                        .eq('mode', 'random')
                        .maybeSingle();
                    if (!isCurrent()) return;
                    if (error) throw error;
                    setHighScore(data?.high_score || 0);
                    setHighScoreResolved(true);
                    setHighScorePersistenceError('');
                } catch (e) {
                    console.warn('[Endless] High-score read failed:', e?.message || e);
                    if (isCurrent()) {
                        setHighScorePersistenceError('Your Existing High Score Could Not Be Displayed. Completed Runs Still Use The Server-Owned Record Authority.');
                    }
                }
                // Load user diamonds
                try {
                    const { data: profile } = await readOwnProfile(supabase, 'diamonds', { expectId: user.id });
                    if (!isCurrent()) return;
                    if (profile) setUserDiamonds(profile.diamonds || 0);
                } catch (e) {
                    console.warn('Failed to load diamonds:', e);
                }
            } else {
                // Account-scoped recovery must never inherit the previous
                // browser user's custody key after a sign-out/account switch.
                setUserId(null);
                setAccessToken(null);
                setIsVip(false);
                setUserDiamonds(0);
            }
            // Load settings from the shared 'trivia_settings' store that
            // /hub/trivia/settings now writes to (one settings system).
            // showPanel is stripped: it is component state, never persisted.
            try {
                const savedSettings = localStorage.getItem('trivia_settings');
                if (savedSettings) {
                    const parsed = JSON.parse(savedSettings) || {};
                    delete parsed.showPanel;
                    // `audio` is owned by triviaAudio (see the mirror effect
                    // below), not by this blob — otherwise a stale copy here
                    // silently un-mutes a player who muted somewhere else.
                    delete parsed.audio;
                    setSettings(prev => ({ ...prev, ...parsed }));
                }
            } catch (e) { console.warn("[endless.js]", e); }

            // Questions are dealt by the server when a game starts - nothing
            // to preload here.
            if (!isCurrent()) return;
            setIsLoading(false);
        }
        init();
        return () => { cancelled = true; };
    }, [avatarUser?.id, authLoading]);

    // Realtime: Refresh data when scores/diamonds change
    useEffect(() => {
        if (!userId) return;
        const _ch = supabase
            .channel(`trivia-endless:${userId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'endless_high_scores', filter: `user_id=eq.${userId}` }, async () => {
                const operationScope = accountOperationScopeRef.current.capture();
                if (operationScope.identity !== userId) return;
                try {
                    const { data, error } = await supabase.from('endless_high_scores').select('high_score').eq('user_id', userId).eq('mode', 'random').maybeSingle();
                    if (!accountOperationScopeRef.current.isCurrent(operationScope)) return;
                    if (error) {
                        setHighScorePersistenceError('Your High Score Could Not Be Refreshed. Only A Server-Confirmed Projection Can Show A Record.');
                    } else {
                        setHighScore(data?.high_score || 0);
                        setHighScoreResolved(true);
                        setHighScorePersistenceError('');
                    }
                    const { data: profile } = await readOwnProfile(supabase, 'diamonds', { expectId: userId });
                    if (!accountOperationScopeRef.current.isCurrent(operationScope)) return;
                    if (profile) setUserDiamonds(profile.diamonds || 0);
                } catch (e) {
                    if (!accountOperationScopeRef.current.isCurrent(operationScope)) return;
                    console.warn('[Endless] Realtime refresh failed:', e);
                    setHighScorePersistenceError('Your High Score Could Not Be Refreshed. Only A Server-Confirmed Projection Can Show A Record.');
                }
            })
            .subscribe();
        return () => { supabase.removeChannel(_ch); };
    }, [userId]);

    function applyAuthoritativeHighScoreProjection(
        settlement,
        operationScope = accountOperationScopeRef.current.capture(),
    ) {
        if (operationScope.identity !== (userId || null)
            || !accountOperationScopeRef.current.isCurrent(operationScope)) return false;
        const projection = settlement?.highScoreProjection;
        if (isPersistedEndlessHighScoreProjection(projection)
            && projection.verifiedCorrect === settlement?.correct) {
            setHighScore(projection.highScore);
            setHighScoreResolved(true);
            setConfirmedNewHighScore(projection.improved);
            setHighScorePersistenceError('');
            return true;
        }
        setConfirmedNewHighScore(false);
        if (isIneligibleEndlessHighScoreProjection(projection)) {
            setHighScorePersistenceError('Your Run And Diamond Award Were Settled, But This Recovered Run Is Not Eligible For A High-Score Projection. No Record Claim Is Being Shown.');
            return true;
        }
        setHighScorePersistenceError('Your Run And Diamond Award Were Settled, But The Server High-Score Projection Is Still Pending. No Record Claim Is Being Shown.');
        return false;
    }

    // Save settings to localStorage when changed. Merges into whatever the
    // settings page stored so this page never clobbers keys it doesn't own
    // (difficulty / timerEnabled / hintsEnabled live in the same object).
    useEffect(() => {
        try {
            let existing = {};
            try { existing = JSON.parse(localStorage.getItem('trivia_settings') || '{}') || {}; } catch (e) { existing = {}; }
            const { showPanel: _drop, ...persistable } = settings;
            localStorage.setItem('trivia_settings', JSON.stringify({ ...existing, ...persistable }));
        } catch (e) { console.warn("[endless.js]", e); }
    }, [settings]);

    // Unmount-only cleanup for the question-advance timeout.
    //
    // This used to live in the per-tick side-effect cleanup below. Because that
    // effect re-runs on every timer tick / showResult flip, answering a question
    // scheduled the advance timeout and the effect's PREVIOUS cleanup then
    // cancelled it microseconds later — the board froze on the revealed answer
    // and never advanced, never saved and never reached game over. Keeping the
    // clear here means it only fires when the page actually unmounts.
    useEffect(() => {
        return () => {
            if (answerTimeoutRef.current) clearTimeout(answerTimeoutRef.current);
        };
    }, []);

    // Visibility-based pause: sets overlay UI (timer stopped by useTriviaTimer; resume is explicit here)
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden && timer.isTimerRunning) setIsPaused(true);
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [timer.isTimerRunning]);

    async function resumeServerRun() {
        if (isStartingRef.current) return;
        if (!userId) {
            router.push('/auth/login?redirect=/hub/trivia/endless');
            return;
        }
        const operationScope = accountOperationScopeRef.current.capture();
        if (operationScope.identity !== userId) return;
        const startOperation = { operationScope };
        isStartingRef.current = true;
        startOperationRef.current = startOperation;
        setIsLoading(true);
        setLoadError(null);
        try {
            let resumed = await serverRun.resume({ count: QUESTIONS_PER_SESSION });
            if (!accountOperationScopeRef.current.isCurrent(operationScope)) return;
            if (resumed?.resumedSettlement && resumed.settlement) {
                const settled = resumed.settlement;
                const authority = authoritativeEndlessSettlement(settled);
                if (!authority) throw new Error('invalid_endless_settlement_authority');
                serverResultRef.current = settled;
                setSettlementResult(settled);
                const correct = authority.correct;
                const awarded = authority.diamondsAwarded;
                streakRef.current = correct;
                diamondsEarnedRef.current = correct;
                setStreak(correct);
                setDiamondsEarned(correct);
                setAwardedDiamonds(awarded);
                applyAuthoritativeHighScoreProjection(settled, operationScope);
                setGameState('gameover');
                return;
            }

            // A reload can occur after the shot clock expired but before the
            // binding -1 receipt reached the browser. Replay that exact,
            // account/session-scoped mutation before gameplay is enabled.
            let timeoutReplayFailure = null;
            let timeoutReplayTerminal = false;
            const pendingTimeoutQuestionId = resumed?.pendingTimeoutQuestionId;
            if (typeof pendingTimeoutQuestionId === 'string') {
                try {
                    const receipt = await serverRun.answer({
                        questionId: pendingTimeoutQuestionId,
                        displayIndex: -1,
                    });
                    if (!accountOperationScopeRef.current.isCurrent(operationScope)) return;
                    resumed = {
                        ...resumed,
                        pendingTimeoutQuestionId: null,
                        nonPaidMissCount: Number.isInteger(receipt?.nonPaidMissCount)
                            ? receipt.nonPaidMissCount
                            : resumed.nonPaidMissCount,
                        runMissLimitReached: typeof receipt?.runMissLimitReached === 'boolean'
                            ? receipt.runMissLimitReached
                            : resumed.runMissLimitReached,
                        questions: (Array.isArray(resumed.questions) ? resumed.questions : []).map(question => (
                            question?.id === pendingTimeoutQuestionId
                                ? {
                                    ...question,
                                    state: 'answered',
                                    answerState: {
                                        storedDisplayIndex: -1,
                                        wasCorrect: receipt?.wasCorrect === true,
                                        correctDisplayIndex: Number.isInteger(receipt?.correctDisplayIndex)
                                            ? receipt.correctDisplayIndex
                                            : -1,
                                        outcome: receipt?.outcome || 'skip',
                                        explanation: typeof receipt?.explanation === 'string' ? receipt.explanation : null,
                                        ...(receipt?.voided === true ? { voided: true } : {}),
                                    },
                                }
                                : question
                        )),
                    };
                } catch (error) {
                    if (!accountOperationScopeRef.current.isCurrent(operationScope)
                        || isStaleAccountOperation(error)) return;
                    const code = error?.payload?.error || error?.code || error?.message;
                    if (code === 'run_miss_limit_reached') {
                        timeoutReplayTerminal = true;
                        resumed = {
                            ...resumed,
                            nonPaidMissCount: Number.isInteger(error?.payload?.nonPaidMissCount)
                                ? error.payload.nonPaidMissCount
                                : resumed.nonPaidMissCount,
                            runMissLimitReached: true,
                        };
                    } else {
                        timeoutReplayFailure = {
                            questionId: code === 'position_out_of_order'
                                && typeof error?.payload?.priorQuestionId === 'string'
                                ? error.payload.priorQuestionId
                                : pendingTimeoutQuestionId,
                            message: code === 'position_out_of_order'
                                ? 'An Earlier Expired Question Still Needs Server Confirmation. Confirm It Before The Run Resumes.'
                                : 'The Expired Answer Is Still Waiting For Server Confirmation. Retry It To Resume This Run.',
                        };
                    }
                }
            }

            const resumedQuestions = Array.isArray(resumed?.questions) ? resumed.questions : [];
            if (resumedQuestions.length === 0) throw new Error('resume_questions_missing');
            if (!Number.isInteger(resumed?.nonPaidMissCount)
                || resumed.nonPaidMissCount < 0
                || typeof resumed?.runMissLimitReached !== 'boolean') {
                throw new Error('resume_run_boundary_missing');
            }
            const projection = projectPhase9Recovery(resumedQuestions, {
                authoritativeFailureCount: resumed.nonPaidMissCount,
            });
            setQuestions(resumedQuestions);
            sessionAnswersRef.current = projection.recordedAnswers;
            streakRef.current = projection.correctCount;
            diamondsEarnedRef.current = projection.correctCount;
            missesRef.current = projection.wrongCount;
            currentIndexRef.current = Math.min(projection.questionIndex, Math.max(0, resumedQuestions.length - 1));
            setStreak(projection.correctCount);
            setDiamondsEarned(projection.correctCount);
            setMisses(projection.wrongCount);
            setCurrentIndex(currentIndexRef.current);
            setAwardedDiamonds(null);
            setSettlementResult(null);
            setVerdict(null);
            setIsPaused(false);
            setGameDurationSec(0);
            setLifelinesUsedThisGame(Math.min(
                MAX_LIFELINES_PER_GAME,
                Math.max(0, Number(resumed.paidSkipCount) || 0),
            ));
            setConfirmedNewHighScore(false);
            startTimeRef.current = Date.now();

            if (timeoutReplayFailure) {
                if (!holdExpiredQuestionForRetry(
                    timeoutReplayFailure.questionId,
                    resumedQuestions,
                    timeoutReplayFailure.message,
                )) throw new Error('resume_timeout_question_missing');
                setGameState('playing');
                return;
            }

            setTimeoutRetryQuestionId(null);
            setIsTimeoutRetrying(false);
            answerLockRef.current = false;
            trivia.reset();
            timer.resetTimer();

            if (timeoutReplayTerminal || projection.complete || resumed.runMissLimitReached === true
                || projection.wrongCount >= MAX_MISSES) {
                setGameState('saving');
                await saveGameResult(operationScope);
            } else {
                setGameState('playing');
            }
        } catch (error) {
            if (!accountOperationScopeRef.current.isCurrent(operationScope)
                || isStaleAccountOperation(error)) return;
            console.warn('[Endless] Resume failed:', error?.message || error);
            setLoadError('Could Not Resume This Account-Scoped Run. Check Your Connection And Try Again.');
            setGameState('ready');
        } finally {
            if (startOperationRef.current === startOperation) {
                startOperationRef.current = null;
                isStartingRef.current = false;
                if (accountOperationScopeRef.current.isCurrent(operationScope)) setIsLoading(false);
            }
        }
    }

    async function startGame() {
        const forceNew = forceNewStartRef.current;
        forceNewStartRef.current = false;
        if (!userId) {
            setLoadError('Please Sign In To Play Endless Trivia.');
            return;
        }
        if (!forceNew && serverRun.hasRecoverableSession) return resumeServerRun();
        if (isStartingRef.current) return;
        const operationScope = accountOperationScopeRef.current.capture();
        if (operationScope.identity !== (userId || null)) return;
        const startOperation = { operationScope };
        isStartingRef.current = true;
        startOperationRef.current = startOperation;
        try {
        setLoadError(null);

        // Reset the per-game save pipeline. This is also the "Play Again"
        // path - a stale phase or settlement from the previous game would
        // make this game skip its own submit and re-report the old numbers.
        savePhaseRef.current = 0;
        serverResultRef.current = null;
        sessionAnswersRef.current = [];
        setSaveErrorPayload(null);
        setSettlementResult(null);
        setConfirmedNewHighScore(false);

        // Open the server session BEFORE any charge, so a start failure can
        // never eat an entry fee. The served questions are used VERBATIM -
        // their options are already permuted into grading order, so
        // reshuffling them would break the display-index mapping the grader
        // uses. One session serves the whole run; there are no mid-run
        // refills any more.
        let served;
        setIsLoading(true);
        try {
            served = await serverRun.start({ count: QUESTIONS_PER_SESSION });
            if (!accountOperationScopeRef.current.isCurrent(operationScope)) return;
        } catch (e) {
            console.warn('[Endless] Server session start failed:', e?.message || e);
            if (!accountOperationScopeRef.current.isCurrent(operationScope)
                || isStaleAccountOperation(e)) return;
            // A 402 is the balance gate, not a connection problem: show the
            // Not Enough Diamonds state alone instead of both messages.
            if (e?.status === 402) {
                setShowOutOfDiamonds(true);
                return;
            }
            setLoadError('We Could Not Load Any Questions Right Now. Please Check Your Connection And Try Again.');
            return;
        } finally {
            if (accountOperationScopeRef.current.isCurrent(operationScope)) setIsLoading(false);
        }
        if (!served || !Array.isArray(served.questions) || served.questions.length === 0) {
            // Preserve the durable start pointer: the server may already have
            // charged this session. Retry must re-adopt that same entry rather
            // than erase custody and create a second charge.
            setLoadError('We Could Not Confirm The Dealt Questions. Retry This Same Entry Request.');
            return;
        }

        if (Number.isFinite(served.newBalance)) setUserDiamonds(served.newBalance);
        if (served.entryState === 'charged' && served.entryCost > 0) {
            busEmit.diamondsSpent(served.entryCost, 'Endless entry');
        }
        setQuestions(served.questions);
        setGameState('playing');
        setStreak(0);
        setDiamondsEarned(0);
        setMisses(0);
        setCurrentIndex(0);
        setGameDurationSec(0);
        streakRef.current = 0;
        diamondsEarnedRef.current = 0;
        missesRef.current = 0;
        setAwardedDiamonds(null);
        currentIndexRef.current = 0;
        setVerdict(null);
        answerLockRef.current = false;
        trivia.reset();
        // Reset all lifeline states for new game
        setSkipUsedThisQuestion(false);
        setTimeoutRetryQuestionId(null);
        setIsTimeoutRetrying(false);
        setActionError(null);
        setLifelinesUsedThisGame(Math.min(
            MAX_LIFELINES_PER_GAME,
            Math.max(0, Number(served.paidSkipCount) || 0),
        ));
        // Start shot clock
        timer.resetTimer();
        setScreenShake(false);
        startTimeRef.current = Date.now();
        } finally {
            if (startOperationRef.current === startOperation) {
                startOperationRef.current = null;
                isStartingRef.current = false;
            }
        }
    }

    // Side-effects of timer tick: haptics, screenShake, heartbeat audio.
    // useTriviaTimer owns the countdown; this effect only reacts to timer.timeLeft changes.
    useEffect(() => {
        if (!timer.isTimerRunning || trivia.showResult || reduceMotion) {
            if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
            setScreenShake(false);
            return;
        }

        const intensityMultiplier = settings.intensity === 'high' ? 1 : settings.intensity === 'medium' ? 0.6 : 0.3;
        const t = timer.timeLeft;

        // Haptic feedback (if enabled)
        if (!reduceMotion && settings.haptics && 'vibrate' in navigator) {
            const baseVibration = t <= 3 ? 100 : t <= 8 ? 50 : 20;
            navigator.vibrate(Math.round(baseVibration * intensityMultiplier));
        }

        // Screen shake (if enabled)
        if (!reduceMotion && settings.screenShake && t <= 3 && t > 0) setScreenShake(true);
        else setScreenShake(false);

        // Heartbeat audio (if enabled)
        if (!reduceMotion && settings.audio && t <= 8 && t > 0) {
            const volume = 0.3 * intensityMultiplier;
            const speed = Math.max(200, 600 - ((8 - t) * 50));
            if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = setInterval(() => playHeartbeat(volume), speed);
            playHeartbeat(volume);
        } else {
            if (heartbeatIntervalRef.current) { clearInterval(heartbeatIntervalRef.current); heartbeatIntervalRef.current = null; }
            closeHeartbeatAudio();
        }

        return () => {
            // NOTE: do NOT clear answerTimeoutRef here. This effect re-runs on
            // every tick, and its cleanup would cancel the just-scheduled
            // question-advance timeout, soft-locking the game. Unmount cleanup
            // for that timeout lives in its own effect above.
            if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
            closeHeartbeatAudio();
        };
    }, [timer.isTimerRunning, trivia.showResult, timer.timeLeft, settings, reduceMotion]);

    // Handle timeout - one miss, not instant game over. The timeout is
    // recorded server-side as a skip (displayIndex -1), which session-answer
    // grades as wrong, so the verdict path counts the miss and reveals the
    // correct answer exactly like a wrong tap.
    function handleTimeOut() {
        timer.setIsTimerRunning(false);
        setScreenShake(false);
        if (authLoading) return;
        if (!reduceMotion && 'vibrate' in navigator) navigator.vibrate([200, 100, 200]);
        gradeAnswer(-1);
    }

    function holdExpiredQuestionForRetry(questionId, roster = questions, message = null) {
        const retryIndex = roster.findIndex(question => question?.id === questionId);
        if (retryIndex < 0) return false;
        setCurrentIndex(retryIndex);
        currentIndexRef.current = retryIndex;
        setVerdict(null);
        trivia.reset();
        setSkipUsedThisQuestion(false);
        setTimeoutRetryQuestionId(questionId);
        setIsTimeoutRetrying(false);
        setIsPaused(false);
        answerLockRef.current = true;
        timer.setIsTimerRunning(false);
        setActionError(message || 'Time Expired. Confirm This Exact Expired Answer With The Server Before Play Can Continue.');
        return true;
    }

    function retryExpiredQuestion() {
        gradeAnswer(-1, { allowPendingTimeoutRetry: true });
    }

    function leaveRetiredRun(error) {
        if (!isRetiredTriviaRunError(error)) return false;
        serverRun.reset();
        answerLockRef.current = false;
        lifelineBusyRef.current = false;
        sessionAnswersRef.current = [];
        serverResultRef.current = null;
        savePhaseRef.current = 0;
        setQuestions([]);
        setTimeoutRetryQuestionId(null);
        setIsTimeoutRetrying(false);
        setSkipUsedThisQuestion(false);
        setActionError(null);
        setSaveErrorPayload(null);
        setSettlementResult(null);
        setAwardedDiamonds(null);
        setGameState('ready');
        setLoadError('That Server Run Is Closed Or Expired. Its Custody Was Retired; Start A Fresh Run.');
        timer.setIsTimerRunning(false);
        return true;
    }

    function finalizeDuration() {
        if (startTimeRef.current) {
            setGameDurationSec(Math.max(0, Math.round((Date.now() - startTimeRef.current) / 1000)));
        }
    }

    // The server atomically derives VIP/price, locks the run, enforces the
    // three-skip cap, posts the Diamond debit (when owed), records the binding
    // -1 answer and returns one immutable receipt. Retrying this exact
    // session/question replays that receipt without another debit.
    async function useSkipQuestion() {
        const operationScope = accountOperationScopeRef.current.capture();
        if (operationScope.identity !== (userId || null)) return;
        if (trivia.showResult || skipUsedThisQuestion || answerLockRef.current) return;
        const question = questions[currentIndexRef.current];
        const sessionId = serverRun.sessionId;
        if (!question?.id || !sessionId) return;
        if (lifelinesUsedThisGame >= MAX_LIFELINES_PER_GAME) {
            // Lifeline limit reached — silently prevent
            return;
        }
        // FIX(audit #8): synchronous lock BEFORE the awaited charge — the state
        // guards above don't re-render fast enough to stop a double-tap, which
        // charged twice and skipped two questions.
        if (lifelineBusyRef.current) return;
        const lifelineOperation = { operationScope };
        lifelineBusyRef.current = true;
        lifelineOperationRef.current = lifelineOperation;
        answerLockRef.current = true;
        setSkipUsedThisQuestion(true);
        timer.setIsTimerRunning(false);
        let completed = false;
        try {
            const skipReceipt = await serverRun.paidSkip({ questionId: question.id });
            if (!accountOperationScopeRef.current.isCurrent(operationScope)) return;
            if (!skipReceipt || skipReceipt.storedDisplayIndex !== -1
                || skipReceipt.outcome !== 'skip'
                || !Number.isInteger(skipReceipt.paidSkipCount)
                || skipReceipt.paidSkipCount < 1
                || skipReceipt.paidSkipCount > MAX_LIFELINES_PER_GAME
                || !Number.isInteger(skipReceipt.nonPaidMissCount)
                || skipReceipt.nonPaidMissCount < 0
                || typeof skipReceipt.runMissLimitReached !== 'boolean') {
                throw new Error('paid_skip_not_recorded');
            }
            setUserDiamonds(skipReceipt.newBalance);
            // `vip`/`entitlementWasVip` describe the original immutable
            // transaction. The separately locked profile projection is the
            // only receipt field that may update the current membership UI.
            setIsVip(skipReceipt.currentVipEligible === true);
            if (skipReceipt.newlyCharged && skipReceipt.diamondsCharged > 0) {
                busEmit.diamondsSpent(skipReceipt.diamondsCharged, 'trivia_lifeline');
            }
            if (!sessionAnswersRef.current.some(answer => answer.questionId === question.id)) {
                sessionAnswersRef.current.push({ questionId: question.id, displayIndex: -1 });
            }
            setLifelinesUsedThisGame(skipReceipt.paidSkipCount);
            const authoritativeMisses = Math.min(MAX_MISSES, skipReceipt.nonPaidMissCount);
            missesRef.current = authoritativeMisses;
            setMisses(authoritativeMisses);

            completed = true;

            // A replay can report that another device already reached the
            // terminal miss boundary after this skip originally committed.
            // Settle instead of advancing into a server-refused answer.
            if (skipReceipt.runMissLimitReached) {
                endRun(operationScope);
                return;
            }

            // Move to next question without penalty (keep streak). If the
            // roster somehow runs out, end the run instead of advancing into
            // an empty board.
            if (currentIndexRef.current + 1 >= questions.length) {
                endRun(operationScope);
                return;
            }
            setCurrentIndex(prev => { const next = prev + 1; currentIndexRef.current = next; return next; });
            trivia.reset();
            setVerdict(null);
            setSkipUsedThisQuestion(false);
            answerLockRef.current = false;
            timer.resetTimer();
        } catch (error) {
            if (!accountOperationScopeRef.current.isCurrent(operationScope)
                || isStaleAccountOperation(error)) return;
            console.warn('[Endless] Paid skip record failed:', error?.message || error);
            const code = error?.payload?.error || error?.code || error?.message;
            if (leaveRetiredRun(error)) {
                completed = true;
                return;
            }
            if (Number.isInteger(error?.payload?.newBalance)) {
                setUserDiamonds(error.payload.newBalance);
            }
            if (Number.isInteger(error?.payload?.paidSkipCount)) {
                setLifelinesUsedThisGame(Math.min(MAX_LIFELINES_PER_GAME, error.payload.paidSkipCount));
            }
            if (Number.isInteger(error?.payload?.nonPaidMissCount)) {
                const authoritativeMisses = Math.min(MAX_MISSES, Math.max(0, error.payload.nonPaidMissCount));
                missesRef.current = authoritativeMisses;
                setMisses(authoritativeMisses);
            }
            if (code === 'position_out_of_order') {
                completed = true;
                const priorQuestionId = typeof error?.payload?.priorQuestionId === 'string'
                    ? error.payload.priorQuestionId
                    : null;
                if (!priorQuestionId || !holdExpiredQuestionForRetry(
                    priorQuestionId,
                    questions,
                    'An Earlier Expired Question Still Needs Server Confirmation Before A Paid Skip Can Be Used.',
                )) {
                    setTimeoutRetryQuestionId(null);
                    setIsTimeoutRetrying(false);
                    answerLockRef.current = true;
                    timer.setIsTimerRunning(false);
                    setActionError('The Server Requested An Earlier Question That Is Missing From This Run. Reload And Resume The Same Run Before Continuing.');
                }
            } else if (error?.status === 402 || code === 'insufficient_diamonds') {
                setShowOutOfDiamonds(true);
                setActionError(null);
            } else if (code === 'paid_skip_limit_reached') {
                setActionError('The Server-Verified Three-Skip Limit Has Been Reached For This Run.');
            } else if (code === 'run_miss_limit_reached') {
                completed = true;
                setActionError(null);
                endRun(operationScope);
            } else {
                setActionError('The Skip Was Not Confirmed. Retry This Question; A Committed Receipt Cannot Charge Twice.');
            }
        } finally {
            if (!completed && accountOperationScopeRef.current.isCurrent(operationScope)) {
                answerLockRef.current = false;
                setSkipUsedThisQuestion(false);
                timer.setIsTimerRunning(true);
            }
            if (lifelineOperationRef.current === lifelineOperation) {
                lifelineOperationRef.current = null;
                lifelineBusyRef.current = false;
            }
        }
    }

    // Per-answer server grading. Lock the tap immediately, record it with
    // /api/trivia/session-answer (the first answer per question is BINDING
    // server-side), then reveal from the verdict. Positive-answer failures
    // unlock for another tap. A failed shot-clock
    // timeout never advances locally: its exact -1 mutation remains locked to
    // this question until the idempotent server receipt succeeds.
    async function gradeAnswer(displayIndex, { allowPendingTimeoutRetry = false } = {}) {
        const operationScope = accountOperationScopeRef.current.capture();
        if (operationScope.identity !== (userId || null)) return;
        const q = questions[currentIndex];
        if (!q || typeof q.id !== 'string') return;
        const pendingTimeoutId = timeoutRetryQuestionId || serverRun.pendingTimeoutQuestionId;
        const retryingTimeout = displayIndex === -1
            && allowPendingTimeoutRetry
            && pendingTimeoutId === q.id;
        if (answerOperationRef.current) return;
        if ((answerLockRef.current && !retryingTimeout) || trivia.showResult) return;
        const answerOperation = { operationScope, questionId: q.id };
        answerLockRef.current = true;
        answerOperationRef.current = answerOperation;
        timer.setIsTimerRunning(false);
        if (displayIndex === -1) {
            setTimeoutRetryQuestionId(q.id);
            setIsTimeoutRetrying(true);
        }
        if (displayIndex >= 0) trivia.setSelectedAnswer(displayIndex); // instant visual lock on the tap
        try {
            const v = await serverRun.answer({ questionId: q.id, displayIndex });
            if (!accountOperationScopeRef.current.isCurrent(operationScope)) return;
            if (displayIndex === -1) {
                setTimeoutRetryQuestionId(null);
                setIsTimeoutRetrying(false);
                setActionError(null);
            }
            applyVerdict(q, displayIndex, v, operationScope);
        } catch (e) {
            console.warn('[Endless] Answer grading failed:', e?.message || e);
            if (!accountOperationScopeRef.current.isCurrent(operationScope)
                || isStaleAccountOperation(e)) return;
            const code = e?.payload?.error || e?.code || e?.message;
            if (leaveRetiredRun(e)) return;
            if (Number.isInteger(e?.payload?.nonPaidMissCount)) {
                const authoritativeMisses = Math.min(MAX_MISSES, Math.max(0, e.payload.nonPaidMissCount));
                missesRef.current = authoritativeMisses;
                setMisses(authoritativeMisses);
            }
            if (code === 'run_miss_limit_reached') {
                setTimeoutRetryQuestionId(null);
                setIsTimeoutRetrying(false);
                endRun(operationScope);
            } else if (code === 'position_out_of_order') {
                const priorQuestionId = typeof e?.payload?.priorQuestionId === 'string'
                    ? e.payload.priorQuestionId
                    : null;
                if (!priorQuestionId || !holdExpiredQuestionForRetry(
                    priorQuestionId,
                    questions,
                    'An Earlier Expired Question Still Needs Server Confirmation. Confirm It Before Returning To This Question.',
                )) {
                    setTimeoutRetryQuestionId(null);
                    setIsTimeoutRetrying(false);
                    answerLockRef.current = true;
                    timer.setIsTimerRunning(false);
                    setActionError('The Server Requested An Earlier Question That Is Missing From This Run. Reload And Resume The Same Run Before Continuing.');
                }
            } else if (displayIndex < 0) {
                // Fail closed on the same expired question. The hook retained
                // its durable pendingTimeoutQuestionId before transport, so
                // this explicit retry can safely replay the exact -1 write.
                holdExpiredQuestionForRetry(q.id);
            } else {
                // Unlock and let the player re-tap; give the shot clock back.
                trivia.setSelectedAnswer(null);
                answerLockRef.current = false;
                setActionError('Could Not Submit That Answer. Please Tap It Again.');
                setTimeout(() => {
                    if (accountOperationScopeRef.current.isCurrent(operationScope)) setActionError(null);
                }, 3000);
                timer.setIsTimerRunning(true);
            }
        } finally {
            if (answerOperationRef.current === answerOperation) answerOperationRef.current = null;
        }
    }

    // Side effects that used to key off the client-computed correct_index now
    // key off the server verdict. Zero answer-key reads in the play path.
    function applyVerdict(q, displayIndex, v, operationScope) {
        setVerdict(v);
        trivia.setShowResult(true);
        sessionAnswersRef.current.push({ questionId: q.id, displayIndex });

        const hasAuthoritativeMissCount = Number.isInteger(v?.nonPaidMissCount)
            && v.nonPaidMissCount >= 0;
        const authoritativeMissCount = hasAuthoritativeMissCount
            ? Math.min(MAX_MISSES, v.nonPaidMissCount)
            : null;
        if (hasAuthoritativeMissCount) {
            missesRef.current = authoritativeMissCount;
            setMisses(authoritativeMissCount);
        }

        if (v?.wasCorrect === true) {
            // Server payout is count-based for endless: 1 diamond per correct
            // answer (capped daily at settle time). The old streak-multiplier
            // and speed-bonus diamond math promised amounts the server never
            // pays, so the running total now mirrors the real formula.
            setDiamondsEarned(prev => { const next = prev + 1; diamondsEarnedRef.current = next; return next; });
            setStreak(prev => { const next = prev + 1; streakRef.current = next; return next; });
            busEmit.decisionCorrect(streakRef.current);
            if (v?.runMissLimitReached === true) {
                if (answerTimeoutRef.current) clearTimeout(answerTimeoutRef.current);
                answerTimeoutRef.current = setTimeout(() => {
                    if (accountOperationScopeRef.current.isCurrent(operationScope)) endRun(operationScope);
                }, 1000);
            } else {
                scheduleAdvance(1000, operationScope);
            }
        } else {
            const missCount = hasAuthoritativeMissCount
                ? authoritativeMissCount
                : missesRef.current + 1;
            missesRef.current = missCount;
            setMisses(missCount);
            busEmit.decisionIncorrect(streakRef.current);
            if (!reduceMotion) busEmit.screenShake('medium');
            if (v?.runMissLimitReached === true || missCount >= MAX_MISSES) {
                // Third miss: hold the reveal, then settle the run.
                if (answerTimeoutRef.current) clearTimeout(answerTimeoutRef.current);
                answerTimeoutRef.current = setTimeout(() => {
                    if (accountOperationScopeRef.current.isCurrent(operationScope)) endRun(operationScope);
                }, 1500);
            } else {
                scheduleAdvance(1500, operationScope);
            }
        }
    }

    // Advance to the next question after the reveal, or end the run when the
    // 100-question roster is exhausted (a fresh game is a fresh session).
    function scheduleAdvance(delayMs, operationScope) {
        if (answerTimeoutRef.current) clearTimeout(answerTimeoutRef.current);
        answerTimeoutRef.current = setTimeout(() => {
            if (!accountOperationScopeRef.current.isCurrent(operationScope)) return;
            if (currentIndexRef.current + 1 >= questions.length) {
                endRun(operationScope);
                return;
            }
            setCurrentIndex(prev => { const next = prev + 1; currentIndexRef.current = next; return next; });
            setVerdict(null);
            trivia.reset();
            setSkipUsedThisQuestion(false);
            answerLockRef.current = false;
            timer.resetTimer();
        }, delayMs);
    }

    function endRun(operationScope = accountOperationScopeRef.current.capture()) {
        if (operationScope.identity !== (userId || null)
            || !accountOperationScopeRef.current.isCurrent(operationScope)) return;
        finalizeDuration();
        setGameState('saving');
        saveGameResult(operationScope);
    }

    const [saveErrorPayload, setSaveErrorPayload] = useState(null);
    const savePhaseRef = useRef(0); // 0=not settled, 1=authoritative settlement received
    // Server settlement result, kept in a ref so a saving_error retry re-uses
    // the already-paid result instead of re-submitting a closed session.
    const serverResultRef = useRef(null);

    // Keep the settling pointer through the response-to-render gap, then
    // retire it only after BOTH settlement and the high-score projection are
    // terminal. A pending projection is recoverable work, not success: the
    // same session/request custody must survive reload and an explicit retry.
    useEffect(() => {
        const projection = serverResultRef.current?.highScoreProjection;
        if (gameState === 'gameover'
            && serverResultRef.current?.sessionId
            && isTerminalEndlessHighScoreProjection(projection)) {
            serverRun.acknowledgeSettlement();
        }
    }, [gameState, awardedDiamonds, settlementResult, serverRun.acknowledgeSettlement, userId]);

    async function saveGameResult(operationScope = accountOperationScopeRef.current.capture()) {
        if (operationScope.identity !== (userId || null)
            || !accountOperationScopeRef.current.isCurrent(operationScope)) return;
        const isCurrentAccountOperation = () => accountOperationScopeRef.current.isCurrent(operationScope);
        if (!userId) {
            setGameState('gameover');
            return;
        }

        try {
            // Phase 1: settle the run server-side (only if not already
            // settled). The server grades from the answers it stored at tap
            // time, applies the daily cap and pays per correct answer through
            // a locked RPC - no client-side crediting, ever. Paid skips and
            // timeouts were already bound through session-answer and their
            // stable displayIndex -1 receipts are included in this replay.
            if (savePhaseRef.current < 1) {
                const submitted = await serverRun.submit(
                    sessionAnswersRef.current.map(a => ({
                        questionId: a.questionId,
                        displayIndex: a.displayIndex
                    }))
                );
                if (!isCurrentAccountOperation()) return;
                if (!authoritativeEndlessSettlement(submitted)) {
                    throw new Error('invalid_endless_settlement_authority');
                }
                serverResultRef.current = submitted;
                setSettlementResult(submitted);
                savePhaseRef.current = 1;

                // Local balance from the server's post-award number, with a
                // fresh profiles read as the fallback.
                if (Number.isFinite(submitted?.newBalance)) {
                    setUserDiamonds(submitted.newBalance);
                } else {
                    const { data: profile } = await readOwnProfile(supabase, 'diamonds', { expectId: userId });
                    if (!isCurrentAccountOperation()) return;
                    if (profile) setUserDiamonds(profile.diamonds || 0);
                }
                if ((submitted?.diamondsAwarded || 0) > 0) {
                    busEmit.diamondsEarned(submitted.diamondsAwarded, 'Endless Mode');
                }
            }
            const settled = serverResultRef.current || {};
            const authority = authoritativeEndlessSettlement(settled);
            if (!authority) throw new Error('invalid_endless_settlement_authority');
            const awarded = authority.diamondsAwarded;
            const serverCorrect = authority.correct;

            // Show what the server actually graded and credited, not what the
            // client hoped for.
            setAwardedDiamonds(awarded);
            setStreak(serverCorrect);
            streakRef.current = serverCorrect;
            setDiamondsEarned(serverCorrect);
            diamondsEarnedRef.current = serverCorrect;

            // session-submit projects the verified score through a max-only,
            // server-owned authority. The browser can read the public board,
            // but it cannot write or decide that a record improved.
            applyAuthoritativeHighScoreProjection(settled, operationScope);

            // Success! Game saved — reset phase for next game.
            setGameState('gameover');
            setSaveErrorPayload(null);
            savePhaseRef.current = 0;
        } catch (e) {
            console.warn('[Endless] Failed to save game result:', e);
            if (!isCurrentAccountOperation() || isStaleAccountOperation(e)) return;
            if (leaveRetiredRun(e)) return;
            // Save failed (network drop) -> Provide Retry UI (savePhaseRef preserves progress)
            setSaveErrorPayload({ finalDiamonds: diamondsEarnedRef.current, finalStreak: streakRef.current });
            setGameState('saving_error');
        }
    }

    // Retry function for network drops — resumes from where it left off
    const handleRetrySave = () => {
        setGameState('saving');
        setSaveErrorPayload(null);
        saveGameResult(); // savePhaseRef skips already-completed steps
    };

    const retryHighScoreProjection = async () => {
        if (isStartingRef.current || !userId) return;
        const operationScope = accountOperationScopeRef.current.capture();
        if (operationScope.identity !== userId) return;
        const retryOperation = { operationScope };
        isStartingRef.current = true;
        startOperationRef.current = retryOperation;
        setIsLoading(true);
        try {
            const resumed = await serverRun.resume({ count: QUESTIONS_PER_SESSION });
            if (!accountOperationScopeRef.current.isCurrent(operationScope)) return;
            if (!resumed?.resumedSettlement || !resumed.settlement) {
                throw new Error('projection_retry_settlement_missing');
            }
            const settled = resumed.settlement;
            if (!authoritativeEndlessSettlement(settled)) {
                throw new Error('invalid_endless_settlement_authority');
            }
            serverResultRef.current = settled;
            setSettlementResult(settled);
            applyAuthoritativeHighScoreProjection(settled, operationScope);
        } catch (error) {
            if (!accountOperationScopeRef.current.isCurrent(operationScope)
                || isStaleAccountOperation(error)) return;
            console.warn('[Endless] High-score projection retry failed:', error?.message || error);
            setHighScorePersistenceError('The Server High-Score Projection Is Still Pending. Retry The Same Settled Run; No Record Claim Is Being Shown.');
        } finally {
            if (startOperationRef.current === retryOperation) {
                startOperationRef.current = null;
                isStartingRef.current = false;
                if (accountOperationScopeRef.current.isCurrent(operationScope)) setIsLoading(false);
            }
        }
    };

    // Play Again - the server deals a FRESH roster for every session (the
    // just-played questions are now in trivia_user_question_history), and
    // startGame() opens the new session BEFORE charging another entry fee.
    function playAgain() {
        if (!isTerminalEndlessHighScoreProjection(
            serverResultRef.current?.highScoreProjection)) return;
        serverRun.acknowledgeSettlement();
        forceNewStartRef.current = true;
        startGame();
    }

    function pauseGame() {
        timer.setIsTimerRunning(false);
        setIsPaused(true);
    }

    function resumePausedGame() {
        setIsPaused(false);
        timer.setIsTimerRunning(true);
    }


    const creditedDiamonds = awardedDiamonds != null ? awardedDiamonds : diamondsEarned;
    const highScoreProjectionPending = gameState === 'gameover'
        && Boolean(userId)
        && !isTerminalEndlessHighScoreProjection(settlementResult?.highScoreProjection);
    const activeTimeoutRetryQuestionId = timeoutRetryQuestionId || serverRun.pendingTimeoutQuestionId;
    const timeoutRetryRequired = gameState === 'playing'
        && Boolean(currentQuestion?.id)
        && activeTimeoutRetryQuestionId === currentQuestion.id;
    // The pill is a short painted slot (about eight characters at 375px);
    // longer state, balance and timer copy is printed on the glass below.
    const balanceLabel = isVip ? 'VIP' : 'Ready';
    const stateLabel = showOutOfDiamonds
        ? 'Balance'
        : isPaused
            ? 'Paused'
            : isLoading
                ? 'Loading'
                : {
                    ready: !userId ? 'Sign In' : serverRun.hasRecoverableSession ? 'Resume' : balanceLabel,
                    playing: timeoutRetryRequired ? 'Confirm' : `${formatTriviaDisplayNumber(timer.timeLeft)} Sec`,
                    saving: 'Saving',
                    saving_error: 'Retry',
                    gameover: highScoreProjectionPending ? 'Retry' : 'Final',
                }[gameState] || balanceLabel;

    const primaryAction = showOutOfDiamonds
        ? { label: 'Get Diamonds', onClick: () => router.push('/hub/diamond-store') }
        : isPaused
            ? { label: 'Resume Game', onClick: resumePausedGame }
        : gameState === 'ready'
            ? {
                label: !userId
                    ? 'Sign In To Play'
                    : serverRun.hasRecoverableSession
                        ? 'Resume Endless Run'
                        : loadError ? 'Try Again' : 'Start Endless Trivia',
                onClick: !userId
                    ? () => router.push('/auth/login?redirect=/hub/trivia/endless')
                    : serverRun.hasRecoverableSession ? resumeServerRun : startGame,
                disabled: isLoading,
                'aria-disabled': isLoading,
            }
            : gameState === 'playing'
                ? timeoutRetryRequired
                    ? { label: isTimeoutRetrying ? 'Confirming Expired Answer' : 'Retry Expired Answer', onClick: retryExpiredQuestion, disabled: isTimeoutRetrying }
                    : { label: 'Pause Game', onClick: pauseGame }
            : gameState === 'saving_error'
                ? { label: 'Retry Save', onClick: handleRetrySave }
                : gameState === 'gameover'
                    ? highScoreProjectionPending
                        ? { label: isLoading ? 'Retrying Record Projection' : 'Retry Record Projection', onClick: retryHighScoreProjection, disabled: isLoading }
                        : { label: 'Play Again', onClick: playAgain }
                    : null;

    const secondaryAction = showOutOfDiamonds
        ? { label: 'Close', onClick: () => setShowOutOfDiamonds(false) }
        : gameState === 'gameover'
            ? { label: 'Back To Trivia', onClick: () => router.push('/hub/trivia') }
            : null;

    const accountBoundaryPending = shouldGateAccountOwnedRender({
        loading: authLoading,
        resolvedIdentity: resolvedAccountId,
        loadedIdentity: userId,
    });
    if (accountBoundaryPending) {
        return (
            <TriviaErrorBoundary pageName="Endless Mode">
                <>
                    <SEOHead title="Endless Trivia - Keep The Streak Alive" description="Endless Poker Trivia On Smarter.Poker: enter a server-verified run, answer until the third miss, use limited lifelines, and review the final settlement receipt." canonical="/hub/trivia/endless" />
                    <div className="trivia-challenge-page trivia-challenge-page--endless" data-trivia-family="challenge" data-trivia-surface="endless" data-game-state="loading">
                        <UniversalHeader pageDepth={2} />
                        <PageTransition>
                            <main className="trivia-challenge-shell" aria-labelledby="endless-trivia-title">
                                <TriviaConsole className="trivia-challenge-console" eyebrow="Three Miss Challenge" title="Endless Trivia" titleId="endless-trivia-title" subtitle="Keep The Streak Alive" pill="Loading" aria-labelledby="endless-trivia-title" secondaryAction={{ label: 'Back To Trivia', onClick: () => router.push('/hub/trivia') }}>
                                    <section className="trivia-challenge-intro phase9-intro-layout" aria-label="Loading Account Run">
                                        <ResponsiveModeArt art={TRIVIA_INTRO_ART_ENDLESS} priority />
                                        <p className="trivia-challenge-notice" role="status">Loading The Authoritative Run For This Account</p>
                                    </section>
                                </TriviaConsole>
                            </main>
                        </PageTransition>
                    </div>
                </>
                <HubPageSummary page="trivia-endless" as="h1" />
            </TriviaErrorBoundary>
        );
    }

    return (
        <TriviaErrorBoundary pageName="Endless Mode">
            <>
                <SEOHead
                    title="Endless Trivia - Keep The Streak Alive"
                    description="Endless Poker Trivia On Smarter.Poker: enter a server-verified run, answer until the third miss, use limited lifelines, and review the final settlement receipt."
                    canonical="/hub/trivia/endless"
                />

                <div
                    className="trivia-challenge-page trivia-challenge-page--endless"
                    data-trivia-family="challenge"
                    data-trivia-surface="endless"
                    data-game-state={gameState}
                    data-screen-shake={screenShake ? 'active' : 'idle'}
                >
                    <UniversalHeader pageDepth={2} />

                    {userId && !isVip && (
                        <GameCostPopup
                            userId={userId}
                            featureKey="trivia_endless"
                            isVip={isVip}
                            cost={GAME_ENTRY_COST}
                        />
                    )}

                    <PageTransition>
                        <main className="trivia-challenge-shell" aria-labelledby="endless-trivia-title">
                            <TriviaConsole
                                className="trivia-challenge-console"
                                eyebrow="Three Miss Challenge"
                                title="Endless Trivia"
                                titleId="endless-trivia-title"
                                subtitle="Keep The Streak Alive"
                                pill={stateLabel}
                                aria-labelledby="endless-trivia-title"
                                primaryAction={primaryAction}
                                secondaryAction={secondaryAction}
                            >
                                {showOutOfDiamonds && (
                                    <section
                                        className="trivia-challenge-alert"
                                        role="alert"
                                        aria-labelledby="endless-diamonds-title"
                                    >
                                        <h2 id="endless-diamonds-title">Not Enough Diamonds</h2>
                                        <p>
                                            Each Game Costs {formatTriviaDisplayNumber(GAME_ENTRY_COST)} Diamonds.
                                            Get More Diamonds Or Upgrade To VIP For Unlimited Access.
                                        </p>
                                    </section>
                                )}

                                {gameState === 'ready' && isLoading && (
                                    <div className="trivia-challenge-state" role="status" aria-live="polite">
                                        <p>Preparing Endless Trivia</p>
                                    </div>
                                )}

                                {gameState === 'ready' && !isLoading && (
                                    <section className="trivia-challenge-intro phase9-intro-layout" aria-labelledby="endless-ready-title">
                                        <ResponsiveModeArt art={TRIVIA_INTRO_ART_ENDLESS} priority />
                                        <div className="phase9-intro-copy">
                                        <h2 id="endless-ready-title">Answer Until The Third Miss</h2>
                                        <p>
                                            Build The Longest Streak You Can Across A Server-Dealt
                                            Roster Of Every Poker Trivia Category.
                                        </p>
                                        {loadError && (
                                            <p className="trivia-challenge-alert" role="alert">{loadError}</p>
                                        )}
                                        {highScorePersistenceError && (
                                            <p className="trivia-challenge-notice" role="status">{highScorePersistenceError}</p>
                                        )}
                                        {!userId && (
                                            <p className="trivia-challenge-notice" role="status">
                                                Sign In To Start Or Recover A Server-Verified Run.
                                            </p>
                                        )}
                                        {userId && serverRun.hasRecoverableSession && (
                                            <p className="trivia-challenge-notice" role="status">
                                                Your Existing Entry Is Safe. Resume It Without Paying Again.
                                            </p>
                                        )}
                                        <dl className="trivia-challenge-stats">
                                            <div className="trivia-challenge-stat">
                                                <dt>Questions Available</dt>
                                                <dd>{formatTriviaDisplayNumber(QUESTIONS_PER_SESSION)}</dd>
                                            </div>
                                            <div className="trivia-challenge-stat">
                                                <dt>Misses Allowed</dt>
                                                <dd>{formatTriviaDisplayNumber(MAX_MISSES)}</dd>
                                            </div>
                                            <div className="trivia-challenge-stat">
                                                <dt>Entry</dt>
                                                <dd>{isVip ? 'VIP Included' : `${formatTriviaDisplayNumber(GAME_ENTRY_COST)} Diamonds`}</dd>
                                            </div>
                                            <div className="trivia-challenge-stat">
                                                <dt>Daily Reward Cap</dt>
                                                <dd>{formatTriviaDisplayNumber(DAILY_DIAMOND_CAP)}</dd>
                                            </div>
                                        </dl>
                                        {userId && !isVip && (
                                            <ul className="tc-rows" aria-label="Your Balance">
                                                <li className="tc-row">
                                                    <span className="tc-row__label">Your Balance</span>
                                                    <span className="tc-row__value tc-ink--gold">{formatTriviaDisplayNumber(userDiamonds)} Diamonds</span>
                                                </li>
                                            </ul>
                                        )}
                                        <p className="trivia-challenge-note">
                                            Each Correct Answer Earns One Diamond. Skips Do Not Count As Misses.
                                        </p>
                                        </div>
                                    </section>
                                )}

                                {gameState === 'saving' && (
                                    <div className="trivia-challenge-state" role="status" aria-live="polite">
                                        <p>Securing Your Endless Run</p>
                                    </div>
                                )}

                                {gameState === 'saving_error' && (
                                    <section className="trivia-challenge-state trivia-challenge-state--error" role="alert">
                                        <h2>Network Disconnected</h2>
                                        <p>
                                            We Could Not Save Your Score Of {formatTriviaDisplayNumber(saveErrorPayload?.finalStreak)}
                                            {' Correct Answers And '}
                                            {formatTriviaDisplayNumber(saveErrorPayload?.finalDiamonds)} Diamonds.
                                            Check Your Connection And Retry To Protect Your Rewards.
                                        </p>
                                    </section>
                                )}

                                {gameState === 'playing' && currentQuestion && isPaused && (
                                    <section className="trivia-challenge-state trivia-challenge-state--paused" role="status">
                                        <h2>Game Paused</h2>
                                        <p>
                                            You Left The Screen With {formatTriviaDisplayNumber(timer.timeLeft)} Seconds Remaining.
                                        </p>
                                        <button
                                            type="button"
                                            className="trivia-challenge-action"
                                            onClick={resumePausedGame}
                                        >
                                            Resume Game
                                        </button>
                                    </section>
                                )}

                                {gameState === 'playing' && currentQuestion && !isPaused && (
                                    <section
                                        className={`trivia-challenge-stage${screenShake ? ' trivia-challenge-stage--shaking' : ''}`}
                                        aria-labelledby="endless-question-title"
                                    >
                                        {actionError && (
                                            <p className="trivia-challenge-alert" role="alert">{actionError}</p>
                                        )}
                                        {timeoutRetryRequired && (
                                            <section className="trivia-challenge-state trivia-challenge-state--error" role="alert" aria-live="assertive" aria-labelledby="endless-timeout-retry-title">
                                                <h3 id="endless-timeout-retry-title">Expired Answer Needs Confirmation</h3>
                                                <p id="endless-timeout-retry-copy">The Run Is Locked On This Question Until Its Exact Timeout Is Recorded By The Server.</p>
                                                <button
                                                    type="button"
                                                    className="trivia-challenge-action"
                                                    onClick={retryExpiredQuestion}
                                                    disabled={isTimeoutRetrying}
                                                    aria-describedby="endless-timeout-retry-copy"
                                                >
                                                    {isTimeoutRetrying ? 'Confirming Expired Answer' : 'Retry Expired Answer'}
                                                </button>
                                            </section>
                                        )}

                                        <dl className="trivia-challenge-stats trivia-challenge-stats--compact">
                                            <div className="trivia-challenge-stat">
                                                <dt>Streak</dt>
                                                <dd>{formatTriviaDisplayNumber(streak)}</dd>
                                            </div>
                                            <div className="trivia-challenge-stat">
                                                <dt>Diamonds</dt>
                                                <dd>{formatTriviaDisplayNumber(diamondsEarned)}</dd>
                                            </div>
                                            <div className="trivia-challenge-stat">
                                                <dt>Misses</dt>
                                                <dd>
                                                    {formatTriviaDisplayNumber(misses)}
                                                    {' Of '}
                                                    {formatTriviaDisplayNumber(MAX_MISSES)}
                                                </dd>
                                            </div>
                                            {settings.timerEnabled !== false && (
                                                <div className="trivia-challenge-stat">
                                                    <dt>Time</dt>
                                                    <dd aria-live="off">{formatTriviaDisplayNumber(timer.timeLeft)} Seconds</dd>
                                                </div>
                                            )}
                                        </dl>

                                        <div className="trivia-challenge-toolbar">
                                            <button
                                                type="button"
                                                className="trivia-challenge-action"
                                                onClick={() => setShowSettingsPanel(prev => !prev)}
                                                aria-expanded={showSettingsPanel}
                                                aria-controls="endless-game-settings"
                                            >
                                                {showSettingsPanel ? 'Close Settings' : 'Game Settings'}
                                            </button>
                                            {lifelinesUsedThisGame > 0 && (
                                                <span className="trivia-challenge-note">
                                                    Lifelines {formatTriviaDisplayNumber(lifelinesUsedThisGame)}
                                                    {' Of '}
                                                    {formatTriviaDisplayNumber(MAX_LIFELINES_PER_GAME)}
                                                </span>
                                            )}
                                        </div>

                                        {showSettingsPanel && (
                                            <section
                                                id="endless-game-settings"
                                                className="trivia-challenge-settings"
                                                aria-labelledby="endless-settings-title"
                                            >
                                                <h3 id="endless-settings-title">Game Settings</h3>
                                                <div className="trivia-challenge-setting">
                                                    <span id="endless-audio-label">Sound Effects</span>
                                                    <button
                                                        type="button"
                                                        role="switch"
                                                        aria-labelledby="endless-audio-label"
                                                        aria-checked={!reduceMotion && settings.audio}
                                                        disabled={reduceMotion}
                                                        className="trivia-challenge-switch"
                                                        onClick={() => triviaAudio.setMuted(settings.audio)}
                                                    >
                                                        {reduceMotion ? 'Reduced' : settings.audio ? 'On' : 'Off'}
                                                    </button>
                                                </div>
                                                <div className="trivia-challenge-setting">
                                                    <span id="endless-haptics-label">Haptic Vibration</span>
                                                    <button
                                                        type="button"
                                                        role="switch"
                                                        aria-labelledby="endless-haptics-label"
                                                        aria-checked={!reduceMotion && settings.haptics}
                                                        disabled={reduceMotion}
                                                        className="trivia-challenge-switch"
                                                        onClick={() => setSettings(prev => ({ ...prev, haptics: !prev.haptics }))}
                                                    >
                                                        {reduceMotion ? 'Reduced' : settings.haptics ? 'On' : 'Off'}
                                                    </button>
                                                </div>
                                                <div className="trivia-challenge-setting">
                                                    <span id="endless-shake-label">Screen Shake</span>
                                                    <button
                                                        type="button"
                                                        role="switch"
                                                        aria-labelledby="endless-shake-label"
                                                        aria-checked={!reduceMotion && settings.screenShake}
                                                        disabled={reduceMotion}
                                                        className="trivia-challenge-switch"
                                                        onClick={() => setSettings(prev => ({ ...prev, screenShake: !prev.screenShake }))}
                                                    >
                                                        {reduceMotion ? 'Reduced' : settings.screenShake ? 'On' : 'Off'}
                                                    </button>
                                                </div>
                                                <fieldset className="trivia-challenge-setting-group">
                                                    <legend>Intensity</legend>
                                                    <div className="trivia-challenge-actions">
                                                        {['low', 'medium', 'high'].map(level => (
                                                            <button
                                                                key={level}
                                                                type="button"
                                                                className="trivia-challenge-action"
                                                                aria-pressed={settings.intensity === level}
                                                                onClick={() => setSettings(prev => ({ ...prev, intensity: level }))}
                                                            >
                                                                {toTitleCase(level)}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </fieldset>
                                            </section>
                                        )}

                                        <p className="trivia-challenge-progress-label">
                                            Question {formatTriviaDisplayNumber(currentIndex + 1)}
                                            {' | '}
                                            {toTitleCase(String(currentQuestion.category || 'Mixed').replaceAll('_', ' '))}
                                        </p>
                                        <h2 id="endless-question-title" className="trivia-challenge-question">
                                            {toTitleCase(currentQuestion.question)}
                                        </h2>

                                        <div className="trivia-challenge-options">
                                            {/* TRAIN-WIRE-TRIVIA-ANSWER-OPTION-4: shared option primitive (inline variant) */}
                                            {currentQuestion.options?.map((option, index) => (
                                                <TriviaAnswerOption
                                                    variant="inline"
                                                    key={index}
                                                    index={index}
                                                    option={toTitleCase(option)}
                                                    selectedAnswer={trivia.selectedAnswer}
                                                    correctIndex={verdict ? verdict.correctDisplayIndex : null}
                                                    showResult={trivia.showResult}
                                                    disabled={trivia.selectedAnswer !== null || trivia.showResult || timeoutRetryRequired}
                                                    onSelect={gradeAnswer}
                                                />
                                            ))}
                                        </div>

                                        {!trivia.showResult && (
                                            <button
                                                type="button"
                                                className="trivia-challenge-action trivia-challenge-action--lifeline"
                                                onClick={useSkipQuestion}
                                                disabled={lifelineLocked || skipUsedThisQuestion || answerLockRef.current}
                                            >
                                                Skip Question | {isVip ? 'VIP Included' : `${formatTriviaDisplayNumber(LIFELINE_COST)} Diamonds`}
                                            </button>
                                        )}

                                        <p className="trivia-challenge-note">
                                            One Diamond Per Correct Answer | {formatTriviaDisplayNumber(DAILY_DIAMOND_CAP)} Daily Maximum
                                        </p>

                                        {trivia.showResult && verdict?.explanation && (
                                            <section className="trivia-challenge-explanation" aria-labelledby="endless-explanation-title">
                                                <h3 id="endless-explanation-title">Why This Is Correct</h3>
                                                <p>{verdict.explanation}</p>
                                            </section>
                                        )}

                                        {trivia.showResult && currentQuestion?.id != null && (
                                            <div className="trivia-challenge-report">
                                                <ReportQuestionButton
                                                    questionId={currentQuestion.id}
                                                    userToken={accessToken}
                                                />
                                            </div>
                                        )}
                                    </section>
                                )}

                                {gameState === 'gameover' && (
                                    <section className="trivia-challenge-state trivia-challenge-state--results" aria-labelledby="endless-results-title">
                                        <h2 id="endless-results-title">Endless Run Complete</h2>
                                        <dl className="trivia-challenge-stats">
                                            <div className="trivia-challenge-stat">
                                                <dt>Correct Answers</dt>
                                                <dd>{formatTriviaDisplayNumber(streak)}</dd>
                                            </div>
                                            <div className="trivia-challenge-stat">
                                                <dt>Diamonds Earned</dt>
                                                <dd>{formatTriviaDisplayNumber(creditedDiamonds)}</dd>
                                            </div>
                                            <div className="trivia-challenge-stat">
                                                <dt>Best Streak</dt>
                                                <dd>{highScoreResolved ? formatTriviaDisplayNumber(highScore) : 'Unavailable'}</dd>
                                            </div>
                                            {gameDurationSec > 0 && (
                                                <div className="trivia-challenge-stat">
                                                    <dt>Run Time</dt>
                                                    <dd>
                                                        {formatTriviaDisplayNumber(Math.floor(gameDurationSec / 60))} Minutes
                                                        {' '}
                                                        {formatTriviaDisplayNumber(gameDurationSec % 60)} Seconds
                                                    </dd>
                                                </div>
                                            )}
                                        </dl>

                                        {awardedDiamonds != null && awardedDiamonds < diamondsEarned && (
                                            <p className="trivia-challenge-note">
                                                Daily Cap Reached. {formatTriviaDisplayNumber(awardedDiamonds)}
                                                {' Of '}
                                                {formatTriviaDisplayNumber(diamondsEarned)} Diamonds Credited.
                                            </p>
                                        )}

                                        {confirmedNewHighScore && (
                                            <p className="trivia-challenge-note" role="status">New High Score</p>
                                        )}

                                        {highScorePersistenceError && (
                                            <p className="trivia-challenge-alert" role="alert">{highScorePersistenceError}</p>
                                        )}

                                        <Phase9RunReview
                                            questions={questions}
                                            settlement={settlementResult}
                                            title="Review Missed Questions"
                                        />

                                        <Phase9SettlementReceipt
                                            settlement={settlementResult}
                                            modeLabel="Endless"
                                            correctCount={streak}
                                            totalQuestions={settlementResult?.total || questions.length}
                                        />

                                        <button
                                            type="button"
                                            className="trivia-challenge-action"
                                            onClick={async () => {
                                                const result = await shareResult({
                                                    mode: 'Endless',
                                                    score: streak,
                                                    diamonds: creditedDiamonds,
                                                });
                                                if (result === 'copied') alert('Result Copied To Clipboard.');
                                            }}
                                        >
                                            Share Result
                                        </button>
                                    </section>
                                )}
                            </TriviaConsole>
                        </main>
                    </PageTransition>
                </div>
            </>
          {/* Server rendered: measured on production this page returned
              only chrome to a crawler (AEO phase 3, 2026-09-17). */}
          <HubPageSummary page="trivia-endless" as="h1" />
        </TriviaErrorBoundary>
    );
}

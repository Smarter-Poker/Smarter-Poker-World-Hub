/**
 * MIXED MODE — Route: /hub/trivia/mixed
 * Rotating category trivia with per-category stats tracking
 * Cycles through: History → Rules → Pro → History → ...
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser, getSessionToken } from '../../../src/lib/authUtils';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import TriviaConsole from '../../../src/components/trivia/console/TriviaConsole';
import ResponsiveModeArt from '../../../src/components/trivia/console/ResponsiveModeArt';
import { TRIVIA_INTRO_ART_MIXED } from '../../../src/config/triviaIntroArt.mjs';
import { toTitleCase } from '../../../src/lib/trivia/titleCase';
import { formatTriviaDisplayNumber } from '../../../src/lib/trivia/formatTriviaDisplayNumber';
import DiamondEngine from '../../../src/services/DiamondEngine';
import GameCostPopup from '../../../src/components/gates/GameCostPopup';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import TriviaAnswerOption from '../../../src/components/trivia/TriviaAnswerOption';
import useTriviaQuestion from '../../../src/hooks/useTriviaQuestion';
import useTriviaTimer from '../../../src/hooks/useTriviaTimer';
import useServerGradedRun from '../../../src/hooks/useServerGradedRun';
import { busEmit } from '../../../src/engine/EventBus';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { shareResult } from '../../../src/lib/trivia/shareResult';
import { getDailyDiamondsEarned } from '../../../src/lib/trivia/diamondCap';
import { calculateDiamonds, DAILY_DIAMOND_CAPS } from '../../../src/lib/trivia/triviaEngine';
import ReportQuestionButton from '../../../src/components/trivia/ReportQuestionButton';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { readOwnProfile } from '../../../src/lib/ownProfile';
import { createAccountOperationScope, isStaleAccountOperation } from '../../../src/lib/trivia/accountOperationScope.mjs';

const GAME_ENTRY_COST = 10; // restored with server-graded adoption - rewards pay via award_trivia_run now
// Cap comes from triviaEngine so the lobby and the payout can never disagree.
// The local literal was 10 — below a single 10-diamond entry fee, which made
// the mode net-negative by construction.
const DAILY_DIAMOND_CAP = Number.isFinite(DAILY_DIAMOND_CAPS.mixed) ? DAILY_DIAMOND_CAPS.mixed : 40;

const CATEGORIES = [
    { id: 'poker_history', name: 'History', dbCategories: ['poker_history', 'famous_hands', 'player_profiles', 'tournament_facts'] },
    { id: 'rule_knowledge', name: 'Rules', dbCategories: ['rule_knowledge'] },
    { id: 'gto_theory', name: 'Pro', dbCategories: ['gto_theory'] },
    // NEW STRATEGY CATEGORIES
    { id: 'mtt_situations', name: 'MTT', dbCategories: ['mtt_situations'] },
    { id: 'cash_game_situations', name: 'Cash', dbCategories: ['cash_game_situations'] },
    { id: 'icm_chip_ev', name: 'ICM', dbCategories: ['icm_chip_ev'] },
    { id: 'gto_scenarios', name: 'GTO', dbCategories: ['gto_scenarios'] }
];

// Server-dealt sessions draw across the mode's categories - the old exact
// 3-per-category client-side deal is necessarily gone.
const QUESTIONS_PER_SESSION = 21;

// The server labels questions with db-level category names; map each one back
// to the page's seven display groups so the per-category stat panels keep
// working.
function displayCategoryFor(dbCategory) {
    const cat = CATEGORIES.find(c => c.dbCategories.includes(dbCategory));
    return cat ? cat.id : 'poker_history';
}

export default function MixedModePage() {
    useTrainingBus('trivia-mixed');
    const router = useRouter();
    const { user: avatarUser, loading: authLoading } = useAvatar();
    const [userId, setUserId] = useState(null);
    const accountOperationScopeRef = useRef(null);
    if (!accountOperationScopeRef.current) {
        accountOperationScopeRef.current = createAccountOperationScope();
    }
    const resolvedAccountId = authLoading
        ? userId
        : (avatarUser?.id || getAuthUser()?.id || null);
    if (!authLoading) accountOperationScopeRef.current.transition(resolvedAccountId);
    const [userDiamonds, setUserDiamonds] = useState(0);
    const [isVip, setIsVip] = useState(false);
    const [showOutOfDiamonds, setShowOutOfDiamonds] = useState(false);

    const [gameState, setGameState] = useState('loading'); // loading, ready, playing, results
    const [questions, setQuestions] = useState([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    // Server-authoritative run: /api/trivia/session-start deals (and permutes)
    // the questions, session-answer grades each tap, session-submit caps and
    // pays - the client never receives an answer key.
    const serverRun = useServerGradedRun('mixed', { accountId: resolvedAccountId });
    // Current question's server verdict (wasCorrect / correctDisplayIndex /
    // explanation); null until session-answer resolves, cleared on advance.
    const [verdict, setVerdict] = useState(null);
    // Locks taps from the moment of the tap until the question advances, so a
    // slow session-answer round-trip cannot accept a second answer.
    const answerLockRef = useRef(false);

    // TRAIN-WIRE-TRIVIA-HOOK-1 - shared trivia answer-state plumbing.
    // Taps route through gradeAnswer() below instead of trivia.selectAnswer:
    // the hook's local grading needs a client-side answer key this page no
    // longer receives, so the reveal is driven through the hook's setters
    // once the server verdict arrives.
    const trivia = useTriviaQuestion(questions[currentQuestionIndex]);
    const { selectedAnswer, showResult } = trivia;

    // TRAIN-WIRE-TRIVIA-TIMER-2 - first shared shot-clock hook adopter
    const timer = useTriviaTimer({ initialTime: 24, showResult: trivia.showResult, gameState, onTimeout: handleTimeout });

    // Per-category stats for current session
    const [categoryStats, setCategoryStats] = useState({
        poker_history: { answered: 0, correct: 0 },
        rule_knowledge: { answered: 0, correct: 0 },
        gto_theory: { answered: 0, correct: 0 },
        mtt_situations: { answered: 0, correct: 0 },
        cash_game_situations: { answered: 0, correct: 0 },
        icm_chip_ev: { answered: 0, correct: 0 },
        gto_scenarios: { answered: 0, correct: 0 }
    });

    // Cumulative mastery from database
    const [categoryMastery, setCategoryMastery] = useState({});

    const [totalCorrect, setTotalCorrect] = useState(0);
    const [diamondsEarned, setDiamondsEarned] = useState(0);
    const [capReached, setCapReached] = useState(false);
    const [earnedTodayCap, setEarnedTodayCap] = useState(0); // diamonds earned today (for cap display)
    const [loadError, setLoadError] = useState(null);
    const [accessToken, setAccessToken] = useState(null); // for ReportQuestionButton
    const answersRef = useRef([]); // per index: { questionId, displayIndex, wasCorrect } from the server verdict

    const isStartingRef = useRef(false); // Prevent double-click race
    const initRequestRef = useRef(0); // Retires stale account reads after an auth boundary
    const accountIdentityRef = useRef(null);
    const startOperationRef = useRef(null);
    const answerOperationRef = useRef(null);

    useEffect(() => {
        // Wait for AvatarContext to resolve — with an empty dep array this
        // effect used to run once while authLoading was still true and never
        // again, leaving the page stuck on the skeleton forever after a hard
        // load. Deps below re-fire it when auth resolves.
        if (authLoading) return;
        const resolvedUser = avatarUser || getAuthUser();
        const nextAccountId = resolvedUser?.id || null;
        const identityChanged = accountIdentityRef.current !== nextAccountId;
        accountIdentityRef.current = nextAccountId;
        const operationScope = accountOperationScopeRef.current.transition(nextAccountId);
        const request = ++initRequestRef.current;
        let cancelled = false;
        const isCurrent = () => !cancelled
            && initRequestRef.current === request
            && accountOperationScopeRef.current.isCurrent(operationScope);
        if (identityChanged) {
            startOperationRef.current = null;
            answerOperationRef.current = null;
            isStartingRef.current = false;
            answerLockRef.current = false;
            savePhaseRef.current = 0;
            serverResultRef.current = null;
            answersRef.current = [];
            setQuestions([]);
            setCurrentQuestionIndex(0);
            setVerdict(null);
            setUserDiamonds(0);
            setIsVip(false);
            setAccessToken(null);
            setCategoryMastery({});
            setEarnedTodayCap(0);
            setSaveErrorPayload(null);
            setLoadError(null);
            setTotalCorrect(0);
            setDiamondsEarned(0);
            setCapReached(false);
            setGameState('loading');
        }
        async function initialize() {
            const user = resolvedUser;
            if (!user) {
                if (!isCurrent()) return;
                // Never leave the last account attached to recovery custody
                // while the authenticated context is signed out.
                setUserId(null);
                setAccessToken(null);
                setIsVip(false);
                setUserDiamonds(0);
                router.push('/hub/trivia');
                return;
            }

            setUserId(user.id);

            // Session token for the report-question API.
            // getSessionToken() (from authUtils) reads from localStorage and
            // avoids the async auth-lock held by the Supabase session API.
            setAccessToken(getSessionToken() || null);

            // Check VIP status
            await DiamondEngine.init(user.id);
            const vipStatus = await DiamondEngine.isVIP();
            if (!isCurrent()) return;
            setIsVip(vipStatus);

            // Load user diamonds
            const { data: profile } = await readOwnProfile(supabase, 'diamonds', { expectId: user.id });
            if (!isCurrent()) return;

            if (profile) {
                setUserDiamonds(profile.diamonds || 0);
            }

            // Load category mastery
            const { data: mastery } = await supabase
                .from('trivia_category_mastery')
                .select('*')
                .eq('user_id', user.id)
                .limit(50) // category mastery
            if (!isCurrent()) return;

            if (mastery) {
                const masteryMap = {};
                mastery.forEach(m => {
                    masteryMap[m.category] = m;
                });
                setCategoryMastery(masteryMap);
            }

            // Diamonds already earned today in mixed mode (cap awareness UI)
            try {
                const earnedToday = await getDailyDiamondsEarned(supabase, user.id, 'mixed');
                if (!isCurrent()) return;
                setEarnedTodayCap(earnedToday);
            } catch (e) { console.warn('[Mixed] Cap fetch failed:', e); }

            // Questions are dealt by the server when a game starts - nothing
            // to preload here.
            if (!isCurrent()) return;
            setGameState('ready');
        }

        initialize();
        return () => { cancelled = true; };
    }, [authLoading, avatarUser?.id]);

    // Realtime: Refresh diamond balance when scores change
    useEffect(() => {
        if (!userId) return;
        const _ch = supabase
            .channel(`trivia-mixed:${userId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trivia_scores', filter: `user_id=eq.${userId}` }, async () => {
                const operationScope = accountOperationScopeRef.current.capture();
                if (operationScope.identity !== userId) return;
                try {
                    const { data: profile } = await readOwnProfile(supabase, 'diamonds', { expectId: userId });
                    if (!accountOperationScopeRef.current.isCurrent(operationScope)) return;
                    if (profile) setUserDiamonds(profile.diamonds || 0);
                } catch (e) {
                    console.warn('[Mixed] Realtime refresh failed:', e);
                }
            })
            .subscribe();
        return () => { supabase.removeChannel(_ch); };
    }, [userId]);

    // Per-answer server grading. Lock the tap immediately, record it with
    // /api/trivia/session-answer (the first answer per question is BINDING
    // server-side), then reveal from the verdict. A failed call unlocks so the
    // player can re-tap - the endpoint is idempotent per question, so a retry
    // cannot double-record.
    async function gradeAnswer(displayIndex) {
        const operationScope = accountOperationScopeRef.current.capture();
        if (operationScope.identity !== (userId || null)) return;
        if (answerLockRef.current || trivia.showResult) return;
        const q = questions[currentQuestionIndex];
        if (!q || typeof q.id !== 'string') return;
        const answerOperation = { operationScope, questionId: q.id };
        answerLockRef.current = true;
        answerOperationRef.current = answerOperation;
        trivia.setSelectedAnswer(displayIndex); // instant visual lock on the tap
        try {
            const v = await serverRun.answer({ questionId: q.id, displayIndex });
            if (!accountOperationScopeRef.current.isCurrent(operationScope)) return;
            applyVerdict(q, displayIndex, v, operationScope);
        } catch (e) {
            console.warn('[Mixed] Answer grading failed:', e?.message || e);
            if (!accountOperationScopeRef.current.isCurrent(operationScope)
                || isStaleAccountOperation(e)) return;
            if (displayIndex < 0) {
                // Timeout skip that could not reach the server: no re-tap is
                // possible, so record it locally (session-submit still grades
                // it server-side) and advance without a reveal.
                recordAnswer(q, -1, false);
                advanceOrFinish(operationScope);
            } else {
                // Unlock and let the player re-tap.
                trivia.setSelectedAnswer(null);
                answerLockRef.current = false;
            }
        } finally {
            if (answerOperationRef.current === answerOperation) answerOperationRef.current = null;
        }
    }

    // Side effects that used to key off the client-computed isCorrect now key
    // off the server verdict.
    function applyVerdict(q, displayIndex, v, operationScope) {
        timer.setIsTimerRunning(false);
        setVerdict(v);
        trivia.setShowResult(true);
        recordAnswer(q, displayIndex, v?.wasCorrect === true);
        advanceOrFinish(operationScope);
    }

    function recordAnswer(q, displayIndex, wasCorrect) {
        const category = q.displayCategory || 'poker_history';
        setCategoryStats(prev => ({
            ...prev,
            [category]: {
                answered: (prev[category]?.answered || 0) + 1,
                correct: (prev[category]?.correct || 0) + (wasCorrect ? 1 : 0)
            }
        }));
        answersRef.current[currentQuestionIndex] = { questionId: q.id, displayIndex, wasCorrect };
        if (wasCorrect) {
            setTotalCorrect(prev => prev + 1);
            setDiamondsEarned(prev => prev + 1);
            busEmit.decisionCorrect(totalCorrect + 1);
        } else {
            busEmit.decisionIncorrect(totalCorrect);
            busEmit.screenShake('light');
        }
    }

    function advanceOrFinish(operationScope) {
        setTimeout(() => {
            if (!accountOperationScopeRef.current.isCurrent(operationScope)) return;
            if (currentQuestionIndex + 1 >= questions.length) {
                finishGame();
            } else {
                setCurrentQuestionIndex(prev => prev + 1);
                setVerdict(null);
                trivia.reset();
                answerLockRef.current = false;
                timer.resetTimer();
            }
        }, 1200);
    }

    async function startGame() {
        if (isStartingRef.current) return;
        const operationScope = accountOperationScopeRef.current.capture();
        if (operationScope.identity !== (userId || null)) return;
        const startOperation = { operationScope };
        isStartingRef.current = true;
        startOperationRef.current = startOperation;
        try {
        if (!userId) {
            setLoadError('Please Sign In To Play Mixed Trivia.');
            setGameState('error');
            return;
        }
        setLoadError(null);
        setGameState('loading');

        // Open the server session BEFORE any charge, so a start failure can
        // never eat an entry fee. The server deals (and permutes) the
        // questions - they are used VERBATIM, because reshuffling them or
        // their options would break the display-index mapping the grader
        // uses. The draw spans the mode's categories server-side.
        let served;
        try {
            served = await serverRun.start({ count: QUESTIONS_PER_SESSION });
            if (!accountOperationScopeRef.current.isCurrent(operationScope)) return;
        } catch (e) {
            console.warn('[Mixed] Server session start failed:', e?.message || e);
            if (!accountOperationScopeRef.current.isCurrent(operationScope)
                || isStaleAccountOperation(e)) return;
            // A 402 is the balance gate, not a connection problem: show the
            // Not Enough Diamonds state alone instead of both messages.
            if (e?.status === 402) {
                setShowOutOfDiamonds(true);
                setGameState('ready');
                return;
            }
            setLoadError('Could Not Start The Game. Please Try Again In A Moment.');
            setGameState('error');
            return;
        }
        if (!served || !Array.isArray(served.questions) || served.questions.length === 0) {
            // Keep the start nonce/session pointer. A successful RPC can have
            // charged before a malformed response is detected client-side;
            // retrying must re-adopt that same entry, never start another.
            setLoadError('The Dealt Questions Could Not Be Confirmed. Retry This Same Entry Request.');
            setGameState('error');
            return;
        }
        // Tag each question with its display group so the per-category stat
        // panels keep working against the server's db-level category names.
        served.questions.forEach(q => { q.displayCategory = displayCategoryFor(q.category); });

        if (Number.isFinite(served.newBalance)) setUserDiamonds(served.newBalance);
        if (served.entryState === 'charged' && served.entryCost > 0) {
            busEmit.diamondsSpent(served.entryCost, 'Mixed entry');
        }
        setQuestions(served.questions);
        setCurrentQuestionIndex(0);
        trivia.reset();
        setVerdict(null);
        answerLockRef.current = false;
        setTotalCorrect(0);
        setDiamondsEarned(0);
        setCapReached(false);
        serverResultRef.current = null;
        savePhaseRef.current = 0;
        answersRef.current = [];
        setCategoryStats({
            poker_history: { answered: 0, correct: 0 },
            rule_knowledge: { answered: 0, correct: 0 },
            gto_theory: { answered: 0, correct: 0 },
            mtt_situations: { answered: 0, correct: 0 },
            cash_game_situations: { answered: 0, correct: 0 },
            icm_chip_ev: { answered: 0, correct: 0 },
            gto_scenarios: { answered: 0, correct: 0 }
        });
        timer.resetTimer();
        setGameState('playing');
        } finally {
            if (startOperationRef.current === startOperation) {
                startOperationRef.current = null;
                isStartingRef.current = false;
            }
        }
    }

    function handleTimeout() {
        timer.setIsTimerRunning(false);
        gradeAnswer(-1); // records a skip server-side and reveals the answer
    }

    const [saveErrorPayload, setSaveErrorPayload] = useState(null);
    const savePhaseRef = useRef(0); // 0=none, 1=settled, 2=mastery, 3=history, 4=score
    // Server settlement result, kept in a ref so a saving_error retry re-uses
    // the already-paid result instead of re-submitting a closed session.
    const serverResultRef = useRef(null);

    useEffect(() => {
        if (gameState === 'results' && serverResultRef.current?.sessionId) {
            serverRun.acknowledgeSettlement();
        }
    }, [gameState, diamondsEarned, serverRun.acknowledgeSettlement]);

    async function finishGame() {
        const operationScope = accountOperationScopeRef.current.capture();
        if (operationScope.identity !== (userId || null)) return;
        const isCurrentAccountOperation = () => accountOperationScopeRef.current.isCurrent(operationScope);
        timer.setIsTimerRunning(false);
        setGameState('saving');

        if (!userId) {
            setGameState('results');
            return;
        }

        // Provisional client-side count, used ONLY for the saving_error copy -
        // every number that persists below comes from the server settlement.
        const provisionalCorrect = answersRef.current.filter(a => a && a.wasCorrect).length;

        try {
            // Phase 1: settle the run server-side (only if not already settled).
            // The server grades from the answers it stored at tap time - the
            // array below only fills in questions that never reached
            // session-answer - then applies the daily cap and pays through a
            // locked RPC. No client-side crediting, ever.
            if (savePhaseRef.current < 1) {
                const submitAnswers = questions.map((q, idx) => {
                    const a = answersRef.current[idx];
                    return {
                        questionId: q.id,
                        displayIndex: (a && Number.isInteger(a.displayIndex)) ? a.displayIndex : -1
                    };
                });
                const result = await serverRun.submit(submitAnswers);
                if (!isCurrentAccountOperation()) return;
                serverResultRef.current = result;
                savePhaseRef.current = 1;

                // Local balance from the server's post-award number, with a
                // fresh profiles read as the fallback.
                if (Number.isFinite(result?.newBalance)) {
                    setUserDiamonds(result.newBalance);
                } else {
                    const { data: profile } = await readOwnProfile(supabase, 'diamonds', { expectId: userId });
                    if (!isCurrentAccountOperation()) return;
                    if (profile) setUserDiamonds(profile.diamonds || 0);
                }
                if ((result?.diamondsAwarded || 0) > 0) {
                    busEmit.diamondsEarned(result.diamondsAwarded, 'Mixed Mode');
                    busEmit.celebration('confetti');
                }
            }
            const settled = serverResultRef.current || {};
            const awarded = Number.isFinite(settled.diamondsAwarded) ? settled.diamondsAwarded : 0;
            const serverCorrect = Number.isFinite(settled.correct) ? settled.correct : provisionalCorrect;
            const serverTotal = Number.isFinite(settled.total) ? settled.total : questions.length;
            if (!isCurrentAccountOperation()) return;

            // Settlement atomically owns history, mastery and skip telemetry.
            // The page only consumes the verified result and renders it.
            savePhaseRef.current = Math.max(savePhaseRef.current, 3);

            // Phase 4: session-submit already persisted the verified score in
            // the payout transaction. Browsers cannot insert score rows.
            if (savePhaseRef.current < 4) {
                savePhaseRef.current = 4;
            }

            // Success! The results screen shows the server-settled numbers -
            // the award was already cap-clamped and paid server-side, so an
            // award below the correct count means the daily cap absorbed the
            // difference.
            setTotalCorrect(serverCorrect);
            setDiamondsEarned(awarded);
            setCapReached(awarded < calculateDiamonds('mixed', serverCorrect, serverTotal));
            setEarnedTodayCap(prev => Math.min(DAILY_DIAMOND_CAP, prev + awarded));

            // Game saved — reset phase for next game
            setGameState('results');
            setSaveErrorPayload(null);
            savePhaseRef.current = 0;
        } catch (e) {
            console.warn('[Mixed] Failed to save results:', e);
            if (!isCurrentAccountOperation() || isStaleAccountOperation(e)) return;
            // Save failed (network drop) -> Provide Retry UI (savePhaseRef preserves progress)
            setSaveErrorPayload({ actualCorrect: provisionalCorrect, actualDiamonds: provisionalCorrect });
            setGameState('saving_error');
        }
    }

    // Retry function for network drops — resumes from where it left off
    const handleRetrySave = () => {
        setGameState('saving');
        setSaveErrorPayload(null);
        finishGame(); // savePhaseRef skips already-completed steps
    };

    // Play Again - the server deals a FRESH set for every session (the
    // just-played questions are now in trivia_user_question_history), and
    // startGame() opens the new session BEFORE charging another entry fee.
    async function playAgain() {
        await startGame();
    }

    const currentQuestion = questions[currentQuestionIndex];
    const currentCategory = CATEGORIES.find(c => c.id === currentQuestion?.displayCategory) || CATEGORIES[0];
    // The pill is a short painted slot (about eight characters at 375px);
    // longer state, balance and timer copy is printed on the glass below.
    const balanceLabel = isVip ? 'VIP' : 'Ready';
    const stateLabel = showOutOfDiamonds ? 'Balance' : ({
        loading: 'Loading',
        ready: balanceLabel,
        playing: `${formatTriviaDisplayNumber(timer.timeLeft)} Sec`,
        saving: 'Saving',
        saving_error: 'Retry',
        error: 'Error',
        results: `${formatTriviaDisplayNumber(totalCorrect)} Of ${formatTriviaDisplayNumber(questions.length)}`,
    }[gameState] || balanceLabel);

    const primaryAction = showOutOfDiamonds
        ? { label: 'Get Diamonds', onClick: () => router.push('/hub/diamond-store') }
        : gameState === 'ready'
            ? { label: 'Start Mixed Trivia', onClick: startGame }
            : gameState === 'error'
                ? { label: 'Try Again', onClick: startGame }
                : gameState === 'saving_error'
                    ? { label: 'Retry Save', onClick: handleRetrySave }
                    : gameState === 'results'
                        ? { label: 'Play Again', onClick: playAgain }
                        : null;

    const secondaryAction = showOutOfDiamonds
        ? { label: 'Close', onClick: () => setShowOutOfDiamonds(false) }
        : (gameState === 'error' || gameState === 'results')
            ? { label: 'Back To Trivia', onClick: () => router.push('/hub/trivia') }
            : null;

    return (
        <TriviaErrorBoundary pageName="Mixed Mode">
            <>
                <SEOHead
                    title="Mixed Trivia - All Categories"
                    description="Mixed Poker Trivia On Smarter.Poker: Every Category At Once And In Random Order, So You Cannot Prepare For What Is Coming. Free To Play, No Account Needed, And Nothing In It Is A Wager."
                    canonical="/hub/trivia/mixed"
                />

                <div
                    className="trivia-challenge-page trivia-challenge-page--mixed"
                    data-trivia-family="challenge"
                    data-trivia-surface="mixed"
                    data-game-state={gameState}
                >
                    <UniversalHeader pageDepth={2} />

                    {userId && !isVip && (
                        <GameCostPopup userId={userId} featureKey="trivia_mixed" isVip={isVip} cost={GAME_ENTRY_COST} />
                    )}

                    <main className="trivia-challenge-shell" aria-labelledby="mixed-trivia-title">
                        <TriviaConsole
                            className="trivia-challenge-console"
                            eyebrow="Seven Category Challenge"
                            title="Mixed Trivia"
                            titleId="mixed-trivia-title"
                            subtitle="Every Poker Discipline"
                            pill={stateLabel}
                            aria-labelledby="mixed-trivia-title"
                            primaryAction={primaryAction}
                            secondaryAction={secondaryAction}
                        >
                            {showOutOfDiamonds && (
                                <section
                                    className="trivia-challenge-alert"
                                    role="alert"
                                    aria-labelledby="mixed-diamonds-title"
                                >
                                    <h2 id="mixed-diamonds-title">Not Enough Diamonds</h2>
                                    <p>
                                        Each Game Costs {formatTriviaDisplayNumber(GAME_ENTRY_COST)} Diamonds.
                                        Get More Diamonds Or Upgrade To VIP For Unlimited Access.
                                    </p>
                                </section>
                            )}

                            {(gameState === 'loading' || gameState === 'saving') && (
                                <div className="trivia-challenge-state" role="status" aria-live="polite">
                                    <p>{gameState === 'saving' ? 'Securing Your Result' : 'Preparing Mixed Trivia'}</p>
                                </div>
                            )}

                            {gameState === 'saving_error' && (
                                <section className="trivia-challenge-state trivia-challenge-state--error" role="alert">
                                    <h2>Network Disconnected</h2>
                                    <p>
                                        We Could Not Save Your Score Of {formatTriviaDisplayNumber(saveErrorPayload?.actualCorrect)} Correct Answers.
                                        Check Your Connection And Retry To Protect {formatTriviaDisplayNumber(saveErrorPayload?.actualDiamonds)} Diamonds.
                                    </p>
                                </section>
                            )}

                            {gameState === 'error' && (
                                <section className="trivia-challenge-state trivia-challenge-state--error" role="alert">
                                    <h2>Mixed Trivia Could Not Start</h2>
                                    <p>{loadError || 'Something Went Wrong While Preparing The Game.'}</p>
                                </section>
                            )}

                            {gameState === 'ready' && (
                                <section className="trivia-challenge-intro" aria-labelledby="mixed-ready-title">
                                    <ResponsiveModeArt art={TRIVIA_INTRO_ART_MIXED} priority />
                                    <h2 id="mixed-ready-title">One Run Through Every Discipline</h2>
                                    <p>
                                        Answer {formatTriviaDisplayNumber(QUESTIONS_PER_SESSION)} Server-Dealt Questions
                                        Across History, Rules, Pro, Tournament, Cash, ICM, And GTO Play.
                                    </p>
                                    <dl className="trivia-challenge-stats">
                                        <div className="trivia-challenge-stat">
                                            <dt>Questions</dt>
                                            <dd>{formatTriviaDisplayNumber(QUESTIONS_PER_SESSION)}</dd>
                                        </div>
                                        <div className="trivia-challenge-stat">
                                            <dt>Categories</dt>
                                            <dd>{formatTriviaDisplayNumber(CATEGORIES.length)}</dd>
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
                                    <ul className="trivia-challenge-list" aria-label="Mixed Trivia Categories">
                                        {CATEGORIES.map(category => (
                                            <li key={category.id}>{category.name}</li>
                                        ))}
                                    </ul>
                                </section>
                            )}

                            {gameState === 'playing' && currentQuestion && (
                                <section className="trivia-challenge-stage" aria-labelledby="mixed-question-title">
                                    <dl className="trivia-challenge-stats trivia-challenge-stats--compact">
                                        <div className="trivia-challenge-stat">
                                            <dt>Category</dt>
                                            <dd>{currentCategory.name}</dd>
                                        </div>
                                        <div className="trivia-challenge-stat">
                                            <dt>Time</dt>
                                            <dd aria-live="off">{formatTriviaDisplayNumber(timer.timeLeft)} Seconds</dd>
                                        </div>
                                        <div className="trivia-challenge-stat">
                                            <dt>Daily Rewards</dt>
                                            <dd>
                                                {formatTriviaDisplayNumber(Math.min(DAILY_DIAMOND_CAP, earnedTodayCap + diamondsEarned))}
                                                {' Of '}
                                                {formatTriviaDisplayNumber(DAILY_DIAMOND_CAP)}
                                            </dd>
                                        </div>
                                    </dl>

                                    <progress
                                        className="trivia-challenge-progress"
                                        value={currentQuestionIndex + 1}
                                        max={Math.max(questions.length, 1)}
                                        aria-label={`Question ${currentQuestionIndex + 1} Of ${questions.length}`}
                                    />
                                    <p className="trivia-challenge-progress-label">
                                        Question {formatTriviaDisplayNumber(currentQuestionIndex + 1)} Of {formatTriviaDisplayNumber(questions.length)}
                                    </p>

                                    <h2 id="mixed-question-title" className="trivia-challenge-question">
                                        {toTitleCase(currentQuestion.question)}
                                    </h2>

                                    <div className="trivia-challenge-options">
                                        {/* TRAIN-WIRE-TRIVIA-ANSWER-OPTION-1: shared option primitive */}
                                        {currentQuestion.options.map((option, idx) => (
                                            <TriviaAnswerOption
                                                key={idx}
                                                index={idx}
                                                option={toTitleCase(option)}
                                                selectedAnswer={selectedAnswer}
                                                correctIndex={verdict ? verdict.correctDisplayIndex : null}
                                                showResult={showResult}
                                                onSelect={gradeAnswer}
                                            />
                                        ))}
                                    </div>

                                    {showResult && verdict?.explanation && (
                                        <section className="trivia-challenge-explanation" aria-labelledby="mixed-explanation-title">
                                            <h3 id="mixed-explanation-title">Why This Is Correct</h3>
                                            <p>{verdict.explanation}</p>
                                        </section>
                                    )}
                                    {showResult && (
                                        <div className="trivia-challenge-report">
                                            <ReportQuestionButton
                                                key={currentQuestion.id}
                                                questionId={currentQuestion.id}
                                                userToken={accessToken}
                                            />
                                        </div>
                                    )}

                                    <dl className="trivia-challenge-stats trivia-challenge-stats--categories">
                                        {CATEGORIES.map(category => {
                                            const stats = categoryStats[category.id];
                                            return (
                                                <div key={category.id} className="trivia-challenge-stat">
                                                    <dt>{category.name}</dt>
                                                    <dd>
                                                        {formatTriviaDisplayNumber(stats.correct)}
                                                        {' Of '}
                                                        {formatTriviaDisplayNumber(stats.answered)}
                                                    </dd>
                                                </div>
                                            );
                                        })}
                                    </dl>
                                </section>
                            )}

                            {gameState === 'results' && (
                                <section className="trivia-challenge-state trivia-challenge-state--results" aria-labelledby="mixed-results-title">
                                    <h2 id="mixed-results-title">Mixed Trivia Complete</h2>
                                    <dl className="trivia-challenge-stats">
                                        <div className="trivia-challenge-stat">
                                            <dt>Correct Answers</dt>
                                            <dd>
                                                {formatTriviaDisplayNumber(totalCorrect)}
                                                {' Of '}
                                                {formatTriviaDisplayNumber(questions.length)}
                                            </dd>
                                        </div>
                                        <div className="trivia-challenge-stat">
                                            <dt>Diamonds Earned</dt>
                                            <dd>{formatTriviaDisplayNumber(diamondsEarned)}</dd>
                                        </div>
                                    </dl>

                                    {capReached && (
                                        <p className="trivia-challenge-note">
                                            Daily Diamond Cap Reached At {formatTriviaDisplayNumber(DAILY_DIAMOND_CAP)}.
                                            Correct Answers Still Count Toward Category Mastery.
                                        </p>
                                    )}

                                    <section className="trivia-challenge-breakdown" aria-labelledby="mixed-breakdown-title">
                                        <h3 id="mixed-breakdown-title">Category Breakdown</h3>
                                        <dl className="trivia-challenge-stats trivia-challenge-stats--categories">
                                            {CATEGORIES.map(category => {
                                                const stats = categoryStats[category.id];
                                                const accuracy = stats.answered > 0
                                                    ? Math.round((stats.correct / stats.answered) * 100)
                                                    : 0;
                                                const masteryLevel = categoryMastery[category.id]?.mastery_level;
                                                return (
                                                    <div key={category.id} className="trivia-challenge-stat">
                                                        <dt>{category.name}</dt>
                                                        <dd>
                                                            {formatTriviaDisplayNumber(stats.correct)}
                                                            {' Of '}
                                                            {formatTriviaDisplayNumber(stats.answered)}
                                                            {' | '}
                                                            {formatTriviaDisplayNumber(accuracy)}%
                                                            {masteryLevel != null
                                                                ? ` | Level ${formatTriviaDisplayNumber(masteryLevel)}`
                                                                : ''}
                                                        </dd>
                                                    </div>
                                                );
                                            })}
                                        </dl>
                                    </section>

                                    <button
                                        type="button"
                                        className="trivia-challenge-action"
                                        onClick={async () => {
                                            const result = await shareResult({
                                                mode: 'Mixed',
                                                score: totalCorrect,
                                                total: questions.length,
                                                diamonds: diamondsEarned,
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
                </div>
            </>
          {/* Server rendered: measured on production this page returned
              only chrome to a crawler (AEO phase 3, 2026-09-17). */}
          <HubPageSummary page="trivia-mixed" as="h1" />
        </TriviaErrorBoundary>
    );
}

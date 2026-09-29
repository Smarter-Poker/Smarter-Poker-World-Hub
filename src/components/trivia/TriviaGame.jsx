/**
 * TRIVIA GAME - Core gameplay component with addictive game mechanics
 * 
 * Features:
 * - Fire Mode / Combo System (3+ streak = fire, escalating multipliers)
 * - Escalating Stakes (risk diamonds, cash out option)
 * - Live countdown numerals (gold, red at 10 seconds or less)
 * - Ghost Opponent integration
 * - Synthesized sound effects
 *
 * #ClubArenaConsole: the game prints flat onto the console glass it sits in.
 * Progress, clock, stakes and the head-to-head are label / value rows; the
 * question is copy; answers, hints and actions are lit words. Nothing here
 * draws a ring, gauge, bar, card or gradient. Styles: trivia-console-play.css.
 */

import { useState, useEffect, useRef } from 'react';
import { busEmit } from '../../engine/EventBus';
import HintButtons, { applyHint } from './HintButtons';
import GhostOpponent from './GhostOpponent';
import TriviaAnswerOption from './TriviaAnswerOption';
import ReportQuestionButton from './ReportQuestionButton';
import { toTitleCase } from '../../lib/trivia/titleCase';
import * as audio from '../../lib/trivia/triviaAudio';
import useVIP from '../../hooks/useVIP';
import useTriviaTimer from '../../hooks/useTriviaTimer';


// ══ Escalating stake values per question ══
const STAKE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // 55 total possible

/** Sentinels stored in answers[] for questions the player never answered. */
const SKIP_SENTINELS = new Set([-1, -2]);

/**
 * Score an answers array against the question list.
 *
 * Skipped questions (bought with the Skip hint) are NEUTRAL: excluded from
 * both the numerator and the denominator. Previously a paid skip recorded -1,
 * which the completion filter compared against correct_index and counted as
 * WRONG - the player paid 10 diamonds to get a strictly worse result than
 * guessing at random.
 */
function scoreAnswers(answers, questions) {
    let correct = 0;
    let skipped = 0;
    (answers || []).forEach((a, i) => {
        if (SKIP_SENTINELS.has(a)) { skipped += 1; return; }
        if (a === questions[i]?.correct_index) correct += 1;
    });
    const total = Math.max(1, (questions?.length || 0) - skipped);
    return { correct, skipped, total };
}

/** True when the OS asks for reduced motion (SSR-safe). */
function prefersReducedMotion() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch { return false; }
}

export default function TriviaGame({
    questions,
    mode,
    timeLimit = null,
    onComplete,
    onAnswer,
    userDiamonds = 0,
    onDiamondsChange,
    enableHints = true,
    enableStakes = false,     // Escalating diamond stakes
    enableGhostOpponent = true, // Show ghost opponent
    ghostAccuracy = null,        // Community accuracy for ghost opponent (0-1 or null)
    // Optional: called with the hint the player could not afford, so the page
    // can open its own out-of-diamonds / store modal instead of leaving
    // HintButtons' inline toast as the only feedback.
    onNeedDiamonds = null,
    // Optional server-authoritative grader:
    //   async ({questionId, displayIndex, questionIndex})
    //     => {wasCorrect, correctDisplayIndex, explanation}
    // When null (every existing mode) behavior is unchanged: questions carry
    // correct_index and grading stays client-side. When set, questions have
    // NO correct_index, so nothing can be revealed until the verdict returns.
    serverGrader = null,
    // Optional (additive): print Report Question under the answers. The
    // report route requires a signed-in bearer token.
    enableReport = false,
    reportToken = null,
}) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [showExplanation, setShowExplanation] = useState(false);
    const [answers, setAnswers] = useState([]);
    const [isLocked, setIsLocked] = useState(false);
    const { isVip } = useVIP();
    const [reduceMotion] = useState(prefersReducedMotion);

    // Hint system state
    const [hintsUsed, setHintsUsed] = useState({ fifty_fifty: false, skip: false, extra_time: false });
    const [eliminatedOptions, setEliminatedOptions] = useState([]);
    const [diamonds, setDiamonds] = useState(userDiamonds);

    // ══ NEW: Combo / Fire Mode state ══
    const [streak, setStreak] = useState(0);
    const [showCombo, setShowCombo] = useState(false);
    const [isFireMode, setIsFireMode] = useState(false);
    const [showStreakLost, setShowStreakLost] = useState(false);

    // ══ NEW: Visual juice state ══
    const [showCorrectFlash, setShowCorrectFlash] = useState(false);
    const [showWrongShake, setShowWrongShake] = useState(false);
    const [floatingDiamonds, setFloatingDiamonds] = useState([]);
    const [showBust, setShowBust] = useState(false);

    // ══ NEW: Stakes state ══
    const [stakePot, setStakePot] = useState(0);
    const [cashedOut, setCashedOut] = useState(false);

    // ══ NEW: Game active state for ghost opponent ══
    const [isGameActive, setIsGameActive] = useState(true);
    const [correctCount, setCorrectCount] = useState(0);

    // ══ NEW: Audio mute ══
    const [muted, setMuted] = useState(audio.isMuted());

    const startTimeRef = useRef(Date.now());
    const gameContainerRef = useRef(null);
    const opponentDataRef = useRef({ score: null, name: null });
    const stakePotRef = useRef(0); // Ref to avoid stale closure in advanceQuestion
    const confettiRef = useRef(null); // Lazy-loaded canvas-confetti
    const answersRef = useRef([]); // Ref mirror of answers - avoids stale closure in auto-complete
    const streakRef = useRef(0); // Ref mirror of streak

    // Server-graded verdicts keyed by questionIndex. The ref is written
    // synchronously alongside the state so the 800ms arcade auto-advance and
    // the timer-expiry auto-complete always score against the latest verdicts
    // rather than a stale render's copy.
    const [verdicts, setVerdicts] = useState({});
    const verdictsRef = useRef({});
    const storeVerdict = (questionIndex, verdict) => {
        verdictsRef.current = { ...verdictsRef.current, [questionIndex]: verdict };
        setVerdicts(verdictsRef.current);
    };

    // Phase 67: track all pending setTimeouts so unmount can cancel them.
    // Without this, the 8+ ephemeral timeouts (correct-flash, combo-popup,
    // wrong-shake, streak-lost, bust, floating-diamond cleanup, auto-advance,
    // cash-out completion) would fire on an unmounted component, causing
    // React 'setState on unmounted' warnings AND potential double-onComplete
    // calls if the user navigated away mid-cash-out (the 2-second cash-out
    // setTimeout would still fire onComplete on the dead parent).
    const pendingTimeoutsRef = useRef(new Set());
    const isMountedRef = useRef(true);
    const completedRef = useRef(false); // guards onComplete from double-firing
    const safeSetTimeout = (fn, delay) => {
        const id = setTimeout(() => {
            pendingTimeoutsRef.current.delete(id);
            if (isMountedRef.current) fn();
        }, delay);
        pendingTimeoutsRef.current.add(id);
        return id;
    };
    useEffect(() => () => {
        isMountedRef.current = false;
        for (const id of pendingTimeoutsRef.current) clearTimeout(id);
        pendingTimeoutsRef.current.clear();
    }, []);

    // Lazy-load confetti on first use (reduces initial bundle)
    const fireConfetti = async (opts) => {
        try {
            if (!confettiRef.current) {
                const mod = await import('canvas-confetti');
                confettiRef.current = mod.default || mod;
            }
            confettiRef.current(opts);
        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    };

    const currentQuestion = questions[currentIndex];
    const isArcadeMode = mode === 'arcade';

    // Verdict-aware scoring. With a serverGrader the client never holds
    // correct_index, so correctness is the count of server verdicts marked
    // correct instead of an answers-vs-key comparison. Used by all three
    // completion paths (advance, timer expiry, cash-out).
    const scoreCurrent = (answersArr) => {
        if (!serverGrader) return scoreAnswers(answersArr, questions);
        let skipped = 0;
        (answersArr || []).forEach((a) => { if (SKIP_SENTINELS.has(a)) skipped += 1; });
        const correct = Object.values(verdictsRef.current).filter(v => v?.wasCorrect).length;
        const total = Math.max(1, (questions?.length || 0) - skipped);
        return { correct, skipped, total };
    };

    // ── Multiplier from streak ──
    const getMultiplier = () => {
        if (streak >= 7) return 5;
        if (streak >= 5) return 3;
        if (streak >= 3) return 2;
        return 1;
    };

    // ══ TIMER ══
    // Was a hand-rolled setInterval that (a) decremented by 1 per >=1000ms
    // tick, so a "180 second" clock ran measurably long and paid an arcade
    // time bonus for time that never existed, and (b) called side effects
    // (audio, setIsGameActive) from INSIDE a setState updater, which React 18
    // may invoke twice. The shared hook is deadline-anchored and keeps its
    // updater pure. pauseOnHide:false - arcade is a paid, leaderboarded mode,
    // so hiding the tab must not stop the clock.
    const {
        timeLeft: timeRemaining,
        setTimeLeft: setTimeRemaining,
        setIsTimerRunning,
        resetTimer,
        getPreciseTimeLeft,
    } = useTriviaTimer({
        initialTime: timeLimit || 0,
        showResult: false,
        gameState: 'playing',
        playingState: 'playing',
        pauseOnHide: false,
        onTimeout: () => {
            // Expiry is detected in the hook and reported here exactly once;
            // the auto-complete effect below does the scoring.
            setIsGameActive(false);
        },
    });

    // Start the clock once on mount for timed modes.
    useEffect(() => {
        if (timeLimit) resetTimer(timeLimit);
        else setIsTimerRunning(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timeLimit]);

    // Countdown audio, driven by the displayed value rather than from inside
    // the updater. Guarded so it cannot fire after the game ends.
    const lastBeepRef = useRef(null);
    useEffect(() => {
        if (!timeLimit || !isGameActive || timeRemaining <= 0) return;
        if (lastBeepRef.current === timeRemaining) return;
        lastBeepRef.current = timeRemaining;
        if (timeRemaining <= 5) audio.countdownBeep(timeRemaining);
        if (timeRemaining <= 10) audio.timerTick();
    }, [timeRemaining, isGameActive, timeLimit]);

    // Warn user before leaving during active game.
    // currentIndex > 0 alone skipped question 1 - a stakes player who answered
    // the first question already has real diamonds on the table.
    useEffect(() => {
        const handler = (e) => {
            if (isGameActive && (currentIndex > 0 || stakePotRef.current > 0)) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isGameActive, currentIndex]);

    // Keep the local diamond copy in sync with the parent's authoritative
    // balance. Previously seeded once at mount and then only decremented
    // locally, so hint affordability checks drifted from the real balance.
    useEffect(() => {
        setDiamonds(userDiamonds);
    }, [userDiamonds]);

    // Mute is global state in triviaAudio; subscribe so a toggle in another
    // component (or another tab) keeps this icon truthful.
    useEffect(() => audio.onMuteChange(setMuted), []);

    // Keep refs in sync with state (for auto-complete closure)
    useEffect(() => { answersRef.current = answers; }, [answers]);
    useEffect(() => { streakRef.current = streak; }, [streak]);

    // Auto-complete game when timer expires (arcade mode).
    // Phase 67: completedRef guard prevents double-onComplete race. Race
    // scenario: user clicks answer at 1s left → selectAnswer auto-advances
    // (800ms setTimeout → onComplete) → simultaneously timer ticks to 0
    // → setIsGameActive(false) + setTimeRemaining(0) → this effect ALSO
    // fires onComplete. Parent would record the score / award diamonds
    // twice. The ref ensures onComplete fires at most once per mount.
    useEffect(() => {
        if (!timeLimit || timeRemaining > 0 || isGameActive) return;
        if (completedRef.current) return;
        completedRef.current = true;
        audio.bustDrop();
        const timeSpent = Math.floor((Date.now() - startTimeRef.current) / 1000);
        const a = answersRef.current;
        const { correct, skipped, total } = scoreCurrent(a);
        onComplete({
            answers: a, correctCount: correct, totalQuestions: total,
            skippedCount: skipped,
            timeSpent, timeRemaining: 0,
            stakePot: enableStakes ? stakePotRef.current : undefined,
            streak: streakRef.current,
            opponentScore: opponentDataRef.current.score,
            opponentName: opponentDataRef.current.name,
        });
    // questions, onComplete, enableStakes are stable props - safe to omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timeRemaining, isGameActive, timeLimit]);

    // ── Spawn floating diamond ──
    const spawnFloatingDiamond = (value) => {
        const id = Date.now() + Math.random();
        setFloatingDiamonds(prev => [...prev, { id, value }]);
        // Phase 67: safeSetTimeout instead of setTimeout - was leaking the
        // setFloatingDiamonds call onto unmounted parents when the user
        // navigated away during the 1.2s animation window.
        safeSetTimeout(() => {
            setFloatingDiamonds(prev => prev.filter(d => d.id !== id));
        }, 1200);
    };

    // ══ ANSWER SELECTION ══
    // Shared correct/wrong side-effect sequence for BOTH grading paths - the
    // synchronous client-keyed one (correct_index) and the async serverGrader
    // one. Factored out so the server path replays exactly the same effects
    // once the verdict arrives instead of duplicating this block.
    const applyVerdict = (correct, index, newAnswers) => {
        if (correct) {
            // ── CORRECT ──
            audio.correctChime();
            setShowCorrectFlash(true);
            safeSetTimeout(() => setShowCorrectFlash(false), 500);
            busEmit.decisionCorrect(streak + 1);

            const newStreak = streak + 1;
            setStreak(newStreak);
            setCorrectCount(prev => prev + 1);

            // Fire mode activation
            if (newStreak >= 3 && !isFireMode) {
                setIsFireMode(true);
                audio.fireWhoosh();
            }

            // Combo popup
            if (newStreak >= 2) {
                audio.streakDing(newStreak);
                setShowCombo(true);
                safeSetTimeout(() => setShowCombo(false), 1500);
            }

            // Stakes pot
            if (enableStakes) {
                const stakeValue = STAKE_VALUES[Math.min(currentIndex, STAKE_VALUES.length - 1)] * getMultiplier();
                setStakePot(prev => {
                    const newPot = prev + stakeValue;
                    stakePotRef.current = newPot;
                    return newPot;
                });
                spawnFloatingDiamond(stakeValue);
            } else {
                spawnFloatingDiamond(1);
            }

            // Confetti burst
            fireConfetti({
                particleCount: isFireMode ? 30 : 12,
                spread: 50,
                origin: { y: 0.7 },
                colors: isFireMode ? ['#f02849', '#ff5b6e', '#ffd700'] : ['#35d95a', '#45adff'],
                disableForReducedMotion: true,
            });

        } else {
            // ── WRONG ──
            audio.wrongBuzz();
            setShowWrongShake(true);
            safeSetTimeout(() => setShowWrongShake(false), 400);
            busEmit.decisionIncorrect(streak);
            busEmit.screenShake('light');

            // Break streak
            if (streak >= 2) {
                setShowStreakLost(true);
                safeSetTimeout(() => setShowStreakLost(false), 1500);
            }
            setStreak(0);
            setIsFireMode(false);

            // Stakes: bust!
            if (enableStakes && stakePot > 0) {
                audio.bustDrop();
                setShowBust(true);
                safeSetTimeout(() => setShowBust(false), 2000);
                setStakePot(0);
                stakePotRef.current = 0;
            }
        }

        if (onAnswer) {
            onAnswer({ questionIndex: currentIndex, answerIndex: index, isCorrect: correct });
        }

        // Auto-advance in arcade mode
        if (isArcadeMode) {
            safeSetTimeout(() => advanceQuestion(newAnswers), 800);
        }
    };

    const selectAnswer = (index) => {
        if (isLocked || selectedAnswer !== null) return;

        audio.chipClick();
        setSelectedAnswer(index);
        setIsLocked(true);

        if (serverGrader) {
            // Server-authoritative path: the tap locks in instantly, but the
            // verdict (and any reveal) waits for the server. answers[] is only
            // appended on success so a failed call can be re-tapped without
            // recording a duplicate slot; the server treats the FIRST answer
            // per question as binding and replays the stored verdict on
            // retry, so unlocking here is safe.
            serverGrader({ questionId: currentQuestion.id, displayIndex: index, questionIndex: currentIndex })
                .then((verdict) => {
                    if (!isMountedRef.current) return;
                    storeVerdict(currentIndex, verdict);
                    const newAnswers = [...answersRef.current, index];
                    setAnswers(newAnswers);
                    applyVerdict(!!verdict?.wasCorrect, index, newAnswers);
                })
                .catch((err) => {
                    console.warn('[TriviaGame] serverGrader failed, unlocking for retry:', err?.message || err);
                    if (!isMountedRef.current) return;
                    setSelectedAnswer(null);
                    setIsLocked(false);
                });
            return;
        }

        const correct = index === currentQuestion.correct_index;
        const newAnswers = [...answers, index];
        setAnswers(newAnswers);
        applyVerdict(correct, index, newAnswers);
    };

    // ══ ADVANCE ══
    // advancedForIndexRef: two rapid clicks on Next both ran
    // setCurrentIndex(prev => prev + 1), skipping a question. The skipped
    // question never got an answer appended, so from that point answers[i]
    // was scored against questions[i+1] - corrupted score AND reward.
    const advancedForIndexRef = useRef(-1);
    const advanceQuestion = (currentAnswers = answers) => {
        if (advancedForIndexRef.current === currentIndex) return;
        advancedForIndexRef.current = currentIndex;

        if (currentIndex >= questions.length - 1) {
            // Phase 67: guard against the timer-expiry useEffect ALSO firing
            // onComplete in the same tick when the user finishes the last
            // question right as time hits 0 in arcade mode.
            if (completedRef.current) return;
            completedRef.current = true;
            setIsTimerRunning(false);
            setIsGameActive(false);
            const timeSpent = Math.floor((Date.now() - startTimeRef.current) / 1000);
            const { correct, skipped, total } = scoreCurrent(currentAnswers);
            if (correct === total) audio.victoryFanfare();
            onComplete({
                answers: currentAnswers, correctCount: correct,
                totalQuestions: total, skippedCount: skipped, timeSpent,
                // Read the live clock, not the value captured when the
                // 800ms arcade auto-advance closure was created (up to ~1s
                // stale, which inflated the arcade time bonus).
                timeRemaining: timeLimit ? Math.floor(getPreciseTimeLeft()) : 0,
                stakePot: enableStakes ? stakePotRef.current : undefined,
                streak: streakRef.current,
                opponentScore: opponentDataRef.current.score,
                opponentName: opponentDataRef.current.name,
            });
        } else {
            audio.cardDealWhoosh();
            setCurrentIndex(prev => prev + 1);
            setSelectedAnswer(null);
            setShowExplanation(false);
            setIsLocked(false);
            setEliminatedOptions([]);
        }
    };

    // ══ CASH OUT (stakes mode) ══
    const handleCashOut = () => {
        if (!enableStakes || stakePot <= 0) return;
        // Phase 67: guard against double-trigger if user double-clicks
        // Cash Out, AND against onComplete also firing from auto-advance
        // / timer-expiry paths during the 2-second cash-out animation.
        if (completedRef.current) return;
        completedRef.current = true;
        audio.cashOutKaChing();
        setCashedOut(true);
        setIsGameActive(false);
        setIsTimerRunning(false);

        // Do NOT call onDiamondsChange here - handleComplete in [mode].js handles the award

        fireConfetti({
            particleCount: 100, spread: 70, origin: { y: 0.5 },
            colors: ['#ffd700', '#1877f2', '#35d95a'],
            disableForReducedMotion: true,
        });

        const timeSpent = Math.floor((Date.now() - startTimeRef.current) / 1000);
        // Capture ref-based values NOW to avoid stale closure in 2s setTimeout
        const cashOutAnswers = [...answersRef.current];
        const { correct: cashOutCC, skipped: cashOutSkipped, total: cashOutTotal } =
            scoreCurrent(cashOutAnswers);
        const cashOutStreak = streakRef.current;
        const cashOutStakePot = stakePotRef.current;
        const cashOutTimeRemaining = timeLimit ? Math.floor(getPreciseTimeLeft()) : 0;
        safeSetTimeout(() => {
            onComplete({
                answers: cashOutAnswers, correctCount: cashOutCC, totalQuestions: cashOutTotal,
                skippedCount: cashOutSkipped,
                timeSpent, timeRemaining: cashOutTimeRemaining,
                stakePot: cashOutStakePot, cashedOut: true, streak: cashOutStreak,
                opponentScore: opponentDataRef.current.score,
                opponentName: opponentDataRef.current.name,
            });
        }, 2000);
    };

    // ══ KEYBOARD CONTROLS ══
    // 1-4 / A-D pick an answer, Enter advances, Esc moves focus to Cash Out
    // (focus, never an instant cash-out - a stray Esc must not move diamonds).
    const cashOutBtnRef = useRef(null);
    useEffect(() => {
        const onKeyDown = (e) => {
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            const target = e.target;
            const tag = (target?.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;

            const key = e.key;

            // Answer selection
            if (selectedAnswer === null && !isLocked && currentQuestion) {
                let idx = -1;
                if (/^[1-9]$/.test(key)) idx = parseInt(key, 10) - 1;
                else if (/^[a-jA-J]$/.test(key)) idx = key.toLowerCase().charCodeAt(0) - 97;
                if (idx >= 0 && idx < (currentQuestion.options?.length || 0) && !eliminatedOptions.includes(idx)) {
                    e.preventDefault();
                    selectAnswer(idx);
                    return;
                }
            }

            // Advance (non-arcade advances manually). Buttons already handle
            // Enter/Space themselves, so don't double-fire on a focused one.
            if ((key === 'Enter' || key === ' ') && !isArcadeMode && selectedAnswer !== null && tag !== 'button' && tag !== 'a') {
                e.preventDefault();
                advanceQuestion();
                return;
            }

            if (key === 'Escape' && cashOutBtnRef.current) {
                e.preventDefault();
                cashOutBtnRef.current.focus();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedAnswer, isLocked, currentQuestion, eliminatedOptions, isArcadeMode, currentIndex, answers]);

    const getDifficultyInk = (difficulty) => {
        switch (difficulty) {
            case 'easy': return 'tc-ink--green';
            case 'medium': return 'tc-ink--gold';
            case 'hard': return 'tc-ink--red';
            default: return 'tc-ink--muted';
        }
    };

    const getCategoryName = (category) => {
        const names = {
            poker_history: 'Poker History', famous_hands: 'Famous Hands',
            gto_theory: 'GTO Theory', player_profiles: 'Player Profiles',
            tournament_facts: 'Tournament Facts', rule_knowledge: 'Rules & Etiquette'
        };
        return names[category] || 'General';
    };

    if (!currentQuestion) return null;

    const multiplier = getMultiplier();
    const canCashOut = enableStakes && currentIndex >= 5 && stakePot > 0 && selectedAnswer === null;

    // With a serverGrader the answer key never reaches the client - nothing
    // is revealed until the verdict exists (null means "no correct/incorrect
    // classes or icons yet"). Without one this is exactly correct_index, so
    // every existing mode reveals on tap as before.
    const revealedCorrectIndex = serverGrader
        ? (verdicts[currentIndex]?.correctDisplayIndex ?? null)
        : currentQuestion.correct_index;
    const currentExplanation = serverGrader
        ? (verdicts[currentIndex]?.explanation ?? null)
        : currentQuestion.explanation;

    const stakeForQuestion = STAKE_VALUES[Math.min(currentIndex, STAKE_VALUES.length - 1)] * multiplier;
    const clockInk = timeRemaining <= 10 ? 'tc-ink--red' : 'tc-ink--gold';
    const latestFloat = floatingDiamonds.length > 0 ? floatingDiamonds[floatingDiamonds.length - 1] : null;
    // One live status line replaces the old popups. Priority: the outcome
    // that matters most to the player right now.
    const flash = cashedOut
        ? { text: `Cashed Out +${stakePotRef.current} Diamonds`, ink: 'tc-ink--green', role: 'status' }
        : showBust
            ? { text: 'Busted!', ink: 'tc-ink--red', role: 'alert' }
            : showStreakLost
                ? { text: 'Streak Lost!', ink: 'tc-ink--red', role: 'status' }
                : showCombo
                    ? { text: `${streak} In A Row!${multiplier > 1 ? ` ${multiplier}X` : ''}`, ink: 'tc-ink--gold', role: 'status' }
                    : null;

    return (
        <div
            className={`trivia-game ${isFireMode ? 'fire-mode' : ''} ${showWrongShake && !reduceMotion ? 'screen-shake' : ''} ${showCorrectFlash ? 'correct-flash' : ''}`}
            ref={gameContainerRef}
        >
            {/* Screen-reader running commentary: score and time pressure are
                otherwise conveyed only by colour. */}
            <div className="trivia-sr-only" role="status" aria-live="polite">
                {`Question ${currentIndex + 1} of ${questions.length}. ${correctCount} correct so far.`}
            </div>

            {/* ════ Progress, clock and stakes: rows on the glass ════ */}
            <ul className="tc-rows trivia-game__rows">
                <li className="tc-row">
                    <span className="tc-row__label">Question</span>
                    <span className="tc-row__value question-count">
                        {currentIndex + 1} Of {questions.length}
                    </span>
                </li>
                {timeLimit && (
                    <li className="tc-row trivia-game__clock-row">
                        <span className="tc-row__label">Time Left</span>
                        <span className={`tc-row__value trivia-game__clock ${clockInk}`}>
                            {Math.floor(Math.max(0, timeRemaining) / 60)}:{String(Math.max(0, timeRemaining) % 60).padStart(2, '0')}
                        </span>
                        {/* Time pressure was purely visual. Announce at the
                            10s and 5s marks (and only then) so screen-reader
                            users are not spammed once per second. */}
                        <span className="trivia-sr-only" role="timer" aria-live="assertive">
                            {timeRemaining === 10 || timeRemaining === 5
                                ? `${timeRemaining} seconds remaining`
                                : ''}
                        </span>
                    </li>
                )}
                {enableStakes && (
                    <li className={`tc-row stakes-bar ${showBust ? 'busted' : ''}`}>
                        <span className="tc-row__label">Diamonds At Risk</span>
                        <span className={`tc-row__value stake-value ${showBust ? 'tc-ink--red' : 'tc-ink--gold'}`}>
                            {stakePot}
                        </span>
                    </li>
                )}
                {enableStakes && multiplier > 1 && (
                    <li className="tc-row">
                        <span className="tc-row__label">Multiplier</span>
                        <span className="tc-row__value tc-ink--gold">{multiplier}X</span>
                    </li>
                )}
                {isFireMode && (
                    <li className="tc-row">
                        <span className="tc-row__label">Streak</span>
                        <span className="tc-row__value tc-ink--red">Fire Mode {streak} In A Row</span>
                    </li>
                )}
            </ul>

            {/* ════ Ghost Opponent ════ */}
            {enableGhostOpponent && (
                <GhostOpponent
                    totalQuestions={questions.length}
                    currentQuestionIndex={currentIndex}
                    playerCorrectCount={correctCount}
                    isGameActive={isGameActive}
                    realAccuracy={ghostAccuracy}
                    // Ghost "thinking" time scales with question difficulty -
                    // without this it always used the flat 1-4s fallback.
                    questionDifficulty={currentQuestion?.difficulty}
                    onOpponentResult={(score, name) => {
                        opponentDataRef.current = { score, name };
                    }}
                />
            )}

            {/* ════ Live status line (combo, streak lost, bust, cash out) ════ */}
            <div className="trivia-game__flash" aria-live="polite">
                {flash ? (
                    <p className={`trivia-game__flash-text ${flash.ink}`} role={flash.role}>{flash.text}</p>
                ) : latestFloat ? (
                    <p key={latestFloat.id} className={`trivia-game__flash-text tc-ink--gold ${reduceMotion ? '' : 'is-rising'}`}>
                        +{latestFloat.value} Diamonds
                    </p>
                ) : null}
            </div>

            {/* ════ Question ════ */}
            <div key={currentIndex} className="question-card">
                <div className="question-meta">
                    <span className="category tc-label">{getCategoryName(currentQuestion.category)}</span>
                    <span className={`difficulty ${getDifficultyInk(currentQuestion.difficulty)}`}>
                        {toTitleCase(currentQuestion.difficulty || '')}
                    </span>
                    {enableStakes && (
                        <span className="question-stake tc-ink--gold">
                            {stakeForQuestion} Diamonds
                        </span>
                    )}
                </div>

                {/* Question Text */}
                <h2 className="question-text">{toTitleCase(currentQuestion.question)}</h2>

                {/* Answer Options: the shared console answer control, so every
                    Trivia surface prints selected, correct, incorrect and
                    removed states the same way. Nothing is revealed until the
                    verdict exists (revealedCorrectIndex stays null). */}
                <div className="options">
                    {currentQuestion.options.map((option, index) => {
                        const revealed = selectedAnswer !== null && revealedCorrectIndex !== null;
                        return (
                            <TriviaAnswerOption
                                key={index}
                                index={index}
                                option={toTitleCase(option)}
                                selectedAnswer={selectedAnswer}
                                correctIndex={revealed ? revealedCorrectIndex : -1}
                                showResult={revealed}
                                eliminated={eliminatedOptions.includes(index)}
                                disabled={isLocked || eliminatedOptions.includes(index)}
                                onSelect={selectAnswer}
                                announceResult
                            />
                        );
                    })}
                </div>

                {/* Hint Buttons. Force-disabled under a serverGrader: the
                    50/50 hint needs the answer key client-side, which is
                    exactly what server grading removes. */}
                {enableHints && !isArcadeMode && !serverGrader && selectedAnswer === null && (
                    <div className="hints-section">
                        <HintButtons
                            userDiamonds={diamonds}
                            // Only the +30s hint depends on a clock. HintButtons
                            // used to disable ALL THREE when hasTimeLimit was
                            // false, which killed the entire diamond-sink in every
                            // mode without a clock (daily/history/rules/pro all
                            // have timeLimit: null). It now gates per-hint, so the
                            // truthful value is passed here AND extra_time is
                            // listed as disabled - belt and braces, since paying
                            // for +30s with no timer must never be possible.
                            hasTimeLimit={!!timeLimit}
                            // Let the page surface its own out-of-diamonds
                            // modal; HintButtons falls back to its inline
                            // notice when no handler is supplied.
                            onNeedDiamonds={onNeedDiamonds}
                            questionId={currentQuestion?.id}
                            disabledHints={[
                                ...Object.entries(hintsUsed || {}).filter(([, used]) => used).map(([id]) => id),
                                ...(timeLimit ? [] : ['extra_time']),
                            ]}
                            onUseHint={(hint) => {
                                // Defence in depth: never charge for +30s when
                                // there is no clock to add it to.
                                if (hint.id === 'extra_time' && !timeLimit) return;
                                const result = applyHint(hint.id, currentQuestion, { eliminatedOptions, timeRemaining });
                                if (result.hiddenOptions) setEliminatedOptions(result.hiddenOptions);
                                if (result.addTime) setTimeRemaining(prev => (prev || 0) + result.addTime);
                                // Phase 67 fix: was passing [...answers, -1] only to
                                // advanceQuestion as a parameter, but for non-last
                                // questions advanceQuestion ignores the param and just
                                // bumps the UI. The React `answers` state never got the
                                // -1, so the next selectAnswer's `setAnswers([...answers, index])`
                                // missed the skipped slot - array indices were off-by-one
                                // vs the questions[] array, causing misaligned scoring at
                                // game end (filter compared answer N to question N-1).
                                // Always update React state AND pass the same array to
                                // advanceQuestion for the last-question case.
                                if (result.skipQuestion) {
                                    const newAnswers = [...answers, -1];
                                    setAnswers(newAnswers);
                                    advanceQuestion(newAnswers);
                                }

                                if (!isVip) {
                                    setDiamonds(prev => prev - hint.cost);
                                    onDiamondsChange?.(-hint.cost);
                                }
                                setHintsUsed(prev => ({ ...prev, [hint.id]: true }));
                            }}
                        />
                    </div>
                )}

                {/* Explanation - under a serverGrader it arrives with the
                    verdict rather than on the question row. */}
                {!isArcadeMode && selectedAnswer !== null && currentExplanation && (
                    <div className="explanation-section">
                        <button
                            type="button"
                            className="explanation-toggle tc-word"
                            onClick={() => setShowExplanation(!showExplanation)}
                            aria-expanded={showExplanation}
                        >
                            {showExplanation ? 'Hide Explanation' : 'Show Explanation'}
                        </button>
                        {showExplanation && (
                            <div className="explanation-content">
                                <p className="trivia-console-copy">{currentExplanation}</p>
                            </div>
                        )}
                    </div>
                )}

                {/* ════ Actions: lit words on the glass ════ */}
                <div className="trivia-game__actions">
                    {!isArcadeMode && selectedAnswer !== null && (
                        <button
                            type="button"
                            className="next-button tc-word"
                            onClick={() => advanceQuestion()}
                        >
                            {currentIndex >= questions.length - 1 ? 'See Results' : 'Next Question'}
                        </button>
                    )}
                    {canCashOut && (
                        <button
                            type="button"
                            className="cash-out-btn tc-word tc-ink--gold"
                            onClick={handleCashOut}
                            ref={cashOutBtnRef}
                            aria-label={`Cash Out ${stakePot} Diamonds And End The Game`}
                        >
                            Cash Out {stakePot} Diamonds
                        </button>
                    )}
                    <button
                        type="button"
                        className="mute-toggle tc-word"
                        onClick={() => { audio.toggleMute(); }}
                        aria-label={muted ? 'Turn Sound On' : 'Turn Sound Off'}
                        aria-pressed={muted}
                        title={muted ? 'Turn Sound On' : 'Turn Sound Off'}
                    >
                        {muted ? 'Sound Off' : 'Sound On'}
                    </button>
                    {enableReport && currentQuestion?.id ? (
                        <ReportQuestionButton key={currentQuestion.id} questionId={currentQuestion.id} userToken={reportToken} />
                    ) : null}
                </div>
            </div>
        </div>
    );
}

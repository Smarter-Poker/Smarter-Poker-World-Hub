/**
 * TRIVIA GAME — Core gameplay component with addictive game mechanics
 * 
 * Features:
 * - Fire Mode / Combo System (3+ streak = fire, escalating multipliers)
 * - Escalating Stakes (risk diamonds, cash out option)
 * - Circular SVG Timer Ring with heartbeat pressure
 * - Visual Juice (confetti, screen shake, diamond float-up, card-deal transitions)
 * - Ghost Opponent integration
 * - Synthesized sound effects
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { busEmit } from '../../engine/EventBus';
import { ChevronRight, ChevronDown, ChevronUp, CheckCircle, XCircle, Zap, Gem, Flame, Volume2, VolumeX, Skull } from 'lucide-react';
import HintButtons, { applyHint } from './HintButtons';
import GhostOpponent from './GhostOpponent';
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
 * WRONG — the player paid 10 diamonds to get a strictly worse result than
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
    const answersRef = useRef([]); // Ref mirror of answers — avoids stale closure in auto-complete
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
    // updater pure. pauseOnHide:false — arcade is a paid, leaderboarded mode,
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
    // currentIndex > 0 alone skipped question 1 — a stakes player who answered
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
    // questions, onComplete, enableStakes are stable props — safe to omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timeRemaining, isGameActive, timeLimit]);

    // ── Spawn floating diamond ──
    const spawnFloatingDiamond = (value) => {
        const id = Date.now() + Math.random();
        setFloatingDiamonds(prev => [...prev, { id, value }]);
        // Phase 67: safeSetTimeout instead of setTimeout — was leaking the
        // setFloatingDiamonds call onto unmounted parents when the user
        // navigated away during the 1.2s animation window.
        safeSetTimeout(() => {
            setFloatingDiamonds(prev => prev.filter(d => d.id !== id));
        }, 1200);
    };

    // ══ ANSWER SELECTION ══
    // Shared correct/wrong side-effect sequence for BOTH grading paths — the
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
                colors: isFireMode ? ['#f97316', '#f02849', '#fbbf24'] : ['#31a24c', '#2374e1'],
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
    // was scored against questions[i+1] — corrupted score AND reward.
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

        // Do NOT call onDiamondsChange here — handleComplete in [mode].js handles the award

        fireConfetti({
            particleCount: 100, spread: 70, origin: { y: 0.5 },
            colors: ['#fbbf24', '#2374e1', '#31a24c'],
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
    // (focus, never an instant cash-out — a stray Esc must not move diamonds).
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

    const getDifficultyColor = (difficulty) => {
        switch (difficulty) {
            case 'easy': return '#22c55e';
            case 'medium': return '#fbbf24';
            case 'hard': return '#ef4444';
            default: return '#6b7280';
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

    const timerPercentage = timeLimit ? (timeRemaining / timeLimit) * 100 : 100;
    const multiplier = getMultiplier();
    const canCashOut = enableStakes && currentIndex >= 5 && stakePot > 0 && selectedAnswer === null;

    // With a serverGrader the answer key never reaches the client — nothing
    // is revealed until the verdict exists (null means "no correct/incorrect
    // classes or icons yet"). Without one this is exactly correct_index, so
    // every existing mode reveals on tap as before.
    const revealedCorrectIndex = serverGrader
        ? (verdicts[currentIndex]?.correctDisplayIndex ?? null)
        : currentQuestion.correct_index;
    const currentExplanation = serverGrader
        ? (verdicts[currentIndex]?.explanation ?? null)
        : currentQuestion.explanation;

    return (
        <div
            className={`trivia-game ${isFireMode ? 'fire-mode' : ''} ${showWrongShake ? 'screen-shake' : ''} ${showCorrectFlash ? 'correct-flash' : ''}`}
            ref={gameContainerRef}
        >
            {/* Screen-reader running commentary: score and time pressure are
                otherwise conveyed only by colour and animation. */}
            <div className="sr-only" role="status" aria-live="polite">
                {`Question ${currentIndex + 1} of ${questions.length}. ${correctCount} correct so far.`}
            </div>

            {/* ════ Fire Mode Background Particles ════ */}
            {isFireMode && !reduceMotion && (
                <div className="fire-particles" aria-hidden>
                    {[...Array(20)].map((_, i) => (
                        <div key={i} className="ember" style={{
                            left: `${Math.random() * 100}%`,
                            animationDelay: `${Math.random() * 3}s`,
                            animationDuration: `${2 + Math.random() * 3}s`,
                        }} />
                    ))}
                </div>
            )}

            {/* ════ Mute Toggle ════ */}
            <button
                type="button"
                className="mute-toggle"
                onClick={() => { audio.toggleMute(); }}
                aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
                aria-pressed={muted}
                title={muted ? 'Unmute sounds' : 'Mute sounds'}
            >
                {muted ? <VolumeX size={18} aria-hidden /> : <Volume2 size={18} aria-hidden />}
            </button>

            {/* ════ Ghost Opponent ════ */}
            {enableGhostOpponent && (
                <GhostOpponent
                    totalQuestions={questions.length}
                    currentQuestionIndex={currentIndex}
                    playerCorrectCount={correctCount}
                    isGameActive={isGameActive}
                    realAccuracy={ghostAccuracy}
                    // Ghost "thinking" time scales with question difficulty —
                    // without this it always used the flat 1-4s fallback.
                    questionDifficulty={currentQuestion?.difficulty}
                    onOpponentResult={(score, name) => {
                        opponentDataRef.current = { score, name };
                    }}
                />
            )}

            {/* ════ Stakes Bar ════ */}
            {enableStakes && (
                <div className={`stakes-bar ${showBust ? 'busted' : ''}`}>
                    <div className="stakes-pot">
                        <Gem size={18} className="stake-gem" />
                        <span className="stake-value">{stakePot}</span>
                        <span className="stake-label">at risk</span>
                    </div>
                    {multiplier > 1 && (
                        <div className="multiplier-badge">
                            <Zap size={14} />
                            <span>{multiplier}x</span>
                        </div>
                    )}
                    {canCashOut && (
                        <button
                            type="button"
                            className="cash-out-btn"
                            onClick={handleCashOut}
                            ref={cashOutBtnRef}
                            aria-label={`Cash out ${stakePot} diamonds and end the game`}
                        >
                            CASH OUT <Gem size={14} aria-hidden /> {stakePot}
                        </button>
                    )}
                </div>
            )}

            {/* ════ Combo Popup ════ */}
            <AnimatePresence>
                {showCombo && (
                    <motion.div
                        className="combo-popup"
                        initial={{ opacity: 0, scale: 0.5, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: -20 }}
                    >
                        <Flame size={24} className="combo-flame" />
                        <span>{streak} IN A ROW!</span>
                        {multiplier > 1 && <span className="combo-mult">{multiplier}x</span>}
                    </motion.div>
                )}
                {showStreakLost && (
                    <motion.div
                        className="streak-lost-popup"
                        initial={{ opacity: 0, scale: 1.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        STREAK LOST!
                    </motion.div>
                )}
                {showBust && (
                    <motion.div
                        className="bust-popup"
                        initial={{ opacity: 0, scale: 2, rotateZ: -5 }}
                        animate={{ opacity: 1, scale: 1, rotateZ: 0 }}
                        exit={{ opacity: 0, y: 50 }}
                        role="alert"
                    >
                        <Skull size={30} aria-hidden />
                        <span>BUSTED!</span>
                    </motion.div>
                )}
                {cashedOut && (
                    <motion.div
                        className="cashout-popup"
                        initial={{ opacity: 0, scale: 1.6 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        role="status"
                    >
                        <Gem size={26} aria-hidden />
                        <span>CASHED OUT +{stakePotRef.current}</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ════ Progress & Timer ════ */}
            <div className="game-header">
                <div className="progress-info">
                    <span className="question-count">
                        Question {currentIndex + 1} of {questions.length}
                    </span>
                    <div className="progress-bar">
                        <div
                            className="progress-fill"
                            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
                        />
                    </div>
                </div>

                {timeLimit && (
                    <div className={`timer-ring-container ${timeRemaining <= 5 && !reduceMotion ? 'heartbeat' : ''}`}>
                        <svg viewBox="0 0 60 60" className="timer-ring" aria-hidden>
                            <circle cx="30" cy="30" r="26" className="timer-ring-bg" />
                            <circle
                                cx="30" cy="30" r="26"
                                className="timer-ring-fill"
                                style={{
                                    strokeDasharray: `${2 * Math.PI * 26}`,
                                    strokeDashoffset: `${2 * Math.PI * 26 * (1 - timerPercentage / 100)}`,
                                    stroke: timerPercentage > 50 ? '#22c55e' : timerPercentage > 25 ? '#fbbf24' : '#ef4444',
                                }}
                            />
                        </svg>
                        <span className={`timer-text ${timeRemaining <= 5 ? 'critical' : ''}`}>
                            {timeRemaining}
                        </span>
                        {/* Time pressure was purely visual. Announce at the
                            10s and 5s marks (and only then) so screen-reader
                            users are not spammed once per second. */}
                        <span className="sr-only" role="timer" aria-live="assertive">
                            {timeRemaining === 10 || timeRemaining === 5
                                ? `${timeRemaining} seconds remaining`
                                : ''}
                        </span>
                    </div>
                )}
            </div>

            {/* ════ Question Card ════ */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentIndex}
                    className="question-card"
                    initial={{ opacity: 0, rotateY: 90, scale: 0.9 }}
                    animate={{ opacity: 1, rotateY: 0, scale: 1 }}
                    exit={{ opacity: 0, rotateY: -90, scale: 0.9 }}
                    transition={{ duration: 0.35, type: 'spring', stiffness: 200 }}
                >
                    {/* Category & Difficulty */}
                    <div className="question-meta">
                        <span className="category">{getCategoryName(currentQuestion.category)}</span>
                        <span className="difficulty" style={{ color: getDifficultyColor(currentQuestion.difficulty) }}>
                            {currentQuestion.difficulty?.toUpperCase()}
                        </span>
                        {enableStakes && (
                            <span className="question-stake">
                                <Gem size={12} /> {STAKE_VALUES[Math.min(currentIndex, STAKE_VALUES.length - 1)] * multiplier}
                            </span>
                        )}
                    </div>

                    {/* Question Text */}
                    <h2 className="question-text">{toTitleCase(currentQuestion.question)}</h2>

                    {/* Answer Options */}
                    <div className="options">
                        {currentQuestion.options.map((option, index) => {
                            const isEliminated = eliminatedOptions.includes(index);
                            let optionClass = 'option';
                            if (isEliminated) optionClass += ' eliminated';
                            if (selectedAnswer !== null && revealedCorrectIndex !== null) {
                                if (index === revealedCorrectIndex) optionClass += ' correct';
                                else if (index === selectedAnswer) optionClass += ' incorrect';
                            }

                            const letter = String.fromCharCode(65 + index);
                            const label = toTitleCase(option);
                            const revealed = selectedAnswer !== null && revealedCorrectIndex !== null;

                            return (
                                <motion.button
                                    key={index}
                                    type="button"
                                    className={optionClass}
                                    onClick={() => selectAnswer(index)}
                                    disabled={isLocked || isEliminated}
                                    // Mirrors the shared TriviaAnswerOption contract so the
                                    // hand-rolled markup here exposes the same semantics.
                                    data-trivia-answer
                                    aria-pressed={selectedAnswer === index}
                                    aria-label={isEliminated
                                        ? `Answer ${letter}: ${label} — eliminated by 50/50`
                                        : `Answer ${letter}: ${label}`}
                                    whileHover={!isLocked && !reduceMotion ? { scale: 1.02, borderColor: 'rgba(14, 165, 233, 0.5)' } : {}}
                                    whileTap={!isLocked && !reduceMotion ? { scale: 0.98 } : {}}
                                    animate={
                                        reduceMotion
                                            ? {}
                                            : revealedCorrectIndex !== null && selectedAnswer === index && index !== revealedCorrectIndex
                                                ? { x: [0, -4, 4, -4, 4, 0] }
                                                : selectedAnswer === index && index === revealedCorrectIndex
                                                    ? { scale: [1, 1.05, 1] }
                                                    : {}
                                    }
                                    transition={{ duration: 0.3 }}
                                >
                                    <span className="option-letter" aria-hidden>{letter}</span>
                                    <span className="option-text" aria-hidden={isEliminated || undefined}>
                                        {isEliminated ? '---' : label}
                                    </span>
                                    {revealed && index === revealedCorrectIndex && (
                                        <>
                                            <CheckCircle size={20} className="result-icon correct" aria-hidden />
                                            <span className="sr-only">Correct answer</span>
                                        </>
                                    )}
                                    {revealed && index === selectedAnswer && index !== revealedCorrectIndex && (
                                        <>
                                            <XCircle size={20} className="result-icon incorrect" aria-hidden />
                                            <span className="sr-only">Your answer, incorrect</span>
                                        </>
                                    )}
                                </motion.button>
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
                                // listed as disabled — belt and braces, since paying
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
                                    // missed the skipped slot — array indices were off-by-one
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

                    {/* Explanation — under a serverGrader it arrives with the
                        verdict rather than on the question row. */}
                    {!isArcadeMode && selectedAnswer !== null && currentExplanation && (
                        <div className="explanation-section">
                            <button className="explanation-toggle" onClick={() => setShowExplanation(!showExplanation)}>
                                {showExplanation ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                {showExplanation ? 'Hide Explanation' : 'Show Explanation'}
                            </button>
                            {showExplanation && (
                                <motion.div className="explanation-content"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                >
                                    <p>{currentExplanation}</p>
                                </motion.div>
                            )}
                        </div>
                    )}

                    {/* Next Button */}
                    {!isArcadeMode && selectedAnswer !== null && (
                        <motion.button
                            type="button"
                            className="next-button"
                            onClick={() => advanceQuestion()}
                            whileHover={reduceMotion ? {} : { y: -2 }}
                            whileTap={reduceMotion ? {} : { scale: 0.98 }}
                        >
                            {currentIndex >= questions.length - 1 ? 'See Results' : 'Next Question'}
                            <ChevronRight size={20} />
                        </motion.button>
                    )}
                </motion.div>
            </AnimatePresence>

            {/* ════ Floating Diamonds ════ */}
            <AnimatePresence>
                {floatingDiamonds.map(d => (
                    <motion.div
                        key={d.id}
                        className="floating-diamond"
                        initial={{ opacity: 1, y: 0, x: '-50%' }}
                        animate={{ opacity: 0, y: -80 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1.2 }}
                    >
                        <Gem size={14} /> +{d.value}
                    </motion.div>
                ))}
            </AnimatePresence>

            <style>{`
                .trivia-game {
                    max-width: 700px;
                    margin: 0 auto;
                    padding: 20px;
                    position: relative;
                    transition: background 0.5s ease;
                    background: #18191a;
                }

                /* ═══ FIRE MODE ═══ */
                .trivia-game.fire-mode {
                    background: radial-gradient(ellipse at center bottom, rgba(240, 40, 73, 0.1), #18191a 70%);
                }

                .trivia-game.fire-mode .question-card {
                    border-color: rgba(240, 40, 73, 0.4);
                    box-shadow: 0 0 30px rgba(240, 40, 73, 0.15), inset 0 0 30px rgba(240, 40, 73, 0.05);
                }

                .trivia-game.fire-mode .progress-fill {
                    background: linear-gradient(90deg, #f97316, #f02849) !important;
                }

                /* ═══ SCREEN SHAKE ═══ */
                .trivia-game.screen-shake {
                    animation: screenShake 0.4s ease;
                }
                @keyframes screenShake {
                    0%, 100% { transform: translateX(0); }
                    10% { transform: translateX(-3px) rotate(-0.5deg); }
                    30% { transform: translateX(3px) rotate(0.5deg); }
                    50% { transform: translateX(-2px); }
                    70% { transform: translateX(2px); }
                    90% { transform: translateX(-1px); }
                }

                /* ═══ CORRECT FLASH ═══ */
                .trivia-game.correct-flash .question-card {
                    animation: correctPulse 0.5s ease;
                }
                @keyframes correctPulse {
                    0% { box-shadow: 0 0 0 rgba(49, 162, 76, 0); }
                    50% { box-shadow: 0 0 40px rgba(49, 162, 76, 0.3), inset 0 0 40px rgba(49, 162, 76, 0.1); }
                    100% { box-shadow: 0 0 0 rgba(49, 162, 76, 0); }
                }

                /* ═══ FIRE PARTICLES ═══ */
                .fire-particles {
                    position: absolute;
                    inset: 0;
                    overflow: hidden;
                    pointer-events: none;
                    z-index: 0;
                }
                .ember {
                    position: absolute;
                    bottom: -10px;
                    width: 4px;
                    height: 4px;
                    border-radius: 50%;
                    background: #f97316;
                    box-shadow: 0 0 6px #f97316, 0 0 12px rgba(239, 68, 68, 0.5);
                    animation: emberRise linear infinite;
                    opacity: 0;
                }
                @keyframes emberRise {
                    0% { transform: translateY(0) scale(1); opacity: 0; }
                    10% { opacity: 0.8; }
                    80% { opacity: 0.3; }
                    100% { transform: translateY(-500px) scale(0.3) translateX(30px); opacity: 0; }
                }

                /* ═══ SCREEN-READER ONLY ═══ */
                .sr-only {
                    position: absolute;
                    width: 1px;
                    height: 1px;
                    padding: 0;
                    margin: -1px;
                    overflow: hidden;
                    clip: rect(0 0 0 0);
                    white-space: nowrap;
                    border: 0;
                }

                /* ═══ MUTE TOGGLE ═══ */
                .mute-toggle {
                    position: absolute;
                    top: 8px;
                    right: 8px;
                    z-index: 10;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    /* 44px minimum tap target (was a 28px icon+padding box) */
                    width: 44px;
                    height: 44px;
                    background: rgba(255, 255, 255, 0.08);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 8px;
                    padding: 6px;
                    color: rgba(255, 255, 255, 0.5);
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .mute-toggle:hover {
                    background: rgba(255, 255, 255, 0.15);
                    color: rgba(255, 255, 255, 0.8);
                }

                /* ═══ STAKES BAR ═══ */
                .stakes-bar {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 10px 16px;
                    margin-bottom: 16px;
                    background: linear-gradient(135deg, rgba(35, 116, 225, 0.1), rgba(35, 116, 225, 0.05));
                    border: 1px solid rgba(35, 116, 225, 0.25);
                    border-radius: 12px;
                    transition: all 0.3s;
                }
                .stakes-bar.busted {
                    border-color: rgba(240, 40, 73, 0.5);
                    background: rgba(240, 40, 73, 0.1);
                }
                .stakes-pot {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .stake-gem { color: #2374e1; }
                .stake-value {
                    font-size: 22px;
                    font-weight: 900;
                    color: #2374e1;
                    font-family: 'Rajdhani', monospace;
                }
                .stake-label {
                    font-size: 12px;
                    color: #65676b;
                }
                .multiplier-badge {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 10px;
                    background: rgba(251, 191, 36, 0.15);
                    border: 1px solid rgba(251, 191, 36, 0.3);
                    border-radius: 8px;
                    color: #fbbf24;
                    font-weight: 800;
                    font-size: 14px;
                }
                .cash-out-btn {
                    margin-left: auto;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 8px 16px;
                    background: linear-gradient(135deg, #31a24c, #28883f);
                    border: none;
                    border-radius: 8px;
                    color: #fff;
                    font-weight: 700;
                    font-size: 13px;
                    cursor: pointer;
                    animation: cashPulse 2s ease-in-out infinite;
                    transition: transform 0.2s;
                }
                .cash-out-btn:hover {
                    transform: scale(1.05);
                }
                @keyframes cashPulse {
                    0%, 100% { box-shadow: 0 0 8px rgba(49, 162, 76, 0.4); }
                    50% { box-shadow: 0 0 20px rgba(49, 162, 76, 0.6); }
                }

                /* ═══ COMBO POPUP ═══ */
                .combo-popup {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    z-index: 20;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px 24px;
                    background: linear-gradient(135deg, rgba(249, 115, 22, 0.9), rgba(239, 68, 68, 0.9));
                    border-radius: 16px;
                    color: #fff;
                    font-size: 20px;
                    font-weight: 900;
                    letter-spacing: 1px;
                    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
                    pointer-events: none;
                }
                .combo-flame { animation: flameFlicker 0.3s ease infinite alternate; }
                @keyframes flameFlicker {
                    from { transform: scale(1) rotate(-5deg); }
                    to { transform: scale(1.1) rotate(5deg); }
                }
                .combo-mult {
                    padding: 2px 8px;
                    background: rgba(255, 255, 255, 0.2);
                    border-radius: 6px;
                    font-size: 16px;
                }

                .streak-lost-popup {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    z-index: 20;
                    padding: 14px 28px;
                    background: rgba(239, 68, 68, 0.9);
                    border-radius: 12px;
                    color: #fff;
                    font-size: 22px;
                    font-weight: 900;
                    letter-spacing: 2px;
                    pointer-events: none;
                }

                .bust-popup {
                    position: absolute;
                    top: 45%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    z-index: 25;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 20px 40px;
                    background: linear-gradient(135deg, rgba(0, 0, 0, 0.95), rgba(30, 0, 0, 0.95));
                    border: 2px solid rgba(239, 68, 68, 0.6);
                    border-radius: 16px;
                    color: #ef4444;
                    font-size: 32px;
                    font-weight: 900;
                    letter-spacing: 3px;
                    text-shadow: 0 0 20px rgba(239, 68, 68, 0.5);
                    pointer-events: none;
                    white-space: nowrap;
                }

                /* Cash-out confirmation during the 2s hand-off to the results
                   screen — the board used to just freeze with no feedback. */
                .cashout-popup {
                    position: absolute;
                    top: 45%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    z-index: 26;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 20px 36px;
                    background: linear-gradient(135deg, rgba(0, 0, 0, 0.95), rgba(0, 30, 12, 0.95));
                    border: 2px solid rgba(49, 162, 76, 0.6);
                    border-radius: 16px;
                    color: #31a24c;
                    font-size: 26px;
                    font-weight: 900;
                    letter-spacing: 2px;
                    text-shadow: 0 0 20px rgba(49, 162, 76, 0.45);
                    pointer-events: none;
                    white-space: nowrap;
                }

                /* ═══ FLOATING DIAMONDS ═══ */
                .floating-diamond {
                    position: absolute;
                    left: 50%;
                    bottom: 40%;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    color: #2374e1;
                    font-weight: 800;
                    font-size: 18px;
                    pointer-events: none;
                    z-index: 15;
                    text-shadow: 0 0 10px rgba(35, 116, 225, 0.5);
                }

                /* ═══ HEADER & PROGRESS ═══ */
                .game-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 24px;
                    gap: 20px;
                    position: relative;
                    z-index: 1;
                }

                .progress-info { flex: 1; }
                .question-count {
                    font-size: 13px;
                    color: #65676b;
                    display: block;
                    margin-bottom: 8px;
                }
                .progress-bar {
                    height: 6px;
                    background: #3a3b3c;
                    border-radius: 3px;
                    overflow: hidden;
                }
                .progress-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #2374e1, #1a5cc4);
                    transition: width 0.3s ease;
                }

                /* ═══ CIRCULAR TIMER ═══ */
                .timer-ring-container {
                    position: relative;
                    width: 56px;
                    height: 56px;
                    flex-shrink: 0;
                }
                .timer-ring-container.heartbeat {
                    animation: heartbeat 0.6s ease-in-out infinite;
                }
                @keyframes heartbeat {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.08); }
                }
                .timer-ring {
                    width: 100%;
                    height: 100%;
                    transform: rotate(-90deg);
                }
                .timer-ring-bg {
                    fill: none;
                    stroke: #3a3b3c;
                    stroke-width: 4;
                }
                .timer-ring-fill {
                    fill: none;
                    stroke-width: 4;
                    stroke-linecap: round;
                    transition: stroke-dashoffset 1s linear, stroke 0.5s ease;
                }
                .timer-text {
                    position: absolute;
                    inset: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 16px;
                    font-weight: 800;
                    color: rgba(255, 255, 255, 0.9);
                    font-family: 'Rajdhani', monospace;
                }
                .timer-text.critical {
                    color: #f02849;
                    animation: timerPulse 0.5s ease infinite alternate;
                }
                @keyframes timerPulse {
                    from { opacity: 1; }
                    to { opacity: 0.5; }
                }

                /* ═══ QUESTION CARD ═══ */
                .question-card {
                    background: #242526;
                    border: 1px solid #4e4f50;
                    border-radius: 16px;
                    padding: 32px;
                    position: relative;
                    z-index: 1;
                    perspective: 1000px;
                }

                .question-meta {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 20px;
                }
                .category {
                    font-size: 12px;
                    color: #65676b;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }
                .difficulty {
                    font-size: 11px;
                    font-weight: 700;
                    letter-spacing: 1px;
                    padding: 4px 10px;
                    background: #3a3b3c;
                    border-radius: 4px;
                }
                .question-stake {
                    margin-left: auto;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 13px;
                    font-weight: 700;
                    color: #2374e1;
                }
                .question-text {
                    font-size: 22px;
                    font-weight: 600;
                    color: #ffffff;
                    line-height: 1.4;
                    margin: 0 0 28px 0;
                }

                /* ═══ OPTIONS ═══ */
                .options {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .option {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: 16px 20px;
                    background: #3a3b3c;
                    border: 2px solid #4e4f50;
                    border-radius: 10px;
                    color: rgba(255, 255, 255, 0.9);
                    font-size: 16px;
                    text-align: left;
                    cursor: pointer;
                    transition: all 0.15s ease;
                }
                .option:hover:not(:disabled) {
                    background: #4e4f50;
                    border-color: rgba(35, 116, 225, 0.5);
                    box-shadow: 0 0 15px rgba(35, 116, 225, 0.1);
                }
                .option:disabled { cursor: default; }
                .option.correct {
                    background: rgba(49, 162, 76, 0.15);
                    border-color: #31a24c;
                    box-shadow: 0 0 20px rgba(49, 162, 76, 0.2);
                }
                .option.incorrect {
                    background: rgba(240, 40, 73, 0.15);
                    border-color: #f02849;
                }
                .option-letter {
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: #4e4f50;
                    border-radius: 6px;
                    font-weight: 700;
                    font-size: 14px;
                    flex-shrink: 0;
                }
                .option-text { flex: 1; }
                .result-icon { flex-shrink: 0; }
                .result-icon.correct { color: #31a24c; }
                .result-icon.incorrect { color: #f02849; }

                .option.eliminated {
                    opacity: 0.4;
                    background: rgba(255, 255, 255, 0.02);
                    border-color: rgba(255, 255, 255, 0.05);
                    cursor: not-allowed;
                }
                .option.eliminated .option-text {
                    text-decoration: line-through;
                }

                /* ═══ HINTS, EXPLANATION, NEXT ═══ */
                .hints-section {
                    margin-top: 20px;
                    padding-top: 16px;
                    border-top: 1px solid #4e4f50;
                }
                .explanation-section {
                    margin-top: 24px;
                    padding-top: 24px;
                    border-top: 1px solid #4e4f50;
                }
                .explanation-toggle {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    background: none;
                    border: none;
                    color: #65676b;
                    font-size: 14px;
                    cursor: pointer;
                    padding: 0;
                    transition: color 0.2s;
                }
                .explanation-toggle:hover { color: rgba(255, 255, 255, 0.9); }
                .explanation-content {
                    margin-top: 16px;
                    padding: 16px;
                    background: #18191a;
                    border-radius: 8px;
                    overflow: hidden;
                }
                .explanation-content p {
                    margin: 0;
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.7);
                    line-height: 1.6;
                }
                .next-button {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    width: 100%;
                    margin-top: 24px;
                    padding: 16px 24px;
                    background: linear-gradient(135deg, #2374e1, #1a5cc4);
                    border: none;
                    border-radius: 10px;
                    color: #ffffff;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .next-button:hover {
                    box-shadow: 0 4px 20px rgba(35, 116, 225, 0.4);
                }

                /* ═══ FOCUS VISIBILITY (keyboard play) ═══ */
                .option:focus-visible,
                .next-button:focus-visible,
                .cash-out-btn:focus-visible,
                .mute-toggle:focus-visible,
                .explanation-toggle:focus-visible {
                    outline: 2px solid #00D4FF;
                    outline-offset: 2px;
                }

                /* ═══ REDUCED MOTION ═══
                   Screen shake, heartbeat, ember rise and the timer pulse are
                   exactly the effects prefers-reduced-motion exists to stop. */
                @media (prefers-reduced-motion: reduce) {
                    .trivia-game.screen-shake,
                    .trivia-game.correct-flash .question-card,
                    .timer-ring-container.heartbeat,
                    .timer-text.critical,
                    .combo-flame,
                    .cash-out-btn,
                    .ember {
                        animation: none !important;
                    }
                    .ember { display: none; }
                    .timer-ring-fill,
                    .progress-fill {
                        transition: none !important;
                    }
                }

                /* ═══ MOBILE ═══ (component previously shipped zero responsive rules) */
                @media (max-width: 480px) {
                    .trivia-game { padding: 12px; }
                    .question-card { padding: 20px; border-radius: 12px; }
                    .question-text { font-size: 18px; margin-bottom: 20px; }
                    .option {
                        padding: 14px 16px;
                        gap: 12px;
                        font-size: 15px;
                        min-height: 48px;
                    }
                    .option-letter { width: 28px; height: 28px; font-size: 13px; }
                    .game-header { gap: 12px; margin-bottom: 16px; }
                    .timer-ring-container { width: 48px; height: 48px; }
                    .bust-popup { font-size: 24px; padding: 16px 24px; letter-spacing: 2px; }
                    .cashout-popup { font-size: 20px; padding: 16px 22px; }
                    .combo-popup { font-size: 17px; padding: 10px 18px; }
                    .next-button { padding: 16px 20px; }
                }
            `}</style>
        </div>
    );
}

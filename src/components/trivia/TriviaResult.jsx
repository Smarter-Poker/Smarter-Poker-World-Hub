/**
 * TRIVIA RESULT - Results screen with addictive game mechanics
 * 
 * Features:
 * - Animated SVG grade ring (draws itself)
 * - Ghost opponent comparison panel
 * - Diamond count-up animation (slot machine style)
 * - "FLAWLESS VICTORY" slam text on perfect scores
 * - Stakes cashout summary
 */

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { formatTriviaDisplayNumber } from '../../lib/trivia/formatTriviaDisplayNumber';
// confetti loaded lazily on first use
let _confetti = null;
async function fireConfetti(opts) {
    try {
        if (!_confetti) { const m = await import('canvas-confetti'); _confetti = m.default || m; }
        _confetti(opts);
    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
}
import * as audio from '../../lib/trivia/triviaAudio';

/** Linear blend between two #rrggbb colours. t=0 -> a, t=1 -> b. */
function mixHex(a, b, t) {
    const parse = (hex) => {
        const h = String(hex || '').replace('#', '');
        if (h.length !== 6) return null;
        const n = parseInt(h, 16);
        if (Number.isNaN(n)) return null;
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const ca = parse(a);
    const cb = parse(b);
    if (!ca || !cb) return b;
    const k = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 1));
    const c = ca.map((v, i) => Math.round(v + (cb[i] - v) * k));
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export default function TriviaResult({
    mode,
    correctCount,
    totalQuestions,
    timeSpent,
    timeRemaining,
    xpEarned, // legacy prop - ignored, kept for backward compat
    diamondsEarned,
    streak,
    streakMultiplier = 1,
    isPerfect: isPerfectProp,
    showSpinButton = false,
    showDoubleButton = false,
    onPlayAgain,
    onSpinWheel,
    onDoubleOrNothing,
    onGoHome,
    // ══ NEW PROPS ══
    opponentScore = null,   // Ghost opponent final score
    opponentName = null,    // Ghost opponent name
    stakePot = 0,           // Total diamonds from stakes
    cashedOut = false,       // Whether player cashed out
    // ══ REVIEW MODE PROPS ══
    questions = null,        // Array of question objects for review
    answers = null,          // Array of user answer indices
    // ══ REWARD-TRANSPARENCY PROPS (all optional) ══
    rawDiamonds = null,        // pre-daily-cap award, when the page computed one
    capReached = false,        // true when the daily cap clipped the award
    timeBonusAwarded = null,   // arcade time bonus actually included in the award
    dailyBonusDiamonds = 0,    // daily-completion bonus
    showDailyBonusRow = false, // opt-in: pages that render their own callout leave this false
    personalBest = null,       // best score for this mode, for a comparison line
    beatPersonalBest = false,
}) {
    // Guard: totalQuestions of 0 (or a missing prop) produced NaN% in the ring
    // and grade 'F'. Display components in this repo must degrade gracefully.
    const safeTotal = Number.isFinite(totalQuestions) && totalQuestions > 0 ? totalQuestions : 0;
    const safeCorrect = Number.isFinite(correctCount) && correctCount > 0 ? correctCount : 0;
    const accuracy = safeTotal > 0 ? Math.round((safeCorrect / safeTotal) * 100) : 0;
    const isPerfect = safeTotal > 0 && (isPerfectProp || safeCorrect === safeTotal);
    const isArcade = mode === 'arcade';
    const hasMultiplier = streakMultiplier > 1;
    const hasOpponent = opponentScore !== null;
    const playerWon = hasOpponent ? safeCorrect > opponentScore : true;
    const tied = hasOpponent && safeCorrect === opponentScore;

    // Skipped questions (sentinels: -1 skip hint, -2 skip lifeline) are neither
    // right nor wrong - surface the count instead of hiding it inside "wrong".
    const skippedCount = Array.isArray(answers)
        ? answers.filter(a => a === -1 || a === -2).length
        : 0;

    // Review mode state
    const [showReview, setShowReview] = useState(false);
    const canReview = questions && answers && questions.length > 0;

    // Share state
    const [shareLabel, setShareLabel] = useState('Share Result');
    // Phase 75: the reset timeout was a raw setTimeout - navigating away within
    // 2s of copying fired setState on an unmounted component.
    const shareTimerRef = useRef(null);
    useEffect(() => () => {
        if (shareTimerRef.current) clearTimeout(shareTimerRef.current);
    }, []);

    const handleShare = async () => {
        const text = `Poker Trivia ${grade.letter} Grade! ${safeCorrect}/${safeTotal} correct (${accuracy}%)${diamondsEarned > 0 ? ` - earned ${diamondsEarned} diamonds` : ''}${streak > 0 ? ` - ${streak} day streak` : ''} on smarter.poker`;
        if (typeof navigator !== 'undefined' && navigator.share) {
            try {
                await navigator.share({ title: 'Smarter.Poker Trivia', text, url: 'https://smarter.poker/hub/trivia' });
            } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
            try {
                await navigator.clipboard.writeText(text);
                setShareLabel('Copied!');
                if (shareTimerRef.current) clearTimeout(shareTimerRef.current);
                shareTimerRef.current = setTimeout(() => {
                    shareTimerRef.current = null;
                    setShareLabel('Share Result');
                }, 2000);
            } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        }
    };

    // ══ Animated count-up ══
    const [displayDiamonds, setDisplayDiamonds] = useState(0);
    const [displayAccuracy, setDisplayAccuracy] = useState(0);
    const [showFlawless, setShowFlawless] = useState(false);
    const [ringProgress, setRingProgress] = useState(0);
    const countUpDone = useRef(false);

    useEffect(() => {
        // Confetti. disableForReducedMotion matches TriviaGame - a full-screen
        // particle burst is exactly what "reduce motion" is asking us not to do.
        if (accuracy >= 70) {
            fireConfetti({
                particleCount: isPerfect ? 200 : 80,
                spread: 70,
                origin: { y: 0.6 },
                colors: isPerfect ? ['#fbbf24', '#f59e0b', '#f02849', '#31a24c'] : undefined,
                disableForReducedMotion: true,
            });
        }
        // Phase 69: track FLAWLESS-banner setTimeout so it gets cleared on
        // unmount. Was firing setShowFlawless(true) on an unmounted
        // component when the user navigated away within 800ms of seeing
        // a perfect score.
        let flawlessTimer = null;
        if (isPerfect) {
            audio.victoryFanfare();
            // A short haptic triple-tap on the emotional peak. Guarded: iOS
            // Safari has no navigator.vibrate, hence the optional call.
            try { navigator.vibrate?.([30, 50, 30]); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
            flawlessTimer = setTimeout(() => {
                setShowFlawless(true);
                fireConfetti({ particleCount: 100, spread: 100, origin: { y: 0.4 }, disableForReducedMotion: true });
            }, 800);
        }
        return () => {
            if (flawlessTimer) clearTimeout(flawlessTimer);
        };
    }, []);

    // Animate ring + numbers.
    // Phase 75: was two 16ms setIntervals. On a 120Hz screen that samples out
    // of phase with the compositor (visible stepping), and it keeps ticking in
    // a background tab. requestAnimationFrame is frame-locked and free.
    useEffect(() => {
        if (countUpDone.current) return;
        countUpDone.current = true;

        const totalDiamonds = stakePot || diamondsEarned || 0;
        const prefersReduced = typeof window !== 'undefined'
            && typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (prefersReduced) {
            // Land on the final values immediately - no animation, no jank.
            setRingProgress(accuracy);
            setDisplayAccuracy(accuracy);
            setDisplayDiamonds(totalDiamonds);
            return undefined;
        }

        let cancelled = false;
        const frames = [];
        const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

        const animate = ({ duration, delay = 0, onFrame, onDone }) => {
            const start = Date.now() + delay;
            const step = () => {
                if (cancelled) return;
                const elapsed = Date.now() - start;
                if (elapsed < 0) { frames.push(requestAnimationFrame(step)); return; }
                const progress = Math.min(elapsed / duration, 1);
                onFrame(easeOutCubic(progress), progress);
                if (progress < 1) frames.push(requestAnimationFrame(step));
                else onDone?.();
            };
            frames.push(requestAnimationFrame(step));
        };

        // Ring + accuracy (0 -> accuracy over 1.5s)
        animate({
            duration: 1500,
            onFrame: (eased) => {
                setRingProgress(eased * accuracy);
                setDisplayAccuracy(Math.round(eased * accuracy));
            },
        });

        // Diamond count-up, starting 500ms in so the ring reads first.
        if (totalDiamonds > 0) {
            animate({
                duration: 1000,
                delay: 500,
                onFrame: (eased) => setDisplayDiamonds(Math.round(eased * totalDiamonds)),
                onDone: () => {
                    setDisplayDiamonds(totalDiamonds);
                    audio.cashOutKaChing();
                },
            });
        }

        return () => {
            cancelled = true;
            for (const id of frames) cancelAnimationFrame(id);
        };
    }, []);

    const getGrade = () => {
        if (accuracy >= 100) return { letter: 'S', color: '#fbbf24', label: 'Perfect!' };
        if (accuracy >= 90) return { letter: 'A', color: '#31a24c', label: 'Excellent!' };
        if (accuracy >= 80) return { letter: 'B', color: '#45adff', label: 'Great Job!' };
        if (accuracy >= 70) return { letter: 'C', color: '#e4e7ec', label: 'Good Work!' };
        if (accuracy >= 60) return { letter: 'D', color: '#9aa5b3', label: 'Keep Trying!' };
        return { letter: 'F', color: '#f02849', label: 'Study Up!' };
    };

    const grade = getGrade();
    const circumference = 2 * Math.PI * 58;
    const ringOffset = circumference * (1 - ringProgress / 100);

    // The ring fades from neutral grey into the grade colour as it fills, so
    // the colour reveal lands with the number instead of being spoiled at 0%.
    const ringColor = mixHex('#3a3b3c', grade.color, Math.min(1, ringProgress / Math.max(accuracy, 1)));

    // ══ Reward breakdown ══
    // The arcade time bonus used to be rendered from a formula the award path
    // does not always use: in stakes mode the award is the stake pot with NO
    // time bonus, and below 50% accuracy calculateDiamonds() returns 0. Only
    // show a bonus the player actually received.
    const ARCADE_MAX_TIME_BONUS = 10; // mirrors triviaEngine.calculateDiamonds
    const inferredTimeBonus = (isArcade && stakePot <= 0 && !cashedOut && accuracy >= 50 && timeRemaining > 0)
        ? Math.min(ARCADE_MAX_TIME_BONUS, Math.floor(timeRemaining / 6))
        : 0;
    const shownTimeBonus = Number.isFinite(timeBonusAwarded)
        ? Math.max(0, timeBonusAwarded)
        : (capReached ? 0 : inferredTimeBonus);

    const breakdownRows = [];
    if (stakePot > 0) {
        breakdownRows.push({ key: 'stake', label: cashedOut ? 'Cashed-Out Pot' : 'Stake Pot', value: `+${formatTriviaDisplayNumber(stakePot)}`, isDiamond: true });
    } else if (diamondsEarned > 0) {
        breakdownRows.push({ key: 'base', label: 'Quiz Reward', value: `+${formatTriviaDisplayNumber(diamondsEarned)}`, isDiamond: true });
    }
    if (hasMultiplier) {
        breakdownRows.push({ key: 'mult', label: 'Streak Multiplier', value: `${streakMultiplier}x` });
    }
    if (shownTimeBonus > 0) {
        breakdownRows.push({ key: 'time', label: `Time Bonus (${timeRemaining}s Left)`, value: `+${formatTriviaDisplayNumber(shownTimeBonus)}`, isDiamond: true });
    }
    if (showDailyBonusRow && dailyBonusDiamonds > 0) {
        breakdownRows.push({ key: 'daily', label: 'Daily Completion Bonus', value: `+${formatTriviaDisplayNumber(dailyBonusDiamonds)}`, isDiamond: true });
    }
    if (capReached && Number.isFinite(rawDiamonds)) {
        breakdownRows.push({
            key: 'cap',
            label: 'Daily Cap Reached',
            value: `${formatTriviaDisplayNumber(diamondsEarned)} Of ${formatTriviaDisplayNumber(rawDiamonds)}`,
            muted: true,
        });
    }

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    };

    return (
        <div className="trivia-result">
            {/* ════ FLAWLESS VICTORY Slam ════ */}
            <AnimatePresence>
                {showFlawless && (
                    <motion.div
                        className="flawless-banner"
                        initial={{ opacity: 0, scale: 3, y: -50 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                    >
                        <span>Flawless Victory</span>
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.div
                className="result-card"
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.4, type: 'spring' }}
            >
                {/* Header */}
                <div className="result-header">
                    <h2>{cashedOut ? 'Cashed Out!' : isArcade ? 'Arcade Complete!' : 'Quiz Complete!'}</h2>
                    <p className="grade-label">{grade.label}</p>
                </div>

                {/* ════ Animated Grade Ring ════ */}
                <div className="grade-ring-container">
                    <svg viewBox="0 0 130 130" className="grade-ring-svg">
                        <circle cx="65" cy="65" r="58" className="ring-bg" />
                        <circle
                            cx="65" cy="65" r="58"
                            className="ring-fill"
                            style={{
                                strokeDasharray: circumference,
                                strokeDashoffset: ringOffset,
                                stroke: ringColor,
                            }}
                        />
                    </svg>
                    <div className="grade-inner">
                        <motion.span
                            className="grade-letter"
                            style={{ color: grade.color }}
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 1.2, type: 'spring', stiffness: 400 }}
                        >
                            {grade.letter}
                        </motion.span>
                        <span className="grade-percent">{displayAccuracy}%</span>
                    </div>
                </div>

                {/* ════ Ghost Opponent Comparison ════ */}
                {hasOpponent && (
                    <motion.div
                        className={`opponent-result ${playerWon ? 'won' : tied ? 'tied' : 'lost'}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                    >
                        <div className="opp-side you">
                            <span className="opp-label">You</span>
                            <span className="opp-score">{correctCount}</span>
                        </div>
                        <div className="opp-vs">
                            {playerWon ? (
                                <span className="win-badge">Win!</span>
                            ) : tied ? (
                                <span className="tie-badge">Tie</span>
                            ) : (
                                <span className="loss-badge">Loss</span>
                            )}
                        </div>
                        <div className="opp-side them">
                            <span className="opp-score">{opponentScore}</span>
                            <span className="opp-label">{opponentName || 'Opponent'}</span>
                        </div>
                    </motion.div>
                )}

                {/* Stats Grid - 80ms stagger so the tiles land one after another */}
                <div className="stats-grid">
                    {[
                        {
                            key: 'correct',
                            className: 'stat-item',
                            value: `${safeCorrect}/${safeTotal}`,
                            label: 'Correct',
                        },
                        {
                            key: 'time',
                            className: 'stat-item',
                            value: formatTime(timeSpent),
                            label: 'Time',
                        },
                        ...(stakePot > 0 || diamondsEarned > 0 ? [{
                            key: 'diamonds',
                            className: 'stat-item highlight diamond-stat',
                            value: `+${formatTriviaDisplayNumber(displayDiamonds)}`,
                            valueClass: 'stat-value diamond-value',
                            label: cashedOut ? 'Cashed Out' : 'Diamonds',
                        }] : []),
                        ...(hasMultiplier ? [{
                            key: 'mult',
                            className: 'stat-item multiplier',
                            value: `${streakMultiplier}x`,
                            label: 'Streak Bonus',
                        }] : []),
                        ...(skippedCount > 0 ? [{
                            key: 'skipped',
                            className: 'stat-item skipped-stat',
                            value: `${skippedCount}`,
                            label: 'Skipped',
                        }] : []),
                    ].map((stat, i) => (
                        <motion.div
                            key={stat.key}
                            className={stat.className}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.15 + i * 0.08, duration: 0.3 }}
                        >
                            <div className={stat.valueClass || 'stat-value'}>{stat.value}</div>
                            <div className="stat-label">{stat.label}</div>
                        </motion.div>
                    ))}
                </div>

                {/* Personal best comparison - data the pages already track */}
                {Number.isFinite(personalBest) && (
                    <div className={`personal-best-line ${beatPersonalBest ? 'is-new' : ''}`}>
                        {beatPersonalBest ? 'New Personal Best!' : `Your Best: ${personalBest}`}
                    </div>
                )}

                {/* Reward breakdown - one row per component of the award, so a
                    single count-up can never silently drop the rest. */}
                {breakdownRows.length > 0 && (
                    <div className="reward-breakdown">
                        {breakdownRows.map((row, i) => (
                            <motion.div
                                key={row.key}
                                className={`breakdown-row ${row.muted ? 'muted' : ''}`}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.4 + i * 0.08, duration: 0.25 }}
                            >
                                <span className="breakdown-label">{row.label}</span>
                                <span className="breakdown-value">
                                    {row.value}{row.isDiamond ? ' Diamonds' : ''}
                                </span>
                            </motion.div>
                        ))}
                    </div>
                )}

                {/* Streak Info */}
                {streak > 0 && !isArcade && (
                    <div className="streak-info">
                        <span>{streak} Day Streak!</span>
                    </div>
                )}

                {/* Arcade Time Bonus - rendered only when the award really
                    contained one (see shownTimeBonus above). */}
                {isArcade && shownTimeBonus > 0 && (
                    <div className="time-bonus">
                        <span>+{shownTimeBonus} Bonus Diamonds For {timeRemaining}s Remaining!</span>
                    </div>
                )}

                {/* Action Buttons */}
                {/* ════ Question Review Section ════ */}
                {canReview && (
                    <div className="review-section">
                        <button type="button" className="review-toggle" onClick={() => setShowReview(!showReview)}>
                            <span>{showReview ? 'Hide Answers' : 'Review Answers'}</span>
                        </button>
                        <AnimatePresence>
                            {showReview && (
                                <motion.div
                                    className="review-list"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.3 }}
                                >
                                    {questions.map((q, idx) => {
                                        const userAnswer = answers[idx];
                                        // Phase 69: was treating skipped questions (sentinels -1
                                        // for skip-hint and -2 for skip-lifeline) as plain
                                        // 'incorrect' in the review screen. Now renders them
                                        // as a distinct 'skipped' state with a neutral icon.
                                        const wasSkipped = userAnswer === -1 || userAnswer === -2 || userAnswer === undefined;
                                        const isCorrect = !wasSkipped && userAnswer === q.correct_index;
                                        const reviewClass = wasSkipped ? 'skipped' : (isCorrect ? 'correct' : 'incorrect');
                                        return (
                                            <div key={idx} className={`review-item ${reviewClass}`}>
                                                <div className="review-q-header">
                                                    <span className="review-q-num">Q{idx + 1}{wasSkipped ? ' · Skipped' : ''}</span>
                                                    <span className={`review-status ${reviewClass}`}>
                                                        {wasSkipped ? 'Skipped' : isCorrect ? 'Correct' : 'Incorrect'}
                                                    </span>
                                                </div>
                                                <p className="review-question">{q.question}</p>
                                                <div className="review-options">
                                                    {q.options.map((opt, oi) => (
                                                        <div
                                                            key={oi}
                                                            className={`review-option ${oi === q.correct_index ? 'is-correct' : ''} ${oi === userAnswer && oi !== q.correct_index ? 'is-wrong' : ''}`}
                                                        >
                                                            <span className="review-opt-letter">{String.fromCharCode(65 + oi)}</span>
                                                            <span>{opt}</span>
                                                            {oi === q.correct_index && <span className="review-option-status">Correct</span>}
                                                            {oi === userAnswer && oi !== q.correct_index && <span className="review-option-status">Selected</span>}
                                                        </div>
                                                    ))}
                                                </div>
                                                {q.explanation && (
                                                    <p className="review-explanation">{q.explanation}</p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}

                <div className="result-actions">
                    <Link href="/hub/trivia" className="result-action result-action--secondary">
                        Back To Trivia
                    </Link>
                    <button type="button" className="result-action result-action--share" onClick={handleShare}>
                        {shareLabel}
                    </button>
                    {!isArcade && mode !== 'daily' && (
                        <button type="button" className="result-action result-action--primary" onClick={onPlayAgain}>
                            Play Again
                        </button>
                    )}
                    {isArcade && (
                        <button type="button" className="result-action result-action--primary" onClick={onPlayAgain}>
                            Play Again (10 Diamonds)
                        </button>
                    )}

                    {showSpinButton && onSpinWheel && (
                        <button type="button" className="result-action result-action--spin-wheel" onClick={onSpinWheel}>
                            Spin Prize Wheel!
                        </button>
                    )}

                    {showDoubleButton && onDoubleOrNothing && (
                        <button type="button" className="result-action result-action--double" onClick={onDoubleOrNothing}>
                            Double Or Nothing ({formatTriviaDisplayNumber(diamondsEarned)} To {formatTriviaDisplayNumber(diamondsEarned * 2)} Diamonds)
                        </button>
                    )}
                </div>
            </motion.div>

            <style>{`
                .trivia-result {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    width: 100%;
                    min-width: 0;
                    padding: 0;
                    position: relative;
                    color: #e4e7ec;
                    font-family: Inter, system-ui, sans-serif;
                }

                /* ═══ FLAWLESS VICTORY ═══ */
                .trivia-result .flawless-banner {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 20px;
                    width: 100%;
                    padding: 14px 0;
                    border-top: 1px solid #ffd700;
                    border-bottom: 1px solid #ffd700;
                    color: #fbbf24;
                    font-size: 24px;
                    font-weight: 900;
                    letter-spacing: 3px;
                    justify-content: center;
                }

                .trivia-result .result-card {
                    padding: 0;
                    text-align: center;
                    max-width: 640px;
                    width: 100%;
                    background: transparent;
                }

                .trivia-result .result-header { margin-bottom: 24px; }
                .trivia-result .result-header h2 {
                    font-size: 28px;
                    font-weight: 800;
                    color: #f4f7fb;
                    margin: 0 0 8px 0;
                    font-family: 'Roboto Condensed', Inter, system-ui, sans-serif;
                    letter-spacing: 0.04em;
                    text-transform: uppercase;
                }
                .trivia-result .grade-label {
                    font-size: 16px;
                    color: #9aa5b3;
                    margin: 0;
                }

                /* ═══ ANIMATED GRADE RING ═══ */
                .trivia-result .grade-ring-container {
                    position: relative;
                    width: 140px;
                    height: 140px;
                    margin: 0 auto 28px;
                }
                .trivia-result .grade-ring-svg {
                    width: 100%;
                    height: 100%;
                    transform: rotate(-90deg);
                }
                .trivia-result .ring-bg {
                    fill: none;
                    stroke: #657180;
                    stroke-width: 6;
                }
                .trivia-result .ring-fill {
                    fill: none;
                    stroke-width: 6;
                    stroke-linecap: round;
                    transition: stroke-dashoffset 0.05s linear;
                }
                .trivia-result .grade-inner {
                    position: absolute;
                    inset: 0;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                }
                .trivia-result .grade-letter {
                    font-size: 48px;
                    font-weight: 900;
                    line-height: 1;
                }
                .trivia-result .grade-percent {
                    font-size: 16px;
                    color: #9aa5b3;
                    margin-top: 4px;
                    font-family: 'Roboto Condensed', Inter, system-ui, sans-serif;
                }

                /* ═══ OPPONENT COMPARISON ═══ */
                .trivia-result .opponent-result {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 16px;
                    margin-bottom: 24px;
                    padding: 14px 0;
                    border-top: 1px solid #050607;
                    border-bottom: 1px solid #050607;
                    background: transparent;
                }
                .trivia-result .opponent-result.won { border-bottom-color: #35d95a; }
                .trivia-result .opponent-result.lost { border-bottom-color: #f02849; }
                .trivia-result .opponent-result.tied { border-bottom-color: #ffd700; }
                .trivia-result .opp-side {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .trivia-result .opp-side.you { justify-content: flex-end; }
                .trivia-result .opp-side.them { justify-content: flex-start; }
                .trivia-result .opp-label {
                    font-size: 12px;
                    color: #9aa5b3;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }
                .trivia-result .opp-score {
                    font-size: 28px;
                    font-weight: 900;
                    color: #f4f7fb;
                    font-family: 'Roboto Condensed', Inter, system-ui, sans-serif;
                }
                .trivia-result .opp-vs { text-align: center; }
                .trivia-result .win-badge {
                    color: #c8ffd2;
                    font-weight: 800;
                    font-size: 14px;
                }
                .trivia-result .tie-badge {
                    color: #fbbf24;
                    font-weight: 800;
                    font-size: 14px;
                }
                .trivia-result .loss-badge {
                    color: #ff5b6e;
                    font-weight: 800;
                    font-size: 14px;
                }

                /* ═══ STATS ═══ */
                .trivia-result .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 0 22px;
                    margin-bottom: 24px;
                }
                .trivia-result .stat-item {
                    min-width: 0;
                    padding: 14px 0;
                    border-top: 1px solid #050607;
                    border-bottom: 1px solid #050607;
                    background: transparent;
                }
                .trivia-result .stat-item.highlight {
                    border-bottom-color: #45adff;
                }
                .trivia-result .stat-item.multiplier {
                    border-bottom-color: #ffd700;
                }
                .trivia-result .diamond-stat {
                    border-bottom-color: #45adff !important;
                }
                .trivia-result .diamond-value {
                    color: #45adff !important;
                }
                .trivia-result .stat-item.skipped-stat {
                    border-bottom-color: #ffd700;
                }
                .trivia-result .stat-value {
                    font-size: 24px;
                    font-weight: 700;
                    color: #f4f7fb;
                    margin-bottom: 4px;
                }
                .trivia-result .stat-label {
                    font-size: 12px;
                    color: #9aa5b3;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }

                .trivia-result .streak-info {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 0;
                    border-top: 1px solid #ffd700;
                    border-bottom: 1px solid #ffd700;
                    color: #ffd700;
                    font-weight: 700;
                    margin-bottom: 24px;
                }

                /* ═══ PERSONAL BEST + REWARD BREAKDOWN ═══ */
                .trivia-result .personal-best-line {
                    font-size: 13px;
                    color: #9aa5b3;
                    margin: -8px 0 16px;
                    letter-spacing: 0.5px;
                }
                .trivia-result .personal-best-line.is-new {
                    color: #fbbf24;
                    font-weight: 700;
                }
                .trivia-result .reward-breakdown {
                    display: flex;
                    flex-direction: column;
                    gap: 0;
                    margin-bottom: 20px;
                    padding: 0;
                    text-align: left;
                    background: transparent;
                }
                .trivia-result .breakdown-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    min-height: 44px;
                    padding: 8px 0;
                    border-bottom: 1px solid #050607;
                    font-size: 13px;
                    color: #c8cdd5;
                }
                .trivia-result .breakdown-row.muted {
                    color: #9aa5b3;
                }
                .trivia-result .breakdown-label {
                    min-width: 0;
                    letter-spacing: 0.3px;
                    text-align: left;
                }
                .trivia-result .breakdown-value {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    margin-left: auto;
                    padding-left: 12px;
                    font-weight: 700;
                    color: #45adff;
                    text-align: right;
                    white-space: nowrap;
                }
                .trivia-result .breakdown-row.muted .breakdown-value {
                    color: #9aa5b3;
                }

                .trivia-result .time-bonus {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 0;
                    border-top: 1px solid #45adff;
                    border-bottom: 1px solid #45adff;
                    color: #45adff;
                    background: transparent;
                    font-size: 14px;
                    margin-bottom: 24px;
                }

                /* ═══ ACTIONS ═══ */
                .trivia-result .result-actions {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 12px;
                    margin-top: 8px;
                }
                .trivia-result .result-action {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    min-width: 140px;
                    min-height: 48px;
                    padding: 12px 8px;
                    border: 0;
                    border-top: 1px solid #050607;
                    border-bottom: 1px solid #050607;
                    color: #e4e7ec;
                    background: transparent;
                    font-family: 'Roboto Condensed', Inter, system-ui, sans-serif;
                    font-size: 14px;
                    font-weight: 800;
                    letter-spacing: 0.04em;
                    text-transform: uppercase;
                    cursor: pointer;
                    text-decoration: none;
                    touch-action: manipulation;
                }
                .trivia-result .result-action:focus-visible,
                .trivia-result .review-toggle:focus-visible {
                    outline: 2px solid #00D4FF;
                    outline-offset: 2px;
                }
                @media (prefers-reduced-motion: reduce) {
                    .trivia-result .flawless-banner,
                    .trivia-result .result-action--spin-wheel,
                    .trivia-result .result-action--double {
                        animation: none !important;
                    }
                }
                .trivia-result .result-action--secondary {
                    color: #9aa5b3;
                }
                .trivia-result .result-action--primary {
                    border-bottom-color: #45adff;
                    color: #45adff;
                }
                .trivia-result .result-action--spin-wheel {
                    border-bottom-color: #ffd700;
                    color: #ffd700;
                }
                .trivia-result .result-action--double {
                    border-bottom-color: #f02849;
                    color: #ff5b6e;
                }
                .trivia-result .result-action--share {
                    color: #e4e7ec;
                }
                .trivia-result .result-action:active {
                    color: #f4f7fb;
                }
                /* ═══ REVIEW MODE ═══ */
                .trivia-result .review-section {
                    width: 100%;
                    margin-top: 16px;
                    margin-bottom: 16px;
                }
                .trivia-result .review-toggle {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    width: 100%;
                    min-height: 48px;
                    padding: 12px 8px;
                    border: 0;
                    border-top: 1px solid #45adff;
                    border-bottom: 1px solid #45adff;
                    color: #45adff;
                    background: transparent;
                    font-weight: 800;
                    font-size: 14px;
                    letter-spacing: 0.04em;
                    text-transform: uppercase;
                    cursor: pointer;
                    touch-action: manipulation;
                }
                .trivia-result .review-toggle:active {
                    color: #f4f7fb;
                }
                .trivia-result .review-list {
                    overflow: hidden;
                    margin-top: 12px;
                }
                .trivia-result .review-item {
                    padding: 16px 0 16px 14px;
                    border-inline-start: 3px solid #9aa5b3;
                    border-bottom: 1px solid #050607;
                    background: transparent;
                }
                .trivia-result .review-item.correct {
                    border-left: 3px solid #31a24c;
                }
                .trivia-result .review-item.incorrect {
                    border-left: 3px solid #f02849;
                }
                /* Phase 75: the skipped state was assigned but never styled,
                   so skipped questions rendered with no accent at all. */
                .trivia-result .review-item.skipped {
                    border-left: 3px solid #fbbf24;
                }
                .trivia-result .review-item.skipped .review-q-num {
                    color: #fbbf24;
                }
                .trivia-result .review-q-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 8px;
                }
                .trivia-result .review-q-num {
                    font-weight: 700;
                    font-size: 12px;
                    color: #65676b;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                .trivia-result .review-icon.correct { color: #31a24c; }
                .trivia-result .review-icon.incorrect { color: #f02849; }
                .trivia-result .review-status,
                .trivia-result .review-option-status {
                    flex-shrink: 0;
                    font-size: 12px;
                    font-weight: 800;
                    letter-spacing: 0.04em;
                    text-transform: uppercase;
                }
                .trivia-result .review-status.correct { color: #c8ffd2; }
                .trivia-result .review-status.incorrect { color: #ff5b6e; }
                .trivia-result .review-status.skipped { color: #ffd700; }
                .trivia-result .review-question {
                    color: #e4e6eb;
                    font-size: 14px;
                    line-height: 1.5;
                    margin: 0 0 10px;
                }
                .trivia-result .review-options {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .trivia-result .review-option {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    min-height: 44px;
                    padding: 8px 0;
                    border-bottom: 1px solid #050607;
                    font-size: 13px;
                    color: #9aa5b3;
                    background: transparent;
                }
                .trivia-result .review-option.is-correct {
                    border-bottom-color: #35d95a;
                    color: #c8ffd2;
                    font-weight: 600;
                }
                .trivia-result .review-option.is-wrong {
                    border-bottom-color: #f02849;
                    color: #ff5b6e;
                }
                .trivia-result .review-opt-letter {
                    font-weight: 700;
                    opacity: 0.5;
                    min-width: 16px;
                }
                .trivia-result .review-explanation {
                    margin: 10px 0 0;
                    padding: 10px 0 10px 12px;
                    background: transparent;
                    color: #c8cdd5;
                    font-size: 13px;
                    line-height: 1.5;
                    border-left: 2px solid #45adff;
                }

                @media (max-width: 480px) {
                    .trivia-result .flawless-banner {
                        font-size: 18px;
                        letter-spacing: 0.12em;
                    }

                    .trivia-result .stats-grid {
                        grid-template-columns: 1fr 1fr;
                        gap: 0 12px;
                    }

                    .trivia-result .opponent-result {
                        gap: 10px;
                    }

                    .trivia-result .opp-side {
                        align-items: center;
                        flex-direction: column;
                        gap: 2px;
                    }

                    .trivia-result .result-actions {
                        flex-direction: column;
                    }

                    .trivia-result .result-action {
                        width: 100%;
                    }

                    .trivia-result .breakdown-row {
                        align-items: flex-start;
                    }
                }

                @media (forced-colors: active) {
                    .trivia-result .result-action,
                    .trivia-result .review-toggle {
                        border: 1px solid ButtonText;
                    }
                }
            `}</style>
        </div>
    );
}

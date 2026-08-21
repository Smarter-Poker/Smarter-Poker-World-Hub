/**
 * TRIVIA RESULT — Results screen with addictive game mechanics
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
import { Trophy, Zap, Gem, Target, Clock, Flame, RotateCcw, Home, ChevronRight, ChevronDown, ChevronUp, Crown, CheckCircle, XCircle, BookOpen, Share2 } from 'lucide-react';
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
    xpEarned, // legacy prop — ignored, kept for backward compat
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
    // right nor wrong — surface the count instead of hiding it inside "wrong".
    const skippedCount = Array.isArray(answers)
        ? answers.filter(a => a === -1 || a === -2).length
        : 0;

    // Review mode state
    const [showReview, setShowReview] = useState(false);
    const canReview = questions && answers && questions.length > 0;

    // Share state
    const [shareLabel, setShareLabel] = useState('Share Result');
    // Phase 75: the reset timeout was a raw setTimeout — navigating away within
    // 2s of copying fired setState on an unmounted component.
    const shareTimerRef = useRef(null);
    useEffect(() => () => {
        if (shareTimerRef.current) clearTimeout(shareTimerRef.current);
    }, []);

    const handleShare = async () => {
        const text = `Poker Trivia ${grade.letter} Grade! ${safeCorrect}/${safeTotal} correct (${accuracy}%)${diamondsEarned > 0 ? ` — earned ${diamondsEarned} diamonds` : ''}${streak > 0 ? ` — ${streak} day streak` : ''} on smarter.poker`;
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
        // Confetti. disableForReducedMotion matches TriviaGame — a full-screen
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
            // Land on the final values immediately — no animation, no jank.
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
        if (accuracy >= 100) return { letter: 'S', color: '#fbbf24', label: 'PERFECT!' };
        if (accuracy >= 90) return { letter: 'A', color: '#31a24c', label: 'Excellent!' };
        if (accuracy >= 80) return { letter: 'B', color: '#2374e1', label: 'Great Job!' };
        if (accuracy >= 70) return { letter: 'C', color: '#8b5cf6', label: 'Good Work!' };
        if (accuracy >= 60) return { letter: 'D', color: '#f97316', label: 'Keep Trying!' };
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
        breakdownRows.push({ key: 'stake', label: cashedOut ? 'Cashed-out pot' : 'Stake pot', value: `+${stakePot}` });
    } else if (diamondsEarned > 0) {
        breakdownRows.push({ key: 'base', label: 'Quiz reward', value: `+${diamondsEarned}` });
    }
    if (hasMultiplier) {
        breakdownRows.push({ key: 'mult', label: 'Streak multiplier', value: `${streakMultiplier}x` });
    }
    if (shownTimeBonus > 0) {
        breakdownRows.push({ key: 'time', label: `Time bonus (${timeRemaining}s left)`, value: `+${shownTimeBonus}` });
    }
    if (showDailyBonusRow && dailyBonusDiamonds > 0) {
        breakdownRows.push({ key: 'daily', label: 'Daily completion bonus', value: `+${dailyBonusDiamonds}` });
    }
    if (capReached && Number.isFinite(rawDiamonds)) {
        breakdownRows.push({
            key: 'cap',
            label: 'Daily cap reached',
            value: `${diamondsEarned} of ${rawDiamonds}`,
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
                        <Crown size={28} />
                        <span>FLAWLESS VICTORY</span>
                        <Crown size={28} />
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
                    <Trophy size={48} className="trophy-icon" />
                    <h1>{cashedOut ? 'Cashed Out!' : isArcade ? 'Arcade Complete!' : 'Quiz Complete!'}</h1>
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
                            <span className="opp-label">YOU</span>
                            <span className="opp-score">{correctCount}</span>
                        </div>
                        <div className="opp-vs">
                            {playerWon ? (
                                <span className="win-badge">WIN!</span>
                            ) : tied ? (
                                <span className="tie-badge">TIE</span>
                            ) : (
                                <span className="loss-badge">LOSS</span>
                            )}
                        </div>
                        <div className="opp-side them">
                            <span className="opp-score">{opponentScore}</span>
                            <span className="opp-label">{opponentName || 'Opponent'}</span>
                        </div>
                    </motion.div>
                )}

                {/* Stats Grid — 80ms stagger so the tiles land one after another */}
                <div className="stats-grid">
                    {[
                        {
                            key: 'correct',
                            className: 'stat-item',
                            icon: <Target size={24} className="stat-icon" />,
                            value: `${safeCorrect}/${safeTotal}`,
                            label: 'Correct',
                        },
                        {
                            key: 'time',
                            className: 'stat-item',
                            icon: <Clock size={24} className="stat-icon" />,
                            value: formatTime(timeSpent),
                            label: 'Time',
                        },
                        ...(stakePot > 0 || diamondsEarned > 0 ? [{
                            key: 'diamonds',
                            className: 'stat-item highlight diamond-stat',
                            icon: <Gem size={24} className="stat-icon diamond" />,
                            value: `+${displayDiamonds}`,
                            valueClass: 'stat-value diamond-value',
                            label: cashedOut ? 'Cashed Out' : 'Diamonds',
                        }] : []),
                        ...(hasMultiplier ? [{
                            key: 'mult',
                            className: 'stat-item multiplier',
                            icon: <Zap size={24} className="stat-icon mult" />,
                            value: `${streakMultiplier}x`,
                            label: 'Streak Bonus',
                        }] : []),
                        ...(skippedCount > 0 ? [{
                            key: 'skipped',
                            className: 'stat-item skipped-stat',
                            icon: <ChevronRight size={24} className="stat-icon" />,
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
                            {stat.icon}
                            <div className={stat.valueClass || 'stat-value'}>{stat.value}</div>
                            <div className="stat-label">{stat.label}</div>
                        </motion.div>
                    ))}
                </div>

                {/* Personal best comparison — data the pages already track */}
                {Number.isFinite(personalBest) && (
                    <div className={`personal-best-line ${beatPersonalBest ? 'is-new' : ''}`}>
                        {beatPersonalBest ? 'New personal best!' : `Your best: ${personalBest}`}
                    </div>
                )}

                {/* Reward breakdown — one row per component of the award, so a
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
                                    <Gem size={12} /> {row.value}
                                </span>
                            </motion.div>
                        ))}
                    </div>
                )}

                {/* Streak Info */}
                {streak > 0 && !isArcade && (
                    <div className="streak-info">
                        <Flame size={20} />
                        <span>{streak} Day Streak!</span>
                    </div>
                )}

                {/* Arcade Time Bonus — rendered only when the award really
                    contained one (see shownTimeBonus above). */}
                {isArcade && shownTimeBonus > 0 && (
                    <div className="time-bonus">
                        <Clock size={16} />
                        <span>+{shownTimeBonus} bonus diamonds for {timeRemaining}s remaining!</span>
                    </div>
                )}

                {/* Action Buttons */}
                {/* ════ Question Review Section ════ */}
                {canReview && (
                    <div className="review-section">
                        <button className="review-toggle" onClick={() => setShowReview(!showReview)}>
                            <BookOpen size={18} />
                            <span>{showReview ? 'Hide Answers' : 'Review Answers'}</span>
                            {showReview ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
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
                                                    {wasSkipped ? null : (isCorrect ? <CheckCircle size={16} className="review-icon correct" /> : <XCircle size={16} className="review-icon incorrect" />)}
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
                                                            {oi === q.correct_index && <CheckCircle size={14} />}
                                                            {oi === userAnswer && oi !== q.correct_index && <XCircle size={14} />}
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

                <div className="actions">
                    <Link href="/hub/trivia" className="action-btn secondary">
                        <Home size={18} />
                        Back to Trivia
                    </Link>
                    <button className="action-btn share" onClick={handleShare}>
                        <Share2 size={18} />
                        {shareLabel}
                    </button>
                    {!isArcade && mode !== 'daily' && (
                        <button className="action-btn primary" onClick={onPlayAgain}>
                            <RotateCcw size={18} />
                            Play Again
                        </button>
                    )}
                    {isArcade && (
                        <button className="action-btn primary" onClick={onPlayAgain}>
                            <ChevronRight size={18} />
                            Play Again (10 <Gem size={14} />)
                        </button>
                    )}

                    {showSpinButton && onSpinWheel && (
                        <button className="action-btn spin-wheel" onClick={onSpinWheel}>
                            <Trophy size={18} />
                            Spin Prize Wheel!
                        </button>
                    )}

                    {showDoubleButton && onDoubleOrNothing && (
                        <button className="action-btn double-or-nothing" onClick={onDoubleOrNothing}>
                            <Zap size={18} />
                            Double or Nothing ({diamondsEarned} → {diamondsEarned * 2} <Gem size={14} />)
                        </button>
                    )}
                </div>
            </motion.div>

            <style>{`
                .trivia-result {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    min-height: 70vh;
                    padding: 20px;
                    position: relative;
                }

                /* ═══ FLAWLESS VICTORY ═══ */
                .flawless-banner {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 20px;
                    padding: 14px 28px;
                    background: linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(245, 158, 11, 0.1));
                    border: 2px solid rgba(251, 191, 36, 0.5);
                    border-radius: 16px;
                    color: #fbbf24;
                    font-size: 24px;
                    font-weight: 900;
                    letter-spacing: 3px;
                    text-shadow: 0 0 20px rgba(251, 191, 36, 0.5);
                    animation: flawlessGlow 2s ease-in-out infinite alternate;
                }
                @keyframes flawlessGlow {
                    from { box-shadow: 0 0 15px rgba(251, 191, 36, 0.3); }
                    to { box-shadow: 0 0 35px rgba(251, 191, 36, 0.6); }
                }

                .result-card {
                    background: #242526;
                    border: 1px solid #4e4f50;
                    border-radius: 20px;
                    padding: 40px;
                    text-align: center;
                    max-width: 480px;
                    width: 100%;
                }

                .result-header { margin-bottom: 24px; }
                .trophy-icon { color: #fbbf24; margin-bottom: 16px; }
                .result-header h1 {
                    font-size: 28px;
                    font-weight: 700;
                    color: #ffffff;
                    margin: 0 0 8px 0;
                }
                .grade-label {
                    font-size: 16px;
                    color: #65676b;
                    margin: 0;
                }

                /* ═══ ANIMATED GRADE RING ═══ */
                .grade-ring-container {
                    position: relative;
                    width: 140px;
                    height: 140px;
                    margin: 0 auto 28px;
                }
                .grade-ring-svg {
                    width: 100%;
                    height: 100%;
                    transform: rotate(-90deg);
                }
                .ring-bg {
                    fill: none;
                    stroke: #3a3b3c;
                    stroke-width: 6;
                }
                .ring-fill {
                    fill: none;
                    stroke-width: 6;
                    stroke-linecap: round;
                    transition: stroke-dashoffset 0.05s linear;
                    filter: drop-shadow(0 0 6px currentColor);
                }
                .grade-inner {
                    position: absolute;
                    inset: 0;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                }
                .grade-letter {
                    font-size: 48px;
                    font-weight: 900;
                    line-height: 1;
                }
                .grade-percent {
                    font-size: 16px;
                    color: #65676b;
                    margin-top: 4px;
                    font-family: 'Rajdhani', monospace;
                }

                /* ═══ OPPONENT COMPARISON ═══ */
                .opponent-result {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 16px;
                    margin-bottom: 24px;
                    padding: 14px 20px;
                    border-radius: 12px;
                    border: 1px solid #4e4f50;
                    background: #18191a;
                }
                .opponent-result.won { border-color: rgba(49, 162, 76, 0.3); }
                .opponent-result.lost { border-color: rgba(240, 40, 73, 0.3); }
                .opp-side {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .opp-label {
                    font-size: 12px;
                    color: #65676b;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }
                .opp-score {
                    font-size: 28px;
                    font-weight: 900;
                    color: #fff;
                    font-family: 'Rajdhani', monospace;
                }
                .opp-vs { text-align: center; }
                .win-badge {
                    padding: 4px 12px;
                    background: rgba(49, 162, 76, 0.2);
                    border: 1px solid #31a24c;
                    border-radius: 8px;
                    color: #31a24c;
                    font-weight: 800;
                    font-size: 14px;
                }
                .tie-badge {
                    padding: 4px 12px;
                    background: rgba(251, 191, 36, 0.2);
                    border: 1px solid #fbbf24;
                    border-radius: 8px;
                    color: #fbbf24;
                    font-weight: 800;
                    font-size: 14px;
                }
                .loss-badge {
                    padding: 4px 12px;
                    background: rgba(240, 40, 73, 0.2);
                    border: 1px solid #f02849;
                    border-radius: 8px;
                    color: #f02849;
                    font-weight: 800;
                    font-size: 14px;
                }

                /* ═══ STATS ═══ */
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 16px;
                    margin-bottom: 24px;
                }
                .stat-item {
                    background: #18191a;
                    border-radius: 12px;
                    padding: 16px;
                }
                .stat-item.highlight {
                    background: rgba(35, 116, 225, 0.1);
                    border: 1px solid rgba(35, 116, 225, 0.2);
                }
                .stat-item.multiplier {
                    background: rgba(255, 215, 0, 0.1);
                    border: 1px solid rgba(255, 215, 0, 0.3);
                }
                .diamond-stat {
                    background: rgba(35, 116, 225, 0.1) !important;
                    border: 1px solid rgba(35, 116, 225, 0.3) !important;
                }
                .diamond-value {
                    color: #2374e1 !important;
                    text-shadow: 0 0 10px rgba(35, 116, 225, 0.3);
                }
                .stat-icon {
                    color: #65676b;
                    margin-bottom: 8px;
                }
                .stat-icon.xp { color: #fbbf24; }
                .stat-icon.diamond { color: #2374e1; }
                .stat-icon.mult { color: #ffd700; }
                .stat-value {
                    font-size: 24px;
                    font-weight: 700;
                    color: #ffffff;
                    margin-bottom: 4px;
                }
                .stat-label {
                    font-size: 12px;
                    color: #65676b;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }

                .streak-info {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 20px;
                    background: rgba(249, 115, 22, 0.15);
                    border: 1px solid rgba(249, 115, 22, 0.3);
                    border-radius: 20px;
                    color: #f97316;
                    font-weight: 600;
                    margin-bottom: 24px;
                }

                /* ═══ PERSONAL BEST + REWARD BREAKDOWN ═══ */
                .personal-best-line {
                    font-size: 13px;
                    color: #65676b;
                    margin: -8px 0 16px;
                    letter-spacing: 0.5px;
                }
                .personal-best-line.is-new {
                    color: #fbbf24;
                    font-weight: 700;
                    text-shadow: 0 0 12px rgba(251, 191, 36, 0.35);
                }
                .reward-breakdown {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    margin-bottom: 20px;
                    padding: 12px 14px;
                    background: #18191a;
                    border: 1px solid #4e4f50;
                    border-radius: 12px;
                    text-align: left;
                }
                .breakdown-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    font-size: 13px;
                    color: rgba(255, 255, 255, 0.75);
                }
                .breakdown-row.muted {
                    color: #65676b;
                }
                .breakdown-label {
                    letter-spacing: 0.3px;
                }
                .breakdown-value {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    font-weight: 700;
                    color: #2374e1;
                    white-space: nowrap;
                }
                .breakdown-row.muted .breakdown-value {
                    color: #65676b;
                }
                .skipped-stat .stat-icon { color: #fbbf24; }

                .time-bonus {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 20px;
                    background: rgba(35, 116, 225, 0.15);
                    border: 1px solid rgba(35, 116, 225, 0.3);
                    border-radius: 20px;
                    color: #2374e1;
                    font-size: 14px;
                    margin-bottom: 24px;
                }

                /* ═══ ACTIONS ═══ */
                .actions {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 12px;
                    margin-top: 8px;
                }
                .action-btn {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    padding: 14px 20px;
                    border-radius: 10px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    text-decoration: none;
                    min-width: 140px;
                    min-height: 48px;
                    border: none;
                }
                .action-btn:focus-visible,
                .review-toggle:focus-visible {
                    outline: 2px solid #00D4FF;
                    outline-offset: 2px;
                }
                @media (prefers-reduced-motion: reduce) {
                    .flawless-banner,
                    .action-btn.spin-wheel,
                    .action-btn.double-or-nothing {
                        animation: none !important;
                    }
                    .action-btn:hover {
                        transform: none !important;
                    }
                }
                .action-btn.secondary {
                    background: #3a3b3c;
                    border: 1px solid #4e4f50;
                    color: rgba(255, 255, 255, 0.8);
                }
                .action-btn.secondary:hover { background: #4e4f50; }
                .action-btn.primary {
                    background: linear-gradient(135deg, #2374e1, #1a5cc4);
                    border: none;
                    color: #ffffff;
                }
                .action-btn.primary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 20px rgba(35, 116, 225, 0.4);
                }
                .action-btn.spin-wheel {
                    background: linear-gradient(135deg, #ffd700, #ff8c00);
                    border: none;
                    color: #000;
                    animation: spinPulse 1.5s ease-in-out infinite;
                }
                .action-btn.spin-wheel:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 20px rgba(255, 215, 0, 0.5);
                }
                @keyframes spinPulse {
                    0%, 100% { box-shadow: 0 0 10px rgba(255, 215, 0, 0.5); }
                    50% { box-shadow: 0 0 25px rgba(255, 215, 0, 0.8); }
                }
                .action-btn.double-or-nothing {
                    background: linear-gradient(135deg, #8b5cf6, #6d28d9);
                    border: none;
                    color: #fff;
                    animation: doublePulse 2s ease-in-out infinite;
                }
                .action-btn.double-or-nothing:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 20px rgba(139, 92, 246, 0.5);
                }
                @keyframes doublePulse {
                    0%, 100% { box-shadow: 0 0 10px rgba(139, 92, 246, 0.4); }
                    50% { box-shadow: 0 0 20px rgba(139, 92, 246, 0.7); }
                }
                .action-btn.share {
                    background: #3a3b3c;
                    border: 1px solid #4e4f50;
                    color: rgba(255, 255, 255, 0.8);
                }
                .action-btn.share:hover {
                    background: #4e4f50;
                    color: #fff;
                }
                /* ═══ REVIEW MODE ═══ */
                .review-section {
                    width: 100%;
                    margin-top: 16px;
                    margin-bottom: 16px;
                }
                .review-toggle {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    width: 100%;
                    padding: 12px;
                    background: rgba(35, 116, 225, 0.1);
                    border: 1px solid rgba(35, 116, 225, 0.25);
                    border-radius: 10px;
                    color: #2374e1;
                    font-weight: 600;
                    font-size: 14px;
                    cursor: pointer;
                    transition: background 0.2s;
                }
                .review-toggle:hover {
                    background: rgba(35, 116, 225, 0.2);
                }
                .review-list {
                    overflow: hidden;
                    margin-top: 12px;
                }
                .review-item {
                    padding: 16px;
                    border-radius: 10px;
                    background: rgba(255, 255, 255, 0.04);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    margin-bottom: 10px;
                }
                .review-item.correct {
                    border-left: 3px solid #31a24c;
                }
                .review-item.incorrect {
                    border-left: 3px solid #f02849;
                }
                /* Phase 75: the skipped state was assigned but never styled,
                   so skipped questions rendered with no accent at all. */
                .review-item.skipped {
                    border-left: 3px solid #fbbf24;
                    background: rgba(251, 191, 36, 0.05);
                }
                .review-item.skipped .review-q-num {
                    color: #fbbf24;
                }
                .review-q-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 8px;
                }
                .review-q-num {
                    font-weight: 700;
                    font-size: 12px;
                    color: #65676b;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                .review-icon.correct { color: #31a24c; }
                .review-icon.incorrect { color: #f02849; }
                .review-question {
                    color: #e4e6eb;
                    font-size: 14px;
                    line-height: 1.5;
                    margin: 0 0 10px;
                }
                .review-options {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .review-option {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 12px;
                    border-radius: 6px;
                    font-size: 13px;
                    color: rgba(255, 255, 255, 0.6);
                    background: rgba(255, 255, 255, 0.03);
                }
                .review-option.is-correct {
                    background: rgba(49, 162, 76, 0.15);
                    border: 1px solid rgba(49, 162, 76, 0.3);
                    color: #31a24c;
                    font-weight: 600;
                }
                .review-option.is-wrong {
                    background: rgba(240, 40, 73, 0.1);
                    border: 1px solid rgba(240, 40, 73, 0.25);
                    color: #f02849;
                }
                .review-opt-letter {
                    font-weight: 700;
                    opacity: 0.5;
                    min-width: 16px;
                }
                .review-explanation {
                    margin: 10px 0 0;
                    padding: 10px 12px;
                    background: rgba(35, 116, 225, 0.08);
                    border-radius: 6px;
                    color: rgba(255, 255, 255, 0.7);
                    font-size: 13px;
                    line-height: 1.5;
                    border-left: 2px solid rgba(35, 116, 225, 0.3);
                }
            `}</style>
        </div>
    );
}

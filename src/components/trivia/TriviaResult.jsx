/**
 * TRIVIA RESULT - Results screen with addictive game mechanics
 * 
 * #ClubArenaConsole: printed on the console glass as label / value rows with
 * engraved rules, in the master's own inks. No ring, card, gradient or
 * decorative motion; the only motion left is the reward count-up (a reveal)
 * and it lands instantly under reduced motion.
 *
 * actionsInFooter (additive, default false): when the page prints Back To
 * Trivia and Play Again on the console's own painted plates, this component
 * prints only its body-level actions (Share, Spin, Review) as lit words.
 */

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
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
    actionsInFooter = false,   // the page owns Back To Trivia / Play Again
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
        const text = `Poker Trivia ${grade.letter} Grade! ${safeCorrect}/${safeTotal} Correct (${accuracy}%)${diamondsEarned > 0 ? `, Earned ${formatTriviaDisplayNumber(diamondsEarned)} Diamonds` : ''}${streak > 0 ? `, ${streak} Day Streak` : ''} On Smarter.Poker`;
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
    const countUpDone = useRef(false);

    useEffect(() => {
        // Confetti. disableForReducedMotion matches TriviaGame - a full-screen
        // particle burst is exactly what "reduce motion" is asking us not to do.
        if (accuracy >= 70) {
            fireConfetti({
                particleCount: isPerfect ? 200 : 80,
                spread: 70,
                origin: { y: 0.6 },
                // Schema inks only; canvas-confetti's default palette is off-schema.
                colors: isPerfect ? ['#ffd700', '#f02849', '#c8ffd2', '#45adff'] : ['#45adff', '#ffd700', '#e4e7ec'],
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
                fireConfetti({ particleCount: 100, spread: 100, origin: { y: 0.4 }, colors: ['#ffd700', '#45adff', '#f4f7fb'], disableForReducedMotion: true });
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

        // Accuracy count-up (0 -> accuracy over 1.5s)
        animate({
            duration: 1500,
            onFrame: (eased) => {
                setDisplayAccuracy(Math.round(eased * accuracy));
            },
        });

        // Diamond count-up, starting 500ms in so the accuracy reads first.
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
        if (accuracy >= 100) return { letter: 'S', ink: 'gold', label: 'Perfect!' };
        if (accuracy >= 90) return { letter: 'A', ink: 'green', label: 'Excellent!' };
        if (accuracy >= 80) return { letter: 'B', ink: 'blue', label: 'Great Job!' };
        if (accuracy >= 70) return { letter: 'C', ink: 'silver', label: 'Good Work!' };
        if (accuracy >= 60) return { letter: 'D', ink: 'muted', label: 'Keep Trying!' };
        return { letter: 'F', ink: 'red', label: 'Study Up!' };
    };

    const grade = getGrade();

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
        breakdownRows.push({ key: 'mult', label: 'Streak Multiplier', value: `${streakMultiplier}X` });
    }
    if (shownTimeBonus > 0) {
        breakdownRows.push({ key: 'time', label: `Time Bonus, ${timeRemaining} Sec Left`, value: `+${formatTriviaDisplayNumber(shownTimeBonus)}`, isDiamond: true });
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
        // Words, not unit letters: the site-wide copy scope capitalizes the
        // first letter of every word, which would print '45s' as '45S'.
        return mins > 0 ? `${mins} Min ${secs} Sec` : `${secs} Sec`;
    };

    const headline = cashedOut ? 'Cashed Out' : isArcade ? 'Arcade Complete' : 'Quiz Complete';
    const outcome = hasOpponent ? (playerWon && !tied ? 'Win' : tied ? 'Tie' : 'Loss') : null;
    const outcomeInk = outcome === 'Win' ? 'tc-ink--green' : outcome === 'Loss' ? 'tc-ink--red' : 'tc-ink--silver';
    const showPlayAgain = isArcade || mode !== 'daily';

    return (
        <div className="trivia-result">
            <div className="trivia-result__head">
                <h2 className="trivia-result__title tc-label">{headline}</h2>
                <p className="trivia-result__grade">
                    <span className={`trivia-result__letter tc-ink--${grade.ink}`}>{grade.letter}</span>
                    <span className="trivia-result__grade-label tc-ink--silver">{grade.label}</span>
                </p>
                {showFlawless && (
                    <p className="trivia-result__flawless tc-ink--gold" role="status">Flawless Victory</p>
                )}
            </div>

            <ul className="tc-rows trivia-result__rows">
                <li className="tc-row">
                    <span className="tc-row__label">Accuracy</span>
                    <span className={`tc-row__value tc-ink--${grade.ink}`}>{displayAccuracy}%</span>
                </li>
                <li className="tc-row">
                    <span className="tc-row__label">Correct</span>
                    <span className="tc-row__value">{safeCorrect}/{safeTotal}</span>
                </li>
                <li className="tc-row">
                    <span className="tc-row__label">Time</span>
                    <span className="tc-row__value">{formatTime(timeSpent)}</span>
                </li>
                {(stakePot > 0 || diamondsEarned > 0) && (
                    <li className="tc-row">
                        <span className="tc-row__label">{cashedOut ? 'Cashed Out' : 'Diamonds Earned'}</span>
                        <span className="tc-row__value tc-ink--gold">+{formatTriviaDisplayNumber(displayDiamonds)}</span>
                    </li>
                )}
                {hasMultiplier && (
                    <li className="tc-row">
                        <span className="tc-row__label">Streak Bonus</span>
                        <span className="tc-row__value tc-ink--gold">{streakMultiplier}X</span>
                    </li>
                )}
                {skippedCount > 0 && (
                    <li className="tc-row">
                        <span className="tc-row__label">Skipped</span>
                        <span className="tc-row__value tc-ink--muted">{skippedCount}</span>
                    </li>
                )}
                {hasOpponent && (
                    <li className="tc-row trivia-result__versus">
                        <span className="tc-row__label">Head To Head</span>
                        <span className="tc-row__value">
                            <span className={outcomeInk}>{outcome}</span>
                            {' '}
                            <span className="tc-ink--silver">{safeCorrect} To {Number(opponentScore) || 0}</span>
                            {' '}
                            <span className="tc-ink--muted">Vs {opponentName || 'Opponent'}</span>
                        </span>
                    </li>
                )}
                {Number.isFinite(personalBest) && (
                    <li className="tc-row">
                        <span className="tc-row__label">{beatPersonalBest ? 'New Personal Best' : 'Your Best'}</span>
                        <span className={`tc-row__value ${beatPersonalBest ? 'tc-ink--gold' : ''}`}>{formatTriviaDisplayNumber(personalBest)}</span>
                    </li>
                )}
                {streak > 0 && !isArcade && (
                    <li className="tc-row">
                        <span className="tc-row__label">Streak</span>
                        <span className="tc-row__value tc-ink--gold">{streak} Day Streak</span>
                    </li>
                )}
            </ul>

            {/* Reward breakdown - one row per component of the award, so a
                single count-up can never silently drop the rest. */}
            {breakdownRows.length > 0 && (
                <div className="trivia-result__breakdown">
                    <p className="tc-label">Reward Breakdown</p>
                    <ul className="tc-rows reward-breakdown">
                        {breakdownRows.map((row) => (
                            <li key={row.key} className={`tc-row breakdown-row ${row.muted ? 'muted' : ''}`}>
                                <span className="tc-row__label breakdown-label">{row.label}</span>
                                <span className={`tc-row__value breakdown-value ${row.muted ? 'tc-ink--muted' : row.isDiamond ? 'tc-ink--gold' : ''}`}>
                                    {row.value}{row.isDiamond ? ' Diamonds' : ''}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Arcade Time Bonus - rendered only when the award really
                contained one (see shownTimeBonus above). */}
            {isArcade && shownTimeBonus > 0 && (
                <p className="trivia-console-copy tc-ink--gold">
                    +{shownTimeBonus} Bonus Diamonds For {timeRemaining} Sec Remaining!
                </p>
            )}

            {/* ════ Question Review Section ════ */}
            {canReview && showReview && (
                <div className="review-list" id="trivia-result-review">
                    {questions.map((q, idx) => {
                        const userAnswer = answers[idx];
                        // Phase 69: was treating skipped questions (sentinels -1
                        // for skip-hint and -2 for skip-lifeline) as plain
                        // 'incorrect' in the review screen. Now renders them
                        // as a distinct 'skipped' state.
                        const wasSkipped = userAnswer === -1 || userAnswer === -2 || userAnswer === undefined;
                        const isCorrect = !wasSkipped && userAnswer === q.correct_index;
                        const reviewClass = wasSkipped ? 'skipped' : (isCorrect ? 'correct' : 'incorrect');
                        return (
                            <div key={idx} className={`review-item ${reviewClass}`}>
                                <div className="review-q-header">
                                    <span className="review-q-num tc-label">Question {idx + 1}</span>
                                    <span className={`review-status ${wasSkipped ? 'tc-ink--muted' : isCorrect ? 'tc-ink--green' : 'tc-ink--red'}`}>
                                        {wasSkipped ? 'Skipped' : isCorrect ? 'Correct' : 'Incorrect'}
                                    </span>
                                </div>
                                <p className="review-question">{q.question}</p>
                                <ul className="review-options">
                                    {(q.options || []).map((opt, oi) => (
                                        <li
                                            key={oi}
                                            className={`review-option ${oi === q.correct_index ? 'is-correct' : ''} ${oi === userAnswer && oi !== q.correct_index ? 'is-wrong' : ''}`}
                                        >
                                            <span className="review-opt-letter">{String.fromCharCode(65 + oi)}</span>
                                            <span className="review-opt-text">{opt}</span>
                                            {oi === q.correct_index && <span className="review-option-status tc-ink--green">Correct</span>}
                                            {oi === userAnswer && oi !== q.correct_index && <span className="review-option-status tc-ink--red">Selected</span>}
                                        </li>
                                    ))}
                                </ul>
                                {q.explanation && (
                                    <p className="review-explanation">{q.explanation}</p>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="result-actions">
                {canReview && (
                    <button
                        type="button"
                        className="review-toggle tc-word"
                        onClick={() => setShowReview(!showReview)}
                        aria-expanded={showReview}
                        aria-controls="trivia-result-review"
                    >
                        {showReview ? 'Hide Answers' : 'Review Answers'}
                    </button>
                )}
                <button type="button" className="result-action result-action--share tc-word" onClick={handleShare}>
                    {shareLabel}
                </button>

                {showSpinButton && onSpinWheel && (
                    <button type="button" className="result-action result-action--spin-wheel tc-word tc-ink--gold" onClick={onSpinWheel}>
                        Spin Prize Wheel!
                    </button>
                )}

                {showDoubleButton && onDoubleOrNothing && (
                    <button type="button" className="result-action result-action--double tc-word" onClick={onDoubleOrNothing}>
                        Double Or Nothing ({formatTriviaDisplayNumber(diamondsEarned)} To {formatTriviaDisplayNumber(diamondsEarned * 2)} Diamonds)
                    </button>
                )}

                {!actionsInFooter && (
                    <Link href="/hub/trivia" className="result-action result-action--secondary tc-word">
                        Back To Trivia
                    </Link>
                )}
                {!actionsInFooter && showPlayAgain && (
                    <button type="button" className="result-action result-action--primary tc-word" onClick={onPlayAgain}>
                        {isArcade ? 'Play Again (10 Diamonds)' : 'Play Again'}
                    </button>
                )}
            </div>
        </div>
    );
}

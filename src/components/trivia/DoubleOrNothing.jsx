/**
 * DOUBLE OR NOTHING — Risk current winnings for 2x
 * Post-game modal, one question decides all
 *
 * Prop contract is deliberately tolerant: this modal has been wired with two
 * different prop vocabularies over its life (`diamondsAtRisk/onAnswer` and
 * `currentWinnings/onComplete`). Passing either shape works, because a
 * mismatch here used to be catastrophic — the modal showed a 0 stake, never
 * credited or deducted anything, and left the player stranded on a fixed
 * full-screen overlay with no exit control.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gem, AlertTriangle, Check, X, Sparkles } from 'lucide-react';
import MetalFrame from '../ui/MetalFrame';
import HexButton from '../ui/HexButton';

const DEFAULT_OFFER_SECONDS = 10;

function prefersReducedMotion() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch { return false; }
}

export default function DoubleOrNothing({
    diamondsAtRisk,
    currentWinnings, // legacy alias for diamondsAtRisk
    question = null,
    onAccept,
    onDecline,
    onAnswer,
    onComplete, // legacy alias for onAnswer
    onDismiss, // preferred: close the modal once the result is acknowledged
    onClose, // alias for onDismiss
    offerSeconds = DEFAULT_OFFER_SECONDS
}) {
    const [stage, setStage] = useState('offer'); // offer, question, result
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [isRevealing, setIsRevealing] = useState(false);
    const [won, setWon] = useState(false);
    const [reduceMotion] = useState(prefersReducedMotion);

    // Normalise the stake from whichever prop name the caller used. A NaN /
    // undefined stake must never reach the UI as "Risk 0 for 0".
    const rawStake = diamondsAtRisk != null ? diamondsAtRisk : currentWinnings;
    const parsedStake = Math.floor(Number(rawStake));
    const stake = Number.isFinite(parsedStake) && parsedStake > 0 ? parsedStake : 0;
    const hasStake = stake > 0;

    // Whichever answer-result callback the caller supplied.
    const reportAnswer = onAnswer || onComplete;

    const [secondsLeft, setSecondsLeft] = useState(
        Number.isFinite(offerSeconds) && offerSeconds > 0 ? Math.floor(offerSeconds) : 0
    );

    // Phase 69: track pending setTimeouts so unmount cancels them.
    // Without this the 1.5-second reveal setTimeout fired setState/
    // onAnswer on an unmounted component when the user dismissed the
    // modal mid-reveal. Plus refs to dedup Accept/Decline double-clicks
    // — onAccept commits diamonds-at-risk on the parent; firing twice
    // could double-deduct.
    const _pendingTimeoutsRef = useRef(new Set());
    const _isMountedRef = useRef(true);
    const _acceptedRef = useRef(false);
    const _declinedRef = useRef(false);
    const _dismissedRef = useRef(false);
    const safeSetTimeout = (fn, delay) => {
        const id = setTimeout(() => {
            _pendingTimeoutsRef.current.delete(id);
            if (_isMountedRef.current) fn();
        }, delay);
        _pendingTimeoutsRef.current.add(id);
        return id;
    };
    useEffect(() => () => {
        _isMountedRef.current = false;
        for (const id of _pendingTimeoutsRef.current) clearTimeout(id);
        _pendingTimeoutsRef.current.clear();
    }, []);

    const handleDecline = useCallback(() => {
        if (_declinedRef.current || _acceptedRef.current) return;
        _declinedRef.current = true;
        (onDecline || onDismiss || onClose)?.();
    }, [onDecline, onDismiss, onClose]);

    // Exit control for the result stage. Always resolves to *something* that
    // closes the overlay — a dead-end fixed overlay is worse than an
    // imperfectly-named callback.
    const handleDismiss = useCallback(() => {
        if (_dismissedRef.current) return;
        _dismissedRef.current = true;
        const close = onDismiss || onClose || onDecline;
        close?.();
    }, [onDismiss, onClose, onDecline]);

    const handleAccept = () => {
        if (_acceptedRef.current || _declinedRef.current) return;
        if (!hasStake || !question) return;
        _acceptedRef.current = true;
        onAccept?.();
        setStage('question');
    };

    // Offer countdown — the gamble auto-declines rather than sitting open
    // forever. Cleared on stage change and unmount.
    useEffect(() => {
        if (stage !== 'offer' || !hasStake || secondsLeft <= 0) return undefined;
        const id = setInterval(() => {
            setSecondsLeft(prev => (prev <= 1 ? 0 : prev - 1));
        }, 1000);
        return () => clearInterval(id);
    }, [stage, hasStake, secondsLeft > 0]);

    useEffect(() => {
        if (stage === 'offer' && hasStake && Number.isFinite(offerSeconds) && offerSeconds > 0 && secondsLeft === 0) {
            handleDecline();
        }
    }, [stage, hasStake, secondsLeft, offerSeconds, handleDecline]);

    // Nothing to gamble: never render "Risk 0 for 0". Close immediately and
    // still show a real exit in case the parent ignores the callback.
    useEffect(() => {
        if (!hasStake) handleDecline();
    }, [hasStake, handleDecline]);

    const handleAnswer = (answerIndex) => {
        if (isRevealing) return;
        if (!question || question.correct_index == null) return;

        setSelectedAnswer(answerIndex);
        setIsRevealing(true);

        const isCorrect = answerIndex === question.correct_index;

        safeSetTimeout(() => {
            setWon(isCorrect);
            setStage('result');
            reportAnswer?.(isCorrect, { won: isCorrect, stake, payout: isCorrect ? stake * 2 : 0 });
        }, 1500);
    };

    const motionProps = (from, to) => (reduceMotion ? {} : { initial: from, animate: to, exit: from });

    if (!hasStake) {
        return (
            <div className="double-or-nothing-overlay">
                <div className="don-modal">
                    <MetalFrame padding="32px" showBolts={true}>
                        <div className="offer-header">
                            <Sparkles size={40} className="sparkle-icon" />
                            <h2>NOTHING TO DOUBLE</h2>
                        </div>
                        <p className="empty-copy">
                            You have no winnings from this game to put at risk. Play another round to build a stake.
                        </p>
                        <HexButton label="Close" onClick={handleDismiss} variant="primary" />
                    </MetalFrame>
                </div>
                <style>{`
                    .double-or-nothing-overlay {
                        position: fixed;
                        inset: 0;
                        background: rgba(0, 0, 0, 0.85);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        z-index: 1000;
                        padding: 20px;
                    }
                    .don-modal { max-width: 480px; width: 100%; }
                    .offer-header { text-align: center; margin-bottom: 16px; }
                    .sparkle-icon { color: #fbbf24; margin-bottom: 12px; }
                    .offer-header h2 { font-size: 24px; font-weight: 700; color: #fff; margin: 0; }
                    .empty-copy {
                        text-align: center;
                        color: rgba(255, 255, 255, 0.65);
                        font-size: 14px;
                        line-height: 1.5;
                        margin: 0 0 24px 0;
                    }
                `}</style>
            </div>
        );
    }

    return (
        <div className="double-or-nothing-overlay">
            <AnimatePresence mode="wait">
                {stage === 'offer' && (
                    <motion.div
                        key="offer"
                        {...motionProps({ opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1 })}
                        className="don-modal"
                    >
                        <MetalFrame padding="32px" showBolts={true} showNeonStrips={true}>
                            <div className="offer-header">
                                <Sparkles size={48} className="sparkle-icon" />
                                <h2>DOUBLE OR NOTHING</h2>
                                {secondsLeft > 0 && (
                                    <div className="offer-countdown" role="timer" aria-live="off">
                                        <span
                                            className="countdown-ring"
                                            style={{ '--countdown-progress': `${(secondsLeft / Math.max(1, Math.floor(offerSeconds))) * 100}%` }}
                                        />
                                        <span className="countdown-num">{secondsLeft}</span>
                                        <span className="countdown-label">to decide</span>
                                    </div>
                                )}
                            </div>

                            <div className="stake-display">
                                <div className="stake-current">
                                    <span className="stake-label">Your Winnings</span>
                                    <span className="stake-value">
                                        <Gem size={20} /> {stake}
                                    </span>
                                </div>
                                <div className="stake-arrow">-&gt;</div>
                                <div className="stake-potential">
                                    <span className="stake-label">If Correct</span>
                                    <span className="stake-value win">
                                        <Gem size={20} /> {stake * 2}
                                    </span>
                                </div>
                            </div>

                            {/* Show what they are gambling on before they commit */}
                            {question && (question.category || question.difficulty) && (
                                <div className="question-preview">
                                    {question.category && <span className="preview-chip">{question.category}</span>}
                                    {question.difficulty && (
                                        <span className={`preview-chip difficulty ${String(question.difficulty).toLowerCase()}`}>
                                            {question.difficulty}
                                        </span>
                                    )}
                                </div>
                            )}

                            <div className="warning-box">
                                <AlertTriangle size={16} />
                                <span>Answer incorrectly and lose ALL {stake} diamonds!</span>
                            </div>

                            <div className="offer-actions">
                                <HexButton
                                    label={`Risk ${stake} for ${stake * 2}`}
                                    onClick={handleAccept}
                                    variant="primary"
                                />
                                <HexButton
                                    label={`Keep ${stake} Diamonds`}
                                    onClick={handleDecline}
                                    variant="secondary"
                                />
                            </div>
                        </MetalFrame>
                    </motion.div>
                )}

                {stage === 'question' && question && (
                    <motion.div
                        key="question"
                        {...motionProps({ opacity: 0, x: 50 }, { opacity: 1, x: 0 })}
                        className="don-modal"
                    >
                        <MetalFrame padding="24px" showBolts={true}>
                            <div className="risk-banner">
                                <Gem size={16} /> {stake} diamonds at risk!
                            </div>

                            <p className="question-text">{question.question}</p>

                            <div className="answers-grid">
                                {(question.options || []).map((option, idx) => {
                                    const isSelected = selectedAnswer === idx;
                                    const isCorrect = idx === question.correct_index;
                                    const showResult = isRevealing;

                                    let className = 'answer-btn';
                                    if (showResult) {
                                        if (isCorrect) className += ' correct';
                                        else if (isSelected) className += ' wrong';
                                    }

                                    return (
                                        <button
                                            key={idx}
                                            className={className}
                                            onClick={() => handleAnswer(idx)}
                                            disabled={isRevealing}
                                        >
                                            <span className="answer-label">{String.fromCharCode(65 + idx)}</span>
                                            <span className="answer-text">{option}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </MetalFrame>
                    </motion.div>
                )}

                {stage === 'result' && (
                    <motion.div
                        key="result"
                        {...motionProps({ opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1 })}
                        className="don-modal"
                    >
                        <MetalFrame padding="32px" showBolts={true}>
                            {won ? (
                                <>
                                    <div className="result-icon win">
                                        <Check size={48} />
                                    </div>
                                    <h2 className="result-title win">DOUBLED!</h2>
                                    <div className="result-amount win">
                                        <Gem size={32} /> +{stake * 2}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="result-icon lose">
                                        <X size={48} />
                                    </div>
                                    <h2 className="result-title lose">LOST IT ALL</h2>
                                    <div className="result-amount lose">
                                        <Gem size={32} /> -{stake}
                                    </div>
                                </>
                            )}

                            {/* The result stage previously had no control at
                                all — combined with a fixed z-index:1000
                                overlay that meant a hard soft-lock. */}
                            <div className="result-actions">
                                <HexButton
                                    label="Continue"
                                    onClick={handleDismiss}
                                    variant="primary"
                                    fullWidth
                                />
                            </div>
                        </MetalFrame>
                    </motion.div>
                )}
            </AnimatePresence>

            <style>{`
                .double-or-nothing-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.85);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    padding: 20px;
                }

                .don-modal {
                    max-width: 480px;
                    width: 100%;
                }

                .offer-header {
                    text-align: center;
                    margin-bottom: 24px;
                }

                .sparkle-icon {
                    color: #fbbf24;
                    margin-bottom: 12px;
                }

                .offer-header h2 {
                    font-size: 28px;
                    font-weight: 700;
                    color: #fff;
                    margin: 0;
                }

                .offer-countdown {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    margin-top: 12px;
                    padding: 4px 12px 4px 6px;
                    background: rgba(0, 0, 0, 0.35);
                    border: 1px solid rgba(251, 191, 36, 0.35);
                    border-radius: 999px;
                }

                .countdown-ring {
                    width: 22px;
                    height: 22px;
                    border-radius: 50%;
                    background: conic-gradient(#fbbf24 var(--countdown-progress), rgba(255, 255, 255, 0.12) 0);
                    /* width-only repaint, no layout thrash */
                    transition: background 0.4s linear;
                }

                .countdown-num {
                    font-size: 14px;
                    font-weight: 700;
                    color: #fbbf24;
                    font-variant-numeric: tabular-nums;
                }

                .countdown-label {
                    font-size: 11px;
                    color: rgba(255, 255, 255, 0.45);
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                }

                .question-preview {
                    display: flex;
                    justify-content: center;
                    flex-wrap: wrap;
                    gap: 8px;
                    margin-bottom: 16px;
                }

                .preview-chip {
                    padding: 4px 10px;
                    border-radius: 999px;
                    background: rgba(255, 255, 255, 0.07);
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    font-size: 11px;
                    font-weight: 600;
                    color: rgba(255, 255, 255, 0.7);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .preview-chip.difficulty.easy { color: #22c55e; border-color: rgba(34, 197, 94, 0.35); }
                .preview-chip.difficulty.medium { color: #fbbf24; border-color: rgba(251, 191, 36, 0.35); }
                .preview-chip.difficulty.hard { color: #ef4444; border-color: rgba(239, 68, 68, 0.35); }

                .result-actions {
                    margin-top: 24px;
                }

                .stake-display {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 16px;
                    margin-bottom: 20px;
                }

                .stake-current, .stake-potential {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: 16px 24px;
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 12px;
                }

                .stake-potential {
                    background: rgba(34, 197, 94, 0.1);
                    border: 1px solid rgba(34, 197, 94, 0.3);
                }

                .stake-label {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.5);
                    margin-bottom: 8px;
                }

                .stake-value {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 24px;
                    font-weight: 700;
                    color: #00d4ff;
                }

                .stake-value.win {
                    color: #22c55e;
                }

                .stake-arrow {
                    font-size: 24px;
                    color: rgba(255, 255, 255, 0.3);
                }

                .warning-box {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px;
                    background: rgba(239, 68, 68, 0.1);
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    border-radius: 8px;
                    color: #ef4444;
                    font-size: 13px;
                    margin-bottom: 24px;
                }

                .offer-actions {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .risk-banner {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    padding: 10px;
                    background: rgba(239, 68, 68, 0.15);
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    border-radius: 8px;
                    color: #ef4444;
                    font-weight: 600;
                    font-size: 14px;
                    margin-bottom: 20px;
                }

                .question-text {
                    font-size: 18px;
                    font-weight: 600;
                    color: #fff;
                    text-align: center;
                    margin: 0 0 20px 0;
                    line-height: 1.5;
                }

                .answers-grid {
                    display: grid;
                    gap: 10px;
                }

                .answer-btn {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 14px;
                    min-height: 52px;
                    background: rgba(30, 41, 59, 0.8);
                    border: 2px solid rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                    cursor: pointer;
                    transition: border-color 0.2s ease, background-color 0.2s ease;
                    text-align: left;
                }

                .answer-btn:hover:not(:disabled) {
                    border-color: #fbbf24;
                }

                .answer-btn.correct {
                    border-color: #22c55e;
                    background: rgba(34, 197, 94, 0.2);
                }

                .answer-btn.wrong {
                    border-color: #ef4444;
                    background: rgba(239, 68, 68, 0.2);
                }

                .answer-label {
                    width: 28px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 6px;
                    font-weight: 700;
                    color: #fff;
                    flex-shrink: 0;
                }

                .answer-text {
                    font-size: 14px;
                    color: #fff;
                }

                .result-icon {
                    width: 80px;
                    height: 80px;
                    margin: 0 auto 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                }

                .result-icon.win {
                    background: rgba(34, 197, 94, 0.2);
                    color: #22c55e;
                }

                .result-icon.lose {
                    background: rgba(239, 68, 68, 0.2);
                    color: #ef4444;
                }

                .result-title {
                    font-size: 28px;
                    font-weight: 700;
                    text-align: center;
                    margin: 0 0 16px 0;
                }

                .result-title.win { color: #22c55e; }
                .result-title.lose { color: #ef4444; }

                .result-amount {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 12px;
                    font-size: 36px;
                    font-weight: 700;
                }

                .result-amount.win { color: #22c55e; }
                .result-amount.lose { color: #ef4444; }

                @media (prefers-reduced-motion: reduce) {
                    .answer-btn,
                    .countdown-ring {
                        transition: none;
                    }
                }
            `}</style>
        </div>
    );
}

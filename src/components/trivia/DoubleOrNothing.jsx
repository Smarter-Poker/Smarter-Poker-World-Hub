/**
 * DOUBLE OR NOTHING — Risk current winnings for 2x
 * Post-game modal, one question decides all
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gem, AlertTriangle, Check, X, Sparkles } from 'lucide-react';
import MetalFrame from '../ui/MetalFrame';
import HexButton from '../ui/HexButton';

export default function DoubleOrNothing({
    diamondsAtRisk = 0,
    question = null,
    onAccept,
    onDecline,
    onAnswer
}) {
    const [stage, setStage] = useState('offer'); // offer, question, result
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [isRevealing, setIsRevealing] = useState(false);
    const [won, setWon] = useState(false);

    const handleAccept = () => {
        onAccept?.();
        setStage('question');
    };

    const handleAnswer = (answerIndex) => {
        if (isRevealing) return;

        setSelectedAnswer(answerIndex);
        setIsRevealing(true);

        const isCorrect = answerIndex === question.correct_index;

        setTimeout(() => {
            setWon(isCorrect);
            setStage('result');
            onAnswer?.(isCorrect);
        }, 1500);
    };

    return (
        <div className="double-or-nothing-overlay">
            <AnimatePresence mode="wait">
                {stage === 'offer' && (
                    <motion.div
                        key="offer"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="don-modal"
                    >
                        <MetalFrame padding="32px" showBolts={true} showNeonStrips={true}>
                            <div className="offer-header">
                                <Sparkles size={48} className="sparkle-icon" />
                                <h2>DOUBLE OR NOTHING</h2>
                            </div>

                            <div className="stake-display">
                                <div className="stake-current">
                                    <span className="stake-label">Your Winnings</span>
                                    <span className="stake-value">
                                        <Gem size={20} /> {diamondsAtRisk}
                                    </span>
                                </div>
                                <div className="stake-arrow">→</div>
                                <div className="stake-potential">
                                    <span className="stake-label">If Correct</span>
                                    <span className="stake-value win">
                                        <Gem size={20} /> {diamondsAtRisk * 2}
                                    </span>
                                </div>
                            </div>

                            <div className="warning-box">
                                <AlertTriangle size={16} />
                                <span>Answer incorrectly and lose ALL {diamondsAtRisk} diamonds!</span>
                            </div>

                            <div className="offer-actions">
                                <HexButton
                                    label={`Risk ${diamondsAtRisk} for ${diamondsAtRisk * 2}`}
                                    onClick={handleAccept}
                                    variant="primary"
                                />
                                <HexButton
                                    label={`Keep ${diamondsAtRisk} Diamonds`}
                                    onClick={onDecline}
                                    variant="secondary"
                                />
                            </div>
                        </MetalFrame>
                    </motion.div>
                )}

                {stage === 'question' && question && (
                    <motion.div
                        key="question"
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -50 }}
                        className="don-modal"
                    >
                        <MetalFrame padding="24px" showBolts={true}>
                            <div className="risk-banner">
                                <Gem size={16} /> {diamondsAtRisk} diamonds at risk!
                            </div>

                            <p className="question-text">{question.question}</p>

                            <div className="answers-grid">
                                {question.options.map((option, idx) => {
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
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
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
                                        <Gem size={32} /> +{diamondsAtRisk * 2}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="result-icon lose">
                                        <X size={48} />
                                    </div>
                                    <h2 className="result-title lose">LOST IT ALL</h2>
                                    <div className="result-amount lose">
                                        <Gem size={32} /> -{diamondsAtRisk}
                                    </div>
                                </>
                            )}
                        </MetalFrame>
                    </motion.div>
                )}
            </AnimatePresence>

            <style jsx>{`
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
                    background: rgba(30, 41, 59, 0.8);
                    border: 2px solid rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                    cursor: pointer;
                    transition: all 0.2s ease;
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
            `}</style>
        </div>
    );
}

/**
 * ALL-IN MODE — High-risk, high-reward trivia
 * Stake your diamonds, 10-question quiz, 2x payout on 80%+
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Gem, AlertTriangle, Check, X, Zap, Target } from 'lucide-react';
import MetalFrame from '../ui/MetalFrame';
import HexButton from '../ui/HexButton';

const STAKE_PRESETS = [25, 50, 100, 250, 500];
const QUESTIONS_COUNT = 10;
const WIN_THRESHOLD = 0.8; // 80% correct to win
const PAYOUT_MULTIPLIER = 2;
const HOUSE_EDGE = 0.05; // 5% house edge

export default function AllInMode({
    questions = [],
    userDiamonds = 0,
    onComplete,
    onCancel
}) {
    const [stage, setStage] = useState('betting'); // betting, playing, result
    const [stakeAmount, setStakeAmount] = useState(25);
    const [customStake, setCustomStake] = useState('');
    const [currentIndex, setCurrentIndex] = useState(0);
    const [correctCount, setCorrectCount] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [isRevealing, setIsRevealing] = useState(false);
    const [gameOver, setGameOver] = useState(false);
    const [answers, setAnswers] = useState([]);

    // Phase 69: track pending setTimeouts so unmount cancels them. Without
    // this the 1-second reveal-and-advance setTimeout fired setState on
    // an unmounted component if the user navigated away mid-question.
    // Also a completedRef guard so the Continue button can't double-fire
    // onComplete on a fast double-click (which would double-credit /
    // double-deduct via the parent's handler).
    const _pendingTimeoutsRef = useRef(new Set());
    const _isMountedRef = useRef(true);
    const _completedRef = useRef(false);
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

    const currentQuestion = questions[currentIndex];
    const progress = (currentIndex / QUESTIONS_COUNT) * 100;
    const needCorrect = Math.ceil(QUESTIONS_COUNT * WIN_THRESHOLD);
    const maxWrong = QUESTIONS_COUNT - needCorrect;
    const wrongCount = currentIndex - correctCount;
    const canStillWin = wrongCount <= maxWrong;

    const handleAnswer = (answerIndex) => {
        if (isRevealing || gameOver) return;

        setSelectedAnswer(answerIndex);
        setIsRevealing(true);

        const isCorrect = answerIndex === currentQuestion.correct_index;
        setAnswers(prev => [...prev, { questionIndex: currentIndex, correct: isCorrect }]);

        // Phase 69: safeSetTimeout instead of setTimeout — was firing
        // setState/stage transitions on an unmounted component when user
        // navigated away mid-question.
        safeSetTimeout(() => {
            if (isCorrect) {
                setCorrectCount(prev => prev + 1);
            }

            // Check if game should end
            const newWrongCount = wrongCount + (isCorrect ? 0 : 1);
            const newCorrectCount = correctCount + (isCorrect ? 1 : 0);

            // Can't possibly win anymore
            if (newWrongCount > maxWrong) {
                setGameOver(true);
                setStage('result');
                return;
            }

            // Already won
            if (newCorrectCount >= needCorrect) {
                setGameOver(true);
                setStage('result');
                return;
            }

            // Next question
            if (currentIndex < QUESTIONS_COUNT - 1) {
                setCurrentIndex(prev => prev + 1);
                setSelectedAnswer(null);
                setIsRevealing(false);
            } else {
                setGameOver(true);
                setStage('result');
            }
        }, 1000);
    };

    const handleStartGame = () => {
        // Phase 54: parseInt('abc') returns NaN → NaN<10 and NaN>userDiamonds are
        // both false → balance check bypassed → setStakeAmount(NaN) → backend
        // gets corrupt stake. Now validate explicitly.
        const parsed = customStake ? parseInt(customStake, 10) : stakeAmount;
        const stake = Number.isFinite(parsed) ? parsed : 0;
        if (!Number.isFinite(stake) || stake < 10 || stake > userDiamonds) return;
        setStakeAmount(stake);
        setStage('playing');
    };

    const handleComplete = () => {
        // Phase 69: completedRef guard prevents double-fire of onComplete
        // on a fast double-click of the Continue button. Parent's
        // onComplete may credit/deduct diamonds; firing twice could
        // double-credit on win or double-deduct on bust.
        if (_completedRef.current) return;
        _completedRef.current = true;

        const won = correctCount >= needCorrect;
        const payout = won
            ? Math.floor(stakeAmount * PAYOUT_MULTIPLIER * (1 - HOUSE_EDGE))
            : 0;

        onComplete?.({
            won,
            stake: stakeAmount,
            payout,
            correctCount,
            totalQuestions: QUESTIONS_COUNT,
            accuracy: Math.round((correctCount / QUESTIONS_COUNT) * 100)
        });
    };

    // Betting Stage
    if (stage === 'betting') {
        return (
            <div className="all-in-mode">
                <MetalFrame padding="32px" showBolts={true} showNeonStrips={true}>
                    <div className="header">
                        <Zap size={48} className="header-icon" />
                        <h1>ALL-IN MODE</h1>
                        <p>High Risk, High Reward! Get 8/10 Correct To Double Your Stake.</p>
                    </div>

                    <div className="warning-box">
                        <AlertTriangle size={18} />
                        <span>You Will LOSE Your Entire Stake If You Score Below 80%!</span>
                    </div>

                    <div className="stake-section">
                        <h3>Choose Your Stake</h3>
                        <div className="stake-presets">
                            {STAKE_PRESETS.map((amount) => {
                                const canAfford = userDiamonds >= amount;
                                return (
                                    <button
                                        key={amount}
                                        className={`stake-btn ${stakeAmount === amount && !customStake ? 'selected' : ''} ${!canAfford ? 'disabled' : ''}`}
                                        onClick={() => {
                                            if (canAfford) {
                                                setStakeAmount(amount);
                                                setCustomStake('');
                                            }
                                        }}
                                        disabled={!canAfford}
                                    >
                                        <Gem size={16} />
                                        {amount}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="custom-stake">
                            <input
                                type="number"
                                placeholder="Custom Amount..."
                                value={customStake}
                                onChange={(e) => setCustomStake(e.target.value)}
                                min="10"
                                max={userDiamonds}
                            />
                        </div>
                    </div>

                    <div className="payout-preview">
                        <div className="payout-row">
                            <span>Your Stake:</span>
                            <span className="value">{customStake || stakeAmount} 💎</span>
                        </div>
                        <div className="payout-row win">
                            <span>If 80%+ Correct:</span>
                            <span className="value">
                                +{Math.floor((customStake || stakeAmount) * PAYOUT_MULTIPLIER * (1 - HOUSE_EDGE))} 💎
                            </span>
                        </div>
                        <div className="payout-row lose">
                            <span>If Below 80%:</span>
                            <span className="value">-{customStake || stakeAmount} 💎</span>
                        </div>
                    </div>

                    <div className="balance-display">
                        <Gem size={16} />
                        Your Balance: {userDiamonds}
                    </div>

                    <div className="action-buttons">
                        <HexButton
                            label="GO ALL-IN"
                            icon={Zap}
                            onClick={handleStartGame}
                            variant="primary"
                            size="lg"
                            fullWidth
                            disabled={(customStake || stakeAmount) > userDiamonds}
                        />
                        <HexButton
                            label="Cancel"
                            onClick={onCancel}
                            variant="secondary"
                        />
                    </div>
                </MetalFrame>

                <style>{`
                    .all-in-mode {
                        max-width: 500px;
                        margin: 0 auto;
                        padding: 20px;
                    }

                    .header {
                        text-align: center;
                        margin-bottom: 20px;
                    }

                    .header-icon {
                        color: #f97316;
                        margin-bottom: 12px;
                    }

                    .header h1 {
                        font-size: 28px;
                        font-weight: 700;
                        color: #fff;
                        margin: 0 0 8px 0;
                    }

                    .header p {
                        color: rgba(255, 255, 255, 0.6);
                        margin: 0;
                    }

                    .warning-box {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 14px;
                        background: rgba(239, 68, 68, 0.1);
                        border: 1px solid rgba(239, 68, 68, 0.3);
                        border-radius: 10px;
                        color: #ef4444;
                        font-size: 13px;
                        margin-bottom: 24px;
                    }

                    .stake-section {
                        margin-bottom: 20px;
                    }

                    .stake-section h3 {
                        font-size: 13px;
                        color: rgba(255, 255, 255, 0.6);
                        margin: 0 0 12px 0;
                        text-transform: uppercase;
                    }

                    .stake-presets {
                        display: flex;
                        gap: 8px;
                        flex-wrap: wrap;
                        margin-bottom: 12px;
                    }

                    .stake-btn {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        padding: 12px 16px;
                        background: rgba(0, 0, 0, 0.2);
                        border: 2px solid rgba(255, 255, 255, 0.1);
                        border-radius: 8px;
                        color: #fff;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                    }

                    .stake-btn:hover:not(.disabled) {
                        border-color: #f97316;
                    }

                    .stake-btn.selected {
                        border-color: #f97316;
                        background: rgba(249, 115, 22, 0.15);
                    }

                    .stake-btn.disabled {
                        opacity: 0.4;
                        cursor: not-allowed;
                    }

                    .custom-stake input {
                        width: 100%;
                        padding: 12px;
                        background: rgba(0, 0, 0, 0.2);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        border-radius: 8px;
                        color: #fff;
                        font-size: 16px;
                    }

                    .custom-stake input::placeholder {
                        color: rgba(255, 255, 255, 0.4);
                    }

                    .payout-preview {
                        background: rgba(0, 0, 0, 0.2);
                        border-radius: 12px;
                        padding: 16px;
                        margin-bottom: 16px;
                    }

                    .payout-row {
                        display: flex;
                        justify-content: space-between;
                        padding: 8px 0;
                        color: rgba(255, 255, 255, 0.7);
                    }

                    .payout-row .value {
                        font-weight: 700;
                        color: #fff;
                    }

                    .payout-row.win .value {
                        color: #22c55e;
                    }

                    .payout-row.lose .value {
                        color: #ef4444;
                    }

                    .balance-display {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        color: #00d4ff;
                        font-size: 14px;
                        margin-bottom: 20px;
                    }

                    .action-buttons {
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                    }
                `}</style>
            </div>
        );
    }

    // Playing Stage
    if (stage === 'playing' && currentQuestion) {
        return (
            <div className="all-in-game">
                {/* Progress */}
                <div className="game-header">
                    <div className="progress-bar">
                        <motion.div
                            className="progress-fill"
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                        />
                    </div>
                    <div className="stats-row">
                        <div className="stat">
                            <Check size={16} />
                            <span>{correctCount}/{needCorrect} needed</span>
                        </div>
                        <div className="stat">
                            <Target size={16} />
                            <span>Q{currentIndex + 1}/{QUESTIONS_COUNT}</span>
                        </div>
                        <div className="stat stake">
                            <Gem size={16} />
                            <span>{stakeAmount} at stake</span>
                        </div>
                    </div>
                </div>

                {/* Question */}
                <MetalFrame padding="24px" showBolts={false}>
                    <p className="question-text">{currentQuestion.question}</p>
                </MetalFrame>

                <div className="answers-grid">
                    {currentQuestion.options.map((option, idx) => {
                        const isSelected = selectedAnswer === idx;
                        const isCorrect = idx === currentQuestion.correct_index;
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

                {/* Can't win warning */}
                {!canStillWin && (
                    <div className="bust-warning">
                        <X size={20} />
                        Too many wrong answers - stake lost!
                    </div>
                )}

                <style>{`
                    .all-in-game {
                        max-width: 600px;
                        margin: 0 auto;
                        padding: 20px;
                    }

                    .game-header {
                        margin-bottom: 20px;
                    }

                    .progress-bar {
                        height: 8px;
                        background: rgba(255, 255, 255, 0.1);
                        border-radius: 4px;
                        overflow: hidden;
                        margin-bottom: 12px;
                    }

                    .progress-fill {
                        height: 100%;
                        background: linear-gradient(90deg, #f97316, #fbbf24);
                        border-radius: 4px;
                    }

                    .stats-row {
                        display: flex;
                        justify-content: space-between;
                    }

                    .stat {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        font-size: 13px;
                        color: rgba(255, 255, 255, 0.6);
                    }

                    .stat.stake {
                        color: #f97316;
                        font-weight: 600;
                    }

                    .question-text {
                        font-size: 18px;
                        font-weight: 600;
                        color: #fff;
                        text-align: center;
                        margin: 0;
                        line-height: 1.5;
                    }

                    .answers-grid {
                        display: grid;
                        gap: 10px;
                        margin-top: 20px;
                    }

                    .answer-btn {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        padding: 16px;
                        background: rgba(30, 41, 59, 0.8);
                        border: 2px solid rgba(255, 255, 255, 0.1);
                        border-radius: 12px;
                        cursor: pointer;
                        transition: all 0.2s;
                        text-align: left;
                    }

                    .answer-btn:hover:not(:disabled) {
                        border-color: #f97316;
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
                        width: 32px;
                        height: 32px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        background: rgba(255, 255, 255, 0.1);
                        border-radius: 8px;
                        font-weight: 700;
                        color: #fff;
                        flex-shrink: 0;
                    }

                    .answer-text {
                        font-size: 15px;
                        color: #fff;
                    }

                    .bust-warning {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 10px;
                        margin-top: 20px;
                        padding: 16px;
                        background: rgba(239, 68, 68, 0.15);
                        border: 1px solid rgba(239, 68, 68, 0.3);
                        border-radius: 10px;
                        color: #ef4444;
                        font-weight: 600;
                    }
                `}</style>
            </div>
        );
    }

    // Result Stage
    if (stage === 'result') {
        const won = correctCount >= needCorrect;
        const payout = won ? Math.floor(stakeAmount * PAYOUT_MULTIPLIER * (1 - HOUSE_EDGE)) : 0;
        const accuracy = Math.round((correctCount / QUESTIONS_COUNT) * 100);

        return (
            <div className="all-in-result">
                <MetalFrame padding="32px" showBolts={true}>
                    <div className={`result-header ${won ? 'win' : 'lose'}`}>
                        {won ? <Zap size={56} /> : <X size={56} />}
                        <h1>{won ? 'DOUBLED!' : 'BUSTED'}</h1>
                    </div>

                    <div className="result-stats">
                        <div className="stat-row">
                            <span>Accuracy</span>
                            <span className="value">{accuracy}%</span>
                        </div>
                        <div className="stat-row">
                            <span>Correct</span>
                            <span className="value">{correctCount}/{QUESTIONS_COUNT}</span>
                        </div>
                    </div>

                    <div className={`payout-box ${won ? 'win' : 'lose'}`}>
                        <Gem size={32} />
                        <span className="amount">
                            {won ? `+${payout}` : `-${stakeAmount}`}
                        </span>
                    </div>

                    <HexButton
                        label="Continue"
                        onClick={handleComplete}
                        variant="primary"
                        fullWidth
                    />
                </MetalFrame>

                <style>{`
                    .all-in-result {
                        max-width: 480px;
                        margin: 0 auto;
                        padding: 20px;
                        text-align: center;
                    }

                    .result-header {
                        margin-bottom: 24px;
                    }

                    .result-header.win { color: #22c55e; }
                    .result-header.lose { color: #ef4444; }

                    .result-header h1 {
                        font-size: 36px;
                        margin: 12px 0 0 0;
                    }

                    .result-stats {
                        background: rgba(0, 0, 0, 0.2);
                        border-radius: 12px;
                        padding: 16px;
                        margin-bottom: 20px;
                    }

                    .stat-row {
                        display: flex;
                        justify-content: space-between;
                        padding: 10px 0;
                        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                        color: rgba(255, 255, 255, 0.7);
                    }

                    .stat-row:last-child { border-bottom: none; }

                    .stat-row .value {
                        font-weight: 700;
                        color: #fff;
                    }

                    .payout-box {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 16px;
                        padding: 24px;
                        border-radius: 16px;
                        margin-bottom: 24px;
                    }

                    .payout-box.win {
                        background: rgba(34, 197, 94, 0.15);
                        border: 2px solid rgba(34, 197, 94, 0.3);
                        color: #22c55e;
                    }

                    .payout-box.lose {
                        background: rgba(239, 68, 68, 0.15);
                        border: 2px solid rgba(239, 68, 68, 0.3);
                        color: #ef4444;
                    }

                    .payout-box .amount {
                        font-size: 40px;
                        font-weight: 700;
                    }
                `}</style>
            </div>
        );
    }

    return null;
}

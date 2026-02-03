/**
 * FuturisticTriviaGame - Premium Metal HUD Trivia Interface
 * 
 * Features:
 * - Metallic beveled frame with cyan accents
 * - "TRIVIA CHALLENGE" header
 * - Circular countdown timer
 * - 2x2 grid answer buttons with metal styling
 * - Diamond-cost lifeline buttons
 * - Highlighted poker terminology
 */

import { useState, useEffect, useRef } from 'react';
import { Gem, Zap, SkipForward } from 'lucide-react';
import styles from './FuturisticTriviaGame.module.css';

// Highlight poker terms in question text
const highlightPokerTerms = (text) => {
    if (!text) return '';

    const terms = [
        'VILLAIN', 'HERO', 'BTN', 'BUTTON', 'SB', 'BB', 'UTG', 'MP', 'CO', 'HJ',
        'SMALL-BLIND', 'BIG-BLIND', 'CUTOFF', 'HIJACK', 'UNDER THE GUN',
        'ALL-IN', 'SHOVE', '3-BET', '4-BET', 'C-BET', 'CHECK-RAISE',
        'FLOP', 'TURN', 'RIVER', 'PREFLOP', 'POSTFLOP',
        'FOLD', 'CALL', 'RAISE', 'BET', 'CHECK',
        'GTO', 'ICM', 'EV', 'SPR', 'EQUITY', 'RANGE',
        'A♠', 'K♠', 'Q♠', 'J♠', 'T♠', 'A♥', 'K♥', 'Q♥', 'J♥', 'T♥',
        'A♦', 'K♦', 'Q♦', 'J♦', 'T♦', 'A♣', 'K♣', 'Q♣', 'J♣', 'T♣',
        'AA', 'KK', 'QQ', 'JJ', 'TT', 'AK', 'AQ', 'AJ', 'KQ',
    ];

    let result = text;
    terms.forEach(term => {
        const regex = new RegExp(`\\b(${term})\\b`, 'gi');
        result = result.replace(regex, '<span class="highlight">$1</span>');
    });

    // Handle card symbols with hearts/diamonds colored
    result = result.replace(/(T♥♥|[AKQJT2-9]+♥+)/g, '<span class="heart">$1</span>');
    result = result.replace(/(T♦♦|[AKQJT2-9]+♦+)/g, '<span class="diamond">$1</span>');

    return result;
};

export default function FuturisticTriviaGame({
    question,
    options = [],
    questionNumber = 1,
    totalQuestions = 10,
    category = 'POKER STRATEGY',
    timeLeft = 15,
    isTimerRunning = true,
    selectedAnswer = null,
    showResult = false,
    correctIndex = 0,
    onSelectAnswer,
    onUseFiftyFifty,
    onUseSkip,
    fiftyFiftyUsed = false,
    skipUsed = false,
    eliminatedOptions = [],
    userDiamonds = 0,
    lifelineCost = 5,
}) {
    const letters = ['A', 'B', 'C', 'D'];

    // Timer urgency state
    const timerUrgent = timeLeft <= 5;
    const timerCritical = timeLeft <= 3;

    return (
        <div className={styles.container}>
            {/* Outer Metal Frame */}
            <div className={styles.metalFrame}>

                {/* Header */}
                <div className={styles.header}>
                    <h1 className={styles.title}>TRIVIA CHALLENGE</h1>
                </div>

                {/* Progress Bar & Timer Row */}
                <div className={styles.progressRow}>
                    <div className={styles.progressBar}>
                        <div className={styles.progressTrack}>
                            <div
                                className={styles.progressFill}
                                style={{ width: `${(questionNumber / totalQuestions) * 100}%` }}
                            />
                        </div>
                        <span className={styles.progressText}>
                            Question {questionNumber} / {totalQuestions}
                        </span>
                    </div>

                    {/* Circular Timer */}
                    <div className={`${styles.timer} ${timerUrgent ? styles.timerUrgent : ''} ${timerCritical ? styles.timerCritical : ''}`}>
                        <svg className={styles.timerSvg} viewBox="0 0 60 60">
                            {/* Background circle */}
                            <circle
                                cx="30"
                                cy="30"
                                r="26"
                                fill="none"
                                stroke="rgba(6, 182, 212, 0.2)"
                                strokeWidth="4"
                            />
                            {/* Progress circle */}
                            <circle
                                cx="30"
                                cy="30"
                                r="26"
                                fill="none"
                                stroke={timerCritical ? '#ef4444' : timerUrgent ? '#fbbf24' : '#06b6d4'}
                                strokeWidth="4"
                                strokeLinecap="round"
                                strokeDasharray={`${(timeLeft / 24) * 163.36} 163.36`}
                                transform="rotate(-90 30 30)"
                                className={styles.timerCircle}
                            />
                        </svg>
                        <span className={styles.timerText}>{timeLeft}</span>
                    </div>
                </div>

                {/* Question Card */}
                <div className={styles.questionCard}>
                    {/* Category Badge */}
                    <div className={styles.categoryBadge}>
                        <span className={styles.categoryIcon}>◆</span>
                        <span>{category}</span>
                        <span className={styles.categoryIcon}>◆</span>
                    </div>

                    {/* Question Text */}
                    <p
                        className={styles.questionText}
                        dangerouslySetInnerHTML={{ __html: highlightPokerTerms(question) }}
                    />
                </div>

                {/* Answer Grid */}
                <div className={styles.answersGrid}>
                    {options.map((option, index) => {
                        const isEliminated = eliminatedOptions.includes(index);
                        const isSelected = selectedAnswer === index;
                        const isCorrect = showResult && index === correctIndex;
                        const isWrong = showResult && isSelected && index !== correctIndex;

                        let buttonClass = styles.answerButton;
                        if (isEliminated) buttonClass += ` ${styles.eliminated}`;
                        if (isSelected && !showResult) buttonClass += ` ${styles.selected}`;
                        if (isCorrect) buttonClass += ` ${styles.correct}`;
                        if (isWrong) buttonClass += ` ${styles.wrong}`;

                        return (
                            <button
                                key={index}
                                className={buttonClass}
                                onClick={() => onSelectAnswer?.(index)}
                                disabled={showResult || isEliminated}
                            >
                                <span className={styles.answerLetter}>{letters[index]}</span>
                                <span className={styles.answerText}>
                                    {isEliminated ? '—' : option}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Lifelines */}
                {!showResult && (
                    <div className={styles.lifelines}>
                        <button
                            className={`${styles.lifelineButton} ${fiftyFiftyUsed ? styles.lifelineUsed : ''}`}
                            onClick={onUseFiftyFifty}
                            disabled={fiftyFiftyUsed || userDiamonds < lifelineCost}
                        >
                            <Gem size={16} className={styles.lifelineIcon} />
                            <span className={styles.lifelineName}>50:50</span>
                            <span className={styles.lifelineCost}>
                                <Gem size={12} /> {lifelineCost}
                            </span>
                        </button>

                        <button
                            className={`${styles.lifelineButton} ${skipUsed ? styles.lifelineUsed : ''}`}
                            onClick={onUseSkip}
                            disabled={skipUsed || userDiamonds < lifelineCost}
                        >
                            <SkipForward size={16} className={styles.lifelineIcon} />
                            <span className={styles.lifelineName}>SKIP</span>
                            <span className={styles.lifelineCost}>
                                <Gem size={12} /> {lifelineCost}
                            </span>
                        </button>
                    </div>
                )}

                {/* Bottom Accent */}
                <div className={styles.bottomAccent} />
            </div>
        </div>
    );
}

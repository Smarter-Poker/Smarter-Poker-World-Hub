/**
 * 🎮 MTT DEEP STACK UI — Training Game Wrapper
 * ═══════════════════════════════════════════════════════════════════════════
 * Uses the Golden Template Table component for consistent UI
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import GoldenTemplateTable from '../../poker/GoldenTemplateTable';

export default function MTTDeepStackUI({
    question,
    questionNumber,
    totalQuestions,
    onAnswer,
    showFeedback,
    feedbackResult,
    explanation,
    viewMode = 'standard',
    timeLeft = 30,
}) {
    const scenario = question?.scenario || {};
    const options = question?.options || [];
    const questionText = question?.question || '';
    const correctAnswer = question?.correctAnswer;

    // Extract scenario data
    const heroStack = scenario?.heroStack || 45;
    const heroPosition = scenario?.heroPosition || 'BTN';
    const heroHand = scenario?.heroHand || 'AhKh';
    const pot = scenario?.pot || 0;
    const gameType = scenario?.gameType || 'Blind vs Blind';
    const board = scenario?.board || '';

    // Parse villain stacks (or use defaults)
    const villainStacks = scenario?.villainStacks || [32, 28, 55, 41, 38, 62, 29, 51];

    // Build descriptive question text
    const buildQuestionText = () => {
        if (questionText && !questionText.includes('GTO play')) {
            return questionText;
        }
        const posName = heroPosition === 'BTN' ? 'On The Button' :
            heroPosition === 'SB' ? 'In The Small Blind' :
                heroPosition === 'BB' ? 'In The Big Blind' : heroPosition;
        const action = scenario?.action || 'The Player To Your Right Bets 2.5 BB';
        return `You Are ${posName}. ${action}. What Is Your Best Move?`;
    };

    // Parse hero cards to array format ["Ah", "Kh"]
    const parseHeroCards = () => {
        if (!heroHand) return ['Ah', 'Kh'];
        const cards = [];
        for (let i = 0; i < heroHand.length; i += 2) {
            if (i + 1 < heroHand.length) {
                cards.push(heroHand.substring(i, i + 2));
            }
        }
        return cards.length > 0 ? cards : ['Ah', 'Kh'];
    };

    // Parse board cards
    const parseBoardCards = () => {
        if (!board) return [];
        const cards = [];
        for (let i = 0; i < board.length; i += 2) {
            if (i + 1 < board.length) {
                cards.push(board.substring(i, i + 2));
            }
        }
        return cards;
    };

    // Build players array for table
    const buildPlayers = () => {
        const players = [
            { id: 'hero', name: 'HERO', stack: heroStack, isFolded: false },
        ];
        for (let i = 0; i < 8; i++) {
            players.push({
                id: `v${i + 1}`,
                name: `Villain ${i + 1}`,
                stack: villainStacks[i] || 50,
                isFolded: false,
            });
        }
        return players;
    };

    const handleAnswer = (optionLetter) => {
        if (showFeedback) return;
        onAnswer(optionLetter);
    };

    const getButtonStyle = (optionLetter) => {
        if (!showFeedback) return styles.answerButton;
        if (optionLetter === correctAnswer) {
            return { ...styles.answerButton, ...styles.correctButton };
        }
        if (feedbackResult === 'wrong') {
            return { ...styles.answerButton, ...styles.wrongButton };
        }
        return styles.answerButton;
    };

    return (
        <div style={styles.container}>
            {/* Blue Question Bar - TOP */}
            <div style={styles.questionBar}>
                {buildQuestionText()}
            </div>

            {/* Golden Template Table - CENTER */}
            <div style={styles.tableWrapper}>
                <GoldenTemplateTable
                    players={buildPlayers()}
                    heroCards={parseHeroCards()}
                    communityCards={parseBoardCards()}
                    pot={pot}
                    dealerPosition={0}
                    timer={timeLeft}
                    questionNumber={questionNumber}
                    totalQuestions={totalQuestions}
                    gameTitle={gameType}
                />
            </div>

            {/* Answer Grid (2x2) - BOTTOM */}
            <div style={styles.answersGrid}>
                {options.map((option, index) => {
                    const optionLetter = String.fromCharCode(65 + index);
                    const optionText = typeof option === 'string' ? option : (option.text || option.label || 'Unknown');
                    return (
                        <motion.button
                            key={index}
                            onClick={() => handleAnswer(optionLetter)}
                            disabled={showFeedback}
                            style={getButtonStyle(optionLetter)}
                            whileHover={!showFeedback ? { scale: 1.02 } : {}}
                            whileTap={!showFeedback ? { scale: 0.98 } : {}}
                        >
                            {optionText}
                        </motion.button>
                    );
                })}
            </div>

            {/* Explanation (after answer) */}
            {showFeedback && explanation && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={styles.explanationBox}
                >
                    <div style={styles.explanationLabel}>
                        {feedbackResult === 'correct' ? '✅ Correct!' : '❌ Incorrect'}
                    </div>
                    <p style={styles.explanationText}>{explanation}</p>
                </motion.div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles = {
    container: {
        width: '100%',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#080810',
        fontFamily: "'Inter', sans-serif",
        overflow: 'hidden',
    },

    // Blue Question Bar - TOP
    questionBar: {
        width: '100%',
        padding: '12px 24px',
        background: 'linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%)',
        color: '#fbbf24',
        fontSize: '14px',
        fontWeight: '500',
        textAlign: 'center',
        borderBottom: '1px solid rgba(251, 191, 36, 0.3)',
        flexShrink: 0,
    },

    // Table Wrapper - FILLS AVAILABLE SPACE
    tableWrapper: {
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
    },

    // Answer Grid (2x2) - BOTTOM
    answersGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '8px',
        padding: '12px 16px',
        background: '#0a0a0f',
        flexShrink: 0,
    },
    answerButton: {
        padding: '14px 16px',
        background: 'linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%)',
        border: '1px solid rgba(59, 130, 246, 0.3)',
        borderRadius: '8px',
        color: '#fff',
        fontSize: '14px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },
    correctButton: {
        background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
        border: '1px solid #22c55e',
    },
    wrongButton: {
        background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
        border: '1px solid #ef4444',
    },

    // Explanation Box
    explanationBox: {
        margin: '0 16px 16px',
        padding: '12px 16px',
        background: 'rgba(55, 65, 81, 0.9)',
        borderRadius: '8px',
        border: '1px solid rgba(107, 114, 128, 0.3)',
        flexShrink: 0,
    },
    explanationLabel: { color: '#fff', fontWeight: '600', marginBottom: '4px' },
    explanationText: { color: '#d1d5db', fontSize: '13px', margin: 0 },
};

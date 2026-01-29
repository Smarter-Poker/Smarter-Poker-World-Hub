/**
 * 🎮 MTT DEEP STACK UI — Training Game Wrapper
 * ═══════════════════════════════════════════════════════════════════════════
 * Minimal wrapper that adds question bar and answer handling
 * Uses GoldenTemplateTable for the full 9-seat poker table display
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState } from 'react';
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

    // Parse villain stacks
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

    // Convert answer options to action handlers
    const handleFold = () => onAnswer('A');
    const handleCall = () => onAnswer('B');
    const handleRaise = () => onAnswer('C');
    const handleAllIn = () => onAnswer('D');

    return (
        <div style={styles.container}>
            {/* Blue Question Bar - TOP */}
            <div style={styles.questionBar}>
                {buildQuestionText()}
            </div>

            {/* Golden Template Table - FILLS REST OF SCREEN */}
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
                onFold={handleFold}
                onCall={handleCall}
                onRaise={handleRaise}
                onAllIn={handleAllIn}
            />

            {/* Explanation overlay (shown after answer) */}
            {showFeedback && explanation && (
                <motion.div
                    initial={{ opacity: 0, y: 50 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={styles.explanationOverlay}
                >
                    <div style={styles.explanationBox}>
                        <div style={styles.explanationLabel}>
                            {feedbackResult === 'correct' ? '✅ Correct!' : '❌ Incorrect'}
                        </div>
                        <p style={styles.explanationText}>{explanation}</p>
                    </div>
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

    // Blue Question Bar - TOP (minimal height)
    questionBar: {
        width: '100%',
        padding: '10px 20px',
        background: 'linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%)',
        color: '#fbbf24',
        fontSize: '13px',
        fontWeight: '500',
        textAlign: 'center',
        borderBottom: '1px solid rgba(251, 191, 36, 0.3)',
        flexShrink: 0,
        zIndex: 10,
    },

    // Explanation Overlay (appears over table)
    explanationOverlay: {
        position: 'absolute',
        bottom: 120,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '90%',
        maxWidth: 600,
        zIndex: 1000,
    },
    explanationBox: {
        padding: '16px 20px',
        background: 'rgba(20, 20, 30, 0.95)',
        borderRadius: '12px',
        border: '2px solid rgba(251, 191, 36, 0.4)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    },
    explanationLabel: {
        color: '#fbbf24',
        fontWeight: '700',
        marginBottom: '8px',
        fontSize: '16px',
    },
    explanationText: {
        color: '#e5e7eb',
        fontSize: '14px',
        margin: 0,
        lineHeight: 1.5,
    },
};

/**
 * 🎯 MTT DEEP STACK UI — Template-Based Training Layout
 * ═══════════════════════════════════════════════════════════════════════════
 * Layout Structure (matching template):
 * 1. Blue question bar at top
 * 2. Poker table visual in center with player stacks
 * 3. Hero labeled as "Hero X BB" (using actual data)
 * 4. 2x2 answer grid at bottom
 * 5. Timer on left, "Question X of 25" on right
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useTrainingSettings } from '../../../contexts/TrainingSettingsContext';

export default function MTTDeepStackUI({
    question,
    questionNumber = 1,
    totalQuestions = 25,
    onAnswer,
    showFeedback,
    feedbackResult
}) {
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [timeLeft, setTimeLeft] = useState(30); // 30 second timer
    const { viewMode } = useTrainingSettings();

    if (!question) return null;

    // Parse question data
    const {
        scenario,
        question: questionText,
        options = [],
        correctAnswer,
        explanation
    } = question;

    // Extract scenario data
    const heroStack = scenario?.heroStack || 150;
    const heroPosition = scenario?.heroPosition || 'BTN';
    const heroHand = scenario?.heroHand || 'AK';
    const board = scenario?.board || '';
    const pot = scenario?.pot || 0;
    const villainPosition = scenario?.villainPosition || 'BB';
    const villainStack = scenario?.villainStack || 100;
    const action = scenario?.action || '';
    const gameType = scenario?.gameType || '9-Max Tournament (MTT)';

    // Format question text for blue bar - BUILD FROM SCENARIO DATA
    const formatQuestionText = () => {
        if (typeof scenario === 'string') return scenario;

        // Build descriptive question from scenario data (like template)
        const posLabel = viewMode === 'standard' ? 'You Are' : 'Hero';
        const actionText = action || 'Action is on you';

        // Build question like: "You Are On The Button. The Player To Your Right Bets 2.5 BB. What Is Your Best Move?"
        let questionParts = [];

        if (heroPosition) {
            const positionName = heroPosition === 'BTN' ? 'On The Button' :
                heroPosition === 'SB' ? 'In The Small Blind' :
                    heroPosition === 'BB' ? 'In The Big Blind' :
                        `In ${heroPosition}`;
            questionParts.push(`${posLabel} ${positionName}`);
        }

        if (action) {
            questionParts.push(action);
        }

        questionParts.push('What Is Your Best Move?');

        return questionParts.join('. ');
    };

    const handleAnswer = (optionLetter) => {
        if (showFeedback) return;
        setSelectedAnswer(optionLetter);
        onAnswer(optionLetter);
    };

    const getButtonStyle = (optionLetter) => {
        let style = { ...styles.answerButton };

        if (showFeedback) {
            if (optionLetter === correctAnswer) {
                style = { ...style, ...styles.answerButtonCorrect };
            } else if (optionLetter === selectedAnswer) {
                style = { ...style, ...styles.answerButtonWrong };
            }
        } else if (optionLetter === selectedAnswer) {
            style = { ...style, ...styles.answerButtonSelected };
        }

        return style;
    };

    return (
        <div style={styles.container}>
            {/* Question Bar (Blue) - TOP */}
            <div style={styles.questionBar}>
                {formatQuestionText()}
            </div>

            {/* Poker Table Visual - CENTER */}
            <div style={styles.tableContainer}>
                {/* Table Background */}
                <div style={styles.pokerTable}>
                    {/* Pot Display */}
                    {pot > 0 && (
                        <div style={styles.potDisplay}>
                            <div style={styles.potLabel}>POT: {pot}</div>
                        </div>
                    )}

                    {/* Board Cards (if available) */}
                    {board && (
                        <div style={styles.boardDisplay}>
                            <div style={styles.boardLabel}>Blind vs Blind</div>
                            <div style={styles.boardSubtext}>Smarter.Poker</div>
                        </div>
                    )}

                    {/* Villain Players (simplified - showing key villain) */}
                    <div style={styles.villainContainer}>
                        <div style={styles.playerBox}>
                            <div style={styles.playerAvatar}>🎩</div>
                            <div style={styles.playerLabel}>
                                <div style={styles.playerName}>Villain {villainPosition}</div>
                                <div style={styles.playerStack}>{villainStack} BB</div>
                            </div>
                        </div>
                    </div>

                    {/* Hero (Bottom Center) */}
                    <div style={styles.heroContainer}>
                        <div style={styles.heroBox}>
                            <div style={styles.heroAvatar}>👤</div>
                            <div style={styles.heroLabel}>
                                <div style={styles.heroName}>Hero</div>
                                <div style={styles.heroStack}>{heroStack} BB</div>
                            </div>
                        </div>
                        {/* Hero Cards - Using Real Card Images */}
                        {heroHand && (
                            <div style={styles.heroCards}>
                                {(() => {
                                    // Parse heroHand: "AhKs" = Ace of hearts, King of spades
                                    // Split into pairs: ["Ah", "Ks"]
                                    const cards = [];
                                    for (let i = 0; i < heroHand.length; i += 2) {
                                        if (i + 1 < heroHand.length) {
                                            cards.push(heroHand.substring(i, i + 2));
                                        }
                                    }

                                    return cards.map((card, i) => {
                                        // Parse card: "Ah" = rank "A", suit "h"
                                        const rank = card[0].toLowerCase();
                                        const suitChar = card[1].toLowerCase();

                                        // Map suit character to full name
                                        const suitMap = {
                                            'h': 'hearts',
                                            'd': 'diamonds',
                                            'c': 'clubs',
                                            's': 'spades'
                                        };
                                        const suit = suitMap[suitChar] || 'hearts';

                                        // Map rank to card file name
                                        const rankMap = {
                                            'a': 'a', 'k': 'k', 'q': 'q', 'j': 'j',
                                            't': '10', '9': '9', '8': '8', '7': '7',
                                            '6': '6', '5': '5', '4': '4', '3': '3', '2': '2'
                                        };
                                        const cardRank = rankMap[rank] || rank;

                                        const cardImage = `/cards/${suit}_${cardRank}.png`;

                                        return (
                                            <img
                                                key={i}
                                                src={cardImage}
                                                alt={`${cardRank} of ${suit}`}
                                                style={styles.cardImage}
                                            />
                                        );
                                    });
                                })()}
                            </div>
                        )}
                    </div>
                </div>

                {/* Timer (Left) and Question Counter (Right) */}
                <div style={styles.bottomRow}>
                    <div style={styles.timer}>{timeLeft}</div>
                    <div style={styles.questionCounter}>
                        Question {questionNumber} of {totalQuestions}
                    </div>
                </div>
            </div>

            {/* Answer Grid (2x2) - BOTTOM */}
            <div style={styles.answersGrid}>
                {options.map((option, index) => {
                    const optionLetter = String.fromCharCode(65 + index); // A, B, C, D
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

            {/* Explanation (shown after answer) */}
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
// STYLES - Matching Template Layout
// ═══════════════════════════════════════════════════════════════════════════

const styles = {
    container: {
        width: '100%',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#000',
        fontFamily: "'Inter', sans-serif",
        overflow: 'hidden',
    },

    // Question Bar (Blue) - TOP
    questionBar: {
        width: '100%',
        padding: '16px 24px',
        background: 'linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%)',
        color: '#00d4ff',
        fontSize: '16px',
        fontWeight: '600',
        textAlign: 'center',
        borderBottom: '2px solid rgba(0, 212, 255, 0.3)',
    },

    // Poker Table - CENTER
    tableContainer: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '20px',
        position: 'relative',
    },

    pokerTable: {
        width: '100%',
        maxWidth: '1000px',
        height: '100%',
        maxHeight: '500px',
        backgroundImage: 'url(/images/poker-table-transparent.png)',
        backgroundSize: 'contain',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Pot Display (Center)
    potDisplay: {
        position: 'absolute',
        top: '30%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 2,
    },

    potLabel: {
        background: 'rgba(0,0,0,0.8)',
        color: '#fff',
        padding: '6px 12px',
        borderRadius: '20px',
        fontSize: '14px',
        fontWeight: '700',
        border: '1px solid rgba(255,255,255,0.3)',
    },

    // Board Display
    boardDisplay: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
        zIndex: 1,
    },

    boardLabel: {
        color: '#fff',
        fontSize: '18px',
        fontWeight: '700',
        marginBottom: '4px',
    },

    boardSubtext: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: '12px',
    },

    // Villain Container (Top)
    villainContainer: {
        position: 'absolute',
        top: '10%',
        left: '50%',
        transform: 'translateX(-50%)',
    },

    playerBox: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
    },

    playerAvatar: {
        width: '60px',
        height: '60px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #4a5568, #2d3748)',
        border: '3px solid #d4af37',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '32px',
    },

    playerLabel: {
        background: 'rgba(212, 175, 55, 0.9)',
        padding: '6px 12px',
        borderRadius: '8px',
        border: '2px solid #d4af37',
        textAlign: 'center',
    },

    playerName: {
        color: '#000',
        fontSize: '12px',
        fontWeight: '700',
    },

    playerStack: {
        color: '#000',
        fontSize: '14px',
        fontWeight: '900',
    },

    // Hero Container (Bottom)
    heroContainer: {
        position: 'absolute',
        bottom: '5%',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
    },

    heroBox: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
    },

    heroAvatar: {
        width: '70px',
        height: '70px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #3b82f6, #1e40af)',
        border: '3px solid #d4af37',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '36px',
    },

    heroLabel: {
        background: 'rgba(212, 175, 55, 0.95)',
        padding: '8px 16px',
        borderRadius: '8px',
        border: '2px solid #d4af37',
        textAlign: 'center',
    },

    heroName: {
        color: '#000',
        fontSize: '14px',
        fontWeight: '700',
    },

    heroStack: {
        color: '#000',
        fontSize: '16px',
        fontWeight: '900',
    },

    // Hero Cards
    heroCards: {
        display: 'flex',
        gap: '8px',
    },

    cardImage: {
        width: '60px',
        height: 'auto',
        borderRadius: '6px',
        boxShadow: '0 4px 8px rgba(0,0,0,0.4)',
    },

    // Bottom Row (Timer + Question Counter)
    bottomRow: {
        width: '90%',
        maxWidth: '800px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: '20px',
    },

    timer: {
        width: '60px',
        height: '60px',
        background: 'linear-gradient(135deg, #ef4444, #dc2626)',
        border: '3px solid #fca5a5',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '28px',
        fontWeight: '900',
        color: '#fff',
    },

    questionCounter: {
        background: 'rgba(0,0,0,0.8)',
        color: '#fff',
        padding: '12px 20px',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: '600',
        border: '1px solid rgba(255,255,255,0.3)',
    },

    // Answer Grid (2x2) - BOTTOM
    answersGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px',
        padding: '20px',
        background: 'rgba(0,0,0,0.5)',
        borderTop: '2px solid rgba(255,255,255,0.1)',
    },

    answerButton: {
        padding: '20px',
        background: 'linear-gradient(135deg, #1e40af, #1e3a8a)',
        border: '2px solid #3b82f6',
        borderRadius: '12px',
        color: '#fff',
        fontSize: '16px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s',
        textAlign: 'center',
    },

    answerButtonSelected: {
        background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
        border: '2px solid #a855f7',
    },

    answerButtonCorrect: {
        background: 'linear-gradient(135deg, #16a34a, #15803d)',
        border: '2px solid #22c55e',
    },

    answerButtonWrong: {
        background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
        border: '2px solid #ef4444',
    },

    // Explanation
    explanationBox: {
        padding: '20px',
        background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(147, 51, 234, 0.1))',
        borderTop: '2px solid rgba(168, 85, 247, 0.5)',
        color: '#e2e8f0',
    },

    explanationLabel: {
        fontSize: '16px',
        fontWeight: '700',
        marginBottom: '8px',
    },

    explanationText: {
        fontSize: '14px',
        lineHeight: 1.6,
        margin: 0,
    },
};

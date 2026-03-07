/* ═══════════════════════════════════════════════════════════════════════════
   🎯 SPOT TRAINER — Full Hand Tree Training (Preflop → River)
   Multi-street decision scenarios with EV comparison
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';

// Supabase services for persistence
import gameSessionService from '../services/GameSessionService';
import achievementService from '../services/AchievementService';
import leaderboardService from '../services/LeaderboardService';
import { processGameResult } from './ELOService';

// ═══════════════════════════════════════════════════════════════════════════
// SPOT SCENARIOS — Full hand trees with multi-street decisions
// ═══════════════════════════════════════════════════════════════════════════
const SPOT_SCENARIOS = [
    {
        id: 'spot-1',
        title: 'BTN vs BB Single Raised Pot',
        format: 'Cash 6-max 100BB',
        streets: [
            {
                street: 'preflop',
                description: 'Hero Opens BTN to 2.5BB. BB Calls.',
                pot: 5.5,
                heroStack: 97.5,
                villainStack: 97.5,
                board: [],
                options: [
                    { action: 'Continue', correct: true, ev: 0 },
                ],
                explanation: 'Standard open. Proceed to flop.',
            },
            {
                street: 'flop',
                description: 'Flop (Pot: 5.5BB)',
                pot: 5.5,
                heroStack: 97.5,
                villainStack: 97.5,
                board: ['Kh', '7c', '2d'],
                heroHand: ['Ac', 'Qd'],
                options: [
                    { action: 'Check', correct: false, ev: -0.3 },
                    { action: 'Bet 33%', correct: true, ev: 0.8 },
                    { action: 'Bet 75%', correct: false, ev: 0.4 },
                ],
                explanation: 'AQo has good equity and benefits from protection. Bet small for value and to deny equity.',
            },
            {
                street: 'turn',
                description: 'BB Calls. Turn (Pot: 9.2BB)',
                pot: 9.2,
                heroStack: 95.7,
                villainStack: 95.7,
                board: ['Kh', '7c', '2d', 'Jh'],
                heroHand: ['Ac', 'Qd'],
                options: [
                    { action: 'Check', correct: true, ev: 0.2 },
                    { action: 'Bet 50%', correct: false, ev: -0.1 },
                    { action: 'Bet 75%', correct: false, ev: -0.4 },
                ],
                explanation: 'Turn brings backdoor flush. With AQ high, checking is best to control pot and realize equity.',
            },
            {
                street: 'river',
                description: 'Both Check. River (Pot: 9.2BB)',
                pot: 9.2,
                heroStack: 95.7,
                villainStack: 95.7,
                board: ['Kh', '7c', '2d', 'Jh', '4s'],
                heroHand: ['Ac', 'Qd'],
                options: [
                    { action: 'Check', correct: true, ev: 0.3 },
                    { action: 'Bet 33%', correct: false, ev: -0.2 },
                    { action: 'Bet 75%', correct: false, ev: -0.8 },
                ],
                explanation: 'Brick river. AQ high has showdown value but limited betting value. Check to realize equity.',
            },
        ],
    },
    {
        id: 'spot-2',
        title: 'CO 3-bet vs UTG Open',
        format: 'Cash 6-max 100BB',
        streets: [
            {
                street: 'preflop',
                description: 'UTG Opens to 2.5BB. Hero in CO with KK. What is Your Action?',
                pot: 4,
                heroStack: 100,
                villainStack: 97.5,
                board: [],
                heroHand: ['Ks', 'Kd'],
                options: [
                    { action: 'Call', correct: false, ev: 1.2 },
                    { action: '3-bet to 8BB', correct: true, ev: 2.8 },
                    { action: '3-bet to 10BB', correct: false, ev: 2.4 },
                    { action: 'Fold', correct: false, ev: 0 },
                ],
                explanation: 'KK is a clear 3-bet for value. Standard sizing is ~3x the open.',
            },
            {
                street: 'flop',
                description: 'UTG Calls. Flop (Pot: 17BB)',
                pot: 17,
                heroStack: 92,
                villainStack: 89.5,
                board: ['Qc', '8h', '3d'],
                heroHand: ['Ks', 'Kd'],
                options: [
                    { action: 'Check', correct: false, ev: 1.5 },
                    { action: 'Bet 33%', correct: true, ev: 3.2 },
                    { action: 'Bet 75%', correct: false, ev: 2.1 },
                ],
                explanation: 'On a dry board, we have an overpair. Small bet builds pot while keeping dominated hands in.',
            },
            {
                street: 'turn',
                description: 'UTG Calls. Turn (Pot: 28.2BB)',
                pot: 28.2,
                heroStack: 86.4,
                villainStack: 83.9,
                board: ['Qc', '8h', '3d', '5s'],
                heroHand: ['Ks', 'Kd'],
                options: [
                    { action: 'Check', correct: false, ev: 2.8 },
                    { action: 'Bet 50%', correct: true, ev: 4.5 },
                    { action: 'Bet 75%', correct: false, ev: 3.9 },
                ],
                explanation: 'Continue building the pot. Villain likely has Qx or pocket pair. Extract value.',
            },
            {
                street: 'river',
                description: 'UTG Calls. River (Pot: 56.3BB)',
                pot: 56.3,
                heroStack: 72.3,
                villainStack: 69.8,
                board: ['Qc', '8h', '3d', '5s', '2c'],
                heroHand: ['Ks', 'Kd'],
                options: [
                    { action: 'Check', correct: false, ev: 3.5 },
                    { action: 'Bet 50%', correct: true, ev: 7.2 },
                    { action: 'All-in', correct: false, ev: 4.8 },
                ],
                explanation: 'River is a blank. Continue value betting. Villain calls with worse often enough.',
            },
        ],
    },
    {
        id: 'spot-3',
        title: 'BB Defense vs SB 3-bet',
        format: 'Cash 6-max 100BB',
        streets: [
            {
                street: 'preflop',
                description: 'SB 3-bets to 9BB. Hero in BB with JTs. Action?',
                pot: 10,
                heroStack: 99,
                villainStack: 91,
                board: [],
                heroHand: ['Jh', 'Th'],
                options: [
                    { action: 'Fold', correct: false, ev: 0 },
                    { action: 'Call', correct: true, ev: 0.5 },
                    { action: '4-bet to 22BB', correct: false, ev: -1.2 },
                ],
                explanation: 'JTs is too strong to fold and has great playability. Call and see a flop.',
            },
            {
                street: 'flop',
                description: 'Flop (Pot: 18BB)',
                pot: 18,
                heroStack: 91,
                villainStack: 91,
                board: ['9h', '8c', '2h'],
                heroHand: ['Jh', 'Th'],
                options: [
                    { action: 'Check-call', correct: true, ev: 2.3 },
                    { action: 'Check-raise', correct: false, ev: 1.1 },
                    { action: 'Lead bet', correct: false, ev: 0.2 },
                ],
                explanation: 'We have an open-ended straight draw + backdoor flush. Check-call to continue drawing.',
            },
            {
                street: 'turn',
                description: 'SB Bets 9BB. Hero Calls. Turn (Pot: 36BB)',
                pot: 36,
                heroStack: 82,
                villainStack: 82,
                board: ['9h', '8c', '2h', 'Qd'],
                heroHand: ['Jh', 'Th'],
                options: [
                    { action: 'Check-fold', correct: false, ev: 0 },
                    { action: 'Check-call', correct: true, ev: 1.8 },
                    { action: 'Lead bet', correct: false, ev: -0.5 },
                ],
                explanation: 'We now have a straight! Check to let villain continue betting.',
            },
            {
                street: 'river',
                description: 'SB Bets 18BB. Hero Calls. River (Pot: 72BB)',
                pot: 72,
                heroStack: 64,
                villainStack: 64,
                board: ['9h', '8c', '2h', 'Qd', '5s'],
                heroHand: ['Jh', 'Th'],
                options: [
                    { action: 'Check', correct: false, ev: 5.0 },
                    { action: 'Bet 50%', correct: false, ev: 6.2 },
                    { action: 'Check-raise all-in', correct: true, ev: 11.5 },
                ],
                explanation: 'We have the nuts! Check-raise all-in to maximize value from villain\'s made hands.',
            },
        ],
    },
    {
        id: 'spot-4',
        title: 'Blind vs Blind Battle',
        format: 'MTT 25BB',
        streets: [
            {
                street: 'preflop',
                description: 'SB (Hero) Opens to 2.5BB. BB 3-bets to 7BB. Hero with A5s.',
                pot: 9.5,
                heroStack: 22.5,
                villainStack: 18,
                board: [],
                heroHand: ['As', '5s'],
                options: [
                    { action: 'Fold', correct: false, ev: 0 },
                    { action: 'Call', correct: false, ev: -0.3 },
                    { action: '4-bet all-in', correct: true, ev: 1.5 },
                ],
                explanation: 'A5s is perfect for 4-bet jamming. Good blockers, playability, and fold equity.',
            },
        ],
    },
    {
        id: 'spot-5',
        title: 'Multiway Pot with Overpair',
        format: 'Cash 6-max 100BB',
        streets: [
            {
                street: 'preflop',
                description: 'UTG Opens, MP Calls, Hero in CO with QQ 3-bets to 12BB. UTG Calls, MP Folds.',
                pot: 27.5,
                heroStack: 88,
                villainStack: 88,
                board: [],
                heroHand: ['Qs', 'Qc'],
                options: [
                    { action: 'Continue', correct: true, ev: 0 },
                ],
                explanation: 'Proceed to flop.',
            },
            {
                street: 'flop',
                description: 'Flop (Pot: 27.5BB)',
                pot: 27.5,
                heroStack: 88,
                villainStack: 88,
                board: ['Jc', '7h', '4d'],
                heroHand: ['Qs', 'Qc'],
                options: [
                    { action: 'Check', correct: false, ev: 2.5 },
                    { action: 'Bet 33%', correct: true, ev: 4.8 },
                    { action: 'Bet 75%', correct: false, ev: 3.2 },
                ],
                explanation: 'Dry flop with overpair. Bet small for value and protection against draws.',
            },
            {
                street: 'turn',
                description: 'UTG Calls. Turn (Pot: 45.9BB)',
                pot: 45.9,
                heroStack: 79,
                villainStack: 79,
                board: ['Jc', '7h', '4d', 'Tc'],
                heroHand: ['Qs', 'Qc'],
                options: [
                    { action: 'Check', correct: false, ev: 3.8 },
                    { action: 'Bet 50%', correct: true, ev: 6.5 },
                    { action: 'Bet pot', correct: false, ev: 4.1 },
                ],
                explanation: 'Turn brings a club draw. Continue betting for value—we still beat most of villain\'s range.',
            },
            {
                street: 'river',
                description: 'UTG Calls. River (Pot: 91.8BB)',
                pot: 91.8,
                heroStack: 56,
                villainStack: 56,
                board: ['Jc', '7h', '4d', 'Tc', '2h'],
                heroHand: ['Qs', 'Qc'],
                options: [
                    { action: 'Check', correct: true, ev: 5.2 },
                    { action: 'Bet 33%', correct: false, ev: 4.8 },
                    { action: 'Bet 75%', correct: false, ev: 2.1 },
                ],
                explanation: 'River is a blank but villain called twice. Check to control pot—better hands raise, worse fold.',
            },
        ],
    },
    {
        id: 'spot-6',
        title: 'Flush Draw on Wet Board',
        format: 'Cash 6-max 100BB',
        streets: [
            {
                street: 'preflop',
                description: 'CO Opens, Hero on BTN Calls with Suited Connectors.',
                pot: 5.5,
                heroStack: 97.5,
                villainStack: 97.5,
                board: [],
                heroHand: ['8h', '7h'],
                options: [
                    { action: 'Continue', correct: true, ev: 0 },
                ],
                explanation: 'Standard call in position.',
            },
            {
                street: 'flop',
                description: 'Flop (Pot: 5.5BB)',
                pot: 5.5,
                heroStack: 97.5,
                villainStack: 97.5,
                board: ['Kh', '5h', '2c'],
                heroHand: ['8h', '7h'],
                options: [
                    { action: 'Fold', correct: false, ev: 0 },
                    { action: 'Call', correct: true, ev: 1.8 },
                    { action: 'Raise', correct: false, ev: 0.5 },
                ],
                explanation: 'Flush draw with position. Call and see the turn.',
            },
            {
                street: 'turn',
                description: 'CO Bets 2.7BB, Hero Calls. Turn (Pot: 10.9BB)',
                pot: 10.9,
                heroStack: 94.8,
                villainStack: 94.8,
                board: ['Kh', '5h', '2c', '3h'],
                heroHand: ['8h', '7h'],
                options: [
                    { action: 'Check-call', correct: false, ev: 4.5 },
                    { action: 'Check-raise all-in', correct: false, ev: 6.2 },
                    { action: 'Bet 75%', correct: true, ev: 8.8 },
                ],
                explanation: 'FLUSH! We made it. Lead out for value—villain will pay off with Kx.',
            },
            {
                street: 'river',
                description: 'CO Calls. River (Pot: 27.3BB)',
                pot: 27.3,
                heroStack: 86.6,
                villainStack: 86.6,
                board: ['Kh', '5h', '2c', '3h', 'Qs'],
                heroHand: ['8h', '7h'],
                options: [
                    { action: 'Check', correct: false, ev: 8.5 },
                    { action: 'Bet 50%', correct: true, ev: 12.3 },
                    { action: 'Bet pot', correct: false, ev: 9.1 },
                ],
                explanation: 'Continue value betting the flush. 50% sizing gets called by Kx and worse flushes.',
            },
        ],
    },
];

// Card display component
const CardDisplay = ({ cards, size = 'medium' }) => {
    const sizeStyles = {
        small: { width: 28, height: 40, fontSize: 12 },
        medium: { width: 40, height: 56, fontSize: 16 },
        large: { width: 52, height: 72, fontSize: 20 },
    };
    const style = sizeStyles[size];

    const getSuitColor = (suit) => {
        if (suit === 'h' || suit === 'd') return '#ff4444';
        return '#111';
    };

    const getSuitSymbol = (suit) => {
        const symbols = { h: '♥', d: '♦', c: '♣', s: '♠' };
        return symbols[suit] || suit;
    };

    if (!cards || cards.length === 0) return null;

    return (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            {cards.map((card, idx) => {
                const rank = card.slice(0, -1);
                const suit = card.slice(-1);
                return (
                    <div
                        key={idx}
                        style={{
                            width: style.width,
                            height: style.height,
                            background: 'linear-gradient(135deg, #fff, #f0f0f0)',
                            borderRadius: 6,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: style.fontSize,
                            fontWeight: 700,
                            color: getSuitColor(suit),
                            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                            border: '1px solid rgba(0,0,0,0.1)',
                        }}
                    >
                        <span>{rank}</span>
                        <span style={{ fontSize: style.fontSize * 0.8 }}>{getSuitSymbol(suit)}</span>
                    </div>
                );
            })}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// SPOT TRAINER COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function SpotTrainerGame({ onExit, onScoreUpdate, DiamondEngine, userId }) {
    const [currentSpotIndex, setCurrentSpotIndex] = useState(0);
    const [currentStreetIndex, setCurrentStreetIndex] = useState(0);
    const [selectedOption, setSelectedOption] = useState(null);
    const [showResult, setShowResult] = useState(false);
    const [score, setScore] = useState(0);
    const [correctAnswers, setCorrectAnswers] = useState(0);
    const [totalAnswers, setTotalAnswers] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    const [streakCount, setStreakCount] = useState(0);

    const currentSpot = SPOT_SCENARIOS[currentSpotIndex];
    const currentStreet = currentSpot?.streets[currentStreetIndex];

    const handleOptionSelect = (option, index) => {
        if (showResult) return;

        setSelectedOption(index);
        setShowResult(true);
        setTotalAnswers(prev => prev + 1);

        if (option.correct) {
            const basePoints = 100;
            const evBonus = Math.max(0, Math.round(option.ev * 20));
            const streakBonus = streakCount * 10;
            const pointsEarned = basePoints + evBonus + streakBonus;

            setScore(prev => prev + pointsEarned);
            setCorrectAnswers(prev => prev + 1);
            setStreakCount(prev => prev + 1);

            if (streakCount >= 4) {
                confetti({
                    particleCount: 50,
                    spread: 60,
                    origin: { y: 0.7 }
                });
            }
        } else {
            setStreakCount(0);
        }
    };

    const handleNext = () => {
        setSelectedOption(null);
        setShowResult(false);

        // Check if there are more streets in this spot
        if (currentStreetIndex < currentSpot.streets.length - 1) {
            setCurrentStreetIndex(prev => prev + 1);
        }
        // Check if there are more spots
        else if (currentSpotIndex < SPOT_SCENARIOS.length - 1) {
            setCurrentSpotIndex(prev => prev + 1);
            setCurrentStreetIndex(0);
        }
        // Game over
        else {
            setGameOver(true);

            // Award diamonds based on performance
            const accuracy = (correctAnswers / totalAnswers) * 100;
            const diamondsEarned = accuracy >= 70 ? Math.round(accuracy / 10) : 0;
            if (diamondsEarned > 0 && DiamondEngine) {
                DiamondEngine.award(diamondsEarned);
                onScoreUpdate?.(DiamondEngine.getBalance());
            }

            // ═══════════════════════════════════════════════════════════════════════════
            // 📊 PERSIST TO SUPABASE — Session, ELO, Leaderboard, Achievements
            // ═══════════════════════════════════════════════════════════════════════════
            if (userId) {
                const gameMode = 'spot_trainer';
                const finalScore = score + (accuracy >= 70 ? 100 : 0);

                // 1. Update leaderboard (only if passed)
                if (accuracy >= 70) {
                    leaderboardService.updateLeaderboard(
                        userId,
                        gameMode,
                        1, // level
                        finalScore,
                        accuracy,
                        0, // timeTaken (not timed)
                        null // sessionId
                    ).then(res => {
                        console.log('[SpotTrainer] Leaderboard updated:', res);
                    }).catch(err => {
                        console.warn('[SpotTrainer] Leaderboard update failed:', err);
                    });
                }

                // 2. Update ELO rating
                processGameResult(userId, 1, accuracy, 0)
                    .then(eloResult => {
                        console.log('[SpotTrainer] ELO updated:', eloResult);
                    }).catch(err => {
                        console.warn('[SpotTrainer] ELO update failed:', err);
                    });

                // 3. Record game session for analytics
                gameSessionService.recordSession(userId, {
                    gameMode,
                    level: 1,
                    scenarioId: SPOT_SCENARIOS[0]?.id,
                    score: finalScore,
                    accuracy,
                    timeTaken: 0,
                    diamondsSpent: 0,
                    diamondsEarned,
                    completed: true
                }).then(sessionResult => {
                    console.log('[SpotTrainer] Session recorded:', sessionResult);
                }).catch(err => {
                    console.warn('[SpotTrainer] Session recording failed:', err);
                });

                // 4. Check and unlock achievements
                achievementService.checkAndUnlock(userId, {
                    gamesPlayed: 1,
                    accuracy,
                    timeTaken: 0,
                    level: 1,
                    gameMode,
                    totalDiamonds: DiamondEngine?.getBalance() || 0,
                    aiScenariosCompleted: 0,
                    currentStreak: streakCount,
                    modesPlayed: [gameMode]
                }).then(unlocked => {
                    if (unlocked.length > 0) {
                        console.log('[SpotTrainer] Achievements unlocked:', unlocked);
                    }
                }).catch(err => {
                    console.warn('[SpotTrainer] Achievement check failed:', err);
                });
            }
        }
    };

    const getStreetColor = (street) => {
        const colors = {
            preflop: '#9333EA',
            flop: '#22C55E',
            turn: '#3B82F6',
            river: '#EF4444',
        };
        return colors[street] || '#00D4FF';
    };

    if (!currentSpot) {
        return (
            <div style={styles.container}>
                <p style={{ color: '#fff', textAlign: 'center' }}>No Spots Available</p>
            </div>
        );
    }

    if (gameOver) {
        const accuracy = totalAnswers > 0 ? Math.round((correctAnswers / totalAnswers) * 100) : 0;
        const grade = accuracy >= 90 ? 'A+' : accuracy >= 80 ? 'A' : accuracy >= 70 ? 'B' : accuracy >= 60 ? 'C' : 'D';

        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                style={styles.container}
            >
                <div style={styles.gameOverCard}>
                    <div style={{ fontSize: 64, marginBottom: 16 }}>🎯</div>
                    <h2 style={styles.gameOverTitle}>SPOT TRAINER COMPLETE!</h2>

                    <div style={styles.statsGrid}>
                        <div style={styles.statBox}>
                            <div style={styles.statValue}>{score}</div>
                            <div style={styles.statLabel}>Total Score</div>
                        </div>
                        <div style={styles.statBox}>
                            <div style={{ ...styles.statValue, color: accuracy >= 70 ? '#00ff88' : '#ff4444' }}>
                                {accuracy}%
                            </div>
                            <div style={styles.statLabel}>Accuracy</div>
                        </div>
                        <div style={styles.statBox}>
                            <div style={styles.statValue}>{grade}</div>
                            <div style={styles.statLabel}>Grade</div>
                        </div>
                    </div>

                    <div style={styles.buttonRow}>
                        <button onClick={() => {
                            setCurrentSpotIndex(0);
                            setCurrentStreetIndex(0);
                            setScore(0);
                            setCorrectAnswers(0);
                            setTotalAnswers(0);
                            setStreakCount(0);
                            setGameOver(false);
                        }} style={styles.playAgainButton}>
                            🔄 PLAY AGAIN
                        </button>
                        <button onClick={onExit} style={styles.exitButton}>
                            ← EXIT
                        </button>
                    </div>
                </div>
            </motion.div>
        );
    }

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <button onClick={onExit} style={styles.backButton}>
                    ← Exit
                </button>
                <div style={styles.headerStats}>
                    <div style={styles.scoreBadge}>
                        <span style={{ fontSize: 16 }}>🎯</span>
                        <span style={{ fontWeight: 700 }}>{score}</span>
                    </div>
                    {streakCount >= 3 && (
                        <div style={styles.streakBadge}>
                            🔥 {streakCount}
                        </div>
                    )}
                    <div style={styles.progressBadge}>
                        Spot {currentSpotIndex + 1}/{SPOT_SCENARIOS.length}
                    </div>
                </div>
            </div>

            {/* Spot Info */}
            <div style={styles.spotInfo}>
                <h2 style={styles.spotTitle}>{currentSpot.title}</h2>
                <div style={styles.formatBadge}>{currentSpot.format}</div>
            </div>

            {/* Street Progress */}
            <div style={styles.streetProgress}>
                {currentSpot.streets.map((street, idx) => (
                    <div
                        key={idx}
                        style={{
                            ...styles.streetDot,
                            background: idx < currentStreetIndex
                                ? '#00ff88'
                                : idx === currentStreetIndex
                                    ? getStreetColor(street.street)
                                    : 'rgba(255,255,255,0.2)',
                            boxShadow: idx === currentStreetIndex
                                ? `0 0 15px ${getStreetColor(street.street)}`
                                : 'none',
                        }}
                    >
                        {idx < currentStreetIndex && '✓'}
                    </div>
                ))}
            </div>

            {/* Street Label */}
            <div style={{
                ...styles.streetLabel,
                background: getStreetColor(currentStreet.street),
            }}>
                {currentStreet.street.toUpperCase()}
            </div>

            {/* Board Display */}
            {currentStreet.board && currentStreet.board.length > 0 && (
                <div style={styles.boardContainer}>
                    <div style={styles.boardLabel}>Board</div>
                    <CardDisplay cards={currentStreet.board} size="large" />
                </div>
            )}

            {/* Hero Hand */}
            {currentStreet.heroHand && (
                <div style={styles.heroHandContainer}>
                    <div style={styles.heroHandLabel}>Your Hand</div>
                    <CardDisplay cards={currentStreet.heroHand} size="medium" />
                </div>
            )}

            {/* Pot & Stack Info */}
            <div style={styles.potInfo}>
                <div style={styles.potValue}>
                    <span style={{ color: 'rgba(255,255,255,0.5)' }}>Pot:</span> {currentStreet.pot}bb
                </div>
                <div style={styles.stackInfo}>
                    <span>Hero: {currentStreet.heroStack}bb</span>
                    <span>Villain: {currentStreet.villainStack}bb</span>
                </div>
            </div>

            {/* Description */}
            <p style={styles.description}>{currentStreet.description}</p>

            {/* Options */}
            <div style={styles.optionsContainer}>
                {currentStreet.options.map((option, idx) => {
                    const isSelected = selectedOption === idx;
                    const isCorrect = option.correct;
                    const showCorrectness = showResult;

                    let bgColor = 'rgba(255,255,255,0.05)';
                    let borderColor = 'rgba(255,255,255,0.2)';

                    if (showCorrectness) {
                        if (isCorrect) {
                            bgColor = 'rgba(0, 255, 136, 0.2)';
                            borderColor = '#00ff88';
                        } else if (isSelected && !isCorrect) {
                            bgColor = 'rgba(255, 68, 68, 0.2)';
                            borderColor = '#ff4444';
                        }
                    } else if (isSelected) {
                        bgColor = 'rgba(0, 212, 255, 0.2)';
                        borderColor = '#00D4FF';
                    }

                    return (
                        <motion.button
                            key={idx}
                            whileHover={{ scale: showResult ? 1 : 1.02 }}
                            whileTap={{ scale: showResult ? 1 : 0.98 }}
                            onClick={() => handleOptionSelect(option, idx)}
                            disabled={showResult}
                            style={{
                                ...styles.optionButton,
                                background: bgColor,
                                borderColor: borderColor,
                                cursor: showResult ? 'default' : 'pointer',
                            }}
                        >
                            <span style={styles.optionText}>{option.action}</span>
                            {showResult && (
                                <span style={{
                                    ...styles.evBadge,
                                    color: option.ev >= 0 ? '#00ff88' : '#ff4444',
                                }}>
                                    EV: {option.ev >= 0 ? '+' : ''}{option.ev}
                                </span>
                            )}
                            {showResult && isCorrect && (
                                <span style={styles.correctIcon}>✓</span>
                            )}
                            {showResult && isSelected && !isCorrect && (
                                <span style={styles.incorrectIcon}>✗</span>
                            )}
                        </motion.button>
                    );
                })}
            </div>

            {/* Explanation */}
            <AnimatePresence>
                {showResult && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={styles.explanationBox}
                    >
                        <div style={styles.explanationTitle}>
                            {currentStreet.options[selectedOption]?.correct ? '✅ Correct!' : '❌ Not Optimal'}
                        </div>
                        <p style={styles.explanationText}>{currentStreet.explanation}</p>

                        {/* GTO Panel Image */}
                        <div style={styles.gtoPanelContainer}>
                            <img
                                src={`https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/gto-panels/panels/gto_panel_${currentSpot.id.replace('spot-', 'l')}_scenario_${currentStreetIndex}_1770118428644.png`}
                                alt="GTO Analysis Panel"
                                style={styles.gtoPanelImage}
                                onError={(e) => {
                                    // Fallback to generic panel if specific one not found
                                    e.target.style.display = 'none';
                                }}
                            />
                        </div>

                        <button onClick={handleNext} style={styles.nextButton}>
                            {currentStreetIndex < currentSpot.streets.length - 1
                                ? 'Next Street →'
                                : currentSpotIndex < SPOT_SCENARIOS.length - 1
                                    ? 'Next Spot →'
                                    : 'View Results →'}
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
const styles = {
    container: {
        minHeight: '100vh',
        background: '#0a0a12',
        padding: 16,
        fontFamily: 'Inter, -apple-system, sans-serif',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    backButton: {
        padding: '10px 16px',
        background: 'rgba(0, 212, 255, 0.1)',
        border: '1px solid rgba(0, 212, 255, 0.3)',
        borderRadius: 8,
        color: '#00D4FF',
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
    },
    headerStats: {
        display: 'flex',
        gap: 10,
        alignItems: 'center',
    },
    scoreBadge: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 14px',
        background: 'rgba(0, 0, 0, 0.4)',
        borderRadius: 20,
        color: '#fff',
        border: '1px solid rgba(255, 255, 255, 0.1)',
    },
    streakBadge: {
        padding: '6px 12px',
        background: 'linear-gradient(135deg, #ff6b00, #ff0066)',
        borderRadius: 20,
        fontSize: 14,
        fontWeight: 700,
        color: '#fff',
    },
    progressBadge: {
        padding: '6px 12px',
        background: 'rgba(255,255,255,0.1)',
        borderRadius: 20,
        fontSize: 12,
        color: 'rgba(255,255,255,0.6)',
    },
    spotInfo: {
        textAlign: 'center',
        marginBottom: 20,
    },
    spotTitle: {
        fontSize: 24,
        fontWeight: 700,
        color: '#fff',
        marginBottom: 8,
    },
    formatBadge: {
        display: 'inline-block',
        padding: '4px 12px',
        background: 'rgba(0, 212, 255, 0.1)',
        border: '1px solid rgba(0, 212, 255, 0.3)',
        borderRadius: 20,
        fontSize: 12,
        color: '#00D4FF',
    },
    streetProgress: {
        display: 'flex',
        justifyContent: 'center',
        gap: 12,
        marginBottom: 20,
    },
    streetDot: {
        width: 32,
        height: 32,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
        fontWeight: 700,
        color: '#fff',
        transition: 'all 0.3s ease',
    },
    streetLabel: {
        display: 'inline-block',
        padding: '6px 16px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 700,
        color: '#fff',
        margin: '0 auto 20px',
        display: 'block',
        width: 'fit-content',
    },
    boardContainer: {
        textAlign: 'center',
        marginBottom: 20,
    },
    boardLabel: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    heroHandContainer: {
        textAlign: 'center',
        marginBottom: 20,
    },
    heroHandLabel: {
        fontSize: 11,
        color: '#00D4FF',
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    potInfo: {
        display: 'flex',
        justifyContent: 'center',
        gap: 24,
        marginBottom: 16,
    },
    potValue: {
        fontSize: 18,
        fontWeight: 700,
        color: '#FFD700',
    },
    stackInfo: {
        display: 'flex',
        gap: 16,
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
    },
    description: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.8)',
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 1.6,
    },
    optionsContainer: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        maxWidth: 500,
        margin: '0 auto 24px',
    },
    optionButton: {
        padding: '16px 20px',
        border: '2px solid',
        borderRadius: 12,
        fontSize: 16,
        fontWeight: 600,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        color: '#fff',
        transition: 'all 0.2s ease',
    },
    optionText: {},
    evBadge: {
        fontSize: 14,
        fontWeight: 500,
    },
    correctIcon: {
        width: 24,
        height: 24,
        borderRadius: '50%',
        background: '#00ff88',
        color: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
    },
    incorrectIcon: {
        width: 24,
        height: 24,
        borderRadius: '50%',
        background: '#ff4444',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
    },
    explanationBox: {
        background: 'rgba(0, 0, 0, 0.5)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 16,
        padding: 24,
        maxWidth: 500,
        margin: '0 auto',
    },
    explanationTitle: {
        fontSize: 20,
        fontWeight: 700,
        color: '#fff',
        marginBottom: 12,
    },
    explanationText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.7)',
        lineHeight: 1.6,
        marginBottom: 20,
    },
    nextButton: {
        width: '100%',
        padding: '14px 24px',
        background: 'linear-gradient(135deg, #00D4FF, #0088dd)',
        border: 'none',
        borderRadius: 30,
        fontSize: 16,
        fontWeight: 700,
        color: '#000',
        cursor: 'pointer',
    },
    gameOverCard: {
        maxWidth: 500,
        margin: '40px auto',
        background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.1), rgba(138, 43, 226, 0.1))',
        border: '2px solid rgba(0, 212, 255, 0.3)',
        borderRadius: 24,
        padding: 40,
        textAlign: 'center',
    },
    gameOverTitle: {
        fontSize: 28,
        fontWeight: 900,
        color: '#fff',
        marginBottom: 32,
        fontFamily: 'Orbitron, sans-serif',
    },
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 16,
        marginBottom: 32,
    },
    statBox: {
        padding: 20,
        background: 'rgba(0, 0, 0, 0.4)',
        borderRadius: 12,
    },
    statValue: {
        fontSize: 32,
        fontWeight: 900,
        color: '#00D4FF',
        marginBottom: 4,
    },
    statLabel: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
        textTransform: 'uppercase',
    },
    buttonRow: {
        display: 'flex',
        gap: 16,
        justifyContent: 'center',
    },
    playAgainButton: {
        padding: '14px 32px',
        background: 'linear-gradient(135deg, #00ff88, #00D4FF)',
        border: 'none',
        borderRadius: 30,
        fontSize: 16,
        fontWeight: 700,
        color: '#000',
        cursor: 'pointer',
    },
    exitButton: {
        padding: '14px 32px',
        background: 'rgba(255,255,255,0.1)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 30,
        fontSize: 16,
        fontWeight: 600,
        color: '#fff',
        cursor: 'pointer',
    },
    gtoPanelContainer: {
        marginTop: 16,
        marginBottom: 20,
        textAlign: 'center',
    },
    gtoPanelImage: {
        maxWidth: '100%',
        borderRadius: 12,
        boxShadow: '0 4px 20px rgba(0, 212, 255, 0.3)',
        border: '1px solid rgba(0, 212, 255, 0.2)',
    },
};

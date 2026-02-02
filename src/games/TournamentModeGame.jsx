/* ═══════════════════════════════════════════════════════════════════════════
   🏆 TOURNAMENT MODE — Competitive Ranked Battles with ELO
   Head-to-head style range battles with ELO ranking system
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';

// Supabase services for persistence
import gameSessionService from '../services/GameSessionService';
import achievementService from '../services/AchievementService';
import leaderboardService from '../services/LeaderboardService';
import { processGameResult } from './ELOService';

// ═══════════════════════════════════════════════════════════════════════════
// ELO SYSTEM
// ═══════════════════════════════════════════════════════════════════════════
const calculateEloChange = (playerRating, opponentRating, won, kFactor = 32) => {
    const expectedScore = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
    const actualScore = won ? 1 : 0;
    return Math.round(kFactor * (actualScore - expectedScore));
};

const getRankTier = (elo) => {
    if (elo >= 2400) return { name: 'Grandmaster', color: '#FFD700', icon: '👑' };
    if (elo >= 2000) return { name: 'Master', color: '#C0C0C0', icon: '💎' };
    if (elo >= 1800) return { name: 'Diamond', color: '#00D4FF', icon: '💠' };
    if (elo >= 1600) return { name: 'Platinum', color: '#8B5CF6', icon: '🔮' };
    if (elo >= 1400) return { name: 'Gold', color: '#FFB800', icon: '🥇' };
    if (elo >= 1200) return { name: 'Silver', color: '#A8A8A8', icon: '🥈' };
    if (elo >= 1000) return { name: 'Bronze', color: '#CD7F32', icon: '🥉' };
    return { name: 'Beginner', color: '#666', icon: '🎮' };
};

// ═══════════════════════════════════════════════════════════════════════════
// TOURNAMENT CHALLENGES
// ═══════════════════════════════════════════════════════════════════════════
const TOURNAMENT_CHALLENGES = [
    {
        id: 'tc-1',
        type: 'range-battle',
        title: 'BTN Open Range',
        description: 'Select the correct opening range from the Button',
        position: 'BTN',
        format: '6-max 100bb',
        difficulty: 'Medium',
        question: 'Which hands should you OPEN from the Button?',
        options: [
            { hands: 'AA, KK, QQ, JJ, AKs, AKo', percent: '4%', correct: false },
            { hands: 'Any pair, Any Axs, KQs+, suited connectors 54s+', percent: '25%', correct: false },
            { hands: '22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 97s+, 87s+, 76s+, 65s+, 54s, A2o+, K8o+, Q9o+, J9o+, T9o', percent: '45%', correct: true },
            { hands: 'Any two cards', percent: '100%', correct: false },
        ],
        explanation: 'On the Button, you should open ~45% of hands. This wide range is profitable due to position advantage and folding equity.',
    },
    {
        id: 'tc-2',
        type: 'frequency-battle',
        title: 'A♠K♠ vs 3-bet',
        description: 'Facing a CO 3-bet with AKs, what\'s your frequency split?',
        position: 'BTN',
        format: '6-max 100bb',
        difficulty: 'Hard',
        question: 'You opened BTN, CO 3-bets. With A♠K♠, how often should you 4-bet vs call?',
        heroHand: ['As', 'Ks'],
        options: [
            { action: '100% 4-bet', frequencies: { '4bet': 100, 'call': 0 }, correct: false },
            { action: '70% 4-bet / 30% Call', frequencies: { '4bet': 70, 'call': 30 }, correct: true },
            { action: '50% 4-bet / 50% Call', frequencies: { '4bet': 50, 'call': 50 }, correct: false },
            { action: '100% Call', frequencies: { '4bet': 0, 'call': 100 }, correct: false },
        ],
        explanation: 'AKs should mostly 4-bet for value but also has strong playability as a call to balance your calling range.',
    },
    {
        id: 'tc-3',
        type: 'ev-comparison',
        title: 'River Bluff Spot',
        description: 'Compare EV of bluffing vs giving up on the river',
        position: 'BB',
        format: '6-max 100bb',
        difficulty: 'Expert',
        question: 'River pot is 30bb. You missed your flush draw. Villain checks. What\'s the better play?',
        heroHand: ['9h', '8h'],
        board: ['Kh', '3h', '2c', 'Qs', '5d'],
        pot: 30,
        options: [
            { action: 'Check back', ev: 0, correct: false },
            { action: 'Bet 20bb', ev: 5.5, correct: true },
            { action: 'Bet 45bb (Overbet)', ev: 3.2, correct: false },
        ],
        explanation: 'A ~66% pot bluff only needs to work 40% of the time. Given board texture and action, this bluff is +EV.',
    },
    {
        id: 'tc-4',
        type: 'range-battle',
        title: 'BB vs SB 3-bet',
        description: 'Select your continuing range facing a 3-bet in the blinds',
        position: 'BB',
        format: '6-max 100bb',
        difficulty: 'Medium',
        question: 'SB 3-bets to 9bb after you defended BB. Which range should you CALL with?',
        options: [
            { hands: 'Only premium: QQ+, AK', percent: '3%', correct: false },
            { hands: 'TT+, AJs+, KQs', percent: '7%', correct: false },
            { hands: '55+, A5s-A2s, A9s+, KTs+, QTs+, JTs, T9s, 98s, AJo+, KQo', percent: '15%', correct: true },
            { hands: 'Any pair, any suited broadway', percent: '20%', correct: false },
        ],
        explanation: 'In the BB facing a 3-bet, you need a balanced calling range with suited aces for blocking and playability.',
    },
    {
        id: 'tc-5',
        type: 'bet-sizing',
        title: 'Value Bet Sizing',
        description: 'Choose optimal bet sizing with a strong hand',
        position: 'BTN',
        format: '6-max 100bb',
        difficulty: 'Medium',
        question: 'River brings the 4th heart. You have K♥Q♥ for the second nut flush. Pot is 40bb.',
        heroHand: ['Kh', 'Qh'],
        board: ['Ah', '8h', '5c', '3s', '2h'],
        pot: 40,
        options: [
            { action: 'Check', ev: 28, correct: false },
            { action: 'Bet 15bb (37%)', ev: 35, correct: false },
            { action: 'Bet 30bb (75%)', ev: 42, correct: true },
            { action: 'Bet 60bb (150%)', ev: 38, correct: false },
        ],
        explanation: 'With the second nuts, 75% pot maximizes value. Overbet risks fold from worse flushes, smaller bets leave money on the table.',
    },
    {
        id: 'tc-6',
        type: 'defense',
        title: 'Check-Raise Defense',
        description: 'Defend against a check-raise on the flop',
        position: 'BTN',
        format: '6-max 100bb',
        difficulty: 'Hard',
        question: 'You c-bet flop, BB check-raises. What\'s the correct action with A♦Q♦?',
        heroHand: ['Ad', 'Qd'],
        board: ['Kd', '7d', '2c'],
        options: [
            { action: 'Fold', ev: 0, correct: false },
            { action: 'Call', ev: 3.5, correct: true },
            { action: '3-bet bluff', ev: -2.2, correct: false },
            { action: '3-bet shove', ev: -5.8, correct: false },
        ],
        explanation: 'With nut flush draw + overcards, you have strong equity. Call to realize your draw and keep villain\'s range wide.',
    },
    {
        id: 'tc-7',
        type: 'preflop-decision',
        title: 'Short Stack Shove',
        description: 'ICM-aware decision at final table',
        position: 'BTN',
        format: 'MTT FT 15bb',
        difficulty: 'Expert',
        question: 'Final table, 6 left. You have 15bb on BTN with 66. SB has 8bb, BB has 40bb.',
        heroHand: ['6s', '6h'],
        options: [
            { action: 'Fold', ev: 0, correct: false },
            { action: 'Min-raise', ev: 1.2, correct: false },
            { action: 'Shove all-in', ev: 2.8, correct: true },
        ],
        explanation: 'With 15bb, 66 is a clear shove. You have fold equity against blinds and dominate their calling ranges.',
    },
    {
        id: 'tc-8',
        type: 'range-battle',
        title: 'UTG Open 6-Max',
        description: 'Select the correct UTG open range',
        position: 'UTG',
        format: '6-max 100bb',
        difficulty: 'Easy',
        question: 'What is the correct opening range from UTG in 6-max?',
        options: [
            { hands: 'AA-TT, AK, AQs', percent: '7%', correct: false },
            { hands: '22+, ATs+, KQs, AJo+, KQo', percent: '13%', correct: true },
            { hands: 'Any pair, any broadway', percent: '20%', correct: false },
            { hands: 'Only premium: QQ+, AK', percent: '4%', correct: false },
        ],
        explanation: 'UTG in 6-max opens ~13%. Include pocket pairs for set mining and strong broadways for postflop play.',
    },
];

// Simulate opponent (for now, single-player simulation)
const getSimulatedOpponent = (playerElo) => {
    const eloVariance = Math.random() * 300 - 150; // ±150 ELO
    return {
        name: ['GTO_Shark', 'RangeGuru', 'PokerWiz', 'SolverPro', 'ACE_Hunter'][Math.floor(Math.random() * 5)],
        elo: Math.round(playerElo + eloVariance),
        avatar: ['🦈', '🧙‍♂️', '🎩', '🤖', '🎯'][Math.floor(Math.random() * 5)],
    };
};

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
// TOURNAMENT MODE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function TournamentModeGame({ onExit, onScoreUpdate, DiamondEngine, userId }) {
    // State
    const [playerElo, setPlayerElo] = useState(1200);
    const [matchState, setMatchState] = useState('lobby'); // 'lobby' | 'matching' | 'battle' | 'result'
    const [opponent, setOpponent] = useState(null);
    const [currentRound, setCurrentRound] = useState(0);
    const [playerScore, setPlayerScore] = useState(0);
    const [opponentScore, setOpponentScore] = useState(0);
    const [currentChallenge, setCurrentChallenge] = useState(null);
    const [selectedOption, setSelectedOption] = useState(null);
    const [showResult, setShowResult] = useState(false);
    const [roundsPlayed, setRoundsPlayed] = useState(0);
    const [matchHistory, setMatchHistory] = useState([]);
    const matchRef = useRef([]);

    const ROUNDS_PER_MATCH = 5;

    // Load ELO from localStorage
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const savedElo = localStorage.getItem('memory_tournament_elo');
            if (savedElo) setPlayerElo(parseInt(savedElo));
        }
    }, []);

    // Save ELO updates
    const updatePlayerElo = (newElo) => {
        setPlayerElo(newElo);
        if (typeof window !== 'undefined') {
            localStorage.setItem('memory_tournament_elo', newElo.toString());
        }
    };

    // Start matchmaking
    const startMatchmaking = () => {
        setMatchState('matching');

        // Simulate matchmaking delay
        setTimeout(() => {
            const opp = getSimulatedOpponent(playerElo);
            setOpponent(opp);

            // Select random challenges for this match
            const shuffled = [...TOURNAMENT_CHALLENGES].sort(() => Math.random() - 0.5);
            matchRef.current = shuffled.slice(0, ROUNDS_PER_MATCH);

            setTimeout(() => {
                setMatchState('battle');
                setCurrentRound(0);
                setPlayerScore(0);
                setOpponentScore(0);
                setCurrentChallenge(matchRef.current[0]);
            }, 1500);
        }, 2000);
    };

    // Handle option selection
    const handleOptionSelect = (option, index) => {
        if (showResult) return;

        setSelectedOption(index);
        setShowResult(true);

        const isCorrect = option.correct !== undefined
            ? option.correct
            : option.ev && option.ev === Math.max(...currentChallenge.options.map(o => o.ev || 0));

        if (isCorrect) {
            setPlayerScore(prev => prev + 1);
        } else {
            // Opponent "wins" this round
            setOpponentScore(prev => prev + 1);
        }
    };

    // Handle next round
    const handleNextRound = () => {
        setSelectedOption(null);
        setShowResult(false);

        if (currentRound < ROUNDS_PER_MATCH - 1) {
            setCurrentRound(prev => prev + 1);
            setCurrentChallenge(matchRef.current[currentRound + 1]);
        } else {
            // Match complete
            const playerWon = playerScore > opponentScore;
            const eloChange = calculateEloChange(playerElo, opponent.elo, playerWon);
            const newElo = playerElo + eloChange;

            updatePlayerElo(newElo);
            setRoundsPlayed(prev => prev + 1);

            // Record match in history
            setMatchHistory(prev => [...prev, {
                opponent: opponent.name,
                result: playerWon ? 'W' : 'L',
                score: `${playerScore}-${opponentScore}`,
                eloChange,
            }]);

            // Award diamonds for winning
            const diamondsEarned = playerWon ? Math.round((5 + Math.abs(eloChange) / 10)) : 0;
            if (diamondsEarned > 0 && DiamondEngine) {
                DiamondEngine.award(diamondsEarned);
                onScoreUpdate?.(DiamondEngine.getBalance());
            }

            if (playerWon) {
                confetti({
                    particleCount: 100,
                    spread: 70,
                    origin: { y: 0.6 }
                });
            }

            // ═══════════════════════════════════════════════════════════════════════════
            // 📊 PERSIST TO SUPABASE — Session, ELO, Leaderboard, Achievements
            // ═══════════════════════════════════════════════════════════════════════════
            if (userId) {
                const gameMode = 'tournament';
                const accuracy = Math.round((playerScore / ROUNDS_PER_MATCH) * 100);

                // 1. Update leaderboard (only if won)
                if (playerWon) {
                    leaderboardService.updateLeaderboard(
                        userId,
                        gameMode,
                        1, // level
                        newElo,
                        accuracy,
                        0, // timeTaken
                        null // sessionId
                    ).then(res => {
                        console.log('[Tournament] Leaderboard updated:', res);
                    }).catch(err => {
                        console.warn('[Tournament] Leaderboard update failed:', err);
                    });
                }

                // 2. Update ELO rating in profiles table
                processGameResult(userId, 1, accuracy, roundsPlayed)
                    .then(eloResult => {
                        console.log('[Tournament] ELO persisted:', eloResult);
                    }).catch(err => {
                        console.warn('[Tournament] ELO persist failed:', err);
                    });

                // 3. Record game session for analytics
                gameSessionService.recordSession(userId, {
                    gameMode,
                    level: 1,
                    scenarioId: `match-vs-${opponent.name}`,
                    score: playerScore,
                    accuracy,
                    timeTaken: 0,
                    diamondsSpent: 0,
                    diamondsEarned,
                    completed: true
                }).then(sessionResult => {
                    console.log('[Tournament] Session recorded:', sessionResult);
                }).catch(err => {
                    console.warn('[Tournament] Session recording failed:', err);
                });

                // 4. Check and unlock achievements
                achievementService.checkAndUnlock(userId, {
                    gamesPlayed: roundsPlayed + 1,
                    accuracy,
                    timeTaken: 0,
                    level: 1,
                    gameMode,
                    totalDiamonds: DiamondEngine?.getBalance() || 0,
                    aiScenariosCompleted: 0,
                    currentStreak: playerWon ? 1 : 0,
                    modesPlayed: [gameMode]
                }).then(unlocked => {
                    if (unlocked.length > 0) {
                        console.log('[Tournament] Achievements unlocked:', unlocked);
                    }
                }).catch(err => {
                    console.warn('[Tournament] Achievement check failed:', err);
                });
            }

            setMatchState('result');
        }
    };

    const playerRank = getRankTier(playerElo);

    // ═══════════════════════════════════════════════════════════════════════
    // LOBBY VIEW
    // ═══════════════════════════════════════════════════════════════════════
    if (matchState === 'lobby') {
        return (
            <div style={styles.container}>
                <div style={styles.header}>
                    <button onClick={onExit} style={styles.backButton}>
                        ← Exit
                    </button>
                </div>

                <div style={styles.lobbyCard}>
                    <div style={{ fontSize: 64, marginBottom: 16 }}>⚔️</div>
                    <h1 style={styles.lobbyTitle}>TOURNAMENT MODE</h1>
                    <p style={styles.lobbySubtitle}>Ranked Range Battles</p>

                    {/* Player Rank Display */}
                    <div style={styles.rankDisplay}>
                        <div style={{ fontSize: 48 }}>{playerRank.icon}</div>
                        <div>
                            <div style={{ ...styles.rankName, color: playerRank.color }}>
                                {playerRank.name}
                            </div>
                            <div style={styles.eloValue}>{playerElo} ELO</div>
                        </div>
                    </div>

                    {/* Stats */}
                    <div style={styles.statsRow}>
                        <div style={styles.statItem}>
                            <div style={styles.statNumber}>{matchHistory.filter(m => m.result === 'W').length}</div>
                            <div style={styles.statLabel}>Wins</div>
                        </div>
                        <div style={styles.statItem}>
                            <div style={styles.statNumber}>{matchHistory.filter(m => m.result === 'L').length}</div>
                            <div style={styles.statLabel}>Losses</div>
                        </div>
                        <div style={styles.statItem}>
                            <div style={styles.statNumber}>
                                {matchHistory.length > 0
                                    ? Math.round((matchHistory.filter(m => m.result === 'W').length / matchHistory.length) * 100)
                                    : 0}%
                            </div>
                            <div style={styles.statLabel}>Win Rate</div>
                        </div>
                    </div>

                    <button onClick={startMatchmaking} style={styles.findMatchButton}>
                        ⚔️ FIND MATCH
                    </button>

                    {/* Recent Matches */}
                    {matchHistory.length > 0 && (
                        <div style={styles.recentMatches}>
                            <h3 style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>RECENT MATCHES</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {matchHistory.slice(-5).reverse().map((match, idx) => (
                                    <div key={idx} style={styles.matchItem}>
                                        <span>{match.result === 'W' ? '✅' : '❌'}</span>
                                        <span style={{ color: '#fff' }}>vs {match.opponent}</span>
                                        <span style={{ color: 'rgba(255,255,255,0.5)' }}>{match.score}</span>
                                        <span style={{ color: match.eloChange >= 0 ? '#00ff88' : '#ff4444' }}>
                                            {match.eloChange >= 0 ? '+' : ''}{match.eloChange}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MATCHMAKING VIEW
    // ═══════════════════════════════════════════════════════════════════════
    if (matchState === 'matching') {
        return (
            <div style={styles.container}>
                <div style={styles.matchmakingCard}>
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                        style={{ fontSize: 64, marginBottom: 24 }}
                    >
                        ⚔️
                    </motion.div>
                    <h2 style={styles.matchmakingTitle}>Finding Opponent...</h2>
                    <p style={styles.matchmakingSubtitle}>Searching for a worthy challenger</p>
                    <div style={styles.eloSearchRange}>
                        ELO Range: {playerElo - 200} - {playerElo + 200}
                    </div>
                </div>
            </div>
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // BATTLE VIEW
    // ═══════════════════════════════════════════════════════════════════════
    if (matchState === 'battle' && currentChallenge) {
        const opponentRank = getRankTier(opponent?.elo || 1200);

        return (
            <div style={styles.container}>
                {/* Score Header */}
                <div style={styles.battleHeader}>
                    {/* Player */}
                    <div style={styles.playerPanel}>
                        <div style={{ fontSize: 32 }}>{playerRank.icon}</div>
                        <div>
                            <div style={styles.playerName}>You</div>
                            <div style={{ ...styles.playerElo, color: playerRank.color }}>{playerElo}</div>
                        </div>
                    </div>

                    {/* Score */}
                    <div style={styles.scorePanel}>
                        <span style={{ ...styles.scoreNumber, color: '#00ff88' }}>{playerScore}</span>
                        <span style={styles.scoreSeparator}>-</span>
                        <span style={{ ...styles.scoreNumber, color: '#ff4444' }}>{opponentScore}</span>
                    </div>

                    {/* Opponent */}
                    <div style={styles.playerPanel}>
                        <div style={{ fontSize: 32 }}>{opponent?.avatar}</div>
                        <div>
                            <div style={styles.playerName}>{opponent?.name}</div>
                            <div style={{ ...styles.playerElo, color: opponentRank.color }}>{opponent?.elo}</div>
                        </div>
                    </div>
                </div>

                {/* Round Indicator */}
                <div style={styles.roundIndicator}>
                    Round {currentRound + 1} of {ROUNDS_PER_MATCH}
                </div>

                {/* Challenge Card */}
                <div style={styles.challengeCard}>
                    <div style={styles.challengeHeader}>
                        <span style={styles.challengeType}>{currentChallenge.type.replace('-', ' ').toUpperCase()}</span>
                        <span style={{
                            ...styles.difficultyBadge, background:
                                currentChallenge.difficulty === 'Expert' ? '#ff4444' :
                                    currentChallenge.difficulty === 'Hard' ? '#ff9900' :
                                        currentChallenge.difficulty === 'Medium' ? '#00D4FF' : '#00ff88'
                        }}>
                            {currentChallenge.difficulty}
                        </span>
                    </div>

                    <h2 style={styles.challengeTitle}>{currentChallenge.title}</h2>
                    <p style={styles.challengeQuestion}>{currentChallenge.question}</p>

                    {/* Hero Hand if available */}
                    {currentChallenge.heroHand && (
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>YOUR HAND</div>
                            <CardDisplay cards={currentChallenge.heroHand} size="medium" />
                        </div>
                    )}

                    {/* Board if available */}
                    {currentChallenge.board && (
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>BOARD</div>
                            <CardDisplay cards={currentChallenge.board} size="medium" />
                        </div>
                    )}

                    {/* Options */}
                    <div style={styles.optionsGrid}>
                        {currentChallenge.options.map((option, idx) => {
                            const isSelected = selectedOption === idx;
                            const isCorrect = option.correct !== undefined
                                ? option.correct
                                : option.ev === Math.max(...currentChallenge.options.map(o => o.ev || 0));

                            let bgColor = 'rgba(255,255,255,0.05)';
                            let borderColor = 'rgba(255,255,255,0.2)';

                            if (showResult) {
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
                                    }}
                                >
                                    <div style={styles.optionText}>
                                        {option.action || option.hands}
                                    </div>
                                    {option.percent && (
                                        <div style={styles.optionPercent}>{option.percent}</div>
                                    )}
                                    {showResult && option.ev !== undefined && (
                                        <div style={{
                                            fontSize: 12,
                                            color: option.ev >= 0 ? '#00ff88' : '#ff4444',
                                            marginTop: 4
                                        }}>
                                            EV: {option.ev >= 0 ? '+' : ''}{option.ev}bb
                                        </div>
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
                                <div style={{
                                    fontSize: 18,
                                    fontWeight: 700,
                                    marginBottom: 8,
                                    color: currentChallenge.options[selectedOption]?.correct ? '#00ff88' : '#ff4444'
                                }}>
                                    {currentChallenge.options[selectedOption]?.correct
                                        ? '✅ Correct! +1 Point'
                                        : `❌ Wrong! Opponent scores`}
                                </div>
                                <p style={styles.explanationText}>{currentChallenge.explanation}</p>
                                <button onClick={handleNextRound} style={styles.nextRoundButton}>
                                    {currentRound < ROUNDS_PER_MATCH - 1 ? 'Next Round →' : 'View Results →'}
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RESULT VIEW
    // ═══════════════════════════════════════════════════════════════════════
    if (matchState === 'result') {
        const lastMatch = matchHistory[matchHistory.length - 1];
        const playerWon = lastMatch?.result === 'W';
        const opponentRank = getRankTier(opponent?.elo || 1200);

        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                style={styles.container}
            >
                <div style={styles.resultCard}>
                    <div style={{ fontSize: 72, marginBottom: 16 }}>
                        {playerWon ? '🏆' : '💀'}
                    </div>
                    <h1 style={{
                        ...styles.resultTitle,
                        color: playerWon ? '#00ff88' : '#ff4444'
                    }}>
                        {playerWon ? 'VICTORY!' : 'DEFEAT'}
                    </h1>

                    <div style={styles.resultScore}>
                        <span style={{ color: '#00ff88' }}>{playerScore}</span>
                        <span style={{ color: 'rgba(255,255,255,0.3)' }}> - </span>
                        <span style={{ color: '#ff4444' }}>{opponentScore}</span>
                    </div>

                    <div style={styles.eloChange}>
                        <span style={{ color: 'rgba(255,255,255,0.5)' }}>ELO Change: </span>
                        <span style={{
                            color: lastMatch?.eloChange >= 0 ? '#00ff88' : '#ff4444',
                            fontWeight: 700
                        }}>
                            {lastMatch?.eloChange >= 0 ? '+' : ''}{lastMatch?.eloChange}
                        </span>
                    </div>

                    <div style={styles.newRankDisplay}>
                        <div style={{ fontSize: 48 }}>{playerRank.icon}</div>
                        <div style={{ ...styles.newRankName, color: playerRank.color }}>
                            {playerRank.name}
                        </div>
                        <div style={styles.newEloValue}>{playerElo} ELO</div>
                    </div>

                    {playerWon && (
                        <div style={styles.diamondReward}>
                            +{Math.round((5 + Math.abs(lastMatch?.eloChange || 0) / 10))} 💎 Earned!
                        </div>
                    )}

                    <div style={styles.resultButtons}>
                        <button onClick={startMatchmaking} style={styles.rematchButton}>
                            ⚔️ FIND NEXT MATCH
                        </button>
                        <button onClick={() => setMatchState('lobby')} style={styles.lobbyButton}>
                            ← BACK TO LOBBY
                        </button>
                    </div>
                </div>
            </motion.div>
        );
    }

    return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
const styles = {
    container: {
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0a12, #1a0a2a)',
        padding: 16,
        fontFamily: 'Inter, -apple-system, sans-serif',
    },
    header: {
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
    lobbyCard: {
        maxWidth: 500,
        margin: '0 auto',
        textAlign: 'center',
        padding: 32,
        background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.05), rgba(138, 43, 226, 0.05))',
        border: '2px solid rgba(0, 212, 255, 0.2)',
        borderRadius: 24,
    },
    lobbyTitle: {
        fontSize: 36,
        fontWeight: 900,
        color: '#fff',
        marginBottom: 8,
        fontFamily: 'Orbitron, sans-serif',
    },
    lobbySubtitle: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 32,
    },
    rankDisplay: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        marginBottom: 32,
    },
    rankName: {
        fontSize: 24,
        fontWeight: 700,
    },
    eloValue: {
        fontSize: 18,
        color: 'rgba(255,255,255,0.6)',
    },
    statsRow: {
        display: 'flex',
        justifyContent: 'center',
        gap: 32,
        marginBottom: 32,
    },
    statItem: {
        textAlign: 'center',
    },
    statNumber: {
        fontSize: 28,
        fontWeight: 700,
        color: '#fff',
    },
    statLabel: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
    },
    findMatchButton: {
        width: '100%',
        padding: '18px 32px',
        background: 'linear-gradient(135deg, #ff6b00, #ff0066)',
        border: 'none',
        borderRadius: 50,
        fontSize: 20,
        fontWeight: 700,
        color: '#fff',
        cursor: 'pointer',
        boxShadow: '0 0 30px rgba(255, 107, 0, 0.4)',
        marginBottom: 24,
    },
    recentMatches: {
        marginTop: 24,
        textAlign: 'left',
    },
    matchItem: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px',
        background: 'rgba(0,0,0,0.3)',
        borderRadius: 8,
        fontSize: 14,
    },
    matchmakingCard: {
        maxWidth: 400,
        margin: '100px auto',
        textAlign: 'center',
        padding: 48,
        background: 'rgba(0,0,0,0.4)',
        borderRadius: 24,
        border: '2px solid rgba(255,255,255,0.1)',
    },
    matchmakingTitle: {
        fontSize: 28,
        fontWeight: 700,
        color: '#fff',
        marginBottom: 8,
    },
    matchmakingSubtitle: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 24,
    },
    eloSearchRange: {
        padding: '8px 16px',
        background: 'rgba(255,255,255,0.1)',
        borderRadius: 20,
        fontSize: 14,
        color: '#00D4FF',
        display: 'inline-block',
    },
    battleHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        background: 'rgba(0,0,0,0.4)',
        borderRadius: 16,
        marginBottom: 20,
    },
    playerPanel: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
    },
    playerName: {
        fontSize: 14,
        fontWeight: 600,
        color: '#fff',
    },
    playerElo: {
        fontSize: 12,
        fontWeight: 500,
    },
    scorePanel: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    },
    scoreNumber: {
        fontSize: 36,
        fontWeight: 900,
    },
    scoreSeparator: {
        fontSize: 24,
        color: 'rgba(255,255,255,0.3)',
    },
    roundIndicator: {
        textAlign: 'center',
        fontSize: 14,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 16,
    },
    challengeCard: {
        background: 'rgba(0,0,0,0.4)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 20,
        padding: 24,
    },
    challengeHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    challengeType: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: 1,
    },
    difficultyBadge: {
        padding: '4px 10px',
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 600,
        color: '#fff',
    },
    challengeTitle: {
        fontSize: 24,
        fontWeight: 700,
        color: '#fff',
        marginBottom: 8,
    },
    challengeQuestion: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.7)',
        marginBottom: 24,
        lineHeight: 1.5,
    },
    optionsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 12,
        marginBottom: 24,
    },
    optionButton: {
        padding: '16px',
        border: '2px solid',
        borderRadius: 12,
        fontSize: 14,
        fontWeight: 600,
        color: '#fff',
        cursor: 'pointer',
        textAlign: 'center',
        transition: 'all 0.2s ease',
    },
    optionText: {
        wordBreak: 'break-word',
    },
    optionPercent: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
        marginTop: 4,
    },
    explanationBox: {
        background: 'rgba(0,0,0,0.5)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 12,
        padding: 20,
        marginTop: 20,
    },
    explanationText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.7)',
        lineHeight: 1.6,
        marginBottom: 20,
    },
    nextRoundButton: {
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
    resultCard: {
        maxWidth: 500,
        margin: '40px auto',
        textAlign: 'center',
        padding: 48,
        background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.1), rgba(138, 43, 226, 0.1))',
        border: '2px solid rgba(0, 212, 255, 0.3)',
        borderRadius: 24,
    },
    resultTitle: {
        fontSize: 48,
        fontWeight: 900,
        marginBottom: 16,
        fontFamily: 'Orbitron, sans-serif',
    },
    resultScore: {
        fontSize: 48,
        fontWeight: 900,
        marginBottom: 16,
    },
    eloChange: {
        fontSize: 20,
        marginBottom: 32,
    },
    newRankDisplay: {
        marginBottom: 24,
    },
    newRankName: {
        fontSize: 24,
        fontWeight: 700,
        marginBottom: 4,
    },
    newEloValue: {
        fontSize: 18,
        color: 'rgba(255,255,255,0.6)',
    },
    diamondReward: {
        fontSize: 20,
        fontWeight: 700,
        color: '#FFD700',
        marginBottom: 32,
    },
    resultButtons: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
    },
    rematchButton: {
        width: '100%',
        padding: '16px 32px',
        background: 'linear-gradient(135deg, #ff6b00, #ff0066)',
        border: 'none',
        borderRadius: 50,
        fontSize: 18,
        fontWeight: 700,
        color: '#fff',
        cursor: 'pointer',
    },
    lobbyButton: {
        width: '100%',
        padding: '14px 32px',
        background: 'rgba(255,255,255,0.1)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 50,
        fontSize: 16,
        fontWeight: 600,
        color: '#fff',
        cursor: 'pointer',
    },
};

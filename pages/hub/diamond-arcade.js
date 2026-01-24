/* ═══════════════════════════════════════════════════════════════════════════
   DIAMOND ARCADE — Premium Casino-Style Skill Gaming

   Risk Diamonds. Test Skills. Beat The House.

   Dark, premium casino aesthetic with obsidian backgrounds,
   diamond blue accents, gold highlights, and dangerous red for jackpots.

   Version: 2.0.2 - Premium Casino Redesign (Force Deploy)
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { supabase } from '../../src/lib/supabase';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import PageTransition from '../../src/components/transitions/PageTransition';
import {
    ARCADE_GAMES,
    generateHandSnapQuestion,
    generateBoardNutsQuestion,
    generateChipMathQuestion,
    calculatePrize,
    calculateDoubleOrNothing,
    calculateGauntlet,
    rollMysteryMultiplier,
    formatCard,
    evaluateHand,
    getHandName,
    getTimeUntilReset,
    getDailyFeaturedGames
} from '../../src/lib/arcade/arcadeEngine';

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function DiamondArcade() {
    const [user, setUser] = useState(null);
    const [balance, setBalance] = useState(1247);
    const [streak, setStreak] = useState(3);
    const [stats, setStats] = useState({ todayProfit: 127, gamesPlayed: 12, winRate: 62 });
    const [jackpot, setJackpot] = useState(47832);
    const [resetTime, setResetTime] = useState({ hours: 8, minutes: 42, seconds: 15 });
    const [featuredGames, setFeaturedGames] = useState({ games: [], bonusGame: 'hand-snap' });
    const [activeGame, setActiveGame] = useState(null);
    const [gamePhase, setGamePhase] = useState('lobby');
    const [currentQuestion, setCurrentQuestion] = useState(null);
    const [questionIndex, setQuestionIndex] = useState(0);
    const [correctCount, setCorrectCount] = useState(0);
    const [timeLeft, setTimeLeft] = useState(0);
    const [gameResult, setGameResult] = useState(null);
    const [sessionId, setSessionId] = useState(null);
    const [mysteryMultiplier, setMysteryMultiplier] = useState(1);
    const [showMultiplierReveal, setShowMultiplierReveal] = useState(false);
    const timerRef = useRef(null);
    const questionStartTime = useRef(0);

    // Featured games config
    const todaysFeatured = [
        { ...ARCADE_GAMES['hand-snap'], badge: '2X BONUS', badgeColor: '#fbbf24' },
        { ...ARCADE_GAMES['ev-or-fold'], badge: 'HOT 🔥', badgeColor: '#ef4444' },
        { ...ARCADE_GAMES['board-nuts'], badge: 'NEW ✨', badgeColor: '#22c55e' },
        { ...ARCADE_GAMES['the-gauntlet'], badge: 'JACKPOT', badgeColor: '#dc2626' },
    ];

    useEffect(() => {
        loadUser();
        const interval = setInterval(() => {
            setResetTime(getTimeUntilReset());
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    async function loadUser() {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            setUser(user);
            loadUserStats(user.id);
        }
    }

    async function loadUserStats(userId) {
        const { data } = await supabase.rpc('get_arcade_user_stats', { p_user_id: userId });
        if (data) {
            setBalance(data.balance || 0);
            setStreak(data.current_streak || 0);
            setStats({
                todayProfit: data.today?.profit || 0,
                gamesPlayed: data.total_games || 0,
                winRate: data.win_rate || 0
            });
        }
    }

    async function startGame(gameId) {
        if (!user) {
            alert('Please sign in to play!');
            return;
        }
        const game = ARCADE_GAMES[gameId];
        if (balance < game.entryFee) {
            alert(`Not enough diamonds! Need ${game.entryFee}, you have ${balance}`);
            return;
        }

        const { data, error } = await supabase.rpc('start_arcade_game', {
            p_user_id: user.id,
            p_game_id: gameId
        });

        if (error || !data?.success) {
            alert(data?.error || 'Failed to start game');
            return;
        }

        setSessionId(data.session_id);
        setBalance(data.balance);
        setStreak(data.streak);
        setActiveGame(game);
        setGamePhase('playing');
        setQuestionIndex(0);
        setCorrectCount(0);
        setTimeLeft(game.durationSeconds);
        setMysteryMultiplier(1);
        generateQuestion(gameId);
        startTimer(game.durationSeconds);
    }

    function generateQuestion(gameId) {
        questionStartTime.current = Date.now();
        switch (gameId) {
            case 'hand-snap':
                setCurrentQuestion(generateHandSnapQuestion());
                break;
            case 'board-nuts':
                setCurrentQuestion(generateBoardNutsQuestion());
                break;
            case 'chip-math':
                setCurrentQuestion(generateChipMathQuestion());
                break;
            default:
                setCurrentQuestion(generateHandSnapQuestion());
        }
    }

    function startTimer(seconds) {
        if (timerRef.current) clearInterval(timerRef.current);
        setTimeLeft(seconds);
        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    endGame(false);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }

    function handleAnswer(answerIndex) {
        let isCorrect = false;
        if (activeGame.id === 'hand-snap') {
            isCorrect = (answerIndex + 1) === currentQuestion.correctAnswer;
        } else if (activeGame.id === 'board-nuts' || activeGame.id === 'chip-math') {
            isCorrect = answerIndex === currentQuestion.correctIndex;
        } else {
            isCorrect = answerIndex === currentQuestion.correct;
        }

        if (isCorrect) {
            setCorrectCount(prev => prev + 1);
        } else if (activeGame.id === 'the-gauntlet') {
            endGame(false);
            return;
        }

        const newIndex = questionIndex + 1;
        if (newIndex >= activeGame.questionsCount) {
            endGame(true);
        } else {
            setQuestionIndex(newIndex);
            generateQuestion(activeGame.id);
        }
    }

    async function endGame(won, multiplier = 1) {
        if (timerRef.current) clearInterval(timerRef.current);
        const result = calculatePrize(activeGame, correctCount, activeGame.questionsCount, streak, multiplier);
        setGameResult(result);
        setGamePhase('result');

        if (result.won) {
            setBalance(prev => prev + result.finalPrize);
            setStreak(result.newStreak);
            if (result.finalPrize >= 100) {
                confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#fbbf24', '#22c55e', '#3b82f6'] });
            }
        } else {
            setStreak(0);
        }

        await supabase.rpc('complete_arcade_game', {
            p_session_id: sessionId,
            p_score: correctCount * 100,
            p_correct_count: correctCount,
            p_time_spent_ms: (activeGame.durationSeconds - timeLeft) * 1000,
            p_multiplier: multiplier
        });

        if (user) loadUserStats(user.id);
    }

    function returnToLobby() {
        setActiveGame(null);
        setGamePhase('lobby');
        setCurrentQuestion(null);
        setGameResult(null);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════════

    return (
        <PageTransition>
            <Head>
                <title>Diamond Arcade - Smarter.Poker</title>
                <meta name="viewport" content="width=800, user-scalable=no" />
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&family=Cinzel:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
                <style>{`
                    @keyframes diamondFloat {
                        0%, 100% { transform: translateY(0) rotate(0deg); }
                        50% { transform: translateY(-10px) rotate(5deg); }
                    }
                    @keyframes shimmer {
                        0% { background-position: -200% center; }
                        100% { background-position: 200% center; }
                    }
                    @keyframes pulse {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0.7; }
                    }
                    @keyframes borderGlow {
                        0%, 100% { box-shadow: 0 0 20px rgba(251, 191, 36, 0.3); }
                        50% { box-shadow: 0 0 40px rgba(251, 191, 36, 0.6); }
                    }
                    .arcade-page { width: 800px; max-width: 800px; margin: 0 auto; overflow-x: hidden; }
                    @media (max-width: 500px) { .arcade-page { zoom: 0.5; } }
                    @media (min-width: 501px) and (max-width: 700px) { .arcade-page { zoom: 0.75; } }
                    @media (min-width: 701px) and (max-width: 900px) { .arcade-page { zoom: 0.95; } }
                    @media (min-width: 901px) { .arcade-page { zoom: 1.2; } }
                    @media (min-width: 1400px) { .arcade-page { zoom: 1.5; } }
                `}</style>
            </Head>

            <div className="arcade-page" style={styles.container}>
                {/* Casino Background */}
                <div style={styles.casinoBg} />
                <div style={styles.casinoOverlay} />
                <div style={styles.goldBorder} />

                <UniversalHeader pageDepth={1} />

                <div style={styles.content}>
                    <AnimatePresence mode="wait">
                        {gamePhase === 'lobby' && (
                            <motion.div
                                key="lobby"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                            >
                                {/* Header */}
                                <div style={styles.arcadeHeader}>
                                    <div style={styles.headerLeft}>
                                        <h1 style={styles.arcadeTitle}>
                                            <span style={styles.diamondIcon}>💎</span> DIAMOND ARCADE <span style={{fontSize: '10px', opacity: 0.5}}>v2.0.2</span>
                                        </h1>
                                    </div>
                                    <div style={styles.headerRight}>
                                        <div style={styles.balanceBox}>
                                            <span style={styles.balanceLabel}>Balance:</span>
                                            <span style={styles.balanceValue}>{balance.toLocaleString()} 💎</span>
                                        </div>
                                        {streak > 0 && (
                                            <div style={styles.streakBox}>
                                                <span style={styles.streakFire}>🔥</span>
                                                <span style={styles.streakText}>STREAK x{streak}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Progressive Jackpot Hero */}
                                <div style={styles.jackpotHero}>
                                    <div style={styles.jackpotInner}>
                                        <div style={styles.jackpotLabel}>
                                            <span style={styles.jackpotIcon}>🎰</span> PROGRESSIVE JACKPOT
                                        </div>
                                        <div style={styles.jackpotDiamond}>
                                            <motion.div
                                                animate={{ y: [0, -10, 0], rotate: [0, 5, 0] }}
                                                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                                                style={styles.bigDiamond}
                                            >
                                                💎
                                            </motion.div>
                                            <div style={styles.diamondShards}>
                                                {[...Array(8)].map((_, i) => (
                                                    <motion.div
                                                        key={i}
                                                        style={{
                                                            ...styles.shard,
                                                            left: `${20 + i * 10}%`,
                                                            animationDelay: `${i * 0.2}s`
                                                        }}
                                                        animate={{
                                                            opacity: [0.3, 0.8, 0.3],
                                                            scale: [0.8, 1.2, 0.8],
                                                        }}
                                                        transition={{ duration: 2, repeat: Infinity, delay: i * 0.2 }}
                                                    >
                                                        ✦
                                                    </motion.div>
                                                ))}
                                            </div>
                                        </div>
                                        <div style={styles.jackpotAmount}>{jackpot.toLocaleString()} 💎</div>
                                        <div style={styles.jackpotTimer}>Next Draw: 3d 14h 22m</div>
                                        <div style={styles.jackpotSubtext}>Perfect Gauntlet Run = Jackpot Entry</div>
                                    </div>
                                </div>

                                {/* Today's Featured Games */}
                                <div style={styles.section}>
                                    <div style={styles.sectionHeader}>
                                        <span style={styles.sectionTitle}>TODAY'S FEATURED GAMES</span>
                                        <span style={styles.resetTimer}>Resets in {String(resetTime.hours).padStart(2, '0')}:{String(resetTime.minutes).padStart(2, '0')}:{String(resetTime.seconds).padStart(2, '0')}</span>
                                    </div>
                                    <div style={styles.featuredGrid}>
                                        {todaysFeatured.map((game, idx) => (
                                            <motion.div
                                                key={game.id}
                                                style={styles.gameCard}
                                                whileHover={{ scale: 1.03, y: -5 }}
                                                whileTap={{ scale: 0.98 }}
                                                onClick={() => startGame(game.id)}
                                            >
                                                <div style={{ ...styles.gameBadge, background: game.badgeColor }}>
                                                    {game.badge}
                                                </div>
                                                <div style={styles.gameCardInner}>
                                                    <div style={styles.gameIconLarge}>{game.icon}</div>
                                                    <div style={styles.gameNameLarge}>{game.name.toUpperCase()}</div>
                                                    <div style={styles.gameEntryFee}>
                                                        <span style={styles.entryAmount}>{game.entryFee}</span>
                                                        <span style={styles.entryDiamond}>💎</span>
                                                    </div>
                                                </div>
                                                <div style={styles.gameCardGlow} />
                                            </motion.div>
                                        ))}
                                    </div>
                                </div>

                                {/* Daily Challenge */}
                                <div style={styles.challengeBanner}>
                                    <div style={styles.challengeLeft}>
                                        <div style={styles.challengeLabel}>DAILY CHALLENGE</div>
                                        <div style={styles.challengeName}>Board Nuts Blitz</div>
                                    </div>
                                    <div style={styles.challengeCenter}>
                                        <div style={styles.challengePrize}>Top 100 Split 10,000 💎</div>
                                        <div style={styles.challengeStats}>
                                            Your Rank: <span style={styles.highlight}>#234</span> •
                                            Best Score: <span style={styles.highlight}>847 pts</span> •
                                            Leader: <span style={styles.gold}>1,203 pts</span>
                                        </div>
                                    </div>
                                    <motion.button
                                        style={styles.challengeBtn}
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                    >
                                        PLAY NOW - 25 💎
                                    </motion.button>
                                </div>

                                {/* Heads-Up Duels */}
                                <div style={styles.section}>
                                    <div style={styles.sectionHeader}>
                                        <span style={styles.sectionTitle}>HEADS-UP DUELS</span>
                                        <span style={styles.playersWaiting}>3 Players Waiting</span>
                                    </div>
                                    <div style={styles.duelsGrid}>
                                        {[
                                            { name: 'QUICK DUEL', entry: 25, prize: 45 },
                                            { name: 'BEST OF 3', entry: 50, prize: 90 },
                                            { name: 'HIGH ROLLER', entry: 100, prize: 180, isHighRoller: true }
                                        ].map((duel, idx) => (
                                            <motion.div
                                                key={idx}
                                                style={{
                                                    ...styles.duelCard,
                                                    ...(duel.isHighRoller ? styles.highRollerCard : {})
                                                }}
                                                whileHover={{ scale: 1.03 }}
                                            >
                                                <div style={styles.duelName}>{duel.name}</div>
                                                {duel.isHighRoller && <div style={styles.duelCrown}>👑</div>}
                                                <div style={styles.duelEntry}>{duel.entry} 💎</div>
                                                <div style={styles.duelPrize}>Winner Takes {duel.prize} 💎</div>
                                                <motion.button
                                                    style={styles.findMatchBtn}
                                                    whileHover={{ scale: 1.05 }}
                                                    whileTap={{ scale: 0.95 }}
                                                >
                                                    FIND MATCH
                                                </motion.button>
                                            </motion.div>
                                        ))}
                                    </div>
                                </div>

                                {/* Player Stats Strip */}
                                <div style={styles.statsStrip}>
                                    <div style={styles.statBlock}>
                                        <span style={styles.statLabel}>Today:</span>
                                        <span style={{
                                            ...styles.statValue,
                                            color: stats.todayProfit >= 0 ? '#22c55e' : '#ef4444'
                                        }}>
                                            {stats.todayProfit >= 0 ? '+' : ''}{stats.todayProfit} 💎
                                        </span>
                                    </div>
                                    <div style={styles.statDivider} />
                                    <div style={styles.statBlock}>
                                        <span style={styles.statLabel}>STREAK x{streak}</span>
                                        <span style={styles.statBonus}>NEXT: 1.5x</span>
                                    </div>
                                    <div style={styles.statDivider} />
                                    <div style={styles.statBlock}>
                                        <span style={styles.statLabel}>Win Rate:</span>
                                        <span style={styles.statValue}>{stats.winRate}%</span>
                                    </div>
                                </div>

                                {/* Bottom Nav Icons */}
                                <div style={styles.bottomNav}>
                                    <div style={styles.navIcon}>⚡</div>
                                    <div style={styles.navIcon}>🎯</div>
                                    <div style={styles.navIcon}>🏆</div>
                                </div>
                            </motion.div>
                        )}

                        {gamePhase === 'playing' && activeGame && (
                            <motion.div
                                key="playing"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                            >
                                <GamePlay
                                    game={activeGame}
                                    question={currentQuestion}
                                    questionIndex={questionIndex}
                                    correctCount={correctCount}
                                    timeLeft={timeLeft}
                                    onAnswer={handleAnswer}
                                />
                            </motion.div>
                        )}

                        {gamePhase === 'result' && gameResult && (
                            <motion.div
                                key="result"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0 }}
                            >
                                <GameResult
                                    game={activeGame}
                                    result={gameResult}
                                    correctCount={correctCount}
                                    onPlayAgain={() => startGame(activeGame.id)}
                                    onReturnToLobby={returnToLobby}
                                    balance={balance}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </PageTransition>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// GAMEPLAY COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function GamePlay({ game, question, questionIndex, correctCount, timeLeft, onAnswer }) {
    if (!question) return null;

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
    };

    const renderCard = (card) => {
        const { display, color } = formatCard(card);
        return <div style={{ ...gameStyles.card, color }}>{display}</div>;
    };

    return (
        <div style={gameStyles.container}>
            <div style={gameStyles.header}>
                <div style={gameStyles.gameInfo}>
                    <span style={gameStyles.icon}>{game.icon}</span>
                    <span style={gameStyles.name}>{game.name}</span>
                </div>
                <div style={gameStyles.progress}>
                    <span>Q{questionIndex + 1}/{game.questionsCount}</span>
                    <span style={gameStyles.correct}>✓ {correctCount}</span>
                </div>
                <div style={{ ...gameStyles.timer, color: timeLeft <= 10 ? '#ef4444' : '#fbbf24' }}>
                    {formatTime(timeLeft)}
                </div>
            </div>

            <div style={gameStyles.questionArea}>
                {game.id === 'hand-snap' && (
                    <div style={gameStyles.handSnapContainer}>
                        <div style={gameStyles.boardLabel}>BOARD</div>
                        <div style={gameStyles.boardCards}>
                            {question.board.map((card, i) => <div key={i}>{renderCard(card)}</div>)}
                        </div>
                        <div style={gameStyles.vsLabel}>WHICH HAND WINS?</div>
                        <div style={gameStyles.handsRow}>
                            <motion.button
                                style={gameStyles.handButton}
                                whileHover={{ scale: 1.05, boxShadow: '0 0 30px rgba(251, 191, 36, 0.5)' }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => onAnswer(0)}
                            >
                                <div style={gameStyles.handLabel}>HAND 1</div>
                                <div style={gameStyles.handCards}>
                                    {question.hand1.cards.map((card, i) => <div key={i}>{renderCard(card)}</div>)}
                                </div>
                            </motion.button>
                            <div style={gameStyles.vsText}>VS</div>
                            <motion.button
                                style={gameStyles.handButton}
                                whileHover={{ scale: 1.05, boxShadow: '0 0 30px rgba(251, 191, 36, 0.5)' }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => onAnswer(1)}
                            >
                                <div style={gameStyles.handLabel}>HAND 2</div>
                                <div style={gameStyles.handCards}>
                                    {question.hand2.cards.map((card, i) => <div key={i}>{renderCard(card)}</div>)}
                                </div>
                            </motion.button>
                        </div>
                    </div>
                )}

                {game.id === 'board-nuts' && (
                    <div style={gameStyles.boardNutsContainer}>
                        <div style={gameStyles.boardLabel}>BOARD</div>
                        <div style={gameStyles.boardCards}>
                            {question.board.map((card, i) => <div key={i}>{renderCard(card)}</div>)}
                        </div>
                        <div style={gameStyles.vsLabel}>TAP THE NUTS</div>
                        <div style={gameStyles.optionsGrid}>
                            {question.options.map((hand, i) => (
                                <motion.button
                                    key={i}
                                    style={gameStyles.optionButton}
                                    whileHover={{ scale: 1.05, borderColor: '#fbbf24' }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => onAnswer(i)}
                                >
                                    <div style={gameStyles.optionCards}>
                                        {hand.map((card, j) => <div key={j}>{renderCard(card)}</div>)}
                                    </div>
                                </motion.button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// RESULT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function GameResult({ game, result, correctCount, onPlayAgain, onReturnToLobby, balance }) {
    return (
        <div style={resultStyles.container}>
            <motion.div
                style={{ ...resultStyles.card, borderColor: result.won ? '#fbbf24' : '#ef4444' }}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
            >
                <div style={resultStyles.icon}>{result.won ? '🎉' : '💀'}</div>
                <div style={{ ...resultStyles.title, color: result.won ? '#fbbf24' : '#ef4444' }}>
                    {result.won ? 'YOU WIN!' : 'BUST'}
                </div>
                <div style={resultStyles.stats}>
                    <div style={resultStyles.stat}>
                        <span style={resultStyles.statLabel}>Correct</span>
                        <span style={resultStyles.statValue}>{correctCount}/{game.questionsCount}</span>
                    </div>
                    <div style={resultStyles.stat}>
                        <span style={resultStyles.statLabel}>Accuracy</span>
                        <span style={resultStyles.statValue}>{Math.round(result.accuracy * 100)}%</span>
                    </div>
                </div>
                {result.won && (
                    <div style={resultStyles.prizeBox}>
                        <div style={resultStyles.prizeRow}>
                            <span>Base Prize</span><span>{result.basePrize} 💎</span>
                        </div>
                        <div style={resultStyles.prizeRow}>
                            <span>House Rake (10%)</span><span style={{ color: '#ef4444' }}>-{result.rake} 💎</span>
                        </div>
                        {result.streakBonus > 0 && (
                            <div style={resultStyles.prizeRow}>
                                <span>🔥 Streak Bonus</span><span style={{ color: '#fbbf24' }}>+{result.streakBonus} 💎</span>
                            </div>
                        )}
                        <div style={resultStyles.prizeTotal}>
                            <span>TOTAL WON</span><span style={{ color: '#22c55e' }}>{result.finalPrize} 💎</span>
                        </div>
                    </div>
                )}
                <div style={resultStyles.balance}>New Balance: <span style={resultStyles.balanceValue}>{balance.toLocaleString()} 💎</span></div>
                <div style={resultStyles.actions}>
                    <motion.button
                        style={resultStyles.playAgainBtn}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={onPlayAgain}
                    >
                        Play Again ({game.entryFee} 💎)
                    </motion.button>
                    <motion.button
                        style={resultStyles.backBtn}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={onReturnToLobby}
                    >
                        Back to Arcade
                    </motion.button>
                </div>
            </motion.div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES - PREMIUM CASINO AESTHETIC
// ═══════════════════════════════════════════════════════════════════════════

const styles = {
    container: {
        minHeight: '100vh',
        background: '#0c0c0c',
        fontFamily: 'Inter, -apple-system, sans-serif',
        position: 'relative',
        overflow: 'hidden',
    },
    casinoBg: {
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: `
            radial-gradient(ellipse at 30% 20%, rgba(251, 191, 36, 0.08) 0%, transparent 50%),
            radial-gradient(ellipse at 70% 80%, rgba(220, 38, 38, 0.06) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 50%, rgba(59, 130, 246, 0.04) 0%, transparent 60%),
            linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 50%, #0f0f0f 100%)
        `,
        pointerEvents: 'none',
    },
    casinoOverlay: {
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23fbbf24' fill-opacity='0.02'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        pointerEvents: 'none',
    },
    goldBorder: {
        position: 'fixed',
        top: 0, left: 0, right: 0,
        height: '3px',
        background: 'linear-gradient(90deg, transparent, #fbbf24, #f59e0b, #fbbf24, transparent)',
        zIndex: 100,
    },
    content: {
        position: 'relative',
        zIndex: 1,
        padding: '80px 20px 40px',
    },
    arcadeHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
        padding: '16px 20px',
        background: 'linear-gradient(180deg, rgba(251, 191, 36, 0.1) 0%, rgba(0,0,0,0.4) 100%)',
        borderRadius: '12px',
        border: '1px solid rgba(251, 191, 36, 0.3)',
    },
    headerLeft: {},
    arcadeTitle: {
        fontFamily: 'Cinzel, serif',
        fontSize: '28px',
        fontWeight: 800,
        color: '#fbbf24',
        textShadow: '0 0 30px rgba(251, 191, 36, 0.5)',
        margin: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
    },
    diamondIcon: {
        fontSize: '32px',
    },
    headerRight: {
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
    },
    balanceBox: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    },
    balanceLabel: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: '14px',
    },
    balanceValue: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '20px',
        fontWeight: 700,
        color: '#fff',
        textShadow: '0 0 10px rgba(59, 130, 246, 0.5)',
    },
    streakBox: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 16px',
        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.3), rgba(251, 191, 36, 0.3))',
        borderRadius: '8px',
        border: '1px solid #fbbf24',
    },
    streakFire: {
        fontSize: '20px',
    },
    streakText: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '14px',
        fontWeight: 700,
        color: '#fbbf24',
    },
    jackpotHero: {
        background: 'linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%)',
        borderRadius: '20px',
        padding: '4px',
        marginBottom: '24px',
        border: '2px solid',
        borderImage: 'linear-gradient(180deg, #fbbf24, #b45309) 1',
    },
    jackpotInner: {
        background: 'linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(26,26,46,0.9) 100%)',
        borderRadius: '16px',
        padding: '30px',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
    },
    jackpotLabel: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '14px',
        fontWeight: 700,
        color: '#fbbf24',
        letterSpacing: '4px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
    },
    jackpotIcon: {
        fontSize: '20px',
    },
    jackpotDiamond: {
        position: 'relative',
        height: '120px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    bigDiamond: {
        fontSize: '80px',
        filter: 'drop-shadow(0 0 30px rgba(59, 130, 246, 0.8))',
    },
    diamondShards: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        pointerEvents: 'none',
    },
    shard: {
        position: 'absolute',
        top: '50%',
        color: '#60a5fa',
        fontSize: '16px',
    },
    jackpotAmount: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '52px',
        fontWeight: 900,
        color: '#fff',
        textShadow: '0 0 40px rgba(59, 130, 246, 0.6)',
        marginBottom: '8px',
    },
    jackpotTimer: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '14px',
        color: 'rgba(255,255,255,0.6)',
        marginBottom: '8px',
    },
    jackpotSubtext: {
        fontSize: '12px',
        color: 'rgba(255,255,255,0.4)',
        fontStyle: 'italic',
    },
    section: {
        marginBottom: '24px',
    },
    sectionHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
        padding: '0 4px',
    },
    sectionTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '14px',
        fontWeight: 700,
        color: '#fbbf24',
        letterSpacing: '2px',
    },
    resetTimer: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '12px',
        color: 'rgba(255,255,255,0.5)',
    },
    playersWaiting: {
        fontSize: '12px',
        color: '#22c55e',
    },
    featuredGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '12px',
    },
    gameCard: {
        position: 'relative',
        background: 'linear-gradient(180deg, #1f1f2e 0%, #0f0f1a 100%)',
        borderRadius: '16px',
        padding: '20px 12px',
        border: '2px solid rgba(251, 191, 36, 0.3)',
        cursor: 'pointer',
        overflow: 'hidden',
        transition: 'all 0.3s ease',
    },
    gameBadge: {
        position: 'absolute',
        top: '10px',
        right: '10px',
        padding: '4px 8px',
        borderRadius: '6px',
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '9px',
        fontWeight: 700,
        color: '#000',
    },
    gameCardInner: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
    },
    gameIconLarge: {
        fontSize: '48px',
        filter: 'drop-shadow(0 0 20px rgba(251, 191, 36, 0.4))',
    },
    gameNameLarge: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '12px',
        fontWeight: 700,
        color: '#fff',
        textAlign: 'center',
    },
    gameEntryFee: {
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '6px 12px',
        background: 'rgba(0,0,0,0.4)',
        borderRadius: '8px',
        border: '1px solid rgba(251, 191, 36, 0.3)',
    },
    entryAmount: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '18px',
        fontWeight: 700,
        color: '#fbbf24',
    },
    entryDiamond: {
        fontSize: '16px',
    },
    gameCardGlow: {
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        height: '50%',
        background: 'linear-gradient(180deg, transparent, rgba(251, 191, 36, 0.1))',
        pointerEvents: 'none',
    },
    challengeBanner: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 24px',
        background: 'linear-gradient(90deg, rgba(34, 197, 94, 0.15), rgba(59, 130, 246, 0.15))',
        borderRadius: '16px',
        border: '2px solid rgba(34, 197, 94, 0.4)',
        marginBottom: '24px',
    },
    challengeLeft: {},
    challengeLabel: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '10px',
        color: '#22c55e',
        letterSpacing: '2px',
        marginBottom: '4px',
    },
    challengeName: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '18px',
        fontWeight: 700,
        color: '#fff',
    },
    challengeCenter: {
        textAlign: 'center',
    },
    challengePrize: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '14px',
        color: '#fbbf24',
        marginBottom: '4px',
    },
    challengeStats: {
        fontSize: '12px',
        color: 'rgba(255,255,255,0.6)',
    },
    highlight: {
        color: '#fff',
        fontWeight: 600,
    },
    gold: {
        color: '#fbbf24',
        fontWeight: 600,
    },
    challengeBtn: {
        padding: '12px 24px',
        background: 'linear-gradient(135deg, #22c55e, #16a34a)',
        border: 'none',
        borderRadius: '10px',
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '12px',
        fontWeight: 700,
        color: '#fff',
        cursor: 'pointer',
        boxShadow: '0 0 20px rgba(34, 197, 94, 0.4)',
    },
    duelsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '16px',
    },
    duelCard: {
        background: 'linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%)',
        borderRadius: '16px',
        padding: '24px 16px',
        textAlign: 'center',
        border: '2px solid rgba(255,255,255,0.1)',
        position: 'relative',
    },
    highRollerCard: {
        border: '2px solid rgba(251, 191, 36, 0.5)',
        background: 'linear-gradient(180deg, rgba(251, 191, 36, 0.1), #0f0f1a 100%)',
    },
    duelName: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '14px',
        fontWeight: 700,
        color: '#fff',
        marginBottom: '8px',
    },
    duelCrown: {
        position: 'absolute',
        top: '-10px',
        right: '10px',
        fontSize: '24px',
    },
    duelEntry: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '24px',
        fontWeight: 700,
        color: '#fbbf24',
        marginBottom: '4px',
    },
    duelPrize: {
        fontSize: '12px',
        color: 'rgba(255,255,255,0.5)',
        marginBottom: '16px',
    },
    findMatchBtn: {
        width: '100%',
        padding: '10px 16px',
        background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
        border: 'none',
        borderRadius: '8px',
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '11px',
        fontWeight: 700,
        color: '#fff',
        cursor: 'pointer',
    },
    statsStrip: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
        padding: '16px 24px',
        background: 'rgba(0,0,0,0.4)',
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.1)',
        marginBottom: '20px',
    },
    statBlock: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    },
    statLabel: {
        fontSize: '13px',
        color: 'rgba(255,255,255,0.6)',
    },
    statValue: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '15px',
        fontWeight: 700,
        color: '#fff',
    },
    statBonus: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '12px',
        color: '#22c55e',
    },
    statDivider: {
        width: '1px',
        height: '20px',
        background: 'rgba(255,255,255,0.2)',
    },
    bottomNav: {
        display: 'flex',
        justifyContent: 'center',
        gap: '40px',
        paddingTop: '16px',
    },
    navIcon: {
        width: '50px',
        height: '50px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '24px',
        background: 'linear-gradient(180deg, rgba(251, 191, 36, 0.2), rgba(0,0,0,0.4))',
        borderRadius: '12px',
        border: '2px solid rgba(251, 191, 36, 0.3)',
        cursor: 'pointer',
    },
};

const gameStyles = {
    container: {
        background: 'linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%)',
        borderRadius: '20px',
        padding: '24px',
        border: '2px solid rgba(251, 191, 36, 0.3)',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
        paddingBottom: '16px',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
    },
    gameInfo: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
    },
    icon: { fontSize: '32px' },
    name: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '18px',
        fontWeight: 700,
        color: '#fff',
    },
    progress: {
        display: 'flex',
        gap: '16px',
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '14px',
        color: 'rgba(255,255,255,0.7)',
    },
    correct: { color: '#22c55e' },
    timer: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '28px',
        fontWeight: 700,
    },
    questionArea: { minHeight: '350px' },
    handSnapContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '20px',
    },
    boardLabel: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '12px',
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: '2px',
    },
    boardCards: {
        display: 'flex',
        gap: '8px',
    },
    card: {
        width: '56px',
        height: '78px',
        background: '#fff',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '22px',
        fontWeight: 700,
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    },
    vsLabel: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '16px',
        color: '#fbbf24',
        letterSpacing: '2px',
    },
    handsRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '24px',
    },
    handButton: {
        background: 'linear-gradient(180deg, rgba(251, 191, 36, 0.1), rgba(0,0,0,0.4))',
        border: '2px solid rgba(251, 191, 36, 0.4)',
        borderRadius: '16px',
        padding: '20px 24px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },
    handLabel: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '12px',
        color: 'rgba(255,255,255,0.7)',
        marginBottom: '12px',
        textAlign: 'center',
    },
    handCards: {
        display: 'flex',
        gap: '8px',
    },
    vsText: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '24px',
        fontWeight: 900,
        color: '#fff',
    },
    boardNutsContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '20px',
    },
    optionsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '16px',
    },
    optionButton: {
        background: 'rgba(0,0,0,0.4)',
        border: '2px solid rgba(255,255,255,0.2)',
        borderRadius: '12px',
        padding: '16px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },
    optionCards: {
        display: 'flex',
        gap: '8px',
        justifyContent: 'center',
    },
};

const resultStyles = {
    container: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '500px',
    },
    card: {
        background: 'linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%)',
        border: '3px solid',
        borderRadius: '24px',
        padding: '40px',
        maxWidth: '400px',
        width: '100%',
        textAlign: 'center',
    },
    icon: { fontSize: '64px', marginBottom: '16px' },
    title: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '32px',
        fontWeight: 900,
        marginBottom: '24px',
    },
    stats: {
        display: 'flex',
        justifyContent: 'center',
        gap: '32px',
        marginBottom: '24px',
    },
    stat: {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
    },
    statLabel: {
        fontSize: '12px',
        color: 'rgba(255,255,255,0.5)',
        textTransform: 'uppercase',
    },
    statValue: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '20px',
        fontWeight: 700,
        color: '#fff',
    },
    prizeBox: {
        background: 'rgba(0,0,0,0.3)',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '20px',
    },
    prizeRow: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '8px 0',
        fontSize: '14px',
        color: 'rgba(255,255,255,0.7)',
    },
    prizeTotal: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '12px 0 0',
        marginTop: '8px',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '16px',
        fontWeight: 700,
        color: '#fff',
    },
    balance: {
        fontSize: '14px',
        color: 'rgba(255,255,255,0.6)',
        marginBottom: '24px',
    },
    balanceValue: {
        fontFamily: 'Orbitron, sans-serif',
        fontWeight: 700,
        color: '#fff',
    },
    actions: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
    },
    playAgainBtn: {
        padding: '14px 24px',
        background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
        border: 'none',
        borderRadius: '12px',
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '14px',
        fontWeight: 700,
        color: '#000',
        cursor: 'pointer',
    },
    backBtn: {
        padding: '14px 24px',
        background: 'transparent',
        border: '2px solid rgba(255,255,255,0.3)',
        borderRadius: '12px',
        fontSize: '14px',
        fontWeight: 600,
        color: 'rgba(255,255,255,0.7)',
        cursor: 'pointer',
    },
};

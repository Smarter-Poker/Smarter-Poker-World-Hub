/* ═══════════════════════════════════════════════════════════════════════════
   DIAMOND ARCADE — Risk Diamonds. Test Skills. Beat The House.

   A casino-style skill gaming floor where users gamble diamonds in
   fast-paced poker knowledge games. Daily rotation keeps it fresh.
   10% house rake on all winnings.
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
    // State
    const [user, setUser] = useState(null);
    const [balance, setBalance] = useState(0);
    const [streak, setStreak] = useState(0);
    const [stats, setStats] = useState({ todayProfit: 0, gamesPlayed: 0, winRate: 0 });
    const [jackpot, setJackpot] = useState(10000);
    const [resetTime, setResetTime] = useState({ hours: 0, minutes: 0, seconds: 0 });
    const [featuredGames, setFeaturedGames] = useState({ games: [], bonusGame: '' });

    // Game state
    const [activeGame, setActiveGame] = useState(null);
    const [gamePhase, setGamePhase] = useState('lobby'); // lobby, playing, result
    const [sessionId, setSessionId] = useState(null);
    const [currentQuestion, setCurrentQuestion] = useState(null);
    const [questionIndex, setQuestionIndex] = useState(0);
    const [correctCount, setCorrectCount] = useState(0);
    const [timeLeft, setTimeLeft] = useState(0);
    const [gameResult, setGameResult] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [mysteryMultiplier, setMysteryMultiplier] = useState(1);
    const [showMultiplierReveal, setShowMultiplierReveal] = useState(false);

    // Leaderboard
    const [leaderboard, setLeaderboard] = useState([]);
    const [leaderboardPeriod, setLeaderboardPeriod] = useState('daily');

    // Refs
    const timerRef = useRef(null);
    const questionStartTime = useRef(0);

    // ═══════════════════════════════════════════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════════════════════════════════════════

    useEffect(() => {
        loadUser();
        loadFeaturedGames();
        loadJackpot();
        loadLeaderboard();

        // Update reset timer every second
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

    function loadFeaturedGames() {
        const featured = getDailyFeaturedGames();
        setFeaturedGames(featured);
    }

    async function loadJackpot() {
        const { data } = await supabase.from('arcade_jackpot').select('pool_amount').single();
        if (data) setJackpot(data.pool_amount);
    }

    async function loadLeaderboard() {
        const { data } = await supabase.rpc('get_arcade_leaderboard', {
            p_period: leaderboardPeriod,
            p_limit: 10
        });
        if (data) setLeaderboard(data);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GAME FLOW
    // ═══════════════════════════════════════════════════════════════════════════

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

        setIsLoading(true);

        // Call database to start session and deduct entry fee
        const { data, error } = await supabase.rpc('start_arcade_game', {
            p_user_id: user.id,
            p_game_id: gameId
        });

        if (error || !data?.success) {
            alert(data?.error || 'Failed to start game');
            setIsLoading(false);
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
        setIsLoading(false);

        // Generate first question
        generateQuestion(gameId);

        // Start timer
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
            case 'double-or-nothing':
                setCurrentQuestion(generateDoubleOrNothingQuestion());
                break;
            case 'the-gauntlet':
                setCurrentQuestion(generateGauntletQuestion(questionIndex));
                break;
            case 'mystery-box':
                setCurrentQuestion(generateMysteryBoxQuestion());
                break;
            default:
                setCurrentQuestion(generateHandSnapQuestion());
        }
    }

    function generateDoubleOrNothingQuestion() {
        const questions = [
            {
                question: "BTN opens 2.5bb, you're in BB with A5s. GTO play?",
                options: ["Fold", "Call", "3-bet to 10bb", "Shove"],
                correct: 2,
                explanation: "A5s is a standard 3-bet from BB vs BTN"
            },
            {
                question: "You have AA UTG 100bb deep. Standard open size?",
                options: ["2bb", "2.5bb", "3bb", "Limp"],
                correct: 1,
                explanation: "2.5bb is standard UTG in most GTO solutions"
            },
            {
                question: "Which hand has more equity vs a random hand?",
                options: ["AKo", "22", "KQs", "JTs"],
                correct: 0,
                explanation: "AKo has ~65% equity vs a random hand"
            }
        ];
        return questions[Math.floor(Math.random() * questions.length)];
    }

    function generateGauntletQuestion(index) {
        // Progressive difficulty
        const easyQuestions = [
            { question: "How many cards in a standard deck?", options: ["48", "52", "54", "56"], correct: 1 },
            { question: "What beats a flush?", options: ["Straight", "Three of a kind", "Full house", "Two pair"], correct: 2 },
            { question: "Who acts first preflop?", options: ["Button", "Small Blind", "Big Blind", "UTG"], correct: 3 }
        ];

        const mediumQuestions = [
            { question: "AKo vs 22 all-in preflop. Favorite?", options: ["AKo ~55%", "22 ~52%", "50/50", "AKo ~65%"], correct: 1 },
            { question: "What's the minimum raise if villain bets 100?", options: ["100", "150", "200", "Any"], correct: 0 },
            { question: "What's a 'gutshot' straight draw?", options: ["4 outs", "8 outs", "9 outs", "12 outs"], correct: 0 }
        ];

        const hardQuestions = [
            { question: "What % of hands is a standard UTG range?", options: ["5%", "10%", "15%", "20%"], correct: 2 },
            { question: "Pot is 100, you bet 75. What % pot?", options: ["50%", "66%", "75%", "100%"], correct: 2 },
            { question: "How many combos of AKo are there?", options: ["8", "12", "16", "24"], correct: 1 }
        ];

        if (index < 3) return easyQuestions[index % easyQuestions.length];
        if (index < 7) return mediumQuestions[(index - 3) % mediumQuestions.length];
        return hardQuestions[(index - 7) % hardQuestions.length];
    }

    function generateMysteryBoxQuestion() {
        const questions = [
            { question: "What's pocket Jacks called?", options: ["Hooks", "Ladies", "Cowboys", "Rockets"], correct: 0 },
            { question: "The 'dead man's hand' is Aces and...?", options: ["Kings", "Queens", "Eights", "Twos"], correct: 2 },
            { question: "Who won the 2003 WSOP Main Event?", options: ["Phil Ivey", "Chris Moneymaker", "Phil Hellmuth", "Doyle Brunson"], correct: 1 },
            { question: "What position is 'hijack'?", options: ["Right of button", "Left of button", "2 left of button", "3 left of button"], correct: 2 },
            { question: "Standard tournament starting stack?", options: ["50bb", "100bb", "150bb", "200bb"], correct: 2 }
        ];
        return questions[Math.floor(Math.random() * questions.length)];
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
        const responseTime = Date.now() - questionStartTime.current;
        let isCorrect = false;

        // Check answer based on game type
        if (activeGame.id === 'hand-snap') {
            isCorrect = (answerIndex + 1) === currentQuestion.correctAnswer;
        } else if (activeGame.id === 'board-nuts' || activeGame.id === 'chip-math') {
            isCorrect = answerIndex === currentQuestion.correctIndex;
        } else {
            isCorrect = answerIndex === currentQuestion.correct;
        }

        // Play sound effect
        playSound(isCorrect ? 'correct' : 'wrong');

        if (isCorrect) {
            setCorrectCount(prev => prev + 1);

            // Visual feedback
            flashCorrect();
        } else {
            flashWrong();

            // For Gauntlet, one wrong = game over
            if (activeGame.id === 'the-gauntlet') {
                endGame(false);
                return;
            }
        }

        // Next question or end game
        const newIndex = questionIndex + 1;
        if (newIndex >= activeGame.questionsCount) {
            // For Double or Nothing
            if (activeGame.id === 'double-or-nothing') {
                endGame(isCorrect);
                return;
            }

            // For Mystery Box, reveal multiplier before ending
            if (activeGame.id === 'mystery-box') {
                revealMysteryMultiplier();
                return;
            }

            endGame(true);
        } else {
            setQuestionIndex(newIndex);
            generateQuestion(activeGame.id);
        }
    }

    function revealMysteryMultiplier() {
        const multiplier = rollMysteryMultiplier();
        setMysteryMultiplier(multiplier);
        setShowMultiplierReveal(true);

        // Dramatic reveal
        setTimeout(() => {
            setShowMultiplierReveal(false);
            endGame(true, multiplier);
        }, 2000);
    }

    async function endGame(won, multiplier = 1) {
        if (timerRef.current) clearInterval(timerRef.current);

        let result;
        const totalQuestions = activeGame.questionsCount;

        // Calculate result based on game type
        if (activeGame.id === 'double-or-nothing') {
            result = calculateDoubleOrNothing(won && correctCount >= 1, activeGame.entryFee);
        } else if (activeGame.id === 'the-gauntlet') {
            result = calculateGauntlet(correctCount, activeGame.entryFee);
        } else {
            result = calculatePrize(activeGame, correctCount, totalQuestions, streak, multiplier);
        }

        setGameResult(result);
        setGamePhase('result');

        // Update balance and streak
        if (result.won) {
            setBalance(prev => prev + result.finalPrize);
            setStreak(result.newStreak);

            // Celebration!
            if (result.finalPrize >= 100) {
                triggerConfetti();
            }
        } else {
            setStreak(0);
        }

        // Save to database
        await supabase.rpc('complete_arcade_game', {
            p_session_id: sessionId,
            p_score: correctCount * 100,
            p_correct_count: correctCount,
            p_time_spent_ms: (activeGame.durationSeconds - timeLeft) * 1000,
            p_multiplier: multiplier
        });

        // Refresh stats
        if (user) loadUserStats(user.id);
    }

    function returnToLobby() {
        setActiveGame(null);
        setGamePhase('lobby');
        setCurrentQuestion(null);
        setGameResult(null);
        loadLeaderboard();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VISUAL EFFECTS
    // ═══════════════════════════════════════════════════════════════════════════

    function playSound(type) {
        // Sound effects would go here
    }

    function flashCorrect() {
        // Green flash effect
    }

    function flashWrong() {
        // Red flash effect
    }

    function triggerConfetti() {
        confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#fbbf24', '#22c55e', '#3b82f6', '#a855f7']
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════════

    return (
        <PageTransition>
            <Head>
                <title>Diamond Arcade - Smarter.Poker</title>
                <meta name="viewport" content="width=800, user-scalable=no" />
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
                <style>{`
                    .arcade-page { width: 800px; max-width: 800px; margin: 0 auto; overflow-x: hidden; }
                    @media (max-width: 500px) { .arcade-page { zoom: 0.5; } }
                    @media (min-width: 501px) and (max-width: 700px) { .arcade-page { zoom: 0.75; } }
                    @media (min-width: 701px) and (max-width: 900px) { .arcade-page { zoom: 0.95; } }
                    @media (min-width: 901px) { .arcade-page { zoom: 1.2; } }
                    @media (min-width: 1400px) { .arcade-page { zoom: 1.5; } }
                `}</style>
            </Head>

            <div className="arcade-page" style={styles.container}>
                {/* Background Effects */}
                <div style={styles.bgGrid} />
                <div style={styles.bgGlow} />

                <UniversalHeader pageDepth={1} />

                <div style={styles.content}>
                    {/* Header with Balance & Streak */}
                    <div style={styles.header}>
                        <div style={styles.titleSection}>
                            <h1 style={styles.title}>DIAMOND ARCADE</h1>
                            <p style={styles.subtitle}>Risk Diamonds. Test Skills. Beat The House.</p>
                        </div>
                        <div style={styles.statsBar}>
                            <div style={styles.statItem}>
                                <span style={styles.statLabel}>Balance</span>
                                <span style={styles.statValue}>{balance.toLocaleString()} <span style={styles.diamond}>💎</span></span>
                            </div>
                            <div style={styles.statItem}>
                                <span style={styles.statLabel}>Streak</span>
                                <span style={{ ...styles.statValue, color: streak > 0 ? '#fbbf24' : '#fff' }}>
                                    {streak > 0 ? `🔥 ${streak}` : '0'}
                                </span>
                            </div>
                            <div style={styles.statItem}>
                                <span style={styles.statLabel}>Today</span>
                                <span style={{ ...styles.statValue, color: stats.todayProfit >= 0 ? '#22c55e' : '#ef4444' }}>
                                    {stats.todayProfit >= 0 ? '+' : ''}{stats.todayProfit} 💎
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Main Content Area */}
                    <AnimatePresence mode="wait">
                        {gamePhase === 'lobby' && (
                            <motion.div
                                key="lobby"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                            >
                                <ArcadeLobby
                                    featuredGames={featuredGames}
                                    jackpot={jackpot}
                                    resetTime={resetTime}
                                    leaderboard={leaderboard}
                                    leaderboardPeriod={leaderboardPeriod}
                                    setLeaderboardPeriod={(p) => { setLeaderboardPeriod(p); loadLeaderboard(); }}
                                    onStartGame={startGame}
                                    balance={balance}
                                    isLoading={isLoading}
                                />
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
                                    mysteryMultiplier={mysteryMultiplier}
                                    showMultiplierReveal={showMultiplierReveal}
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
// LOBBY COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function ArcadeLobby({ featuredGames, jackpot, resetTime, leaderboard, leaderboardPeriod, setLeaderboardPeriod, onStartGame, balance, isLoading }) {
    const allGames = Object.values(ARCADE_GAMES);
    const speedGames = allGames.filter(g => g.category === 'speed');
    const jackpotGames = allGames.filter(g => g.category === 'jackpot');

    return (
        <div style={styles.lobby}>
            {/* Progressive Jackpot Banner */}
            <div style={styles.jackpotBanner}>
                <div style={styles.jackpotLabel}>PROGRESSIVE JACKPOT</div>
                <div style={styles.jackpotAmount}>{jackpot.toLocaleString()} 💎</div>
                <div style={styles.jackpotInfo}>Perfect Gauntlet = Jackpot Entry | Drawn Weekly</div>
            </div>

            {/* Reset Timer */}
            <div style={styles.resetTimer}>
                Games rotate in: <span style={styles.timerValue}>
                    {String(resetTime.hours).padStart(2, '0')}:{String(resetTime.minutes).padStart(2, '0')}:{String(resetTime.seconds).padStart(2, '0')}
                </span>
            </div>

            {/* Speed Games */}
            <div style={styles.section}>
                <h2 style={styles.sectionTitle}>⚡ SPEED GAMES</h2>
                <p style={styles.sectionSubtitle}>Quick reflexes + poker knowledge</p>
                <div style={styles.gamesGrid}>
                    {speedGames.map(game => (
                        <GameCard
                            key={game.id}
                            game={game}
                            isBonus={featuredGames.bonusGame === game.id}
                            onPlay={() => onStartGame(game.id)}
                            disabled={balance < game.entryFee || isLoading}
                        />
                    ))}
                </div>
            </div>

            {/* Jackpot Games */}
            <div style={styles.section}>
                <h2 style={styles.sectionTitle}>🎰 JACKPOT GAMES</h2>
                <p style={styles.sectionSubtitle}>High risk, high reward</p>
                <div style={styles.gamesGrid}>
                    {jackpotGames.map(game => (
                        <GameCard
                            key={game.id}
                            game={game}
                            isBonus={false}
                            onPlay={() => onStartGame(game.id)}
                            disabled={balance < game.entryFee || isLoading}
                        />
                    ))}
                </div>
            </div>

            {/* Leaderboard */}
            <div style={styles.section}>
                <h2 style={styles.sectionTitle}>🏆 LEADERBOARD</h2>
                <div style={styles.leaderboardTabs}>
                    {['daily', 'weekly', 'alltime'].map(period => (
                        <button
                            key={period}
                            onClick={() => setLeaderboardPeriod(period)}
                            style={{
                                ...styles.leaderboardTab,
                                ...(leaderboardPeriod === period ? styles.leaderboardTabActive : {})
                            }}
                        >
                            {period.charAt(0).toUpperCase() + period.slice(1)}
                        </button>
                    ))}
                </div>
                <div style={styles.leaderboardList}>
                    {leaderboard.length === 0 ? (
                        <div style={styles.emptyLeaderboard}>No players yet. Be the first!</div>
                    ) : (
                        leaderboard.map((entry, idx) => (
                            <div key={idx} style={styles.leaderboardEntry}>
                                <span style={styles.leaderboardRank}>#{entry.rank}</span>
                                <span style={styles.leaderboardName}>{entry.username || 'Anonymous'}</span>
                                <span style={{
                                    ...styles.leaderboardProfit,
                                    color: entry.total_profit >= 0 ? '#22c55e' : '#ef4444'
                                }}>
                                    {entry.total_profit >= 0 ? '+' : ''}{entry.total_profit} 💎
                                </span>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* House Rules */}
            <div style={styles.houseRules}>
                <strong>House Rules:</strong> 10% rake on all winnings | 50% min accuracy to win | Streak bonuses up to 50%
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function GameCard({ game, isBonus, onPlay, disabled }) {
    return (
        <motion.div
            style={{
                ...styles.gameCard,
                borderColor: game.color,
                opacity: disabled ? 0.5 : 1
            }}
            whileHover={!disabled ? { scale: 1.02, boxShadow: `0 0 30px ${game.color}44` } : {}}
            whileTap={!disabled ? { scale: 0.98 } : {}}
        >
            {isBonus && <div style={styles.bonusBadge}>2X BONUS</div>}
            <div style={styles.gameIcon}>{game.icon}</div>
            <div style={styles.gameName}>{game.name}</div>
            <div style={styles.gameDesc}>{game.description}</div>
            <div style={styles.gameStats}>
                <span style={styles.entryFee}>{game.entryFee} 💎</span>
                <span style={styles.maxPrize}>Win up to {game.maxPrize} 💎</span>
            </div>
            <button
                onClick={onPlay}
                disabled={disabled}
                style={{
                    ...styles.playButton,
                    background: disabled ? '#333' : `linear-gradient(135deg, ${game.color}, ${game.color}88)`
                }}
            >
                {disabled ? 'Not enough 💎' : 'PLAY'}
            </button>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// GAMEPLAY COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function GamePlay({ game, question, questionIndex, correctCount, timeLeft, onAnswer, mysteryMultiplier, showMultiplierReveal }) {
    if (!question) return null;

    // Format time as MM:SS
    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
    };

    return (
        <div style={styles.gamePlayContainer}>
            {/* Game Header */}
            <div style={styles.gameHeader}>
                <div style={styles.gameInfo}>
                    <span style={styles.gamePlayIcon}>{game.icon}</span>
                    <span style={styles.gamePlayName}>{game.name}</span>
                </div>
                <div style={styles.gameProgress}>
                    <span style={styles.questionCounter}>
                        Q{questionIndex + 1}/{game.questionsCount}
                    </span>
                    <span style={styles.correctCounter}>
                        ✓ {correctCount}
                    </span>
                </div>
                <div style={{
                    ...styles.timer,
                    color: timeLeft <= 10 ? '#ef4444' : '#fff'
                }}>
                    {formatTime(timeLeft)}
                </div>
            </div>

            {/* Mystery Multiplier Reveal */}
            {showMultiplierReveal && (
                <motion.div
                    style={styles.multiplierReveal}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                >
                    <div style={styles.multiplierValue}>{mysteryMultiplier}X</div>
                    <div style={styles.multiplierLabel}>MULTIPLIER!</div>
                </motion.div>
            )}

            {/* Question Content - Varies by game type */}
            {!showMultiplierReveal && (
                <div style={styles.questionArea}>
                    {game.id === 'hand-snap' && <HandSnapGame question={question} onAnswer={onAnswer} />}
                    {game.id === 'board-nuts' && <BoardNutsGame question={question} onAnswer={onAnswer} />}
                    {game.id === 'chip-math' && <ChipMathGame question={question} onAnswer={onAnswer} />}
                    {(game.id === 'double-or-nothing' || game.id === 'the-gauntlet' || game.id === 'mystery-box') && (
                        <QuizGame question={question} onAnswer={onAnswer} />
                    )}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// HAND SNAP GAME
// ═══════════════════════════════════════════════════════════════════════════

function HandSnapGame({ question, onAnswer }) {
    const renderCard = (card) => {
        const { display, color } = formatCard(card);
        return (
            <div style={{ ...styles.card, color }}>
                {display}
            </div>
        );
    };

    return (
        <div style={styles.handSnapContainer}>
            <div style={styles.boardLabel}>BOARD</div>
            <div style={styles.boardCards}>
                {question.board.map((card, i) => (
                    <div key={i}>{renderCard(card)}</div>
                ))}
            </div>

            <div style={styles.vsLabel}>WHICH HAND WINS?</div>

            <div style={styles.handsContainer}>
                <motion.button
                    style={styles.handButton}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onAnswer(0)}
                >
                    <div style={styles.handLabel}>HAND 1</div>
                    <div style={styles.handCards}>
                        {question.hand1.cards.map((card, i) => (
                            <div key={i}>{renderCard(card)}</div>
                        ))}
                    </div>
                </motion.button>

                <div style={styles.vsText}>VS</div>

                <motion.button
                    style={styles.handButton}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onAnswer(1)}
                >
                    <div style={styles.handLabel}>HAND 2</div>
                    <div style={styles.handCards}>
                        {question.hand2.cards.map((card, i) => (
                            <div key={i}>{renderCard(card)}</div>
                        ))}
                    </div>
                </motion.button>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// BOARD NUTS GAME
// ═══════════════════════════════════════════════════════════════════════════

function BoardNutsGame({ question, onAnswer }) {
    const renderCard = (card) => {
        const { display, color } = formatCard(card);
        return <div style={{ ...styles.smallCard, color }}>{display}</div>;
    };

    return (
        <div style={styles.boardNutsContainer}>
            <div style={styles.boardLabel}>BOARD</div>
            <div style={styles.boardCards}>
                {question.board.map((card, i) => (
                    <div key={i}>{renderCard(card)}</div>
                ))}
            </div>

            <div style={styles.nutsLabel}>TAP THE NUTS</div>

            <div style={styles.optionsGrid}>
                {question.options.map((hand, i) => (
                    <motion.button
                        key={i}
                        style={styles.nutsOption}
                        whileHover={{ scale: 1.05, borderColor: '#22c55e' }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => onAnswer(i)}
                    >
                        <div style={styles.optionCards}>
                            {hand.map((card, j) => (
                                <div key={j}>{renderCard(card)}</div>
                            ))}
                        </div>
                    </motion.button>
                ))}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// CHIP MATH GAME
// ═══════════════════════════════════════════════════════════════════════════

function ChipMathGame({ question, onAnswer }) {
    return (
        <div style={styles.chipMathContainer}>
            <div style={styles.potDisplay}>
                <div style={styles.potLabel}>POT</div>
                <div style={styles.potValue}>{question.pot}</div>
            </div>

            <div style={styles.betDisplay}>
                <div style={styles.betLabel}>VILLAIN BETS</div>
                <div style={styles.betValue}>{question.bet}</div>
            </div>

            <div style={styles.mathQuestion}>
                What equity do you need to call?
            </div>

            <div style={styles.mathOptions}>
                {question.options.map((option, i) => (
                    <motion.button
                        key={i}
                        style={styles.mathOption}
                        whileHover={{ scale: 1.05, background: '#22c55e22' }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => onAnswer(i)}
                    >
                        {option}
                    </motion.button>
                ))}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// QUIZ GAME (Double or Nothing, Gauntlet, Mystery Box)
// ═══════════════════════════════════════════════════════════════════════════

function QuizGame({ question, onAnswer }) {
    return (
        <div style={styles.quizContainer}>
            <div style={styles.quizQuestion}>{question.question}</div>
            <div style={styles.quizOptions}>
                {question.options.map((option, i) => (
                    <motion.button
                        key={i}
                        style={styles.quizOption}
                        whileHover={{ scale: 1.02, borderColor: '#00D4FF' }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => onAnswer(i)}
                    >
                        {option}
                    </motion.button>
                ))}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME RESULT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function GameResult({ game, result, correctCount, onPlayAgain, onReturnToLobby, balance }) {
    return (
        <div style={styles.resultContainer}>
            <motion.div
                style={{
                    ...styles.resultCard,
                    borderColor: result.won ? '#22c55e' : '#ef4444'
                }}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
            >
                <div style={styles.resultIcon}>
                    {result.won ? '🎉' : '💔'}
                </div>
                <div style={{
                    ...styles.resultTitle,
                    color: result.won ? '#22c55e' : '#ef4444'
                }}>
                    {result.won ? 'YOU WIN!' : 'BUST'}
                </div>

                <div style={styles.resultStats}>
                    <div style={styles.resultStat}>
                        <span style={styles.resultStatLabel}>Correct</span>
                        <span style={styles.resultStatValue}>{correctCount}/{game.questionsCount}</span>
                    </div>
                    <div style={styles.resultStat}>
                        <span style={styles.resultStatLabel}>Accuracy</span>
                        <span style={styles.resultStatValue}>{Math.round(result.accuracy * 100)}%</span>
                    </div>
                    {result.multiplier > 1 && (
                        <div style={styles.resultStat}>
                            <span style={styles.resultStatLabel}>Multiplier</span>
                            <span style={{ ...styles.resultStatValue, color: '#a855f7' }}>{result.multiplier}x</span>
                        </div>
                    )}
                </div>

                {result.won && (
                    <div style={styles.prizeBreakdown}>
                        <div style={styles.prizeRow}>
                            <span>Base Prize</span>
                            <span>{result.basePrize} 💎</span>
                        </div>
                        <div style={styles.prizeRow}>
                            <span>House Rake (10%)</span>
                            <span style={{ color: '#ef4444' }}>-{result.rake} 💎</span>
                        </div>
                        {result.streakBonus > 0 && (
                            <div style={styles.prizeRow}>
                                <span>Streak Bonus 🔥</span>
                                <span style={{ color: '#fbbf24' }}>+{result.streakBonus} 💎</span>
                            </div>
                        )}
                        <div style={styles.prizeTotal}>
                            <span>TOTAL WON</span>
                            <span style={{ color: '#22c55e' }}>{result.finalPrize} 💎</span>
                        </div>
                    </div>
                )}

                <div style={styles.newBalance}>
                    New Balance: <span style={styles.balanceValue}>{balance.toLocaleString()} 💎</span>
                </div>

                <div style={styles.resultActions}>
                    <motion.button
                        style={styles.playAgainButton}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={onPlayAgain}
                        disabled={balance < game.entryFee}
                    >
                        Play Again ({game.entryFee} 💎)
                    </motion.button>
                    <motion.button
                        style={styles.lobbyButton}
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
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles = {
    container: {
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0a0a1a 0%, #1a0a2e 50%, #0a1a2e 100%)',
        fontFamily: 'Inter, -apple-system, sans-serif',
        position: 'relative',
    },
    bgGrid: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: `
            linear-gradient(rgba(139, 92, 246, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(139, 92, 246, 0.03) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
        pointerEvents: 'none',
    },
    bgGlow: {
        position: 'fixed',
        top: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        height: '400px',
        background: 'radial-gradient(ellipse at center top, rgba(139, 92, 246, 0.15), transparent 70%)',
        pointerEvents: 'none',
    },
    content: {
        position: 'relative',
        zIndex: 1,
        padding: '100px 24px 40px',
    },
    header: {
        textAlign: 'center',
        marginBottom: '32px',
    },
    titleSection: {
        marginBottom: '24px',
    },
    title: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '42px',
        fontWeight: 900,
        background: 'linear-gradient(135deg, #a855f7, #ec4899, #fbbf24)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        marginBottom: '8px',
        letterSpacing: '2px',
    },
    subtitle: {
        fontSize: '16px',
        color: 'rgba(255, 255, 255, 0.6)',
        fontWeight: 500,
    },
    statsBar: {
        display: 'flex',
        justifyContent: 'center',
        gap: '40px',
        padding: '16px 24px',
        background: 'rgba(0, 0, 0, 0.4)',
        borderRadius: '16px',
        border: '1px solid rgba(139, 92, 246, 0.2)',
    },
    statItem: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
    },
    statLabel: {
        fontSize: '12px',
        color: 'rgba(255, 255, 255, 0.5)',
        textTransform: 'uppercase',
        letterSpacing: '1px',
    },
    statValue: {
        fontSize: '20px',
        fontWeight: 700,
        color: '#fff',
    },
    diamond: {
        color: '#60a5fa',
    },
    lobby: {
        display: 'flex',
        flexDirection: 'column',
        gap: '32px',
    },
    jackpotBanner: {
        background: 'linear-gradient(135deg, #dc262622, #fbbf2422)',
        border: '2px solid #fbbf24',
        borderRadius: '16px',
        padding: '24px',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
    },
    jackpotLabel: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '14px',
        color: '#fbbf24',
        letterSpacing: '3px',
        marginBottom: '8px',
    },
    jackpotAmount: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '48px',
        fontWeight: 900,
        color: '#fff',
        textShadow: '0 0 30px rgba(251, 191, 36, 0.5)',
    },
    jackpotInfo: {
        fontSize: '12px',
        color: 'rgba(255, 255, 255, 0.6)',
        marginTop: '8px',
    },
    resetTimer: {
        textAlign: 'center',
        fontSize: '14px',
        color: 'rgba(255, 255, 255, 0.6)',
    },
    timerValue: {
        fontFamily: 'Orbitron, sans-serif',
        color: '#00D4FF',
        fontWeight: 700,
    },
    section: {
        marginBottom: '16px',
    },
    sectionTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '20px',
        fontWeight: 700,
        color: '#fff',
        marginBottom: '4px',
    },
    sectionSubtitle: {
        fontSize: '14px',
        color: 'rgba(255, 255, 255, 0.5)',
        marginBottom: '16px',
    },
    gamesGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: '16px',
    },
    gameCard: {
        background: 'rgba(0, 0, 0, 0.4)',
        border: '2px solid',
        borderRadius: '16px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        cursor: 'pointer',
        position: 'relative',
        transition: 'all 0.2s ease',
    },
    bonusBadge: {
        position: 'absolute',
        top: '-10px',
        right: '-10px',
        background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
        color: '#000',
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '10px',
        fontWeight: 700,
        padding: '4px 8px',
        borderRadius: '8px',
        transform: 'rotate(12deg)',
    },
    gameIcon: {
        fontSize: '40px',
    },
    gameName: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '14px',
        fontWeight: 700,
        color: '#fff',
        textAlign: 'center',
    },
    gameDesc: {
        fontSize: '11px',
        color: 'rgba(255, 255, 255, 0.6)',
        textAlign: 'center',
        lineHeight: 1.4,
    },
    gameStats: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
    },
    entryFee: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '16px',
        fontWeight: 700,
        color: '#fff',
    },
    maxPrize: {
        fontSize: '11px',
        color: '#22c55e',
    },
    playButton: {
        width: '100%',
        padding: '10px 16px',
        border: 'none',
        borderRadius: '8px',
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '12px',
        fontWeight: 700,
        color: '#fff',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },
    leaderboardTabs: {
        display: 'flex',
        gap: '8px',
        marginBottom: '16px',
    },
    leaderboardTab: {
        flex: 1,
        padding: '10px 16px',
        background: 'rgba(0, 0, 0, 0.3)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },
    leaderboardTabActive: {
        background: 'rgba(139, 92, 246, 0.2)',
        borderColor: '#8b5cf6',
        color: '#fff',
    },
    leaderboardList: {
        background: 'rgba(0, 0, 0, 0.3)',
        borderRadius: '12px',
        padding: '16px',
    },
    emptyLeaderboard: {
        textAlign: 'center',
        color: 'rgba(255, 255, 255, 0.5)',
        padding: '24px',
    },
    leaderboardEntry: {
        display: 'flex',
        alignItems: 'center',
        padding: '12px 0',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    },
    leaderboardRank: {
        width: '40px',
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '14px',
        color: '#fbbf24',
    },
    leaderboardName: {
        flex: 1,
        fontSize: '14px',
        color: '#fff',
    },
    leaderboardProfit: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '14px',
        fontWeight: 700,
    },
    houseRules: {
        textAlign: 'center',
        fontSize: '12px',
        color: 'rgba(255, 255, 255, 0.4)',
        padding: '16px',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
    },
    // Gameplay styles
    gamePlayContainer: {
        background: 'rgba(0, 0, 0, 0.4)',
        borderRadius: '24px',
        padding: '24px',
        border: '1px solid rgba(139, 92, 246, 0.3)',
    },
    gameHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
        paddingBottom: '16px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    },
    gameInfo: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
    },
    gamePlayIcon: {
        fontSize: '32px',
    },
    gamePlayName: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '18px',
        fontWeight: 700,
        color: '#fff',
    },
    gameProgress: {
        display: 'flex',
        gap: '16px',
    },
    questionCounter: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '14px',
        color: 'rgba(255, 255, 255, 0.7)',
    },
    correctCounter: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '14px',
        color: '#22c55e',
    },
    timer: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '24px',
        fontWeight: 700,
    },
    questionArea: {
        minHeight: '300px',
    },
    // Hand Snap styles
    handSnapContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '24px',
    },
    boardLabel: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '12px',
        color: 'rgba(255, 255, 255, 0.5)',
        letterSpacing: '2px',
    },
    boardCards: {
        display: 'flex',
        gap: '8px',
    },
    card: {
        width: '60px',
        height: '84px',
        background: '#fff',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '24px',
        fontWeight: 700,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    },
    smallCard: {
        width: '48px',
        height: '68px',
        background: '#fff',
        borderRadius: '6px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '18px',
        fontWeight: 700,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    },
    vsLabel: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '16px',
        color: '#fbbf24',
        letterSpacing: '2px',
    },
    handsContainer: {
        display: 'flex',
        alignItems: 'center',
        gap: '24px',
    },
    handButton: {
        background: 'rgba(0, 0, 0, 0.4)',
        border: '2px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '16px',
        padding: '20px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },
    handLabel: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '12px',
        color: 'rgba(255, 255, 255, 0.7)',
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
    // Board Nuts styles
    boardNutsContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '24px',
    },
    nutsLabel: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '16px',
        color: '#22c55e',
        letterSpacing: '2px',
    },
    optionsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '16px',
    },
    nutsOption: {
        background: 'rgba(0, 0, 0, 0.4)',
        border: '2px solid rgba(255, 255, 255, 0.2)',
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
    // Chip Math styles
    chipMathContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '24px',
    },
    potDisplay: {
        textAlign: 'center',
    },
    potLabel: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '12px',
        color: 'rgba(255, 255, 255, 0.5)',
        letterSpacing: '2px',
    },
    potValue: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '48px',
        fontWeight: 900,
        color: '#22c55e',
    },
    betDisplay: {
        textAlign: 'center',
    },
    betLabel: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '12px',
        color: 'rgba(255, 255, 255, 0.5)',
        letterSpacing: '2px',
    },
    betValue: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '36px',
        fontWeight: 700,
        color: '#ef4444',
    },
    mathQuestion: {
        fontSize: '18px',
        color: '#fff',
        textAlign: 'center',
    },
    mathOptions: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '12px',
        width: '100%',
        maxWidth: '400px',
    },
    mathOption: {
        padding: '16px 24px',
        background: 'rgba(0, 0, 0, 0.4)',
        border: '2px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '12px',
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '18px',
        fontWeight: 700,
        color: '#fff',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },
    // Quiz styles
    quizContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '32px',
    },
    quizQuestion: {
        fontSize: '20px',
        fontWeight: 600,
        color: '#fff',
        textAlign: 'center',
        lineHeight: 1.5,
    },
    quizOptions: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        width: '100%',
        maxWidth: '500px',
    },
    quizOption: {
        padding: '16px 24px',
        background: 'rgba(0, 0, 0, 0.4)',
        border: '2px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '12px',
        fontSize: '16px',
        fontWeight: 500,
        color: '#fff',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        textAlign: 'left',
    },
    // Multiplier reveal
    multiplierReveal: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '300px',
    },
    multiplierValue: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '96px',
        fontWeight: 900,
        background: 'linear-gradient(135deg, #a855f7, #ec4899, #fbbf24)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
    },
    multiplierLabel: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '24px',
        color: '#fff',
        letterSpacing: '4px',
    },
    // Result styles
    resultContainer: {
        display: 'flex',
        justifyContent: 'center',
    },
    resultCard: {
        background: 'rgba(0, 0, 0, 0.6)',
        border: '3px solid',
        borderRadius: '24px',
        padding: '40px',
        maxWidth: '400px',
        width: '100%',
        textAlign: 'center',
    },
    resultIcon: {
        fontSize: '64px',
        marginBottom: '16px',
    },
    resultTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '32px',
        fontWeight: 900,
        marginBottom: '24px',
    },
    resultStats: {
        display: 'flex',
        justifyContent: 'center',
        gap: '24px',
        marginBottom: '24px',
    },
    resultStat: {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
    },
    resultStatLabel: {
        fontSize: '12px',
        color: 'rgba(255, 255, 255, 0.5)',
        textTransform: 'uppercase',
    },
    resultStatValue: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '18px',
        fontWeight: 700,
        color: '#fff',
    },
    prizeBreakdown: {
        background: 'rgba(0, 0, 0, 0.3)',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '24px',
    },
    prizeRow: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '8px 0',
        fontSize: '14px',
        color: 'rgba(255, 255, 255, 0.7)',
    },
    prizeTotal: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '12px 0 0',
        marginTop: '8px',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '16px',
        fontWeight: 700,
        color: '#fff',
    },
    newBalance: {
        fontSize: '14px',
        color: 'rgba(255, 255, 255, 0.7)',
        marginBottom: '24px',
    },
    balanceValue: {
        fontFamily: 'Orbitron, sans-serif',
        fontWeight: 700,
        color: '#fff',
    },
    resultActions: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
    },
    playAgainButton: {
        padding: '14px 24px',
        background: 'linear-gradient(135deg, #8b5cf6, #a855f7)',
        border: 'none',
        borderRadius: '12px',
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '14px',
        fontWeight: 700,
        color: '#fff',
        cursor: 'pointer',
    },
    lobbyButton: {
        padding: '14px 24px',
        background: 'transparent',
        border: '2px solid rgba(255, 255, 255, 0.3)',
        borderRadius: '12px',
        fontSize: '14px',
        fontWeight: 600,
        color: 'rgba(255, 255, 255, 0.7)',
        cursor: 'pointer',
    },
};

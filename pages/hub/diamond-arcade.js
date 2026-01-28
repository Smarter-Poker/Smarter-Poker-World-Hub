/* ═══════════════════════════════════════════════════════════════════════════
   DIAMOND ARCADE — Premium Casino-Style Skill Gaming

   Version: 3.2.0 - Premium mockup matching update

   Features:
   - Rich casino floor background with warm amber lighting
   - Ornate gold header banner with decorative borders
   - 3D crystal diamond with shattered glass effects
   - Photographic-style game cards with rich gradients
   - Heads-Up Duels section
   - Stats bar with Today's profit, Streak, Win Rate
   - Bottom navigation icons
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { supabase } from '../../src/lib/supabase';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import {
    ARCADE_GAMES,
    generateHandSnapQuestion,
    generateBoardNutsQuestion,
    generateChipMathQuestion,
    calculatePrize,
    getTimeUntilReset,
} from '../../src/lib/arcade/arcadeEngine';

// ═══════════════════════════════════════════════════════════════════════════
// GAME CARD BACKGROUNDS - Rich photographic-style gradients
// ═══════════════════════════════════════════════════════════════════════════

const GAME_CARD_STYLES = {
    'hand-snap': {
        background: `
            linear-gradient(135deg, #0a1830 0%, #102040 20%, #1a3a6a 40%, #0d2545 60%, #0a1830 100%)
        `,
        overlay: `
            radial-gradient(ellipse at 50% 30%, rgba(251, 191, 36, 0.6) 0%, transparent 50%),
            radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.3) 0%, transparent 60%),
            linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.4) 100%)
        `,
        icon: '⚡',
        accentColor: '#fbbf24',
        boxShadow: 'inset 0 0 40px rgba(251, 191, 36, 0.15), inset 0 0 80px rgba(59, 130, 246, 0.1)',
    },
    'ev-or-fold': {
        background: `
            linear-gradient(135deg, #1a0808 0%, #3d1212 20%, #6b1a1a 40%, #8b2020 50%, #5c1515 70%, #2d0a0a 100%)
        `,
        overlay: `
            radial-gradient(ellipse at 50% 40%, rgba(239, 68, 68, 0.5) 0%, transparent 50%),
            radial-gradient(circle at 30% 60%, rgba(251, 191, 36, 0.2) 0%, transparent 40%),
            linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.5) 100%)
        `,
        icon: '🃏',
        accentColor: '#ef4444',
        boxShadow: 'inset 0 0 50px rgba(239, 68, 68, 0.2), inset 0 0 80px rgba(0,0,0,0.3)',
    },
    'board-nuts': {
        background: `
            linear-gradient(135deg, #041a0d 0%, #0a3d1f 20%, #0f5c2e 40%, #15803d 50%, #0d4d25 70%, #052e16 100%)
        `,
        overlay: `
            radial-gradient(ellipse at 50% 45%, rgba(34, 197, 94, 0.4) 0%, transparent 55%),
            radial-gradient(circle at 70% 30%, rgba(251, 191, 36, 0.15) 0%, transparent 35%),
            linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.4) 100%)
        `,
        icon: '🎯',
        accentColor: '#22c55e',
        boxShadow: 'inset 0 0 50px rgba(34, 197, 94, 0.2), inset 0 0 80px rgba(0,0,0,0.2)',
    },
    'the-gauntlet': {
        background: `
            linear-gradient(135deg, #0a0000 0%, #1a0505 15%, #3d0c0c 30%, #5c1010 45%, #7a1515 55%, #5c1010 70%, #2d0808 85%, #0a0000 100%)
        `,
        overlay: `
            radial-gradient(ellipse at 50% 35%, rgba(220, 38, 38, 0.6) 0%, transparent 45%),
            radial-gradient(circle at 30% 70%, rgba(251, 191, 36, 0.15) 0%, transparent 35%),
            radial-gradient(circle at 70% 70%, rgba(251, 191, 36, 0.15) 0%, transparent 35%),
            linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.5) 100%)
        `,
        icon: '💀',
        accentColor: '#dc2626',
        boxShadow: 'inset 0 0 60px rgba(220, 38, 38, 0.25), inset 0 0 100px rgba(0,0,0,0.3)',
    },
    'chip-math': {
        background: `
            linear-gradient(135deg, #0c1929 0%, #1a3050 20%, #2563eb 45%, #1e4a8a 60%, #152a50 80%, #0c1929 100%)
        `,
        overlay: `
            radial-gradient(ellipse at 50% 45%, rgba(59, 130, 246, 0.5) 0%, transparent 55%),
            radial-gradient(circle at 30% 30%, rgba(251, 191, 36, 0.15) 0%, transparent 35%),
            linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.4) 100%)
        `,
        icon: '🔢',
        accentColor: '#3b82f6',
        boxShadow: 'inset 0 0 50px rgba(59, 130, 246, 0.2), inset 0 0 80px rgba(0,0,0,0.2)',
    },
};

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
    const [activeGame, setActiveGame] = useState(null);
    const [gamePhase, setGamePhase] = useState('lobby');
    const [currentQuestion, setCurrentQuestion] = useState(null);
    const [questionIndex, setQuestionIndex] = useState(0);
    const [correctCount, setCorrectCount] = useState(0);
    const [timeLeft, setTimeLeft] = useState(0);
    const [gameResult, setGameResult] = useState(null);
    const timerRef = useRef(null);
    const questionStartTime = useRef(0);

    // 🎬 INTRO VIDEO STATE - Video plays while page loads in background
    // Only show once per session (not on every reload)
    const [showIntro, setShowIntro] = useState(() => {
        if (typeof window !== 'undefined') {
            return !sessionStorage.getItem('diamond-arcade-intro-seen');
        }
        return false;
    });
    const introVideoRef = useRef(null);

    // Mark intro as seen when it ends
    const handleIntroEnd = useCallback(() => {
        sessionStorage.setItem('diamond-arcade-intro-seen', 'true');
        setShowIntro(false);
    }, []);

    // Attempt to unmute video after it starts playing
    const handleIntroPlay = useCallback(() => {
        if (introVideoRef.current) {
            introVideoRef.current.muted = false;
        }
    }, []);

    // Today's featured games matching mockup
    const todaysFeatured = [
        { ...ARCADE_GAMES['hand-snap'], badge: '2X BONUS', badgeColor: '#fbbf24' },
        { ...ARCADE_GAMES['ev-or-fold'], badge: 'HOT', badgeColor: '#ef4444' },
        { ...ARCADE_GAMES['board-nuts'], badge: 'NEW', badgeColor: '#22c55e' },
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
        if (!game) {
            alert('Game not found!');
            return;
        }
        if (balance < game.entryFee) {
            alert(`Not enough diamonds! Need ${game.entryFee}, you have ${balance}`);
            return;
        }

        setActiveGame(game);
        setGamePhase('playing');
        setQuestionIndex(0);
        setCorrectCount(0);
        setTimeLeft(game.durationSeconds);
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
            case 'ev-or-fold':
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
        } else {
            isCorrect = answerIndex === currentQuestion.correctIndex;
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

    async function endGame(completed) {
        if (timerRef.current) clearInterval(timerRef.current);
        const result = calculatePrize(activeGame, correctCount, activeGame.questionsCount, streak, 1);
        setGameResult(result);
        setGamePhase('result');

        if (result.won) {
            setBalance(prev => prev + result.finalPrize);
            setStreak(result.newStreak);
            if (result.finalPrize >= 100) {
                confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#fbbf24', '#22c55e', '#3b82f6'] });
            }
        }
    }

    function backToLobby() {
        setGamePhase('lobby');
        setActiveGame(null);
        setGameResult(null);
        setCurrentQuestion(null);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════════

    return (
        <>
            {/* 🎬 INTRO VIDEO OVERLAY - Plays while page loads behind it */}
            {showIntro && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 99999,
                    background: '#000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <video
                        ref={introVideoRef}
                        src="/videos/diamond-arcade-intro.mp4"
                        autoPlay
                        muted
                        playsInline
                        onPlay={handleIntroPlay}
                        onEnded={handleIntroEnd}
                        onError={handleIntroEnd}
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover'
                        }}
                    />
                    {/* Skip button */}
                    <button
                        onClick={handleIntroEnd}
                        style={{
                            position: 'absolute',
                            top: 20,
                            right: 20,
                            padding: '8px 20px',
                            background: 'rgba(255,255,255,0.2)',
                            backdropFilter: 'blur(10px)',
                            border: '1px solid rgba(255,255,255,0.3)',
                            borderRadius: 20,
                            color: 'white',
                            fontSize: 14,
                            fontWeight: 500,
                            cursor: 'pointer',
                            zIndex: 100000
                        }}
                    >
                        Skip
                    </button>
                </div>
            )}
            <Head>
                <title>Diamond Arcade - Smarter.Poker</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
                <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700;800;900&family=Orbitron:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
                <style>{`
                    @keyframes shimmer {
                        0% { background-position: -200% center; }
                        100% { background-position: 200% center; }
                    }
                    @keyframes float {
                        0%, 100% { transform: translateY(0) scale(1); }
                        50% { transform: translateY(-15px) scale(1.05); }
                    }
                    @keyframes pulse-glow {
                        0%, 100% { filter: drop-shadow(0 0 20px rgba(59, 130, 246, 0.8)); }
                        50% { filter: drop-shadow(0 0 40px rgba(59, 130, 246, 1)); }
                    }
                    @keyframes shard-float {
                        0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.6; }
                        50% { transform: translateY(-8px) rotate(10deg); opacity: 1; }
                    }
                    @keyframes border-glow {
                        0%, 100% { box-shadow: inset 0 0 20px rgba(251, 191, 36, 0.3), 0 0 20px rgba(251, 191, 36, 0.2); }
                        50% { box-shadow: inset 0 0 30px rgba(251, 191, 36, 0.5), 0 0 30px rgba(251, 191, 36, 0.4); }
                    }
                    .arcade-container { width: 100%; max-width: 100%; margin: 0 auto; }
                    
                    @media (min-width: 501px) and (max-width: 700px) { .arcade-container { zoom: 0.7; } }
                    @media (min-width: 701px) and (max-width: 900px) { .arcade-container { zoom: 0.9; } }
                    @media (min-width: 901px) { .arcade-container { zoom: 1.1; } }
                `}</style>
            </Head>

            <div className="arcade-container" style={styles.pageWrapper}>
                {/* Casino Background Layers */}
                <div style={styles.casinoBgBase} />
                <div style={styles.casinoBgOverlay} />
                <div style={styles.casinoBgVignette} />
                <div style={styles.casinoBgLights} />

                <UniversalHeader pageDepth={1} />

                <div style={styles.mainContent}>
                    <AnimatePresence mode="wait">
                        {gamePhase === 'lobby' && (
                            <motion.div
                                key="lobby"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                            >
                                {/* ═══════════════════════════════════════════════════════════════
                                    ORNATE GOLD HEADER BANNER
                                ═══════════════════════════════════════════════════════════════ */}
                                <div style={styles.headerBanner}>
                                    <div style={styles.headerBannerInner}>
                                        <div style={styles.headerDecorLeft}>◆</div>
                                        <h1 style={styles.arcadeTitle}>💎 DIAMOND ARCADE</h1>
                                        <div style={styles.headerDecorRight}>◆</div>
                                    </div>
                                    <div style={styles.headerStats}>
                                        <span style={styles.balanceText}>Balance: <strong>{balance.toLocaleString()}</strong> 💎</span>
                                        <span style={styles.streakText}>🔥 STREAK x{streak}</span>
                                    </div>
                                </div>

                                {/* ═══════════════════════════════════════════════════════════════
                                    PROGRESSIVE JACKPOT - 3D Crystal Diamond
                                ═══════════════════════════════════════════════════════════════ */}
                                <div style={styles.jackpotSection}>
                                    <div style={styles.jackpotBorder}>
                                        <div style={styles.jackpotInner}>
                                            <div style={styles.jackpotLabel}>
                                                <span style={styles.slotIcon}>🎰</span>
                                                <span style={styles.jackpotLabelText}>PROGRESSIVE JACKPOT</span>
                                            </div>

                                            {/* Crystal Diamond with Shards */}
                                            <div style={styles.diamondContainer}>
                                                <motion.div
                                                    style={styles.mainDiamond}
                                                    animate={{ y: [0, -15, 0], scale: [1, 1.05, 1] }}
                                                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                                                >
                                                    💎
                                                </motion.div>
                                                {/* Floating Shards */}
                                                {[...Array(8)].map((_, i) => (
                                                    <motion.div
                                                        key={i}
                                                        style={{
                                                            ...styles.shard,
                                                            left: `${10 + i * 11}%`,
                                                            top: `${30 + (i % 3) * 15}%`,
                                                        }}
                                                        animate={{
                                                            y: [0, -8, 0],
                                                            rotate: [0, 10, 0],
                                                            opacity: [0.4, 1, 0.4],
                                                        }}
                                                        transition={{ duration: 2 + i * 0.3, repeat: Infinity, delay: i * 0.2 }}
                                                    >
                                                        ✦
                                                    </motion.div>
                                                ))}
                                            </div>

                                            <div style={styles.jackpotAmount}>{jackpot.toLocaleString()} 💎</div>
                                            <div style={styles.jackpotTimer}>Next Draw: 3d 14h 22m</div>
                                        </div>
                                    </div>
                                </div>

                                {/* ═══════════════════════════════════════════════════════════════
                                    TODAY'S FEATURED GAMES
                                ═══════════════════════════════════════════════════════════════ */}
                                <div style={styles.sectionHeader}>
                                    <span style={styles.sectionDivider}>━━━━</span>
                                    <span style={styles.sectionTitle}>TODAY'S FEATURED GAMES</span>
                                    <span style={styles.sectionDivider}>━━━━</span>
                                    <span style={styles.resetTimer}>Resets in {String(resetTime.hours).padStart(2, '0')}:{String(resetTime.minutes).padStart(2, '0')}:{String(resetTime.seconds).padStart(2, '0')}</span>
                                </div>

                                <div style={styles.gamesGrid}>
                                    {todaysFeatured.map((game) => {
                                        const cardStyle = GAME_CARD_STYLES[game.id] || GAME_CARD_STYLES['hand-snap'];
                                        return (
                                            <motion.div
                                                key={game.id}
                                                style={{
                                                    ...styles.gameCard,
                                                    background: cardStyle.background,
                                                    boxShadow: cardStyle.boxShadow,
                                                }}
                                                whileHover={{ scale: 1.05, y: -8 }}
                                                whileTap={{ scale: 0.98 }}
                                                onClick={() => startGame(game.id)}
                                            >
                                                <div style={{ ...styles.gameCardOverlay, background: cardStyle.overlay }} />
                                                <div style={styles.gameCardContent}>
                                                    <div style={styles.gameIcon}>{cardStyle.icon}</div>
                                                    <div style={styles.gameName}>{game.name.toUpperCase()}</div>
                                                </div>
                                                <div style={styles.gameCardFooter}>
                                                    <div style={styles.priceAndBadge}>
                                                        <span style={styles.gamePrice}>{game.entryFee} 💎💎</span>
                                                        <span style={{ ...styles.gameBadge, background: game.badgeColor }}>{game.badge}</span>
                                                    </div>
                                                </div>
                                                <div style={{ ...styles.gameCardGlow, background: `radial-gradient(ellipse at center, ${cardStyle.accentColor}33 0%, transparent 70%)` }} />
                                            </motion.div>
                                        );
                                    })}
                                </div>

                                {/* ═══════════════════════════════════════════════════════════════
                                    DAILY CHALLENGE - Horizontal Strip
                                ═══════════════════════════════════════════════════════════════ */}
                                <div style={styles.dailyChallengeSection}>
                                    <div style={styles.challengeHeader}>
                                        <span style={styles.challengeLabel}>━━ DAILY CHALLENGE ━━</span>
                                        <span style={styles.challengeName}>Board Nuts Blitz</span>
                                    </div>
                                    <div style={styles.challengeContent}>
                                        <div style={styles.challengePrize}>Top 100 Split 10,000 💎</div>
                                        <div style={styles.challengeStats}>
                                            Your Rank: <span style={styles.highlight}>#234</span> • Best Score: <span style={styles.highlight}>847 pts</span> • Leader: <span style={styles.highlight}>1,203 pts</span>
                                        </div>
                                    </div>
                                    <motion.button
                                        style={styles.playButton}
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => startGame('board-nuts')}
                                    >
                                        PLAY NOW - 25 💎
                                    </motion.button>
                                </div>

                                {/* ═══════════════════════════════════════════════════════════════
                                    HEADS-UP DUELS
                                ═══════════════════════════════════════════════════════════════ */}
                                <div style={styles.duelsSection}>
                                    <div style={styles.duelsHeader}>
                                        <span style={styles.sectionDivider}>━━━━</span>
                                        <span style={styles.duelsLabel}>HEADS-UP DUELS</span>
                                        <span style={styles.sectionDivider}>━━━━</span>
                                        <span style={styles.playersWaiting}>3 Players Waiting</span>
                                    </div>
                                    <div style={styles.duelsGrid}>
                                        <motion.div style={styles.duelCard} whileHover={{ scale: 1.03 }}>
                                            <div style={styles.duelName}>QUICK DUEL</div>
                                            <div style={styles.duelPrice}>25 💎💎</div>
                                            <button style={styles.duelButton}>FIND MATCH</button>
                                        </motion.div>
                                        <motion.div style={styles.duelCard} whileHover={{ scale: 1.03 }}>
                                            <div style={styles.duelName}>BEST OF 3</div>
                                            <div style={styles.duelPrice}>50 💎💎</div>
                                            <button style={styles.duelButton}>FIND MATCH</button>
                                        </motion.div>
                                        <motion.div style={{ ...styles.duelCard, ...styles.duelCardHighRoller }} whileHover={{ scale: 1.03 }}>
                                            <div style={styles.duelCrown}>👑</div>
                                            <div style={styles.duelName}>HIGH ROLLER</div>
                                            <div style={styles.duelPrice}>100 💎💎</div>
                                            <button style={{ ...styles.duelButton, ...styles.duelButtonGold }}>FIND MATCH</button>
                                        </motion.div>
                                    </div>
                                </div>

                                {/* ═══════════════════════════════════════════════════════════════
                                    STATS BAR
                                ═══════════════════════════════════════════════════════════════ */}
                                <div style={styles.statsBar}>
                                    <div style={styles.statItem}>
                                        <span style={styles.statLabel}>Today:</span>
                                        <span style={styles.statValue}>+{stats.todayProfit} 💎</span>
                                    </div>
                                    <div style={styles.statDivider}>▸</div>
                                    <div style={styles.statItem}>
                                        <span style={styles.statLabel}>STREAK x{streak}</span>
                                        <span style={styles.statBonus}>NEXT: 1.5x</span>
                                    </div>
                                    <div style={styles.statDivider}>▸</div>
                                    <div style={styles.statItem}>
                                        <span style={styles.statLabel}>Win Rate:</span>
                                        <span style={styles.statValue}>{stats.winRate}%</span>
                                    </div>
                                </div>

                                {/* ═══════════════════════════════════════════════════════════════
                                    BOTTOM NAV
                                ═══════════════════════════════════════════════════════════════ */}
                                <div style={styles.bottomNav}>
                                    <motion.div style={styles.navIcon} whileHover={{ scale: 1.1 }}>⚡</motion.div>
                                    <motion.div style={styles.navIcon} whileHover={{ scale: 1.1 }}>🎯</motion.div>
                                    <motion.div style={styles.navIcon} whileHover={{ scale: 1.1 }}>🏆</motion.div>
                                </div>
                            </motion.div>
                        )}

                        {/* ═══════════════════════════════════════════════════════════════
                            GAME PLAYING PHASE
                        ═══════════════════════════════════════════════════════════════ */}
                        {gamePhase === 'playing' && activeGame && currentQuestion && (
                            <motion.div
                                key="playing"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                style={styles.gamePlayArea}
                            >
                                <div style={styles.gameHeader}>
                                    <h2 style={styles.gameTitle}>{activeGame.name}</h2>
                                    <div style={styles.gameStats}>
                                        <span style={styles.timerDisplay}>⏱ {timeLeft}s</span>
                                        <span style={styles.scoreDisplay}>✓ {correctCount}/{questionIndex + 1}</span>
                                    </div>
                                </div>

                                <div style={styles.questionArea}>
                                    {activeGame.id === 'hand-snap' && (
                                        <>
                                            <p style={styles.questionText}>Which hand wins?</p>
                                            <div style={styles.handsContainer}>
                                                {currentQuestion.hands.map((hand, idx) => (
                                                    <motion.button
                                                        key={idx}
                                                        style={styles.handButton}
                                                        whileHover={{ scale: 1.05 }}
                                                        whileTap={{ scale: 0.95 }}
                                                        onClick={() => handleAnswer(idx)}
                                                    >
                                                        <div style={styles.handLabel}>Hand {idx + 1}</div>
                                                        <div style={styles.handCards}>
                                                            {hand.map((card, cidx) => (
                                                                <span key={cidx} style={styles.card}>{card}</span>
                                                            ))}
                                                        </div>
                                                    </motion.button>
                                                ))}
                                            </div>
                                            <div style={styles.boardDisplay}>
                                                <span style={styles.boardLabel}>Board:</span>
                                                {currentQuestion.board.map((card, idx) => (
                                                    <span key={idx} style={styles.boardCard}>{card}</span>
                                                ))}
                                            </div>
                                        </>
                                    )}

                                    {(activeGame.id === 'chip-math' || activeGame.id === 'ev-or-fold') && (
                                        <>
                                            <p style={styles.questionText}>{currentQuestion.question}</p>
                                            <div style={styles.optionsGrid}>
                                                {currentQuestion.options.map((opt, idx) => (
                                                    <motion.button
                                                        key={idx}
                                                        style={styles.optionButton}
                                                        whileHover={{ scale: 1.03 }}
                                                        whileTap={{ scale: 0.97 }}
                                                        onClick={() => handleAnswer(idx)}
                                                    >
                                                        {opt}
                                                    </motion.button>
                                                ))}
                                            </div>
                                        </>
                                    )}

                                    {activeGame.id === 'board-nuts' && (
                                        <>
                                            <p style={styles.questionText}>What's the nuts?</p>
                                            <div style={styles.boardDisplay}>
                                                <span style={styles.boardLabel}>Board:</span>
                                                {currentQuestion.board.map((card, idx) => (
                                                    <span key={idx} style={styles.boardCard}>{card}</span>
                                                ))}
                                            </div>
                                            <div style={styles.optionsGrid}>
                                                {currentQuestion.options.map((opt, idx) => (
                                                    <motion.button
                                                        key={idx}
                                                        style={styles.optionButton}
                                                        whileHover={{ scale: 1.03 }}
                                                        whileTap={{ scale: 0.97 }}
                                                        onClick={() => handleAnswer(idx)}
                                                    >
                                                        {opt}
                                                    </motion.button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </motion.div>
                        )}

                        {/* ═══════════════════════════════════════════════════════════════
                            GAME RESULT PHASE
                        ═══════════════════════════════════════════════════════════════ */}
                        {gamePhase === 'result' && gameResult && (
                            <motion.div
                                key="result"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                style={styles.resultArea}
                            >
                                <h2 style={styles.resultTitle}>{gameResult.won ? '🎉 WINNER!' : '💔 Game Over'}</h2>
                                <div style={styles.resultStats}>
                                    <p>Correct: {correctCount} / {activeGame?.questionsCount || 0}</p>
                                    <p style={styles.prizeDisplay}>
                                        {gameResult.won ? `+${gameResult.finalPrize} 💎` : `Lost ${activeGame?.entryFee || 0} 💎`}
                                    </p>
                                </div>
                                <motion.button
                                    style={styles.backButton}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={backToLobby}
                                >
                                    Back to Arcade
                                </motion.button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles = {
    pageWrapper: {
        position: 'relative',
        minHeight: '100vh',
        overflow: 'hidden',
    },

    // Casino Background - Using actual casino floor image
    casinoBgBase: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: 'url(/images/arcade/casino-bg.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center bottom',
        backgroundRepeat: 'no-repeat',
        zIndex: -4,
    },
    casinoBgOverlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.6) 100%)',
        zIndex: -3,
    },
    casinoBgVignette: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'radial-gradient(ellipse at center, transparent 20%, rgba(0,0,0,0.5) 100%)',
        zIndex: -2,
    },
    casinoBgLights: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: `
            radial-gradient(circle at 10% 90%, rgba(251, 191, 36, 0.15) 0%, transparent 25%),
            radial-gradient(circle at 90% 90%, rgba(251, 191, 36, 0.15) 0%, transparent 25%),
            radial-gradient(circle at 50% 100%, rgba(218, 165, 32, 0.1) 0%, transparent 30%)
        `,
        zIndex: -1,
    },

    mainContent: {
        position: 'relative',
        padding: '0 20px 40px',
        zIndex: 1,
    },

    // Header Banner - Ornate gold frame
    headerBanner: {
        background: 'linear-gradient(180deg, rgba(20, 15, 5, 0.98) 0%, rgba(15, 10, 2, 0.95) 100%)',
        borderTop: '4px solid',
        borderBottom: '4px solid',
        borderLeft: '2px solid',
        borderRight: '2px solid',
        borderImage: 'linear-gradient(90deg, #5c3a0a, #8B4513, #DAA520, #FFD700, #DAA520, #8B4513, #5c3a0a) 1',
        padding: '18px 30px',
        marginBottom: '20px',
        position: 'relative',
        boxShadow: '0 0 40px rgba(218, 165, 32, 0.3), inset 0 0 30px rgba(0,0,0,0.5)',
    },
    headerBannerInner: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '20px',
    },
    headerDecorLeft: {
        color: '#FFD700',
        fontSize: '24px',
        textShadow: '0 0 15px rgba(255, 215, 0, 0.8)',
    },
    headerDecorRight: {
        color: '#FFD700',
        fontSize: '24px',
        textShadow: '0 0 15px rgba(255, 215, 0, 0.8)',
    },
    arcadeTitle: {
        fontFamily: "'Cinzel', serif",
        fontSize: '36px',
        fontWeight: 900,
        background: 'linear-gradient(180deg, #FFD700 0%, #FFC107 30%, #FF9800 60%, #DAA520 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        textShadow: '0 0 40px rgba(255, 215, 0, 0.7)',
        margin: 0,
        letterSpacing: '4px',
    },
    headerStats: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '20px',
        marginTop: '10px',
    },
    balanceText: {
        color: '#e5e5e5',
        fontSize: '14px',
        fontFamily: "'Orbitron', sans-serif",
    },
    streakText: {
        color: '#fbbf24',
        fontSize: '14px',
        fontFamily: "'Orbitron', sans-serif",
        fontWeight: 600,
    },

    // Jackpot Section - Premium styling
    jackpotSection: {
        marginBottom: '25px',
    },
    jackpotBorder: {
        background: 'linear-gradient(135deg, #5c3a0a 0%, #8B4513 15%, #DAA520 30%, #FFD700 50%, #DAA520 70%, #8B4513 85%, #5c3a0a 100%)',
        borderRadius: '12px',
        padding: '4px',
        animation: 'border-glow 3s ease-in-out infinite',
        boxShadow: '0 0 30px rgba(218, 165, 32, 0.4)',
    },
    jackpotInner: {
        background: 'linear-gradient(180deg, #050d1a 0%, #0a1a30 30%, #0d2040 50%, #0a1a30 70%, #050d1a 100%)',
        borderRadius: '10px',
        padding: '30px',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: 'inset 0 0 60px rgba(0,0,0,0.5)',
    },
    jackpotLabel: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        marginBottom: '15px',
    },
    slotIcon: {
        fontSize: '24px',
    },
    jackpotLabelText: {
        fontFamily: "'Cinzel', serif",
        fontSize: '16px',
        fontWeight: 700,
        color: '#DAA520',
        letterSpacing: '3px',
    },
    diamondContainer: {
        position: 'relative',
        height: '140px',
        marginBottom: '20px',
    },
    mainDiamond: {
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        fontSize: '100px',
        filter: 'drop-shadow(0 0 40px rgba(59, 130, 246, 1)) drop-shadow(0 0 80px rgba(59, 130, 246, 0.5))',
        animation: 'pulse-glow 2s ease-in-out infinite',
    },
    shard: {
        position: 'absolute',
        fontSize: '20px',
        color: '#93c5fd',
        textShadow: '0 0 10px rgba(147, 197, 253, 0.8)',
        animation: 'shard-float 2s ease-in-out infinite',
    },
    jackpotAmount: {
        fontFamily: "'Orbitron', sans-serif",
        fontSize: '56px',
        fontWeight: 900,
        background: 'linear-gradient(180deg, #93c5fd 0%, #60a5fa 30%, #3b82f6 60%, #2563eb 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        textShadow: '0 0 60px rgba(59, 130, 246, 0.8)',
        marginBottom: '12px',
        letterSpacing: '2px',
    },
    jackpotTimer: {
        color: '#9ca3af',
        fontSize: '14px',
        fontFamily: "'Orbitron', sans-serif",
    },

    // Section Headers
    sectionHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        marginBottom: '15px',
        flexWrap: 'wrap',
        padding: '8px 0',
        borderTop: '1px solid rgba(218, 165, 32, 0.3)',
        borderBottom: '1px solid rgba(218, 165, 32, 0.3)',
        background: 'linear-gradient(90deg, transparent 0%, rgba(218, 165, 32, 0.08) 50%, transparent 100%)',
    },
    sectionDivider: {
        color: '#B8860B',
        fontSize: '10px',
        letterSpacing: '3px',
        opacity: 0.8,
    },
    sectionTitle: {
        fontFamily: "'Cinzel', serif",
        fontSize: '13px',
        fontWeight: 700,
        color: '#DAA520',
        letterSpacing: '3px',
        textShadow: '0 0 10px rgba(218, 165, 32, 0.5)',
    },
    resetTimer: {
        fontFamily: "'Orbitron', sans-serif",
        fontSize: '11px',
        color: '#B8860B',
        marginLeft: '10px',
    },

    // Games Grid
    gamesGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '12px',
        marginBottom: '20px',
    },
    gameCard: {
        position: 'relative',
        borderRadius: '8px',
        overflow: 'hidden',
        cursor: 'pointer',
        aspectRatio: '0.85',
        border: '3px solid',
        borderImage: 'linear-gradient(180deg, #DAA520 0%, #8B4513 50%, #5c3a0a 100%) 1',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,215,0,0.3)',
    },
    gameCardOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1,
    },
    gameCardContent: {
        position: 'relative',
        zIndex: 2,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '65%',
        padding: '10px',
    },
    gameIcon: {
        fontSize: '48px',
        marginBottom: '8px',
        filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.8)) drop-shadow(0 0 20px rgba(255,255,255,0.3))',
    },
    gameName: {
        fontFamily: "'Cinzel', serif",
        fontSize: '12px',
        fontWeight: 800,
        color: '#fff',
        textAlign: 'center',
        textShadow: '0 2px 4px rgba(0,0,0,1), 0 0 10px rgba(0,0,0,0.8)',
        letterSpacing: '1px',
        textTransform: 'uppercase',
    },
    gameCardFooter: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '8px 10px',
        background: 'linear-gradient(0deg, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.85) 60%, transparent 100%)',
        zIndex: 3,
    },
    priceAndBadge: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
    },
    gamePrice: {
        fontFamily: "'Orbitron', sans-serif",
        fontSize: '14px',
        fontWeight: 700,
        color: '#fbbf24',
        textShadow: '0 0 8px rgba(251, 191, 36, 0.6)',
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
    },
    gameBadge: {
        padding: '3px 8px',
        borderRadius: '3px',
        fontSize: '9px',
        fontWeight: 800,
        color: '#fff',
        fontFamily: "'Orbitron', sans-serif",
        textTransform: 'uppercase',
        boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
        letterSpacing: '0.5px',
    },
    gameCardGlow: {
        position: 'absolute',
        top: '-50%',
        left: '-50%',
        right: '-50%',
        bottom: '-50%',
        pointerEvents: 'none',
        zIndex: 0,
        opacity: 0.5,
    },

    // Daily Challenge - Compact horizontal strip
    dailyChallengeSection: {
        background: 'linear-gradient(180deg, rgba(20, 15, 5, 0.95) 0%, rgba(15, 10, 2, 0.9) 100%)',
        border: '2px solid',
        borderImage: 'linear-gradient(90deg, #5c3a0a, #DAA520, #5c3a0a) 1',
        borderRadius: '0',
        padding: '15px 20px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '15px',
    },
    challengeHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
    },
    challengeLabel: {
        fontFamily: "'Cinzel', serif",
        fontSize: '11px',
        fontWeight: 700,
        color: '#DAA520',
        letterSpacing: '2px',
    },
    challengeName: {
        fontFamily: "'Cinzel', serif",
        fontSize: '16px',
        fontWeight: 700,
        color: '#fff',
    },
    challengeContent: {
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
        flexWrap: 'wrap',
    },
    challengePrize: {
        fontFamily: "'Orbitron', sans-serif",
        fontSize: '14px',
        fontWeight: 700,
        color: '#fbbf24',
    },
    challengeStats: {
        color: '#9ca3af',
        fontSize: '12px',
    },
    highlight: {
        color: '#22c55e',
        fontWeight: 600,
    },
    playButton: {
        background: 'linear-gradient(180deg, #22c55e 0%, #16a34a 100%)',
        border: 'none',
        borderRadius: '6px',
        padding: '10px 20px',
        color: '#fff',
        fontFamily: "'Orbitron', sans-serif",
        fontSize: '12px',
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: '0 4px 12px rgba(34, 197, 94, 0.4)',
    },

    // Duels Section
    duelsSection: {
        marginBottom: '20px',
    },
    duelsHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        marginBottom: '12px',
        padding: '6px 0',
        borderTop: '1px solid rgba(218, 165, 32, 0.3)',
        borderBottom: '1px solid rgba(218, 165, 32, 0.3)',
        background: 'linear-gradient(90deg, transparent 0%, rgba(218, 165, 32, 0.08) 50%, transparent 100%)',
    },
    duelsLabel: {
        fontFamily: "'Cinzel', serif",
        fontSize: '12px',
        fontWeight: 700,
        color: '#DAA520',
        letterSpacing: '2px',
    },
    playersWaiting: {
        color: '#B8860B',
        fontSize: '11px',
    },
    duelsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '12px',
    },
    duelCard: {
        background: 'linear-gradient(180deg, rgba(25, 25, 35, 0.95) 0%, rgba(15, 15, 25, 0.98) 100%)',
        border: '2px solid rgba(100, 100, 120, 0.4)',
        borderRadius: '8px',
        padding: '15px',
        textAlign: 'center',
        cursor: 'pointer',
    },
    duelCardHighRoller: {
        borderColor: 'rgba(251, 191, 36, 0.6)',
        background: 'linear-gradient(180deg, rgba(40, 35, 15, 0.95) 0%, rgba(25, 20, 8, 0.98) 100%)',
        boxShadow: '0 0 20px rgba(251, 191, 36, 0.2)',
    },
    duelCrown: {
        fontSize: '20px',
        marginBottom: '4px',
    },
    duelName: {
        fontFamily: "'Cinzel', serif",
        fontSize: '12px',
        fontWeight: 700,
        color: '#fff',
        marginBottom: '10px',
    },
    duelPrice: {
        fontFamily: "'Orbitron', sans-serif",
        fontSize: '16px',
        fontWeight: 700,
        color: '#fbbf24',
        marginBottom: '15px',
    },
    duelButton: {
        background: 'linear-gradient(180deg, #4b5563 0%, #374151 100%)',
        border: 'none',
        borderRadius: '6px',
        padding: '10px 20px',
        color: '#fff',
        fontFamily: "'Orbitron', sans-serif",
        fontSize: '11px',
        fontWeight: 600,
        cursor: 'pointer',
        width: '100%',
    },
    duelButtonGold: {
        background: 'linear-gradient(180deg, #DAA520 0%, #B8860B 100%)',
    },

    // Stats Bar
    statsBar: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '20px',
        background: 'linear-gradient(180deg, rgba(20, 20, 30, 0.95) 0%, rgba(10, 10, 20, 0.98) 100%)',
        border: '1px solid rgba(100, 100, 120, 0.2)',
        borderRadius: '10px',
        padding: '15px 25px',
        marginBottom: '20px',
    },
    statItem: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '3px',
    },
    statLabel: {
        color: '#9ca3af',
        fontSize: '11px',
        fontFamily: "'Orbitron', sans-serif",
    },
    statValue: {
        color: '#22c55e',
        fontSize: '14px',
        fontWeight: 700,
        fontFamily: "'Orbitron', sans-serif",
    },
    statBonus: {
        color: '#ef4444',
        fontSize: '11px',
        fontWeight: 600,
        fontFamily: "'Orbitron', sans-serif",
    },
    statDivider: {
        color: '#4b5563',
        fontSize: '12px',
    },

    // Bottom Nav
    bottomNav: {
        display: 'flex',
        justifyContent: 'center',
        gap: '30px',
        padding: '15px',
    },
    navIcon: {
        width: '50px',
        height: '50px',
        background: 'linear-gradient(180deg, rgba(40, 40, 50, 0.9) 0%, rgba(25, 25, 35, 0.95) 100%)',
        border: '2px solid rgba(100, 100, 120, 0.3)',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '24px',
        cursor: 'pointer',
    },

    // Game Play Styles
    gamePlayArea: {
        background: 'linear-gradient(180deg, rgba(15, 15, 25, 0.98) 0%, rgba(10, 10, 20, 0.99) 100%)',
        borderRadius: '15px',
        padding: '30px',
        border: '2px solid rgba(59, 130, 246, 0.3)',
    },
    gameHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '25px',
        paddingBottom: '15px',
        borderBottom: '1px solid rgba(100, 100, 120, 0.2)',
    },
    gameTitle: {
        fontFamily: "'Cinzel', serif",
        fontSize: '24px',
        fontWeight: 700,
        color: '#fff',
        margin: 0,
    },
    gameStats: {
        display: 'flex',
        gap: '20px',
    },
    timerDisplay: {
        fontFamily: "'Orbitron', sans-serif",
        fontSize: '18px',
        color: '#ef4444',
        fontWeight: 700,
    },
    scoreDisplay: {
        fontFamily: "'Orbitron', sans-serif",
        fontSize: '18px',
        color: '#22c55e',
        fontWeight: 700,
    },
    questionArea: {
        textAlign: 'center',
    },
    questionText: {
        fontSize: '20px',
        color: '#e5e5e5',
        marginBottom: '25px',
    },
    handsContainer: {
        display: 'flex',
        justifyContent: 'center',
        gap: '30px',
        marginBottom: '25px',
    },
    handButton: {
        background: 'linear-gradient(180deg, rgba(40, 40, 60, 0.9) 0%, rgba(25, 25, 40, 0.95) 100%)',
        border: '2px solid rgba(100, 100, 140, 0.4)',
        borderRadius: '12px',
        padding: '20px 30px',
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    handLabel: {
        color: '#9ca3af',
        fontSize: '12px',
        marginBottom: '10px',
        fontFamily: "'Orbitron', sans-serif",
    },
    handCards: {
        display: 'flex',
        gap: '8px',
    },
    card: {
        fontSize: '24px',
    },
    boardDisplay: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        marginBottom: '25px',
    },
    boardLabel: {
        color: '#9ca3af',
        fontSize: '14px',
    },
    boardCard: {
        fontSize: '28px',
    },
    optionsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '15px',
        maxWidth: '500px',
        margin: '0 auto',
    },
    optionButton: {
        background: 'linear-gradient(180deg, rgba(40, 40, 60, 0.9) 0%, rgba(25, 25, 40, 0.95) 100%)',
        border: '2px solid rgba(100, 100, 140, 0.4)',
        borderRadius: '10px',
        padding: '18px 25px',
        color: '#e5e5e5',
        fontSize: '16px',
        cursor: 'pointer',
        fontFamily: "'Orbitron', sans-serif",
    },

    // Result Styles
    resultArea: {
        background: 'linear-gradient(180deg, rgba(15, 15, 25, 0.98) 0%, rgba(10, 10, 20, 0.99) 100%)',
        borderRadius: '15px',
        padding: '50px',
        textAlign: 'center',
        border: '2px solid rgba(59, 130, 246, 0.3)',
    },
    resultTitle: {
        fontFamily: "'Cinzel', serif",
        fontSize: '36px',
        fontWeight: 800,
        color: '#fff',
        marginBottom: '20px',
    },
    resultStats: {
        marginBottom: '30px',
    },
    prizeDisplay: {
        fontFamily: "'Orbitron', sans-serif",
        fontSize: '32px',
        fontWeight: 700,
        color: '#22c55e',
        marginTop: '15px',
    },
    backButton: {
        background: 'linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)',
        border: 'none',
        borderRadius: '10px',
        padding: '15px 40px',
        color: '#fff',
        fontFamily: "'Orbitron', sans-serif",
        fontSize: '16px',
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: '0 4px 20px rgba(59, 130, 246, 0.4)',
    },
};

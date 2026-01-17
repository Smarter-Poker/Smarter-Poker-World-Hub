/**
 * 🎮 TRAINING PAGE — 100-Game Library with Video Game Feel
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Features:
 * - Complete 100-game library across 5 categories
 * - User progress tracking with NEW/MASTERED indicators
 * - Animated game cards with framer-motion
 * - Category filter system (ALL, GTO, EXPLOITATIVE, MATH)
 * - Netflix-style horizontal scrolling lanes
 * - Overall user stats display
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useRouter } from 'next/router';
import Head from 'next/head';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import GameCard from '../../src/components/training/GameCard';
import { TRAINING_LIBRARY, TRAINING_LANES, getGamesByCategory, getGamesByTag } from '../../src/data/TRAINING_LIBRARY';
import useTrainingProgress from '../../src/hooks/useTrainingProgress';
import { getGameImage } from '../../src/data/GAME_IMAGES';
import { BrainHomeButton } from '../../src/components/navigation/WorldNavHeader';
import GameIntroSplash from '../../src/components/training/GameIntroSplash';

// Filter options - Category based filters that link to game lanes
const FILTERS = [
    { id: 'ALL', label: 'ALL', color: '#fff', activeColor: '#0a0a15' },
    { id: 'MTT', label: 'TOURNAMENTS', color: '#FF6B35', laneTitle: 'MTT MASTERY' },
    { id: 'CASH', label: 'CASH GAMES', color: '#4CAF50', laneTitle: 'CASH GAME GRIND' },
    { id: 'SPINS', label: "SIT N GO'S", color: '#FFD700', laneTitle: 'SPINS & SNGS' },
    { id: 'PSYCHOLOGY', label: 'PSYCHOLOGY', color: '#9C27B0', laneTitle: 'MENTAL GAME' },
    { id: 'ADVANCED', label: 'ADVANCED', color: '#2196F3', laneTitle: 'ADVANCED THEORY' },
];

// Category definitions
const CATEGORIES = [
    { id: 'MTT', title: 'MTT MASTERY', icon: '🏆', color: '#FF6B35' },
    { id: 'CASH', title: 'CASH GAME GRIND', icon: '💵', color: '#4CAF50' },
    { id: 'SPINS', title: 'SPINS & SNGS', icon: '⚡', color: '#FFD700' },
    { id: 'PSYCHOLOGY', title: 'MENTAL GAME', icon: '🧠', color: '#9C27B0' },
    { id: 'ADVANCED', title: 'ADVANCED THEORY', icon: '🤖', color: '#2196F3' },
];

// ═══════════════════════════════════════════════════════════════════════════
// HERO SECTION
// ═══════════════════════════════════════════════════════════════════════════

function HeroSection({ stats, onPlayFeatured }) {
    return (
        <div style={styles.hero}>
            {/* Background gradient */}
            <div style={styles.heroBackground} />

            {/* Floating particles effect */}
            <div style={styles.particleOverlay}>
                {[...Array(12)].map((_, i) => (
                    <motion.div
                        key={i}
                        style={{
                            ...styles.particle,
                            left: `${Math.random() * 100}%`,
                            top: `${Math.random() * 100}%`,
                        }}
                        animate={{
                            y: [0, -20, 0],
                            opacity: [0.3, 0.8, 0.3],
                        }}
                        transition={{
                            duration: 2 + Math.random() * 2,
                            repeat: Infinity,
                            delay: Math.random() * 2,
                        }}
                    />
                ))}
            </div>

            {/* Content */}
            <div style={styles.heroContent}>
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                >
                    <span style={styles.heroLabel}>Daily Challenge</span>
                    <h1 style={styles.heroTitle}>HIGH STAKES BLUFFS</h1>
                    <p style={styles.heroSubtitle}>Master river bluffing spots • 20 Hands • 85% to Pass</p>
                </motion.div>

                {/* Stats row */}
                <motion.div
                    style={styles.statsRow}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                >
                    <div style={styles.statItem}>
                        <span style={styles.statValue}>{stats.gamesPlayed}</span>
                        <span style={styles.statLabel}>Games Played</span>
                    </div>
                    <div style={styles.statDivider} />
                    <div style={styles.statItem}>
                        <span style={styles.statValue}>{stats.gamesMastered}</span>
                        <span style={styles.statLabel}>Mastered</span>
                    </div>
                    <div style={styles.statDivider} />
                    <div style={styles.statItem}>
                        <span style={{ ...styles.statValue, color: '#FFD700' }}>
                            {stats.totalXP.toLocaleString()}
                        </span>
                        <span style={styles.statLabel}>Total XP</span>
                    </div>
                </motion.div>

                {/* CTA */}
                <motion.button
                    style={styles.playButton}
                    onClick={onPlayFeatured}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                >
                    <span style={styles.playIcon}>▶</span>
                    PLAY NOW
                    <span style={styles.xpBadge}>×2.5 XP</span>
                </motion.button>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// FILTER BAR
// ═══════════════════════════════════════════════════════════════════════════

function FilterBar({ active, onFilter, gameCount }) {
    return (
        <div style={styles.filterBar}>
            <div style={styles.filterPills}>
                {FILTERS.map(filter => {
                    const isActive = active === filter.id;
                    return (
                        <motion.button
                            key={filter.id}
                            onClick={() => onFilter(filter.id)}
                            style={{
                                ...styles.filterPill,
                                background: isActive ? '#fff' : 'transparent',
                                color: isActive ? '#0a0a15' : '#fff',
                                border: isActive ? 'none' : `2px solid ${filter.color}`,
                                boxShadow: isActive ? 'none' : `0 0 12px ${filter.color}44`,
                            }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                        >
                            {filter.label}
                        </motion.button>
                    );
                })}
            </div>
            <span style={styles.gameCount}>{gameCount} games</span>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME LANE (Horizontal scroll) - Mobile Optimized
// ═══════════════════════════════════════════════════════════════════════════

function GameLane({ title, icon, color, games, onGameClick, getProgress, badge, categoryId, onCategoryClick }) {
    const router = useRouter();
    if (!games || games.length === 0) return null;

    const handleHeaderClick = () => {
        if (categoryId && onCategoryClick) {
            onCategoryClick(categoryId);
        }
    };

    return (
        <div style={styles.lane}>
            {/* Clickable Lane header */}
            <div
                style={{
                    ...styles.laneHeader,
                    cursor: categoryId ? 'pointer' : 'default'
                }}
                onClick={handleHeaderClick}
            >
                <span style={{ ...styles.laneChevron, color }}>»</span>
                <span style={styles.laneIcon}>{icon}</span>
                <h2 className="vp-lane-title" style={{ ...styles.laneTitle, color }}>{title}</h2>
                {badge && (
                    <motion.span
                        style={styles.laneBadge}
                        animate={{ scale: [1, 1.05, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                    >
                        {badge}
                    </motion.span>
                )}
                <span style={styles.laneCount}>
                    {games.length} games • Scroll for more →
                </span>
            </div>

            {/* Horizontal scrolling cards - Shows ALL games with horizontal scroll */}
            <div style={styles.laneScroller}>
                <div className="vp-lane-cards" style={styles.laneCards}>
                    {games.map((game, i) => (
                        <GameCard
                            key={game.id}
                            game={game}
                            progress={getProgress(game.id)}
                            onClick={onGameClick}
                            index={i}
                            image={getGameImage(game.id)}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function TrainingPage() {
    const router = useRouter();
    const [activeFilter, setActiveFilter] = useState('ALL');
    const [showIntro, setShowIntro] = useState(false);
    const [pendingGame, setPendingGame] = useState(null);
    const {
        isLoaded,
        getGameProgress,
        getOverallStats,
        getUnplayedGames,
        getLeakGames,
        recordSession,
    } = useTrainingProgress();

    // Get filtered games
    const getFilteredGames = () => {
        if (activeFilter === 'ALL') return TRAINING_LIBRARY;
        return getGamesByCategory(activeFilter);
    };

    const filteredGames = getFilteredGames();
    const stats = getOverallStats();

    // Daily Challenge: 1 game from each category, changes daily, difficulty 5-10
    const getDailyChallenge = () => {
        const today = new Date().toDateString();
        const seed = today.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

        const challenges = [];
        CATEGORIES.forEach((cat, index) => {
            const catGames = getGamesByCategory(cat.id).filter(g =>
                g.difficulty >= 5 && g.difficulty <= 10
            );
            if (catGames.length > 0) {
                // Pseudo-random selection based on date + category
                const randomIndex = (seed + index * 37) % catGames.length;
                challenges.push(catGames[randomIndex]);
            }
        });
        return challenges;
    };

    const dailyChallenges = getDailyChallenge().slice(0, 3); // Only show 3 daily challenges
    const leakGames = getLeakGames(TRAINING_LIBRARY);

    // Handle game click - Show intro video first, then navigate
    const handleGameClick = (game) => {
        console.log('🎮 Launching game:', game.name);
        setPendingGame(game);
        setShowIntro(true);
    };

    // Handle category click - Navigate to category page
    const handleCategoryClick = (categoryId) => {
        router.push(`/hub/training/category/${categoryId}`);
    };

    // After intro video completes, navigate to the game
    const handleIntroComplete = () => {
        setShowIntro(false);
        if (pendingGame) {
            router.push(`/hub/training/play/${pendingGame.id}`);
            setPendingGame(null);
        }
    };

    // Handle featured play
    const handlePlayFeatured = () => {
        const featuredGame = TRAINING_LIBRARY[0];
        handleGameClick(featuredGame);
    };

    if (!isLoaded) {
        return (
            <div style={styles.loading}>
                <motion.div
                    style={styles.loadingSpinner}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
                <p>Loading training library...</p>
            </div>
        );
    }

    return (
        <>
            <Head>
                <title>Training — PokerIQ | 100 Games to Master</title>
                {/* LOCK viewport - prevent pinch zoom */}
                <meta name="viewport" content="width=1200, initial-scale=0.33, maximum-scale=1.0, user-scalable=no" />
                {/* TRUE SCALE-DOWN MODEL: Design for 1200px, zoom down on mobile */}
                <style>{`
                    /* Scrollbar styling */
                    ::-webkit-scrollbar { height: 6px; }
                    ::-webkit-scrollbar-track { background: rgba(255,255,255,0.05); }
                    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
                    
                    /* The page is designed for 1200px width */
                    /* CSS zoom scales EVERYTHING uniformly */
                    .training-page {
                        width: 1200px;
                        margin: 0 auto;
                        transform-origin: top center;
                    }
                    
                    /* Scale down on mobile - TRUE uniform scaling */
                    @media (max-width: 1200px) {
                        .training-page {
                            zoom: calc(100vw / 1200);
                        }
                    }
                    
                    /* Fallback for browsers that don't support zoom */
                    @supports not (zoom: 1) {
                        @media (max-width: 1200px) {
                            .training-page {
                                transform: scale(calc(100vw / 1200px));
                                transform-origin: top left;
                                width: 1200px;
                            }
                        }
                    }
                `}</style>
            </Head>

            {/* Video Intro Splash - Shows before loading any game */}
            <GameIntroSplash
                isVisible={showIntro}
                game={pendingGame ? { ...pendingGame, image: getGameImage(pendingGame.id) } : null}
                onComplete={handleIntroComplete}
            />

            <div className="training-page" style={styles.page}>
                {/* Brain Home Button */}
                <BrainHomeButton />

                {/* Hero */}
                <HeroSection stats={stats} onPlayFeatured={handlePlayFeatured} />

                {/* Filters */}
                <FilterBar
                    active={activeFilter}
                    onFilter={setActiveFilter}
                    gameCount={filteredGames.length}
                />

                {/* Game Lanes */}
                <div className="lanes-container-responsive" style={styles.lanesContainer}>
                    {/* TODAY'S DAILY CHALLENGE lane */}
                    {dailyChallenges.length > 0 && activeFilter === 'ALL' && (
                        <GameLane
                            title="TODAY'S DAILY CHALLENGE"
                            icon="🔥"
                            color="#FFD700"
                            games={dailyChallenges}
                            onGameClick={handleGameClick}
                            getProgress={getGameProgress}
                            badge="×2 REWARDS!"
                        />
                    )}

                    {/* FIX YOUR LEAKS lane */}
                    {leakGames.length > 0 && activeFilter === 'ALL' && (
                        <GameLane
                            title="FIX YOUR LEAKS"
                            icon="🔧"
                            color="#FF4444"
                            games={leakGames}
                            onGameClick={handleGameClick}
                            getProgress={getGameProgress}
                            badge="BELOW 70%!"
                        />
                    )}

                    {/* Category lanes */}
                    {activeFilter === 'ALL' ? (
                        // Show all category lanes (4 games each, clickable headers)
                        CATEGORIES.map(cat => (
                            <GameLane
                                key={cat.id}
                                title={cat.title}
                                icon={cat.icon}
                                color={cat.color}
                                games={getGamesByCategory(cat.id)}
                                onGameClick={handleGameClick}
                                getProgress={getGameProgress}
                                categoryId={cat.id}
                                onCategoryClick={handleCategoryClick}
                            />
                        ))
                    ) : (
                        // Show filtered games in a single lane for the selected category
                        (() => {
                            const activeCategory = CATEGORIES.find(c => c.id === activeFilter);
                            const activeFilterConfig = FILTERS.find(f => f.id === activeFilter);
                            return (
                                <GameLane
                                    title={activeCategory?.title || activeFilterConfig?.laneTitle || `${activeFilter} TRAINING`}
                                    icon={activeCategory?.icon || '🎮'}
                                    color={activeCategory?.color || activeFilterConfig?.color || '#fff'}
                                    games={filteredGames}
                                    onGameClick={handleGameClick}
                                    getProgress={getGameProgress}
                                />
                            );
                        })()
                    )}
                </div>

                {/* Footer stats */}
                <div style={styles.footer}>
                    <span>100 Training Games</span>
                    <span>•</span>
                    <span>2,000 Levels</span>
                    <span>•</span>
                    <span>85% to Master</span>
                </div>
            </div>
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles = {
    page: {
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0a0a15 0%, #0d1628 100%)',
        color: '#fff',
        fontFamily: 'Inter, -apple-system, sans-serif',
        paddingBottom: 40,
        overflowX: 'hidden', // Prevent page-level horizontal scroll
    },

    logo: {
        position: 'fixed',
        top: 'var(--vp-space-sm, 1vw)',
        left: 'var(--vp-lane-padding, 2vw)',
        fontSize: 'var(--vp-font-lg, clamp(12px, 2vw, 18px))',
        zIndex: 100,
        padding: 'var(--vp-space-xs, 0.5vw) var(--vp-space-sm, 1vw)',
        background: 'rgba(10, 10, 21, 0.95)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderRadius: 'var(--vp-radius-md, 0.8vw)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 0.5vw 1.5vw rgba(0, 0, 0, 0.3)',
    },

    loading: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#0a0a15',
        color: '#fff',
        gap: 16,
    },

    loadingSpinner: {
        width: 40,
        height: 40,
        border: '3px solid rgba(255,255,255,0.1)',
        borderTopColor: '#00D4FF',
        borderRadius: '50%',
    },

    // Hero - RESPONSIVE (taller on mobile, scaled on desktop)
    hero: {
        position: 'relative',
        height: 'clamp(200px, 35vw, 300px)', // Proper height on all devices
        minHeight: 'clamp(200px, 35vw, 300px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        paddingTop: 'clamp(40px, 5vw, 60px)', // Account for header
    },

    heroBackground: {
        position: 'absolute',
        inset: 0,
        background: `
            radial-gradient(circle at 20% 50%, rgba(255,107,53,0.3) 0%, transparent 50%),
            radial-gradient(circle at 80% 50%, rgba(0,212,255,0.2) 0%, transparent 50%),
            linear-gradient(180deg, #0a0a15 0%, #1a2744 100%)
        `,
    },

    particleOverlay: {
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
    },

    particle: {
        position: 'absolute',
        width: '0.5vw',
        height: '0.5vw',
        borderRadius: '50%',
        background: '#FFD700',
    },

    heroContent: {
        position: 'relative',
        textAlign: 'center',
        zIndex: 1,
    },

    heroLabel: {
        display: 'block',
        fontSize: 'var(--vp-font-md, clamp(10px, 1.6vw, 15px))',
        color: '#FFD700',
        fontStyle: 'italic',
        marginBottom: '1vw',
    },

    heroTitle: {
        fontSize: 'var(--vp-font-xxl, clamp(18px, 4vw, 36px))',
        fontWeight: 800,
        margin: '0 0 0.5vw 0',
        letterSpacing: '0.1vw',
        textShadow: '0 0 3vw rgba(255,107,53,0.5)',
        lineHeight: 1.1,
    },

    heroSubtitle: {
        fontSize: 'var(--vp-font-md, clamp(10px, 1.6vw, 15px))',
        color: 'rgba(255,255,255,0.6)',
        margin: 0,
    },

    statsRow: {
        display: 'flex',
        justifyContent: 'center',
        gap: 'var(--vp-space-lg, 3vw)',
        margin: 'var(--vp-space-lg, 3vw) 0',
    },

    statItem: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },

    statValue: {
        fontSize: 'var(--vp-font-xl, clamp(16px, 3vw, 28px))',
        fontWeight: 700,
        color: '#fff',
    },

    statLabel: {
        fontSize: 'var(--vp-font-xs, clamp(6px, 1.2vw, 11px))',
        color: 'rgba(255,255,255,0.5)',
        textTransform: 'uppercase',
        letterSpacing: '0.1vw',
    },

    statDivider: {
        width: '0.1vw',
        height: '3.5vw',
        background: 'rgba(255,255,255,0.2)',
    },

    playButton: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '1vw',
        padding: 'var(--vp-space-sm, 1vw) var(--vp-space-lg, 3vw)',
        background: 'linear-gradient(135deg, #FF6B35, #E64A19)',
        border: 'none',
        borderRadius: 'var(--vp-radius-xl, 2vw)',
        color: '#fff',
        fontSize: 'var(--vp-font-md, clamp(10px, 1.6vw, 15px))',
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: '0 0.5vw 2vw rgba(255,107,53,0.4)',
        letterSpacing: '0.05vw',
        WebkitTapHighlightColor: 'transparent',
    },

    playIcon: {
        fontSize: 'var(--vp-font-sm, clamp(8px, 1.4vw, 13px))',
    },

    xpBadge: {
        padding: '0.3vw 1vw',
        background: 'rgba(255,255,255,0.2)',
        borderRadius: 'var(--vp-radius-lg, 1.2vw)',
        fontSize: 'var(--vp-font-xs, clamp(6px, 1.2vw, 11px))',
        fontWeight: 600,
    },

    // Filters - RESPONSIVE (auto-height for wrapping)
    filterBar: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 'clamp(4px, 1vw, 8px)',
        padding: 'clamp(8px, 2vw, 12px) clamp(12px, 3vw, 24px)',
        // height: auto - let it grow to fit wrapped pills
        background: 'rgba(10,10,21,0.98)',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
    },

    filterPills: {
        display: 'flex',
        flexWrap: 'wrap', // WRAP to multiple lines
        gap: 'clamp(4px, 1vw, 8px)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '0 clamp(8px, 2vw, 16px)',
    },

    filterPill: {
        padding: 'clamp(4px, 1vw, 8px) clamp(8px, 2vw, 16px)', // Smaller on mobile
        borderRadius: 14, // ALWAYS oval - never square
        fontSize: 'clamp(9px, 2vw, 12px)', // Smaller to fit all 6
        fontWeight: 700,
        letterSpacing: 0.3,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        WebkitTapHighlightColor: 'transparent',
    },

    gameCount: {
        fontSize: 'clamp(8px, 2vw, 12px)',
        color: 'rgba(255,255,255,0.4)',
        flexShrink: 0,
    },

    // Lanes - responsive via global CSS variables
    lanesContainer: {
        padding: 'var(--lane-padding, 20px) 0',
        // maxWidth handled by .lanes-container-responsive class in index.css
    },

    lane: {
        marginBottom: 'var(--vp-section-gap, 3vw)',
    },

    laneHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: '1vw',
        padding: '0 var(--vp-lane-padding, 2vw)',
        marginBottom: 'var(--vp-space-sm, 1vw)',
        height: '4vw',
        minHeight: '4vw',
    },

    laneChevron: {
        fontSize: 'var(--vp-font-lg, clamp(12px, 2vw, 18px))',
        fontWeight: 800,
    },

    laneIcon: {
        fontSize: 'var(--vp-font-lg, clamp(12px, 2vw, 18px))',
    },

    laneTitle: {
        fontSize: 'var(--vp-font-lg, clamp(12px, 2vw, 18px))',
        fontWeight: 700,
        letterSpacing: '0.2vw',
        margin: 0,
        textTransform: 'uppercase',
    },

    laneBadge: {
        padding: '0.4vw 1vw',
        background: 'linear-gradient(90deg, #FF5722, #FF9800)',
        borderRadius: 'var(--vp-radius-sm, 0.5vw)',
        fontSize: 'var(--vp-font-xs, clamp(6px, 1.2vw, 11px))',
        fontWeight: 800,
        color: '#fff',
    },

    laneCount: {
        marginLeft: 'auto',
        fontSize: 'var(--vp-font-xs, clamp(6px, 1.2vw, 11px))',
        color: 'rgba(255,255,255,0.4)',
    },

    laneScroller: {
        overflowX: 'auto',
        overflowY: 'hidden',
        padding: '0 var(--vp-lane-padding, 2vw)',
        maxWidth: '100vw',
        WebkitOverflowScrolling: 'touch',
    },

    laneCards: {
        display: 'flex',
        gap: 'var(--vp-card-gap, 1.5vw)',
        paddingBottom: '1vw',
        paddingRight: 'var(--vp-lane-padding, 2vw)',
        width: 'fit-content',
    },

    // View All Card
    viewAllCard: {
        minWidth: 'var(--vp-card-size, 17vw)',
        height: 'calc(var(--vp-card-size, 17vw) + 6vw)',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
        border: '0.2vw dashed rgba(255,255,255,0.3)',
        borderRadius: 'var(--vp-radius-lg, 1.2vw)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
    },

    viewAllContent: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1vw',
    },

    viewAllIcon: {
        fontSize: 'var(--vp-font-xl, clamp(16px, 3vw, 28px))',
        color: '#00D4FF',
    },

    viewAllText: {
        fontSize: 'var(--vp-font-md, clamp(10px, 1.6vw, 15px))',
        fontWeight: 600,
        color: '#fff',
        textTransform: 'uppercase',
        letterSpacing: '0.1vw',
    },

    viewAllCount: {
        fontSize: 'var(--vp-font-xs, clamp(6px, 1.2vw, 11px))',
        color: 'rgba(255,255,255,0.6)',
    },

    // Footer
    footer: {
        display: 'flex',
        justifyContent: 'center',
        gap: 'var(--vp-space-md, 2vw)',
        padding: 'var(--vp-space-xl, 4vw) 0',
        fontSize: 'var(--vp-font-xs, clamp(6px, 1.2vw, 11px))',
        color: 'rgba(255,255,255,0.3)',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        marginTop: 'var(--vp-space-xl, 4vw)',
    },
};

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
                <h2 style={{ ...styles.laneTitle, color }}>{title}</h2>
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
                <div style={styles.laneCards}>
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

    const dailyChallenges = getDailyChallenge();
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
                <style>{`
                    /* ═══════════════════════════════════════════════════════════════
                       VIEWPORT SCALING — Same layout on EVERY device
                       5 cards always visible, everything scales proportionally
                       ═══════════════════════════════════════════════════════════════ */
                    
                    :root {
                        /* Card size: 17vw = 5 cards + gaps fit perfectly in 100vw */
                        --vp-card-size: 17vw;
                        --vp-card-gap: 1.5vw;
                        --vp-lane-padding: 2vw;
                        --vp-font-scale: 1.8vw;
                    }
                    
                    /* Training page specific overrides */
                    .training-page {
                        font-size: clamp(10px, var(--vp-font-scale), 18px);
                    }
                    
                    .training-lane-cards {
                        display: flex !important;
                        gap: var(--vp-card-gap) !important;
                        padding: 0 var(--vp-lane-padding) !important;
                    }
                    
                    .training-card {
                        width: var(--vp-card-size) !important;
                        height: var(--vp-card-size) !important;
                        flex-shrink: 0 !important;
                    }
                    
                    .training-card-image {
                        width: var(--vp-card-size) !important;
                        height: var(--vp-card-size) !important;
                    }
                    
                    .training-card-title {
                        font-size: clamp(8px, 1.6vw, 14px) !important;
                        max-width: var(--vp-card-size) !important;
                    }
                    
                    /* Hero section scales */
                    .training-hero-title {
                        font-size: clamp(18px, 4vw, 36px) !important;
                    }
                    
                    .training-hero-subtitle {
                        font-size: clamp(10px, 1.8vw, 16px) !important;
                    }
                    
                    /* Filter pills scale */
                    .training-filter-pill {
                        padding: clamp(4px, 1vw, 12px) clamp(8px, 2vw, 20px) !important;
                        font-size: clamp(8px, 1.4vw, 13px) !important;
                    }
                    
                    /* Lane titles scale */
                    .training-lane-title {
                        font-size: clamp(10px, 2vw, 18px) !important;
                    }
                    
                    /* Stats scale */
                    .training-stat-value {
                        font-size: clamp(16px, 3vw, 28px) !important;
                    }
                    
                    .training-stat-label {
                        font-size: clamp(6px, 1.2vw, 11px) !important;
                    }
                    
                    /* Scrollbar */
                    ::-webkit-scrollbar { height: 6px; }
                    ::-webkit-scrollbar-track { background: rgba(255,255,255,0.05); }
                    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
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
        top: 12,
        left: 16,
        fontSize: 18,
        zIndex: 100,
        padding: '8px 12px',
        background: 'rgba(10, 10, 21, 0.95)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderRadius: 8,
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
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

    // Hero - FIXED SIZE, mobile-first
    hero: {
        position: 'relative',
        height: 240, // Fixed height, optimized for mobile
        minHeight: 240,
        maxHeight: 240,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        paddingTop: 44, // Account for fixed header
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
        width: 4,
        height: 4,
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
        fontSize: 14,
        color: '#FFD700',
        fontStyle: 'italic',
        marginBottom: 8,
    },

    heroTitle: {
        fontSize: 28, // Fixed size for mobile
        fontWeight: 800,
        margin: '0 0 6px 0',
        letterSpacing: 1,
        textShadow: '0 0 30px rgba(255,107,53,0.5)',
        lineHeight: 1.1,
    },

    heroSubtitle: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
        margin: 0,
    },

    statsRow: {
        display: 'flex',
        justifyContent: 'center',
        gap: 24,
        margin: '24px 0',
    },

    statItem: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },

    statValue: {
        fontSize: 24,
        fontWeight: 700,
        color: '#fff',
    },

    statLabel: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.5)',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },

    statDivider: {
        width: 1,
        height: 28,
        background: 'rgba(255,255,255,0.2)',
    },

    playButton: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '12px 24px', // Smaller for mobile
        background: 'linear-gradient(135deg, #FF6B35, #E64A19)',
        border: 'none',
        borderRadius: 24,
        color: '#fff',
        fontSize: 14,
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: '0 4px 20px rgba(255,107,53,0.4)',
        letterSpacing: 0.5,
        WebkitTapHighlightColor: 'transparent',
    },

    playIcon: {
        fontSize: 12,
    },

    xpBadge: {
        padding: '3px 8px',
        background: 'rgba(255,255,255,0.2)',
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 600,
    },

    // Filters - FIXED SIZE header, mobile-first
    filterBar: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        height: 56, // FIXED height
        minHeight: 56,
        maxHeight: 56,
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
        gap: 6,
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
    },

    filterPill: {
        padding: '8px 16px', // Compact for mobile
        borderRadius: 18,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 1,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        WebkitTapHighlightColor: 'transparent',
    },

    gameCount: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
    },

    // Lanes - responsive via global CSS variables
    lanesContainer: {
        padding: 'var(--lane-padding, 20px) 0',
        // maxWidth handled by .lanes-container-responsive class in index.css
    },

    lane: {
        marginBottom: 32,
    },

    laneHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 16px', // Tighter padding for mobile
        marginBottom: 12,
        height: 32, // Fixed height
        minHeight: 32,
    },

    laneChevron: {
        fontSize: 20,
        fontWeight: 800,
    },

    laneIcon: {
        fontSize: 20,
    },

    laneTitle: {
        fontSize: 16,
        fontWeight: 700,
        letterSpacing: 2,
        margin: 0,
        textTransform: 'uppercase',
    },

    laneBadge: {
        padding: '4px 10px',
        background: 'linear-gradient(90deg, #FF5722, #FF9800)',
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 800,
        color: '#fff',
    },

    laneCount: {
        marginLeft: 'auto',
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
    },

    laneScroller: {
        overflowX: 'auto',
        overflowY: 'hidden',
        padding: '0 16px',
        maxWidth: '100vw', // Never exceed viewport width
        WebkitOverflowScrolling: 'touch', // Smooth scrolling on iOS
    },

    laneCards: {
        display: 'flex',
        gap: 'var(--card-gap, 12px)', // Responsive gap from global CSS
        paddingBottom: 8,
        paddingRight: 'var(--lane-padding, 16px)',
        width: 'fit-content', // Cards determine the width, not container
    },

    // View All Card
    viewAllCard: {
        minWidth: 160,
        height: 220,
        background: 'linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
        border: '2px dashed rgba(255,255,255,0.3)',
        borderRadius: 12,
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
        gap: 8,
    },

    viewAllIcon: {
        fontSize: 32,
        color: '#00D4FF',
    },

    viewAllText: {
        fontSize: 14,
        fontWeight: 600,
        color: '#fff',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },

    viewAllCount: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.6)',
    },

    // Footer
    footer: {
        display: 'flex',
        justifyContent: 'center',
        gap: 16,
        padding: '40px 0',
        fontSize: 12,
        color: 'rgba(255,255,255,0.3)',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        marginTop: 40,
    },
};

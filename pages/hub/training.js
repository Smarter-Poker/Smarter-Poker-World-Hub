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
import GameCard from '../../../src/components/training/GameCard';
import { TRAINING_LIBRARY, TRAINING_LANES, getGamesByCategory, getGamesByTag } from '../../../src/data/TRAINING_LIBRARY';
import useTrainingProgress from '../../../src/hooks/useTrainingProgress';
import { getGameImage } from '../../../src/data/GAME_IMAGES';

// Filter options
const FILTERS = [
    { id: 'ALL', color: '#fff', activeColor: '#0a0a15' },
    { id: 'GTO', color: '#4CAF50' },
    { id: 'EXPLOITATIVE', color: '#FF6B35' },
    { id: 'MATH', color: '#2196F3' },
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
                            {filter.id}
                        </motion.button>
                    );
                })}
            </div>
            <span style={styles.gameCount}>{gameCount} games</span>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME LANE (Horizontal scroll)
// ═══════════════════════════════════════════════════════════════════════════

function GameLane({ title, icon, color, games, onGameClick, getProgress, badge }) {
    if (!games || games.length === 0) return null;

    return (
        <div style={styles.lane}>
            {/* Lane header */}
            <div style={styles.laneHeader}>
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
                <span style={styles.laneCount}>{games.length} games</span>
            </div>

            {/* Horizontal scrolling cards */}
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
        return getGamesByTag(activeFilter.toLowerCase());
    };

    const filteredGames = getFilteredGames();
    const stats = getOverallStats();
    const newGames = getUnplayedGames(TRAINING_LIBRARY).slice(0, 8);
    const leakGames = getLeakGames(TRAINING_LIBRARY);

    // Handle game click
    const handleGameClick = (game) => {
        // For now, show alert. Later, route to arena
        console.log('🎮 Launching game:', game.name);

        // Demo: Record a session immediately for testing
        // In production, this would happen after completing a run
        router.push(`/hub/training/play/${game.id}`);
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
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { 
                        background: #0a0a15; 
                        overflow-x: hidden;
                    }
                    ::-webkit-scrollbar { height: 6px; }
                    ::-webkit-scrollbar-track { background: rgba(255,255,255,0.05); }
                    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
                `}</style>
            </Head>

            <div style={styles.page}>
                {/* Logo */}
                <div style={styles.logo}>
                    <span style={{ color: '#FF6B35' }}>Poker</span>
                    <strong style={{ color: '#fff' }}>IQ</strong>
                </div>

                {/* Hero */}
                <HeroSection stats={stats} onPlayFeatured={handlePlayFeatured} />

                {/* Filters */}
                <FilterBar
                    active={activeFilter}
                    onFilter={setActiveFilter}
                    gameCount={filteredGames.length}
                />

                {/* Game Lanes */}
                <div style={styles.lanesContainer}>
                    {/* NEW FOR YOU lane */}
                    {newGames.length > 0 && activeFilter === 'ALL' && (
                        <GameLane
                            title="NEW FOR YOU"
                            icon="✨"
                            color="#00D4FF"
                            games={newGames}
                            onGameClick={handleGameClick}
                            getProgress={getGameProgress}
                            badge="FRESH!"
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
                        // Show all category lanes
                        CATEGORIES.map(cat => (
                            <GameLane
                                key={cat.id}
                                title={cat.title}
                                icon={cat.icon}
                                color={cat.color}
                                games={getGamesByCategory(cat.id)}
                                onGameClick={handleGameClick}
                                getProgress={getGameProgress}
                            />
                        ))
                    ) : (
                        // Show filtered games in a single lane
                        <GameLane
                            title={`${activeFilter} TRAINING`}
                            icon={activeFilter === 'GTO' ? '📐' : activeFilter === 'MATH' ? '🧮' : '🎣'}
                            color={FILTERS.find(f => f.id === activeFilter)?.color || '#fff'}
                            games={filteredGames}
                            onGameClick={handleGameClick}
                            getProgress={getGameProgress}
                        />
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
    },

    logo: {
        position: 'fixed',
        top: 16,
        left: 20,
        fontSize: 18,
        zIndex: 100,
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

    // Lanes
    lanesContainer: {
        padding: '20px 0',
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
        padding: '0 24px',
    },

    laneCards: {
        display: 'flex',
        gap: 12, // Tighter gap for mobile
        paddingBottom: 8,
        paddingRight: 16, // Extra space at end
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

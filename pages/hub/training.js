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

// Category definitions (no icons)
const CATEGORIES = [
    { id: 'MTT', title: 'MTT MASTERY', color: '#FF6B35' },
    { id: 'CASH', title: 'CASH GAME GRIND', color: '#4CAF50' },
    { id: 'SPINS', title: 'SPINS & SNGS', color: '#FFD700' },
    { id: 'PSYCHOLOGY', title: 'MENTAL GAME', color: '#9C27B0' },
    { id: 'ADVANCED', title: 'ADVANCED THEORY', color: '#2196F3' },
];

// ═══════════════════════════════════════════════════════════════════════════
// TRAINING HEADER — Fixed header with Hub button, stats, and profile
// ═══════════════════════════════════════════════════════════════════════════

function TrainingHeader({ gamesPlayed = 0 }) {
    const router = useRouter();
    const [diamonds, setDiamonds] = useState(300);
    const [xp, setXp] = useState(50);
    const [avatarUrl, setAvatarUrl] = useState(null);

    // Fetch user profile data
    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const { createClient } = await import('@supabase/supabase-js');
                const supabase = createClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL,
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
                );
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('avatar_url, diamonds, xp')
                        .eq('id', user.id)
                        .maybeSingle();
                    if (profile) {
                        setAvatarUrl(profile.avatar_url);
                        if (profile.diamonds) setDiamonds(profile.diamonds);
                        if (profile.xp) setXp(profile.xp);
                    }
                }
            } catch (e) {
                console.error('Failed to fetch profile:', e);
            }
        };
        fetchProfile();
    }, []);

    return (
        <div style={headerStyles.container}>
            {/* LEFT: Smarter.Poker Logo → Hub */}
            <div
                onClick={() => router.push('/hub')}
                style={headerStyles.logoContainer}
            >
                <img
                    src="/smarter-poker-logo-transparent.png"
                    alt="Smarter Poker"
                    style={headerStyles.logo}
                />
            </div>

            {/* RIGHT: Stats + Profile */}
            <div style={headerStyles.rightSection}>
                {/* Games Played Counter */}
                <div style={headerStyles.gamesChip}>
                    <span style={headerStyles.gamesValue}>{gamesPlayed}</span>
                    <span style={headerStyles.gamesLabel}>of 100</span>
                </div>

                {/* Diamond Wallet with + for top-up */}
                <div
                    onClick={() => router.push('/hub/diamond-store')}
                    style={{ ...headerStyles.statChip, cursor: 'pointer' }}
                >
                    <span style={{ fontSize: 14 }}>💎</span>
                    <span style={headerStyles.statValue}>{diamonds.toLocaleString()}</span>
                    <span style={headerStyles.plusIcon}>+</span>
                </div>

                {/* XP */}
                <div style={headerStyles.statChip}>
                    <span style={{ fontSize: 12, color: '#FFD700' }}>XP</span>
                    <span style={headerStyles.statValue}>{xp.toLocaleString()}</span>
                </div>

                {/* Profile Orb → Profile Page */}
                <div
                    onClick={() => router.push('/hub/profile')}
                    style={{
                        ...headerStyles.profileOrb,
                        backgroundImage: avatarUrl ? `url('${avatarUrl}')` : 'linear-gradient(135deg, #00d4ff, #0066ff)',
                    }}
                />
            </div>
        </div>
    );
}

const headerStyles = {
    container: {
        position: 'sticky',
        top: 0,
        left: 0,
        right: 0,
        height: 56,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0 16px',
        background: 'linear-gradient(180deg, rgba(10, 22, 40, 0.98), rgba(5, 15, 30, 0.95))',
        backdropFilter: 'blur(15px)',
        WebkitBackdropFilter: 'blur(15px)',
        borderBottom: '2px solid rgba(0, 212, 255, 0.3)',
        zIndex: 100,
    },
    logoContainer: {
        cursor: 'pointer',
        transition: 'transform 0.2s ease',
    },
    logo: {
        height: 36,
        width: 'auto',
        objectFit: 'contain',
    },
    rightSection: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
    },
    statChip: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 10px',
        background: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 16,
        border: '1px solid rgba(255, 255, 255, 0.15)',
    },
    statValue: {
        fontSize: 12,
        fontWeight: 700,
        color: '#fff',
    },
    gamesChip: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 12px',
        background: 'rgba(0, 212, 255, 0.15)',
        borderRadius: 16,
        border: '1px solid rgba(0, 212, 255, 0.4)',
    },
    gamesValue: {
        fontSize: 14,
        fontWeight: 800,
        color: '#00d4ff',
    },
    gamesLabel: {
        fontSize: 10,
        fontWeight: 600,
        color: 'rgba(255, 255, 255, 0.6)',
    },
    plusIcon: {
        fontSize: 12,
        fontWeight: 800,
        color: '#4CAF50',
        marginLeft: 2,
    },
    profileOrb: {
        width: 32,
        height: 32,
        borderRadius: '50%',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        border: '2px solid rgba(0, 212, 255, 0.6)',
        boxShadow: '0 0 12px rgba(0, 212, 255, 0.3)',
        cursor: 'pointer',
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// PROMO SECTION — Living advertisement / featured content area
// ═══════════════════════════════════════════════════════════════════════════

function PromoSection({ onPlayFeatured }) {
    return (
        <motion.div
            style={promoStyles.container}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
        >
            <div style={promoStyles.content}>
                <span style={promoStyles.badge}>DAILY CHALLENGE</span>
                <h2 style={promoStyles.title}>HIGH STAKES BLUFFS</h2>
                <p style={promoStyles.subtitle}>Master river bluffing • 20 Hands • 85% to Pass</p>
                <motion.button
                    style={promoStyles.playButton}
                    onClick={onPlayFeatured}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                >
                    ▶ PLAY NOW
                    <span style={promoStyles.xpBadge}>×2.5 XP</span>
                </motion.button>
            </div>
        </motion.div>
    );
}

const promoStyles = {
    container: {
        padding: '16px 20px',
        background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.08), rgba(0, 100, 200, 0.1))',
        borderBottom: '1px solid rgba(0, 212, 255, 0.2)',
    },
    content: {
        textAlign: 'center',
    },
    badge: {
        display: 'inline-block',
        padding: '4px 10px',
        background: 'rgba(0, 212, 255, 0.15)',
        border: '1px solid rgba(0, 212, 255, 0.4)',
        borderRadius: 12,
        fontSize: 10,
        fontWeight: 700,
        color: '#00d4ff',
        letterSpacing: 0.5,
        marginBottom: 6,
    },
    title: {
        margin: '0 0 4px 0',
        fontSize: 22,
        fontWeight: 900,
        fontFamily: 'Orbitron, sans-serif',
        color: '#fff',
        letterSpacing: 2,
        textShadow: '0 2px 8px rgba(0,0,0,0.5)',
    },
    subtitle: {
        margin: '0 0 10px 0',
        fontSize: 11,
        color: 'rgba(255,255,255,0.6)',
    },
    playButton: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 24px',
        background: 'linear-gradient(135deg, #FF6B35, #FF8F35)',
        border: 'none',
        borderRadius: 24,
        fontSize: 13,
        fontWeight: 800,
        color: '#fff',
        cursor: 'pointer',
        boxShadow: '0 4px 16px rgba(255, 107, 53, 0.4)',
    },
    xpBadge: {
        padding: '3px 8px',
        background: 'rgba(255,255,255,0.2)',
        borderRadius: 10,
        fontSize: 10,
        fontWeight: 700,
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// STREAKS BADGE — Shows highest streak achievement
// ═══════════════════════════════════════════════════════════════════════════

function StreaksBadge({ bestStreak }) {
    if (!bestStreak || bestStreak === 0) return null;

    return (
        <motion.div
            style={streakStyles.container}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
        >
            <div style={streakStyles.content}>
                <span style={streakStyles.icon}>🔥</span>
                <div style={streakStyles.textContainer}>
                    <span style={streakStyles.label}>BEST STREAK</span>
                    <span style={streakStyles.value}>{bestStreak} in a row</span>
                </div>
            </div>
        </motion.div>
    );
}

const streakStyles = {
    container: {
        padding: '12px 20px',
        background: 'linear-gradient(135deg, rgba(255, 107, 53, 0.12), rgba(255, 152, 0, 0.08))',
        borderBottom: '1px solid rgba(255, 152, 0, 0.2)',
    },
    content: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
    },
    icon: {
        fontSize: 24,
    },
    textContainer: {
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
    },
    label: {
        fontSize: 9,
        fontWeight: 700,
        color: 'rgba(255, 255, 255, 0.5)',
        letterSpacing: 0.5,
    },
    value: {
        fontSize: 16,
        fontWeight: 900,
        color: '#FF9800',
        fontFamily: 'Orbitron, sans-serif',
    },
};



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
            {/* Game count removed to fit all 6 pills */}
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
                {/* Icons removed */}
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
                {/* 
                    SMARTER.POKER GLOBAL SCALING MODEL
                    ---------------------------------
                    DESIGN WIDTH: 800px (standard desktop build mode)
                    - 3 cards visible per lane
                    - All 6 filter pills visible
                    - Everything fits within 800px with margins
                    
                    CSS ZOOM: Scales entire page uniformly for any device
                    - iPhone (393px): zoom = 393/800 = 0.49x (49% of desktop size)
                    - iPad (768px): zoom = 768/800 = 0.96x (96% of desktop size)
                    - Desktop (1440px): zoom = 1440/800 = 1.8x (180% of desktop size - capped)
                */}
                <meta name="viewport" content="width=800, user-scalable=no" />
                <style>{`
                    /* Scrollbar styling */
                    ::-webkit-scrollbar { height: 6px; }
                    ::-webkit-scrollbar-track { background: rgba(255,255,255,0.05); }
                    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
                    
                    /* ═══════════════════════════════════════════════════════════════════
                       SMARTER.POKER 800px DESIGN - Fixed breakpoints for stability
                       ═══════════════════════════════════════════════════════════════════ */
                    .training-page {
                        width: 800px;
                        max-width: 800px;
                        margin: 0 auto;
                        overflow-x: hidden;
                    }
                    
                    /* Mobile phones (390-450px) - zoom to ~50% */
                    @media (max-width: 500px) {
                        .training-page { zoom: 0.5; }
                    }
                    
                    /* Large phones / small tablets (501-700px) */
                    @media (min-width: 501px) and (max-width: 700px) {
                        .training-page { zoom: 0.75; }
                    }
                    
                    /* Tablets (701-900px) */
                    @media (min-width: 701px) and (max-width: 900px) {
                        .training-page { zoom: 0.95; }
                    }
                    
                    /* Desktop (901px+) - native size or slight scale up */
                    @media (min-width: 901px) {
                        .training-page { zoom: 1.2; }
                    }
                    
                    /* Large desktop (1400px+) - cap at 1.5x */
                    @media (min-width: 1400px) {
                        .training-page { zoom: 1.5; }
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
                {/* Fixed Header */}
                <TrainingHeader gamesPlayed={stats.gamesPlayed} />

                {/* Promo/Ad Section */}
                <PromoSection onPlayFeatured={handlePlayFeatured} />

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
                            color="#FFD700"
                            games={dailyChallenges}
                            onGameClick={handleGameClick}
                            getProgress={getGameProgress}
                        />
                    )}

                    {/* FIX YOUR LEAKS lane */}
                    {leakGames.length > 0 && activeFilter === 'ALL' && (
                        <GameLane
                            title="FIX YOUR LEAKS"
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

    // Hero - FIXED design (CSS zoom handles scaling)
    hero: {
        position: 'relative',
        height: 280, // Fixed design height
        minHeight: 280,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        paddingTop: 60,
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

    // Filters - FIXED design (CSS zoom handles scaling)
    filterBar: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
        padding: '12px 24px',
        height: 60,
        minHeight: 60,
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
        justifyContent: 'space-between', // Spread to fill width
        gap: 8,
        width: '100%',
        padding: '0 20px',
    },

    filterPill: {
        padding: '10px 18px', // Bigger, fills more space
        borderRadius: 18,
        fontSize: 12, // Bigger font
        fontWeight: 700,
        letterSpacing: 0.4,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        whiteSpace: 'nowrap',
        flex: 1, // Each pill expands equally
        textAlign: 'center',
        WebkitTapHighlightColor: 'transparent',
    },

    // gameCount style removed - not used

    // Lanes - FIXED design (CSS zoom handles scaling)
    lanesContainer: {
        padding: '20px 0',
    },

    lane: {
        marginBottom: 32,
    },

    laneHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 24px',
        marginBottom: 16,
        height: 36,
        minHeight: 36,
    },

    laneChevron: {
        fontSize: 20,
        fontWeight: 800,
    },

    laneIcon: {
        fontSize: 22,
    },

    laneTitle: {
        fontSize: 18,
        fontWeight: 700,
        letterSpacing: 2,
        margin: 0,
        textTransform: 'uppercase',
    },

    laneBadge: {
        padding: '5px 12px',
        background: 'linear-gradient(90deg, #FF5722, #FF9800)',
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 800,
        color: '#fff',
    },

    laneCount: {
        marginLeft: 'auto',
        fontSize: 13,
        color: 'rgba(255,255,255,0.4)',
    },

    laneScroller: {
        overflowX: 'auto',
        overflowY: 'hidden',
        padding: '0 24px',
        maxWidth: '100%',
        WebkitOverflowScrolling: 'touch',
    },

    laneCards: {
        display: 'flex',
        gap: 16,
        paddingBottom: 12,
        paddingRight: 24,
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

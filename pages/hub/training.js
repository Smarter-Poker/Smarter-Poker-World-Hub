/**
 *  TRAINING PAGE — 100-Game Library with Video Game Feel
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
import SEOHead from '../../src/components/seo/SEOHead';
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
// gsap loaded dynamically — not needed for initial render
let gsap = null;
let ScrollTrigger = null;
if (typeof window !== 'undefined') {
    import('gsap').then(m => { gsap = m.default; });
    import('gsap/dist/ScrollTrigger').then(m => { ScrollTrigger = m.ScrollTrigger; });
}
import confetti from 'canvas-confetti';
import GameCard from '../../src/components/training/GameCard';
import { TRAINING_LIBRARY, getGamesByCategory } from '../../src/data/TRAINING_LIBRARY';
import useTrainingProgress from '../../src/hooks/useTrainingProgress';
import { getAuthUser } from '../../src/lib/authUtils';
import { getGameImage } from '../../src/data/GAME_IMAGES';
import DiamondEngine from '../../src/services/DiamondEngine';
import GameCostPopup from '../../src/components/gates/GameCostPopup';
import GameIntroSplash from '../../src/components/training/GameIntroSplash';
import LeakFixerIntercept from '../../src/components/training/LeakFixerIntercept';
import SmartPracticeCard from '../../src/components/training/SmartPracticeCard';
import dynamic from 'next/dynamic';

// Dynamic import for GodModeArena to avoid SSR issues
const GodModeArena = dynamic(
    () => import('../../src/components/training/GodModeArena').catch(err => {
        console.error('[Training] Failed to load GodModeArena chunk:', err);
        // Return a fallback component on chunk load failure
        return {
            default: () => (
                <div style={{ padding: 40, textAlign: 'center', color: '#fff' }}>
                    <h3 style={{ color: '#ef4444', marginBottom: 12 }}>Failed to load game arena</h3>
                    <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 16 }}>Please refresh the page to try again.</p>
                    <button onClick={() => window.location.reload()} style={{ padding: '10px 20px', background: '#3b82f6', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Refresh</button>
                </div>
            )
        };
    }),
    {
        ssr: false,
        loading: () => (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'rgba(255,255,255,0.5)' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 32, marginBottom: 12, animation: 'spin 1s linear infinite', width: 32, height: 32, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#00d4ff', borderRadius: '50%' }} />
                    <div>Loading Game Arena...</div>
                </div>
            </div>
        ),
    }
);
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import TrainingSettingsMenu from '../../src/components/training/TrainingSettingsMenu';

// God-Mode Stack
import { useTrainingStore } from '../../src/stores/trainingStore';
import PageTransition from '../../src/components/transitions/PageTransition';
import { achievementCelebration } from '../../src/utils/confetti';
import toast from '../../src/stores/toastStore';
import { trainingSounds } from '../../src/utils/trainingSounds';
import GamificationService from '../../services/GamificationService';
import AchievementToast from '../../src/components/training/AchievementToast';
import ChallengesWidget from '../../src/components/training/ChallengesWidget';
import JarvisRecommendations from '../../src/components/training/JarvisRecommendations';
// DailyBonusWidget removed per UI overhaul
import useTrainingRealtime from '../../src/hooks/useTrainingRealtime';
import useTrainingBus from '../../src/hooks/useTrainingBus';


// Register GSAP plugins
if (typeof window !== 'undefined') {
    if (gsap && ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
}


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
    const [diamonds, setDiamonds] = useState(0);
    const [avatarUrl, setAvatarUrl] = useState(null);

    // Fetch user profile data using authUtils
    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const { getAuthUser, queryProfiles, queryDiamondBalance } = await import('../../src/lib/authUtils');
                const authUser = getAuthUser();
                if (authUser) {
                    // Fetch profile for avatar only
                    const profile = await queryProfiles(authUser.id, 'avatar_url');
                    // Fetch diamond balance from user_diamond_balance table
                    const diamondBalance = await queryDiamondBalance(authUser.id);

                    if (profile) {
                        setAvatarUrl(profile.avatar_url);
                    }
                    setDiamonds(diamondBalance);
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
                    loading="lazy" />
            </div>

            {/* RIGHT: Stats + Profile */}
            <div style={headerStyles.rightSection}>
                {/* Games Played Counter */}
                <div style={headerStyles.gamesChip}>
                    <span style={headerStyles.gamesValue}>{gamesPlayed}</span>
                    <span style={headerStyles.gamesLabel}>Of 100</span>
                </div>

                {/* Diamond Wallet with + for top-up */}
                <div
                    onClick={() => router.push('/hub/diamond-store')}
                    style={{ ...headerStyles.statChip, cursor: 'pointer' }}
                >
                    <span style={{ fontSize: 14 }}>Diamonds</span>
                    <span style={headerStyles.statValue}>{diamonds.toLocaleString()}</span>
                    <span style={headerStyles.plusIcon}>+</span>
                </div>



                {/* Settings Menu Button */}
                <TrainingSettingsMenu />

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
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
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
                <p style={promoStyles.subtitle}>Master River Bluffing • 20 Hands • 85% To Pass</p>
                <motion.button
                    style={promoStyles.playButton}
                    onClick={onPlayFeatured}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                >
                    ▶ PLAY NOW
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
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
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
                <span style={streakStyles.icon}></span>
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
                                border: isActive ? 'none' : `1px solid ${filter.color}60`,
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
// OUT OF DIAMONDS MODAL
// ═══════════════════════════════════════════════════════════════════════════
function OutOfDiamondsModal({ isOpen, onClose, gameCost = 10 }) {
    const router = useRouter();
    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
        }}>
            <div style={{
                background: 'linear-gradient(135deg, #1a0a2a, #0a0a12)',
                borderRadius: 24,
                padding: 32,
                maxWidth: 420,
                width: '90%',
                textAlign: 'center',
                border: '2px solid rgba(255, 107, 0, 0.5)',
                boxShadow: 'none',
            }}>
                <div style={{ fontSize: 64, marginBottom: 16 }}>◆</div>
                <h2 style={{
                    fontFamily: 'Orbitron, sans-serif',
                    fontSize: 28,
                    fontWeight: 900,
                    color: '#ff6b00',
                    marginBottom: 8,
                }}>OUT OF DIAMONDS</h2>
                <p style={{
                    color: 'rgba(255,255,255,0.7)',
                    fontSize: 16,
                    marginBottom: 24,
                    lineHeight: 1.6,
                }}>
                    You need <strong style={{ color: '#FFD700' }}>{gameCost} diamonds</strong> to play this training game.
                </p>

                <div style={{
                    background: 'linear-gradient(135deg, rgba(138, 43, 226, 0.2), rgba(0, 212, 255, 0.2))',
                    borderRadius: 16,
                    padding: 20,
                    marginBottom: 24,
                    border: '1px solid rgba(138, 43, 226, 0.3)',
                }}>
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
                        GET VIP FOR
                    </div>
                    <div style={{
                        fontFamily: 'Orbitron, sans-serif',
                        fontSize: 32,
                        fontWeight: 900,
                        color: '#fff',
                        marginBottom: 4,
                    }}>
                        $19.99<span style={{ fontSize: 16, opacity: 0.7 }}>/month</span>
                    </div>
                    <div style={{ color: '#00ff88', fontSize: 14, fontWeight: 600 }}>
                        UNLIMITED ACCESS • No diamonds needed
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                    <button
                        onClick={onClose}
                        style={{
                            flex: 1,
                            padding: '14px 24px',
                            background: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: 12,
                            color: '#fff',
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        Maybe Later
                    </button>
                    <button
                        onClick={() => router.push('/hub/diamond-store?tab=vip')}
                        style={{
                            flex: 1,
                            padding: '14px 24px',
                            background: 'linear-gradient(135deg, #ff6b00, #ff0066)',
                            border: 'none',
                            borderRadius: 12,
                            color: '#fff',
                            fontSize: 14,
                            fontWeight: 700,
                            cursor: 'pointer',
                        }}
                    >
                        Get Diamonds
                    </button>
                </div>
            </div>
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
        <div className="game-lane" style={styles.lane}>
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
    useTrainingBus('training-hub');

    // Zustand Global State (replaces local useState)
    const activeFilter = useTrainingStore((s) => s.activeFilter);
    const setActiveFilter = useTrainingStore((s) => s.setActiveFilter);
    const showIntro = useTrainingStore((s) => s.showIntro);
    const setShowIntro = useTrainingStore((s) => s.setShowIntro);
    const pendingGame = useTrainingStore((s) => s.pendingGame);
    const setPendingGame = useTrainingStore((s) => s.setPendingGame);
    const markGameCelebrated = useTrainingStore((s) => s.markGameCelebrated);
    const celebratedGames = useTrainingStore((s) => s.celebratedGames);

    //  ARENA STATE - Show arena inline after intro video
    const [showArena, setShowArena] = useState(false);
    const [activeGame, setActiveGame] = useState(null);

    //  INTRO VIDEO STATE - Video plays while page loads in background
    // Only show once per session (not on every reload)
    const [showPageIntro, setShowPageIntro] = useState(() => {
        if (typeof window !== 'undefined') {
            return !sessionStorage.getItem('training-intro-seen');
        }
        return false;
    });
    const introVideoRef = useRef(null);

    // SETTINGS MENU STATE
    const [showSettingsMenu, setShowSettingsMenu] = useState(false);

    // Quick Links overlay state
    const [showQuickLinks, setShowQuickLinks] = useState(false);
    // Session recap / Jarvis drawers
    const [showRecapDrawer, setShowRecapDrawer] = useState(false);
    const [showJarvisDrawer, setShowJarvisDrawer] = useState(false);

    // DIAMOND ENTRY FEE STATE
    const [isVIP, setIsVIP] = useState(false);
    const [diamondBalance, setDiamondBalance] = useState(0);
    const [showOutOfDiamondsModal, setShowOutOfDiamondsModal] = useState(false);
    const GAME_COST = 10; // 10 diamonds per training game

    // User ID for authenticated features
    const [userId, setUserId] = useState(null);
    const [sessionHistory, setSessionHistory] = useState([]);

    // Real-time notifications for achievements/leaderboard changes
    const {
        newAchievement: realtimeAchievement,
        leaderboardChange,
        challengeComplete,
        clearAchievement: clearRealtimeAchievement
    } = useTrainingRealtime(userId);

    // Show toast for realtime achievement
    useEffect(() => {
        if (realtimeAchievement) {
            setUnlockedAchievements([realtimeAchievement]);
            clearRealtimeAchievement();
        }
    }, [realtimeAchievement, clearRealtimeAchievement]);

    // Show toast for leaderboard rank improvements
    useEffect(() => {
        if (leaderboardChange && leaderboardChange.newRank <= 10) {
            toast.success(`You moved to #${leaderboardChange.newRank} on the ${leaderboardChange.periodType} leaderboard!`);
        }
    }, [leaderboardChange]);

    // Show toast for challenge completions
    useEffect(() => {
        if (challengeComplete) {
            toast.success(`Challenge Complete: ${challengeComplete.name}! Claim your reward!`);
        }
    }, [challengeComplete]);


    // Mark intro as seen when it ends
    const handleIntroEnd = useCallback(() => {
        sessionStorage.setItem('training-intro-seen', 'true');
        setShowPageIntro(false);
    }, []);

    // Attempt to unmute video after it starts playing
    const handleIntroPlay = useCallback(() => {
        if (introVideoRef.current) {
            introVideoRef.current.muted = false;
        }
    }, []);

    // Initialize DiamondEngine and check VIP status
    useEffect(() => {
        const initializeDiamondEngine = async () => {
            try {
                const authUser = getAuthUser();
                if (authUser) {
                    setUserId(authUser.id); // For realtime features
                    await DiamondEngine.init(authUser.id);
                    const balance = await DiamondEngine.getBalance();
                    const vipStatus = await DiamondEngine.isVIP();
                    setDiamondBalance(balance);
                    setIsVIP(vipStatus);
                } else {
                    // Guest user - use localStorage fallback
                    await DiamondEngine.init(null);
                    const balance = await DiamondEngine.getBalance();
                    setDiamondBalance(balance);
                }
            } catch (e) {
                console.error('[Training] Failed to initialize DiamondEngine:', e);
            }
        };
        initializeDiamondEngine();

        // Fetch past training sessions for SmartPractice weakness analysis
        const fetchSessionHistory = async () => {
            try {
                const authUser = getAuthUser();
                if (!authUser?.session?.access_token) return;
                const { createClient } = await import('@supabase/supabase-js');
                const sb = createClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL,
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
                );
                const { data } = await sb
                    .from('training_sessions')
                    .select('hand_history')
                    .eq('user_id', authUser.id)
                    .order('created_at', { ascending: false })
                    .limit(10);
                if (data) {
                    const combined = data.flatMap(s => s.hand_history || []);
                    setSessionHistory(combined);
                }
            } catch (e) {
                console.warn('[Training] Session history fetch failed:', e.message);
            }
        };
        fetchSessionHistory();
    }, []);

    const {
        isLoaded,
        progress,
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

    // GSAP: Entrance animations for lanes
    useEffect(() => {
        if (isLoaded) {
            // Stagger reveal lanes on mount
            if (gsap) gsap.from('.game-lane', {
                y: 50,
                opacity: 0,
                duration: 0.6,
                stagger: 0.15,
                ease: 'power3.out',
                delay: 0.2,
            }) /* gsap animation */
        }
    }, [isLoaded]);

    // Daily Challenge: Select from harder games (difficulty 3-5), excluding Level 10 final exams
    const getDailyChallenge = () => {
        const today = new Date().toDateString();
        const seed = today.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

        const challenges = [];
        CATEGORIES.forEach((cat, index) => {
            const catGames = getGamesByCategory(cat.id).filter(g =>
                g.difficulty >= 3 && g.difficulty <= 5 && !g.name.startsWith('Level 10:')
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
    const handleGameClick = async (game) => {

        // Check diamond access - VIP plays free, others pay 10 diamonds
        if (!isVIP) {
            const result = await DiamondEngine.deduct(GAME_COST);
            if (!result.success) {
                setShowOutOfDiamondsModal(true);
                return;
            }
            setDiamondBalance(result.balance);
        }

        // Check if game was just mastered (trigger celebration)
        const gameProgress = getGameProgress(game.id);
        const isMastered = gameProgress?.isMastered;
        const alreadyCelebrated = celebratedGames[game.id];

        if (isMastered && !alreadyCelebrated) {
            // Trigger mastery celebration
            confetti({
                particleCount: 150,
                spread: 100,
                origin: { y: 0.6 },
                colors: ['#FFD700', '#FF6B35', '#00D4FF'],
            });
            trainingSounds.play('mastery');
            markGameCelebrated(game.id);
        }

        setPendingGame(game);
        setShowIntro(true);
    };

    // Handle category click - Navigate to category page
    const handleCategoryClick = (categoryId) => {
        router.push(`/hub/training/category/${categoryId}`);
    };

    // After intro video completes, show arena inline (don't navigate away)
    const handleIntroComplete = () => {
        setShowIntro(false);
        if (pendingGame) {
            setActiveGame(pendingGame);
            setShowArena(true);
            setPendingGame(null);
        }
    };

    // Handle exiting the arena - return to training page
    const handleArenaExit = () => {
        setShowArena(false);
        setActiveGame(null);
    };

    // Achievement toast state
    const [unlockedAchievements, setUnlockedAchievements] = useState([]);

    // Handle arena completion - record to gamification APIs
    const handleArenaComplete = async (results) => {
        setShowArena(false);
        setActiveGame(null);

        // Record session to gamification APIs
        const user = getAuthUser();
        if (user?.id && results) {
            try {
                const gamificationResult = await GamificationService.recordSession({
                    userId: user.id,
                    gameId: results.gameId,
                    accuracy: results.accuracy || 0,
                    questionsAnswered: results.questionsAnswered || 0,
                    questionsCorrect: results.questionsCorrect || 0,
                    bestStreak: results.bestStreak || 0,
                    levelPassed: results.levelPassed || false,
                    gtowScore: results.gtowScore || 100,
                    totalEVLoss: results.totalEVLoss || 0,
                    sessionMistakes: results.sessionMistakes || 0,
                });

                // Show achievement toast if any unlocked
                if (gamificationResult.newlyUnlocked?.length > 0) {
                    setUnlockedAchievements(gamificationResult.newlyUnlocked);
                    achievementCelebration();
                    trainingSounds.play('achievement');
                }

                // Show streak toast
                if (gamificationResult.streak?.streakUpdated) {
                    toast.success(`${gamificationResult.streak.currentStreak} day streak!`);
                }
            } catch (e) {
                console.error('[Training] Gamification update failed:', e);
            }
        }
    };

    // Handle featured play
    const handlePlayFeatured = () => {
        const featuredGame = TRAINING_LIBRARY[0];
        handleGameClick(featuredGame);
    };

    // Calculate best streak across all games
    const getBestStreak = () => {
        const allProgress = Object.values(progress || {});
        if (allProgress.length === 0) return 0;
        return Math.max(...allProgress.map(p => p.streakBest || 0));
    };

    const bestStreak = getBestStreak();

    if (!isLoaded) {
        return (
            <div style={styles.loading}>
                <motion.div
                    style={styles.loadingSpinner}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
                <p>Loading Training Library...</p>
            </div>
        );
    }

    return (
        <PageTransition>
            {/* One-time diamond cost popup for non-VIP users */}
            <GameCostPopup
                userId={userId}
                pageKey="training"
                isVip={isVIP}
                cost={10}
            />
            {/*  INTRO VIDEO OVERLAY - Plays while page loads behind it */}
            {showPageIntro && (
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
                        src="/videos/training-intro.mp4"
                        autoPlay
                        muted
                        playsInline
                        onPlay={handleIntroPlay}
                        onEnded={handleIntroEnd}
                        onError={handleIntroEnd}
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain'
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
            <SEOHead
                title="GTO Poker Training — 100 Games To Master"
                description="Interactive GTO Poker Training With 100+ Scenario-based Games. Master MTT, Cash, Spins, Mental Game, And Advanced Theory With AI Coaching From Jarvis."
                canonical="/hub/training"
            />

            {/*  INLINE ARENA - Takes over entire page when active */}
            {showArena && activeGame && (
                <GodModeArena
                    userId={getAuthUser()?.id || `anon-${Date.now()}`}
                    gameId={activeGame.id}
                    gameName={activeGame.name}
                    level={1}
                    sessionId={`session-${Date.now()}`}
                    onComplete={handleArenaComplete}
                    onExit={handleArenaExit}
                />
            )}

            {/* Normal training page content - hidden when arena is active */}
            {!showArena && (
                <>
                    {/* Video Intro Splash - Shows before loading any game */}
                    <GameIntroSplash
                        isVisible={showIntro}
                        game={pendingGame ? { ...pendingGame, image: getGameImage(pendingGame.id) } : null}
                        onComplete={handleIntroComplete}
                    />

                    {/* LAW 1: Leak Fixer Intercept - Shows when leaks are detected */}
                    <LeakFixerIntercept
                        onDismiss={() => console.log('[LAW 1] Intercept dismissed')}
                        onAccept={(clinic) => console.log('[LAW 1] Starting clinic:', clinic.name)}
                    />

                    {/* Out of Diamonds Modal */}
                    <OutOfDiamondsModal
                        isOpen={showOutOfDiamondsModal}
                        onClose={() => setShowOutOfDiamondsModal(false)}
                        gameCost={GAME_COST}
                    />

                    {/* Achievement Toast */}
                    <AchievementToast
                        achievements={unlockedAchievements}
                        onDismiss={() => setUnlockedAchievements([])}
                    />


                    <div className="training-page" style={styles.page}>
                        {/* Fixed Header - Universal Header with Hub navigation + Settings Menu */}
                        <UniversalHeader
                            pageDepth={1}
                            onMenuClick={() => setShowSettingsMenu(true)}
                        />

                        {/* Training Settings Drawer */}
                        {showSettingsMenu && (
                            <TrainingSettingsMenu onClose={() => setShowSettingsMenu(false)} />
                        )}

                        {/* Promo/Ad Section */}
                        <PromoSection onPlayFeatured={handlePlayFeatured} />

                        {/* Streaks Badge */}
                        <StreaksBadge bestStreak={bestStreak} />

                        {/* Phase 23: Smart Practice Card */}
                        <SmartPracticeCard
                            handHistory={sessionHistory}
                            onStartPractice={(config) => {
                                const game = TRAINING_LIBRARY[0];
                                if (game) {
                                    setActiveGame({ ...game, smartConfig: config });
                                    setShowArena(true);
                                }
                            }}
                        />

                        {/* Hand of the Day Challenge */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                            style={{
                                background: 'linear-gradient(135deg, rgba(251,191,36,0.08) 0%, rgba(251,146,60,0.04) 100%)',
                                border: '1px solid rgba(251,191,36,0.2)',
                                borderRadius: 12, padding: '14px 16px', marginBottom: 16,
                                cursor: 'pointer',
                            }}
                            whileHover={{ scale: 1.01, y: -2 }}
                            whileTap={{ scale: 0.99 }}
                            onClick={() => {
                                // Start daily challenge — load first GTO game with daily flag
                                const dailyGame = TRAINING_LIBRARY.find(g => g.id === 'cash-preflop') || TRAINING_LIBRARY[0];
                                if (dailyGame) {
                                    setActiveGame({ ...dailyGame, dailyChallenge: true });
                                    setShowArena(true);
                                }
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#fbbf24', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>
                                        HAND OF THE DAY
                                    </div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 2 }}>
                                        Daily GTO Challenge
                                    </div>
                                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                                        Solve today's hand and earn bonus diamonds
                                    </div>
                                </div>
                                <div style={{
                                    width: 44, height: 44, borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #fbbf24, #f97316)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: '0 0 20px rgba(251,191,36,0.3)',
                                }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                                        <polygon points="5 3 19 12 5 21 5 3" />
                                    </svg>
                                </div>
                            </div>
                        </motion.div>

                        {/* Proactive Jarvis Insights */}
                        {sessionHistory?.length > 0 && (() => {
                            // Analyze recent sessions for insights
                            const insights = [];
                            const recentMistakes = sessionHistory.filter(h => h.classification && h.classification !== 'best' && h.classification !== 'correct');
                            const mistakeRate = sessionHistory.length > 0 ? (recentMistakes.length / sessionHistory.length) * 100 : 0;

                            if (mistakeRate > 50) {
                                insights.push({ text: 'Focus on fundamentals today. Your recent accuracy needs improvement.', color: '#ef4444' });
                            } else if (mistakeRate < 20 && sessionHistory.length >= 10) {
                                insights.push({ text: 'Excellent accuracy! Try increasing difficulty for more challenge.', color: '#22c55e' });
                            }

                            // Check for position weakness
                            const posLosses = {};
                            sessionHistory.forEach(h => {
                                const pos = h.handData?.heroPosition;
                                if (pos && h.evLoss > 0) {
                                    posLosses[pos] = (posLosses[pos] || 0) + h.evLoss;
                                }
                            });
                            const worstPos = Object.entries(posLosses).sort(([, a], [, b]) => b - a)[0];
                            if (worstPos && worstPos[1] > 2) {
                                insights.push({ text: `Work on ${worstPos[0]} play — you leak ${worstPos[1].toFixed(1)} BB from that position.`, color: '#fbbf24' });
                            }

                            if (insights.length === 0) return null;

                            return (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.4 }}
                                    style={{
                                        background: 'rgba(0,212,255,0.04)',
                                        border: '1px solid rgba(0,212,255,0.15)',
                                        borderRadius: 12, padding: '14px 16px', marginBottom: 16,
                                    }}
                                >
                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#00d4ff', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
                                        JARVIS INSIGHTS
                                    </div>
                                    {insights.map((insight, i) => (
                                        <div key={i} style={{
                                            fontSize: 12, color: '#e2e8f0', marginBottom: i < insights.length - 1 ? 6 : 0,
                                            paddingLeft: 12, borderLeft: `2px solid ${insight.color}`,
                                        }}>
                                            {insight.text}
                                        </div>
                                    ))}
                                </motion.div>
                            );
                        })()}

                        {/* Quick Links Icon Strip */}
                        <motion.div
                            style={gamificationNavStyles.container}
                            onClick={() => setShowQuickLinks(true)}
                            whileTap={{ scale: 0.98 }}
                        >
                            <img
                                src="/images/training/gamification-nav-strip.png"
                                alt="Quick Links"
                                style={{ width: '100%', height: 48, objectFit: 'contain', cursor: 'pointer', borderRadius: 8 }}
                            />
                        </motion.div>

                        {/* Quick Links Full-Screen Overlay */}
                        {showQuickLinks && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                style={{
                                    position: 'fixed', inset: 0, zIndex: 9999,
                                    background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(12px)',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                                    justifyContent: 'center', padding: 24,
                                }}
                                onClick={() => setShowQuickLinks(false)}
                            >
                                <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 24, letterSpacing: 1 }}>Quick Links</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, maxWidth: 360 }}>
                                    {[
                                        { label: 'Rankings', path: '/hub/training/leaderboard', icon: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' },
                                        { label: 'Badges', path: '/hub/training/achievements', icon: 'M12 15l-2 5H6l4-3.5L8.5 22 12 19l3.5 3L14 16.5 18 20h-4l-2-5z' },
                                        { label: 'Streaks', path: '/hub/training/streaks', icon: 'M13.5 0.67s0.74 2.65 0.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l0.03-0.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5 0.67z' },
                                        { label: 'Goals', path: '/hub/training/challenges', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z' },
                                        { label: 'Coach', path: '/hub/training/jarvis', icon: 'M21 10.12h-6.78l2.74-2.82-2.2-2.2L9 10.9V19h8.1l2.1-4.23 1.8.9V10.12z' },
                                        { label: 'Play', path: '/hub/training/play-mode', icon: 'M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4-3c-.83 0-1.5-.67-1.5-1.5S18.67 9 19.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z' },
                                        { label: 'Charts', path: '/hub/training/preflop-charts', icon: 'M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1z' },
                                        { label: 'Builder', path: '/hub/training/range-builder', icon: 'M22 9V7h-2V5c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-2h2v-2h-2v-2h2v-2h-2V9h2zm-4 10H4V5h14v14zM6 13h5v4H6v-4zm6-6h4v3h-4V7zM6 7h5v5H6V7zm6 4h4v6h-4v-6z' },
                                        { label: 'Equity', path: '/hub/training/equity-calculator', icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z' },
                                        { label: 'Drills', path: '/hub/training/spot-trainer', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z' },
                                        { label: 'ICM', path: '/hub/training/icm-calculator', icon: 'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z' },
                                        { label: 'Sessions', path: '/hub/training/session-dashboard', icon: 'M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z' },
                                        { label: 'Positions', path: '/hub/training/position-mastery', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z' },
                                        { label: 'Solutions', path: '/hub/training/solutions', icon: 'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5z' },
                                        { label: 'Analyzer', path: '/hub/training/analyzer', icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z' },
                                        { label: 'Reports', path: '/hub/training/reports', icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z' },
                                        { label: 'Aggregate', path: '/hub/training/aggregate', icon: 'M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z' },
                                        { label: 'Hands', path: '/hub/training/hand-history-upload', icon: 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11zM8 15.01l1.41 1.41L11 14.84V19h2v-4.16l1.59 1.59L16 15.01 12.01 11z' },
                                        { label: 'Drills', path: '/hub/training/drill-builder', icon: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.44.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z' },
                                    ].map(item => (
                                        <motion.div
                                            key={item.label}
                                            whileHover={{ scale: 1.08 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={(e) => { e.stopPropagation(); router.push(item.path); }}
                                            style={{
                                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                                                padding: 16, borderRadius: 16,
                                                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                                                cursor: 'pointer', minHeight: 80, justifyContent: 'center',
                                            }}
                                        >
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="#00d4ff">
                                                <path d={item.icon} />
                                            </svg>
                                            <span style={{ fontSize: 11, fontWeight: 600, color: '#fff', letterSpacing: 0.3 }}>{item.label}</span>
                                        </motion.div>
                                    ))}
                                </div>
                                <button
                                    onClick={() => setShowQuickLinks(false)}
                                    style={{ marginTop: 24, padding: '12px 32px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                                >
                                    Close
                                </button>
                            </motion.div>
                        )}

                        {/* Daily Bonus removed per UI overhaul */}

                        {/* Filters */}
                        <FilterBar
                            active={activeFilter}
                            onFilter={setActiveFilter}
                            gameCount={filteredGames.length}
                        />

                        {/* Session Recap & Jarvis — Collapsed Image Tiles */}
                        {userId && activeFilter === 'ALL' && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '0 16px 16px' }}>
                                <motion.div
                                    whileTap={{ scale: 0.97 }}
                                    onClick={() => setShowRecapDrawer(true)}
                                    style={{ cursor: 'pointer', borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(34,197,94,0.2)' }}
                                >
                                    <img src="/images/training/session-recap-tile.png" alt="Last Session Recap" style={{ width: '100%', height: 80, objectFit: 'cover' }} />
                                </motion.div>
                                <motion.div
                                    whileTap={{ scale: 0.97 }}
                                    onClick={() => setShowJarvisDrawer(true)}
                                    style={{ cursor: 'pointer', borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(0,212,255,0.2)' }}
                                >
                                    <img src="/images/training/jarvis-recommends-tile.png" alt="Jarvis Recommends" style={{ width: '100%', height: 80, objectFit: 'cover' }} />
                                </motion.div>
                            </div>
                        )}

                        {/* Session Recap Drawer */}
                        {showRecapDrawer && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
                                onClick={() => setShowRecapDrawer(false)}
                            >
                                <motion.div
                                    initial={{ scale: 0.9, y: 30 }}
                                    animate={{ scale: 1, y: 0 }}
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ background: 'linear-gradient(180deg, #1a1a2e, #0f0f1a)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 20, padding: 24, width: '90%', maxWidth: 400 }}
                                >
                                    <div style={{ fontSize: 18, fontWeight: 800, color: '#4ade80', marginBottom: 16 }}>Last Session Recap</div>
                                    <div style={{ fontSize: 13, color: '#94a3b8', fontStyle: 'italic', marginBottom: 16 }}>
                                        "Strong performance in MTTs, but work on Big-Blind defense."
                                    </div>
                                    <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                                        <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 10, textAlign: 'center' }}>
                                            <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Mistakes</div>
                                            <div style={{ fontSize: 22, fontWeight: 800, color: '#fbbf24' }}>3</div>
                                        </div>
                                        <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 10, textAlign: 'center' }}>
                                            <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>EV Loss</div>
                                            <div style={{ fontSize: 22, fontWeight: 800, color: '#ef4444' }}>-1.2</div>
                                        </div>
                                    </div>
                                    <button onClick={() => setShowRecapDrawer(false)} style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Close</button>
                                </motion.div>
                            </motion.div>
                        )}

                        {/* Jarvis Recommends Drawer */}
                        {showJarvisDrawer && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
                                onClick={() => setShowJarvisDrawer(false)}
                            >
                                <motion.div
                                    initial={{ scale: 0.9, y: 30 }}
                                    animate={{ scale: 1, y: 0 }}
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ background: 'linear-gradient(180deg, #1a1a2e, #0f0f1a)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 20, padding: 24, width: '90%', maxWidth: 400 }}
                                >
                                    <JarvisRecommendations userId={userId} onGameClick={(game) => { setShowJarvisDrawer(false); handleGameClick(game); }} />
                                    <button onClick={() => setShowJarvisDrawer(false)} style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 12 }}>Close</button>
                                </motion.div>
                            </motion.div>
                        )}

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
                            <span>85% To Master</span>
                        </div>
                    </div>
                </>
            )
            }
        </PageTransition >
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
        textShadow: '0 2px 6px rgba(0,0,0,0.5)',
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
        boxShadow: '0 0.5vw 2vw rgba(0,0,0,0.4)',
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

// Gamification Quick-Access Nav Styles
const gamificationNavStyles = {
    container: {
        display: 'flex',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: 12,
        padding: '12px 16px',
        background: 'linear-gradient(135deg, rgba(138, 43, 226, 0.08), rgba(0, 212, 255, 0.06))',
        borderBottom: '1px solid rgba(138, 43, 226, 0.2)',
    },
    navButton: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 16px',
        background: 'rgba(255, 255, 255, 0.06)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: 20,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },
    icon: {
        fontSize: 16,
    },
    label: {
        fontSize: 12,
        fontWeight: 600,
        color: '#fff',
        letterSpacing: 0.3,
    },
};
// Deploy trigger Thu Jan 29 00:08:41 CST 2026

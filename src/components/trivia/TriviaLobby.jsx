/**
 * TRIVIA LOBBY - Main trivia hub with Futuristic Metal UI
 * Skeuomorphic Sci-Fi design with metal frames, neon accents, and industrial aesthetic
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Zap, Trophy, BookOpen, GraduationCap, Gem, Lock, ChevronRight, Flame, Heart, Skull, Infinity, Shuffle, Swords, Calendar, Target, Banknote, Calculator, Brain, AlertTriangle } from 'lucide-react';
import MetalFrame from '../ui/MetalFrame';
import HexButton from '../ui/HexButton';
import PortholeIcon from '../ui/PortholeIcon';
import StreakBadge from './StreakBadge';
import { supabase } from '../../lib/supabase';
import { getAuthUser } from '../../lib/authUtils';

// Pre-computed particle positions to avoid Math.random() hydration mismatches
const SUITS = ['♠', '♥', '♦', '♣', '♠', '♥', '♦', '♣', '♠', '♥', '♦', '♣', '♠', '♥', '♦', '♣'];
const SUIT_PARTICLES = SUITS.map((suit, i) => ({
    suit,
    left: (i / 16) * 100 + (((i * 7 + 3) % 10) * 0.6),
    delay: i * 1.2 + (((i * 13 + 5) % 10) * 0.2),
    duration: 8 + (((i * 11 + 7) % 10) * 0.6),
    fontSize: 14 + (((i * 17 + 2) % 10) * 1.2),
}));

const GAME_COST = 10; // diamonds per game for non-VIP
const ACKNOWLEDGED_KEY = 'trivia_charge_acknowledged';

const MODE_CARDS = [
    // TOP ROW - Strategy Modes (MTT, Cash, GTO)
    {
        id: 'mtt',
        name: 'MTT Scenarios',
        description: 'Multi-table Tournament Situations and Decisions',
        icon: Target,
        color: '#f97316',
        glowColor: '#f97316',
        diamondReward: 5,
        perfectBonus: 10,
        image: '/images/trivia/mtt-scenarios.png?v=rembg1'
    },
    {
        id: 'cash',
        name: 'Cash Game',
        description: 'Deep Stack Scenarios, Implied Odds, Table Dynamics',
        icon: Banknote,
        color: '#22c55e',
        glowColor: '#22c55e',
        diamondReward: 5,
        perfectBonus: 10,
        image: '/images/trivia/cash-game.png?v=rembg1'
    },
    {
        id: 'icm',
        name: 'ICM & Chip EV',
        description: 'Tournament Equity, Chip Value vs $EV Decisions',
        icon: Calculator,
        color: '#06b6d4',
        glowColor: '#06b6d4',
        diamondReward: 5,
        perfectBonus: 10,
        image: '/images/trivia/icm-chip-ev.png?v=rembg1'
    },
    // ROW 2 - Core Trivia
    {
        id: 'history',
        name: 'Poker History',
        description: 'Iconic Moments, Famous Hands, Legendary Players',
        icon: Trophy,
        color: '#FFD700',
        glowColor: '#FFD700',
        diamondReward: 3,
        perfectBonus: 5,
        image: '/images/trivia/poker-history.png?v=rembg1'
    },
    {
        id: 'tournaments',
        name: 'Tournaments',
        description: 'Weekly Competitions with Big Prizes!',
        icon: Calendar,
        color: '#FFD700',
        glowColor: '#FFD700',
        diamondReward: 'Prize pool',
        perfectBonus: null,
        image: '/images/trivia/tournaments.png?v=rembg1'
    },
    {
        id: 'pro',
        name: 'Pro Knowledge',
        description: 'Strategy Concepts, GTO Basics, Advanced Trivia',
        icon: GraduationCap,
        color: '#9D4EDD',
        glowColor: '#9D4EDD',
        diamondReward: 5,
        perfectBonus: 10,
        image: '/images/trivia/pro-knowledge.png?v=rembg1'
    },
    // ROW 3 - Challenge Modes
    {
        id: 'survival',
        name: 'Survival Mode',
        description: '10 Levels, 20 Questions Each. All Categories Combined!',
        icon: Heart,
        color: '#ef4444',
        glowColor: '#ef4444',
        diamondReward: '10+',
        perfectBonus: null,
        image: '/images/trivia/survival-mode.png?v=rembg1'
    },
    {
        id: 'endless',
        name: 'Endless Mode',
        description: 'All Questions, Random Order. Answer Until You Miss!',
        icon: Infinity,
        color: '#8b5cf6',
        glowColor: '#8b5cf6',
        diamondReward: '1+/Q',
        perfectBonus: null,
        image: '/images/trivia/endless-mode.png?v=rembg1'
    },
    {
        id: 'mixed',
        name: 'Mixed Mode',
        description: 'Rotating Categories: History → Rules → Pro',
        icon: Shuffle,
        color: '#00D4FF',
        glowColor: '#00D4FF',
        diamondReward: '1/Q',
        perfectBonus: null,
        image: '/images/trivia/mixed-mode.png?v=rembg1'
    },
    // ROW 4 - Competitive
    {
        id: 'pvp',
        name: '1v1 Battle',
        description: 'Challenge Real Players for Diamonds!',
        icon: Swords,
        color: '#ef4444',
        glowColor: '#ef4444',
        diamondReward: '2x stake',
        perfectBonus: null,
        image: '/images/trivia/pvp-battle.png?v=rembg1'
    },
    {
        id: 'rules',
        name: 'Rules Quiz',
        description: 'Test Your Understanding of Official Poker Rules',
        icon: BookOpen,
        color: '#4a90d9',
        glowColor: '#4a90d9',
        diamondReward: 3,
        perfectBonus: 5,
        image: '/images/trivia/rules-quiz.png?v=rembg1'
    },
    {
        id: 'gto',
        name: 'GTO Master',
        description: 'Solver-based Scenarios Combining MTT, Cash, and ICM',
        icon: Brain,
        color: '#a855f7',
        glowColor: '#a855f7',
        diamondReward: 8,
        perfectBonus: 15,
        image: '/images/trivia/gto-master.png?v=rembg1'
    }
];


export default function TriviaLobby({ userDiamonds = 0, isVip = false, dailyCompleted = false, currentStreak = 0, onDiamondsChange }) {
    const router = useRouter();
    const [hoveredCard, setHoveredCard] = useState(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // VIP Gating state
    const [showChargePopup, setShowChargePopup] = useState(false);
    const [showTopUpPopup, setShowTopUpPopup] = useState(false);
    const [pendingMode, setPendingMode] = useState(null);
    const [isDeducting, setIsDeducting] = useState(false);

    // Route to the correct page for a mode
    const routeToMode = (modeId) => {
        const standaloneRoutes = {
            survival: '/hub/trivia/survival-game',
            endless: '/hub/trivia/endless',
            mixed: '/hub/trivia/mixed',
            pvp: '/hub/trivia/pvp',
            tournaments: '/hub/trivia/tournaments',
        };
        router.push(standaloneRoutes[modeId] || `/hub/trivia/${modeId}`);
    };

    // Deduct diamonds via Supabase
    const deductDiamonds = async () => {
        const user = getAuthUser();
        if (!user) return false;
        try {
            const { data: profile } = await supabase
                .from('profiles')
                .select('diamonds')
                .eq('id', user.id)
                .single();
            if (!profile || (profile.diamonds || 0) < GAME_COST) return false;
            await supabase
                .from('profiles')
                .update({ diamonds: profile.diamonds - GAME_COST })
                .eq('id', user.id);
            onDiamondsChange?.(-GAME_COST);
            return true;
        } catch (err) {
            console.error('Diamond deduction failed:', err);
            return false;
        }
    };

    // Handle charge popup acceptance
    const handleChargeAccept = async () => {
        setIsDeducting(true);
        const success = await deductDiamonds();
        setIsDeducting(false);
        if (success) {
            // Mark as acknowledged — popup never shows again
            try { localStorage.setItem(ACKNOWLEDGED_KEY, 'true'); } catch (e) { }
            setShowChargePopup(false);
            routeToMode(pendingMode);
            setPendingMode(null);
        } else {
            // Deduction failed (insufficient) — show top-up
            setShowChargePopup(false);
            setShowTopUpPopup(true);
        }
    };

    const startMode = async (modeId) => {
        // Block daily if already completed
        if (modeId === 'daily' && dailyCompleted) return;

        // === VIP members: free access to everything ===
        if (isVip) {
            routeToMode(modeId);
            return;
        }

        // === Non-VIP: Daily trivia is free (once/day) ===
        if (modeId === 'daily') {
            routeToMode(modeId);
            return;
        }

        // === Non-VIP: All other modes cost 10 diamonds ===
        // Check if user has previously acknowledged the charge popup
        let acknowledged = false;
        try { acknowledged = localStorage.getItem(ACKNOWLEDGED_KEY) === 'true'; } catch (e) { }

        if (!acknowledged) {
            // FIRST TIME: Show confirmation popup
            if (userDiamonds < GAME_COST) {
                setShowTopUpPopup(true);
                return;
            }
            setPendingMode(modeId);
            setShowChargePopup(true);
            return;
        }

        // RETURNING USER: Auto-deduct silently
        if (userDiamonds < GAME_COST) {
            setShowTopUpPopup(true);
            return;
        }

        setIsDeducting(true);
        const success = await deductDiamonds();
        setIsDeducting(false);
        if (success) {
            routeToMode(modeId);
        } else {
            setShowTopUpPopup(true);
        }
    };

    return (
        <div className="trivia-lobby">

            {/* ════ Floating Card Suit Particles ════ */}
            {mounted && (
                <div className="suit-particles" aria-hidden>
                    {SUIT_PARTICLES.map((p, i) => (
                        <span key={i} className={`suit ${p.suit === '♥' || p.suit === '♦' ? 'red' : ''}`} style={{
                            left: `${p.left}%`,
                            animationDelay: `${p.delay}s`,
                            animationDuration: `${p.duration}s`,
                            fontSize: `${p.fontSize}px`,
                        }}>{p.suit}</span>
                    ))}
                </div>
            )}

            {/* Daily Trivia Hero Card - Image Based */}
            <div
                className="daily-trivia-banner"
                onClick={() => !dailyCompleted && startMode('daily')}
                style={{ cursor: dailyCompleted ? 'default' : 'pointer' }}
            >
                <img
                    src="/images/trivia/daily-trivia-header-final.png"
                    alt="Daily Trivia - 10 Questions Fresh Every Day"
                    className="daily-trivia-banner__image"
                />
                {/* Clickable button overlay positioned over the START DAILY TRIVIA button */}
                <button
                    className="daily-trivia-banner__button"
                    onClick={(e) => {
                        e.stopPropagation();
                        if (!dailyCompleted) startMode('daily');
                    }}
                    disabled={dailyCompleted}
                    aria-label={dailyCompleted ? 'Daily Trivia Completed' : 'Start Daily Trivia'}
                />
                {dailyCompleted && (
                    <div className="daily-trivia-banner__completed">
                        <span>✓ COMPLETED</span>
                    </div>
                )}
            </div>


            {/* Mode Cards Section */}
            <div className="modes-section">

                <div className="modes-grid">
                    {MODE_CARDS.map((mode) => {
                        const Icon = mode.icon;
                        const isHovered = hoveredCard === mode.id;

                        // Use image-based card if mode has an image
                        if (mode.image) {
                            return (
                                <div
                                    key={mode.id}
                                    className="mode-image-card"
                                    onMouseEnter={() => setHoveredCard(mode.id)}
                                    onMouseLeave={() => setHoveredCard(null)}
                                    onClick={() => startMode(mode.id)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <img
                                        src={mode.image}
                                        alt={mode.name}
                                        className="mode-image-card__img"
                                    />
                                </div>
                            );
                        }

                        // Fallback to MetalFrame for modes without images
                        return (
                            <MetalFrame
                                key={mode.id}
                                padding="24px 20px"
                                showBolts={true}
                                showNeonStrips={false}
                                variant={isHovered ? 'elevated' : 'flat'}
                                className="mode-card"
                                style={{
                                    '--mode-color': mode.color,
                                    cursor: 'pointer'
                                }}
                            >
                                <div
                                    className="mode-card__inner"
                                    onMouseEnter={() => setHoveredCard(mode.id)}
                                    onMouseLeave={() => setHoveredCard(null)}
                                    onClick={() => startMode(mode.id)}
                                >
                                    {/* Left neon strip accent */}
                                    <div
                                        className="mode-accent-strip"
                                        style={{ background: mode.color, boxShadow: `0 0 10px ${mode.color}, 0 0 20px ${mode.color}80` }}
                                    />

                                    <PortholeIcon
                                        icon={Icon}
                                        size={60}
                                        glowColor={mode.glowColor}
                                        animated={isHovered}
                                    />

                                    <h3 className="mode-name" style={{ color: mode.color }}>
                                        {mode.name}
                                    </h3>
                                    <p className="mode-description">{mode.description}</p>


                                    <HexButton
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            startMode(mode.id);
                                        }}
                                        variant="primary"
                                        size="sm"
                                        fullWidth
                                    >
                                        START
                                    </HexButton>
                                </div>
                            </MetalFrame>
                        );
                    })}
                </div>


                {/* Daily Refresh Notice removed */}
            </div>

            {/* Quick Stakes Section - Landscape Banner */}
            <div className="quick-stakes-section">
                <div
                    className="quick-stakes-banner"
                    onClick={() => startMode('arcade')}
                    style={{ cursor: 'pointer' }}
                >
                    <img
                        src="/images/trivia/quick-stakes.png?v=rembg2"
                        alt="Quick Stakes - 10 Questions In 60 Seconds"
                        className="quick-stakes-banner__img"
                    />
                </div>
            </div>

            <style jsx>{`
                .trivia-lobby {
                    padding: 0 20px 20px;
                    max-width: 1000px;
                    margin: 0 auto;
                    font-family: 'Rajdhani', 'Orbitron', sans-serif;
                    position: relative;
                    overflow: hidden;
                }

                /* ═══ Floating Card Suit Particles ═══ */
                .suit-particles {
                    position: absolute;
                    inset: 0;
                    pointer-events: none;
                    z-index: 0;
                    overflow: hidden;
                }
                .suit {
                    position: absolute;
                    bottom: -30px;
                    color: rgba(255, 255, 255, 0.04);
                    animation: suitFloat linear infinite;
                    opacity: 0;
                }
                .suit.red {
                    color: rgba(239, 68, 68, 0.04);
                }
                @keyframes suitFloat {
                    0% { transform: translateY(0) rotate(0deg); opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 0.5; }
                    100% { transform: translateY(-800px) rotate(360deg); opacity: 0; }
                }


                /* Daily Trivia Banner - Image Based */
                .daily-trivia-banner {
                    position: relative;
                    width: 100%;
                    margin-bottom: 8px;
                    border-radius: 0;
                    overflow: visible;
                    transition: transform 0.2s ease, box-shadow 0.2s ease;
                }

                .daily-trivia-banner:hover {
                    transform: scale(1.01);
                    box-shadow: 0 0 30px rgba(0, 212, 255, 0.3);
                }

                .daily-trivia-banner__image {
                    width: 100%;
                    height: auto;
                    display: block;
                }

                .daily-trivia-banner__button {
                    position: absolute;
                    top: 25%;
                    right: 3%;
                    width: 28%;
                    height: 50%;
                    background: transparent;
                    border: none;
                    cursor: pointer;
                    z-index: 2;
                    transition: background 0.2s ease;
                }

                .daily-trivia-banner__button:hover:not(:disabled) {
                    background: rgba(0, 212, 255, 0.1);
                    border-radius: 8px;
                }

                .daily-trivia-banner__button:disabled {
                    cursor: default;
                }

                .daily-trivia-banner__completed {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.6);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 3;
                }

                .daily-trivia-banner__completed span {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 28px;
                    font-weight: 700;
                    color: #22c55e;
                    text-shadow: 0 0 20px rgba(34, 197, 94, 0.8);
                    letter-spacing: 0.1em;
                }



                /* Modes Section */
                .modes-section {
                    margin-top: 8px;
                }



                .modes-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 12px;
                }

                @media (max-width: 680px) {
                    .trivia-lobby {
                        padding: 0 8px 16px !important;
                    }
                    .daily-trivia-banner {
                        margin-bottom: 6px;
                    }
                    .daily-trivia-banner__completed span {
                        font-size: 20px;
                    }
                    .modes-section {
                        margin-top: 4px;
                    }
                    .modes-grid {
                        grid-template-columns: repeat(2, 1fr) !important;
                        gap: 8px !important;
                    }
                    .mode-image-card__img {
                        aspect-ratio: 1 !important;
                        border-radius: 6px !important;
                    }
                    .mode-image-card {
                        border-radius: 8px !important;
                    }
                    .quick-stakes-section {
                        margin-top: 12px !important;
                    }
                    .quick-stakes-banner__img {
                        border-radius: 6px !important;
                    }
                }

                /* Mode Card */
                .mode-card__inner {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    text-align: center;
                    min-height: 220px;
                    position: relative;
                }

                .mode-accent-strip {
                    position: absolute;
                    left: -20px;
                    top: 10%;
                    bottom: 10%;
                    width: 4px;
                    border-radius: 2px;
                }

                .mode-name {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 16px;
                    font-weight: 700;
                    margin: 12px 0 8px 0;
                    text-shadow: 0 0 10px currentColor;
                }

                .mode-description {
                    font-size: 13px;
                    color: rgba(255, 255, 255, 0.5);
                    margin: 0 0 auto 0;
                    line-height: 1.4;
                }



                .mode-card--locked {
                    filter: grayscale(50%);
                }

                /* Image-based Mode Cards */
                .mode-image-card {
                    position: relative;
                    border-radius: 12px;
                    overflow: hidden;
                    cursor: pointer;
                    animation: cardEntrance 0.5s ease backwards;
                    transition: transform 0.25s ease, box-shadow 0.25s ease;
                }
                .mode-image-card:hover {
                    transform: translateY(-4px) scale(1.02);
                    box-shadow: 0 8px 30px rgba(0, 212, 255, 0.2);
                }
                .mode-image-card:nth-child(1) { animation-delay: 0s; }
                .mode-image-card:nth-child(2) { animation-delay: 0.06s; }
                .mode-image-card:nth-child(3) { animation-delay: 0.12s; }
                .mode-image-card:nth-child(4) { animation-delay: 0.18s; }
                .mode-image-card:nth-child(5) { animation-delay: 0.24s; }
                .mode-image-card:nth-child(6) { animation-delay: 0.3s; }
                .mode-image-card:nth-child(7) { animation-delay: 0.36s; }
                .mode-image-card:nth-child(8) { animation-delay: 0.42s; }
                .mode-image-card:nth-child(9) { animation-delay: 0.48s; }
                .mode-image-card:nth-child(10) { animation-delay: 0.54s; }
                .mode-image-card:nth-child(11) { animation-delay: 0.6s; }
                .mode-image-card:nth-child(12) { animation-delay: 0.66s; }

                @keyframes cardEntrance {
                    from {
                        opacity: 0;
                        transform: translateY(20px) scale(0.95);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }

                .mode-image-card__img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    aspect-ratio: 1;
                    display: block;
                    border-radius: 8px;
                    pointer-events: none;
                }

                /* Quick Stakes Banner - landscape format, matching Daily Trivia size */
                .quick-stakes-banner {
                    position: relative;
                    border-radius: 0;
                    overflow: hidden;
                    cursor: pointer;
                    transition: transform 0.2s ease, box-shadow 0.2s ease;
                    aspect-ratio: 918 / 333;
                }

                .quick-stakes-banner:hover {
                    transform: scale(1.02);
                    box-shadow: 0 0 30px rgba(0, 212, 255, 0.3);
                }

                .quick-stakes-banner__img {
                    width: 100%;
                    height: 100%;
                    display: block;
                    pointer-events: none;
                    object-fit: cover;
                    object-position: center;
                }

                .mode-image-card__lock {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: rgba(0, 0, 0, 0.7);
                    border-radius: 50%;
                    padding: 16px;
                    color: rgba(255, 255, 255, 0.8);
                }

                .mode-image-card--locked {
                    filter: grayscale(50%);
                    cursor: not-allowed;
                }

                /* Daily Refresh Notice */
                .daily-refresh-notice {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    margin-top: 20px;
                    padding: 12px 16px;
                    background: rgba(255, 135, 0, 0.1);
                    border: 1px solid rgba(255, 135, 0, 0.3);
                    border-radius: 8px;
                    color: #FF8700;
                    font-size: 13px;
                    font-weight: 500;
                }

                /* Quick Stakes Section */
                .quick-stakes-section {
                    margin-top: 8px;
                }

                .qs-header {
                    display: flex;
                    align-items: baseline;
                }

                @media (max-width: 600px) {
                    .daily-hero__layout {
                        flex-direction: column;
                    }
                }

                /* ═══════ VIP GATING POPUPS ═══════ */
                .gate-overlay {
                    position: fixed;
                    inset: 0;
                    z-index: 9999;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(0, 0, 0, 0.75);
                    backdrop-filter: blur(6px);
                    animation: gateFadeIn 0.2s ease;
                }
                @keyframes gateFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .gate-card {
                    background: linear-gradient(145deg, #1a1f2e, #0d1117);
                    border: 1px solid rgba(0, 212, 255, 0.3);
                    border-radius: 16px;
                    padding: 32px 28px;
                    max-width: 360px;
                    width: 90%;
                    text-align: center;
                    box-shadow: 0 0 40px rgba(0, 212, 255, 0.15), inset 0 1px 0 rgba(255,255,255,0.05);
                }
                .gate-icon {
                    font-size: 48px;
                    margin-bottom: 12px;
                }
                .gate-title {
                    font-size: 20px;
                    font-weight: 700;
                    color: #fff;
                    margin-bottom: 8px;
                }
                .gate-desc {
                    font-size: 14px;
                    color: rgba(255,255,255,0.65);
                    line-height: 1.5;
                    margin-bottom: 24px;
                }
                .gate-cost {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    background: rgba(0, 212, 255, 0.1);
                    border: 1px solid rgba(0, 212, 255, 0.25);
                    border-radius: 12px;
                    padding: 10px 20px;
                    margin-bottom: 24px;
                    font-size: 22px;
                    font-weight: 700;
                    color: #00d4ff;
                }
                .gate-cost svg {
                    width: 22px;
                    height: 22px;
                }
                .gate-buttons {
                    display: flex;
                    gap: 12px;
                    justify-content: center;
                }
                .gate-btn {
                    flex: 1;
                    padding: 12px 20px;
                    border-radius: 10px;
                    border: none;
                    font-size: 15px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    font-family: inherit;
                }
                .gate-btn--accept {
                    background: linear-gradient(135deg, #00d4ff, #0099cc);
                    color: #000;
                }
                .gate-btn--accept:hover {
                    transform: scale(1.03);
                    box-shadow: 0 0 20px rgba(0, 212, 255, 0.4);
                }
                .gate-btn--accept:disabled {
                    opacity: 0.6;
                    cursor: wait;
                }
                .gate-btn--cancel {
                    background: rgba(255, 255, 255, 0.08);
                    color: rgba(255, 255, 255, 0.7);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                }
                .gate-btn--cancel:hover {
                    background: rgba(255, 255, 255, 0.12);
                }
                .gate-btn--store {
                    background: linear-gradient(135deg, #f97316, #ea580c);
                    color: #fff;
                    flex: unset;
                    padding: 12px 28px;
                }
                .gate-btn--store:hover {
                    transform: scale(1.03);
                    box-shadow: 0 0 20px rgba(249, 115, 22, 0.4);
                }
                .gate-balance {
                    margin-top: 12px;
                    font-size: 13px;
                    color: rgba(255,255,255,0.4);
                }

                /* Deducting overlay */
                .deducting-overlay {
                    position: fixed;
                    inset: 0;
                    z-index: 9998;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(0,0,0,0.5);
                    backdrop-filter: blur(3px);
                }
                .deducting-spinner {
                    width: 36px;
                    height: 36px;
                    border: 3px solid rgba(0,212,255,0.2);
                    border-top-color: #00d4ff;
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>

            {/* ═══════ DIAMOND CHARGE POPUP (first-time only) ═══════ */}
            {
                showChargePopup && (
                    <div className="gate-overlay" onClick={() => { setShowChargePopup(false); setPendingMode(null); }}>
                        <div className="gate-card" onClick={e => e.stopPropagation()}>
                            <div className="gate-icon">💎</div>
                            <div className="gate-title">Diamond Entry Fee</div>
                            <div className="gate-desc">
                                This game mode costs diamonds to play. Your diamonds will be automatically deducted for future games.
                            </div>
                            <div className="gate-cost">
                                <Gem size={22} /> {GAME_COST} Diamonds
                            </div>
                            <div className="gate-buttons">
                                <button
                                    className="gate-btn gate-btn--cancel"
                                    onClick={() => { setShowChargePopup(false); setPendingMode(null); }}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="gate-btn gate-btn--accept"
                                    onClick={handleChargeAccept}
                                    disabled={isDeducting}
                                >
                                    {isDeducting ? 'Processing...' : 'Accept & Play'}
                                </button>
                            </div>
                            <div className="gate-balance">
                                Your balance: {userDiamonds} 💎
                            </div>
                        </div>
                    </div>
                )
            }

            {/* ═══════ TOP-UP POPUP (insufficient diamonds) ═══════ */}
            {
                showTopUpPopup && (
                    <div className="gate-overlay" onClick={() => setShowTopUpPopup(false)}>
                        <div className="gate-card" onClick={e => e.stopPropagation()}>
                            <div className="gate-icon">⚠️</div>
                            <div className="gate-title">Not Enough Diamonds</div>
                            <div className="gate-desc">
                                You need at least <strong>{GAME_COST} 💎</strong> to play this mode.
                                Visit the Diamond Store to top up your balance.
                            </div>
                            <div className="gate-cost" style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.1)' }}>
                                <Gem size={22} /> Balance: {userDiamonds} 💎
                            </div>
                            <div className="gate-buttons">
                                <button
                                    className="gate-btn gate-btn--cancel"
                                    onClick={() => setShowTopUpPopup(false)}
                                >
                                    Close
                                </button>
                                <button
                                    className="gate-btn gate-btn--store"
                                    onClick={() => router.push('/hub/diamond-store')}
                                >
                                    💎 Get Diamonds
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Deducting spinner overlay */}
            {
                isDeducting && !showChargePopup && (
                    <div className="deducting-overlay">
                        <div className="deducting-spinner" />
                    </div>
                )
            }
        </div >
    );
}

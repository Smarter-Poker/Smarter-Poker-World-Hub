/**
 * TRIVIA LOBBY - Main trivia hub with Futuristic Metal UI
 * Skeuomorphic Sci-Fi design with metal frames, neon accents, and industrial aesthetic
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Zap, Trophy, BookOpen, GraduationCap, Gem, Lock, ChevronRight, Flame, Heart, Skull, Infinity, Shuffle, Swords, Calendar, Target, Banknote, Calculator, Brain } from 'lucide-react';
import MetalFrame from '../ui/MetalFrame';
import HexButton from '../ui/HexButton';
import PortholeIcon from '../ui/PortholeIcon';
import StreakBadge from './StreakBadge';

const MODE_CARDS = [
    // TOP ROW - Strategy Modes (MTT, Cash, GTO)
    {
        id: 'mtt',
        name: 'MTT Scenarios',
        description: 'Multi-table tournament situations and decisions',
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
        description: 'Deep stack scenarios, implied odds, table dynamics',
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
        description: 'Tournament equity, chip value vs $EV decisions',
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
        description: 'Iconic moments, famous hands, legendary players',
        icon: Trophy,
        color: '#FFD700',
        glowColor: '#FFD700',
        diamondReward: 3,
        perfectBonus: 5,
        image: '/images/trivia/poker-history.png?v=rembg1'
    },
    {
        id: 'rules',
        name: 'Rules Quiz',
        description: 'Test your understanding of official poker rules',
        icon: BookOpen,
        color: '#4a90d9',
        glowColor: '#4a90d9',
        diamondReward: 3,
        perfectBonus: 5,
        image: '/images/trivia/rules-quiz.png?v=rembg1'
    },
    {
        id: 'pro',
        name: 'Pro Knowledge',
        description: 'Strategy concepts, GTO basics, advanced trivia',
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
        description: '10 levels, 20 questions each. All categories combined!',
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
        description: 'All questions, random order. Answer until you miss!',
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
        description: 'Rotating categories: History → Rules → Pro',
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
        description: 'Challenge real players for diamonds!',
        icon: Swords,
        color: '#ef4444',
        glowColor: '#ef4444',
        diamondReward: '2x stake',
        perfectBonus: null,
        image: '/images/trivia/pvp-battle.png?v=rembg1'
    },
    {
        id: 'tournaments',
        name: 'Tournaments',
        description: 'Weekly competitions with big prizes!',
        icon: Calendar,
        color: '#FFD700',
        glowColor: '#FFD700',
        diamondReward: 'Prize pool',
        perfectBonus: null,
        image: '/images/trivia/tournaments.png?v=rembg1'
    },
    {
        id: 'gto',
        name: 'GTO Master',
        description: 'Solver-based scenarios combining MTT, Cash, and ICM',
        icon: Brain,
        color: '#a855f7',
        glowColor: '#a855f7',
        diamondReward: 8,
        perfectBonus: 15,
        image: '/images/trivia/gto-master.png?v=rembg1'
    }
];


export default function TriviaLobby({ userDiamonds = 0, dailyCompleted = false, currentStreak = 0 }) {
    const router = useRouter();
    const [hoveredCard, setHoveredCard] = useState(null);

    const startMode = (modeId) => {
        if (modeId === 'arcade' && userDiamonds < 10) {
            return;
        }
        if (modeId === 'daily' && dailyCompleted) {
            return;
        }
        // Standalone pages for specialized modes
        if (modeId === 'survival') {
            router.push('/hub/trivia/survival-game');
            return;
        }
        if (modeId === 'endless') {
            router.push('/hub/trivia/endless');
            return;
        }
        if (modeId === 'mixed') {
            router.push('/hub/trivia/mixed');
            return;
        }
        if (modeId === 'pvp') {
            router.push('/hub/trivia/pvp');
            return;
        }
        if (modeId === 'tournaments') {
            router.push('/hub/trivia/tournaments');
            return;
        }
        // New strategy modes
        if (['mtt', 'cash', 'icm', 'gto'].includes(modeId)) {
            router.push(`/hub/trivia/${modeId}`);
            return;
        }
        router.push(`/hub/trivia/${modeId}`);
    };

    return (
        <div className="trivia-lobby">

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
                        const isLocked = mode.id === 'arcade' && userDiamonds < 10;
                        const isHovered = hoveredCard === mode.id;

                        // Use image-based card if mode has an image
                        if (mode.image) {
                            return (
                                <div
                                    key={mode.id}
                                    className={`mode-image-card ${isLocked ? 'mode-image-card--locked' : ''}`}
                                    onMouseEnter={() => setHoveredCard(mode.id)}
                                    onMouseLeave={() => setHoveredCard(null)}
                                    onClick={() => !isLocked && startMode(mode.id)}
                                    style={{
                                        opacity: isLocked ? 0.6 : 1,
                                        cursor: isLocked ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    <img
                                        src={mode.image}
                                        alt={mode.name}
                                        className="mode-image-card__img"
                                    />
                                    {isLocked && (
                                        <div className="mode-image-card__lock">
                                            <Lock size={32} />
                                        </div>
                                    )}
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
                                className={`mode-card ${isLocked ? 'mode-card--locked' : ''}`}
                                style={{
                                    '--mode-color': mode.color,
                                    opacity: isLocked ? 0.6 : 1,
                                    cursor: isLocked ? 'not-allowed' : 'pointer'
                                }}
                            >
                                <div
                                    className="mode-card__inner"
                                    onMouseEnter={() => setHoveredCard(mode.id)}
                                    onMouseLeave={() => setHoveredCard(null)}
                                    onClick={() => !isLocked && startMode(mode.id)}
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
                                        animated={isHovered && !isLocked}
                                    />

                                    <h3 className="mode-name" style={{ color: mode.color }}>
                                        {mode.name}
                                    </h3>
                                    <p className="mode-description">{mode.description}</p>


                                    <HexButton
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (!isLocked) startMode(mode.id);
                                        }}
                                        disabled={isLocked}
                                        variant={isLocked ? 'secondary' : 'primary'}
                                        size="sm"
                                        fullWidth
                                        icon={isLocked ? <Lock size={14} /> : mode.id === 'arcade' ? <ChevronRight size={14} /> : null}
                                    >
                                        {isLocked ? 'LOCKED' : mode.id === 'arcade' ? 'PLAY' : 'START'}
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
                    onClick={() => userDiamonds >= 10 && startMode('arcade')}
                    style={{
                        opacity: userDiamonds >= 10 ? 1 : 0.6,
                        cursor: userDiamonds >= 10 ? 'pointer' : 'not-allowed'
                    }}
                >
                    <img
                        src="/images/trivia/quick-stakes.png?v=rembg2"
                        alt="Quick Stakes - 10 Questions in 60 Seconds"
                        className="quick-stakes-banner__img"
                    />
                    {userDiamonds < 10 && (
                        <div className="mode-image-card__lock">
                            <Lock size={32} />
                        </div>
                    )}
                </div>
            </div>

            <style jsx>{`
                .trivia-lobby {
                    padding: 0 20px 20px;
                    max-width: 1000px;
                    margin: 0 auto;
                    font-family: 'Rajdhani', 'Orbitron', sans-serif;
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

                @media (max-width: 900px) {
                    .modes-grid {
                        grid-template-columns: repeat(2, 1fr);
                    }
                }

                @media (max-width: 500px) {
                    .modes-grid {
                        grid-template-columns: 1fr;
                    }
                    
                    .daily-hero__layout {
                        flex-direction: column;
                        text-align: center;
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

                /* Quick Stakes Banner - landscape format */
                .quick-stakes-banner {
                    position: relative;
                    border-radius: 12px;
                    overflow: hidden;
                    cursor: pointer;
                    transition: transform 0.2s ease, box-shadow 0.2s ease;
                }

                .quick-stakes-banner:hover {
                    transform: scale(1.02);
                    box-shadow: 0 0 30px rgba(0, 212, 255, 0.3);
                }

                .quick-stakes-banner__img {
                    width: 100%;
                    height: auto;
                    display: block;
                    border-radius: 8px;
                    pointer-events: none;
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
                    margin-top: 32px;
                }

                .qs-header {
                    display: flex;
                    align-items: baseline;
                @media (max-width: 600px) {
                    .daily-hero__layout {
                        flex-direction: column;
                    }
                }
            `}</style>
        </div>
    );
}
/* Cache bust: 1770343799 */

/**
 * TRIVIA LOBBY - Main trivia hub with Futuristic Metal UI
 * Skeuomorphic Sci-Fi design with metal frames, neon accents, and industrial aesthetic
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Zap, Trophy, BookOpen, GraduationCap, Gem, Lock, ChevronRight, Flame, Heart, Skull, Infinity, Shuffle, Swords, Calendar } from 'lucide-react';
import MetalFrame from '../ui/MetalFrame';
import HexButton from '../ui/HexButton';
import PortholeIcon from '../ui/PortholeIcon';
import StreakBadge from './StreakBadge';

const MODE_CARDS = [
    {
        id: 'history',
        name: 'Poker History',
        description: 'Iconic moments, famous hands, legendary players',
        icon: Trophy,
        color: '#FFD700',
        glowColor: '#FFD700',
        diamondReward: 3,
        perfectBonus: 5
    },
    {
        id: 'rules',
        name: 'Rules Quiz',
        description: 'Test your understanding of official poker rules',
        icon: BookOpen,
        color: '#4a90d9',
        glowColor: '#4a90d9',
        diamondReward: 3,
        perfectBonus: 5
    },
    {
        id: 'pro',
        name: 'Pro Knowledge',
        description: 'Strategy concepts, GTO basics, advanced trivia',
        icon: GraduationCap,
        color: '#9D4EDD',
        glowColor: '#9D4EDD',
        diamondReward: 5,
        perfectBonus: 10
    },
    {
        id: 'survival',
        name: 'Survival Mode',
        description: '10 levels, 20 questions each. All categories combined!',
        icon: Heart,
        color: '#ef4444',
        glowColor: '#ef4444',
        diamondReward: '10+',
        perfectBonus: null
    },
    {
        id: 'endless',
        name: 'Endless Mode',
        description: 'All questions, random order. Answer until you miss!',
        icon: Infinity,
        color: '#8b5cf6',
        glowColor: '#8b5cf6',
        diamondReward: '1+/Q',
        perfectBonus: null
    },
    {
        id: 'mixed',
        name: 'Mixed Mode',
        description: 'Rotating categories: History → Rules → Pro',
        icon: Shuffle,
        color: '#00D4FF',
        glowColor: '#00D4FF',
        diamondReward: '1/Q',
        perfectBonus: null
    },
    {
        id: 'pvp',
        name: '1v1 Battle',
        description: 'Challenge real players for diamonds!',
        icon: Swords,
        color: '#ef4444',
        glowColor: '#ef4444',
        diamondReward: '2x stake',
        perfectBonus: null
    },
    {
        id: 'tournaments',
        name: 'Tournaments',
        description: 'Weekly competitions with big prizes!',
        icon: Calendar,
        color: '#FFD700',
        glowColor: '#FFD700',
        diamondReward: 'Prize pool',
        perfectBonus: null
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
        router.push(`/hub/trivia/${modeId}`);
    };

    return (
        <div className="trivia-lobby">
            {/* Header */}
            <div className="lobby-header">
                <h1>TRIVIA</h1>
                <p className="subtitle">KNOWLEDGE • DISCIPLINE • MEMORY</p>
            </div>

            {/* Daily Trivia Hero Card */}
            <MetalFrame
                padding="28px 32px"
                showBolts={true}
                showNeonStrips={true}
                className="daily-hero"
            >
                <div className="daily-hero__layout">
                    <PortholeIcon
                        icon={Zap}
                        size={80}
                        glowColor="#00D4FF"
                        animated={!dailyCompleted}
                    />
                    <div className="daily-content">
                        <h2>DAILY TRIVIA</h2>
                        <p className="daily-info">10 Questions • Fresh Every Day</p>
                        <ul className="daily-benefits">
                            <li>• New questions every day at midnight CST</li>
                            <li>• Build your knowledge streak</li>
                        </ul>
                        {currentStreak > 0 && (
                            <StreakBadge
                                streakDays={currentStreak}
                                size="md"
                                showProgress={true}
                                showMultiplier={true}
                            />
                        )}
                    </div>
                    <HexButton
                        onClick={() => startMode('daily')}
                        disabled={dailyCompleted}
                        variant={dailyCompleted ? 'secondary' : 'primary'}
                        size="lg"
                    >
                        {dailyCompleted ? 'COMPLETED' : 'START DAILY TRIVIA'}
                    </HexButton>
                </div>
            </MetalFrame>

            {/* Mode Cards Section */}
            <div className="modes-section">
                <div className="modes-header">
                    <span className="modes-title">ALL IN TRIVIA</span>
                    <div className="modes-tabs">
                        <span className="tab active">TRIVIA</span>
                        <span className="tab-divider">|</span>
                        <span className="tab">COMMENTS</span>
                    </div>
                </div>

                <div className="modes-grid">
                    {MODE_CARDS.map((mode) => {
                        const Icon = mode.icon;
                        const isLocked = mode.id === 'arcade' && userDiamonds < 10;
                        const isHovered = hoveredCard === mode.id;

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

                                    {mode.diamondCost && (
                                        <div className="diamond-cost" style={{ color: mode.color }}>
                                            Entry: {mode.diamondCost} <Gem size={14} />
                                        </div>
                                    )}

                                    {/* Diamond reward badge */}
                                    <div className="diamond-reward-badge">
                                        <Gem size={12} />
                                        <span>{mode.diamondReward}{mode.perfectBonus ? ` (+${mode.perfectBonus} perfect)` : ''}</span>
                                    </div>

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

                {/* Daily Refresh Notice */}
                <div className="daily-refresh-notice">
                    <Flame size={14} />
                    <span>All trivia questions refresh daily at midnight CST</span>
                </div>
            </div>

            {/* Quick Stakes Section - Separate from Trivia */}
            <div className="quick-stakes-section">
                <div className="qs-header">
                    <span className="qs-title">QUICK STAKES</span>
                    <span className="qs-subtitle">Risk diamonds for rewards</span>
                </div>
                <MetalFrame
                    padding="24px 20px"
                    showBolts={true}
                    showNeonStrips={true}
                    className="qs-card"
                >
                    <div
                        className="qs-card__inner"
                        onClick={() => userDiamonds >= 10 && startMode('arcade')}
                        style={{ cursor: userDiamonds >= 10 ? 'pointer' : 'not-allowed', opacity: userDiamonds >= 10 ? 1 : 0.6 }}
                    >
                        <PortholeIcon
                            icon={Gem}
                            size={60}
                            glowColor="#00D4FF"
                            animated={userDiamonds >= 10}
                        />
                        <div className="qs-content">
                            <h3 className="qs-name">Quick Stakes</h3>
                            <p className="qs-description">10 questions in 60 seconds. Answer fast, win big.</p>
                            <div className="qs-entry">Entry: 10 <Gem size={14} /></div>
                        </div>
                        <HexButton
                            onClick={(e) => {
                                e.stopPropagation();
                                if (userDiamonds >= 10) startMode('arcade');
                            }}
                            disabled={userDiamonds < 10}
                            variant={userDiamonds >= 10 ? 'primary' : 'secondary'}
                            size="md"
                            icon={userDiamonds >= 10 ? <ChevronRight size={14} /> : <Lock size={14} />}
                        >
                            {userDiamonds >= 10 ? 'PLAY' : 'LOCKED'}
                        </HexButton>
                    </div>
                </MetalFrame>
            </div>

            <style jsx>{`
                .trivia-lobby {
                    padding: 20px;
                    max-width: 1000px;
                    margin: 0 auto;
                    font-family: 'Rajdhani', 'Orbitron', sans-serif;
                }

                .lobby-header {
                    margin-bottom: 24px;
                    text-align: left;
                }

                .lobby-header h1 {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 36px;
                    font-weight: 700;
                    color: #ffffff;
                    margin: 0 0 4px 0;
                    letter-spacing: 0.15em;
                    text-shadow: 0 0 20px rgba(0, 212, 255, 0.5);
                }

                .subtitle {
                    font-size: 14px;
                    color: rgba(0, 212, 255, 0.7);
                    margin: 0;
                    letter-spacing: 0.2em;
                    font-weight: 500;
                }

                /* Daily Hero Card */
                .daily-hero {
                    margin-bottom: 32px;
                }

                .daily-hero__layout {
                    display: flex;
                    align-items: center;
                    gap: 24px;
                }

                .daily-content {
                    flex: 1;
                }

                .daily-content h2 {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 24px;
                    font-weight: 700;
                    color: #ffffff;
                    margin: 0 0 4px 0;
                    letter-spacing: 0.1em;
                    text-shadow: 0 0 10px rgba(0, 212, 255, 0.5);
                }

                .daily-info {
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.7);
                    margin: 0 0 12px 0;
                }

                .daily-benefits {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                }

                .daily-benefits li {
                    font-size: 13px;
                    color: rgba(255, 255, 255, 0.6);
                    margin-bottom: 4px;
                }

                .streak-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    margin-top: 12px;
                    padding: 6px 12px;
                    background: rgba(255, 135, 0, 0.2);
                    border: 1px solid rgba(255, 135, 0, 0.4);
                    border-radius: 4px;
                    color: #FF8700;
                    font-size: 13px;
                    font-weight: 600;
                    text-shadow: 0 0 10px rgba(255, 135, 0, 0.5);
                }

                /* Modes Section */
                .modes-section {
                    margin-top: 8px;
                }

                .modes-header {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    margin-bottom: 20px;
                }

                .modes-title {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 18px;
                    font-weight: 600;
                    color: #ffffff;
                    letter-spacing: 0.1em;
                }

                .modes-tabs {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    font-size: 12px;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                }

                .tab {
                    color: rgba(255, 255, 255, 0.4);
                    cursor: pointer;
                    transition: color 0.2s, text-shadow 0.2s;
                }

                .tab:hover {
                    color: rgba(0, 212, 255, 0.8);
                }

                .tab.active {
                    color: #00D4FF;
                    text-shadow: 0 0 10px rgba(0, 212, 255, 0.5);
                }

                .tab-divider {
                    color: rgba(255, 255, 255, 0.2);
                }

                .modes-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 16px;
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

                .diamond-cost {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 13px;
                    margin: 12px 0;
                    text-shadow: 0 0 10px currentColor;
                }

                .diamond-reward-badge {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 11px;
                    color: #00D4FF;
                    background: rgba(0, 212, 255, 0.1);
                    border: 1px solid rgba(0, 212, 255, 0.3);
                    border-radius: 4px;
                    padding: 4px 8px;
                    margin: 8px 0 12px 0;
                }

                .diamond-reward-badge svg {
                    color: #00D4FF;
                }

                .mode-card--locked {
                    filter: grayscale(50%);
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
                    gap: 12px;
                    margin-bottom: 16px;
                }

                .qs-title {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 18px;
                    font-weight: 600;
                    color: #00D4FF;
                    letter-spacing: 0.1em;
                    text-shadow: 0 0 10px rgba(0, 212, 255, 0.5);
                }

                .qs-subtitle {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.5);
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                }

                .qs-card__inner {
                    display: flex;
                    align-items: center;
                    gap: 20px;
                    width: 100%;
                }

                .qs-content {
                    flex: 1;
                }

                .qs-name {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 18px;
                    font-weight: 700;
                    color: #00D4FF;
                    margin: 0 0 6px 0;
                    text-shadow: 0 0 10px rgba(0, 212, 255, 0.5);
                }

                .qs-description {
                    font-size: 13px;
                    color: rgba(255, 255, 255, 0.6);
                    margin: 0 0 8px 0;
                }

                .qs-entry {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 14px;
                    color: #00D4FF;
                    font-weight: 600;
                }

                @media (max-width: 600px) {
                    .qs-card__inner {
                        flex-direction: column;
                        text-align: center;
                    }
                }
            `}</style>
        </div>
    );
}

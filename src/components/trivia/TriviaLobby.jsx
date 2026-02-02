/**
 * TRIVIA LOBBY - Main trivia hub with Futuristic Metal UI
 * Skeuomorphic Sci-Fi design with metal frames, neon accents, and industrial aesthetic
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Zap, Trophy, BookOpen, GraduationCap, Gem, Lock, ChevronRight, Flame } from 'lucide-react';
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
        glowColor: '#FFD700'
    },
    {
        id: 'rules',
        name: 'Rules Quiz',
        description: 'Test your understanding of official poker rules',
        icon: BookOpen,
        color: '#4a90d9',
        glowColor: '#4a90d9'
    },
    {
        id: 'pro',
        name: 'Pro Knowledge',
        description: 'Strategy concepts, GTO basics, advanced trivia',
        icon: GraduationCap,
        color: '#9D4EDD',
        glowColor: '#9D4EDD'
    },
    {
        id: 'arcade',
        name: 'Diamond Arcade',
        description: 'High-speed trivia for Diamond rewards',
        icon: Gem,
        color: '#00D4FF',
        glowColor: '#00D4FF',
        diamondCost: 10
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
                        <p className="daily-info">1 Question • Once Per Day</p>
                        <ul className="daily-benefits">
                            <li>• Answer correctly to earn Diamonds</li>
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

                .mode-card--locked {
                    filter: grayscale(50%);
                }
            `}</style>
        </div>
    );
}

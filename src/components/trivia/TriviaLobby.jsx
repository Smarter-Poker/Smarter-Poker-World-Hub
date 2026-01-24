/**
 * TRIVIA LOBBY - Main trivia hub
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Zap, Trophy, BookOpen, GraduationCap, Gem, Lock, ChevronRight, Flame } from 'lucide-react';

const MODE_CARDS = [
    {
        id: 'history',
        name: 'Poker History',
        description: 'Iconic moments, famous hands, legendary players',
        icon: Trophy,
        color: '#d4a853',
        bgGradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)'
    },
    {
        id: 'rules',
        name: 'Rules Quiz',
        description: 'Test your understanding of official poker rules',
        icon: BookOpen,
        color: '#4a90d9',
        bgGradient: 'linear-gradient(135deg, #1a1a2e 0%, #1e3a5f 100%)'
    },
    {
        id: 'pro',
        name: 'Pro Knowledge',
        description: 'Strategy concepts, GTO basics, advanced trivia',
        icon: GraduationCap,
        color: '#7c3aed',
        bgGradient: 'linear-gradient(135deg, #1a1a2e 0%, #2d1b4e 100%)'
    },
    {
        id: 'arcade',
        name: 'Diamond Arcade',
        description: 'High-speed trivia for Diamond rewards',
        icon: Gem,
        color: '#06b6d4',
        bgGradient: 'linear-gradient(135deg, #1a1a2e 0%, #0c4a6e 100%)',
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
                <h1>Trivia</h1>
                <p className="subtitle">Knowledge • Discipline • Memory</p>
            </div>

            {/* Daily Trivia Hero Card */}
            <div className="daily-hero">
                <div className="daily-icon">
                    <Zap size={48} />
                </div>
                <div className="daily-content">
                    <h2>DAILY TRIVIA</h2>
                    <p className="daily-info">1 Question • Once Per Day</p>
                    <ul className="daily-benefits">
                        <li>• Answer correctly to earn XP</li>
                        <li>• Build your knowledge streak</li>
                    </ul>
                    {currentStreak > 0 && (
                        <div className="streak-badge">
                            <Flame size={16} />
                            <span>{currentStreak} Day Streak</span>
                        </div>
                    )}
                </div>
                <button
                    className={`daily-cta ${dailyCompleted ? 'completed' : ''}`}
                    onClick={() => startMode('daily')}
                    disabled={dailyCompleted}
                >
                    {dailyCompleted ? 'COMPLETED TODAY' : 'START DAILY TRIVIA'}
                </button>
            </div>

            {/* Mode Cards Section */}
            <div className="modes-section">
                <div className="modes-header">
                    <span className="modes-title">All in Trivia</span>
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

                        return (
                            <div
                                key={mode.id}
                                className={`mode-card ${isLocked ? 'locked' : ''}`}
                                style={{ background: mode.bgGradient }}
                                onMouseEnter={() => setHoveredCard(mode.id)}
                                onMouseLeave={() => setHoveredCard(null)}
                                onClick={() => !isLocked && startMode(mode.id)}
                            >
                                <div className="mode-icon" style={{ color: mode.color }}>
                                    <Icon size={48} strokeWidth={1.5} />
                                </div>
                                <h3 className="mode-name" style={{ color: mode.color }}>
                                    {mode.name}
                                </h3>
                                <p className="mode-description">{mode.description}</p>

                                {mode.diamondCost && (
                                    <div className="diamond-cost">
                                        Entry: {mode.diamondCost} <Gem size={14} />
                                    </div>
                                )}

                                <button
                                    className="mode-cta"
                                    style={{
                                        background: isLocked
                                            ? 'rgba(107, 114, 128, 0.5)'
                                            : `linear-gradient(135deg, ${mode.color}, ${mode.color}cc)`
                                    }}
                                >
                                    {isLocked ? (
                                        <>
                                            <Lock size={16} />
                                            LOCKED
                                        </>
                                    ) : mode.id === 'arcade' ? (
                                        <>
                                            PLAY
                                            <ChevronRight size={18} />
                                        </>
                                    ) : (
                                        'START'
                                    )}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            <style jsx>{`
                .trivia-lobby {
                    padding: 20px;
                    max-width: 1000px;
                    margin: 0 auto;
                }

                .lobby-header {
                    margin-bottom: 24px;
                }

                .lobby-header h1 {
                    font-size: 32px;
                    font-weight: 600;
                    color: #ffffff;
                    margin: 0 0 4px 0;
                }

                .subtitle {
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.5);
                    margin: 0;
                }

                /* Daily Hero Card */
                .daily-hero {
                    background: linear-gradient(135deg, #1e3a5f 0%, #0f2744 100%);
                    border: 1px solid rgba(0, 150, 200, 0.3);
                    border-radius: 12px;
                    padding: 28px 32px;
                    display: flex;
                    align-items: center;
                    gap: 24px;
                    margin-bottom: 32px;
                    position: relative;
                    overflow: hidden;
                }

                .daily-hero::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: radial-gradient(ellipse at 20% 50%, rgba(0, 180, 220, 0.15), transparent 50%);
                    pointer-events: none;
                }

                .daily-icon {
                    width: 80px;
                    height: 80px;
                    background: linear-gradient(135deg, #0ea5e9, #0284c7);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #ffffff;
                    flex-shrink: 0;
                    box-shadow: 0 0 30px rgba(14, 165, 233, 0.4);
                }

                .daily-content {
                    flex: 1;
                }

                .daily-content h2 {
                    font-size: 24px;
                    font-weight: 700;
                    color: #ffffff;
                    margin: 0 0 4px 0;
                    letter-spacing: 1px;
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
                    background: rgba(249, 115, 22, 0.2);
                    border: 1px solid rgba(249, 115, 22, 0.4);
                    border-radius: 20px;
                    color: #f97316;
                    font-size: 13px;
                    font-weight: 600;
                }

                .daily-cta {
                    padding: 14px 28px;
                    background: linear-gradient(135deg, #0ea5e9, #0284c7);
                    border: none;
                    border-radius: 8px;
                    color: #ffffff;
                    font-size: 14px;
                    font-weight: 700;
                    letter-spacing: 0.5px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    flex-shrink: 0;
                }

                .daily-cta:hover:not(:disabled) {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 20px rgba(14, 165, 233, 0.4);
                }

                .daily-cta.completed {
                    background: rgba(34, 197, 94, 0.3);
                    color: #22c55e;
                    cursor: default;
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
                    font-size: 18px;
                    font-weight: 600;
                    color: #ffffff;
                }

                .modes-tabs {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    font-size: 12px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }

                .tab {
                    color: rgba(255, 255, 255, 0.4);
                    cursor: pointer;
                    transition: color 0.2s;
                }

                .tab.active {
                    color: rgba(255, 255, 255, 0.8);
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
                }

                .mode-card {
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    padding: 24px 20px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    text-align: center;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    min-height: 260px;
                }

                .mode-card:hover:not(.locked) {
                    transform: translateY(-4px);
                    border-color: rgba(255, 255, 255, 0.2);
                    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
                }

                .mode-card.locked {
                    opacity: 0.6;
                    cursor: not-allowed;
                }

                .mode-icon {
                    margin-bottom: 16px;
                    opacity: 0.9;
                }

                .mode-name {
                    font-size: 18px;
                    font-weight: 700;
                    margin: 0 0 8px 0;
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
                    color: #06b6d4;
                    margin: 12px 0;
                }

                .mode-cta {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 4px;
                    width: 100%;
                    padding: 12px 20px;
                    border: none;
                    border-radius: 6px;
                    color: #ffffff;
                    font-size: 13px;
                    font-weight: 700;
                    letter-spacing: 0.5px;
                    cursor: pointer;
                    margin-top: 16px;
                    transition: all 0.2s ease;
                }

                .mode-card:hover:not(.locked) .mode-cta {
                    filter: brightness(1.1);
                }
            `}</style>
        </div>
    );
}

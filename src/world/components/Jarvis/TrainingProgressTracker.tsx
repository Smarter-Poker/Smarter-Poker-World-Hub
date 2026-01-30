/* ═══════════════════════════════════════════════════════════════════════════
   TRAINING PROGRESS TRACKER — Shows user's training stats and progress
   Integrates with the GTO Training Engine to display achievements
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect } from 'react';

interface TrainingStats {
    gamesPlayed: number;
    totalAccuracy: number;
    bestStreak: number;
    weakestCategory: string;
    strongestCategory: string;
    recentSessions: {
        date: string;
        gameId: string;
        gameName: string;
        accuracy: number;
        duration: number;
    }[];
    categoryProgress: {
        category: string;
        accuracy: number;
        gamesPlayed: number;
    }[];
}

interface TrainingProgressTrackerProps {
    userId?: string;
    onAskGeeves: (question: string) => void;
    onClose?: () => void;
}

// Mock data - in production, fetch from training_sessions table
const MOCK_STATS: TrainingStats = {
    gamesPlayed: 47,
    totalAccuracy: 72.3,
    bestStreak: 12,
    weakestCategory: 'River Play',
    strongestCategory: 'Preflop Ranges',
    recentSessions: [
        { date: '2026-01-30', gameId: '1', gameName: 'Opening Ranges', accuracy: 85, duration: 15 },
        { date: '2026-01-29', gameId: '2', gameName: 'C-Bet Strategy', accuracy: 68, duration: 12 },
        { date: '2026-01-29', gameId: '3', gameName: 'River Bluffs', accuracy: 55, duration: 20 },
    ],
    categoryProgress: [
        { category: 'Preflop', accuracy: 82, gamesPlayed: 15 },
        { category: 'Flop', accuracy: 71, gamesPlayed: 12 },
        { category: 'Turn', accuracy: 68, gamesPlayed: 10 },
        { category: 'River', accuracy: 58, gamesPlayed: 10 },
    ]
};

export function TrainingProgressTracker({ userId, onAskGeeves, onClose }: TrainingProgressTrackerProps) {
    const [stats, setStats] = useState<TrainingStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'leaks'>('overview');

    useEffect(() => {
        // In production: fetch from /api/training/stats?userId=...
        setTimeout(() => {
            setStats(MOCK_STATS);
            setLoading(false);
        }, 500);
    }, [userId]);

    const askForLeakAnalysis = () => {
        if (!stats) return;

        const question = `Analyze my poker training leaks:

**Overall Accuracy:** ${stats.totalAccuracy}%
**Games Played:** ${stats.gamesPlayed}
**Weakest Area:** ${stats.weakestCategory}
**Strongest Area:** ${stats.strongestCategory}

**Category Breakdown:**
${stats.categoryProgress.map(c => `- ${c.category}: ${c.accuracy}% (${c.gamesPlayed} games)`).join('\n')}

What are my biggest leaks and how should I focus my training?`;

        onAskGeeves(question);
    };

    const askForDrillRecommendation = () => {
        if (!stats) return;

        const question = `Based on my training stats:
- Weakest: ${stats.weakestCategory} 
- Overall accuracy: ${stats.totalAccuracy}%

What specific training games should I play next to improve fastest?`;

        onAskGeeves(question);
    };

    if (loading) {
        return (
            <div style={{
                background: 'rgba(20, 10, 40, 0.98)',
                border: '1px solid rgba(255, 215, 0, 0.3)',
                borderRadius: '12px',
                padding: '24px',
                textAlign: 'center',
                color: 'rgba(255, 255, 255, 0.5)'
            }}>
                Loading training data...
            </div>
        );
    }

    if (!stats) return null;

    return (
        <div style={{
            background: 'rgba(20, 10, 40, 0.98)',
            border: '1px solid rgba(255, 215, 0, 0.3)',
            borderRadius: '12px',
            padding: '16px',
            maxWidth: '380px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px'
            }}>
                <h4 style={{
                    margin: 0,
                    color: '#FFD700',
                    fontSize: '14px',
                    fontWeight: 600
                }}>
                    📈 Training Progress
                </h4>
                {onClose && (
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none',
                        color: 'rgba(255, 215, 0, 0.6)', fontSize: '18px', cursor: 'pointer'
                    }}>×</button>
                )}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
                {(['overview', 'history', 'leaks'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                            flex: 1,
                            padding: '6px',
                            background: activeTab === tab ? 'rgba(255, 215, 0, 0.2)' : 'transparent',
                            border: activeTab === tab
                                ? '1px solid rgba(255, 215, 0, 0.4)'
                                : '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '6px',
                            color: activeTab === tab ? '#FFD700' : 'rgba(255, 255, 255, 0.5)',
                            fontSize: '10px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            textTransform: 'capitalize'
                        }}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* Overview Tab */}
            {activeTab === 'overview' && (
                <>
                    {/* Stats Grid */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 1fr',
                        gap: '8px',
                        marginBottom: '12px'
                    }}>
                        <div style={{
                            padding: '10px',
                            background: 'rgba(0, 0, 0, 0.3)',
                            borderRadius: '8px',
                            textAlign: 'center'
                        }}>
                            <div style={{ fontSize: '20px', fontWeight: 700, color: '#FFD700' }}>
                                {stats.gamesPlayed}
                            </div>
                            <div style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)' }}>
                                Games
                            </div>
                        </div>
                        <div style={{
                            padding: '10px',
                            background: 'rgba(0, 0, 0, 0.3)',
                            borderRadius: '8px',
                            textAlign: 'center'
                        }}>
                            <div style={{
                                fontSize: '20px',
                                fontWeight: 700,
                                color: stats.totalAccuracy >= 70 ? '#4CAF50' : '#FF9800'
                            }}>
                                {stats.totalAccuracy}%
                            </div>
                            <div style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)' }}>
                                Accuracy
                            </div>
                        </div>
                        <div style={{
                            padding: '10px',
                            background: 'rgba(0, 0, 0, 0.3)',
                            borderRadius: '8px',
                            textAlign: 'center'
                        }}>
                            <div style={{ fontSize: '20px', fontWeight: 700, color: '#2196F3' }}>
                                {stats.bestStreak}
                            </div>
                            <div style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)' }}>
                                Best Streak
                            </div>
                        </div>
                    </div>

                    {/* Category Progress */}
                    <div style={{ marginBottom: '12px' }}>
                        <p style={{ margin: '0 0 6px 0', fontSize: '10px', color: 'rgba(255, 215, 0, 0.7)' }}>
                            Category Accuracy:
                        </p>
                        {stats.categoryProgress.map(cat => (
                            <div key={cat.category} style={{ marginBottom: '6px' }}>
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    fontSize: '10px',
                                    color: 'rgba(255, 255, 255, 0.7)',
                                    marginBottom: '2px'
                                }}>
                                    <span>{cat.category}</span>
                                    <span>{cat.accuracy}%</span>
                                </div>
                                <div style={{
                                    height: '6px',
                                    background: 'rgba(255, 255, 255, 0.1)',
                                    borderRadius: '3px',
                                    overflow: 'hidden'
                                }}>
                                    <div style={{
                                        width: `${cat.accuracy}%`,
                                        height: '100%',
                                        background: cat.accuracy >= 75
                                            ? 'linear-gradient(90deg, #4CAF50, #8BC34A)'
                                            : cat.accuracy >= 60
                                                ? 'linear-gradient(90deg, #FF9800, #FFC107)'
                                                : 'linear-gradient(90deg, #f44336, #FF5722)',
                                        borderRadius: '3px'
                                    }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* History Tab */}
            {activeTab === 'history' && (
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {stats.recentSessions.map((session, i) => (
                        <div key={i} style={{
                            padding: '8px',
                            background: 'rgba(0, 0, 0, 0.2)',
                            borderRadius: '6px',
                            marginBottom: '6px'
                        }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                marginBottom: '4px'
                            }}>
                                <span style={{ fontSize: '11px', color: '#fff', fontWeight: 600 }}>
                                    {session.gameName}
                                </span>
                                <span style={{
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    color: session.accuracy >= 70 ? '#4CAF50' : '#FF9800'
                                }}>
                                    {session.accuracy}%
                                </span>
                            </div>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: '9px',
                                color: 'rgba(255, 255, 255, 0.5)'
                            }}>
                                <span>{session.date}</span>
                                <span>{session.duration} min</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Leaks Tab */}
            {activeTab === 'leaks' && (
                <div>
                    <div style={{
                        padding: '12px',
                        background: 'rgba(255, 68, 68, 0.1)',
                        border: '1px solid rgba(255, 68, 68, 0.3)',
                        borderRadius: '8px',
                        marginBottom: '10px'
                    }}>
                        <div style={{ fontSize: '10px', color: '#f44336', marginBottom: '4px' }}>
                            ⚠️ Weakest Area
                        </div>
                        <div style={{ fontSize: '14px', color: '#fff', fontWeight: 600 }}>
                            {stats.weakestCategory}
                        </div>
                    </div>
                    <div style={{
                        padding: '12px',
                        background: 'rgba(100, 255, 100, 0.1)',
                        border: '1px solid rgba(100, 255, 100, 0.3)',
                        borderRadius: '8px',
                        marginBottom: '10px'
                    }}>
                        <div style={{ fontSize: '10px', color: '#4CAF50', marginBottom: '4px' }}>
                            ✓ Strongest Area
                        </div>
                        <div style={{ fontSize: '14px', color: '#fff', fontWeight: 600 }}>
                            {stats.strongestCategory}
                        </div>
                    </div>
                </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button
                    onClick={askForLeakAnalysis}
                    style={{
                        flex: 1,
                        padding: '10px',
                        background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                        border: 'none',
                        borderRadius: '8px',
                        color: '#000',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer'
                    }}
                >
                    🔍 Analyze Leaks
                </button>
                <button
                    onClick={askForDrillRecommendation}
                    style={{
                        flex: 1,
                        padding: '10px',
                        background: 'rgba(255, 215, 0, 0.2)',
                        border: '1px solid rgba(255, 215, 0, 0.4)',
                        borderRadius: '8px',
                        color: '#FFD700',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer'
                    }}
                >
                    📚 Next Drill
                </button>
            </div>
        </div>
    );
}

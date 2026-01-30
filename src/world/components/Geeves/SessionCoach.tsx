/* ═══════════════════════════════════════════════════════════════════════════
   SESSION COACH — Floating mini-panel for live poker session coaching
   Provides quick decision indicators and post-hand reviews
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';

interface SessionStats {
    handsPlayed: number;
    vpip: number;
    pfr: number;
    aggression: number;
    winRate: number;
}

interface SessionCoachProps {
    onAskQuestion: (question: string) => void;
    onClose?: () => void;
}

export function SessionCoach({ onAskQuestion, onClose }: SessionCoachProps) {
    const [isMinimized, setIsMinimized] = useState(false);
    const [sessionStats, setSessionStats] = useState<SessionStats>({
        handsPlayed: 0,
        vpip: 0,
        pfr: 0,
        aggression: 0,
        winRate: 0
    });
    const [lastDecision, setLastDecision] = useState<string | null>(null);
    const [tiltLevel, setTiltLevel] = useState<'zen' | 'mild' | 'tilted'>('zen');

    // Quick decision buttons
    const quickDecisions = [
        { label: 'Should I call?', emoji: '📞' },
        { label: 'Should I raise?', emoji: '🚀' },
        { label: 'Is this a fold?', emoji: '🃏' },
        { label: 'All-in or fold?', emoji: '💰' }
    ];

    // Tilt indicators
    const tiltColors = {
        zen: '#4CAF50',
        mild: '#FFA500',
        tilted: '#f44336'
    };

    const handleQuickDecision = (decision: string) => {
        setLastDecision(decision);
        onAskQuestion(`Quick decision needed: ${decision} Give me a 1-2 sentence answer.`);
    };

    const logHand = (won: boolean) => {
        setSessionStats(prev => ({
            ...prev,
            handsPlayed: prev.handsPlayed + 1,
            winRate: ((prev.winRate * prev.handsPlayed) + (won ? 100 : 0)) / (prev.handsPlayed + 1)
        }));
    };

    if (isMinimized) {
        return (
            <div
                onClick={() => setIsMinimized(false)}
                style={{
                    position: 'fixed',
                    bottom: '80px',
                    left: '20px',
                    width: '50px',
                    height: '50px',
                    background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '24px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
                    zIndex: 100
                }}
                title="Open Session Coach"
            >
                🎯
            </div>
        );
    }

    return (
        <div style={{
            position: 'fixed',
            bottom: '80px',
            left: '20px',
            width: '280px',
            background: 'rgba(20, 10, 40, 0.98)',
            border: '1px solid rgba(255, 215, 0, 0.3)',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
            zIndex: 100,
            overflow: 'hidden'
        }}>
            {/* Header */}
            <div style={{
                padding: '10px 12px',
                background: 'rgba(255, 215, 0, 0.1)',
                borderBottom: '1px solid rgba(255, 215, 0, 0.2)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '16px' }}>🎯</span>
                    <span style={{
                        color: '#FFD700',
                        fontSize: '12px',
                        fontWeight: 600
                    }}>
                        Session Coach
                    </span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                        onClick={() => setIsMinimized(true)}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'rgba(255, 215, 0, 0.6)',
                            fontSize: '14px',
                            cursor: 'pointer'
                        }}
                    >
                        ─
                    </button>
                    {onClose && (
                        <button
                            onClick={onClose}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: 'rgba(255, 215, 0, 0.6)',
                                fontSize: '14px',
                                cursor: 'pointer'
                            }}
                        >
                            ×
                        </button>
                    )}
                </div>
            </div>

            {/* Tilt Meter */}
            <div style={{
                padding: '8px 12px',
                background: 'rgba(0, 0, 0, 0.2)',
                borderBottom: '1px solid rgba(255, 215, 0, 0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.6)' }}>
                    Tilt Level:
                </span>
                <div style={{ display: 'flex', gap: '4px' }}>
                    {(['zen', 'mild', 'tilted'] as const).map(level => (
                        <button
                            key={level}
                            onClick={() => setTiltLevel(level)}
                            style={{
                                padding: '3px 8px',
                                background: tiltLevel === level
                                    ? tiltColors[level]
                                    : 'rgba(255, 255, 255, 0.1)',
                                border: 'none',
                                borderRadius: '4px',
                                color: tiltLevel === level ? '#fff' : 'rgba(255, 255, 255, 0.4)',
                                fontSize: '9px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                textTransform: 'uppercase'
                            }}
                        >
                            {level}
                        </button>
                    ))}
                </div>
            </div>

            {/* Quick Decisions */}
            <div style={{ padding: '10px' }}>
                <p style={{
                    margin: '0 0 8px 0',
                    fontSize: '10px',
                    color: 'rgba(255, 215, 0, 0.7)'
                }}>
                    Quick Decisions:
                </p>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '6px'
                }}>
                    {quickDecisions.map(d => (
                        <button
                            key={d.label}
                            onClick={() => handleQuickDecision(d.label)}
                            style={{
                                padding: '8px',
                                background: 'rgba(255, 215, 0, 0.1)',
                                border: '1px solid rgba(255, 215, 0, 0.2)',
                                borderRadius: '6px',
                                color: '#fff',
                                fontSize: '10px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}
                        >
                            <span>{d.emoji}</span>
                            <span>{d.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Session Stats */}
            <div style={{
                padding: '10px',
                borderTop: '1px solid rgba(255, 215, 0, 0.1)'
            }}>
                <p style={{
                    margin: '0 0 6px 0',
                    fontSize: '10px',
                    color: 'rgba(255, 215, 0, 0.7)'
                }}>
                    Session Stats:
                </p>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '10px',
                    color: 'rgba(255, 255, 255, 0.7)'
                }}>
                    <span>Hands: <strong>{sessionStats.handsPlayed}</strong></span>
                    <span>Win Rate: <strong style={{ color: sessionStats.winRate > 0 ? '#4CAF50' : '#f44336' }}>
                        {sessionStats.winRate.toFixed(1)}%
                    </strong></span>
                </div>

                {/* Hand Tracker */}
                <div style={{
                    display: 'flex',
                    gap: '6px',
                    marginTop: '8px'
                }}>
                    <button
                        onClick={() => logHand(true)}
                        style={{
                            flex: 1,
                            padding: '6px',
                            background: 'rgba(100, 255, 100, 0.2)',
                            border: '1px solid rgba(100, 255, 100, 0.3)',
                            borderRadius: '4px',
                            color: '#4CAF50',
                            fontSize: '10px',
                            cursor: 'pointer'
                        }}
                    >
                        ✓ Won
                    </button>
                    <button
                        onClick={() => logHand(false)}
                        style={{
                            flex: 1,
                            padding: '6px',
                            background: 'rgba(255, 100, 100, 0.2)',
                            border: '1px solid rgba(255, 100, 100, 0.3)',
                            borderRadius: '4px',
                            color: '#f44336',
                            fontSize: '10px',
                            cursor: 'pointer'
                        }}
                    >
                        ✗ Lost
                    </button>
                </div>
            </div>

            {/* Tilt Warning */}
            {tiltLevel === 'tilted' && (
                <div style={{
                    padding: '10px',
                    background: 'rgba(255, 68, 68, 0.2)',
                    borderTop: '1px solid rgba(255, 68, 68, 0.3)'
                }}>
                    <p style={{
                        margin: 0,
                        fontSize: '11px',
                        color: '#f44336',
                        fontWeight: 600
                    }}>
                        ⚠️ Consider taking a break! Tilt affects decision quality.
                    </p>
                </div>
            )}
        </div>
    );
}

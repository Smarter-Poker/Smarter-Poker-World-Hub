/* ═══════════════════════════════════════════════════════════════════════════
   TOURNAMENT ADVISOR — ICM, bubble, and tournament-specific guidance
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';

interface TournamentState {
    phase: 'early' | 'middle' | 'bubble' | 'itm' | 'final-table' | 'heads-up';
    playersLeft: number;
    avgStack: number;
    yourStack: number;
    blinds: string;
    buyIn: string;
    payout: string;
}

interface TournamentAdvisorProps {
    onAskJarvis: (question: string) => void;
    onClose?: () => void;
}

const PHASE_INFO = {
    'early': { label: 'Early Stage', color: '#4CAF50', strategy: 'Play solid, build stack' },
    'middle': { label: 'Middle Stage', color: '#2196F3', strategy: 'Accumulate chips, attack weakness' },
    'bubble': { label: 'Bubble', color: '#FF9800', strategy: 'ICM pressure, exploit tight players' },
    'itm': { label: 'In The Money', color: '#8BC34A', strategy: 'Laddering vs chip accumulation' },
    'final-table': { label: 'Final Table', color: '#9C27B0', strategy: 'ICM + exploitation' },
    'heads-up': { label: 'Heads Up', color: '#f44336', strategy: 'Max aggression, adjust to villain' }
};

export function TournamentAdvisor({ onAskJarvis, onClose }: TournamentAdvisorProps) {
    const [state, setState] = useState<TournamentState>({
        phase: 'early',
        playersLeft: 100,
        avgStack: 10000,
        yourStack: 10000,
        blinds: '100/200',
        buyIn: '$50',
        payout: ''
    });

    // Calculate M-ratio
    const parseBlinds = () => {
        const match = state.blinds.match(/(\d+)\/(\d+)/);
        if (!match) return 300;
        return parseInt(match[1]) + parseInt(match[2]);
    };
    const mRatio = Math.round(state.yourStack / parseBlinds());
    const bigBlinds = Math.round(state.yourStack / (parseBlinds() / 1.5));

    // Stack status
    const getStackStatus = () => {
        if (mRatio >= 20) return { label: 'Deep', color: '#4CAF50' };
        if (mRatio >= 10) return { label: 'Healthy', color: '#8BC34A' };
        if (mRatio >= 6) return { label: 'Short', color: '#FF9800' };
        return { label: 'Critical', color: '#f44336' };
    };
    const stackStatus = getStackStatus();

    const askICMAdvice = () => {
        const question = `Tournament ICM situation:

**Phase:** ${PHASE_INFO[state.phase].label}
**Players Left:** ${state.playersLeft}
**My Stack:** ${state.yourStack} chips (${bigBlinds}BB, M=${mRatio})
**Average Stack:** ${state.avgStack} chips
**Blinds:** ${state.blinds}
**Buy-in:** ${state.buyIn}

What adjustments should I make for this tournament stage? Give specific ICM advice.`;

        onAskJarvis(question);
    };

    const askShoveRange = () => {
        const question = `I have ${bigBlinds} big blinds in a tournament. 

**Phase:** ${PHASE_INFO[state.phase].label}
**Players Left:** ${state.playersLeft}

What hands should I shove from each position? Give me a quick chart.`;

        onAskJarvis(question);
    };

    return (
        <div style={{
            background: 'rgba(20, 10, 40, 0.98)',
            border: '1px solid rgba(255, 215, 0, 0.3)',
            borderRadius: '12px',
            padding: '16px',
            maxWidth: '350px',
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
                    🏆 Tournament Advisor
                </h4>
                {onClose && (
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none',
                        color: 'rgba(255, 215, 0, 0.6)', fontSize: '18px', cursor: 'pointer'
                    }}>×</button>
                )}
            </div>

            {/* Phase Selector */}
            <div style={{ marginBottom: '12px' }}>
                <p style={{ margin: '0 0 6px 0', fontSize: '10px', color: 'rgba(255, 215, 0, 0.7)' }}>
                    Tournament Phase:
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {(Object.keys(PHASE_INFO) as Array<keyof typeof PHASE_INFO>).map(phase => (
                        <button
                            key={phase}
                            onClick={() => setState(s => ({ ...s, phase }))}
                            style={{
                                padding: '4px 8px',
                                background: state.phase === phase
                                    ? PHASE_INFO[phase].color
                                    : 'rgba(255, 255, 255, 0.05)',
                                border: `1px solid ${PHASE_INFO[phase].color}`,
                                borderRadius: '4px',
                                color: '#fff',
                                fontSize: '8px',
                                cursor: 'pointer'
                            }}
                        >
                            {PHASE_INFO[phase].label}
                        </button>
                    ))}
                </div>
                <p style={{
                    margin: '6px 0 0 0',
                    fontSize: '10px',
                    color: PHASE_INFO[state.phase].color,
                    fontStyle: 'italic'
                }}>
                    💡 {PHASE_INFO[state.phase].strategy}
                </p>
            </div>

            {/* Stack Info */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                marginBottom: '12px'
            }}>
                <div>
                    <label style={{ fontSize: '9px', color: 'rgba(255, 215, 0, 0.7)' }}>Your Stack</label>
                    <input
                        type="number"
                        value={state.yourStack}
                        onChange={e => setState(s => ({ ...s, yourStack: parseInt(e.target.value) || 0 }))}
                        style={{
                            width: '100%',
                            padding: '6px',
                            background: 'rgba(0, 0, 0, 0.3)',
                            border: '1px solid rgba(255, 215, 0, 0.2)',
                            borderRadius: '4px',
                            color: '#fff',
                            fontSize: '12px'
                        }}
                    />
                </div>
                <div>
                    <label style={{ fontSize: '9px', color: 'rgba(255, 215, 0, 0.7)' }}>Avg Stack</label>
                    <input
                        type="number"
                        value={state.avgStack}
                        onChange={e => setState(s => ({ ...s, avgStack: parseInt(e.target.value) || 0 }))}
                        style={{
                            width: '100%',
                            padding: '6px',
                            background: 'rgba(0, 0, 0, 0.3)',
                            border: '1px solid rgba(255, 215, 0, 0.2)',
                            borderRadius: '4px',
                            color: '#fff',
                            fontSize: '12px'
                        }}
                    />
                </div>
                <div>
                    <label style={{ fontSize: '9px', color: 'rgba(255, 215, 0, 0.7)' }}>Blinds</label>
                    <input
                        value={state.blinds}
                        onChange={e => setState(s => ({ ...s, blinds: e.target.value }))}
                        placeholder="100/200"
                        style={{
                            width: '100%',
                            padding: '6px',
                            background: 'rgba(0, 0, 0, 0.3)',
                            border: '1px solid rgba(255, 215, 0, 0.2)',
                            borderRadius: '4px',
                            color: '#fff',
                            fontSize: '12px'
                        }}
                    />
                </div>
                <div>
                    <label style={{ fontSize: '9px', color: 'rgba(255, 215, 0, 0.7)' }}>Players Left</label>
                    <input
                        type="number"
                        value={state.playersLeft}
                        onChange={e => setState(s => ({ ...s, playersLeft: parseInt(e.target.value) || 0 }))}
                        style={{
                            width: '100%',
                            padding: '6px',
                            background: 'rgba(0, 0, 0, 0.3)',
                            border: '1px solid rgba(255, 215, 0, 0.2)',
                            borderRadius: '4px',
                            color: '#fff',
                            fontSize: '12px'
                        }}
                    />
                </div>
            </div>

            {/* Status Display */}
            <div style={{
                padding: '10px',
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: '8px',
                marginBottom: '12px'
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-around',
                    textAlign: 'center'
                }}>
                    <div>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: stackStatus.color }}>
                            {mRatio}
                        </div>
                        <div style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.6)' }}>
                            M-Ratio
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#FFD700' }}>
                            {bigBlinds}
                        </div>
                        <div style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.6)' }}>
                            Big Blinds
                        </div>
                    </div>
                    <div>
                        <div style={{
                            fontSize: '12px',
                            fontWeight: 700,
                            color: stackStatus.color,
                            padding: '4px 8px',
                            background: `${stackStatus.color}20`,
                            borderRadius: '4px'
                        }}>
                            {stackStatus.label}
                        </div>
                        <div style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.6)', marginTop: '2px' }}>
                            Status
                        </div>
                    </div>
                </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '8px' }}>
                <button
                    onClick={askICMAdvice}
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
                    🎯 ICM Advice
                </button>
                <button
                    onClick={askShoveRange}
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
                    📊 Shove Ranges
                </button>
            </div>
        </div>
    );
}

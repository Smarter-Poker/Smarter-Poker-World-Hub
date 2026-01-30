/* ═══════════════════════════════════════════════════════════════════════════
   EQUITY CALCULATOR — Shows hand vs hand/range equity
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';

// Common matchups with pre-calculated equities
const COMMON_MATCHUPS: Record<string, { vs: string; equity: number }[]> = {
    'AA': [
        { vs: 'KK', equity: 82 },
        { vs: 'AKs', equity: 87 },
        { vs: 'Random', equity: 85 }
    ],
    'KK': [
        { vs: 'AA', equity: 18 },
        { vs: 'AKs', equity: 70 },
        { vs: 'QQ', equity: 82 },
        { vs: 'Random', equity: 83 }
    ],
    'AKs': [
        { vs: 'AA', equity: 13 },
        { vs: 'KK', equity: 30 },
        { vs: 'QQ', equity: 46 },
        { vs: '22', equity: 48 },
        { vs: 'Random', equity: 67 }
    ],
    'AKo': [
        { vs: 'AA', equity: 12 },
        { vs: 'QQ', equity: 43 },
        { vs: '22', equity: 46 },
        { vs: 'Random', equity: 65 }
    ],
    'QQ': [
        { vs: 'AA', equity: 18 },
        { vs: 'KK', equity: 18 },
        { vs: 'AKs', equity: 54 },
        { vs: 'Random', equity: 80 }
    ],
    'JJ': [
        { vs: 'AA', equity: 19 },
        { vs: 'AKs', equity: 54 },
        { vs: 'Random', equity: 77 }
    ],
    'TT': [
        { vs: 'AKs', equity: 54 },
        { vs: 'AQs', equity: 55 },
        { vs: 'Random', equity: 75 }
    ],
    '77': [
        { vs: 'AKs', equity: 51 },
        { vs: 'Overcards', equity: 52 },
        { vs: 'Random', equity: 66 }
    ],
    '22': [
        { vs: 'AKo', equity: 54 },
        { vs: 'Overcards', equity: 52 },
        { vs: 'Random', equity: 50 }
    ]
};

// Quick equity reference table
const QUICK_REFERENCE = [
    { scenario: 'Pair vs Pair (Higher)', equity: '~18%' },
    { scenario: 'Pair vs Two Overcards', equity: '~52%' },
    { scenario: 'Pair vs One Overcard', equity: '~70%' },
    { scenario: 'Pair vs Two Undercards', equity: '~82%' },
    { scenario: 'Overcards vs Undercards', equity: '~62%' },
    { scenario: 'Dominated (AK vs AQ)', equity: '~70%' },
    { scenario: 'Flush Draw (flop)', equity: '~35%' },
    { scenario: 'Open-Ended Straight Draw', equity: '~32%' },
    { scenario: 'Gutshot Draw', equity: '~17%' }
];

interface EquityCalculatorProps {
    onClose?: () => void;
}

export function EquityCalculator({ onClose }: EquityCalculatorProps) {
    const [selectedHand, setSelectedHand] = useState('AA');
    const [showQuickRef, setShowQuickRef] = useState(false);

    const matchups = COMMON_MATCHUPS[selectedHand] || [];

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
                    🎯 Equity Calculator
                </h4>
                {onClose && (
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'rgba(255, 215, 0, 0.6)',
                            fontSize: '18px',
                            cursor: 'pointer'
                        }}
                    >
                        ×
                    </button>
                )}
            </div>

            {/* Tab Toggle */}
            <div style={{
                display: 'flex',
                gap: '8px',
                marginBottom: '12px'
            }}>
                <button
                    onClick={() => setShowQuickRef(false)}
                    style={{
                        flex: 1,
                        padding: '8px',
                        background: !showQuickRef ? 'rgba(255, 215, 0, 0.2)' : 'transparent',
                        border: '1px solid rgba(255, 215, 0, 0.3)',
                        borderRadius: '6px',
                        color: !showQuickRef ? '#FFD700' : 'rgba(255, 255, 255, 0.6)',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer'
                    }}
                >
                    Hand Lookup
                </button>
                <button
                    onClick={() => setShowQuickRef(true)}
                    style={{
                        flex: 1,
                        padding: '8px',
                        background: showQuickRef ? 'rgba(255, 215, 0, 0.2)' : 'transparent',
                        border: '1px solid rgba(255, 215, 0, 0.3)',
                        borderRadius: '6px',
                        color: showQuickRef ? '#FFD700' : 'rgba(255, 255, 255, 0.6)',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer'
                    }}
                >
                    Quick Reference
                </button>
            </div>

            {!showQuickRef ? (
                <>
                    {/* Hand Selector */}
                    <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '6px',
                        marginBottom: '12px'
                    }}>
                        {Object.keys(COMMON_MATCHUPS).map(hand => (
                            <button
                                key={hand}
                                onClick={() => setSelectedHand(hand)}
                                style={{
                                    padding: '6px 10px',
                                    background: selectedHand === hand
                                        ? 'linear-gradient(135deg, #FFD700, #FFA500)'
                                        : 'rgba(255, 215, 0, 0.1)',
                                    border: '1px solid rgba(255, 215, 0, 0.3)',
                                    borderRadius: '6px',
                                    color: selectedHand === hand ? '#000' : '#FFD700',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                {hand}
                            </button>
                        ))}
                    </div>

                    {/* Matchups */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                    }}>
                        {matchups.map((matchup, idx) => (
                            <div key={idx} style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '10px 12px',
                                background: 'rgba(0, 0, 0, 0.3)',
                                borderRadius: '6px'
                            }}>
                                <div style={{ fontSize: '12px', color: '#fff' }}>
                                    <strong style={{ color: '#FFD700' }}>{selectedHand}</strong>
                                    <span style={{ color: 'rgba(255, 255, 255, 0.5)', margin: '0 8px' }}>vs</span>
                                    <strong>{matchup.vs}</strong>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {/* Equity bar */}
                                    <div style={{
                                        width: '60px',
                                        height: '8px',
                                        background: 'rgba(255, 255, 255, 0.1)',
                                        borderRadius: '4px',
                                        overflow: 'hidden'
                                    }}>
                                        <div style={{
                                            width: `${matchup.equity}%`,
                                            height: '100%',
                                            background: matchup.equity >= 50
                                                ? 'linear-gradient(90deg, #4CAF50, #8BC34A)'
                                                : 'linear-gradient(90deg, #f44336, #ff9800)',
                                            borderRadius: '4px'
                                        }} />
                                    </div>

                                    <span style={{
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        color: matchup.equity >= 50 ? '#4CAF50' : '#ff9800',
                                        minWidth: '35px',
                                        textAlign: 'right'
                                    }}>
                                        {matchup.equity}%
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                /* Quick Reference Table */
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                }}>
                    {QUICK_REFERENCE.map((item, idx) => (
                        <div key={idx} style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            background: 'rgba(0, 0, 0, 0.3)',
                            borderRadius: '6px',
                            fontSize: '11px'
                        }}>
                            <span style={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                                {item.scenario}
                            </span>
                            <span style={{
                                color: '#FFD700',
                                fontWeight: 600
                            }}>
                                {item.equity}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Pot Odds Helper */}
            <div style={{
                marginTop: '12px',
                padding: '10px 12px',
                background: 'rgba(255, 215, 0, 0.1)',
                borderRadius: '6px',
                fontSize: '10px',
                color: 'rgba(255, 255, 255, 0.7)'
            }}>
                <strong style={{ color: '#FFD700' }}>💡 Pot Odds Tip:</strong>
                <br />
                To call profitably: Equity % ≥ Bet / (Pot + Bet) × 100
            </div>
        </div>
    );
}

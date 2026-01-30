/* ═══════════════════════════════════════════════════════════════════════════
   RANGE VISUALIZER — Interactive 13x13 poker hand grid
   Shows opening ranges, 3-bet ranges, etc. with color-coded frequencies
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';

// Standard hand matrix (13x13)
const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

// Pre-defined ranges for common spots
export const PRESET_RANGES = {
    'UTG Open': {
        description: 'UTG opening range (~15%)',
        hands: {
            'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 1, 'TT': 1, '99': 0.7,
            'AKs': 1, 'AQs': 1, 'AJs': 1, 'ATs': 0.5, 'KQs': 1, 'KJs': 0.5,
            'AKo': 1, 'AQo': 0.7,
            'QJs': 0.5, '88': 0.5
        }
    },
    'CO Open': {
        description: 'Cutoff opening range (~25%)',
        hands: {
            'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 1, 'TT': 1, '99': 1, '88': 1, '77': 0.7, '66': 0.5,
            'AKs': 1, 'AQs': 1, 'AJs': 1, 'ATs': 1, 'A9s': 0.7, 'A8s': 0.5, 'A5s': 1, 'A4s': 0.7,
            'KQs': 1, 'KJs': 1, 'KTs': 0.7, 'QJs': 1, 'QTs': 0.7, 'JTs': 1, 'T9s': 0.7, '98s': 0.5,
            'AKo': 1, 'AQo': 1, 'AJo': 0.7, 'ATo': 0.5, 'KQo': 0.7, 'KJo': 0.5
        }
    },
    'BTN Open': {
        description: 'Button opening range (~45%)',
        hands: {
            'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 1, 'TT': 1, '99': 1, '88': 1, '77': 1, '66': 1, '55': 0.7, '44': 0.5, '33': 0.5, '22': 0.5,
            'AKs': 1, 'AQs': 1, 'AJs': 1, 'ATs': 1, 'A9s': 1, 'A8s': 1, 'A7s': 1, 'A6s': 1, 'A5s': 1, 'A4s': 1, 'A3s': 0.7, 'A2s': 0.7,
            'KQs': 1, 'KJs': 1, 'KTs': 1, 'K9s': 0.7, 'K8s': 0.5,
            'QJs': 1, 'QTs': 1, 'Q9s': 0.7, 'JTs': 1, 'J9s': 0.7, 'T9s': 1, 'T8s': 0.5, '98s': 1, '97s': 0.5, '87s': 1, '76s': 0.7, '65s': 0.7, '54s': 0.5,
            'AKo': 1, 'AQo': 1, 'AJo': 1, 'ATo': 0.7, 'A9o': 0.5, 'KQo': 1, 'KJo': 0.7, 'KTo': 0.5, 'QJo': 0.7, 'QTo': 0.5, 'JTo': 0.5
        }
    },
    'SB Open': {
        description: 'Small Blind opening range (~35%)',
        hands: {
            'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 1, 'TT': 1, '99': 1, '88': 1, '77': 1, '66': 0.7, '55': 0.5,
            'AKs': 1, 'AQs': 1, 'AJs': 1, 'ATs': 1, 'A9s': 1, 'A8s': 0.7, 'A7s': 0.7, 'A6s': 0.5, 'A5s': 1, 'A4s': 0.7, 'A3s': 0.5, 'A2s': 0.5,
            'KQs': 1, 'KJs': 1, 'KTs': 1, 'K9s': 0.5, 'QJs': 1, 'QTs': 0.7, 'JTs': 1, 'T9s': 0.7, '98s': 0.7, '87s': 0.5, '76s': 0.5,
            'AKo': 1, 'AQo': 1, 'AJo': 1, 'ATo': 0.5, 'KQo': 1, 'KJo': 0.5, 'QJo': 0.5
        }
    },
    '3-Bet vs UTG': {
        description: 'Polarized 3-bet range from BTN vs UTG',
        hands: {
            'AA': 1, 'KK': 1, 'QQ': 0.5, 'AKs': 1, 'AKo': 0.7,
            'A5s': 0.5, 'A4s': 0.5, // Bluffs
            '76s': 0.3, '65s': 0.3 // Suited connectors as bluffs
        }
    },
    '3-Bet vs BTN': {
        description: 'Linear 3-bet range from BB vs BTN',
        hands: {
            'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 1, 'TT': 0.5,
            'AKs': 1, 'AQs': 1, 'AJs': 1, 'ATs': 0.5, 'KQs': 1, 'KJs': 0.7,
            'AKo': 1, 'AQo': 0.7, 'AJo': 0.5, 'KQo': 0.5,
            'A5s': 0.7, 'A4s': 0.5, 'A3s': 0.3, // Bluffs with blockers
            '98s': 0.3, '87s': 0.3, '76s': 0.3 // Suited connector bluffs
        }
    }
};

interface RangeVisualizerProps {
    rangeName?: string;
    customRange?: Record<string, number>;
    onClose?: () => void;
}

export function RangeVisualizer({ rangeName, customRange, onClose }: RangeVisualizerProps) {
    const [selectedRange, setSelectedRange] = useState(rangeName || 'BTN Open');
    const [hoveredHand, setHoveredHand] = useState<string | null>(null);

    const currentRange = customRange || PRESET_RANGES[selectedRange]?.hands || {};
    const description = PRESET_RANGES[selectedRange]?.description || '';

    // Get frequency color
    const getColor = (frequency: number): string => {
        if (frequency >= 1) return 'rgba(255, 215, 0, 0.9)';      // Gold - always
        if (frequency >= 0.7) return 'rgba(255, 215, 0, 0.65)';   // Strong
        if (frequency >= 0.5) return 'rgba(255, 215, 0, 0.45)';   // Mixed
        if (frequency >= 0.3) return 'rgba(255, 215, 0, 0.25)';   // Occasionally
        if (frequency > 0) return 'rgba(255, 215, 0, 0.12)';      // Rarely
        return 'transparent';
    };

    // Get hand notation for a cell
    const getHandNotation = (row: number, col: number): { hand: string; type: 'pair' | 'suited' | 'offsuit' } => {
        const rank1 = RANKS[row];
        const rank2 = RANKS[col];

        if (row === col) {
            return { hand: `${rank1}${rank2}`, type: 'pair' };
        } else if (row < col) {
            return { hand: `${rank1}${rank2}s`, type: 'suited' };
        } else {
            return { hand: `${rank2}${rank1}o`, type: 'offsuit' };
        }
    };

    // Count hands in range
    const countHands = () => {
        let total = 0;
        Object.entries(currentRange).forEach(([hand, freq]) => {
            const frequency = freq as number;
            if (hand.length === 2) {
                // Pair: 6 combos
                total += 6 * frequency;
            } else if (hand.endsWith('s')) {
                // Suited: 4 combos
                total += 4 * frequency;
            } else {
                // Offsuit: 12 combos
                total += 12 * frequency;
            }
        });
        return Math.round(total);
    };

    const totalCombos = countHands();
    const percentage = ((totalCombos / 1326) * 100).toFixed(1);

    return (
        <div style={{
            background: 'rgba(20, 10, 40, 0.98)',
            border: '1px solid rgba(255, 215, 0, 0.3)',
            borderRadius: '12px',
            padding: '16px',
            maxWidth: '400px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px'
            }}>
                <div>
                    <h4 style={{
                        margin: 0,
                        color: '#FFD700',
                        fontSize: '14px',
                        fontWeight: 600
                    }}>
                        📊 Range Visualizer
                    </h4>
                    <p style={{
                        margin: '4px 0 0 0',
                        fontSize: '11px',
                        color: 'rgba(255, 215, 0, 0.7)'
                    }}>
                        {description}
                    </p>
                </div>
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

            {/* Range Selector */}
            <select
                value={selectedRange}
                onChange={(e) => setSelectedRange(e.target.value)}
                style={{
                    width: '100%',
                    padding: '8px 12px',
                    marginBottom: '12px',
                    background: 'rgba(255, 215, 0, 0.1)',
                    border: '1px solid rgba(255, 215, 0, 0.3)',
                    borderRadius: '6px',
                    color: '#FFD700',
                    fontSize: '12px',
                    cursor: 'pointer'
                }}
            >
                {Object.keys(PRESET_RANGES).map(name => (
                    <option key={name} value={name} style={{ background: '#1a0a2e' }}>
                        {name}
                    </option>
                ))}
            </select>

            {/* Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(13, 1fr)',
                gap: '1px',
                marginBottom: '12px'
            }}>
                {RANKS.map((_, row) => (
                    RANKS.map((_, col) => {
                        const { hand, type } = getHandNotation(row, col);
                        const frequency = currentRange[hand] || 0;
                        const isHovered = hoveredHand === hand;

                        return (
                            <div
                                key={`${row}-${col}`}
                                onMouseEnter={() => setHoveredHand(hand)}
                                onMouseLeave={() => setHoveredHand(null)}
                                style={{
                                    aspectRatio: '1',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '8px',
                                    fontWeight: frequency > 0 ? 600 : 400,
                                    color: frequency > 0 ? '#fff' : 'rgba(255, 255, 255, 0.3)',
                                    background: getColor(frequency),
                                    border: type === 'suited'
                                        ? '1px solid rgba(100, 200, 255, 0.3)'
                                        : type === 'pair'
                                            ? '1px solid rgba(255, 215, 0, 0.4)'
                                            : '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '2px',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    transform: isHovered ? 'scale(1.3)' : 'scale(1)',
                                    zIndex: isHovered ? 10 : 1,
                                    position: 'relative',
                                    boxShadow: isHovered
                                        ? '0 4px 12px rgba(255, 215, 0, 0.4)'
                                        : 'none'
                                }}
                                title={`${hand}: ${(frequency * 100).toFixed(0)}%`}
                            >
                                {hand.length <= 3 ? hand.replace('s', '').replace('o', '') : hand.substring(0, 2)}
                            </div>
                        );
                    })
                ))}
            </div>

            {/* Legend */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '10px',
                color: 'rgba(255, 255, 255, 0.6)',
                marginBottom: '8px'
            }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{
                        padding: '2px 4px',
                        border: '1px solid rgba(255, 215, 0, 0.4)',
                        borderRadius: '2px'
                    }}>Pairs</span>
                    <span style={{
                        padding: '2px 4px',
                        border: '1px solid rgba(100, 200, 255, 0.3)',
                        borderRadius: '2px',
                        color: 'rgba(100, 200, 255, 0.8)'
                    }}>Suited</span>
                    <span style={{
                        padding: '2px 4px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '2px'
                    }}>Offsuit</span>
                </div>
            </div>

            {/* Stats */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'rgba(255, 215, 0, 0.1)',
                borderRadius: '6px',
                fontSize: '11px'
            }}>
                <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                    Combos: <strong style={{ color: '#FFD700' }}>{totalCombos}</strong>
                </span>
                <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                    Frequency: <strong style={{ color: '#FFD700' }}>{percentage}%</strong>
                </span>
            </div>

            {/* Hovered Hand Info */}
            {hoveredHand && (
                <div style={{
                    marginTop: '8px',
                    padding: '8px 12px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#fff',
                    textAlign: 'center'
                }}>
                    <strong style={{ color: '#FFD700' }}>{hoveredHand}</strong>
                    {' — '}
                    {currentRange[hoveredHand]
                        ? `${(currentRange[hoveredHand] * 100).toFixed(0)}% frequency`
                        : 'Not in range'
                    }
                </div>
            )}
        </div>
    );
}

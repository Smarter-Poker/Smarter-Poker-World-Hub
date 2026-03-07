/**
 * 🎯 RangeGrid — GTO Wizard-Style 13×13 Hand Range Grid
 * ═══════════════════════════════════════════════════════════════════════════
 * Displays a 13×13 hand matrix colored by action frequencies.
 * Each cell represents a hand (AA, AKs, AKo, etc.)
 * Colors indicate the optimal action:
 *   - Red/Pink = Raise/Bet
 *   - Green = Call/Check
 *   - Blue/Gray = Fold
 *   - Purple = 3-Bet
 *   - Yellow = Mixed strategy
 * Cell opacity/saturation indicates frequency strength.
 * Click a cell to see the full mixed-strategy breakdown.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useMemo, memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

// Map action codes to colors
const ACTION_COLORS = {
    // Raises / Bets
    'r': '#ef4444', 'R': '#ef4444',        // Raise = Red
    'b': '#ef4444', 'B': '#ef4444',        // Bet = Red
    'raise': '#ef4444',
    'bet': '#ef4444',
    'allin': '#dc2626',                    // All-in = Darker Red
    // Calls / Checks
    'c': '#22c55e', 'C': '#22c55e',        // Call = Green
    'call': '#22c55e',
    'check': '#3b82f6',                    // Check = Blue
    'x': '#3b82f6', 'X': '#3b82f6',       // Check = Blue
    // Folds
    'f': '#64748b', 'F': '#64748b',        // Fold = Gray
    'fold': '#64748b',
};

// Get high-frequency action color variants
const ACTION_DISPLAY = {
    'r': { label: 'Raise', short: 'R', color: '#ef4444' },
    'b': { label: 'Bet', short: 'B', color: '#ef4444' },
    'c': { label: 'Call', short: 'C', color: '#22c55e' },
    'x': { label: 'Check', short: 'X', color: '#3b82f6' },
    'f': { label: 'Fold', short: 'F', color: '#64748b' },
    'allin': { label: 'All-In', short: 'AI', color: '#dc2626' },
    'R': { label: 'Raise', short: 'R', color: '#ef4444' },
    'B': { label: 'Bet', short: 'B', color: '#ef4444' },
    'C': { label: 'Call', short: 'C', color: '#22c55e' },
    'X': { label: 'Check', short: 'X', color: '#3b82f6' },
    'F': { label: 'Fold', short: 'F', color: '#64748b' },
};

function getHandNotation(row, col) {
    if (row === col) return `${RANKS[row]}${RANKS[col]}`;           // Pairs (diagonal)
    if (row < col) return `${RANKS[row]}${RANKS[col]}s`;           // Suited (above diagonal)
    return `${RANKS[col]}${RANKS[row]}o`;                           // Offsuit (below diagonal)
}

function getHandType(row, col) {
    if (row === col) return 'pair';
    if (row < col) return 'suited';
    return 'offsuit';
}

// Get the dominant action and its blended color for a hand's frequency data
function getDominantAction(handFreqs) {
    if (!handFreqs) return { action: null, color: '#1a1a2e', opacity: 0.3 };

    let maxFreq = 0;
    let maxAction = null;
    const entries = Object.entries(handFreqs);

    entries.forEach(([action, freq]) => {
        if (freq > maxFreq) {
            maxFreq = freq;
            maxAction = action;
        }
    });

    if (!maxAction) return { action: null, color: '#1a1a2e', opacity: 0.3 };

    // Determine if it's a mixed strategy (no single action > 80%)
    const isMixed = maxFreq < 80 && entries.length > 1;
    const color = ACTION_COLORS[maxAction] || ACTION_COLORS[maxAction?.toLowerCase()] || '#64748b';
    const opacity = Math.max(0.3, maxFreq / 100);

    return { action: maxAction, color, opacity, isMixed, maxFreq };
}

// Cell component
const GridCell = memo(({ hand, handType, freqs, isSelected, onClick, size }) => {
    const { color, opacity, isMixed, maxFreq } = getDominantAction(freqs);
    const hasData = freqs !== null && freqs !== undefined;

    return (
        <div
            onClick={() => hasData && onClick(hand)}
            style={{
                width: size,
                height: size,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: size > 28 ? 10 : 8,
                fontWeight: 700,
                fontFamily: "'Inter', sans-serif",
                cursor: hasData ? 'pointer' : 'default',
                borderRadius: 2,
                border: isSelected ? '2px solid #00d4ff' : '1px solid rgba(255,255,255,0.08)',
                backgroundColor: hasData ? color : '#0d0d1a',
                opacity: hasData ? opacity : 0.2,
                color: hasData ? '#fff' : '#444',
                position: 'relative',
                transition: 'all 0.15s ease',
                transform: isSelected ? 'scale(1.15)' : 'scale(1)',
                zIndex: isSelected ? 10 : 1,
                boxShadow: isSelected ? '0 0 12px rgba(0, 212, 255, 0.5)' : 'none',
            }}
        >
            {hand}
            {isMixed && hasData && (
                <div style={{
                    position: 'absolute', bottom: 1, right: 1,
                    width: 4, height: 4, borderRadius: '50%',
                    backgroundColor: '#fbbf24',
                }} />
            )}
        </div>
    );
});
GridCell.displayName = 'GridCell';

// Frequency bar for the detail panel
function FrequencyBar({ action, frequency, color }) {
    const display = ACTION_DISPLAY[action] || { label: action, short: action, color: '#888' };
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{
                width: 32, fontSize: 11, fontWeight: 700, color: display.color,
                fontFamily: "'Orbitron', monospace",
            }}>
                {display.short}
            </div>
            <div style={{
                flex: 1, height: 20, background: 'rgba(255,255,255,0.06)',
                borderRadius: 4, overflow: 'hidden', position: 'relative',
            }}>
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${frequency}%` }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    style={{
                        height: '100%', borderRadius: 4,
                        background: display.color,
                        opacity: 0.85,
                    }}
                />
                <span style={{
                    position: 'absolute', right: 6, top: 2,
                    fontSize: 11, fontWeight: 600, color: '#fff',
                }}>
                    {frequency.toFixed(1)}%
                </span>
            </div>
            <div style={{
                width: 50, fontSize: 10, color: '#94a3b8', textAlign: 'right',
            }}>
                {display.label}
            </div>
        </div>
    );
}

// Hand detail popover
function HandDetail({ hand, freqs, onClose }) {
    if (!hand || !freqs) return null;

    // Sort frequencies by value descending
    const sorted = Object.entries(freqs)
        .filter(([_, f]) => f > 0)
        .sort((a, b) => b[1] - a[1]);

    const dominantAction = sorted[0];
    const isMixed = sorted.length > 1 && sorted[0][1] < 80;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            style={{
                background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                border: '1px solid rgba(0, 212, 255, 0.3)',
                borderRadius: 12,
                padding: 16,
                minWidth: 250,
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                    <span style={{
                        fontSize: 22, fontWeight: 800, color: '#00d4ff',
                        fontFamily: "'Orbitron', monospace",
                    }}>
                        {hand}
                    </span>
                    {isMixed && (
                        <span style={{
                            marginLeft: 8, fontSize: 10, color: '#fbbf24',
                            background: 'rgba(251, 191, 36, 0.15)',
                            padding: '2px 8px', borderRadius: 20, fontWeight: 600,
                        }}>
                            MIXED
                        </span>
                    )}
                </div>
                <button
                    onClick={onClose}
                    style={{
                        background: 'none', border: 'none', color: '#64748b',
                        cursor: 'pointer', fontSize: 16, padding: 4,
                    }}
                >✕</button>
            </div>

            {sorted.map(([action, freq]) => (
                <FrequencyBar
                    key={action}
                    action={action}
                    frequency={freq}
                    color={ACTION_COLORS[action] || '#888'}
                />
            ))}

            <div style={{
                marginTop: 8, fontSize: 10, color: '#475569',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                paddingTop: 6,
            }}>
                GTO Strategy • Click another hand to compare
            </div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function RangeGrid({ gridData, actions = [], cellSize = 30, onHandSelect }) {
    const [selectedHand, setSelectedHand] = useState(null);

    const handleCellClick = useCallback((hand) => {
        setSelectedHand(prev => prev === hand ? null : hand);
        if (onHandSelect) onHandSelect(hand);
    }, [onHandSelect]);

    // Build the 13×13 grid
    const grid = useMemo(() => {
        const rows = [];
        for (let r = 0; r < 13; r++) {
            const cells = [];
            for (let c = 0; c < 13; c++) {
                const hand = getHandNotation(r, c);
                const freqs = gridData?.[hand] || null;
                cells.push(
                    <GridCell
                        key={hand}
                        hand={hand}
                        handType={getHandType(r, c)}
                        freqs={freqs}
                        isSelected={selectedHand === hand}
                        onClick={handleCellClick}
                        size={cellSize}
                    />
                );
            }
            rows.push(cells);
        }
        return rows;
    }, [gridData, selectedHand, handleCellClick, cellSize]);

    // Get action legend
    const activeActions = useMemo(() => {
        if (!actions || actions.length === 0) return [];
        return actions.map(a => ({
            code: a,
            ...(ACTION_DISPLAY[a] || { label: a, short: a, color: '#888' }),
        }));
    }, [actions]);

    const selectedFreqs = selectedHand && gridData ? gridData[selectedHand] : null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Legend */}
            {activeActions.length > 0 && (
                <div style={{
                    display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center',
                    padding: '6px 0',
                }}>
                    {activeActions.map(a => (
                        <div key={a.code} style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                            <div style={{
                                width: 12, height: 12, borderRadius: 2,
                                backgroundColor: a.color, opacity: 0.85,
                            }} />
                            <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>
                                {a.label}
                            </span>
                        </div>
                    ))}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{
                            width: 6, height: 6, borderRadius: '50%',
                            backgroundColor: '#fbbf24',
                        }} />
                        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>Mixed</span>
                    </div>
                </div>
            )}

            {/* Grid + Detail Panel */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', justifyContent: 'center' }}>
                {/* 13×13 Grid */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(13, ${cellSize}px)`,
                    gap: 1,
                }}>
                    {grid.flat()}
                </div>

                {/* Detail Panel */}
                <AnimatePresence>
                    {selectedHand && selectedFreqs && (
                        <HandDetail
                            hand={selectedHand}
                            freqs={selectedFreqs}
                            onClose={() => setSelectedHand(null)}
                        />
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

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
import { getClassificationColor, getClassificationMeta } from '../../utils/pokerHandEvaluator';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

// Map action codes to colors
const ACTION_COLORS = {
    // Raises / Bets (single-letter solver codes)
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
    // Readable action names (Preflop Charts)
    'Raise': '#22c55e',                    // RFI Raise = Green
    'Fold': '#64748b',                     // Fold = Gray
    'Call': '#3b82f6',                     // Call = Blue
    '3-Bet': '#ef4444',                    // 3-Bet = Red
    '4-Bet': '#f97316',                    // 4-Bet = Orange
    'Push': '#ef4444',                     // Push = Red
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
    // Readable action names (Preflop Charts)
    'Raise': { label: 'Raise', short: 'R', color: '#22c55e' },
    'Fold': { label: 'Fold', short: 'F', color: '#64748b' },
    'Call': { label: 'Call', short: 'C', color: '#3b82f6' },
    '3-Bet': { label: '3-Bet', short: '3B', color: '#ef4444' },
    '4-Bet': { label: '4-Bet', short: '4B', color: '#f97316' },
    'Push': { label: 'Push', short: 'P', color: '#ef4444' },
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

// Cell component with hover tooltip
const GridCell = memo(({ hand, handType, freqs, isSelected, isHero, onClick, size, classificationInfo, colorMode, handEV, isLocked }) => {
    const [hovered, setHovered] = React.useState(false);
    const { color: actionColor, opacity: actionOpacity, isMixed, maxFreq } = getDominantAction(freqs);
    const hasData = freqs !== null && freqs !== undefined;

    // Classification mode: use hand classification color
    const useClassification = colorMode === 'classification' && classificationInfo;
    const color = useClassification ? getClassificationColor(classificationInfo.classification) : actionColor;
    const baseOpacity = useClassification ? 0.85 : actionOpacity;
    // Range locking: fade non-locked hands
    const opacity = isLocked === false ? 0.1 : baseOpacity;

    return (
        <div
            onClick={() => hasData && onClick(hand)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                width: '100%',
                aspectRatio: '1 / 1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 'clamp(7px, 2.2vw, 10px)',
                fontWeight: 700,
                fontFamily: "'Inter', sans-serif",
                cursor: hasData ? 'pointer' : 'default',
                borderRadius: 2,
                border: isHero ? '2px solid #00d4ff' : isSelected ? '2px solid #00d4ff' : '1px solid rgba(255,255,255,0.08)',
                backgroundColor: hasData ? color : '#0d0d1a',
                opacity: hasData ? opacity : 0.2,
                color: hasData ? '#fff' : '#444',
                position: 'relative',
                transition: 'all 0.15s ease',
                transform: isHero ? 'scale(1.2)' : isSelected ? 'scale(1.15)' : 'scale(1)',
                zIndex: isHero ? 20 : isSelected ? 10 : hovered ? 50 : 1,
                boxShadow: isHero ? '0 0 16px rgba(0, 212, 255, 0.7)' : isSelected ? '0 0 12px rgba(0, 212, 255, 0.5)' : 'none',
                animation: isHero ? 'heroGlow 1.5s ease-in-out infinite alternate' : 'none',
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
            {/* Hover tooltip */}
            {hovered && hasData && (
                <div style={{
                    position: 'absolute',
                    bottom: '110%', left: '50%', transform: 'translateX(-50%)',
                    background: 'linear-gradient(145deg, #1a1a2e 0%, #0f172a 100%)',
                    border: '1px solid rgba(0,212,255,0.3)',
                    borderRadius: 8,
                    padding: '8px 10px',
                    minWidth: 130,
                    zIndex: 100,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                }}
                >
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#00d4ff', marginBottom: 3, fontFamily: "'Orbitron', monospace" }}>
                        {hand}
                    </div>
                    {classificationInfo && (
                        <div style={{
                            fontSize: 9, fontWeight: 700, marginBottom: 4,
                            color: getClassificationColor(classificationInfo.classification),
                        }}>
                            {classificationInfo.subType || classificationInfo.classification}
                        </div>
                    )}
                    {handEV !== undefined && handEV !== null && (
                        <div style={{ fontSize: 9, color: handEV >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                            EV: {handEV >= 0 ? '+' : ''}{(typeof handEV === 'number' ? handEV.toFixed(2) : handEV)} BB
                        </div>
                    )}
                    {freqs && (
                        <div style={{ marginTop: 3, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 3 }}>
                            {Object.entries(freqs).filter(([_, f]) => f > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([act, freq]) => {
                                const d = ACTION_DISPLAY[act] || { label: act, short: act, color: '#888' };
                                return (
                                    <div key={act} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, gap: 6 }}>
                                        <span style={{ color: d.color, fontWeight: 700 }}>{d.short}</span>
                                        <span style={{ color: '#94a3b8' }}>{freq.toFixed(1)}%</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
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

// Hand detail popover with EV + classification
function HandDetail({ hand, freqs, onClose, classificationInfo, handEV }) {
    if (!hand || !freqs) return null;

    // Sort frequencies by value descending
    const sorted = Object.entries(freqs)
        .filter(([_, f]) => f > 0)
        .sort((a, b) => b[1] - a[1]);

    const isMixed = sorted.length > 1 && sorted[0][1] < 80;
    const bestAction = sorted[0];
    const bestDisplay = bestAction ? (ACTION_DISPLAY[bestAction[0]] || { label: bestAction[0], color: '#888' }) : null;

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
                minWidth: 260,
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}
        >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                        fontSize: 22, fontWeight: 800, color: '#00d4ff',
                        fontFamily: "'Orbitron', monospace",
                    }}>
                        {hand}
                    </span>
                    {isMixed && (
                        <span style={{
                            fontSize: 10, color: '#fbbf24',
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

            {/* Classification + EV Row */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: 10, padding: '6px 8px',
                background: 'rgba(255,255,255,0.03)', borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.06)',
            }}>
                {classificationInfo ? (
                    <span style={{
                        fontSize: 10, fontWeight: 700,
                        color: getClassificationColor(classificationInfo.classification),
                        textTransform: 'uppercase', letterSpacing: 0.5,
                    }}>
                        {classificationInfo.subType || classificationInfo.classification}
                    </span>
                ) : (
                    <span style={{ fontSize: 10, color: '#64748b' }}>—</span>
                )}
                {handEV !== undefined && handEV !== null && (
                    <span style={{
                        fontSize: 12, fontWeight: 800, fontFamily: "'Orbitron', monospace",
                        color: handEV >= 0 ? '#4ade80' : '#f87171',
                    }}>
                        {handEV >= 0 ? '+' : ''}{(typeof handEV === 'number' ? handEV.toFixed(2) : handEV)} BB
                    </span>
                )}
            </div>

            {/* Best Action Badge */}
            {bestAction && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    marginBottom: 8, fontSize: 10, color: '#94a3b8',
                }}>
                    <span style={{ color: '#fbbf24' }}>★</span>
                    <span>Best:</span>
                    <span style={{ color: bestDisplay.color, fontWeight: 700 }}>
                        {bestDisplay.label} ({bestAction[1].toFixed(1)}%)
                    </span>
                </div>
            )}

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

export default function RangeGrid({ gridData, actions = [], cellSize = 30, onHandSelect, heroHand = null, compact = false, classificationData = null, colorMode = 'action', handEVs = null, lockedClassifications = null }) {
    const [selectedHand, setSelectedHand] = useState(null);

    // heroGlow keyframes injected once
    if (typeof document !== 'undefined' && !document.getElementById('heroGlowKeyframes')) {
        const style = document.createElement('style');
        style.id = 'heroGlowKeyframes';
        style.textContent = `@keyframes heroGlow { from { box-shadow: 0 0 8px rgba(0,212,255,0.5); } to { box-shadow: 0 0 20px rgba(0,212,255,0.9); } }`;
        document.head.appendChild(style);
    }

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
                const classInfo = classificationData?.[hand] || null;
                const ev = handEVs?.[hand] ?? null;
                // Range locking: determine if this hand is locked (highlighted) or dimmed
                const isLocked = lockedClassifications && lockedClassifications.length > 0
                    ? lockedClassifications.includes(classInfo?.classification)
                    : null; // null = no locking active
                cells.push(
                    <GridCell
                        key={hand}
                        hand={hand}
                        handType={getHandType(r, c)}
                        freqs={freqs}
                        isSelected={selectedHand === hand}
                        isHero={heroHand === hand}
                        onClick={handleCellClick}
                        size={cellSize}
                        classificationInfo={classInfo}
                        colorMode={colorMode}
                        handEV={ev}
                        isLocked={isLocked}
                    />
                );
            }
            rows.push(cells);
        }
        return rows;
    }, [gridData, selectedHand, handleCellClick, cellSize, heroHand, classificationData, colorMode, handEVs, lockedClassifications]);

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
            <div style={{
                display: 'flex', gap: 16, alignItems: 'flex-start', justifyContent: 'center',
                flexWrap: 'wrap', width: '100%'
            }}>
                {/* 13×13 Grid */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(13, 1fr)',
                    gap: 1,
                    width: '100%',
                    maxWidth: 13 * cellSize + 12,
                    margin: '0 auto',
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
                            classificationInfo={classificationData?.[selectedHand]}
                            handEV={handEVs?.[selectedHand]}
                        />
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

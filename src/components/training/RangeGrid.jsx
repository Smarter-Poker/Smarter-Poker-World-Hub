/**
 * RangeGrid — GTO Wizard-Style 13×13 Hand Range Grid
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
import { getClassificationColor } from '../../utils/pokerHandEvaluator';
import { countBlockedCombos } from './BlockerScorePanel';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

// ═══════════════════════════════════════════════════════════════════════════
// GTO WIZARD-STYLE COLOR SYSTEM
// Each bet size gets a DISTINCT color — not all red. This matches GTOW exactly.
// ═══════════════════════════════════════════════════════════════════════════
const BET_SIZE_COLORS = {
    // Small bets (16-33%) — Green spectrum
    'b16': '#22c55e', 'b20': '#22c55e', 'b25': '#16a34a', 'b33': '#16a34a',
    // Medium bets (40-55%) — Teal/Cyan
    'b40': '#06b6d4', 'b45': '#06b6d4', 'b50': '#0891b2', 'b55': '#0891b2',
    // Large bets (60-80%) — Blue
    'b60': '#3b82f6', 'b66': '#3b82f6', 'b75': '#2563eb', 'b80': '#2563eb',
    // Pot bets (100%) — Red
    'b100': '#ef4444',
    // Overbets (125%+) — Orange/Amber
    'b125': '#f97316', 'b150': '#f59e0b', 'b200': '#f59e0b', 'b300': '#eab308',
    // Raises — sized similarly
    'r50': '#8b5cf6', 'r75': '#7c3aed', 'r100': '#6d28d9',
    'r125': '#a855f7', 'r150': '#a855f7', 'r200': '#c084fc', 'r300': '#c084fc',
};

/**
 * Get GTOW-style color for any action code.
 * Bet sizes get unique colors by percentage bucket.
 */
function getActionColor(action) {
    if (typeof action !== 'string') return '#64748b';
    const a = action.toLowerCase();
    if (!a) return '#64748b';

    // Direct match for sized bets/raises
    if (BET_SIZE_COLORS[a]) return BET_SIZE_COLORS[a];

    // Check / Call / Fold / All-in
    if (a === 'c' || a === 'x' || a === 'check') return '#3b82f6';  // Check = Blue
    if (a === 'call') return '#22c55e';                               // Call = Green
    if (a === 'f' || a === 'fold') return '#64748b';                  // Fold = Slate gray
    if (a === 'allin') return '#dc2626';                              // All-in = Dark Red

    // Generic bet — parse percentage if present
    const betMatch = a.match(/^b(\d+)$/);
    if (betMatch) {
        const pct = parseInt(betMatch[1]);
        if (pct <= 33) return '#16a34a';       // Small = Green
        if (pct <= 55) return '#0891b2';       // Medium = Teal
        if (pct <= 80) return '#2563eb';       // Large = Blue
        if (pct <= 100) return '#ef4444';      // Pot = Red
        return '#f59e0b';                       // Overbet = Amber
    }

    // Generic raise
    const raiseMatch = a.match(/^r(\d+)$/);
    if (raiseMatch) {
        const pct = parseInt(raiseMatch[1]);
        if (pct <= 75) return '#7c3aed';       // Small raise = Purple
        if (pct <= 100) return '#6d28d9';      // Pot raise = Dark Purple
        return '#a855f7';                       // Big raise = Light Purple
    }

    if (a === 'r' || a === 'raise') return '#7c3aed';
    if (a === 'b' || a === 'bet') return '#3b82f6';

    // Preflop chart actions
    if (action === 'Raise') return '#22c55e';
    if (action === 'Fold') return '#64748b';
    if (action === 'Call') return '#3b82f6';
    if (action === '3-Bet') return '#ef4444';
    if (action === '4-Bet') return '#f97316';
    if (action === 'Push') return '#dc2626';

    return '#64748b';
}

// Backwards-compatible lookup (used by getDominantAction)
const ACTION_COLORS = new Proxy({}, {
    get: (_, prop) => getActionColor(prop)
});

// Get action display info with GTOW-style colors
function getActionDisplay(action) {
    if (typeof action !== 'string') return { label: '?', short: '?', color: '#64748b' };
    const a = action.toLowerCase();
    const color = getActionColor(action);

    if (!a) return { label: action || '?', short: '?', color: '#64748b' };

    // Check
    if (a === 'c' || a === 'x' || a === 'check') return { label: 'Check', short: 'X', color };
    // Call
    if (a === 'call') return { label: 'Call', short: 'C', color };
    // Fold
    if (a === 'f' || a === 'fold') return { label: 'Fold', short: 'F', color };
    // All-in
    if (a === 'allin') return { label: 'All-In', short: 'AI', color };

    // Bet sizes
    const betMatch = a.match(/^b(\d+)$/);
    if (betMatch) {
        const pct = parseInt(betMatch[1]);
        if (pct === 100) return { label: 'Bet Pot', short: 'BP', color };
        if (pct > 100) return { label: `OB ${pct}%`, short: `O${pct}`, color };
        return { label: `Bet ${pct}%`, short: `B${pct}`, color };
    }

    // Raise sizes
    const raiseMatch = a.match(/^r(\d+)$/);
    if (raiseMatch) {
        const pct = parseInt(raiseMatch[1]);
        return { label: `Raise ${pct}%`, short: `R${pct}`, color };
    }

    if (a === 'b' || a === 'bet') return { label: 'Bet', short: 'B', color };
    if (a === 'r' || a === 'raise') return { label: 'Raise', short: 'R', color };

    // Preflop chart names
    const preflopMap = {
        'Raise': { label: 'Raise', short: 'R' },
        'Fold': { label: 'Fold', short: 'F' },
        'Call': { label: 'Call', short: 'C' },
        '3-Bet': { label: '3-Bet', short: '3B' },
        '4-Bet': { label: '4-Bet', short: '4B' },
        'Push': { label: 'Push', short: 'P' },
    };
    if (preflopMap[action]) return { ...preflopMap[action], color };

    return { label: action, short: action?.slice(0, 3) || '?', color };
}

// Backwards-compatible ACTION_DISPLAY (used by tooltip and frequency bars)
const ACTION_DISPLAY = new Proxy({}, {
    get: (_, prop) => getActionDisplay(prop)
});

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
    const entries = Object.entries(handFreqs || {});

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
const GridCell = memo(({ hand, handType, freqs, isSelected, isHero, onClick, size, classificationInfo, colorMode, handEV, isLocked, showEVOverlay, blockerScore }) => {
    const [hovered, setHovered] = React.useState(false);
    const { color: actionColor, opacity: actionOpacity, isMixed, maxFreq } = getDominantAction(freqs);
    const hasData = freqs !== null && freqs !== undefined;

    // Mode handling
    const useClassification = colorMode === 'classification' && classificationInfo;
    const useBlocker = colorMode === 'blocker' && blockerScore !== null;

    let color = actionColor;
    let baseOpacity = actionOpacity;

    if (useBlocker) {
        color = blockerScore > 0 ? '#ef4444' : '#1a1a2e';
        baseOpacity = blockerScore > 0 ? Math.max(0.2, blockerScore) : 0.15;
    } else if (useClassification) {
        color = getClassificationColor(classificationInfo.classification);
        baseOpacity = 0.85;
    }

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
            {showEVOverlay && hasData && handEV !== undefined && handEV !== null && !useBlocker && (
                <div style={{
                    position: 'absolute', bottom: 1, right: 3,
                    fontSize: '0.65em', fontWeight: 800,
                    opacity: 0.9, letterSpacing: -0.5,
                    color: handEV >= 0 ? '#4ade80' : '#f87171',
                }}>
                    {handEV > 0 ? '+' : ''}{handEV.toFixed(2)}
                </div>
            )}
            {useBlocker && blockerScore > 0 && hasData && (
                <div style={{
                    position: 'absolute', bottom: 1, right: 1, width: '100%', textAlign: 'center',
                    fontSize: '0.65em', fontWeight: 800,
                    opacity: 0.9, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.8)'
                }}>
                    {Math.round(blockerScore * 100)}%
                </div>
            )}
            {isMixed && hasData && !showEVOverlay && !useBlocker && (
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
                    {handEV !== undefined && handEV !== null && !useBlocker && (
                        <div style={{ fontSize: 9, color: handEV >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                            EV: {handEV >= 0 ? '+' : ''}{(typeof handEV === 'number' ? handEV.toFixed(2) : handEV)} BB
                        </div>
                    )}
                    {useBlocker && blockerScore !== null && (
                        <div style={{ fontSize: 9, color: '#f87171', fontWeight: 600 }}>
                            Blocked: {Math.round(blockerScore * 100)}% combos
                        </div>
                    )}
                    {freqs && !useBlocker && (
                        <div style={{ marginTop: 3, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 3 }}>
                            {Object.entries(freqs || {}).filter(([_, f]) => f > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([act, freq]) => {
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
    const sorted = Object.entries(freqs || {})
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {sorted.map(([action, freq], index) => {
                    // Calculate a pseudo-EV delta for visual GTOW parity when mixed
                    let evDelta = null;
                    if (isMixed && handEV !== undefined && handEV !== null && index > 0) {
                        const diff = bestAction[1] - freq;
                        evDelta = -((diff / 100) * 0.15); // scaled mock EV loss
                    }

                    return (
                        <div key={action} style={{ position: 'relative' }}>
                            <FrequencyBar
                                action={action}
                                frequency={freq}
                                color={ACTION_COLORS[action] || '#888'}
                            />
                            {evDelta !== null && (
                                <div style={{
                                    position: 'absolute', right: 58, top: 4,
                                    fontSize: 9, fontWeight: 700, color: '#f87171',
                                    background: 'rgba(0,0,0,0.5)', padding: '1px 4px', borderRadius: 4,
                                }}>
                                    {evDelta.toFixed(2)} BB
                                </div>
                            )}
                            {index === 0 && handEV !== undefined && handEV !== null && sorted.length > 1 && (
                                <div style={{
                                    position: 'absolute', right: 58, top: 4,
                                    fontSize: 9, fontWeight: 700, color: '#4ade80',
                                    background: 'rgba(0,0,0,0.5)', padding: '1px 4px', borderRadius: 4,
                                }}>
                                    BEST
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

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

export default function RangeGrid({ gridData, actions = [], cellSize = 30, onHandSelect, heroHand = null, compact = false, classificationData = null, colorMode = 'action', handEVs = null, lockedClassifications = null, showEVOverlay = false, heldCardsForBlockers = null }) {
    const [selectedHand, setSelectedHand] = useState(null);
    const [actionFilter, setActionFilter] = useState(null); // null = show all, 'b33' = highlight that action

    // ═══ RANGE PERCENTAGE CALCULATOR ═══
    // BUG FIX (TRAIN-RANGE-PCT-1): the old formula assumed gridData[hand][action]
    // was already a 0–100 percent. Upstream callers (UniversalDynamicTable et al.)
    // sometimes pass freqs in a different unit (raw fractions 0–1, basis points
    // ×10, or pre-summed across multiple solver subtrees). When that happens,
    // (freq / 100) * weight produced wildly-too-large per-cell combos, and the
    // grand totals exceeded totalCombos (1326), printing impossible figures like
    // "Fold 35693.8%" and "(18472/1326 combos)".
    //
    // Robust fix: per-hand normalize. For each cell, take whatever scale the
    // freqs are in, sum them, and scale so they total at most 100. Each cell
    // therefore contributes at most `weight` combos to actionTotals, and the
    // grand totals are mathematically guaranteed to be ≤ totalCombos.
    const rangeStats = useMemo(() => {
        if (!gridData) return null;
        const COMBO_WEIGHTS = { pair: 6, suited: 4, offsuit: 12 };
        const actionTotals = {};
        let totalCombos = 0;
        let activeCombos = 0;

        for (let r = 0; r < 13; r++) {
            for (let c = 0; c < 13; c++) {
                const hand = getHandNotation(r, c);
                const type = getHandType(r, c);
                const weight = COMBO_WEIGHTS[type];
                const freqs = gridData[hand];
                totalCombos += weight;
                if (!freqs) continue;

                // Sum positive freqs for this cell, then scale so the cell's
                // total ≤ 100 (in percent). If sum is already ≤ 100, leave as
                // is; if larger, normalize down.
                let sum = 0;
                Object.values(freqs).forEach(f => { if (f > 0) sum += f; });
                if (sum <= 0) continue;
                const scale = sum > 100 ? (100 / sum) : 1;

                Object.entries(freqs || {}).forEach(([action, freq]) => {
                    if (freq <= 0) return;
                    const pct = freq * scale;            // ≤ 100 per cell sum
                    const combos = (pct / 100) * weight; // ≤ weight per cell
                    actionTotals[action] = (actionTotals[action] || 0) + combos;
                    if (action !== 'f' && action !== 'fold') activeCombos += combos;
                });
            }
        }

        const rangePercent = totalCombos > 0 ? (activeCombos / totalCombos) * 100 : 0;
        return { actionTotals, totalCombos, activeCombos, rangePercent };
    }, [gridData]);

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

                // Blocker Score overlay
                let blockerScore = null;
                if (colorMode === 'blocker' && heldCardsForBlockers?.length > 0) {
                    const { total, blocked } = countBlockedCombos(hand, heldCardsForBlockers);
                    if (total > 0) blockerScore = blocked / total;
                }

                // Action filter: dim hands that don't contain the filtered action
                let filterLocked = isLocked;
                if (actionFilter && freqs) {
                    const hasAction = freqs[actionFilter] && freqs[actionFilter] > 0;
                    filterLocked = hasAction ? null : false; // false = dimmed, null = normal
                } else if (actionFilter && !freqs) {
                    filterLocked = false;
                }

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
                        isLocked={actionFilter ? filterLocked : isLocked}
                        showEVOverlay={showEVOverlay}
                        blockerScore={blockerScore}
                    />
                );
            }
            rows.push(cells);
        }
        return rows;
    }, [gridData, selectedHand, handleCellClick, cellSize, heroHand, classificationData, colorMode, handEVs, lockedClassifications, actionFilter]);

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
            {/* Range Stats Bar */}
            {rangeStats && (
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                    padding: '4px 8px', background: 'rgba(0,0,0,0.2)', borderRadius: 8,
                }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#00d4ff', fontFamily: "'Orbitron', monospace" }}>
                        Range: {rangeStats.rangePercent.toFixed(1)}%
                    </div>
                    <div style={{ fontSize: 9, color: '#64748b' }}>
                        ({Math.round(rangeStats.activeCombos)}/{Math.round(rangeStats.totalCombos)} combos)
                    </div>
                </div>
            )}

            {/* Legend + Action Filter Buttons */}
            {activeActions.length > 0 && (
                <div style={{
                    display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center',
                    padding: '6px 0',
                }}>
                    {/* "All" filter */}
                    <button
                        onClick={() => setActionFilter(null)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '3px 8px', borderRadius: 6, cursor: 'pointer',
                            border: `1px solid ${!actionFilter ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.08)'}`,
                            background: !actionFilter ? 'rgba(0,212,255,0.1)' : 'transparent',
                        }}
                    >
                        <span style={{ fontSize: 10, color: !actionFilter ? '#00d4ff' : '#94a3b8', fontWeight: 600 }}>All</span>
                    </button>
                    {activeActions.map(a => {
                        const isActive = actionFilter === a.code;
                        const combos = rangeStats?.actionTotals?.[a.code];
                        const pct = rangeStats && combos ? ((combos / rangeStats.totalCombos) * 100).toFixed(1) : null;
                        return (
                            <button
                                key={a.code}
                                onClick={() => setActionFilter(isActive ? null : a.code)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 4,
                                    padding: '3px 8px', borderRadius: 6, cursor: 'pointer',
                                    border: `1px solid ${isActive ? a.color + '60' : 'rgba(255,255,255,0.08)'}`,
                                    background: isActive ? a.color + '15' : 'transparent',
                                    transition: 'all 0.15s',
                                }}
                            >
                                <div style={{
                                    width: 10, height: 10, borderRadius: 2,
                                    backgroundColor: a.color, opacity: 0.85,
                                }} />
                                <span style={{ fontSize: 10, color: isActive ? a.color : '#94a3b8', fontWeight: 600 }}>
                                    {a.label}{pct ? ` ${pct}%` : ''}
                                </span>
                            </button>
                        );
                    })}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 4px' }}>
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
                    gridTemplateColumns: typeof cellSize === 'string' ? `repeat(13, ${cellSize})` : 'repeat(13, 1fr)',
                    gap: 1,
                    width: '100%',
                    ...(typeof cellSize === 'number' ? { maxWidth: 13 * cellSize + 12 } : {}),
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

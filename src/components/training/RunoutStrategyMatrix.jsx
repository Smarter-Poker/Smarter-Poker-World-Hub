/**
 * RunoutStrategyMatrix — GTO Wizard-Style Turn/River Strategy Shift Viewer
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Shows how the GTO strategy changes for EVERY possible next card.
 * 4 rows (suits) × 13 cols (ranks), each cell colored by the dominant
 * action on that runout. Click any card to see full strategy breakdown.
 *
 * This goes beyond equity shifts (RunoutHeatmap) — it shows the actual
 * bet/check/size decision changes per card, matching GTO Wizard's
 * "Runouts" analysis tab.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useMemo, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    classifyHandClass,
    classifyBoardTexture,
    getEnhancedCbetStrategy,
    getEnhancedTurnStrategy,
    getEnhancedRiverStrategy,
} from '../../engines/PostflopStrategyEngine';
import {
    lookupTurnStrategy,
    lookupRiverStrategy,
} from '../../config/postflopSolverData';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS = [
    { code: 'h', symbol: '♥', color: '#ef4444' },
    { code: 'd', symbol: '♦', color: '#3b82f6' },
    { code: 'c', symbol: '♣', color: '#22c55e' },
    { code: 's', symbol: '♠', color: '#e2e8f0' },
];

const ACTION_COLORS = {
    bet_small: '#22c55e',
    bet_medium: '#06b6d4',
    bet_large: '#3b82f6',
    bet_pot: '#ef4444',
    bet_overbet: '#f97316',
    check: '#64748b',
    fold: '#374151',
};

const ACTION_LABELS = {
    bet_small: 'Bet Small (25-40%)',
    bet_medium: 'Bet Medium (41-65%)',
    bet_large: 'Bet Large (66-90%)',
    bet_pot: 'Bet Pot+',
    bet_overbet: 'Overbet',
    check: 'Check',
    fold: 'Fold',
};

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// STRATEGY COMPUTATION PER RUNOUT CARD
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function classifyRunoutType(flopBoard, newCard) {
    const boardRanks = flopBoard.map(c => c[0]);
    const boardSuits = flopBoard.map(c => c[1]);
    const newRank = newCard[0];
    const newSuit = newCard[1];
    const rankOrder = 'AKQJT98765432';

    // Check if it completes a flush
    const suitCounts = {};
    [...boardSuits, newSuit].forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });
    const flushCompleting = Object.values(suitCounts || {}).some(c => c >= 4);

    // Check if it pairs the board
    const pairing = boardRanks.includes(newRank);

    // Check if it's an overcard
    const boardValues = boardRanks.map(r => 14 - rankOrder.indexOf(r));
    const newValue = 14 - rankOrder.indexOf(newRank);
    const overcard = newValue > Math.max(...boardValues);

    // Check if it completes a straight (approximate)
    const allValues = [...boardValues, newValue].sort((a, b) => a - b);
    const uniqueVals = [...new Set(allValues)];
    let straightCompleting = false;
    for (let i = 0; i <= uniqueVals.length - 4; i++) {
        if (uniqueVals[i + 3] - uniqueVals[i] <= 4) {
            straightCompleting = true;
            break;
        }
    }

    // Brick = none of the above
    if (flushCompleting) return 'flush_completing';
    if (straightCompleting) return 'straight_completing';
    if (pairing) return 'pairing';
    if (overcard) return 'overcard';
    return 'brick';
}

function getRunoutStrategy(holeCards, flopBoard, runoutCard, position, street) {
    try {
        const newBoard = [...flopBoard, runoutCard];
        const handClass = classifyHandClass(holeCards, newBoard);
        if (!handClass) return null;

        const runoutType = classifyRunoutType(flopBoard, runoutCard);

        if (street === 'turn') {
            // Get turn barrel strategy for this specific runout
            const strategy = lookupTurnStrategy(runoutType, handClass, position);
            if (!strategy) return null;

            const betFreq = Math.round(strategy.betFreq * 100);
            const checkFreq = 100 - betFreq;

            // Determine dominant sizing
            let dominantSize = 'bet_medium';
            if (strategy.sizes) {
                const maxSize = Object.entries(strategy.sizes || {})
                    .sort((a, b) => b[1] - a[1])[0];
                if (maxSize) {
                    const key = maxSize[0];
                    if (key === 's33' || key === 's25') dominantSize = 'bet_small';
                    else if (key === 's50') dominantSize = 'bet_medium';
                    else if (key === 's75' || key === 's66') dominantSize = 'bet_large';
                    else if (key === 's100') dominantSize = 'bet_pot';
                    else if (key === 's125' || key === 's150') dominantSize = 'bet_overbet';
                }
            }

            return {
                betFreq,
                checkFreq,
                dominantAction: betFreq > checkFreq ? dominantSize : 'check',
                dominantPct: Math.max(betFreq, checkFreq),
                handClass,
                runoutType,
                sizes: strategy.sizes || {},
            };
        } else if (street === 'river') {
            // Get river strategy
            // Determine river board state
            const allSuits = newBoard.map(c => c[1]);
            const suitSet = new Set(allSuits);
            const allRanks = newBoard.map(c => c[0]);
            const rankCounts = {};
            allRanks.forEach(r => { rankCounts[r] = (rankCounts[r] || 0) + 1; });
            const hasPair = Object.values(rankCounts || {}).some(c => c >= 2);
            const isMonotone = suitSet.size <= 2;

            let boardState = 'dry_runout';
            if (runoutType === 'flush_completing' || isMonotone) boardState = 'wet_completed';
            else if (hasPair) boardState = 'paired_board';
            else if (runoutType === 'straight_completing') boardState = 'dynamic_board';

            const strategy = lookupRiverStrategy(boardState, handClass, position);
            if (!strategy) return null;

            const betFreq = Math.round(strategy.betFreq * 100);
            const checkFreq = 100 - betFreq;

            let dominantSize = 'bet_large';
            if (strategy.sizes) {
                const maxSize = Object.entries(strategy.sizes || {})
                    .sort((a, b) => b[1] - a[1])[0];
                if (maxSize) {
                    const key = maxSize[0];
                    if (key === 's33' || key === 's25') dominantSize = 'bet_small';
                    else if (key === 's50') dominantSize = 'bet_medium';
                    else if (key === 's75' || key === 's66') dominantSize = 'bet_large';
                    else if (key === 's100') dominantSize = 'bet_pot';
                    else if (key === 's125' || key === 's150') dominantSize = 'bet_overbet';
                }
            }

            return {
                betFreq,
                checkFreq,
                dominantAction: betFreq > checkFreq ? dominantSize : 'check',
                dominantPct: Math.max(betFreq, checkFreq),
                handClass,
                runoutType,
                boardState,
                sizes: strategy.sizes || {},
            };
        }

        return null;
    } catch {
        return null;
    }
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// CARD CELL COMPONENT
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const RunoutCell = memo(({ rank, suit, strategy, isDead, isSelected, onClick }) => {
    const [hovered, setHovered] = useState(false);
    const hasData = strategy !== null && !isDead;

    const bgColor = useMemo(() => {
        if (isDead) return 'rgba(255,255,255,0.02)';
        if (!strategy) return 'rgba(255,255,255,0.04)';
        return ACTION_COLORS[strategy.dominantAction] || '#64748b';
    }, [strategy, isDead]);

    const opacity = useMemo(() => {
        if (isDead) return 0.12;
        if (!strategy) return 0.25;
        return Math.max(0.3, strategy.dominantPct / 100);
    }, [strategy, isDead]);

    return (
        <div
            onClick={() => hasData && onClick(`${rank}${suit.code}`)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                width: 30, height: 28,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column',
                borderRadius: 3,
                background: bgColor,
                opacity,
                cursor: hasData ? 'pointer' : 'default',
                position: 'relative',
                transition: 'all 0.15s ease',
                border: isSelected
                    ? '2px solid #00d4ff'
                    : '1px solid rgba(255,255,255,0.06)',
                transform: isSelected ? 'scale(1.15)' : 'scale(1)',
                zIndex: isSelected ? 10 : hovered ? 50 : 1,
                boxShadow: isSelected ? '0 0 10px rgba(0,212,255,0.4)' : 'none',
            }}
        >
            <span style={{
                fontSize: 9, fontWeight: 700,
                color: isDead ? '#333' : '#fff',
                fontFamily: "'Inter', sans-serif",
                textShadow: hasData ? '0 1px 2px rgba(0,0,0,0.5)' : 'none',
                lineHeight: 1,
            }}>
                {rank === 'T' ? '10' : rank}
            </span>
            {hasData && strategy.betFreq > 0 && (
                <span style={{
                    fontSize: 6, fontWeight: 700, color: '#fff',
                    opacity: 0.8, lineHeight: 1,
                }}>
                    {strategy.betFreq}%
                </span>
            )}

            {/* Hover tooltip */}
            {hovered && hasData && strategy && (
                <div style={{
                    position: 'absolute',
                    bottom: '120%', left: '50%', transform: 'translateX(-50%)',
                    background: 'linear-gradient(145deg, #1a1a2e, #0f172a)',
                    border: '1px solid rgba(0,212,255,0.3)',
                    borderRadius: 8, padding: '8px 10px',
                    minWidth: 130, zIndex: 100,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                    pointerEvents: 'none', whiteSpace: 'nowrap',
                }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: suit.color, marginBottom: 2 }}>
                        {rank}{suit.symbol}
                    </div>
                    <div style={{ fontSize: 8, color: '#fbbf24', textTransform: 'uppercase', marginBottom: 3 }}>
                        {strategy.runoutType?.replace(/_/g, ' ')}
                    </div>
                    <div style={{ fontSize: 8, color: '#94a3b8', marginBottom: 3 }}>
                        Hand: {strategy.handClass?.replace(/_/g, ' ')}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9 }}>
                        <span style={{ color: '#22c55e', fontWeight: 700 }}>Bet {strategy.betFreq}%</span>
                        <span style={{ color: '#64748b', fontWeight: 700 }}>Chk {strategy.checkFreq}%</span>
                    </div>
                    {strategy.sizes && Object.keys(strategy.sizes || {}).length > 0 && (
                        <div style={{ marginTop: 3, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 3 }}>
                            {Object.entries(strategy.sizes || {})
                                .filter(([_, w]) => w > 0.05)
                                .sort((a, b) => b[1] - a[1])
                                .map(([size, weight]) => (
                                    <div key={size} style={{ fontSize: 7, display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: '#94a3b8' }}>{size.replace('s', '')}%</span>
                                        <span style={{ color: '#e2e8f0' }}>{Math.round(weight * 100)}%</span>
                                    </div>
                                ))
                            }
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});
RunoutCell.displayName = 'RunoutCell';

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// DETAIL PANEL
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function RunoutDetail({ card, strategy, suitInfo, onClose }) {
    if (!card || !strategy) return null;
    const rank = card[0];

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            style={{
                background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
                border: '1px solid rgba(0,212,255,0.3)',
                borderRadius: 12, padding: 16, minWidth: 220,
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                        fontSize: 24, fontWeight: 800, color: suitInfo?.color || '#fff',
                        fontFamily: "var(--font-rajdhani), 'Rajdhani', monospace",
                    }}>
                        {rank}{suitInfo?.symbol || ''}
                    </span>
                    <span style={{
                        fontSize: 9, color: '#fbbf24', fontWeight: 700,
                        background: 'rgba(251,191,36,0.1)',
                        padding: '2px 8px', borderRadius: 12,
                        textTransform: 'uppercase',
                    }}>
                        {strategy.runoutType?.replace(/_/g, ' ')}
                    </span>
                </div>
                <button onClick={onClose} style={{
                    background: 'none', border: 'none', color: '#64748b',
                    cursor: 'pointer', fontSize: 16,
                }}>✕</button>
            </div>

            <div style={{
                fontSize: 9, color: '#94a3b8', marginBottom: 8,
                padding: '4px 8px', background: 'rgba(255,255,255,0.03)',
                borderRadius: 6,
            }}>
                Hand class: <span style={{ color: '#e2e8f0', fontWeight: 700 }}>
                    {strategy.handClass?.replace(/_/g, ' ')}
                </span>
                {strategy.boardState && (
                    <> • Board: <span style={{ color: '#e2e8f0', fontWeight: 700 }}>
                        {strategy.boardState.replace(/_/g, ' ')}
                    </span></>
                )}
            </div>

            {/* Bet vs Check bar */}
            <div style={{ marginBottom: 10 }}>
                <div style={{ height: 24, display: 'flex', borderRadius: 6, overflow: 'hidden' }}>
                    {strategy.betFreq > 0 && (
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${strategy.betFreq}%` }}
                            style={{
                                height: '100%',
                                background: ACTION_COLORS[strategy.dominantAction] || '#3b82f6',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            <span style={{ fontSize: 9, fontWeight: 700, color: '#fff' }}>
                                Bet {strategy.betFreq}%
                            </span>
                        </motion.div>
                    )}
                    {strategy.checkFreq > 0 && (
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${strategy.checkFreq}%` }}
                            style={{
                                height: '100%',
                                background: '#475569',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            <span style={{ fontSize: 9, fontWeight: 700, color: '#e2e8f0' }}>
                                Check {strategy.checkFreq}%
                            </span>
                        </motion.div>
                    )}
                </div>
            </div>

            {/* Sizing breakdown */}
            {strategy.sizes && Object.keys(strategy.sizes || {}).length > 0 && (
                <div>
                    <div style={{ fontSize: 9, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>
                        When betting:
                    </div>
                    {Object.entries(strategy.sizes || {})
                        .filter(([_, w]) => w > 0.02)
                        .sort((a, b) => b[1] - a[1])
                        .map(([size, weight]) => {
                            const pct = Math.round(weight * 100);
                            const sizeLabel = size.replace('s', '') + '% pot';
                            return (
                                <div key={size} style={{
                                    display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3,
                                }}>
                                    <div style={{ width: 55, fontSize: 10, fontWeight: 700, color: '#94a3b8', textAlign: 'right' }}>
                                        {sizeLabel}
                                    </div>
                                    <div style={{
                                        flex: 1, height: 14, background: 'rgba(255,255,255,0.04)',
                                        borderRadius: 3, overflow: 'hidden',
                                    }}>
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${pct}%` }}
                                            style={{
                                                height: '100%', borderRadius: 3,
                                                background: 'rgba(0,212,255,0.3)',
                                            }}
                                        />
                                    </div>
                                    <span style={{ width: 30, fontSize: 9, fontWeight: 700, color: '#e2e8f0', textAlign: 'right' }}>
                                        {pct}%
                                    </span>
                                </div>
                            );
                        })}
                </div>
            )}
        </motion.div>
    );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// AGGREGATED STATS BAR
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function RunoutSummary({ strategies }) {
    const stats = useMemo(() => {
        const types = { brick: 0, overcard: 0, flush_completing: 0, straight_completing: 0, pairing: 0 };
        let totalBet = 0;
        let totalCheck = 0;
        let count = 0;

        Object.values(strategies || {}).forEach(s => {
            if (!s) return;
            totalBet += s.betFreq;
            totalCheck += s.checkFreq;
            count++;
            if (types[s.runoutType] !== undefined) types[s.runoutType]++;
        });

        const avgBet = count > 0 ? Math.round(totalBet / count) : 0;
        const avgCheck = count > 0 ? Math.round(totalCheck / count) : 0;
        return { avgBet, avgCheck, count, types };
    }, [strategies]);

    return (
        <div style={{
            display: 'flex', gap: 12, alignItems: 'center',
            padding: '6px 10px', background: 'rgba(0,0,0,0.2)',
            borderRadius: 8, flexWrap: 'wrap', justifyContent: 'center',
        }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#00d4ff', fontFamily: "var(--font-rajdhani), 'Rajdhani', monospace" }}>
                Avg: Bet {stats.avgBet}% / Check {stats.avgCheck}%
            </div>
            <div style={{ fontSize: 9, color: '#64748b' }}>
                {stats.count} runouts analyzed
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
                {Object.entries(stats.types || {}).filter(([_, c]) => c > 0).map(([type, count]) => (
                    <span key={type} style={{
                        fontSize: 8, color: '#94a3b8',
                        background: 'rgba(255,255,255,0.04)',
                        padding: '1px 6px', borderRadius: 8,
                    }}>
                        {type.replace(/_/g, ' ')}: {count}
                    </span>
                ))}
            </div>
        </div>
    );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// MAIN COMPONENT
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default function RunoutStrategyMatrix({
    holeCards = ['Ah', 'Kh'],
    flopBoard = ['Qd', '7c', '2s'],
    position = 'IP',
    street = 'turn', // 'turn' (analyzing turn cards) or 'river' (analyzing river cards)
    compact = false,
}) {
    const [selectedCard, setSelectedCard] = useState(null);

    // Dead cards = hole cards + board
    const deadSet = useMemo(() => {
        const cards = [...(holeCards || []), ...(flopBoard || [])];
        return new Set(cards.map(c => c?.toLowerCase()).filter(Boolean));
    }, [holeCards, flopBoard]);

    // Compute strategy for every possible runout card
    const strategies = useMemo(() => {
        const result = {};
        SUITS.forEach(suit => {
            RANKS.forEach(rank => {
                const card = `${rank}${suit.code}`;
                if (deadSet.has(card.toLowerCase())) {
                    result[card] = null;
                } else {
                    result[card] = getRunoutStrategy(
                        holeCards, flopBoard, card, position, street
                    );
                }
            });
        });
        return result;
    }, [holeCards, flopBoard, position, street, deadSet]);

    const handleCellClick = useCallback((card) => {
        setSelectedCard(prev => prev === card ? null : card);
    }, []);

    const selectedStrategy = selectedCard ? strategies[selectedCard] : null;
    const selectedSuit = selectedCard ? SUITS.find(s => s.code === selectedCard[1]) : null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 4px',
            }}>
                <div style={{
                    fontSize: 13, fontWeight: 800, color: '#e2e8f0',
                    fontFamily: "var(--font-rajdhani), 'Rajdhani', monospace",
                }}>
                    {street === 'turn' ? 'TURN' : 'RIVER'} RUNOUT STRATEGY
                </div>
                <div style={{ fontSize: 9, color: '#64748b' }}>
                    How does the optimal action change per card?
                </div>
            </div>

            {/* Summary */}
            <RunoutSummary strategies={strategies} />

            {/* Legend */}
            <div style={{
                display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center',
                fontSize: 9,
            }}>
                {Object.entries(ACTION_COLORS || {}).map(([action, color]) => (
                    <div key={action} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: color, opacity: 0.85 }} />
                        <span style={{ color: '#94a3b8' }}>
                            {ACTION_LABELS[action]?.split(' ')[0] + (ACTION_LABELS[action]?.split(' ')[1] ? ' ' + ACTION_LABELS[action].split(' ')[1] : '')}
                        </span>
                    </div>
                ))}
            </div>

            {/* Matrix + Detail */}
            <div style={{
                display: 'flex', gap: 16, alignItems: 'flex-start',
                justifyContent: 'center', flexWrap: 'wrap',
            }}>
                {/* 4×13 Grid */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {/* Rank headers */}
                    <div style={{ display: 'flex', gap: 2, paddingLeft: 20 }}>
                        {RANKS.map(r => (
                            <div key={r} style={{
                                width: 30, textAlign: 'center',
                                fontSize: 9, fontWeight: 700, color: '#64748b',
                            }}>
                                {r}
                            </div>
                        ))}
                    </div>
                    {SUITS.map(suit => (
                        <div key={suit.code} style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                            <div style={{
                                width: 18, textAlign: 'center',
                                color: suit.color, fontSize: 14, fontWeight: 700,
                            }}>
                                {suit.symbol}
                            </div>
                            {RANKS.map(rank => {
                                const card = `${rank}${suit.code}`;
                                const isDead = deadSet.has(card.toLowerCase());
                                return (
                                    <RunoutCell
                                        key={card}
                                        rank={rank}
                                        suit={suit}
                                        strategy={strategies[card]}
                                        isDead={isDead}
                                        isSelected={selectedCard === card}
                                        onClick={handleCellClick}
                                    />
                                );
                            })}
                        </div>
                    ))}
                </div>

                {/* Detail Panel */}
                <AnimatePresence>
                    {selectedCard && selectedStrategy && (
                        <RunoutDetail
                            card={selectedCard}
                            strategy={selectedStrategy}
                            suitInfo={selectedSuit}
                            onClose={() => setSelectedCard(null)}
                        />
                    )}
                </AnimatePresence>
            </div>

            {/* Footer */}
            <div style={{
                fontSize: 8, color: '#475569', textAlign: 'center',
                padding: '4px 8px',
            }}>
                Cell color = dominant action on that runout. Bet% shown in each cell.
                Click any card for full strategy + sizing breakdown.
            </div>
        </div>
    );
}

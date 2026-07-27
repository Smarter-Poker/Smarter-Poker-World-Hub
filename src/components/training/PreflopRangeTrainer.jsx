/**
 * PREFLOP RANGE TRAINER — GTO Wizard-Style Preflop Range Quiz
 * ═══════════════════════════════════════════════════════════════════════════
 * Interactive 13x13 matrix quiz:
 * 1. Select a position (BTN, CO, HJ, etc.)
 * 2. Get dealt a random hand from the range
 * 3. Choose: Raise, Call, or Fold
 * 4. See feedback with the full range highlighted
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { classifyMove, CLASSIFICATION_CONFIG } from '../../hooks/useGTOWScore';
import { getCardImagePath } from './Card';
import {
    RANKS as SOLVER_RANKS,
    ALL_HANDS as SOLVER_ALL_HANDS,
    getHandFromGrid,
    RFI,
    THREE_BET,
    BB_DEFENSE,
    FOUR_BET,
    SQUEEZE,
    COLD_CALL,
    getHandFrequencies,
    getPrimaryAction,
    isInRange,
    getRangePercentage,
    getAvailableSpots,
    resolveSpot,
} from '../../config/solverRanges';

// Convert abstract hand notation ("K5o", "AKs", "TT") to two specific card objects with suits
function handToCards(hand) {
    if (!hand) return [{ rank: 'A', suit: 'h' }, { rank: 'K', suit: 's' }];
    if (hand.length === 2) {
        // Pair: "AA", "KK" → same rank, different suits
        return [{ rank: hand[0], suit: 'h' }, { rank: hand[1], suit: 's' }];
    }
    if (hand.length === 3) {
        const r1 = hand[0], r2 = hand[1], flag = hand[2];
        if (flag === 's') {
            // Suited: "AKs" → both spades
            return [{ rank: r1, suit: 's' }, { rank: r2, suit: 's' }];
        }
        // Offsuit: "K5o" → hearts + diamonds
        return [{ rank: r1, suit: 'h' }, { rank: r2, suit: 'd' }];
    }
    return [{ rank: hand[0] || 'A', suit: 'h' }, { rank: hand[1] || 'K', suit: 's' }];
}

// ═══ SOLVER RANGES: Now sourced from centralized solverRanges.js ═══
// All range data (RFI, 3-bet, BB defense, 4-bet, squeeze) lives in one file.
// The GTO_RANGES adapter below converts { raise: freq, call: freq } → flat frequency
// for backward-compatible rendering in the 13x13 matrix.
const RANKS = SOLVER_RANKS;

/**
 * All available training spots — RFI + 3-bet + BB Defense + 4-bet + Squeeze
 */
const SPOT_CATEGORIES = [
    { id: 'rfi', label: 'RFI (Open Raise)' },
    { id: '3bet', label: '3-Bet' },
    { id: 'coldcall', label: 'Cold Call' },
    { id: 'bbdef', label: 'BB Defense' },
    { id: '4bet', label: '4-Bet' },
    { id: 'squeeze', label: 'Squeeze' },
];

/**
 * Build a flat lookup of all available spots with display labels + solver data.
 */
function buildSpotList() {
    const spots = [];

    // RFI spots
    Object.keys(RFI || {}).forEach(pos => {
        spots.push({
            key: `RFI.${pos}`,
            category: 'rfi',
            label: `${pos} Open`,
            shortLabel: pos,
            data: RFI[pos],
        });
    });

    // 3-Bet spots
    Object.keys(THREE_BET || {}).forEach(key => {
        const parts = key.split('_vs_');
        const pos = parts[0];
        const villain = parts[1] || key;
        spots.push({
            key: `3BET.${key}`,
            category: '3bet',
            label: `${pos} 3-Bet vs ${villain}`,
            shortLabel: `${pos} v ${villain}`,
            data: THREE_BET[key],
        });
    });

    // BB Defense spots
    Object.keys(BB_DEFENSE || {}).forEach(key => {
        const villain = key.replace('vs_', '');
        spots.push({
            key: `BB_DEF.${key}`,
            category: 'bbdef',
            label: `BB Defense vs ${villain}`,
            shortLabel: `BB v ${villain}`,
            data: BB_DEFENSE[key],
        });
    });

    // 4-Bet spots
    Object.keys(FOUR_BET || {}).forEach(key => {
        const parts = key.split('_vs_');
        const pos = parts[0];
        spots.push({
            key: `4BET.${key}`,
            category: '4bet',
            label: `${pos} 4-Bet vs 3bet`,
            shortLabel: `${pos} 4bet`,
            data: FOUR_BET[key],
        });
    });

    // Cold-call spots
    Object.keys(COLD_CALL || {}).forEach(key => {
        const parts = key.split('_vs_');
        const pos = parts[0];
        const villain = parts[1] || key;
        spots.push({
            key: `CC.${key}`,
            category: 'coldcall',
            label: `${pos} Flat vs ${villain}`,
            shortLabel: `${pos} v ${villain}`,
            data: COLD_CALL[key],
        });
    });

    // Squeeze spots
    Object.keys(SQUEEZE || {}).forEach(key => {
        spots.push({
            key: `SQZ.${key}`,
            category: 'squeeze',
            label: key.replace(/_/g, ' '),
            shortLabel: key.replace(/_/g, ' ').slice(0, 14),
            data: SQUEEZE[key],
        });
    });

    return spots;
}

const ALL_SPOTS = buildSpotList();

/**
 * Convert solver data { hand: { raise, call } } to flat freq map { hand: freq }
 * where freq = raise + call (total action frequency for matrix coloring).
 * Also returns the full action frequencies for quiz logic.
 */
function solverToFlatRange(spotData) {
    if (!spotData) return {};
    const flat = {};
    for (const hand of SOLVER_ALL_HANDS) {
        const f = getHandFrequencies(spotData, hand);
        const totalAction = f.raise + f.call;
        if (totalAction > 0) {
            flat[hand] = totalAction;
        }
    }
    return flat;
}

/**
 * Get the full raise/call/fold breakdown for a hand in a spot.
 */
function getFullFreqs(spotData, hand) {
    return getHandFrequencies(spotData, hand);
}

// Build legacy GTO_RANGES from RFI data for backward-compatible position selector
const GTO_RANGES = {};
Object.keys(RFI || {}).forEach(pos => {
    GTO_RANGES[pos] = solverToFlatRange(RFI[pos]);
});

// ═══════════════════════════════════════════════════════════════════════════
// MEMOIZED SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

// GTO Wizard-style multi-color cell — shows raise (blue), call (green), fold (gray) gradient
const QuizMatrixCell = React.memo(({ cell, isHighlighted }) => {
    const actions = cell.actions || { raise: 0, call: 0, fold: 1 };
    const hasAction = actions.raise > 0.01 || actions.call > 0.01;

    // Build CSS gradient from action frequencies (GTO Wizard style)
    let cellBg;
    if (!hasAction) {
        cellBg = 'rgba(255,255,255,0.04)';
    } else if (actions.call > 0.01 && actions.raise > 0.01) {
        // Mixed raise+call: split gradient
        const raisePercent = Math.round(actions.raise / (actions.raise + actions.call) * 100);
        cellBg = `linear-gradient(135deg, #3b82f6 0%, #3b82f6 ${raisePercent}%, #22c55e ${raisePercent}%, #22c55e 100%)`;
    } else if (actions.raise > 0.01) {
        // Pure raise — intensity by frequency
        const alpha = 0.3 + actions.raise * 0.7;
        cellBg = `rgba(59,130,246,${alpha})`;
    } else {
        // Pure call
        const alpha = 0.3 + actions.call * 0.7;
        cellBg = `rgba(34,197,94,${alpha})`;
    }

    // Dim cells that are mostly fold but have some action
    const opacity = hasAction ? (cell.freq < 0.15 ? 0.6 : 1) : 0.4;

    const title = `${cell.hand}: R${Math.round(actions.raise*100)}% C${Math.round(actions.call*100)}% F${Math.round(actions.fold*100)}%`;

    return (
        <div
            style={{
                aspectRatio: '1',
                background: cellBg,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 6.5,
                fontWeight: 'bold',
                color: hasAction ? (cell.freq > 0.3 ? '#fff' : '#ddd') : '#444',
                border: isHighlighted ? '2px solid #00d4ff' : '1px solid rgba(0,0,0,0.2)',
                boxShadow: isHighlighted ? '0 0 8px rgba(0,212,255,0.6)' : 'none',
                position: 'relative',
                opacity,
                textShadow: hasAction && cell.freq > 0.3 ? '0 1px 2px rgba(0,0,0,0.5)' : 'none',
            }}
            title={title}
        >
            {cell.hand}
        </div>
    );
});

// Memoized matrix cell for build mode
const BuildMatrixCell = React.memo(({ cell, isSelected, solverInRange, rangeChecked, onClick }) => {
    let cellBg = 'rgba(255,255,255,0.04)';
    let cellTextColor = '#555';
    let cellBorder = '1px solid rgba(255,255,255,0.05)';

    if (rangeChecked) {
        if (isSelected && solverInRange) {
            cellBg = 'rgba(34, 197, 94, 0.35)';
            cellTextColor = '#22c55e';
            cellBorder = '1px solid rgba(34,197,94,0.5)';
        } else if (!isSelected && solverInRange) {
            cellBg = 'rgba(251, 146, 60, 0.3)';
            cellTextColor = '#fb923c';
            cellBorder = '1px solid rgba(251,146,60,0.5)';
        } else if (isSelected && !solverInRange) {
            cellBg = 'rgba(239, 68, 68, 0.3)';
            cellTextColor = '#ef4444';
            cellBorder = '1px solid rgba(239,68,68,0.5)';
        }
    } else if (isSelected) {
        cellBg = 'rgba(0, 212, 255, 0.2)';
        cellTextColor = '#00d4ff';
        cellBorder = '1px solid rgba(0,212,255,0.5)';
    }

    return (
        <div
            onClick={onClick}
            style={{
                aspectRatio: '1',
                background: cellBg,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 6.5,
                fontWeight: 'bold',
                color: cellTextColor,
                border: cellBorder,
                cursor: rangeChecked ? 'default' : 'pointer',
                transition: 'all 0.1s ease',
                userSelect: 'none',
            }}
            title={`${cell.hand}: ${Math.round(cell.freq * 100)}%`}
        >
            {cell.hand}
        </div>
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function PreflopRangeTrainer({ onExit }) {
    const [position, setPosition] = useState('BTN');
    const [spotCategory, setSpotCategory] = useState('rfi');
    const [activeSpot, setActiveSpot] = useState(ALL_SPOTS.find(s => s.key === 'RFI.BTN') || ALL_SPOTS[0]);
    const [currentHand, setCurrentHand] = useState(null);
    const [showFeedback, setShowFeedback] = useState(false);
    const [selectedAction, setSelectedAction] = useState(null);
    const [score, setScore] = useState({ correct: 0, total: 0 });
    const [streak, setStreak] = useState(0);
    const [showMatrix, setShowMatrix] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const allHands = useMemo(() => [...SOLVER_ALL_HANDS], []);

    // Phase 8: Interactive range-building mode
    const [trainerMode, setTrainerMode] = useState('quiz'); // 'quiz' | 'build'
    const [userRange, setUserRange] = useState(new Set());
    const [rangeChecked, setRangeChecked] = useState(false);
    const [rangeScore, setRangeScore] = useState(null);

    // Derive flat range + solver data from active spot
    const range = useMemo(() => solverToFlatRange(activeSpot?.data), [activeSpot]);
    const spotData = activeSpot?.data || {};

    // Available spots filtered by category
    const categorySpots = useMemo(() =>
        ALL_SPOTS.filter(s => s.category === spotCategory),
    [spotCategory]);

    // Range percentage display
    const rangePercent = useMemo(() =>
        activeSpot?.data ? getRangePercentage(activeSpot.data).toFixed(1) : '0',
    [activeSpot]);

    // Deal a new hand — weighted toward interesting decisions
    // ~50% in-range hands, ~30% boundary/mixed, ~20% any (including folds)
    const dealHand = useCallback(() => {
        const sd = spotData;
        const inRange = [];
        const boundary = [];
        for (const h of allHands) {
            const f = getFullFreqs(sd, h);
            const total = f.raise + f.call;
            if (total > 0.05) {
                inRange.push(h);
                if ((total > 0.10 && total < 0.90) || (f.raise > 0.05 && f.raise < 0.95 && f.call > 0.05)) {
                    boundary.push(h);
                }
            }
        }
        const roll = Math.random();
        let hand;
        if (roll < 0.50 && inRange.length > 0) {
            hand = inRange[Math.floor(Math.random() * inRange.length)];
        } else if (roll < 0.80 && boundary.length > 0) {
            hand = boundary[Math.floor(Math.random() * boundary.length)];
        } else {
            hand = allHands[Math.floor(Math.random() * allHands.length)];
        }
        setCurrentHand(hand);
        setShowFeedback(false);
        setSelectedAction(null);
        setShowMatrix(false);
    }, [allHands, spotData]);

    // Start on mount and spot change
    useEffect(() => {
        setIsLoading(true);
        const timer = setTimeout(() => {
            dealHand();
            setIsLoading(false);
        }, 150);
        return () => clearTimeout(timer);
    }, [activeSpot, dealHand]);

    // Get correct action for current hand — now uses full raise/call/fold breakdown
    const handActions = useMemo(() => {
        if (!currentHand) return { raise: 0, call: 0, fold: 1 };
        return getFullFreqs(spotData, currentHand);
    }, [currentHand, spotData]);

    const correctAction = useMemo(() => {
        if (handActions.raise >= handActions.call && handActions.raise >= handActions.fold) return 'raise';
        if (handActions.call >= handActions.raise && handActions.call >= handActions.fold) return 'call';
        return 'fold';
    }, [handActions]);

    // Backward-compat: "handFreq" = total action frequency (raise + call)
    const handFreq = useMemo(() => {
        return handActions.raise + handActions.call;
    }, [handActions]);

    const [feedbackResult, setFeedbackResult] = useState(null);

    // Handle answer — now uses real raise/call/fold frequencies from solver
    const handleAction = useCallback((action) => {
        if (showFeedback) return;
        setSelectedAction(action);
        setShowFeedback(true);
        setShowMatrix(true);

        // Build GTO frequency map from solver's mixed-strategy data (0-100 scale)
        const gtoFreqs = {
            'raise': Math.round(handActions.raise * 100),
            'call': Math.round(handActions.call * 100),
            'fold': Math.round(handActions.fold * 100),
        };

        // Classify move using the central engine
        const classification = classifyMove(
            action,
            correctAction,
            gtoFreqs,
            1,     // level
            null,  // evData
            null,  // rawFrequencies
            currentHand,
            10     // pot size
        );

        setFeedbackResult(classification);

        // Score logic: anything better than WRONG is technically a "pass" for streaks
        const isPass = classification.classification === 'best' || classification.classification === 'correct' || classification.classification === 'inaccuracy';

        setScore(prev => ({
            correct: prev.correct + (isPass ? 1 : 0),
            total: prev.total + 1,
        }));
        setStreak(prev => isPass ? prev + 1 : 0);
    }, [showFeedback, handActions, correctAction, currentHand]);

    // Build 13x13 matrix — now includes raise/call/fold breakdown for each cell
    const matrix = useMemo(() => {
        const grid = [];
        for (let r = 0; r < 13; r++) {
            const row = [];
            for (let c = 0; c < 13; c++) {
                const hand = getHandFromGrid(r, c);
                const freq = range[hand] || 0;
                const actions = getFullFreqs(spotData, hand);
                row.push({ hand, freq, actions, isCurrentHand: hand === currentHand });
            }
            grid.push(row);
        }
        return grid;
    }, [range, spotData, currentHand]);

    const accuracy = useMemo(() => score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0, [score]);
    const accColor = useMemo(() => accuracy >= 80 ? '#22c55e' : accuracy >= 60 ? '#fbbf24' : '#ef4444', [accuracy]);

    // Phase 8: Toggle a cell in user range (build mode)
    const toggleUserRangeCell = useCallback((hand) => {
        if (rangeChecked) return;
        setUserRange(prev => {
            const next = new Set(prev);
            if (next.has(hand)) next.delete(hand);
            else next.add(hand);
            return next;
        });
    }, [rangeChecked]);

    // Phase 8: Check user range vs solver
    const checkRange = useCallback(() => {
        const solverHands = new Set(Object.keys(range || {}).filter(h => range[h] >= 0.5));
        let correct = 0, missed = 0, extra = 0;
        solverHands.forEach(h => {
            if (userRange.has(h)) correct++;
            else missed++;
        });
        userRange.forEach(h => {
            if (!solverHands.has(h)) extra++;
        });
        const total = solverHands.size;
        const precision = userRange.size > 0 ? Math.round((correct / userRange.size) * 100) : 0;
        const recall = total > 0 ? Math.round((correct / total) * 100) : 0;
        const f1 = precision + recall > 0 ? Math.round((2 * precision * recall) / (precision + recall)) : 0;
        setRangeScore({ correct, missed, extra, total, precision, recall, f1 });
        setRangeChecked(true);
    }, [range, userRange]);

    // Reset build mode when spot changes
    useEffect(() => {
        setUserRange(new Set());
        setRangeChecked(false);
        setRangeScore(null);
    }, [activeSpot]);

    // Memoized handlers
    const handlePositionChange = useCallback((pos) => {
        setPosition(pos);
        // Find the matching RFI spot for this position
        const rfiSpot = ALL_SPOTS.find(s => s.key === `RFI.${pos}`);
        if (rfiSpot) {
            setActiveSpot(rfiSpot);
            setSpotCategory('rfi');
        }
        setScore({ correct: 0, total: 0 });
        setStreak(0);
    }, []);

    const handleSpotChange = useCallback((spot) => {
        setActiveSpot(spot);
        setScore({ correct: 0, total: 0 });
        setStreak(0);
        // Update position label from spot
        const posMatch = spot.label.match(/^(UTG|MP|HJ|CO|BTN|SB|BB)/);
        if (posMatch) setPosition(posMatch[1]);
    }, []);

    const handleCategoryChange = useCallback((catId) => {
        setSpotCategory(catId);
        const firstSpot = ALL_SPOTS.find(s => s.category === catId);
        if (firstSpot) {
            setActiveSpot(firstSpot);
            const posMatch = firstSpot.label.match(/^(UTG|MP|HJ|CO|BTN|SB|BB)/);
            if (posMatch) setPosition(posMatch[1]);
        }
        setScore({ correct: 0, total: 0 });
        setStreak(0);
    }, []);

    const handleModeChange = useCallback((mode) => {
        setTrainerMode(mode);
        setUserRange(new Set());
        setRangeChecked(false);
        setRangeScore(null);
    }, []);

    const handleRangeClear = useCallback(() => {
        setUserRange(new Set());
    }, []);

    const handleRangeReset = useCallback(() => {
        setUserRange(new Set());
        setRangeChecked(false);
        setRangeScore(null);
    }, []);

    // Loading skeleton state
    if (isLoading) {
        return (
            <div style={S.container}>
                <div style={S.header}>
                    <button onClick={onExit} style={S.backBtn}>← Back</button>
                    <div style={S.headerTitle}>Preflop Range Trainer</div>
                    <div style={S.headerScore}>
                        <span style={{ color: '#64748b', fontWeight: 'bold', fontFamily: "'Orbitron', monospace" }}>
                            ---%
                        </span>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, padding: 40 }}>
                    <div style={{
                        width: 200, height: 280, background: 'rgba(255,255,255,0.03)',
                        borderRadius: 12, animation: 'pulse 1.5s ease-in-out infinite'
                    }} />
                </div>
            </div>
        );
    }

    return (
        <div style={S.container}>
            {/* HEADER */}
            <div style={S.header}>
                <button onClick={onExit} style={S.backBtn}>← Back</button>
                <div style={S.headerTitle}>Preflop Range Trainer</div>
                <div style={S.headerScore}>
                    <span style={{ color: accColor, fontWeight: 'bold', fontFamily: "'Orbitron', monospace" }}>
                        {accuracy}%
                    </span>
                    <span style={{ fontSize: 9, color: '#64748b' }}>({score.correct}/{score.total})</span>
                </div>
            </div>

            {/* SPOT CATEGORY TABS */}
            <div style={{ display: 'flex', gap: 0, margin: '0 8px 2px', overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
                {SPOT_CATEGORIES.map(cat => (
                    <button
                        key={cat.id}
                        onClick={() => handleCategoryChange(cat.id)}
                        style={{
                            padding: '6px 10px', border: 'none', cursor: 'pointer',
                            fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
                            whiteSpace: 'nowrap', flexShrink: 0,
                            background: spotCategory === cat.id ? 'rgba(168,85,247,0.15)' : 'transparent',
                            color: spotCategory === cat.id ? '#a855f7' : '#64748b',
                            borderBottom: spotCategory === cat.id ? '2px solid #a855f7' : '2px solid transparent',
                            transition: 'all 0.2s ease',
                        }}
                    >
                        {cat.label}
                    </button>
                ))}
            </div>

            {/* SPOT SELECTOR (within category) */}
            <div style={S.posBar}>
                {categorySpots.map(spot => (
                    <button
                        key={spot.key}
                        onClick={() => handleSpotChange(spot)}
                        style={{
                            ...S.posBtn,
                            background: activeSpot?.key === spot.key ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.05)',
                            color: activeSpot?.key === spot.key ? '#00d4ff' : '#94a3b8',
                            borderColor: activeSpot?.key === spot.key ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.1)',
                            fontSize: 10,
                            padding: '6px 10px',
                            minWidth: 40,
                        }}
                    >
                        {spot.shortLabel}
                    </button>
                ))}
                {categorySpots.length > 0 && (
                    <div style={{ fontSize: 9, color: '#64748b', alignSelf: 'center', marginLeft: 4 }}>
                        {rangePercent}%
                    </div>
                )}
            </div>

            {/* MODE TOGGLE */}
            <div style={{ display: 'flex', gap: 0, margin: '0 16px 10px', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                {[{ id: 'quiz', label: 'Quiz Mode' }, { id: 'build', label: 'Range Builder' }].map(m => (
                    <button
                        key={m.id}
                        onClick={() => handleModeChange(m.id)}
                        style={{
                            flex: 1, padding: '9px 0', border: 'none', cursor: 'pointer',
                            fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
                            background: trainerMode === m.id ? 'rgba(0,212,255,0.15)' : 'rgba(0,0,0,0.2)',
                            color: trainerMode === m.id ? '#00d4ff' : '#64748b',
                            borderBottom: trainerMode === m.id ? '2px solid #00d4ff' : '2px solid transparent',
                            transition: 'all 0.2s ease',
                        }}
                    >
                        {m.label}
                    </button>
                ))}
            </div>

            {/* CURRENT HAND DISPLAY */}
            <AnimatePresence mode="wait">
                {currentHand && (
                    <motion.div
                        key={currentHand}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        style={S.handDisplay}
                    >
                        <div style={S.handLabel}>Your Hand • {activeSpot?.label || position}</div>
                        <div style={S.handCards}>
                            {handToCards(currentHand).map((card, i) => (
                                <motion.img
                                    key={`${currentHand}-${i}`}
                                    src={getCardImagePath(card.rank, card.suit)}
                                    alt={`${card.rank}${card.suit}`}
                                    initial={{ y: 30, opacity: 0, rotateZ: i === 0 ? -20 : 20 }}
                                    animate={{ y: 0, opacity: 1, rotateZ: i === 0 ? -8 : 6 }}
                                    transition={{ delay: i * 0.1, duration: 0.3, type: 'spring' }}
                                    style={{
                                        width: 72, height: 101,
                                        borderRadius: 6,
                                        boxShadow: '0 4px 16px rgba(0,0,0,0.5), 0 0 20px rgba(0,212,255,0.15)',
                                        marginLeft: i > 0 ? -18 : 0,
                                        transformOrigin: 'bottom center',
                                        pointerEvents: 'none',
                                        userSelect: 'none',
                                    }}
                                    draggable={false}
                                />
                            ))}
                        </div>
                        <div style={S.handNotation}>{currentHand}</div>
                        {streak >= 3 && (
                            <div style={{ fontSize: 11, color: '#f97316' }}>
                                {streak} streak
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ACTION BUTTONS */}
            <div style={S.actionBar}>
                {[
                    { id: 'raise', label: 'RAISE', color: '#3b82f6', border: '#60a5fa' },
                    { id: 'call', label: 'CALL', color: '#22c55e', border: '#4ade80' },
                    { id: 'fold', label: 'FOLD', color: '#ef4444', border: '#f87171' },
                ].map(action => {
                    const isSelected = selectedAction === action.id;
                    let isCorrectAction = false;

                    if (showFeedback && feedbackResult) {
                        // If selected, check if it was a good classification
                        if (isSelected) {
                            isCorrectAction = ['best', 'correct', 'inaccuracy'].includes(feedbackResult.classification);
                        } else {
                            // If not selected, highlight it if it was the optimal action
                            isCorrectAction = action.id === correctAction;
                        }
                    }

                    return (
                        <motion.button
                            key={action.id}
                            onClick={() => handleAction(action.id)}
                            disabled={showFeedback}
                            whileHover={!showFeedback ? { scale: 1.05, y: -2 } : {}}
                            whileTap={!showFeedback ? { scale: 0.95 } : {}}
                            style={{
                                ...S.actionBtn,
                                background: showFeedback
                                    ? isSelected
                                        ? CLASSIFICATION_CONFIG[feedbackResult.classification]?.bgColor || 'rgba(255,255,255,0.03)'
                                        : isCorrectAction
                                            ? CLASSIFICATION_CONFIG['best'].bgColor
                                            : 'rgba(255,255,255,0.03)'
                                    : `linear-gradient(180deg, rgba(${action.id === 'raise' ? '59,130,246' : action.id === 'call' ? '34,197,94' : '239,68,68'},0.15), rgba(0,0,0,0.3))`,
                                borderColor: showFeedback
                                    ? isSelected
                                        ? CLASSIFICATION_CONFIG[feedbackResult.classification]?.borderColor || 'rgba(255,255,255,0.1)'
                                        : isCorrectAction
                                            ? CLASSIFICATION_CONFIG['best'].borderColor
                                            : 'rgba(255,255,255,0.1)'
                                    : `${action.border}40`,
                                color: showFeedback
                                    ? isSelected
                                        ? CLASSIFICATION_CONFIG[feedbackResult.classification]?.color || '#64748b'
                                        : isCorrectAction
                                            ? CLASSIFICATION_CONFIG['best'].color
                                            : '#64748b'
                                    : action.color,
                                opacity: showFeedback && !isSelected && !isCorrectAction ? 0.3 : 1,
                            }}
                        >
                            {action.label}
                            {showFeedback && isSelected && <span style={{ fontSize: 10, marginLeft: 4 }}>{CLASSIFICATION_CONFIG[feedbackResult.classification]?.icon === 'check'? '✓': '✕'}</span>}
                        </motion.button>
                    );
                })}
            </div>

            {/* FEEDBACK */}
            <AnimatePresence>
                {showFeedback && feedbackResult && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={S.feedback}
                    >
                        <div style={{
                            fontSize: 14, fontWeight: 'bold', marginBottom: 4,
                            color: CLASSIFICATION_CONFIG[feedbackResult.classification]?.color || '#ef4444',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                        }}>
                            {CLASSIFICATION_CONFIG[feedbackResult.classification]?.label.toUpperCase()}
                            {feedbackResult.evLoss > 0 && (
                                <span style={{ fontSize: 11, background: 'rgba(0,0,0,0.5)', padding: '2px 6px', borderRadius: 4 }}>
                                    -{feedbackResult.evLoss} EV
                                </span>
                            )}
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                            {currentHand} • {activeSpot?.label || position}:{' '}
                            {handActions.raise === 0 && handActions.call === 0
                                ? 'Not in range — Fold'
                                : (() => {
                                    const parts = [];
                                    if (handActions.raise > 0) parts.push(`Raise ${Math.round(handActions.raise * 100)}%`);
                                    if (handActions.call > 0) parts.push(`Call ${Math.round(handActions.call * 100)}%`);
                                    if (handActions.fold > 0.01) parts.push(`Fold ${Math.round(handActions.fold * 100)}%`);
                                    return parts.length > 1 ? `Mixed — ${parts.join(' / ')}` : parts[0];
                                })()}
                        </div>

                        <motion.button
                            onClick={dealHand}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.3 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            style={S.nextBtn}
                        >
                            Next Hand →
                        </motion.button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 13x13 RANGE MATRIX */}
            {trainerMode === 'quiz' ? (
                <div style={S.matrixContainer}>
                    <div style={S.matrixTitle}>{activeSpot?.label || `${position} Open`} ({rangePercent}% of hands)</div>
                    <div style={S.matrix}>
                        {matrix.flat().map((cell, i) => {
                            const isHighlighted = showFeedback && cell.isCurrentHand;
                            return (
                                <QuizMatrixCell
                                    key={i}
                                    cell={cell}
                                    isHighlighted={isHighlighted}
                                />
                            );
                        })}
                    </div>
                    <div style={S.legend}>
                        {[
                            { label: 'Raise', color: '#3b82f6' },
                            { label: 'Call', color: '#22c55e' },
                            { label: 'Mixed', color: 'linear-gradient(135deg, #3b82f6 50%, #22c55e 50%)' },
                            { label: 'Fold', color: 'rgba(255,255,255,0.08)' },
                        ].map(l => (
                            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 8, color: '#94a3b8' }}>
                                <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />
                                {l.label}
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                /* RANGE BUILDER MODE */
                <div style={S.matrixContainer}>
                    <div style={S.matrixTitle}>Build: {activeSpot?.label || `${position} Open`}</div>
                    <div style={S.matrix}>
                        {matrix.flat().map((cell, i) => {
                            const isSelected = userRange.has(cell.hand);
                            const solverInRange = cell.freq >= 0.5;

                            return (
                                <BuildMatrixCell
                                    key={i}
                                    cell={cell}
                                    isSelected={isSelected}
                                    solverInRange={solverInRange}
                                    rangeChecked={rangeChecked}
                                    onClick={() => toggleUserRangeCell(cell.hand)}
                                />
                            );
                        })}
                    </div>

                    {/* Result legend for checked range */}
                    {rangeChecked && rangeScore && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            style={{
                                marginTop: 10, padding: '10px 14px', borderRadius: 10,
                                background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 8 }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 22, fontWeight: 'bold', fontFamily: "'Orbitron', monospace", color: rangeScore.f1 >= 80 ? '#22c55e' : rangeScore.f1 >= 60 ? '#fbbf24' : '#ef4444' }}>
                                        {rangeScore.f1}%
                                    </div>
                                    <div style={{ fontSize: 9, color: '#64748b', letterSpacing: 1 }}>SCORE</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
                                    <div style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(34,197,94,0.5)' }} />
                                    <span style={{ color: '#22c55e' }}>Correct: {rangeScore.correct}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
                                    <div style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(251,146,60,0.5)' }} />
                                    <span style={{ color: '#fb923c' }}>Missed: {rangeScore.missed}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
                                    <div style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(239,68,68,0.5)' }} />
                                    <span style={{ color: '#ef4444' }}>Extra: {rangeScore.extra}</span>
                                </div>
                            </div>
                            <div style={{ fontSize: 9, color: '#64748b', textAlign: 'center', marginTop: 6 }}>
                                Precision: {rangeScore.precision}% · Recall: {rangeScore.recall}% · Solver: {rangeScore.total} hands
                            </div>
                        </motion.div>
                    )}

                    {/* Action buttons for build mode */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'center' }}>
                        {!rangeChecked ? (
                            <>
                                <motion.button
                                    whileHover={{ scale: 1.03 }}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={checkRange}
                                    disabled={userRange.size === 0}
                                    style={{
                                        padding: '10px 24px', borderRadius: 8,
                                        background: userRange.size > 0 ? 'linear-gradient(180deg, rgba(0,212,255,0.2), rgba(0,212,255,0.05))' : 'rgba(255,255,255,0.05)',
                                        border: '1px solid rgba(0,212,255,0.4)',
                                        color: userRange.size > 0 ? '#00d4ff' : '#475569',
                                        fontSize: 13, fontWeight: 700, cursor: userRange.size > 0 ? 'pointer' : 'not-allowed',
                                    }}
                                >
                                    Check Range ({userRange.size} selected)
                                </motion.button>
                                <motion.button
                                    whileHover={{ scale: 1.03 }}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={handleRangeClear}
                                    style={{
                                        padding: '10px 16px', borderRadius: 8,
                                        background: 'rgba(255,255,255,0.05)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        color: '#94a3b8', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                    }}
                                >
                                    Clear
                                </motion.button>
                            </>
                        ) : (
                            <motion.button
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={handleRangeReset}
                                style={{
                                    padding: '10px 24px', borderRadius: 8,
                                    background: 'linear-gradient(180deg, rgba(0,212,255,0.2), rgba(0,212,255,0.05))',
                                    border: '1px solid rgba(0,212,255,0.4)',
                                    color: '#00d4ff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                                }}
                            >
                                Try Again
                            </motion.button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const S = {
    container: {
        width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column',
        background: 'linear-gradient(180deg, #0a0a12 0%, #1a1a2e 100%)',
        fontFamily: "'Inter', -apple-system, sans-serif",
    },
    header: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        background: 'linear-gradient(180deg, rgba(30,30,45,0.98), rgba(15,15,25,0.98))',
        borderBottom: '2px solid rgba(0,212,255,0.3)',
    },
    backBtn: {
        background: 'none', border: 'none', color: '#00d4ff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        padding: '8px 0', minWidth: 60, textAlign: 'left',
    },
    headerTitle: {
        fontSize: 14, fontWeight: 'bold', color: '#e2e8f0', letterSpacing: 1, textTransform: 'uppercase',
    },
    headerScore: {
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2,
    },
    posBar: {
        display: 'flex', gap: 6, padding: '10px 16px', flexWrap: 'wrap', justifyContent: 'center',
    },
    posBtn: {
        padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 'bold',
        border: '1px solid', cursor: 'pointer', letterSpacing: 0.5, minWidth: 48,
        fontFamily: "'Orbitron', monospace",
    },
    handDisplay: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '16px 0',
    },
    handLabel: {
        fontSize: 11, color: '#94a3b8', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase',
    },
    handCards: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 0, marginBottom: 4,
    },
    handNotation: {
        fontSize: 13, fontWeight: 'bold', color: '#64748b',
        fontFamily: "'Orbitron', monospace", letterSpacing: 2,
    },
    actionBar: {
        display: 'flex', gap: 8, padding: '0 16px 12px', justifyContent: 'center',
    },
    actionBtn: {
        flex: 1, maxWidth: 120, padding: '14px 0', borderRadius: 10,
        border: '1px solid', fontSize: 14, fontWeight: 'bold', cursor: 'pointer',
        letterSpacing: 1, fontFamily: "'Inter', sans-serif",
        transition: 'all 0.15s ease',
    },
    feedback: {
        padding: '12px 16px', textAlign: 'center',
        background: 'rgba(0,0,0,0.3)', margin: '0 16px', borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.06)',
    },
    nextBtn: {
        marginTop: 8, padding: '10px 28px', borderRadius: 10,
        border: '1px solid rgba(0,212,255,0.4)',
        background: 'linear-gradient(180deg, rgba(0,212,255,0.15), rgba(0,212,255,0.05))',
        color: '#00d4ff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    },
    matrixContainer: {
        padding: '12px 16px', flex: 1,
    },
    matrixTitle: {
        fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: 1,
        textTransform: 'uppercase', marginBottom: 6, textAlign: 'center',
    },
    matrix: {
        display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: 1,
        maxWidth: 340, margin: '0 auto',
    },
    legend: {
        display: 'flex', justifyContent: 'center', gap: 10, marginTop: 6,
    },
};

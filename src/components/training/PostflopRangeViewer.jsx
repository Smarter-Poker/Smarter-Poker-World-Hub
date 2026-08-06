/**
 * PostflopRangeViewer — GTO Wizard-Style Postflop Range Visualization
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Shows a 13×13 hand matrix colored by postflop action frequencies.
 * Unlike the preflop RangeGrid (which takes pre-computed gridData),
 * this component computes frequencies on-the-fly from the solver data
 * matrices for any given board × position × street × spot type.
 *
 * Features:
 *   - Board texture auto-detection
 *   - Hand class mapping for all 169 hands
 *   - Multi-size frequency display (Bet 33%, Bet 75%, etc.)
 *   - Action filter buttons (isolate bet sizes, check, fold)
 *   - Combo counter and range percentage
 *   - Click-to-inspect with full frequency breakdown
 *   - Street/spot-type selector (c-bet, check-raise, turn barrel, etc.)
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useMemo, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    classifyHandClass,
    classifyBoardTexture,
    classifyTurnRunout,
    classifyRiverBoardState,
} from '../../engines/PostflopStrategyEngine';
import {
    lookupCbetStrategy,
    lookupCheckRaiseStrategy,
    lookupTurnStrategy,
    lookupRiverStrategy,
    lookupFacingBetStrategy,
    HAND_CLASSES,
    BOARD_TEXTURES,
    SIZING_PROFILES,
} from '../../config/postflopSolverData';

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// CONSTANTS
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS = ['h', 'd', 'c', 's'];

const SPOT_TYPES = [
    { key: 'cbet', label: 'C-Bet', street: 'flop' },
    { key: 'checkraise', label: 'Check-Raise', street: 'flop' },
    { key: 'turn_barrel', label: 'Turn Barrel', street: 'turn' },
    { key: 'river', label: 'River', street: 'river' },
    { key: 'facing_bet', label: 'Facing Bet', street: 'flop' },
];

const SIZE_COLORS = {
    check: '#3b82f6',
    s33: '#22c55e',
    s50: '#06b6d4',
    s75: '#2563eb',
    s100: '#ef4444',
    s125: '#f97316',
    s150: '#f59e0b',
    fold: '#64748b',
    call: '#22c55e',
    raise: '#a855f7',
};

const SIZE_LABELS = {
    check: 'Check',
    s33: 'Bet 33%',
    s50: 'Bet 50%',
    s75: 'Bet 75%',
    s100: 'Bet Pot',
    s125: 'OB 125%',
    s150: 'OB 150%',
    fold: 'Fold',
    call: 'Call',
    raise: 'Raise',
};

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// HAND NOTATION HELPERS
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function getHandNotation(row, col) {
    if (row === col) return `${RANKS[row]}${RANKS[col]}`;
    if (row < col) return `${RANKS[row]}${RANKS[col]}s`;
    return `${RANKS[col]}${RANKS[row]}o`;
}

function getHandType(row, col) {
    if (row === col) return 'pair';
    if (row < col) return 'suited';
    return 'offsuit';
}

const COMBO_WEIGHTS = { pair: 6, suited: 4, offsuit: 12 };

/**
 * Convert a hand notation like "AKs" to representative hole cards
 * for hand class classification. Uses placeholder suits.
 */
function handToCards(hand) {
    if (!hand || hand.length < 2) return null;
    const r1 = hand[0];
    const r2 = hand[1];
    const suffix = hand[2] || '';

    if (r1 === r2) {
        // Pair: e.g. "AA" → ["Ah", "Ad"]
        return [`${r1}h`, `${r2}d`];
    } else if (suffix === 's') {
        // Suited: e.g. "AKs" → ["Ah", "Kh"]
        return [`${r1}h`, `${r2}h`];
    } else {
        // Offsuit: e.g. "AKo" → ["Ah", "Kd"]
        return [`${r1}h`, `${r2}d`];
    }
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// STRATEGY LOOKUP ENGINE
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * For a given hand + spot config, return action frequencies as:
 * { check: %, s33: %, s75: %, fold: %, call: %, raise: % }
 * All values 0-100 summing to ~100.
 */
function getHandFrequencies(hand, config) {
    const { spotType, boardTexture, position, turnRunout, riverBoardState, facingBetSize } = config;
    const cards = handToCards(hand);
    if (!cards) return null;

    const board = config.board || [];
    let handClass;
    try {
        handClass = classifyHandClass(cards, board);
    } catch {
        handClass = 'air';
    }

    if (!handClass) handClass = 'air';

    let strategy = null;

    try {
        switch (spotType) {
            case 'cbet': {
                strategy = lookupCbetStrategy(boardTexture, handClass, position);
                if (!strategy) return null;
                // Convert: { betFreq, sizes: { s33: w, s75: w } } → frequency map
                const betPct = Math.round(strategy.betFreq * 100);
                const checkPct = 100 - betPct;
                const result = { check: checkPct };
                if (strategy.sizes) {
                    const sizeTotal = Object.values(strategy.sizes || {}).reduce((s, v) => s + v, 0) || 1;
                    Object.entries(strategy.sizes || {}).forEach(([sizeKey, weight]) => {
                        result[sizeKey] = Math.round((weight / sizeTotal) * betPct);
                    });
                } else {
                    result.s33 = betPct; // Default to 33% if no size breakdown
                }
                return result;
            }

            case 'checkraise': {
                strategy = lookupCheckRaiseStrategy(boardTexture, handClass);
                if (!strategy) return null;
                const xrPct = Math.round((strategy.raiseFreq || 0) * 100);
                const callPct = Math.round((strategy.callFreq || 0) * 100);
                const foldPct = Math.max(0, 100 - xrPct - callPct);
                return { raise: xrPct, call: callPct, fold: foldPct };
            }

            case 'turn_barrel': {
                const runout = turnRunout || 'brick';
                strategy = lookupTurnStrategy(runout, handClass, position);
                if (!strategy) return null;
                const betPct = Math.round(strategy.betFreq * 100);
                const checkPct = 100 - betPct;
                const result = { check: checkPct };
                if (strategy.sizes) {
                    const sizeTotal = Object.values(strategy.sizes || {}).reduce((s, v) => s + v, 0) || 1;
                    Object.entries(strategy.sizes || {}).forEach(([sizeKey, weight]) => {
                        result[sizeKey] = Math.round((weight / sizeTotal) * betPct);
                    });
                } else {
                    result.s75 = betPct;
                }
                return result;
            }

            case 'river': {
                const boardState = riverBoardState || 'dry_runout';
                strategy = lookupRiverStrategy(boardState, handClass, position);
                if (!strategy) return null;
                const betPct = Math.round(strategy.betFreq * 100);
                const checkPct = 100 - betPct;
                const result = { check: checkPct };
                if (strategy.sizes) {
                    const sizeTotal = Object.values(strategy.sizes || {}).reduce((s, v) => s + v, 0) || 1;
                    Object.entries(strategy.sizes || {}).forEach(([sizeKey, weight]) => {
                        result[sizeKey] = Math.round((weight / sizeTotal) * betPct);
                    });
                } else {
                    result.s75 = betPct;
                }
                return result;
            }

            case 'facing_bet': {
                const betSize = facingBetSize || 'medium';
                const street = config.facingStreet || 'flop';
                strategy = lookupFacingBetStrategy(street, betSize, handClass);
                if (!strategy) return null;
                const callPct = Math.round((strategy.callFreq || 0) * 100);
                const raisePct = Math.round((strategy.raiseFreq || 0) * 100);
                const foldPct = Math.max(0, 100 - callPct - raisePct);
                return { call: callPct, raise: raisePct, fold: foldPct };
            }

            default:
                return null;
        }
    } catch {
        return null;
    }
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// GRID CELL COMPONENT
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const PostflopCell = memo(({ hand, freqs, isSelected, onClick, actionFilter, handClass }) => {
    const [hovered, setHovered] = useState(false);
    const hasData = freqs !== null && freqs !== undefined;

    // Get dominant action
    const dominant = useMemo(() => {
        if (!freqs) return { color: '#1a1a2e', opacity: 0.15, action: null };
        let maxFreq = 0;
        let maxAction = null;
        Object.entries(freqs || {}).forEach(([action, freq]) => {
            if (freq > maxFreq) { maxFreq = freq; maxAction = action; }
        });
        if (!maxAction) return { color: '#1a1a2e', opacity: 0.15, action: null };
        const color = SIZE_COLORS[maxAction] || '#64748b';
        const opacity = Math.max(0.2, maxFreq / 100);
        const isMixed = maxFreq < 80 && Object.keys(freqs || {}).filter(k => freqs[k] > 0).length > 1;
        return { color, opacity, action: maxAction, maxFreq, isMixed };
    }, [freqs]);

    // Action filter dimming
    const isFiltered = actionFilter && freqs && (!freqs[actionFilter] || freqs[actionFilter] <= 0);
    const displayOpacity = isFiltered ? 0.08 : dominant.opacity;

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
                flexDirection: 'column',
                fontSize: 'clamp(6px, 2vw, 9px)',
                fontWeight: 700,
                fontFamily: "'Inter', sans-serif",
                cursor: hasData ? 'pointer' : 'default',
                borderRadius: 2,
                border: isSelected ? '2px solid #00d4ff' : '1px solid rgba(255,255,255,0.06)',
                backgroundColor: hasData ? dominant.color : '#0d0d1a',
                opacity: hasData ? displayOpacity : 0.15,
                color: hasData ? '#fff' : '#333',
                position: 'relative',
                transition: 'all 0.15s ease',
                transform: isSelected ? 'scale(1.15)' : 'scale(1)',
                zIndex: isSelected ? 10 : hovered ? 50 : 1,
                boxShadow: isSelected ? '0 0 12px rgba(0, 212, 255, 0.5)' : 'none',
            }}
        >
            {hand}
            {dominant.isMixed && hasData && !actionFilter && (
                <div style={{
                    position: 'absolute', bottom: 1, right: 1,
                    width: 4, height: 4, borderRadius: '50%',
                    backgroundColor: '#fbbf24',
                }} />
            )}

            {/* Hover tooltip */}
            {hovered && hasData && freqs && (
                <div style={{
                    position: 'absolute',
                    bottom: '110%', left: '50%', transform: 'translateX(-50%)',
                    background: 'linear-gradient(145deg, #1a1a2e 0%, #0f172a 100%)',
                    border: '1px solid rgba(0,212,255,0.3)',
                    borderRadius: 8,
                    padding: '8px 10px',
                    minWidth: 140,
                    zIndex: 100,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#00d4ff', marginBottom: 2, fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>
                        {hand}
                    </div>
                    {handClass && (
                        <div style={{ fontSize: 8, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase' }}>
                            {handClass.replace(/_/g, ' ')}
                        </div>
                    )}
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 3 }}>
                        {Object.entries(freqs || {})
                            .filter(([_, f]) => f > 0)
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 4)
                            .map(([action, freq]) => (
                                <div key={action} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, gap: 8 }}>
                                    <span style={{ color: SIZE_COLORS[action] || '#888', fontWeight: 700 }}>
                                        {SIZE_LABELS[action] || action}
                                    </span>
                                    <span style={{ color: '#94a3b8' }}>{freq}%</span>
                                </div>
                            ))}
                    </div>
                </div>
            )}
        </div>
    );
});
PostflopCell.displayName = 'PostflopCell';

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// HAND DETAIL PANEL
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function PostflopHandDetail({ hand, freqs, handClass, onClose }) {
    if (!hand || !freqs) return null;

    const sorted = Object.entries(freqs || {})
        .filter(([_, f]) => f > 0)
        .sort((a, b) => b[1] - a[1]);

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
                minWidth: 240,
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}
        >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 22, fontWeight: 800, color: '#00d4ff', fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>
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
                <button onClick={onClose} style={{
                    background: 'none', border: 'none', color: '#64748b',
                    cursor: 'pointer', fontSize: 16, padding: 4,
                }}>
                    ✕
                </button>
            </div>

            {/* Hand Class Badge */}
            {handClass && (
                <div style={{
                    fontSize: 10, fontWeight: 700, color: '#94a3b8',
                    textTransform: 'uppercase', letterSpacing: 0.5,
                    marginBottom: 10, padding: '4px 8px',
                    background: 'rgba(255,255,255,0.03)', borderRadius: 6,
                }}>
                    {handClass.replace(/_/g, ' ')}
                </div>
            )}

            {/* Frequency bars */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {sorted.map(([action, freq], i) => {
                    const color = SIZE_COLORS[action] || '#888';
                    const label = SIZE_LABELS[action] || action;
                    return (
                        <div key={action} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 55, fontSize: 10, fontWeight: 700, color, fontFamily: "var(--font-orbitron), 'Orbitron', monospace", textAlign: 'right' }}>
                                {label.length > 8 ? label.slice(0, 7) : label}
                            </div>
                            <div style={{
                                flex: 1, height: 20, background: 'rgba(255,255,255,0.06)',
                                borderRadius: 4, overflow: 'hidden', position: 'relative',
                            }}>
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${freq}%` }}
                                    transition={{ duration: 0.4, ease: 'easeOut' }}
                                    style={{ height: '100%', borderRadius: 4, background: color, opacity: 0.85 }}
                                />
                                <span style={{
                                    position: 'absolute', right: 6, top: 2,
                                    fontSize: 11, fontWeight: 600, color: '#fff',
                                }}>
                                    {freq}%
                                </span>
                                {i === 0 && sorted.length > 1 && (
                                    <span style={{
                                        position: 'absolute', left: 6, top: 3,
                                        fontSize: 8, fontWeight: 700, color: '#4ade80',
                                    }}>
                                        BEST
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div style={{
                marginTop: 10, fontSize: 9, color: '#475569',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                paddingTop: 6,
            }}>
                Solver Strategy • Click another hand to compare
            </div>
        </motion.div>
    );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// BOARD INPUT COMPONENT
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function BoardSelector({ board, onChange }) {
    const [editing, setEditing] = useState(false);
    const [input, setInput] = useState(board?.join(' ') || '');

    const handleSubmit = () => {
        // Parse cards like "Ah Kd 7c" or "AhKd7c"
        const cleaned = input.trim().replace(/\s+/g, ' ');
        let cards = [];
        if (cleaned.includes(' ')) {
            cards = cleaned.split(' ').filter(c => c.length === 2);
        } else {
            // Parse "AhKd7c" as ["Ah", "Kd", "7c"]
            for (let i = 0; i < cleaned.length; i += 2) {
                if (i + 1 < cleaned.length) {
                    cards.push(cleaned.slice(i, i + 2));
                }
            }
        }
        if (cards.length >= 3) {
            onChange(cards.slice(0, 5));
            setEditing(false);
        }
    };

    const CARD_DISPLAY = {
        h: { color: '#ef4444', symbol: '♥' },
        d: { color: '#3b82f6', symbol: '♦' },
        c: { color: '#22c55e', symbol: '♣' },
        s: { color: '#e2e8f0', symbol: '♠' },
    };

    if (editing) {
        return (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                    placeholder="Ah Kd 7c"
                    autoFocus
                    style={{
                        padding: '4px 10px', borderRadius: 6, fontSize: 12,
                        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(0,212,255,0.3)',
                        color: '#e2e8f0', fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                        width: 160,
                    }}
                />
                <button onClick={handleSubmit} style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                    background: 'rgba(0,212,255,0.15)', border: '1px solid rgba(0,212,255,0.3)',
                    color: '#00d4ff', cursor: 'pointer',
                }}>
                    Set
                </button>
                <button onClick={() => setEditing(false)} style={{
                    padding: '4px 8px', borderRadius: 6, fontSize: 10,
                    background: 'none', border: 'none', color: '#64748b', cursor: 'pointer',
                }}>
                    Cancel
                </button>
            </div>
        );
    }

    return (
        <div
            onClick={() => setEditing(true)}
            style={{
                display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer',
                padding: '4px 8px', borderRadius: 6,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
            }}
        >
            <span style={{ fontSize: 9, color: '#64748b', marginRight: 4 }}>Board:</span>
            {board && board.length > 0 ? board.map((card, i) => {
                const suit = card[1];
                const suitInfo = CARD_DISPLAY[suit] || CARD_DISPLAY.s;
                return (
                    <span key={i} style={{
                        fontSize: 14, fontWeight: 800,
                        fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                        color: suitInfo.color,
                        textShadow: '0 1px 4px rgba(0,0,0,0.5)',
                    }}>
                        {card[0]}{suitInfo.symbol}
                    </span>
                );
            }) : (
                <span style={{ fontSize: 10, color: '#475569' }}>Click to set board</span>
            )}
        </div>
    );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// MAIN COMPONENT
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default function PostflopRangeViewer({
    initialBoard = ['A', 'h', 'K', 'd', '7', 'c'],
    initialSpot = 'cbet',
    initialPosition = 'IP',
    compact = false,
}) {
    // Default board: Ah Kd 7c
    const [board, setBoard] = useState(
        Array.isArray(initialBoard) && initialBoard.length >= 3 && initialBoard[0]?.length === 2
            ? initialBoard
            : ['Ah', 'Kd', '7c']
    );
    const [spotType, setSpotType] = useState(initialSpot);
    const [position, setPosition] = useState(initialPosition);
    const [selectedHand, setSelectedHand] = useState(null);
    const [actionFilter, setActionFilter] = useState(null);
    const [turnRunout, setTurnRunout] = useState('brick');
    const [riverBoardState, setRiverBoardState] = useState('dry_runout');
    const [facingBetSize, setFacingBetSize] = useState('medium');

    // Detect board texture
    const boardTexture = useMemo(() => {
        try {
            // Build minimal board analysis for classification
            if (!board || board.length < 3) return 'dry_rainbow_high';
            const ranks = board.map(c => c[0]);
            const suits = board.map(c => c[1]);
            const uniqueSuits = new Set(suits).size;
            const rankOrder = 'AKQJT98765432';
            const rankValues = ranks.map(r => 14 - rankOrder.indexOf(r));
            const avgRank = rankValues.reduce((s, v) => s + v, 0) / rankValues.length;
            const isHigh = avgRank >= 9;

            // Check for pairs
            const rankCounts = {};
            ranks.forEach(r => { rankCounts[r] = (rankCounts[r] || 0) + 1; });
            const hasPair = Object.values(rankCounts || {}).some(c => c >= 2);

            // Check connectivity
            const sorted = [...rankValues].sort((a, b) => b - a);
            const maxGap = Math.max(...sorted.slice(0, -1).map((v, i) => v - sorted[i + 1]));
            const isConnected = maxGap <= 2 && sorted[0] - sorted[sorted.length - 1] <= 4;

            if (hasPair) return isHigh ? 'paired_high' : 'paired_low';
            if (uniqueSuits === 1) return isHigh ? 'monotone_high' : 'monotone_low';
            if (isConnected && sorted[0] >= 10) return 'broadway_dry';
            if (isConnected && sorted[0] <= 8) return 'low_connected';
            if (isConnected) return 'connected_wet';
            if (uniqueSuits === 2) return isHigh ? 'two_tone_high' : 'two_tone_low';
            return isHigh ? 'dry_rainbow_high' : 'dry_rainbow_low';
        } catch {
            return 'dry_rainbow_high';
        }
    }, [board]);

    // Compute all 169 hand frequencies
    const { gridFreqs, handClasses, allActions } = useMemo(() => {
        const freqMap = {};
        const classMap = {};
        const actionSet = new Set();
        const config = {
            spotType,
            boardTexture,
            position,
            board,
            turnRunout,
            riverBoardState,
            facingBetSize,
            facingStreet: SPOT_TYPES.find(s => s.key === spotType)?.street || 'flop',
        };

        for (let r = 0; r < 13; r++) {
            for (let c = 0; c < 13; c++) {
                const hand = getHandNotation(r, c);
                const freqs = getHandFrequencies(hand, config);
                if (freqs) {
                    freqMap[hand] = freqs;
                    Object.entries(freqs || {}).forEach(([action, freq]) => {
                        if (freq > 0) actionSet.add(action);
                    });
                }
                // Classify hand
                try {
                    const cards = handToCards(hand);
                    classMap[hand] = classifyHandClass(cards, board);
                } catch {
                    classMap[hand] = 'air';
                }
            }
        }

        return { gridFreqs: freqMap, handClasses: classMap, allActions: Array.from(actionSet) };
    }, [spotType, boardTexture, position, board, turnRunout, riverBoardState, facingBetSize]);

    // Range stats
    const rangeStats = useMemo(() => {
        const actionTotals = {};
        let totalCombos = 0;
        let bettingCombos = 0;

        for (let r = 0; r < 13; r++) {
            for (let c = 0; c < 13; c++) {
                const hand = getHandNotation(r, c);
                const type = getHandType(r, c);
                const weight = COMBO_WEIGHTS[type];
                const freqs = gridFreqs[hand];
                totalCombos += weight;

                if (freqs) {
                    Object.entries(freqs || {}).forEach(([action, freq]) => {
                        if (freq > 0) {
                            const combos = (freq / 100) * weight;
                            actionTotals[action] = (actionTotals[action] || 0) + combos;
                            if (action !== 'check' && action !== 'fold') {
                                bettingCombos += combos;
                            }
                        }
                    });
                }
            }
        }

        const bettingPct = totalCombos > 0 ? (bettingCombos / totalCombos) * 100 : 0;
        return { actionTotals, totalCombos, bettingCombos, bettingPct };
    }, [gridFreqs]);

    const handleCellClick = useCallback((hand) => {
        setSelectedHand(prev => prev === hand ? null : hand);
    }, []);

    // Sort actions for legend: betting sizes first, then check/call/fold
    const sortedActions = useMemo(() => {
        const order = ['s33', 's50', 's75', 's100', 's125', 's150', 'check', 'call', 'raise', 'fold'];
        return allActions.sort((a, b) => {
            const ia = order.indexOf(a);
            const ib = order.indexOf(b);
            return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        });
    }, [allActions]);

    const selectedFreqs = selectedHand ? gridFreqs[selectedHand] : null;
    const selectedClass = selectedHand ? handClasses[selectedHand] : null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Controls Row */}
            <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
                padding: '8px 12px',
                background: 'rgba(0,0,0,0.25)', borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.06)',
            }}>
                {/* Board Selector */}
                <BoardSelector board={board} onChange={setBoard} />

                {/* Spot Type */}
                <div style={{ display: 'flex', gap: 4 }}>
                    {SPOT_TYPES.map(s => (
                        <button
                            key={s.key}
                            onClick={() => setSpotType(s.key)}
                            style={{
                                padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                                cursor: 'pointer', border: 'none',
                                background: spotType === s.key ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.04)',
                                color: spotType === s.key ? '#00d4ff' : '#94a3b8',
                                transition: 'all 0.15s',
                            }}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>

                {/* Position Toggle */}
                <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
                    {['IP', 'OOP'].map(pos => (
                        <button
                            key={pos}
                            onClick={() => setPosition(pos)}
                            style={{
                                padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                                cursor: 'pointer', border: 'none',
                                background: position === pos ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.04)',
                                color: position === pos ? '#00d4ff' : '#64748b',
                            }}
                        >
                            {pos}
                        </button>
                    ))}
                </div>
            </div>

            {/* Conditional: Turn runout / River state / Facing bet size */}
            {spotType === 'turn_barrel' && (
                <div style={{ display: 'flex', gap: 4, padding: '0 4px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 9, color: '#64748b', alignSelf: 'center' }}>Runout:</span>
                    {['brick', 'overcard', 'flush_completing', 'straight_completing', 'pairing', 'draw_improving'].map(r => (
                        <button key={r} onClick={() => setTurnRunout(r)} style={{
                            padding: '3px 8px', borderRadius: 5, fontSize: 9, fontWeight: 600,
                            border: 'none', cursor: 'pointer',
                            background: turnRunout === r ? 'rgba(0,212,255,0.12)' : 'transparent',
                            color: turnRunout === r ? '#00d4ff' : '#64748b',
                        }}>
                            {r.replace(/_/g, ' ')}
                        </button>
                    ))}
                </div>
            )}

            {spotType === 'river' && (
                <div style={{ display: 'flex', gap: 4, padding: '0 4px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 9, color: '#64748b', alignSelf: 'center' }}>Board:</span>
                    {['dry_runout', 'wet_completed', 'paired_board', 'monotone_board', 'dynamic_board'].map(r => (
                        <button key={r} onClick={() => setRiverBoardState(r)} style={{
                            padding: '3px 8px', borderRadius: 5, fontSize: 9, fontWeight: 600,
                            border: 'none', cursor: 'pointer',
                            background: riverBoardState === r ? 'rgba(0,212,255,0.12)' : 'transparent',
                            color: riverBoardState === r ? '#00d4ff' : '#64748b',
                        }}>
                            {r.replace(/_/g, ' ')}
                        </button>
                    ))}
                </div>
            )}

            {spotType === 'facing_bet' && (
                <div style={{ display: 'flex', gap: 4, padding: '0 4px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 9, color: '#64748b', alignSelf: 'center' }}>Bet Size:</span>
                    {['small', 'medium', 'large', 'pot', 'overbet'].map(r => (
                        <button key={r} onClick={() => setFacingBetSize(r)} style={{
                            padding: '3px 8px', borderRadius: 5, fontSize: 9, fontWeight: 600,
                            border: 'none', cursor: 'pointer',
                            background: facingBetSize === r ? 'rgba(0,212,255,0.12)' : 'transparent',
                            color: facingBetSize === r ? '#00d4ff' : '#64748b',
                        }}>
                            {r}
                        </button>
                    ))}
                </div>
            )}

            {/* Texture + Range Stats */}
            <div style={{
                display: 'flex', justifyContent: 'center', gap: 16, alignItems: 'center',
                padding: '4px 8px', background: 'rgba(0,0,0,0.2)', borderRadius: 8,
            }}>
                <div style={{ fontSize: 9, color: '#94a3b8' }}>
                    <span style={{ color: '#fbbf24', fontWeight: 700 }}>
                        {boardTexture.replace(/_/g, ' ')}
                    </span>
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#00d4ff', fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>
                    Betting: {rangeStats.bettingPct.toFixed(1)}%
                </div>
                <div style={{ fontSize: 9, color: '#64748b' }}>
                    ({Math.round(rangeStats.bettingCombos)}/{Math.round(rangeStats.totalCombos)} combos)
                </div>
            </div>

            {/* Action Legend / Filter */}
            {sortedActions.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'center' }}>
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
                    {sortedActions.map(action => {
                        const isActive = actionFilter === action;
                        const color = SIZE_COLORS[action] || '#888';
                        const combos = rangeStats.actionTotals[action] || 0;
                        const pct = rangeStats.totalCombos > 0 ? ((combos / rangeStats.totalCombos) * 100).toFixed(1) : '0';
                        return (
                            <button
                                key={action}
                                onClick={() => setActionFilter(isActive ? null : action)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 4,
                                    padding: '3px 8px', borderRadius: 6, cursor: 'pointer',
                                    border: `1px solid ${isActive ? color + '60' : 'rgba(255,255,255,0.08)'}`,
                                    background: isActive ? color + '15' : 'transparent',
                                    transition: 'all 0.15s',
                                }}
                            >
                                <div style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color, opacity: 0.85 }} />
                                <span style={{ fontSize: 9, color: isActive ? color : '#94a3b8', fontWeight: 600 }}>
                                    {SIZE_LABELS[action] || action} {pct}%
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Grid + Detail */}
            <div style={{
                display: 'flex', gap: 16, alignItems: 'flex-start', justifyContent: 'center',
                flexWrap: 'wrap', width: '100%',
            }}>
                {/* 13×13 Grid */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(13, 1fr)',
                    gap: 1,
                    width: '100%',
                    maxWidth: compact ? 380 : 500,
                    margin: '0 auto',
                }}>
                    {RANKS.map((_, row) =>
                        RANKS.map((_, col) => {
                            const hand = getHandNotation(row, col);
                            return (
                                <PostflopCell
                                    key={hand}
                                    hand={hand}
                                    freqs={gridFreqs[hand] || null}
                                    isSelected={selectedHand === hand}
                                    onClick={handleCellClick}
                                    actionFilter={actionFilter}
                                    handClass={handClasses[hand]}
                                />
                            );
                        })
                    )}
                </div>

                {/* Detail Panel */}
                <AnimatePresence>
                    {selectedHand && selectedFreqs && (
                        <PostflopHandDetail
                            hand={selectedHand}
                            freqs={selectedFreqs}
                            handClass={selectedClass}
                            onClose={() => setSelectedHand(null)}
                        />
                    )}
                </AnimatePresence>
            </div>

            {/* Footer */}
            <div style={{
                padding: '6px 12px', borderRadius: 8,
                background: 'rgba(255,255,255,0.02)',
                fontSize: 9, color: '#475569', lineHeight: 1.6, textAlign: 'center',
            }}>
                <strong style={{ color: '#94a3b8' }}>Postflop Range Viewer</strong> — Frequencies from PioSolver-calibrated strategy matrices.
                Cell color = dominant action. Click any cell for full breakdown. Filter by action with the buttons above.
            </div>
        </div>
    );
}

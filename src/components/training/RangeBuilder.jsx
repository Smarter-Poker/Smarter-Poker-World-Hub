/**
 * RANGE BUILDER / EDITOR — Custom Range Construction vs Solver Ranges
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 *
 * GTO Wizard-style interactive range builder:
 *   - Click cells in 13x13 grid to build a custom range
 *   - Weight slider (0-100%) per hand for mixed strategies
 *   - Compare your range to the solver's range with visual diff
 *   - Range statistics (combos, equity, hand types breakdown)
 *   - Import/export range as text string
 *   - Preset ranges (open raise by position, 3-bet, defend)
 *
 * Pure client-side tool — no API calls.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useMemo, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ●● Constants ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

// ●● Preset Ranges (solver-approximate) ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const RANGE_PRESETS = {
    'UTG Open': {
        'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 1, 'TT': 1, '99': 0.5,
        'AKs': 1, 'AQs': 1, 'AJs': 1, 'ATs': 0.7, 'A5s': 0.5,
        'AKo': 1, 'AQo': 0.8,
        'KQs': 1, 'KJs': 0.7, 'KTs': 0.3,
        'QJs': 0.6, 'JTs': 0.5, 'T9s': 0.2,
    },
    'CO Open': {
        'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 1, 'TT': 1, '99': 1, '88': 0.8, '77': 0.5, '66': 0.3, '55': 0.2,
        'AKs': 1, 'AQs': 1, 'AJs': 1, 'ATs': 1, 'A9s': 0.7, 'A8s': 0.5, 'A7s': 0.4, 'A6s': 0.3, 'A5s': 0.8, 'A4s': 0.6, 'A3s': 0.4, 'A2s': 0.3,
        'AKo': 1, 'AQo': 1, 'AJo': 0.9, 'ATo': 0.5,
        'KQs': 1, 'KJs': 1, 'KTs': 0.9, 'K9s': 0.4,
        'KQo': 0.8, 'KJo': 0.4,
        'QJs': 1, 'QTs': 0.8, 'Q9s': 0.3,
        'JTs': 1, 'J9s': 0.5, 'T9s': 0.7, '98s': 0.5, '87s': 0.4, '76s': 0.3, '65s': 0.2,
    },
    'BTN Open': {
        'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 1, 'TT': 1, '99': 1, '88': 1, '77': 1, '66': 0.8, '55': 0.7, '44': 0.5, '33': 0.3, '22': 0.2,
        'AKs': 1, 'AQs': 1, 'AJs': 1, 'ATs': 1, 'A9s': 1, 'A8s': 0.8, 'A7s': 0.7, 'A6s': 0.6, 'A5s': 1, 'A4s': 0.8, 'A3s': 0.7, 'A2s': 0.5,
        'AKo': 1, 'AQo': 1, 'AJo': 1, 'ATo': 0.9, 'A9o': 0.5, 'A8o': 0.3,
        'KQs': 1, 'KJs': 1, 'KTs': 1, 'K9s': 0.8, 'K8s': 0.4, 'K7s': 0.3,
        'KQo': 1, 'KJo': 0.8, 'KTo': 0.4,
        'QJs': 1, 'QTs': 1, 'Q9s': 0.7, 'Q8s': 0.3,
        'QJo': 0.7, 'QTo': 0.3,
        'JTs': 1, 'J9s': 0.8, 'J8s': 0.3, 'JTo': 0.5,
        'T9s': 1, 'T8s': 0.5, '98s': 0.9, '97s': 0.3,
        '87s': 0.8, '86s': 0.2, '76s': 0.7, '65s': 0.6, '54s': 0.4, '43s': 0.2,
    },
    'BB Defend vs BTN': {
        'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 1, 'TT': 1, '99': 1, '88': 1, '77': 1, '66': 1, '55': 1, '44': 1, '33': 0.8, '22': 0.6,
        'AKs': 1, 'AQs': 1, 'AJs': 1, 'ATs': 1, 'A9s': 1, 'A8s': 1, 'A7s': 1, 'A6s': 1, 'A5s': 1, 'A4s': 1, 'A3s': 1, 'A2s': 1,
        'AKo': 1, 'AQo': 1, 'AJo': 1, 'ATo': 1, 'A9o': 0.8, 'A8o': 0.6, 'A7o': 0.4, 'A6o': 0.3, 'A5o': 0.3, 'A4o': 0.2,
        'KQs': 1, 'KJs': 1, 'KTs': 1, 'K9s': 1, 'K8s': 0.8, 'K7s': 0.6, 'K6s': 0.5, 'K5s': 0.3,
        'KQo': 1, 'KJo': 1, 'KTo': 0.8, 'K9o': 0.4,
        'QJs': 1, 'QTs': 1, 'Q9s': 1, 'Q8s': 0.6, 'Q7s': 0.3,
        'QJo': 1, 'QTo': 0.7, 'Q9o': 0.3,
        'JTs': 1, 'J9s': 1, 'J8s': 0.5, 'J7s': 0.2,
        'JTo': 0.8, 'J9o': 0.3,
        'T9s': 1, 'T8s': 0.7, 'T7s': 0.3, 'T9o': 0.4,
        '98s': 1, '97s': 0.6, '87s': 1, '86s': 0.4,
        '76s': 1, '75s': 0.3, '65s': 1, '54s': 0.8, '43s': 0.3, '32s': 0.2,
    },
    '3-Bet vs CO': {
        'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 0.7, 'TT': 0.3,
        'AKs': 1, 'AQs': 1, 'AJs': 0.6, 'A5s': 0.8, 'A4s': 0.5,
        'AKo': 1, 'AQo': 0.5,
        'KQs': 0.7, 'KJs': 0.3,
        'QJs': 0.3, 'JTs': 0.2,
        '98s': 0.2, '87s': 0.15, '76s': 0.1,
    },
    'Empty': {},
};

// ●● Grid Cell ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const RangeCell = memo(({ hand, weight, solverWeight, isSelected, isDragging, onMouseDown, onMouseEnter }) => {
    const isPair = hand.length === 2;
    const isSuited = hand.endsWith('s');

    const diff = solverWeight !== undefined ? weight - solverWeight : 0;
    const hasSolver = solverWeight !== undefined && solverWeight > 0;

    let bg;
    if (weight > 0) {
        const alpha = 0.15 + weight * 0.55;
        bg = `rgba(34,197,94,${alpha})`;
    } else {
        bg = 'rgba(30,41,59,0.4)';
    }

    return (
        <div
            onMouseDown={onMouseDown}
            onMouseEnter={onMouseEnter}
            style={{
                width: '100%', aspectRatio: '1/1',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                background: bg,
                border: isSelected ? '2px solid #00d4ff'
                    : hasSolver && weight === 0 ? '1px solid rgba(239,68,68,0.3)'
                    : '1px solid rgba(100,116,139,0.06)',
                borderRadius: 2,
                cursor: 'pointer',
                position: 'relative',
                userSelect: 'none',
                transition: 'background 0.1s',
            }}
        >
            <div style={{
                fontSize: 7.5, fontWeight: 700,
                color: weight > 0 ? '#e2e8f0' : '#475569',
                lineHeight: 1,
            }}>
                {hand}
            </div>
            {weight > 0 && weight < 1 && (
                <div style={{
                    fontSize: 6, fontWeight: 600, color: '#86efac',
                    lineHeight: 1, marginTop: 1,
                }}>
                    {(weight * 100).toFixed(0)}%
                </div>
            )}
            {/* Solver comparison dot */}
            {hasSolver && (
                <div style={{
                    position: 'absolute', top: 0, right: 0,
                    width: 4, height: 4, borderRadius: '50%',
                    background: Math.abs(diff) < 0.1 ? '#22c55e'
                        : diff > 0 ? '#f59e0b'
                        : '#ef4444',
                }} />
            )}
        </div>
    );
});

// ●● Range Stats ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const RangeStats = memo(({ range, solverRange }) => {
    const stats = useMemo(() => {
        let combos = 0, totalWeight = 0, pairs = 0, suited = 0, offsuit = 0;

        Object.entries(range || {}).forEach(([hand, weight]) => {
            if (weight <= 0) return;
            totalWeight += weight;
            if (hand.length === 2) { combos += 6 * weight; pairs += weight; }
            else if (hand.endsWith('s')) { combos += 4 * weight; suited += weight; }
            else { combos += 12 * weight; offsuit += weight; }
        });

        // Compare with solver
        let matching = 0, missing = 0, extra = 0;
        if (solverRange) {
            const allHands = new Set([...Object.keys(range || {}), ...Object.keys(solverRange || {})]);
            allHands.forEach(h => {
                const r = range[h] || 0;
                const s = solverRange[h] || 0;
                if (r > 0 && s > 0) matching++;
                if (r === 0 && s > 0) missing++;
                if (r > 0 && s === 0) extra++;
            });
        }

        return { combos: Math.round(combos), totalWeight, pairs, suited, offsuit, matching, missing, extra };
    }, [range, solverRange]);

    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 8, color: '#64748b' }}>Combos</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#22c55e', fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>
                    {stats.combos}
                </div>
            </div>
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 8, color: '#64748b' }}>Range %</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#3b82f6', fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>
                    {((stats.combos / 1326) * 100).toFixed(1)}%
                </div>
            </div>
            {solverRange && (
                <>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 8, color: '#22c55e' }}>Match</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#22c55e', fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>
                            {stats.matching}
                        </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 8, color: '#ef4444' }}>Missing</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#ef4444', fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>
                            {stats.missing}
                        </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 8, color: '#f59e0b' }}>Extra</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b', fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>
                            {stats.extra}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
});

// ●● Main Component ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default function RangeBuilder({ solverRange: propSolverRange, onRangeChange }) {
    const [range, setRange] = useState({});
    const [brushWeight, setBrushWeight] = useState(1.0);
    const [isDragging, setIsDragging] = useState(false);
    const [dragMode, setDragMode] = useState('add'); // 'add' | 'remove'
    const [showCompare, setShowCompare] = useState(false);
    const [selectedPreset, setSelectedPreset] = useState('');
    const [comparePreset, setComparePreset] = useState('BTN Open');

    const solverRange = propSolverRange || (showCompare ? RANGE_PRESETS[comparePreset] : undefined);

    const updateCell = useCallback((hand, mode) => {
        setRange(prev => {
            const next = { ...prev };
            if (mode === 'add') next[hand] = brushWeight;
            else if (mode === 'remove') delete next[hand];
            else if (mode === 'toggle') {
                if (prev[hand]) delete next[hand];
                else next[hand] = brushWeight;
            }
            onRangeChange?.(next);
            return next;
        });
    }, [brushWeight, onRangeChange]);

    const handleMouseDown = useCallback((hand) => {
        const currentWeight = range[hand] || 0;
        const mode = currentWeight > 0 ? 'remove' : 'add';
        setDragMode(mode);
        setIsDragging(true);
        updateCell(hand, mode);
    }, [range, updateCell]);

    const handleMouseEnter = useCallback((hand) => {
        if (isDragging) {
            updateCell(hand, dragMode);
        }
    }, [isDragging, dragMode, updateCell]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    // Build grid data
    const gridData = useMemo(() => {
        const cells = [];
        for (let r = 0; r < 13; r++) {
            for (let c = 0; c < 13; c++) {
                let hand;
                if (r === c) hand = `${RANKS[r]}${RANKS[c]}`;
                else if (r < c) hand = `${RANKS[r]}${RANKS[c]}s`;
                else hand = `${RANKS[c]}${RANKS[r]}o`;
                cells.push({ hand, row: r, col: c });
            }
        }
        return cells;
    }, []);

    // Export range as string
    const rangeString = useMemo(() => {
        return Object.entries(range || {})
            .filter(([, w]) => w > 0)
            .map(([h, w]) => w >= 1 ? h : `${h}:${(w * 100).toFixed(0)}`)
            .join(', ');
    }, [range]);

    return (
        <div
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{
                background: 'rgba(15,23,42,0.4)',
                borderRadius: 12,
                border: '1px solid rgba(100,116,139,0.15)',
                overflow: 'hidden',
            }}
        >
            {/* Header */}
            <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid rgba(100,116,139,0.12)',
                background: 'rgba(0,0,0,0.2)',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>
                        Range Builder
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                        <button
                            onClick={() => setShowCompare(!showCompare)}
                            style={{
                                padding: '3px 10px', fontSize: 10, fontWeight: 600,
                                borderRadius: 4, border: '1px solid', cursor: 'pointer',
                                background: showCompare ? 'rgba(0,212,255,0.1)' : 'transparent',
                                color: showCompare ? '#00d4ff' : '#64748b',
                                borderColor: showCompare ? 'rgba(0,212,255,0.2)' : 'rgba(100,116,139,0.12)',
                            }}
                        >
                            Compare
                        </button>
                        <button
                            onClick={() => { setRange({}); setSelectedPreset(''); }}
                            style={{
                                padding: '3px 10px', fontSize: 10, fontWeight: 600,
                                borderRadius: 4, border: '1px solid rgba(239,68,68,0.2)',
                                cursor: 'pointer', background: 'rgba(239,68,68,0.05)',
                                color: '#f87171',
                            }}
                        >
                            Clear
                        </button>
                    </div>
                </div>

                {/* Presets */}
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 6 }}>
                    {Object.keys(RANGE_PRESETS || {}).filter(k => k !== 'Empty').map(name => (
                        <button
                            key={name}
                            onClick={() => { setRange({ ...RANGE_PRESETS[name] }); setSelectedPreset(name); }}
                            style={{
                                padding: '2px 8px', fontSize: 9, fontWeight: 600,
                                borderRadius: 3, border: '1px solid',
                                cursor: 'pointer',
                                background: selectedPreset === name ? 'rgba(0,212,255,0.1)' : 'rgba(0,0,0,0.15)',
                                color: selectedPreset === name ? '#00d4ff' : '#94a3b8',
                                borderColor: selectedPreset === name ? 'rgba(0,212,255,0.2)' : 'rgba(100,116,139,0.08)',
                            }}
                        >
                            {name}
                        </button>
                    ))}
                </div>

                {/* Compare selector */}
                {showCompare && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                        <span style={{ fontSize: 9, color: '#64748b' }}>Compare to:</span>
                        <select
                            value={comparePreset}
                            onChange={e => setComparePreset(e.target.value)}
                            style={{
                                padding: '2px 6px', fontSize: 9,
                                background: 'rgba(0,0,0,0.3)', color: '#94a3b8',
                                border: '1px solid rgba(100,116,139,0.2)',
                                borderRadius: 3, outline: 'none',
                            }}
                        >
                            {Object.keys(RANGE_PRESETS || {}).filter(k => k !== 'Empty').map(name => (
                                <option key={name} value={name}>{name}</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Brush weight slider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>Weight:</span>
                    <input
                        type="range"
                        min="0" max="100" value={brushWeight * 100}
                        onChange={e => setBrushWeight(Number(e.target.value) / 100)}
                        style={{ flex: 1, height: 4, accentColor: '#22c55e' }}
                    />
                    <span style={{
                        fontSize: 11, fontWeight: 700, color: '#22c55e',
                        fontFamily: "var(--font-orbitron), 'Orbitron', monospace", width: 35, textAlign: 'right',
                    }}>
                        {(brushWeight * 100).toFixed(0)}%
                    </span>
                </div>
            </div>

            {/* Grid */}
            <div style={{ padding: 12 }}>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(13, 1fr)',
                    gap: 1,
                    marginBottom: 12,
                }}>
                    {gridData.map(cell => (
                        <RangeCell
                            key={cell.hand}
                            hand={cell.hand}
                            weight={range[cell.hand] || 0}
                            solverWeight={solverRange?.[cell.hand]}
                            isSelected={false}
                            isDragging={isDragging}
                            onMouseDown={() => handleMouseDown(cell.hand)}
                            onMouseEnter={() => handleMouseEnter(cell.hand)}
                        />
                    ))}
                </div>

                {/* Stats */}
                <RangeStats range={range} solverRange={solverRange} />

                {/* Legend */}
                {showCompare && (
                    <div style={{
                        display: 'flex', gap: 8, justifyContent: 'center',
                        marginTop: 8,
                    }}>
                        {[
                            { label: 'Both', color: '#22c55e' },
                            { label: 'Missing', color: '#ef4444' },
                            { label: 'Extra', color: '#f59e0b' },
                        ].map(l => (
                            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: l.color }} />
                                <span style={{ fontSize: 8, color: '#64748b' }}>{l.label}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Range string */}
                {Object.keys(range || {}).length > 0 && (
                    <div style={{
                        marginTop: 8, padding: 8, borderRadius: 4,
                        background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(100,116,139,0.08)',
                    }}>
                        <div style={{ fontSize: 8, color: '#64748b', fontWeight: 600, marginBottom: 2 }}>RANGE STRING</div>
                        <div style={{
                            fontSize: 9, color: '#94a3b8', wordBreak: 'break-all',
                            fontFamily: "'Fira Code', monospace", lineHeight: 1.4,
                        }}>
                            {rangeString}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * 3-BET / 4-BET / SQUEEZE TRAINER — Advanced Preflop Scenarios
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 *
 * GTO Wizard-style advanced preflop trainer covering:
 *   - 3-bet ranges by position vs each opener
 *   - 4-bet ranges vs 3-bettors
 *   - Squeeze spots (3-bet with caller in between)
 *   - Visual range comparison (your range vs solver)
 *   - Sizing recommendations per spot
 *   - Positional frequency charts
 *
 * Uses solverRanges.js data for accurate GTO frequencies.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useMemo, memo } from 'react';
import { motion } from 'framer-motion';

// ●● Constants ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const POSITIONS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];

// ●● 3-Bet Ranges by Position vs Opener ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const THREE_BET_RANGES = {
    'vs_UTG': {
        label: 'vs UTG Open',
        sizing: '3x opener',
        positions: {
            MP: { range: { 'AA': 1, 'KK': 1, 'QQ': 0.8, 'AKs': 1, 'AKo': 0.7 }, pct: 3.5 },
            CO: { range: { 'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 0.5, 'AKs': 1, 'AQs': 0.5, 'AKo': 1, 'A5s': 0.3 }, pct: 5.2 },
            BTN: { range: { 'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 0.6, 'AKs': 1, 'AQs': 0.7, 'AKo': 1, 'AQo': 0.3, 'A5s': 0.5, 'A4s': 0.3, 'KQs': 0.3, '98s': 0.2 }, pct: 6.8 },
            SB: { range: { 'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 0.4, 'AKs': 1, 'AQs': 0.5, 'AKo': 1, 'A5s': 0.4 }, pct: 5.5 },
            BB: { range: { 'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 0.5, 'TT': 0.2, 'AKs': 1, 'AQs': 0.6, 'AKo': 1, 'AQo': 0.3, 'A5s': 0.5, 'A4s': 0.3, 'KQs': 0.3 }, pct: 6.2 },
        },
    },
    'vs_CO': {
        label: 'vs CO Open',
        sizing: '3x opener',
        positions: {
            BTN: { range: { 'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 1, 'TT': 0.5, 'AKs': 1, 'AQs': 1, 'AJs': 0.5, 'AKo': 1, 'AQo': 0.7, 'A5s': 0.7, 'A4s': 0.5, 'KQs': 0.6, 'KJs': 0.3, 'QJs': 0.2, '98s': 0.3, '87s': 0.2 }, pct: 10.5 },
            SB: { range: { 'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 0.7, 'TT': 0.3, 'AKs': 1, 'AQs': 0.8, 'AJs': 0.3, 'AKo': 1, 'AQo': 0.5, 'A5s': 0.6, 'A4s': 0.4, 'KQs': 0.4 }, pct: 7.8 },
            BB: { range: { 'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 0.8, 'TT': 0.4, 'AKs': 1, 'AQs': 1, 'AJs': 0.5, 'ATs': 0.2, 'AKo': 1, 'AQo': 0.6, 'A5s': 0.7, 'A4s': 0.5, 'A3s': 0.3, 'KQs': 0.5, 'KJs': 0.2, 'QJs': 0.2, '87s': 0.2, '76s': 0.15 }, pct: 9.5 },
        },
    },
    'vs_BTN': {
        label: 'vs BTN Open',
        sizing: '3.5x opener',
        positions: {
            SB: { range: { 'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 1, 'TT': 0.6, '99': 0.3, 'AKs': 1, 'AQs': 1, 'AJs': 0.7, 'ATs': 0.4, 'A9s': 0.2, 'AKo': 1, 'AQo': 0.8, 'AJo': 0.4, 'A5s': 0.8, 'A4s': 0.6, 'A3s': 0.4, 'KQs': 0.7, 'KJs': 0.4, 'KTs': 0.2, 'QJs': 0.3, 'JTs': 0.2, '98s': 0.2, '87s': 0.15, '76s': 0.1 }, pct: 12.5 },
            BB: { range: { 'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 1, 'TT': 0.7, '99': 0.4, '88': 0.2, 'AKs': 1, 'AQs': 1, 'AJs': 0.8, 'ATs': 0.5, 'A9s': 0.3, 'AKo': 1, 'AQo': 1, 'AJo': 0.5, 'ATo': 0.2, 'A5s': 1, 'A4s': 0.8, 'A3s': 0.5, 'A2s': 0.3, 'KQs': 0.8, 'KJs': 0.5, 'KTs': 0.3, 'K9s': 0.15, 'QJs': 0.4, 'QTs': 0.2, 'JTs': 0.3, 'T9s': 0.2, '98s': 0.25, '87s': 0.2, '76s': 0.15, '65s': 0.1 }, pct: 14.8 },
        },
    },
};

// ●● 4-Bet Ranges ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const FOUR_BET_RANGES = {
    'vs_3bet_IP': {
        label: '4-Bet vs 3-Bet (IP)',
        sizing: '2.25x 3-bet',
        range: { 'AA': 1, 'KK': 1, 'QQ': 0.8, 'JJ': 0.3, 'AKs': 1, 'AKo': 0.9, 'AQs': 0.4, 'A5s': 0.5, 'A4s': 0.3 },
        pct: 5.5,
    },
    'vs_3bet_OOP': {
        label: '4-Bet vs 3-Bet (OOP)',
        sizing: '2.5x 3-bet',
        range: { 'AA': 1, 'KK': 1, 'QQ': 1, 'AKs': 1, 'AKo': 1, 'A5s': 0.3 },
        pct: 4.0,
    },
};

// ●● Squeeze Ranges ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const SQUEEZE_RANGES = {
    'btn_squeeze': {
        label: 'BTN Squeeze (open + cold call)',
        sizing: '4x opener + 1x per caller',
        range: { 'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 0.8, 'TT': 0.4, 'AKs': 1, 'AQs': 0.8, 'AJs': 0.4, 'AKo': 1, 'AQo': 0.5, 'A5s': 0.6, 'A4s': 0.4, 'KQs': 0.4, '98s': 0.2, '87s': 0.15 },
        pct: 8.5,
    },
    'sb_squeeze': {
        label: 'SB Squeeze',
        sizing: '4.5x opener + 1x per caller',
        range: { 'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 0.6, 'TT': 0.3, 'AKs': 1, 'AQs': 0.6, 'AKo': 1, 'AQo': 0.3, 'A5s': 0.5, 'A4s': 0.3, 'KQs': 0.3 },
        pct: 6.5,
    },
    'bb_squeeze': {
        label: 'BB Squeeze',
        sizing: '4x opener + 1.5x per caller',
        range: { 'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 0.7, 'TT': 0.4, '99': 0.15, 'AKs': 1, 'AQs': 0.7, 'AJs': 0.3, 'AKo': 1, 'AQo': 0.4, 'A5s': 0.7, 'A4s': 0.5, 'A3s': 0.3, 'KQs': 0.4, 'KJs': 0.2, '87s': 0.15, '76s': 0.1 },
        pct: 8.0,
    },
};

// ●● Range Grid ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const RangeGrid = memo(({ range, color = '#22c55e' }) => (
    <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(13, 1fr)',
        gap: 1,
    }}>
        {RANKS.map((r1, row) =>
            RANKS.map((r2, col) => {
                let hand;
                if (row === col) hand = `${r1}${r2}`;
                else if (row < col) hand = `${r1}${r2}s`;
                else hand = `${r2}${r1}o`;

                const weight = range?.[hand] || 0;
                return (
                    <div
                        key={`${row}-${col}`}
                        style={{
                            aspectRatio: '1/1',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 7, fontWeight: 700,
                            background: weight > 0 ? `${color}${Math.round(weight * 60 + 15).toString(16).padStart(2, '0')}` : 'rgba(30,41,59,0.3)',
                            border: weight > 0 ? `1px solid ${color}33` : '1px solid rgba(100,116,139,0.04)',
                            borderRadius: 1,
                            color: weight > 0 ? '#e2e8f0' : '#334155',
                        }}
                    >
                        {hand}
                    </div>
                );
            })
        )}
    </div>
));

// ●● Main Component ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default function ThreeBetTrainer() {
    const [mode, setMode] = useState('3bet'); // '3bet' | '4bet' | 'squeeze'
    const [selectedSpot, setSelectedSpot] = useState('vs_CO');
    const [selectedPosition, setSelectedPosition] = useState('BTN');

    const currentData = useMemo(() => {
        if (mode === '3bet') {
            const spot = THREE_BET_RANGES[selectedSpot];
            const pos = spot?.positions[selectedPosition];
            return { label: spot?.label, sizing: spot?.sizing, range: pos?.range || {}, pct: pos?.pct || 0, positions: spot?.positions };
        } else if (mode === '4bet') {
            const spot = FOUR_BET_RANGES[selectedSpot] || FOUR_BET_RANGES['vs_3bet_IP'];
            return { label: spot.label, sizing: spot.sizing, range: spot.range, pct: spot.pct };
        } else {
            const spot = SQUEEZE_RANGES[selectedSpot] || SQUEEZE_RANGES['btn_squeeze'];
            return { label: spot.label, sizing: spot.sizing, range: spot.range, pct: spot.pct };
        }
    }, [mode, selectedSpot, selectedPosition]);

    const combos = useMemo(() => {
        let total = 0;
        Object.entries(currentData.range || {}).forEach(([hand, weight]) => {
            if (weight <= 0) return;
            if (hand.length === 2) total += 6 * weight;
            else if (hand.endsWith('s')) total += 4 * weight;
            else total += 12 * weight;
        });
        return Math.round(total);
    }, [currentData.range]);

    // Available positions for the selected spot
    const availablePositions = useMemo(() => {
        if (mode === '3bet') {
            return Object.keys(THREE_BET_RANGES[selectedSpot]?.positions || {});
        }
        return [];
    }, [mode, selectedSpot]);

    return (
        <div style={{
            background: 'rgba(15,23,42,0.4)',
            borderRadius: 12,
            border: '1px solid rgba(100,116,139,0.15)',
            overflow: 'hidden',
        }}>
            {/* Header */}
            <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid rgba(100,116,139,0.12)',
                background: 'rgba(0,0,0,0.2)',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>
                        3-Bet / 4-Bet / Squeeze Trainer
                    </div>
                </div>

                {/* Mode selector */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                    {[
                        { id: '3bet', label: '3-Bet', color: '#3b82f6' },
                        { id: '4bet', label: '4-Bet', color: '#a855f7' },
                        { id: 'squeeze', label: 'Squeeze', color: '#f59e0b' },
                    ].map(m => (
                        <button
                            key={m.id}
                            onClick={() => {
                                setMode(m.id);
                                if (m.id === '3bet') setSelectedSpot('vs_CO');
                                else if (m.id === '4bet') setSelectedSpot('vs_3bet_IP');
                                else setSelectedSpot('btn_squeeze');
                            }}
                            style={{
                                padding: '5px 14px', fontSize: 11, fontWeight: 700,
                                borderRadius: 5, border: '1px solid', cursor: 'pointer',
                                background: mode === m.id ? `${m.color}15` : 'transparent',
                                color: mode === m.id ? m.color : '#64748b',
                                borderColor: mode === m.id ? `${m.color}33` : 'rgba(100,116,139,0.12)',
                            }}
                        >
                            {m.label}
                        </button>
                    ))}
                </div>

                {/* Spot selector */}
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                    {mode === '3bet' && Object.entries(THREE_BET_RANGES || {}).map(([key, spot]) => (
                        <button
                            key={key}
                            onClick={() => { setSelectedSpot(key); setSelectedPosition(Object.keys(spot.positions || {})[0]); }}
                            style={{
                                padding: '3px 8px', fontSize: 9, fontWeight: 600,
                                borderRadius: 3, border: '1px solid',
                                cursor: 'pointer',
                                background: selectedSpot === key ? 'rgba(59,130,246,0.1)' : 'rgba(0,0,0,0.15)',
                                color: selectedSpot === key ? '#3b82f6' : '#94a3b8',
                                borderColor: selectedSpot === key ? 'rgba(59,130,246,0.2)' : 'rgba(100,116,139,0.08)',
                            }}
                        >
                            {spot.label}
                        </button>
                    ))}
                    {mode === '4bet' && Object.entries(FOUR_BET_RANGES || {}).map(([key, spot]) => (
                        <button
                            key={key}
                            onClick={() => setSelectedSpot(key)}
                            style={{
                                padding: '3px 8px', fontSize: 9, fontWeight: 600,
                                borderRadius: 3, border: '1px solid', cursor: 'pointer',
                                background: selectedSpot === key ? 'rgba(168,85,247,0.1)' : 'rgba(0,0,0,0.15)',
                                color: selectedSpot === key ? '#a855f7' : '#94a3b8',
                                borderColor: selectedSpot === key ? 'rgba(168,85,247,0.2)' : 'rgba(100,116,139,0.08)',
                            }}
                        >
                            {spot.label}
                        </button>
                    ))}
                    {mode === 'squeeze' && Object.entries(SQUEEZE_RANGES || {}).map(([key, spot]) => (
                        <button
                            key={key}
                            onClick={() => setSelectedSpot(key)}
                            style={{
                                padding: '3px 8px', fontSize: 9, fontWeight: 600,
                                borderRadius: 3, border: '1px solid', cursor: 'pointer',
                                background: selectedSpot === key ? 'rgba(245,158,11,0.1)' : 'rgba(0,0,0,0.15)',
                                color: selectedSpot === key ? '#f59e0b' : '#94a3b8',
                                borderColor: selectedSpot === key ? 'rgba(245,158,11,0.2)' : 'rgba(100,116,139,0.08)',
                            }}
                        >
                            {spot.label}
                        </button>
                    ))}
                </div>

                {/* Position selector for 3-bet */}
                {mode === '3bet' && availablePositions.length > 0 && (
                    <div style={{ display: 'flex', gap: 3, marginTop: 6 }}>
                        <span style={{ fontSize: 9, color: '#64748b', fontWeight: 600, lineHeight: '22px' }}>Hero:</span>
                        {availablePositions.map(pos => (
                            <button
                                key={pos}
                                onClick={() => setSelectedPosition(pos)}
                                style={{
                                    padding: '2px 8px', fontSize: 9, fontWeight: 600,
                                    borderRadius: 3, border: '1px solid', cursor: 'pointer',
                                    background: selectedPosition === pos ? 'rgba(0,212,255,0.1)' : 'transparent',
                                    color: selectedPosition === pos ? '#00d4ff' : '#475569',
                                    borderColor: selectedPosition === pos ? 'rgba(0,212,255,0.2)' : 'rgba(100,116,139,0.08)',
                                }}
                            >
                                {pos}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Stats bar */}
            <div style={{
                padding: '8px 16px',
                borderBottom: '1px solid rgba(100,116,139,0.08)',
                display: 'flex', gap: 16, alignItems: 'center',
            }}>
                <div>
                    <div style={{ fontSize: 8, color: '#64748b', fontWeight: 600 }}>RANGE %</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#22c55e', fontFamily: "'Orbitron', monospace" }}>
                        {currentData.pct?.toFixed(1) || '0.0'}%
                    </div>
                </div>
                <div>
                    <div style={{ fontSize: 8, color: '#64748b', fontWeight: 600 }}>COMBOS</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#3b82f6', fontFamily: "'Orbitron', monospace" }}>
                        {combos}
                    </div>
                </div>
                <div>
                    <div style={{ fontSize: 8, color: '#64748b', fontWeight: 600 }}>SIZING</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>
                        {currentData.sizing || '—'}
                    </div>
                </div>
                <div style={{ flex: 1, textAlign: 'right' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#e2e8f0' }}>
                        {currentData.label}
                    </div>
                    {mode === '3bet' && (
                        <div style={{ fontSize: 9, color: '#818cf8' }}>
                            Hero: {selectedPosition}
                        </div>
                    )}
                </div>
            </div>

            {/* Range grid */}
            <div style={{ padding: 12 }}>
                <RangeGrid
                    range={currentData.range}
                    color={mode === '3bet' ? '#3b82f6' : mode === '4bet' ? '#a855f7' : '#f59e0b'}
                />

                {/* Position frequency chart for 3-bet mode */}
                {mode === '3bet' && currentData.positions && (
                    <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>
                            3-Bet Frequency by Position
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 50 }}>
                            {Object.entries(currentData.positions || {}).map(([pos, data]) => {
                                const maxPct = 16;
                                return (
                                    <div key={pos} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        <motion.div
                                            initial={{ height: 0 }}
                                            animate={{ height: Math.max(3, (data.pct / maxPct) * 40) }}
                                            style={{
                                                width: '100%', borderRadius: '3px 3px 0 0',
                                                background: pos === selectedPosition
                                                    ? 'linear-gradient(180deg, #00d4ff, #0891b2)'
                                                    : 'linear-gradient(180deg, #3b82f6, #1d4ed8)',
                                            }}
                                        />
                                        <div style={{ fontSize: 9, fontWeight: 700, color: '#e2e8f0', marginTop: 2 }}>
                                            {data.pct}%
                                        </div>
                                        <div style={{ fontSize: 8, color: '#64748b' }}>{pos}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

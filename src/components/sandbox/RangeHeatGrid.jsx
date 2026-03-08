/**
 * RangeHeatGrid — 13×13 opponent range visualizer
 * Shows how each combo in villain's range performs against the current board
 */
import React, { useMemo } from 'react';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

// Pre-calculate simple hand strength from rank order
function getComboStrength(r1, r2, isSuited, boardRanks = []) {
    const order = 'AKQJT98765432';
    const i1 = order.indexOf(r1), i2 = order.indexOf(r2);
    let score = 0;

    // Base score from card ranks
    score += (13 - i1) * 2 + (13 - i2);

    // Pair bonus
    if (r1 === r2) score += 15;

    // Suited bonus
    if (isSuited) score += 4;

    // Connectivity bonus
    const gap = Math.abs(i1 - i2);
    if (gap === 1) score += 3;
    else if (gap === 2) score += 1;

    // Board interaction
    if (boardRanks.length > 0) {
        // Top pair
        if (boardRanks.includes(r1) || boardRanks.includes(r2)) score += 12;
        // Overpair
        if (r1 === r2 && i1 < Math.min(...boardRanks.map(r => order.indexOf(r)))) score += 10;
    }

    return Math.min(100, Math.max(0, score));
}

function getHeatColor(strength) {
    // 0=cold(fold), 50=neutral, 100=hot(strong)
    if (strength >= 80) return { bg: 'rgba(34,197,94,0.35)', border: '#22c55e', text: '#4ade80' };
    if (strength >= 60) return { bg: 'rgba(59,130,246,0.3)', border: '#3b82f6', text: '#93c5fd' };
    if (strength >= 40) return { bg: 'rgba(251,191,36,0.25)', border: '#fbbf24', text: '#fde68a' };
    if (strength >= 20) return { bg: 'rgba(249,115,22,0.25)', border: '#f97316', text: '#fdba74' };
    return { bg: 'rgba(239,68,68,0.2)', border: '#ef4444', text: '#fca5a5' };
}

export default function RangeHeatGrid({ boardCards = [], isOpen, onClose }) {
    if (!isOpen) return null;

    const boardRanks = useMemo(() => boardCards.map(c => c?.[0]).filter(Boolean), [boardCards]);

    const grid = useMemo(() => {
        return RANKS.map((r1, i) =>
            RANKS.map((r2, j) => {
                const isSuited = i < j;
                const isPair = i === j;
                const label = isPair ? `${r1}${r2}` : isSuited ? `${r1}${r2}s` : `${r2}${r1}o`;
                const strength = getComboStrength(r1, r2, isSuited, boardRanks);
                return { label, strength, isSuited, isPair };
            })
        );
    }, [boardRanks]);

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 69, background: 'rgba(0,0,0,0.5)' }} />
            <div style={{
                position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 70,
                background: '#1a1a2e', borderRadius: '16px 16px 0 0',
                padding: '12px 6px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
                boxShadow: '0 -8px 30px rgba(0,0,0,0.6)',
                maxHeight: '70vh', overflowY: 'auto',
            }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                    <div style={{ width: 40, height: 4, borderRadius: 2, background: '#4E4F50' }} />
                </div>
                <div style={{ textAlign: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#B0B3B8', textTransform: 'uppercase', letterSpacing: 1 }}>
                        Opponent Range vs Board
                    </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(13, 1fr)`, gap: 1 }}>
                    {grid.flat().map((cell, idx) => {
                        const colors = getHeatColor(cell.strength);
                        return (
                            <div key={idx} style={{
                                aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 6, fontWeight: 700, borderRadius: 2,
                                background: colors.bg, border: `1px solid ${colors.border}44`,
                                color: colors.text, lineHeight: 1,
                            }}>
                                {cell.label}
                            </div>
                        );
                    })}
                </div>
                {/* Legend */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 8 }}>
                    {[
                        { label: 'Strong', color: '#22c55e' },
                        { label: 'Good', color: '#3b82f6' },
                        { label: 'Marginal', color: '#fbbf24' },
                        { label: 'Weak', color: '#f97316' },
                        { label: 'Fold', color: '#ef4444' },
                    ].map(l => (
                        <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />
                            <span style={{ fontSize: 8, color: '#B0B3B8' }}>{l.label}</span>
                        </div>
                    ))}
                </div>
                <button onClick={onClose} style={{
                    marginTop: 8, width: '100%', padding: 10, borderRadius: 8, fontSize: 12, fontWeight: 700,
                    background: 'rgba(35,116,225,0.15)', border: '1px solid rgba(35,116,225,0.2)',
                    color: '#4599FF', cursor: 'pointer',
                }}>Close</button>
            </div>
        </>
    );
}

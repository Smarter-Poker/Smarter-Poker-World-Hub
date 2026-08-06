/**
 * RunoutHeatmap — GTO Wizard-Style Turn/River Runout Analysis
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * A 4-suit × 13-rank mini-grid showing how every possible runout card
 * impacts Hero's equity and EV. Color-coded:
 *   - Green: Good card for Hero (EV gain / equity improvement)
 *   - Red: Bad card for Hero (EV loss / equity drop)
 *   - Gray: Dead card (already on board or in hero's hand)
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS = [
    { code: 'h', symbol: '♥', color: '#ef4444' },
    { code: 'd', symbol: '♦', color: '#3b82f6' },
    { code: 'c', symbol: '♣', color: '#22c55e' },
    { code: 's', symbol: '♠', color: '#e2e8f0' },
];

/**
 * Interpolate color from red (-) through neutral (0) to green (+)
 */
function getHeatColor(delta, maxDelta) {
    if (delta === null || delta === undefined) return 'rgba(255,255,255,0.05)';
    const clamped = Math.max(-1, Math.min(1, delta / (maxDelta || 1)));

    if (clamped >= 0) {
        // Green spectrum
        const g = Math.round(150 + clamped * 105);
        const r = Math.round(30 - clamped * 20);
        return `rgb(${r}, ${g}, 60)`;
    } else {
        // Red spectrum
        const r = Math.round(150 + Math.abs(clamped) * 105);
        const g = Math.round(30 - Math.abs(clamped) * 20);
        return `rgb(${r}, ${g}, 40)`;
    }
}

/**
 * @param {Object} props
 * @param {Object} props.runoutData - Map of card -> { ev_delta, eq_shift, has_data }
 * @param {string[]} props.deadCards - Cards already on board
 * @param {boolean} props.loading - Loading state
 * @param {function} props.onCardClick - Callback when clicking a runout card
 */
export default function RunoutHeatmap({ runoutData = {}, deadCards = [], loading = false, onCardClick }) {
    const deadSet = useMemo(() => new Set((deadCards || []).map(c => c.toLowerCase())), [deadCards]);

    // Find max absolute delta for normalization
    const maxDelta = useMemo(() => {
        let max = 0.01; // Minimum to avoid division by zero
        Object.values(runoutData || {}).forEach(d => {
            if (d && d.ev_delta !== undefined) {
                max = Math.max(max, Math.abs(d.ev_delta));
            }
        });
        return max;
    }, [runoutData]);

    if (loading) {
        return (
            <div style={{
                padding: 40, textAlign: 'center',
                background: 'rgba(255,255,255,0.02)', borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.06)',
            }}>
                <div style={{
                    width: 28, height: 28,
                    border: '3px solid rgba(0,212,255,0.2)',
                    borderTop: '3px solid #00d4ff',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    margin: '0 auto',
                }} />
                <p style={{ color: '#64748b', fontSize: 12, marginTop: 8 }}>Analyzing runouts...</p>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    return (
        <div style={{
            background: 'linear-gradient(145deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: 16,
        }}>
            {/* Title */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                marginBottom: 12,
            }}>
                <span style={{
                    fontSize: 14, fontWeight: 800, color: '#e2e8f0',
                    fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                }}>
                    RUNOUT ANALYSIS
                </span>
                <span style={{
                    fontSize: 10, color: '#64748b', background: 'rgba(255,255,255,0.04)',
                    padding: '2px 8px', borderRadius: 12,
                }}>
                    {Object.values(runoutData || {}).filter(d => d?.has_data).length} / 49 cards
                </span>
            </div>

            {/* Legend */}
            <div style={{
                display: 'flex', gap: 16, marginBottom: 10,
                fontSize: 10, color: '#94a3b8',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 2, background: 'rgb(30, 255, 60)' }} />
                    <span>Good for Hero</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 2, background: 'rgb(255, 30, 40)' }} />
                    <span>Bad for Hero</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 2, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
                    <span>No Data</span>
                </div>
            </div>

            {/* Heatmap Grid: 4 rows (suits) × 13 cols (ranks) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {SUITS.map(suit => (
                    <div key={suit.code} style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                        {/* Suit Label */}
                        <div style={{
                            width: 18, textAlign: 'center',
                            color: suit.color, fontSize: 14, fontWeight: 700,
                        }}>
                            {suit.symbol}
                        </div>
                        {/* Cards */}
                        {RANKS.map(rank => {
                            const card = `${rank}${suit.code}`;
                            const isDead = deadSet.has(card.toLowerCase());
                            const data = runoutData[card] || runoutData[card.toLowerCase()];
                            const hasData = data?.has_data && !isDead;
                            const evDelta = hasData ? data.ev_delta : null;
                            const bgColor = isDead
                                ? 'rgba(255,255,255,0.02)'
                                : hasData
                                    ? getHeatColor(evDelta, maxDelta)
                                    : 'rgba(255,255,255,0.05)';

                            return (
                                <motion.div
                                    key={card}
                                    whileHover={hasData ? { scale: 1.2, zIndex: 10 } : {}}
                                    onClick={() => hasData && onCardClick && onCardClick(card)}
                                    title={hasData ? `${card}: EV ${evDelta >= 0 ? '+' : ''}${evDelta?.toFixed(2)} BB` : isDead ? 'Dead card' : 'No data'}
                                    style={{
                                        width: 30, height: 28,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        borderRadius: 3,
                                        background: bgColor,
                                        opacity: isDead ? 0.15 : hasData ? 0.9 : 0.35,
                                        cursor: hasData ? 'pointer' : 'default',
                                        position: 'relative',
                                        transition: 'all 0.15s ease',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                    }}
                                >
                                    <span style={{
                                        fontSize: 9, fontWeight: 700,
                                        color: isDead ? '#333' : '#fff',
                                        fontFamily: "'Inter', sans-serif",
                                        textShadow: hasData ? '0 1px 2px rgba(0,0,0,0.5)' : 'none',
                                    }}>
                                        {rank === 'T' ? '10' : rank}
                                    </span>
                                    {/* EV delta indicator */}
                                    {hasData && Number.isFinite(evDelta) && (
                                        <div style={{
                                            position: 'absolute', bottom: -1, left: '50%', transform: 'translateX(-50%)',
                                            fontSize: 6, fontWeight: 600,
                                            color: evDelta >= 0 ? '#4ade80' : '#f87171',
                                        }}>
                                            {evDelta >= 0 ? '+' : ''}{evDelta.toFixed(1)}
                                        </div>
                                    )}
                                </motion.div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}

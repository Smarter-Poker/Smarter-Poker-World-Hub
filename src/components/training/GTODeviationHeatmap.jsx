import React from 'react';
import { motion } from 'framer-motion';

/**
 * 📊 GTO Deviation Heatmap
 * ═══════════════════════════════════════════════════════════════════════════
 * Visualizes the delta between a user's actual statistic and the GTO mathematical baseline.
 * Renders a horizontal split-bar highlighting under-performance (blue) or over-performance (red),
 * with perfect GTO alignment sitting near the center (green).
 */
export default function GTODeviationHeatmap({ label, actualPct = 0, gtoPct = 0, description }) {
    // Safety boundary for NaN or undefined to prevent .toFixed() crashes
    const safeActual = isNaN(actualPct) || actualPct === null ? 0 : Number(actualPct);
    const safeGto = isNaN(gtoPct) || gtoPct === null ? 0 : Number(gtoPct);

    // Calculate the difference (delta). Positive means user is acting MORE frequently than GTO.
    const delta = safeActual - safeGto;
    const absDelta = Math.abs(delta);

    // Determine the color severity based on the deviation magnitude
    // < 3% = Excellent (Green)
    // 3 - 8% = Marginal (Yellow)
    // 8 - 15% = Leak (Orange)
    // > 15% = Major Leak (Red)
    let color = '#22c55e'; // Green
    if (absDelta >= 15) color = '#ef4444'; // Red
    else if (absDelta >= 8) color = '#f97316'; // Orange
    else if (absDelta >= 3) color = '#eab308'; // Yellow

    const isOver = delta > 0;

    // Center point is 50%. The max deviation we visually map is +/- 30%.
    const MAX_DEVIATION = 30; // Caps the visual bar's max width for standard stats
    const normalizedDelta = Math.min((absDelta / MAX_DEVIATION) * 50, 50); // 0 to 50% width

    return (
        <div style={{
            background: 'rgba(15, 23, 42, 0.4)',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: 12,
            padding: '16px 20px',
            marginBottom: 12,
            width: '100%'
        }}>
            {/* Header / Stats */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
                <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', letterSpacing: 0.5 }}>{label}</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{description}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>GTO: <strong style={{ color: '#00d4ff' }}>{safeGto.toFixed(1)}%</strong></span>
                        <span style={{ fontSize: 18, fontWeight: 800, color: '#fff', fontFamily: "'Orbitron', monospace" }}>{safeActual.toFixed(1)}%</span>
                    </div>
                </div>
            </div>

            {/* Differential Bar (Zero-center layout) */}
            <div style={{
                position: 'relative',
                height: 8,
                background: 'rgba(0,0,0,0.3)',
                borderRadius: 4,
                width: '100%',
                display: 'flex',
                alignItems: 'center'
            }}>
                {/* Center marker line */}
                <div style={{
                    position: 'absolute', left: '50%', top: -4, bottom: -4, width: 2,
                    background: 'rgba(255,255,255,0.2)', zIndex: 10
                }} />

                {/* Left side filler (invisible container) */}
                <div style={{ width: '50%', height: '100%', display: 'flex', justifyContent: 'flex-end' }}>
                    {!isOver && absDelta > 0.5 && (
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${normalizedDelta}%` }}
                            transition={{ duration: 1, ease: 'easeOut' }}
                            style={{
                                height: '100%',
                                background: color,
                                borderTopLeftRadius: 4,
                                borderBottomLeftRadius: 4,
                                boxShadow: `0 0 10px ${color}80`
                            }}
                        />
                    )}
                </div>

                {/* Right side filler (invisible container) */}
                <div style={{ width: '50%', height: '100%', display: 'flex', justifyContent: 'flex-start' }}>
                    {isOver && absDelta > 0.5 && (
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${normalizedDelta}%` }}
                            transition={{ duration: 1, ease: 'easeOut' }}
                            style={{
                                height: '100%',
                                background: color,
                                borderTopRightRadius: 4,
                                borderBottomRightRadius: 4,
                                boxShadow: `0 0 10px ${color}80`
                            }}
                        />
                    )}
                </div>
            </div>

            {/* Evaluation Label */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: 8,
                fontSize: 10,
                color: '#64748b',
                textTransform: 'uppercase',
                fontWeight: 700
            }}>
                <span style={{ color: !isOver && absDelta >= 8 ? color : '#64748b' }}>Too Tight / Under</span>
                <span style={{
                    color,
                    background: `${color}15`,
                    padding: '2px 8px',
                    borderRadius: 4
                }}>
                    {absDelta < 3 ? 'GTO Aligned' : isOver ? `+${delta.toFixed(1)}% OVER` : `${delta.toFixed(1)}% UNDER`}
                </span>
                <span style={{ color: isOver && absDelta >= 8 ? color : '#64748b' }}>Aggressive / Over</span>
            </div>
        </div>
    );
}

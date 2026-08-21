/**
 * EquityMatchup — Range vs Range Equity Visualization
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Displays a visual bar showing Hero Range Equity vs Villain Range Equity.
 * Indicates who has the range advantage with color-coding and labels.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React from 'react';
import { motion } from 'framer-motion';

export default function EquityMatchup({ heroEquity = 50, villainEquity = 50, heroPosition = 'Hero', villainPosition = 'Villain' }) {
    const heroPercent = Math.round(heroEquity * 10) / 10;
    const villainPercent = Math.round(villainEquity * 10) / 10;
    const hasAdvantage = heroPercent > villainPercent ? 'hero' : villainPercent > heroPercent ? 'villain' : 'even';

    return (
        <div style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
            padding: '12px 16px',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: 8,
            }}>
                <span style={{
                    fontSize: 10, fontWeight: 700, color: '#64748b',
                    textTransform: 'uppercase', letterSpacing: 1,
                    fontFamily: "var(--font-rajdhani), 'Rajdhani', monospace",
                }}>
                    Range Equity
                </span>
                <span style={{
                    fontSize: 10, fontWeight: 700,
                    color: hasAdvantage === 'hero' ? '#00d4ff' : hasAdvantage === 'villain' ? '#ef4444' : '#94a3b8',
                    background: hasAdvantage === 'hero'
                        ? 'rgba(0,212,255,0.1)'
                        : hasAdvantage === 'villain'
                            ? 'rgba(239,68,68,0.1)'
                            : 'rgba(255,255,255,0.04)',
                    padding: '2px 8px', borderRadius: 12,
                }}>
                    {hasAdvantage === 'hero' ? `${heroPosition} Advantage` : hasAdvantage === 'villain' ? `${villainPosition} Advantage` : 'Even'}
                </span>
            </div>

            {/* Labels Row */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', marginBottom: 4,
            }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{
                        fontSize: 18, fontWeight: 800, color: '#00d4ff',
                        fontFamily: "var(--font-rajdhani), 'Rajdhani', monospace",
                    }}>
                        {heroPercent}%
                    </span>
                    <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>
                        {heroPosition}
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>
                        {villainPosition}
                    </span>
                    <span style={{
                        fontSize: 18, fontWeight: 800, color: '#ef4444',
                        fontFamily: "var(--font-rajdhani), 'Rajdhani', monospace",
                    }}>
                        {villainPercent}%
                    </span>
                </div>
            </div>

            {/* Bar */}
            <div style={{
                height: 24, borderRadius: 12,
                overflow: 'hidden', display: 'flex',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
            }}>
                <motion.div
                    initial={{ width: '50%' }}
                    animate={{ width: `${heroPercent}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    style={{
                        height: '100%',
                        background: 'linear-gradient(90deg, #0891b2, #00d4ff)',
                        borderRadius: heroPercent >= 99 ? 12 : '12px 0 0 12px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                >
                    {heroPercent > 15 && (
                        <span style={{
                            fontSize: 10, fontWeight: 700, color: '#fff',
                            textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                        }}>
                            {heroPosition}
                        </span>
                    )}
                </motion.div>
                <motion.div
                    initial={{ width: '50%' }}
                    animate={{ width: `${villainPercent}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    style={{
                        height: '100%',
                        background: 'linear-gradient(90deg, #ef4444, #dc2626)',
                        borderRadius: villainPercent >= 99 ? 12 : '0 12px 12px 0',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                >
                    {villainPercent > 15 && (
                        <span style={{
                            fontSize: 10, fontWeight: 700, color: '#fff',
                            textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                        }}>
                            {villainPosition}
                        </span>
                    )}
                </motion.div>
            </div>
        </div>
    );
}

/**
 * ICM Calculator — Tournament Chip-to-Dollar Equity
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 21: Standalone ICM equity calculator for tournament players.
 * Converts chip stacks to dollar equity using the Malmuth-Harville model.
 *
 * Route: /hub/training/icm-calculator
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const PLAYER_COLORS = [
    '#f97316', '#3b82f6', '#22c55e', '#a855f7',
    '#ef4444', '#06b6d4', '#eab308', '#ec4899', '#14b8a6',
];

const PRESETS = [
    {
        label: '9-Max Final Table',
        stacks: [45000, 38000, 32000, 28000, 22000, 18000, 14000, 8000, 5000],
        prizes: [31, 19.5, 14, 10.5, 8, 6, 4.5, 3.5, 3],
        prizePool: 10000,
    },
    {
        label: '6-Max Final Table',
        stacks: [30000, 25000, 20000, 15000, 12000, 8000],
        prizes: [35, 22, 16, 12, 9, 6],
        prizePool: 5000,
    },
    {
        label: 'Bubble (5 left, 4 paid)',
        stacks: [25000, 20000, 18000, 15000, 12000],
        prizes: [40, 27, 19, 14],
        prizePool: 5000,
    },
    {
        label: 'Heads-Up (2 left)',
        stacks: [60000, 40000],
        prizes: [60, 40],
        prizePool: 2000,
    },
    {
        label: '3-Handed',
        stacks: [50000, 30000, 20000],
        prizes: [50, 30, 20],
        prizePool: 3000,
    },
    {
        label: 'Satellite (4 seats)',
        stacks: [20000, 18000, 15000, 12000, 10000],
        prizes: [25, 25, 25, 25],
        prizePool: 4000,
    },
];

// Auth helper
function getAuthHeaders() {
    try {
        const raw = localStorage.getItem('sb-auth-token')
            || localStorage.getItem('supabase.auth.token');
        if (raw) {
            const parsed = JSON.parse(raw);
            const token = parsed?.access_token || parsed?.currentSession?.access_token;
            if (token) return { Authorization: `Bearer ${token}` };
        }
    } catch (e) { /* ignore */ }
    return {};
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function ICMCalculatorPage() {
    const router = useRouter();
    useTrainingBus('icm-calculator');

    const [stacks, setStacks] = useState([25000, 20000, 15000, 10000]);
    const [prizes, setPrizes] = useState([40, 30, 20, 10]);
    const [prizePool, setPrizePool] = useState(1000);
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Update a single stack
    const updateStack = useCallback((idx, val) => {
        setStacks(prev => {
            const next = [...prev];
            next[idx] = Math.max(0, parseInt(val) || 0);
            return next;
        });
    }, []);

    // Update a single prize
    const updatePrize = useCallback((idx, val) => {
        setPrizes(prev => {
            const next = [...prev];
            next[idx] = Math.max(0, parseFloat(val) || 0);
            return next;
        });
    }, []);

    // Add/Remove players
    const addPlayer = useCallback(() => {
        if (stacks.length >= 9) return;
        setStacks(prev => [...prev, 10000]);
    }, [stacks.length]);

    const removePlayer = useCallback(() => {
        if (stacks.length <= 2) return;
        setStacks(prev => prev.slice(0, -1));
    }, [stacks.length]);

    // Add/Remove prize places
    const addPrize = useCallback(() => {
        if (prizes.length >= 9) return;
        setPrizes(prev => [...prev, 5]);
    }, [prizes.length]);

    const removePrize = useCallback(() => {
        if (prizes.length <= 1) return;
        setPrizes(prev => prev.slice(0, -1));
    }, [prizes.length]);

    // Load preset
    const loadPreset = useCallback((preset) => {
        setStacks([...preset.stacks]);
        setPrizes([...preset.prizes]);
        setPrizePool(preset.prizePool);
        setResults(null);
    }, []);

    // Calculate ICM
    const calculate = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/training/icm-calc', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeaders(),
                },
                body: JSON.stringify({ stacks, prizes, prizePool }),
            });
            const data = await res.json();
            if (data.success) {
                setResults(data);
            } else {
                setError(data.error || 'Calculation failed');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [stacks, prizes, prizePool]);

    const totalChips = stacks.reduce((s, v) => s + v, 0);

    return (
        <>
            <Head>
                <title>ICM Calculator | Smarter.Poker GTO Training</title>
                <meta name="description" content="Tournament ICM equity calculator. Convert chip stacks to dollar equity using the Malmuth-Harville model." />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Orbitron:wght@500;700;900&display=swap" rel="stylesheet" />
            </Head>

            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(180deg, #0a0a12 0%, #0f0f1e 50%, #1a1a2e 100%)',
                color: '#e2e8f0',
                fontFamily: "'Inter', -apple-system, sans-serif",
            }}>
                {/* Header */}
                <div style={{
                    padding: '20px 24px 12px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <button
                            onClick={() => router.push('/hub/training')}
                            style={{
                                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: 8, padding: '6px 12px', color: '#94a3b8',
                                cursor: 'pointer', fontSize: 12, fontWeight: 600,
                            }}
                        >
                            &larr; Training
                        </button>
                        <h1 style={{
                            fontSize: 20, fontWeight: 800, margin: 0,
                            background: 'linear-gradient(135deg, #a855f7, #6366f1)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                            fontFamily: "'Orbitron', monospace",
                        }}>
                            ICM Calculator
                        </h1>
                        <span style={{
                            fontSize: 10, color: '#a855f7', background: 'rgba(168,85,247,0.1)',
                            padding: '3px 8px', borderRadius: 12, fontWeight: 700,
                            border: '1px solid rgba(168,85,247,0.2)',
                            fontFamily: "'Orbitron', monospace",
                        }}>
                            PHASE 21
                        </span>
                    </div>
                </div>

                <div style={{ padding: '16px 24px', maxWidth: 700, margin: '0 auto' }}>

                    {/* Quick Presets */}
                    <div style={{ marginBottom: 14 }}>
                        <div style={{
                            fontSize: 10, fontWeight: 700, color: '#64748b',
                            textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
                            fontFamily: "'Orbitron', monospace",
                        }}>
                            Quick Presets
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {PRESETS.map((p, i) => (
                                <button
                                    key={i}
                                    onClick={() => loadPreset(p)}
                                    style={{
                                        padding: '5px 10px', borderRadius: 6, fontSize: 10,
                                        fontWeight: 700, cursor: 'pointer', border: 'none',
                                        background: 'rgba(168,85,247,0.1)',
                                        color: '#c084fc',
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Chip Stacks Input */}
                    <div style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 12, padding: '14px 16px', marginBottom: 12,
                    }}>
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            marginBottom: 10,
                        }}>
                            <div style={{
                                fontSize: 10, fontWeight: 700, color: '#64748b',
                                textTransform: 'uppercase', letterSpacing: 1,
                                fontFamily: "'Orbitron', monospace",
                            }}>
                                Chip Stacks ({stacks.length} Players)
                            </div>
                            <div style={{ display: 'flex', gap: 4 }}>
                                <button
                                    onClick={removePlayer}
                                    disabled={stacks.length <= 2}
                                    style={{
                                        width: 24, height: 24, borderRadius: 6, border: 'none',
                                        background: stacks.length <= 2 ? 'rgba(255,255,255,0.03)' : 'rgba(239,68,68,0.15)',
                                        color: stacks.length <= 2 ? '#334155' : '#ef4444',
                                        cursor: stacks.length <= 2 ? 'default' : 'pointer',
                                        fontSize: 14, fontWeight: 900, lineHeight: '24px',
                                    }}
                                >
                                    -
                                </button>
                                <button
                                    onClick={addPlayer}
                                    disabled={stacks.length >= 9}
                                    style={{
                                        width: 24, height: 24, borderRadius: 6, border: 'none',
                                        background: stacks.length >= 9 ? 'rgba(255,255,255,0.03)' : 'rgba(34,197,94,0.15)',
                                        color: stacks.length >= 9 ? '#334155' : '#22c55e',
                                        cursor: stacks.length >= 9 ? 'default' : 'pointer',
                                        fontSize: 14, fontWeight: 900, lineHeight: '24px',
                                    }}
                                >
                                    +
                                </button>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {stacks.map((stack, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{
                                        fontSize: 10, fontWeight: 800, color: PLAYER_COLORS[i],
                                        width: 14, textAlign: 'center',
                                        fontFamily: "'Orbitron', monospace",
                                    }}>
                                        {i + 1}
                                    </span>
                                    <input
                                        type="number"
                                        value={stack}
                                        onChange={e => updateStack(i, e.target.value)}
                                        style={{
                                            flex: 1, background: 'rgba(255,255,255,0.05)',
                                            border: `1px solid ${PLAYER_COLORS[i]}20`,
                                            borderRadius: 6, padding: '6px 10px',
                                            color: '#e2e8f0', fontSize: 13, fontWeight: 600,
                                            outline: 'none', fontFamily: "'Inter', sans-serif",
                                        }}
                                    />
                                    <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600, minWidth: 36 }}>
                                        {totalChips > 0 ? `${Math.round((stack / totalChips) * 1000) / 10}%` : '0%'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Prize Structure */}
                    <div style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 12, padding: '14px 16px', marginBottom: 12,
                    }}>
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            marginBottom: 10,
                        }}>
                            <div style={{
                                fontSize: 10, fontWeight: 700, color: '#64748b',
                                textTransform: 'uppercase', letterSpacing: 1,
                                fontFamily: "'Orbitron', monospace",
                            }}>
                                Prize Structure ({prizes.length} Places)
                            </div>
                            <div style={{ display: 'flex', gap: 4 }}>
                                <button onClick={removePrize} disabled={prizes.length <= 1}
                                    style={{
                                        width: 24, height: 24, borderRadius: 6, border: 'none',
                                        background: prizes.length <= 1 ? 'rgba(255,255,255,0.03)' : 'rgba(239,68,68,0.15)',
                                        color: prizes.length <= 1 ? '#334155' : '#ef4444',
                                        cursor: prizes.length <= 1 ? 'default' : 'pointer',
                                        fontSize: 14, fontWeight: 900, lineHeight: '24px',
                                    }}>-</button>
                                <button onClick={addPrize} disabled={prizes.length >= 9}
                                    style={{
                                        width: 24, height: 24, borderRadius: 6, border: 'none',
                                        background: prizes.length >= 9 ? 'rgba(255,255,255,0.03)' : 'rgba(34,197,94,0.15)',
                                        color: prizes.length >= 9 ? '#334155' : '#22c55e',
                                        cursor: prizes.length >= 9 ? 'default' : 'pointer',
                                        fontSize: 14, fontWeight: 900, lineHeight: '24px',
                                    }}>+</button>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {prizes.map((prize, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{
                                        fontSize: 10, fontWeight: 700, color: '#eab308',
                                        width: 20, textAlign: 'right',
                                    }}>
                                        {i + 1}st
                                    </span>
                                    <input
                                        type="number"
                                        value={prize}
                                        onChange={e => updatePrize(i, e.target.value)}
                                        step="0.5"
                                        style={{
                                            flex: 1, background: 'rgba(255,255,255,0.05)',
                                            border: '1px solid rgba(234,179,8,0.15)',
                                            borderRadius: 6, padding: '6px 10px',
                                            color: '#e2e8f0', fontSize: 13, fontWeight: 600,
                                            outline: 'none', fontFamily: "'Inter', sans-serif",
                                        }}
                                    />
                                    <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>%</span>
                                </div>
                            ))}
                        </div>

                        {/* Prize Pool */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            marginTop: 10, paddingTop: 10,
                            borderTop: '1px solid rgba(255,255,255,0.06)',
                        }}>
                            <span style={{
                                fontSize: 10, fontWeight: 700, color: '#eab308',
                                fontFamily: "'Orbitron', monospace",
                            }}>
                                POOL $
                            </span>
                            <input
                                type="number"
                                value={prizePool}
                                onChange={e => setPrizePool(Math.max(0, parseInt(e.target.value) || 0))}
                                style={{
                                    flex: 1, background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(234,179,8,0.2)',
                                    borderRadius: 6, padding: '6px 10px',
                                    color: '#eab308', fontSize: 14, fontWeight: 700,
                                    outline: 'none', fontFamily: "'Inter', sans-serif",
                                }}
                            />
                        </div>
                    </div>

                    {/* Calculate Button */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                        <motion.button
                            whileTap={{ scale: 0.97 }}
                            onClick={calculate}
                            disabled={loading}
                            style={{
                                flex: 1, padding: '12px 0', borderRadius: 10, border: 'none',
                                background: loading
                                    ? 'rgba(168,85,247,0.3)'
                                    : 'linear-gradient(135deg, #a855f7, #6366f1)',
                                color: '#fff', fontSize: 13, fontWeight: 800,
                                cursor: loading ? 'wait' : 'pointer',
                                fontFamily: "'Orbitron', monospace",
                            }}
                        >
                            {loading ? 'CALCULATING...' : 'Calculate ICM'}
                        </motion.button>
                    </div>

                    {/* Error */}
                    {error && (
                        <div style={{
                            padding: '10px 14px', background: 'rgba(239,68,68,0.1)',
                            border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8,
                            color: '#ef4444', fontSize: 12, fontWeight: 600, marginBottom: 14,
                        }}>
                            {error}
                        </div>
                    )}

                    {/* Results */}
                    <AnimatePresence>
                        {results && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                            >
                                {/* Summary */}
                                <div style={{
                                    display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap',
                                }}>
                                    {[
                                        { label: 'Prize Pool', value: `$${results.totalPrizePool.toLocaleString()}`, color: '#eab308' },
                                        { label: 'Total Chips', value: results.totalChips.toLocaleString(), color: '#94a3b8' },
                                        { label: 'Bubble Factor', value: results.bubbleFactor.toFixed(2), color: results.bubbleFactor > 1.1 ? '#ef4444' : '#22c55e' },
                                    ].map(item => (
                                        <div key={item.label} style={{
                                            flex: '1 1 100px', textAlign: 'center',
                                            background: 'rgba(255,255,255,0.03)',
                                            border: '1px solid rgba(255,255,255,0.06)',
                                            borderRadius: 8, padding: '8px 10px',
                                        }}>
                                            <div style={{
                                                fontSize: 16, fontWeight: 900, color: item.color,
                                                fontFamily: "'Orbitron', monospace",
                                            }}>
                                                {item.value}
                                            </div>
                                            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                                                {item.label}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Results Table */}
                                <div style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.06)',
                                    borderRadius: 12, overflow: 'hidden', marginBottom: 14,
                                }}>
                                    {/* Table Header */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: '32px 1fr 60px 70px 70px 60px',
                                        padding: '8px 12px',
                                        background: 'rgba(255,255,255,0.04)',
                                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                                        fontSize: 9, fontWeight: 700, color: '#64748b',
                                        textTransform: 'uppercase', letterSpacing: 0.5,
                                    }}>
                                        <span>#</span>
                                        <span>Chips</span>
                                        <span style={{ textAlign: 'right' }}>Chip%</span>
                                        <span style={{ textAlign: 'right' }}>ICM $</span>
                                        <span style={{ textAlign: 'right' }}>ICM%</span>
                                        <span style={{ textAlign: 'right' }}>Diff $</span>
                                    </div>

                                    {/* Table Rows */}
                                    {results.results.map((r, i) => (
                                        <div key={i} style={{
                                            display: 'grid',
                                            gridTemplateColumns: '32px 1fr 60px 70px 70px 60px',
                                            padding: '8px 12px',
                                            borderBottom: i < results.results.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                                            alignItems: 'center',
                                        }}>
                                            <span style={{
                                                fontSize: 11, fontWeight: 900,
                                                color: PLAYER_COLORS[i],
                                                fontFamily: "'Orbitron', monospace",
                                            }}>
                                                {r.player}
                                            </span>
                                            <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>
                                                {r.chips.toLocaleString()}
                                            </span>
                                            <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textAlign: 'right' }}>
                                                {r.chipPct}%
                                            </span>
                                            <span style={{
                                                fontSize: 12, fontWeight: 800, textAlign: 'right',
                                                color: '#eab308',
                                            }}>
                                                ${r.icmDollars.toFixed(0)}
                                            </span>
                                            <span style={{
                                                fontSize: 11, fontWeight: 600, textAlign: 'right',
                                                color: '#a855f7',
                                            }}>
                                                {r.icmPct}%
                                            </span>
                                            <span style={{
                                                fontSize: 10, fontWeight: 700, textAlign: 'right',
                                                color: r.difference >= 0 ? '#22c55e' : '#ef4444',
                                            }}>
                                                {r.difference >= 0 ? '+' : ''}{r.difference.toFixed(0)}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                {/* Equity Bars — Chip% vs ICM% */}
                                <div style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.06)',
                                    borderRadius: 12, padding: '14px 16px',
                                }}>
                                    <div style={{
                                        fontSize: 10, fontWeight: 700, color: '#64748b',
                                        textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10,
                                        fontFamily: "'Orbitron', monospace",
                                    }}>
                                        Chip% vs ICM% Comparison
                                    </div>

                                    {results.results.map((r, i) => (
                                        <div key={i} style={{ marginBottom: 8 }}>
                                            <div style={{
                                                display: 'flex', justifyContent: 'space-between',
                                                fontSize: 10, fontWeight: 700, marginBottom: 3,
                                            }}>
                                                <span style={{ color: PLAYER_COLORS[i] }}>Player {r.player}</span>
                                                <span style={{ color: '#64748b' }}>
                                                    Chip {r.chipPct}% | ICM {r.icmPct}%
                                                </span>
                                            </div>
                                            {/* Chip% bar */}
                                            <div style={{
                                                height: 6, borderRadius: 3, marginBottom: 2,
                                                background: 'rgba(255,255,255,0.06)',
                                                overflow: 'hidden',
                                            }}>
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${Math.min(r.chipPct, 100)}%` }}
                                                    transition={{ duration: 0.6, delay: i * 0.05 }}
                                                    style={{
                                                        height: '100%', borderRadius: 3,
                                                        background: `${PLAYER_COLORS[i]}60`,
                                                    }}
                                                />
                                            </div>
                                            {/* ICM% bar */}
                                            <div style={{
                                                height: 6, borderRadius: 3,
                                                background: 'rgba(255,255,255,0.06)',
                                                overflow: 'hidden',
                                            }}>
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${Math.min(r.icmPct, 100)}%` }}
                                                    transition={{ duration: 0.6, delay: i * 0.05 + 0.1 }}
                                                    style={{
                                                        height: '100%', borderRadius: 3,
                                                        background: PLAYER_COLORS[i],
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    ))}

                                    <div style={{
                                        display: 'flex', gap: 16, marginTop: 8,
                                        fontSize: 9, color: '#64748b', fontWeight: 600,
                                    }}>
                                        <span>Top bar = Chip%</span>
                                        <span>Bottom bar = ICM%</span>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* About */}
                    <div style={{
                        marginTop: 20, padding: '14px 18px',
                        background: 'rgba(255,255,255,0.02)',
                        borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                        <div style={{
                            fontSize: 10, fontWeight: 700, color: '#64748b',
                            textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
                            fontFamily: "'Orbitron', monospace",
                        }}>
                            About ICM
                        </div>
                        <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>
                            The Independent Chip Model (ICM) converts tournament chip stacks into
                            real dollar equity based on the prize structure. Unlike chip EV (where
                            each chip is worth the same), ICM accounts for the diminishing value of
                            chips — the chip leader's stack is worth less per chip than a short
                            stack's. The bubble factor measures this effect: values above 1.0 mean
                            survival is more important than accumulation.
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
}

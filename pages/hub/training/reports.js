/**
 * 📊 GTO REPORTS — GTO Wizard-Style Performance Report
 * ═══════════════════════════════════════════════════════════════════════════
 * Aggregate view of user's training performance vs GTO baselines.
 * Color-coded deviation matrix, classification breakdown, and trends.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';

// ═══════════════════════════════════════════════════════════════════════════
// CLASSIFICATION CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const CLASS_CONFIG = {
    best: { label: 'Best', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)' },
    correct: { label: 'Correct', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
    inaccuracy: { label: 'Inaccuracy', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.15)' },
    wrong: { label: 'Wrong', color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)' },
    blunder: { label: 'Blunder', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
};

// ═══════════════════════════════════════════════════════════════════════════
// DEVIATION CELL
// ═══════════════════════════════════════════════════════════════════════════

function DeviationCell({ value, deviation }) {
    // Color: green = close to GTO, yellow = moderate, red = far
    const getColor = (dev) => {
        if (dev === null || dev === undefined) return '#475569';
        if (dev <= 5) return '#22c55e';
        if (dev <= 10) return '#4ade80';
        if (dev <= 15) return '#fbbf24';
        if (dev <= 25) return '#f97316';
        return '#ef4444';
    };

    const getBg = (dev) => {
        if (dev === null || dev === undefined) return 'rgba(255,255,255,0.03)';
        if (dev <= 5) return 'rgba(34, 197, 94, 0.1)';
        if (dev <= 10) return 'rgba(34, 197, 94, 0.05)';
        if (dev <= 15) return 'rgba(251, 191, 36, 0.1)';
        if (dev <= 25) return 'rgba(249, 115, 22, 0.1)';
        return 'rgba(239, 68, 68, 0.1)';
    };

    return (
        <div style={{
            textAlign: 'center', padding: '6px 8px',
            background: getBg(deviation), borderRadius: 6,
            border: `1px solid ${getColor(deviation)}20`,
        }}>
            <div style={{
                fontSize: 16, fontWeight: 800, color: getColor(deviation),
                fontFamily: "'Orbitron', monospace",
            }}>
                {value}%
            </div>
            {deviation !== null && (
                <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>
                    {deviation <= 5 ? '≈ GTO' : `±${deviation}%`}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// CLASSIFICATION BAR
// ═══════════════════════════════════════════════════════════════════════════

function ClassificationBar({ classifications, total }) {
    if (!classifications || total === 0) return null;

    const ordered = ['best', 'correct', 'inaccuracy', 'wrong', 'blunder'];

    return (
        <div>
            {/* Stacked bar */}
            <div style={{
                display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden',
                background: 'rgba(255,255,255,0.05)',
            }}>
                {ordered.map(cls => {
                    const count = classifications[cls] || 0;
                    const pct = total > 0 ? (count / total) * 100 : 0;
                    if (pct <= 0) return null;
                    return (
                        <motion.div
                            key={cls}
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.6, ease: 'easeOut' }}
                            style={{
                                height: '100%',
                                background: CLASS_CONFIG[cls]?.color || '#475569',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 9, fontWeight: 700, color: '#fff',
                                minWidth: pct > 5 ? 30 : 0,
                            }}
                        >
                            {pct > 8 ? `${Math.round(pct)}%` : ''}
                        </motion.div>
                    );
                })}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8, justifyContent: 'center' }}>
                {ordered.map(cls => {
                    const count = classifications[cls] || 0;
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                    return (
                        <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <div style={{
                                width: 10, height: 10, borderRadius: 2,
                                background: CLASS_CONFIG[cls]?.color,
                            }} />
                            <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>
                                {CLASS_CONFIG[cls]?.label}: {count} ({pct}%)
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function GTOReports() {
    const router = useRouter();
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState('all');
    const [userId, setUserId] = useState(null);

    // Get user ID from supabase on mount
    useEffect(() => {
        if (typeof window === 'undefined') return;
        (async () => {
            try {
                const { createClient } = await import('@supabase/supabase-js');
                const sb = createClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL,
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
                );
                const { data: { user } } = await sb.auth.getUser();
                if (user) {
                    setUserId(user.id);
                } else {
                    setLoading(false); // No user → stop loading spinner
                }
            } catch (e) {
                console.warn('[Reports] Auth error:', e);
                setLoading(false);
            }
        })();
    }, []);

    // Fetch report data
    const fetchReport = useCallback(async () => {
        if (!userId) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/training/gto-reports?userId=${userId}&period=${period}`);
            const data = await res.json();
            if (data.success) setReport(data.report);
        } catch (err) {
            console.error('[Reports] Fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [userId, period]);

    useEffect(() => {
        if (userId) fetchReport();
    }, [fetchReport, userId]);

    const positionOrder = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];

    return (
        <>
            <Head>
                <title>GTO Reports | Smarter.Poker Training</title>
                <meta name="description" content="Compare your poker training stats against optimal GTO frequencies. Find your biggest leaks." />
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
                    padding: '20px 24px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button
                            onClick={() => router.push('/hub/training')}
                            style={{
                                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: 8, padding: '6px 12px', color: '#94a3b8',
                                cursor: 'pointer', fontSize: 12, fontWeight: 600,
                            }}
                        >
                            ← Training
                        </button>
                        <h1 style={{
                            fontSize: 22, fontWeight: 800, margin: 0,
                            background: 'linear-gradient(135deg, #00d4ff, #22c55e)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                            fontFamily: "'Orbitron', monospace",
                        }}>
                            GTO Reports
                        </h1>
                    </div>

                    {/* Period Selector */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                        {[
                            { value: 'week', label: 'Last 7 Days' },
                            { value: 'month', label: 'Last 30 Days' },
                            { value: 'all', label: 'All Time' },
                        ].map(p => (
                            <button
                                key={p.value}
                                onClick={() => setPeriod(p.value)}
                                style={{
                                    padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                                    cursor: 'pointer', border: 'none', transition: 'all 0.2s',
                                    background: period === p.value
                                        ? 'linear-gradient(135deg, #00d4ff, #22c55e)'
                                        : 'rgba(255,255,255,0.06)',
                                    color: period === p.value ? '#fff' : '#94a3b8',
                                }}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div style={{ padding: '20px 24px', maxWidth: 800, margin: '0 auto' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', paddingTop: 80 }}>
                            <div style={{
                                width: 40, height: 40, border: '3px solid rgba(0,212,255,0.2)',
                                borderTop: '3px solid #00d4ff', borderRadius: '50%',
                                animation: 'spin 1s linear infinite', margin: '0 auto',
                            }} />
                            <p style={{ color: '#64748b', fontSize: 13, marginTop: 12 }}>Loading your GTO report...</p>
                            <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                        </div>
                    ) : !report || report.totalSessions === 0 ? (
                        <div style={{ textAlign: 'center', paddingTop: 60, opacity: 0.6 }}>
                            <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
                            <p style={{ fontSize: 14, color: '#94a3b8' }}>
                                No training data found for this period.
                            </p>
                            <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                                Complete some training sessions to see your GTO report.
                            </p>
                        </div>
                    ) : (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                        >
                            {/* Top Stats */}
                            <div style={{
                                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10,
                                marginBottom: 20,
                            }}>
                                {[
                                    { label: 'Sessions', value: report.totalSessions, color: '#7c3aed' },
                                    { label: 'Questions', value: report.totalQuestions, color: '#3b82f6' },
                                    { label: 'Accuracy', value: `${report.overallAccuracy}%`, color: report.overallAccuracy >= 70 ? '#22c55e' : report.overallAccuracy >= 50 ? '#fbbf24' : '#ef4444' },
                                    { label: 'Best Rate', value: `${report.bestRate}%`, color: '#00d4ff' },
                                ].map(stat => (
                                    <div key={stat.label} style={{
                                        padding: '14px 12px', borderRadius: 10, textAlign: 'center',
                                        background: 'rgba(0,0,0,0.2)',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                    }}>
                                        <div style={{
                                            fontSize: 24, fontWeight: 800, color: stat.color,
                                            fontFamily: "'Orbitron', monospace",
                                        }}>
                                            {stat.value}
                                        </div>
                                        <div style={{
                                            fontSize: 9, color: '#64748b', fontWeight: 600,
                                            textTransform: 'uppercase', letterSpacing: 1, marginTop: 4,
                                        }}>
                                            {stat.label}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Classification Breakdown */}
                            <div style={{
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.06)',
                                borderRadius: 12, padding: 16, marginBottom: 20,
                            }}>
                                <div style={{
                                    fontSize: 11, fontWeight: 800, color: '#94a3b8',
                                    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12,
                                }}>
                                    Move Classification Distribution
                                </div>
                                <ClassificationBar
                                    classifications={report.classifications}
                                    total={report.totalQuestions}
                                />
                            </div>

                            {/* Position Deviation Matrix */}
                            <div style={{
                                background: 'linear-gradient(135deg, rgba(0,212,255,0.04), rgba(34,197,94,0.03))',
                                border: '1px solid rgba(0,212,255,0.15)',
                                borderRadius: 12, padding: 16,
                            }}>
                                <div style={{
                                    fontSize: 11, fontWeight: 800, color: '#00d4ff',
                                    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 14,
                                    fontFamily: "'Orbitron', monospace",
                                }}>
                                    Position Accuracy vs GTO Baseline
                                </div>

                                <div style={{
                                    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
                                }}>
                                    {positionOrder.map(pos => {
                                        const data = report.positionReport?.[pos];
                                        if (!data || data.total === 0) {
                                            return (
                                                <div key={pos} style={{
                                                    padding: '10px 12px', borderRadius: 8,
                                                    background: 'rgba(255,255,255,0.02)',
                                                    border: '1px solid rgba(255,255,255,0.04)',
                                                    textAlign: 'center', opacity: 0.4,
                                                }}>
                                                    <div style={{
                                                        fontSize: 11, fontWeight: 800, color: '#64748b',
                                                        fontFamily: "'Orbitron', monospace", marginBottom: 4,
                                                    }}>
                                                        {pos}
                                                    </div>
                                                    <div style={{ fontSize: 10, color: '#475569' }}>No data</div>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div key={pos} style={{
                                                padding: '10px 12px', borderRadius: 8,
                                                background: 'rgba(0,0,0,0.2)',
                                                border: '1px solid rgba(255,255,255,0.06)',
                                            }}>
                                                <div style={{
                                                    fontSize: 12, fontWeight: 800, color: '#00d4ff',
                                                    fontFamily: "'Orbitron', monospace", marginBottom: 6,
                                                    textAlign: 'center',
                                                }}>
                                                    {pos}
                                                </div>
                                                <DeviationCell
                                                    value={data.accuracy}
                                                    deviation={data.deviation}
                                                />
                                                <div style={{
                                                    marginTop: 4, fontSize: 9, color: '#64748b',
                                                    textAlign: 'center',
                                                }}>
                                                    {data.total} hands • EV: -{data.avgEvLoss}BB
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Legend */}
                                <div style={{
                                    display: 'flex', justifyContent: 'center', gap: 12, marginTop: 12,
                                    flexWrap: 'wrap',
                                }}>
                                    {[
                                        { label: '≈ GTO (±5%)', color: '#22c55e' },
                                        { label: 'Close (±10%)', color: '#4ade80' },
                                        { label: 'Moderate (±15%)', color: '#fbbf24' },
                                        { label: 'Significant (±25%)', color: '#f97316' },
                                        { label: 'Major Leak (25%+)', color: '#ef4444' },
                                    ].map(l => (
                                        <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <div style={{
                                                width: 8, height: 8, borderRadius: 2,
                                                background: l.color,
                                            }} />
                                            <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600 }}>
                                                {l.label}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </div>
            </div>
        </>
    );
}

/**
 * 📈 AGGREGATE FLOP REPORTS — GTO Wizard-Style Texture Analysis
 * ═══════════════════════════════════════════════════════════════════════════
 * Aggregated strategy data across ALL possible flops for a given preflop spot.
 * Shows C-bet / check frequencies by flop texture (monotone, paired, connected, etc).
 * The "missing piece" from GTO Wizard that provides strategic insight at scale.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════
const GAME_TYPES = [
    { key: 'hu_cash', label: 'Cash HU', icon: '💰' },
    { key: 'cash_6max', label: 'Cash 6-Max', icon: '🎯' },
    { key: 'mtt_6max_icm', label: 'MTT 6-Max', icon: '🏆' },
];

const STACK_DEPTHS = [20, 40, 60, 80, 100, 150, 200];

const POSITIONS = [
    { key: '', label: 'All Positions' },
    { key: 'UTG', label: 'UTG' },
    { key: 'MP', label: 'MP' },
    { key: 'CO', label: 'CO' },
    { key: 'BTN', label: 'BTN' },
    { key: 'SB', label: 'SB' },
    { key: 'BB', label: 'BB' },
];

// ═══════════════════════════════════════════════════════════════════════════
// PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function AggregateReports() {
    const router = useRouter();
    useTrainingBus('aggregate-reports');
    const [gameType, setGameType] = useState('hu_cash');
    const [stackDepth, setStackDepth] = useState(100);
    const [heroPosition, setHeroPosition] = useState('');
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchReport = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                gameType,
                stackDepth: stackDepth.toString(),
            });
            if (heroPosition) params.set('heroPosition', heroPosition);

            const res = await fetch(`/api/training/aggregate-report?${params}`);
            const data = await res.json();
            if (data.success) {
                setReport(data.report);
            } else {
                setError(data.error || 'Failed to load report');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [gameType, stackDepth, heroPosition]);

    useEffect(() => {
        fetchReport();
    }, [fetchReport]);

    // Bus listener — auto-refresh when other training completes
    useEffect(() => {
        const unsub = eventBus.on(EventType.SESSION_END, () => fetchReport());
        window.addEventListener('training:session-complete', fetchReport);
        return () => {
            if (typeof unsub === 'function') unsub();
            window.removeEventListener('training:session-complete', fetchReport);
        };
    }, [fetchReport]);

    const maxCbet = useMemo(() => {
        if (!report?.textures) return 100;
        return Math.max(...report.textures.map(t => t.cbetFreq), 1);
    }, [report]);

    return (
        <>
            <Head>
                <title>Aggregate Flop Reports | Smarter.Poker Training</title>
                <meta name="description" content="See aggregated GTO strategy across all flop textures. Discover which boards favor betting vs checking." />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Orbitron:wght@500;700;900&display=swap" rel="stylesheet" />
            </Head>

            <div style={styles.page}>
                {/* Header */}
                <div style={styles.header}>
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => router.push('/hub/training')}
                        style={styles.backBtn}
                    >
                        ← Training
                    </motion.button>
                    <h1 style={styles.title}>
                        <span style={{ fontSize: 28 }}>📈</span> Aggregate Reports
                    </h1>
                </div>

                <p style={styles.subtitle}>
                    Aggregated strategy across all flop textures — see when to C-bet vs check by board type
                </p>

                {/* Filters */}
                <div style={styles.filtersSection}>
                    {/* Game Type */}
                    <div style={styles.filterRow}>
                        <label style={styles.filterLabel}>Game Format</label>
                        <div style={styles.buttonRow}>
                            {GAME_TYPES.map(g => (
                                <motion.button
                                    key={g.key}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => setGameType(g.key)}
                                    style={{
                                        ...styles.filterBtn,
                                        ...(gameType === g.key ? styles.filterBtnActive : {}),
                                    }}
                                >
                                    {g.icon} {g.label}
                                </motion.button>
                            ))}
                        </div>
                    </div>

                    {/* Stack Depth */}
                    <div style={styles.filterRow}>
                        <label style={styles.filterLabel}>Stack Depth</label>
                        <div style={styles.buttonRow}>
                            {STACK_DEPTHS.map(d => (
                                <motion.button
                                    key={d}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => setStackDepth(d)}
                                    style={{
                                        ...styles.stackBtn,
                                        ...(stackDepth === d ? styles.stackBtnActive : {}),
                                    }}
                                >
                                    {d}BB
                                </motion.button>
                            ))}
                        </div>
                    </div>

                    {/* Position */}
                    <div style={styles.filterRow}>
                        <label style={styles.filterLabel}>Hero Position</label>
                        <div style={styles.buttonRow}>
                            {POSITIONS.map(p => (
                                <motion.button
                                    key={p.key}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => setHeroPosition(p.key)}
                                    style={{
                                        ...styles.posBtn,
                                        ...(heroPosition === p.key ? styles.posBtnActive : {}),
                                    }}
                                >
                                    {p.label}
                                </motion.button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Loading */}
                {loading && (
                    <div style={styles.loadingContainer}>
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                            style={styles.spinner}
                        />
                        <p style={{ color: '#64748b', marginTop: 12 }}>Analyzing flop textures...</p>
                    </div>
                )}

                {/* Error */}
                {error && !loading && (
                    <div style={styles.errorBox}>
                        ⚠️ {error}
                    </div>
                )}

                {/* Report Data */}
                {report && !loading && (
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={`${gameType}-${stackDepth}-${heroPosition}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                        >
                            {/* Overall Stats */}
                            <div style={styles.overallCard}>
                                <div style={styles.overallHeader}>
                                    <span style={{ fontSize: 24 }}>📊</span>
                                    <span style={styles.overallTitle}>Overall Summary</span>
                                    <span style={styles.spotCount}>{report.totalSpots.toLocaleString()} spots analyzed</span>
                                </div>
                                <div style={styles.overallStats}>
                                    <div style={styles.overallStat}>
                                        <div style={{ ...styles.overallValue, color: '#ef4444' }}>{report.overall.cbetFreq}%</div>
                                        <div style={styles.overallLabel}>Avg Bet/Raise</div>
                                    </div>
                                    <div style={styles.overallDivider} />
                                    <div style={styles.overallStat}>
                                        <div style={{ ...styles.overallValue, color: '#22c55e' }}>{report.overall.checkFreq}%</div>
                                        <div style={styles.overallLabel}>Avg Check/Call</div>
                                    </div>
                                </div>
                            </div>

                            {/* Texture Breakdown */}
                            <div style={styles.sectionHeader}>
                                <span style={{ fontSize: 18 }}>🎨</span>
                                <span>Strategy by Flop Texture</span>
                            </div>

                            {report.textures.length === 0 && (
                                <div style={styles.emptyState}>
                                    <span style={{ fontSize: 48 }}>📭</span>
                                    <p>No solver data found for this configuration.</p>
                                    <p style={{ fontSize: 12, color: '#475569' }}>
                                        Try changing the game type or stack depth.
                                    </p>
                                </div>
                            )}

                            {report.textures.map((tex, idx) => (
                                <motion.div
                                    key={tex.texture}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                    style={styles.textureCard}
                                >
                                    <div style={styles.textureHeader}>
                                        <div style={styles.textureTitle}>
                                            <span style={{ fontSize: 16, marginRight: 6 }}>{tex.icon}</span>
                                            <span style={{ color: tex.color, fontWeight: 700 }}>{tex.label}</span>
                                        </div>
                                        <span style={styles.textureSpots}>{tex.spotCount} spots</span>
                                    </div>
                                    {tex.desc && <div style={styles.textureDesc}>{tex.desc}</div>}

                                    {/* Bar chart */}
                                    <div style={styles.barContainer}>
                                        {/* Bet/Raise bar */}
                                        <div style={styles.barRow}>
                                            <span style={styles.barLabel}>BET</span>
                                            <div style={styles.barTrack}>
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${Math.max((tex.cbetFreq / maxCbet) * 100, 2)}%` }}
                                                    transition={{ duration: 0.6, delay: idx * 0.05 }}
                                                    style={{
                                                        ...styles.barFill,
                                                        background: `linear-gradient(90deg, ${tex.color}88, ${tex.color})`,
                                                    }}
                                                />
                                            </div>
                                            <span style={{ ...styles.barValue, color: tex.color }}>{tex.cbetFreq}%</span>
                                        </div>
                                        {/* Check/Call bar */}
                                        <div style={styles.barRow}>
                                            <span style={styles.barLabel}>CHECK</span>
                                            <div style={styles.barTrack}>
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${Math.max((tex.checkFreq / maxCbet) * 100, 2)}%` }}
                                                    transition={{ duration: 0.6, delay: idx * 0.05 + 0.1 }}
                                                    style={{
                                                        ...styles.barFill,
                                                        background: 'linear-gradient(90deg, #22c55e44, #22c55e)',
                                                    }}
                                                />
                                            </div>
                                            <span style={{ ...styles.barValue, color: '#22c55e' }}>{tex.checkFreq}%</span>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}

                            {/* Position Breakdown */}
                            {report.positions && report.positions.length > 0 && (
                                <>
                                    <div style={{ ...styles.sectionHeader, marginTop: 24 }}>
                                        <span style={{ fontSize: 18 }}>🪑</span>
                                        <span>Strategy by Position</span>
                                    </div>
                                    <div style={styles.positionGrid}>
                                        {report.positions.filter(p => p.position !== 'UNK').map((p, idx) => (
                                            <motion.div
                                                key={p.position}
                                                initial={{ opacity: 0, scale: 0.9 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                transition={{ delay: idx * 0.08 }}
                                                style={styles.posCard}
                                            >
                                                <div style={styles.posName}>{p.position}</div>
                                                <div style={styles.posFreq}>
                                                    <span style={{ color: '#ef4444', fontWeight: 700 }}>{p.cbetFreq}%</span>
                                                    <span style={{ color: '#475569', margin: '0 4px' }}>bet</span>
                                                </div>
                                                <div style={styles.posFreq}>
                                                    <span style={{ color: '#22c55e', fontWeight: 700 }}>{p.checkFreq}%</span>
                                                    <span style={{ color: '#475569', margin: '0 4px' }}>chk</span>
                                                </div>
                                                <div style={styles.posSpots}>{p.spotCount} spots</div>
                                            </motion.div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </motion.div>
                    </AnimatePresence>
                )}
            </div>
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
const styles = {
    page: {
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0a0a12 0%, #0f0f1e 50%, #1a1a2e 100%)',
        color: '#e2e8f0',
        fontFamily: "'Inter', -apple-system, sans-serif",
        padding: '20px 16px 60px',
        maxWidth: 700,
        margin: '0 auto',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 4,
    },
    backBtn: {
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: '#94a3b8',
        padding: '6px 14px',
        borderRadius: 8,
        fontSize: 13,
        cursor: 'pointer',
        fontWeight: 600,
    },
    title: {
        fontSize: 22,
        fontWeight: 800,
        fontFamily: "'Orbitron', monospace",
        background: 'linear-gradient(135deg, #f97316, #fb923c)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        margin: 0,
    },
    subtitle: {
        fontSize: 13,
        color: '#64748b',
        marginBottom: 20,
        lineHeight: 1.5,
    },
    filtersSection: {
        marginBottom: 20,
    },
    filterRow: {
        marginBottom: 12,
    },
    filterLabel: {
        fontSize: 10,
        fontWeight: 700,
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: 1,
        display: 'block',
        marginBottom: 6,
    },
    buttonRow: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
    },
    filterBtn: {
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        color: '#94a3b8',
        padding: '7px 14px',
        borderRadius: 8,
        fontSize: 12,
        cursor: 'pointer',
        fontWeight: 600,
        transition: 'all 0.2s',
    },
    filterBtnActive: {
        background: 'rgba(249,115,22,0.15)',
        borderColor: '#f97316',
        color: '#f97316',
    },
    stackBtn: {
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        color: '#94a3b8',
        padding: '6px 12px',
        borderRadius: 8,
        fontSize: 12,
        cursor: 'pointer',
        fontWeight: 700,
        fontFamily: "'Orbitron', monospace",
        transition: 'all 0.2s',
    },
    stackBtnActive: {
        background: 'rgba(59,130,246,0.15)',
        borderColor: '#3b82f6',
        color: '#3b82f6',
    },
    posBtn: {
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        color: '#94a3b8',
        padding: '6px 12px',
        borderRadius: 8,
        fontSize: 12,
        cursor: 'pointer',
        fontWeight: 600,
        transition: 'all 0.2s',
    },
    posBtnActive: {
        background: 'rgba(34,197,94,0.15)',
        borderColor: '#22c55e',
        color: '#22c55e',
    },
    loadingContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 0',
    },
    spinner: {
        width: 36,
        height: 36,
        borderRadius: '50%',
        border: '3px solid rgba(249,115,22,0.2)',
        borderTop: '3px solid #f97316',
    },
    errorBox: {
        background: 'rgba(239,68,68,0.1)',
        border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: 10,
        padding: '14px 18px',
        color: '#fca5a5',
        fontSize: 13,
        textAlign: 'center',
    },
    overallCard: {
        background: 'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.2) 100%)',
        borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.06)',
        padding: 18,
        marginBottom: 20,
    },
    overallHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 14,
    },
    overallTitle: {
        fontSize: 14,
        fontWeight: 700,
        fontFamily: "'Orbitron', monospace",
        color: '#e2e8f0',
        flex: 1,
    },
    spotCount: {
        fontSize: 11,
        color: '#64748b',
        fontWeight: 600,
    },
    overallStats: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
    },
    overallStat: {
        textAlign: 'center',
    },
    overallValue: {
        fontSize: 32,
        fontWeight: 800,
        fontFamily: "'Orbitron', monospace",
        lineHeight: 1,
    },
    overallLabel: {
        fontSize: 11,
        color: '#64748b',
        fontWeight: 600,
        marginTop: 4,
    },
    overallDivider: {
        width: 1,
        height: 40,
        background: 'rgba(255,255,255,0.08)',
    },
    sectionHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 14,
        fontWeight: 700,
        color: '#94a3b8',
        marginBottom: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    textureCard: {
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: '12px 14px',
        marginBottom: 8,
    },
    textureHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    textureTitle: {
        display: 'flex',
        alignItems: 'center',
        fontSize: 14,
    },
    textureSpots: {
        fontSize: 10,
        color: '#475569',
        fontWeight: 600,
    },
    textureDesc: {
        fontSize: 11,
        color: '#475569',
        marginBottom: 8,
        fontStyle: 'italic',
    },
    barContainer: {
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
    },
    barRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    },
    barLabel: {
        fontSize: 9,
        fontWeight: 700,
        color: '#64748b',
        width: 38,
        textAlign: 'right',
        letterSpacing: 0.5,
    },
    barTrack: {
        flex: 1,
        height: 12,
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 6,
        overflow: 'hidden',
    },
    barFill: {
        height: '100%',
        borderRadius: 6,
        minWidth: 2,
    },
    barValue: {
        fontSize: 12,
        fontWeight: 700,
        fontFamily: "'Orbitron', monospace",
        width: 40,
        textAlign: 'right',
    },
    emptyState: {
        textAlign: 'center',
        padding: '40px 20px',
        color: '#64748b',
    },
    positionGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8,
    },
    posCard: {
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 10,
        padding: '10px 12px',
        textAlign: 'center',
    },
    posName: {
        fontSize: 14,
        fontWeight: 800,
        fontFamily: "'Orbitron', monospace",
        color: '#e2e8f0',
        marginBottom: 4,
    },
    posFreq: {
        fontSize: 12,
        lineHeight: 1.6,
    },
    posSpots: {
        fontSize: 9,
        color: '#475569',
        marginTop: 4,
    },
};

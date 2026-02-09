/**
 * JARVIS LEAK INSIGHTS COMPONENT
 * AI-powered bankroll analysis — user-triggered only, full-screen modal
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const RISK_CONFIG = {
    low: { color: '#22c55e', label: 'Low Risk', bg: 'rgba(34,197,94,0.15)' },
    medium: { color: '#f59e0b', label: 'Moderate', bg: 'rgba(245,158,11,0.15)' },
    high: { color: '#ef4444', label: 'High Risk', bg: 'rgba(239,68,68,0.15)' },
    unknown: { color: '#888', label: 'Unknown', bg: 'rgba(136,136,136,0.15)' },
};

export default function JarvisLeakInsights({ userId, onRefresh }) {
    const [insights, setInsights] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [showModal, setShowModal] = useState(false);

    const fetchInsights = async () => {
        if (!userId) return;
        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/jarvis/bankroll-analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });
            const data = await res.json();
            if (data.success) {
                setInsights(data.insights);
                setLastUpdated(new Date());
                onRefresh?.();
            } else {
                setError(data.error || 'Analysis failed');
            }
        } catch (err) {
            console.error('[Jarvis Insights] Error:', err);
            setError('Failed to connect to Jarvis');
        }
        setIsLoading(false);
    };

    const handleOpen = () => {
        setShowModal(true);
        // Only fetch if we don't already have insights
        if (!insights && !isLoading) {
            fetchInsights();
        }
    };

    if (!userId) return null;

    const riskConfig = RISK_CONFIG[insights?.riskLevel] || RISK_CONFIG.unknown;

    return (
        <>
            {/* Sidebar Trigger Button */}
            <button onClick={handleOpen} style={styles.triggerBtn}>
                <img src="/images/jarvis-avatar.png" alt="Jarvis" style={styles.triggerAvatar} />
                <div style={styles.triggerText}>
                    <span style={styles.triggerTitle}>Jarvis Insights</span>
                    <span style={styles.triggerHint}>
                        {insights ? 'View analysis' : 'Run AI analysis'}
                    </span>
                </div>
                <span style={styles.triggerArrow}>›</span>
            </button>

            {/* Full-Screen Modal */}
            <AnimatePresence>
                {showModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={styles.overlay}
                        onClick={() => setShowModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 20 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            style={styles.modal}
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Modal Header */}
                            <div style={styles.modalHeader}>
                                <div style={styles.modalTitleRow}>
                                    <img src="/images/jarvis-avatar.png" alt="Jarvis" style={styles.modalAvatar} />
                                    <div>
                                        <h2 style={styles.modalTitle}>Jarvis Insights</h2>
                                        <p style={styles.modalSubtitle}>AI-Powered Bankroll Analysis</p>
                                    </div>
                                </div>
                                <div style={styles.modalHeaderActions}>
                                    <button
                                        onClick={fetchInsights}
                                        disabled={isLoading}
                                        style={styles.refreshBtn}
                                    >
                                        {isLoading ? '⏳' : '↻'} {isLoading ? 'Analyzing...' : 'Refresh'}
                                    </button>
                                    <button onClick={() => setShowModal(false)} style={styles.closeBtn}>✕</button>
                                </div>
                            </div>

                            {/* Modal Body */}
                            <div style={styles.modalBody}>
                                {/* Loading State */}
                                {isLoading && !insights && (
                                    <div style={styles.loadingState}>
                                        <motion.div
                                            animate={{ opacity: [0.4, 1, 0.4] }}
                                            transition={{ duration: 2, repeat: Infinity }}
                                            style={styles.loadingText}
                                        >
                                            🧠 Analyzing your bankroll data...
                                        </motion.div>
                                        <p style={styles.loadingHint}>This usually takes a few seconds</p>
                                    </div>
                                )}

                                {/* Error State */}
                                {error && !insights && (
                                    <div style={styles.errorState}>
                                        <p style={styles.errorText}>{error}</p>
                                        <button onClick={fetchInsights} style={styles.retryBtn}>
                                            Try Again
                                        </button>
                                    </div>
                                )}

                                {/* Insights Content */}
                                {insights && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                    >
                                        {/* Risk Badge */}
                                        <div style={{ ...styles.riskBadge, background: riskConfig.bg, borderColor: riskConfig.color }}>
                                            <span style={{ color: riskConfig.color, fontWeight: 700 }}>{riskConfig.label}</span>
                                        </div>

                                        {/* Summary */}
                                        <div style={styles.summaryCard}>
                                            <div style={styles.sectionLabel}>Summary</div>
                                            <p style={styles.summaryText}>
                                                {insights.summary || 'Analysis complete.'}
                                            </p>
                                        </div>

                                        {/* Two-Column Layout for Patterns & Recommendations */}
                                        <div style={styles.twoCol}>
                                            {/* Patterns */}
                                            {insights.patterns?.length > 0 && (
                                                <div style={styles.sectionCard}>
                                                    <div style={styles.sectionLabel}>Patterns Detected</div>
                                                    <ul style={styles.list}>
                                                        {insights.patterns.map((pattern, idx) => (
                                                            <li key={idx} style={styles.listItem}>
                                                                <span style={styles.bullet}>•</span>
                                                                {pattern}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            {/* Recommendations */}
                                            {insights.recommendations?.length > 0 && (
                                                <div style={styles.sectionCard}>
                                                    <div style={styles.sectionLabel}>Recommendations</div>
                                                    <ul style={styles.list}>
                                                        {insights.recommendations.map((rec, idx) => (
                                                            <motion.li
                                                                key={idx}
                                                                style={styles.recItem}
                                                                initial={{ opacity: 0, x: -10 }}
                                                                animate={{ opacity: 1, x: 0 }}
                                                                transition={{ delay: idx * 0.08 }}
                                                            >
                                                                <span style={styles.recArrow}>→</span>
                                                                {rec}
                                                            </motion.li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>

                                        {/* Last Updated */}
                                        {lastUpdated && (
                                            <div style={styles.timestamp}>
                                                Last updated {lastUpdated.toLocaleTimeString()}
                                            </div>
                                        )}
                                    </motion.div>
                                )}

                                {/* Empty State (no insights yet, not loading) */}
                                {!isLoading && !error && !insights && (
                                    <div style={styles.emptyState}>
                                        <div style={styles.emptyIcon}>🧠</div>
                                        <h3 style={styles.emptyTitle}>Ready to Analyze</h3>
                                        <p style={styles.emptyHint}>Get AI-powered insights on your bankroll performance, leak detection, and personalized recommendations.</p>
                                        <button onClick={fetchInsights} style={styles.analyzeBtn}>
                                            Run Analysis
                                        </button>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}

const styles = {
    /* ── Sidebar Trigger Button ── */
    triggerBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '12px 14px',
        background: 'linear-gradient(135deg, rgba(0,0,40,0.95), rgba(30,0,60,0.9))',
        border: '1px solid rgba(139,92,246,0.3)',
        borderRadius: 12,
        cursor: 'pointer',
        marginBottom: 16,
        textAlign: 'left',
        transition: 'border-color 0.2s, box-shadow 0.2s',
    },
    triggerAvatar: {
        width: 28,
        height: 28,
        borderRadius: '50%',
        flexShrink: 0,
    },
    triggerText: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
    },
    triggerTitle: {
        fontSize: 13,
        fontWeight: 600,
        color: '#8b5cf6',
    },
    triggerHint: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.4)',
        marginTop: 1,
    },
    triggerArrow: {
        fontSize: 18,
        color: 'rgba(255,255,255,0.3)',
        flexShrink: 0,
    },

    /* ── Full-Screen Modal ── */
    overlay: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 20,
    },
    modal: {
        width: '100%',
        maxWidth: 680,
        maxHeight: '90vh',
        background: 'linear-gradient(180deg, #0d0d2b 0%, #0a1929 50%, #0d1117 100%)',
        border: '1px solid rgba(139,92,246,0.35)',
        borderRadius: 16,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6), 0 0 40px rgba(139,92,246,0.15)',
    },
    modalHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 24px',
        borderBottom: '1px solid rgba(139,92,246,0.2)',
        background: 'rgba(139,92,246,0.05)',
    },
    modalTitleRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
    },
    modalAvatar: {
        width: 36,
        height: 36,
        borderRadius: '50%',
        border: '2px solid rgba(139,92,246,0.5)',
    },
    modalTitle: {
        margin: 0,
        fontSize: 18,
        fontWeight: 700,
        color: '#fff',
    },
    modalSubtitle: {
        margin: 0,
        fontSize: 11,
        color: 'rgba(255,255,255,0.4)',
    },
    modalHeaderActions: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    },
    refreshBtn: {
        padding: '8px 16px',
        background: 'rgba(139,92,246,0.15)',
        border: '1px solid rgba(139,92,246,0.3)',
        borderRadius: 8,
        color: '#8b5cf6',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 600,
    },
    closeBtn: {
        width: 36,
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        color: '#888',
        cursor: 'pointer',
        fontSize: 16,
    },
    modalBody: {
        flex: 1,
        overflowY: 'auto',
        padding: 24,
    },

    /* ── Loading ── */
    loadingState: {
        padding: 60,
        textAlign: 'center',
    },
    loadingText: {
        fontSize: 18,
        color: '#8b5cf6',
        fontWeight: 600,
        marginBottom: 8,
    },
    loadingHint: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.4)',
        margin: 0,
    },

    /* ── Error ── */
    errorState: {
        padding: 40,
        textAlign: 'center',
    },
    errorText: {
        color: '#ef4444',
        fontSize: 14,
        marginBottom: 16,
    },
    retryBtn: {
        padding: '10px 24px',
        background: 'rgba(239,68,68,0.15)',
        border: '1px solid rgba(239,68,68,0.4)',
        borderRadius: 8,
        color: '#ef4444',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 600,
    },

    /* ── Insights Content ── */
    riskBadge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 16px',
        borderRadius: 20,
        fontSize: 13,
        fontWeight: 600,
        marginBottom: 16,
        border: '1px solid',
    },
    summaryCard: {
        padding: 16,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        marginBottom: 20,
    },
    sectionLabel: {
        fontSize: 11,
        fontWeight: 700,
        color: 'rgba(255,255,255,0.5)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: 10,
    },
    summaryText: {
        fontSize: 15,
        color: '#fff',
        lineHeight: 1.6,
        margin: 0,
    },
    twoCol: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 16,
    },
    sectionCard: {
        padding: 16,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12,
    },
    list: {
        margin: 0,
        padding: 0,
        listStyle: 'none',
    },
    listItem: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        fontSize: 13,
        color: '#ccc',
        padding: '6px 0',
        lineHeight: 1.4,
    },
    bullet: {
        color: '#8b5cf6',
        fontWeight: 700,
        flexShrink: 0,
    },
    recItem: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        fontSize: 13,
        color: '#fff',
        padding: '8px 12px',
        background: 'rgba(139,92,246,0.08)',
        borderRadius: 8,
        marginBottom: 6,
        lineHeight: 1.4,
    },
    recArrow: {
        color: '#8b5cf6',
        fontWeight: 700,
        flexShrink: 0,
    },
    timestamp: {
        fontSize: 11,
        color: '#555',
        textAlign: 'right',
        marginTop: 16,
    },

    /* ── Empty State ── */
    emptyState: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 48,
        textAlign: 'center',
    },
    emptyIcon: {
        fontSize: 48,
        marginBottom: 16,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: 700,
        color: '#fff',
        margin: '0 0 8px',
    },
    emptyHint: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.5)',
        maxWidth: 400,
        lineHeight: 1.5,
        margin: '0 0 24px',
    },
    analyzeBtn: {
        padding: '14px 32px',
        background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
        border: 'none',
        borderRadius: 10,
        color: '#fff',
        fontWeight: 600,
        cursor: 'pointer',
        fontSize: 15,
        boxShadow: '0 4px 20px rgba(139,92,246,0.3)',
    },
};

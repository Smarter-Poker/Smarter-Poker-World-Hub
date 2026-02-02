/**
 * JARVIS LEAK INSIGHTS COMPONENT
 * AI-powered bankroll analysis and recommendations
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const RISK_CONFIG = {
    low: { color: '#22c55e', icon: '✓', label: 'Low Risk', bg: 'rgba(34,197,94,0.15)' },
    medium: { color: '#f59e0b', icon: '⚠', label: 'Moderate', bg: 'rgba(245,158,11,0.15)' },
    high: { color: '#ef4444', icon: '🚨', label: 'High Risk', bg: 'rgba(239,68,68,0.15)' },
    unknown: { color: '#888', icon: '?', label: 'Unknown', bg: 'rgba(136,136,136,0.15)' },
};

export default function JarvisLeakInsights({ userId, onRefresh }) {
    const [insights, setInsights] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);

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

    useEffect(() => {
        // Auto-fetch on mount if user is logged in
        if (userId && !insights) {
            fetchInsights();
        }
    }, [userId]);

    if (!userId) {
        return (
            <div style={styles.container}>
                <div style={styles.signInPrompt}>
                    <span style={styles.jarvisIcon}>🧠</span>
                    <span>Sign in for AI-powered insights</span>
                </div>
            </div>
        );
    }

    const riskConfig = RISK_CONFIG[insights?.riskLevel] || RISK_CONFIG.unknown;

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div style={styles.titleRow}>
                    <span style={styles.jarvisIcon}>🧠</span>
                    <h4 style={styles.title}>Jarvis Insights</h4>
                </div>
                <button
                    onClick={fetchInsights}
                    disabled={isLoading}
                    style={styles.refreshBtn}
                >
                    {isLoading ? '...' : '↻'}
                </button>
            </div>

            {isLoading && !insights && (
                <div style={styles.loadingState}>
                    <motion.div
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        style={styles.analyzingText}
                    >
                        🧠 Analyzing your data...
                    </motion.div>
                </div>
            )}

            {error && !insights && (
                <div style={styles.errorState}>
                    <span>⚠️ {error}</span>
                    <button onClick={fetchInsights} style={styles.retryBtn}>
                        Try Again
                    </button>
                </div>
            )}

            {insights && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={styles.content}
                >
                    {/* Risk Badge */}
                    <div style={{ ...styles.riskBadge, background: riskConfig.bg }}>
                        <span>{riskConfig.icon}</span>
                        <span style={{ color: riskConfig.color }}>{riskConfig.label}</span>
                    </div>

                    {/* Summary */}
                    <div style={styles.summary}>
                        {insights.summary || 'Analysis complete.'}
                    </div>

                    {/* Patterns */}
                    {insights.patterns?.length > 0 && (
                        <div style={styles.section}>
                            <div style={styles.sectionTitle}>📊 Patterns</div>
                            <ul style={styles.list}>
                                {insights.patterns.map((pattern, idx) => (
                                    <li key={idx} style={styles.listItem}>
                                        {pattern}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Recommendations */}
                    {insights.recommendations?.length > 0 && (
                        <div style={styles.section}>
                            <div style={styles.sectionTitle}>💡 Recommendations</div>
                            <ul style={styles.list}>
                                {insights.recommendations.map((rec, idx) => (
                                    <motion.li
                                        key={idx}
                                        style={styles.recItem}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.1 }}
                                    >
                                        <span style={styles.recIcon}>→</span>
                                        {rec}
                                    </motion.li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Last Updated */}
                    {lastUpdated && (
                        <div style={styles.timestamp}>
                            Updated {lastUpdated.toLocaleTimeString()}
                        </div>
                    )}
                </motion.div>
            )}

            {/* Empty state */}
            {!isLoading && !error && !insights && (
                <div style={styles.emptyState}>
                    <button onClick={fetchInsights} style={styles.analyzeBtn}>
                        🧠 Run Analysis
                    </button>
                    <span style={styles.emptyHint}>Get AI-powered insights on your bankroll</span>
                </div>
            )}
        </div>
    );
}

const styles = {
    container: {
        background: 'linear-gradient(135deg, rgba(0,0,40,0.95), rgba(30,0,60,0.9))',
        borderRadius: 12,
        border: '1px solid rgba(139,92,246,0.3)',
        padding: 14,
        marginBottom: 16,
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    titleRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    },
    jarvisIcon: {
        fontSize: 18,
    },
    title: {
        margin: 0,
        fontSize: 14,
        fontWeight: 600,
        color: '#8b5cf6',
    },
    refreshBtn: {
        padding: '6px 10px',
        background: 'rgba(255,255,255,0.1)',
        border: 'none',
        borderRadius: 6,
        color: '#888',
        cursor: 'pointer',
        fontSize: 14,
    },
    loadingState: {
        padding: 24,
        textAlign: 'center',
    },
    analyzingText: {
        color: '#8b5cf6',
        fontSize: 14,
    },
    errorState: {
        padding: 20,
        textAlign: 'center',
        color: '#ef4444',
        fontSize: 13,
    },
    retryBtn: {
        marginTop: 10,
        padding: '6px 12px',
        background: 'rgba(239,68,68,0.2)',
        border: '1px solid rgba(239,68,68,0.4)',
        borderRadius: 6,
        color: '#ef4444',
        cursor: 'pointer',
        fontSize: 12,
    },
    content: {},
    riskBadge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        marginBottom: 10,
    },
    summary: {
        fontSize: 14,
        color: '#fff',
        lineHeight: 1.5,
        marginBottom: 14,
        padding: 10,
        background: 'rgba(255,255,255,0.05)',
        borderRadius: 8,
    },
    section: {
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 11,
        color: '#888',
        textTransform: 'uppercase',
        marginBottom: 6,
    },
    list: {
        margin: 0,
        padding: 0,
        listStyle: 'none',
    },
    listItem: {
        fontSize: 12,
        color: '#ccc',
        padding: '4px 0',
        paddingLeft: 12,
        position: 'relative',
    },
    recItem: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 6,
        fontSize: 12,
        color: '#fff',
        padding: '6px 10px',
        background: 'rgba(139,92,246,0.1)',
        borderRadius: 6,
        marginBottom: 6,
    },
    recIcon: {
        color: '#8b5cf6',
        fontWeight: 700,
    },
    timestamp: {
        fontSize: 10,
        color: '#666',
        textAlign: 'right',
        marginTop: 8,
    },
    emptyState: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        padding: 20,
    },
    analyzeBtn: {
        padding: '10px 20px',
        background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
        border: 'none',
        borderRadius: 8,
        color: '#fff',
        fontWeight: 600,
        cursor: 'pointer',
        fontSize: 14,
    },
    emptyHint: {
        fontSize: 11,
        color: '#666',
    },
    signInPrompt: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 20,
        color: '#666',
        fontSize: 13,
    },
};

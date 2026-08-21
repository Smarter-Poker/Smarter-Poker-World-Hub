/**
 * Mistake Cluster — Actionable Leak Identification
 * ===================================================
 * Parses hand history arrays to group mistakes by action or street.
 */

import React, { useMemo } from 'react';

export default function MistakeCluster({ progressData = [] }) {
    const clusters = useMemo(() => {
        // We aggregate errors based on the "game_id" or scenario type available in the progress data
        // For a more advanced version, this would parse a raw JSONB hand_history array, but
        // for Phase 24 we map the weak spots into conversational "clusters".

        const weakSpots = progressData
            .filter(p => p.total_questions_answered > 0)
            .sort((a, b) => {
                const accA = a.total_correct / a.total_questions_answered;
                const accB = b.total_correct / b.total_questions_answered;
                return accA - accB;
            })
            .slice(0, 3) // Top 3 leaks
            .filter(p => (p.total_correct / p.total_questions_answered) < 0.85); // Only show if accuracy is < 85%

        if (weakSpots.length === 0) return [];

        return weakSpots.map(spot => {
            const acc = Math.round((spot.total_correct / spot.total_questions_answered) * 100);
            const errors = spot.total_questions_answered - spot.total_correct;

            // Map the game_id to a human-readable "Actionable Node"
            let title = spot.game_id.replace(/-/g, ' ');
            title = title.replace(/\b\w/g, c => c.toUpperCase()); // Title Case

            // Generate a dynamic insight string
            let insight = `You've made ${errors} mistakes in this scenario. `;
            if (acc < 50) insight += "This is a critical leak causing significant BB/100 loss. Focus your next 3 sessions here.";
            else if (acc < 70) insight += "You are bleeding chips dynamically here. Drill this to tighten ranges.";
            else insight += "Almost mastered, but still a small leak. Review the exact GTO frequencies.";

            return {
                id: spot.game_id,
                title,
                accuracy: acc,
                mistakes: errors,
                insight
            };
        });
    }, [progressData]);

    if (!clusters || clusters.length === 0) {
        return (
            <div style={styles.emptyContainer}>
                <div style={styles.emptyIcon}>■</div>
                <h4 style={styles.emptyTitle}>NO CRITICAL LEAKS DETECTED</h4>
                <p style={styles.emptyText}>Your accuracy is solid across the board. Keep crushing the drills to generate more data.</p>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h3 style={styles.title}>Critical Leak Clusters</h3>
                <span style={styles.badge}>{clusters.length} Found</span>
            </div>

            <div style={styles.list}>
                {clusters.map((cluster, i) => (
                    <div key={cluster.id || i} style={styles.clusterItem}>
                        <div style={styles.clusterTop}>
                            <h4 style={styles.clusterTitle}>{cluster.title}</h4>
                            <div style={styles.accuracyPill}>
                                <span style={styles.accVal}>{cluster.accuracy}%</span>
                                <span style={styles.accLabel}>ACCURACY</span>
                            </div>
                        </div>
                        <p style={styles.insight}>{cluster.insight}</p>
                        <div style={styles.mistakeBar}>
                            <div style={{
                                width: `${Math.min(cluster.mistakes * 5, 100)}%`,
                                height: '100%',
                                background: 'linear-gradient(90deg, #ef4444, #f97316)',
                                borderRadius: 4
                            }} />
                        </div>
                        <div style={styles.mistakeLabel}>{cluster.mistakes} mistakes recorded</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

const styles = {
    container: {
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(239, 68, 68, 0.2)',
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    title: {
        fontSize: 18,
        fontWeight: 900,
        color: '#fff',
        margin: 0,
        fontFamily: "var(--font-rajdhani), 'Rajdhani', sans-serif",
    },
    badge: {
        fontSize: 10,
        fontWeight: 700,
        background: 'rgba(239, 68, 68, 0.15)',
        color: '#ef4444',
        padding: '4px 10px',
        borderRadius: 12,
        border: '1px solid rgba(239, 68, 68, 0.3)',
    },
    list: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
    },
    clusterItem: {
        background: 'rgba(0, 0, 0, 0.3)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        borderRadius: 12,
        padding: 16,
    },
    clusterTop: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    clusterTitle: {
        fontSize: 14,
        fontWeight: 700,
        color: '#e2e8f0',
        margin: 0,
        flex: 1,
    },
    accuracyPill: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
    },
    accVal: {
        fontSize: 16,
        fontWeight: 900,
        fontFamily: "var(--font-rajdhani), 'Rajdhani', sans-serif",
        color: '#ef4444',
    },
    accLabel: {
        fontSize: 8,
        color: 'rgba(255,255,255,0.4)',
        fontWeight: 700,
        letterSpacing: 0.5,
    },
    insight: {
        fontSize: 12,
        color: '#cbd5e1',
        lineHeight: 1.5,
        margin: '0 0 12px 0',
    },
    mistakeBar: {
        height: 6,
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 4,
        marginBottom: 6,
        overflow: 'hidden',
    },
    mistakeLabel: {
        fontSize: 10,
        color: 'rgba(255, 255, 255, 0.4)',
        fontWeight: 500,
    },
    emptyContainer: {
        background: 'rgba(34, 197, 94, 0.05)',
        border: '1px solid rgba(34, 197, 94, 0.2)',
        borderRadius: 16,
        padding: 32,
        textAlign: 'center',
        marginBottom: 24,
    },
    emptyIcon: {
        fontSize: 48,
        marginBottom: 12,
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: 900,
        color: '#22c55e',
        margin: '0 0 8px 0',
        fontFamily: "var(--font-rajdhani), 'Rajdhani', sans-serif",
    },
    emptyText: {
        fontSize: 13,
        color: '#94a3b8',
        margin: 0,
        maxWidth: 300,
        marginLeft: 'auto',
        marginRight: 'auto',
        lineHeight: 1.5,
    }
};

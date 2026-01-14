/**
 * 📊 HORSE ANALYTICS DASHBOARD
 * Admin view for monitoring horse content performance
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
const styles = {
    container: {
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 100%)',
        color: 'white',
        padding: '2rem'
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem'
    },
    title: {
        fontSize: '2rem',
        fontWeight: 'bold',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '1.5rem',
        marginBottom: '2rem'
    },
    card: {
        background: 'rgba(255,255,255,0.05)',
        borderRadius: '16px',
        padding: '1.5rem',
        border: '1px solid rgba(255,255,255,0.1)'
    },
    metricCard: {
        textAlign: 'center'
    },
    metricValue: {
        fontSize: '3rem',
        fontWeight: 'bold',
        background: 'linear-gradient(135deg, #667eea, #764ba2)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent'
    },
    metricLabel: {
        color: 'rgba(255,255,255,0.6)',
        marginTop: '0.5rem',
        fontSize: '0.9rem'
    },
    section: {
        marginBottom: '2rem'
    },
    sectionTitle: {
        fontSize: '1.25rem',
        fontWeight: '600',
        marginBottom: '1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
    },
    sourceBar: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        marginBottom: '0.75rem'
    },
    sourceName: {
        width: '120px',
        fontSize: '0.9rem'
    },
    progressBar: {
        flex: 1,
        height: '24px',
        background: 'rgba(255,255,255,0.1)',
        borderRadius: '12px',
        overflow: 'hidden'
    },
    progressFill: {
        height: '100%',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingRight: '8px',
        fontSize: '0.85rem',
        fontWeight: '600',
        transition: 'width 0.5s ease'
    },
    errorRow: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '0.75rem',
        background: 'rgba(255,0,0,0.1)',
        borderRadius: '8px',
        marginBottom: '0.5rem',
        fontSize: '0.9rem'
    },
    refreshBtn: {
        background: 'linear-gradient(135deg, #667eea, #764ba2)',
        border: 'none',
        padding: '0.75rem 1.5rem',
        borderRadius: '12px',
        color: 'white',
        fontWeight: '600',
        cursor: 'pointer'
    },
    loadingSpinner: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '200px',
        fontSize: '1.25rem'
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE COLORS
// ═══════════════════════════════════════════════════════════════════════════
const SOURCE_COLORS = {
    HCL: '#ff6b6b',
    LODGE: '#4ecdc4',
    LATB: '#ffe66d',
    TRITON: '#95e1d3',
    TCH: '#f38181',
    WSOP: '#ffd93d',
    POKERGO: '#6c5ce7',
    BRAD_OWEN: '#74b9ff',
    ANDREW_NEEME: '#55efc4',
    RAMPAGE: '#fd79a8',
    DOUG_POLK: '#a29bfe',
    POKERSTARS: '#e17055',
    WPT: '#00b894',
    KINGS: '#fdcb6e'
};

export default function HorseAnalytics() {
    const [data, setData] = useState(null);
    const [errors, setErrors] = useState(null);
    const [loading, setLoading] = useState(true);
    const [days, setDays] = useState(7);
    const router = useRouter();

    const fetchData = async () => {
        setLoading(true);
        try {
            const [summaryRes, errorsRes] = await Promise.all([
                fetch(`/api/horses/analytics?type=summary&days=${days}`),
                fetch(`/api/horses/analytics?type=errors&days=${days}`)
            ]);

            const summaryData = await summaryRes.json();
            const errorsData = await errorsRes.json();

            setData(summaryData.data);
            setErrors(errorsData.data);
        } catch (e) {
            console.error('Failed to fetch analytics:', e);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, [days]);

    if (loading) {
        return (
            <div style={styles.container}>
                <div style={styles.loadingSpinner}>
                    🐴 Loading analytics...
                </div>
            </div>
        );
    }

    const maxSourceCount = Math.max(...Object.values(data?.sourceDistribution || { x: 1 }));

    return (
        <>
            <Head>
                <title>Horse Analytics | Smarter Poker</title>
            </Head>
            <div style={styles.container}>
                {/* Header */}
                <div style={styles.header}>
                    <h1 style={styles.title}>
                        🐴 Horse Analytics Dashboard
                    </h1>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <select
                            value={days}
                            onChange={e => setDays(parseInt(e.target.value))}
                            style={{
                                background: 'rgba(255,255,255,0.1)',
                                border: '1px solid rgba(255,255,255,0.2)',
                                borderRadius: '8px',
                                padding: '0.5rem 1rem',
                                color: 'white'
                            }}
                        >
                            <option value="1">Last 24h</option>
                            <option value="7">Last 7 days</option>
                            <option value="30">Last 30 days</option>
                        </select>
                        <button style={styles.refreshBtn} onClick={fetchData}>
                            🔄 Refresh
                        </button>
                    </div>
                </div>

                {/* Metric Cards */}
                <div style={styles.grid}>
                    <div style={{ ...styles.card, ...styles.metricCard }}>
                        <div style={styles.metricValue}>{data?.totalPosts || 0}</div>
                        <div style={styles.metricLabel}>📝 Posts Created</div>
                    </div>
                    <div style={{ ...styles.card, ...styles.metricCard }}>
                        <div style={styles.metricValue}>{data?.totalStories || 0}</div>
                        <div style={styles.metricLabel}>📱 Stories Created</div>
                    </div>
                    <div style={{ ...styles.card, ...styles.metricCard }}>
                        <div style={styles.metricValue}>{data?.totalComments || 0}</div>
                        <div style={styles.metricLabel}>💬 Comments Made</div>
                    </div>
                    <div style={{ ...styles.card, ...styles.metricCard }}>
                        <div style={styles.metricValue}>{data?.totalLikes || 0}</div>
                        <div style={styles.metricLabel}>❤️ Likes Given</div>
                    </div>
                    <div style={{ ...styles.card, ...styles.metricCard }}>
                        <div style={styles.metricValue}>{data?.activeHorses || 0}</div>
                        <div style={styles.metricLabel}>🐴 Active Horses</div>
                    </div>
                    <div style={{ ...styles.card, ...styles.metricCard }}>
                        <div style={{ ...styles.metricValue, color: data?.totalErrors > 0 ? '#ff6b6b' : undefined }}>
                            {data?.totalErrors || 0}
                        </div>
                        <div style={styles.metricLabel}>⚠️ Errors</div>
                    </div>
                </div>

                {/* Source Distribution */}
                <div style={styles.section}>
                    <div style={styles.sectionTitle}>📺 Source Distribution</div>
                    <div style={styles.card}>
                        {Object.entries(data?.sourceDistribution || {})
                            .sort((a, b) => b[1] - a[1])
                            .map(([source, count]) => (
                                <div key={source} style={styles.sourceBar}>
                                    <div style={styles.sourceName}>{source}</div>
                                    <div style={styles.progressBar}>
                                        <div style={{
                                            ...styles.progressFill,
                                            width: `${(count / maxSourceCount) * 100}%`,
                                            background: SOURCE_COLORS[source] || '#667eea'
                                        }}>
                                            {count}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        {Object.keys(data?.sourceDistribution || {}).length === 0 && (
                            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', padding: '2rem' }}>
                                No source data yet
                            </div>
                        )}
                    </div>
                </div>

                {/* Error Breakdown */}
                {errors?.breakdown && Object.keys(errors.breakdown).length > 0 && (
                    <div style={styles.section}>
                        <div style={styles.sectionTitle}>⚠️ Error Breakdown</div>
                        <div style={styles.card}>
                            {Object.entries(errors.breakdown).map(([type, count]) => (
                                <div key={type} style={styles.errorRow}>
                                    <span>{type}</span>
                                    <span style={{ fontWeight: 'bold' }}>{count}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Recent Errors */}
                {errors?.recent?.length > 0 && (
                    <div style={styles.section}>
                        <div style={styles.sectionTitle}>🔴 Recent Errors</div>
                        <div style={styles.card}>
                            {errors.recent.slice(0, 5).map((error, i) => (
                                <div key={i} style={{
                                    ...styles.errorRow,
                                    flexDirection: 'column',
                                    alignItems: 'flex-start',
                                    gap: '0.25rem'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                        <span style={{ fontWeight: '600' }}>{error.error_type}</span>
                                        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>
                                            {new Date(error.created_at).toLocaleString()}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>
                                        {error.error_message?.slice(0, 100)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Back Button */}
                <button
                    onClick={() => router.push('/hub')}
                    style={{
                        ...styles.refreshBtn,
                        background: 'rgba(255,255,255,0.1)'
                    }}
                >
                    ← Back to Hub
                </button>
            </div>
        </>
    );
}

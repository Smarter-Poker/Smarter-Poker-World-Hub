/**
 * Session Dashboard — Training History & Performance Review
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 22: Dedicated dashboard for reviewing training sessions, tracking
 * accuracy trends, identifying weak spots, and monitoring improvement.
 *
 * Route: /hub/training/session-dashboard
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import MistakeCluster from '../../../src/components/training/MistakeCluster';
import GhostReplayEngine from '../../../src/components/training/GhostReplayEngine';

// ═══════════════════════════════════════════════════════════════════════════
// AUTH HELPER
// ═══════════════════════════════════════════════════════════════════════════

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
// MINI TREND CHART (pure CSS/SVG)
// ═══════════════════════════════════════════════════════════════════════════

function TrendChart({ data, height = 120, color = '#22c55e' }) {
    if (!data || data.length < 2) {
        return (
            <div style={{
                height, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#475569', fontSize: 11, fontWeight: 600,
            }}>
                Need 2+ sessions for trend
            </div>
        );
    }

    const max = Math.max(...data, 100);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const width = 100;
    const padding = 4;

    const points = data.map((val, i) => {
        const x = padding + (i / (data.length - 1)) * (width - 2 * padding);
        const y = height - padding - ((val - min) / range) * (height - 2 * padding);
        return `${x},${y}`;
    }).join(' ');

    // Area fill
    const firstX = padding;
    const lastX = padding + ((data.length - 1) / (data.length - 1)) * (width - 2 * padding);
    const areaPoints = `${firstX},${height - padding} ${points} ${lastX},${height - padding}`;

    return (
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height }} preserveAspectRatio="none">
            <defs>
                <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={color} stopOpacity="0.02" />
                </linearGradient>
            </defs>
            <polygon points={areaPoints} fill="url(#trendGrad)" />
            <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {/* Last point dot */}
            {data.length > 0 && (() => {
                const lastVal = data[data.length - 1];
                const lx = padding + ((data.length - 1) / (data.length - 1)) * (width - 2 * padding);
                const ly = height - padding - ((lastVal - min) / range) * (height - 2 * padding);
                return <circle cx={lx} cy={ly} r="2.5" fill={color} />;
            })()}
        </svg>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function SessionDashboardPage() {
    const router = useRouter();
    useTrainingBus('session-dashboard');

    const [stats, setStats] = useState(null);
    const [progress, setProgress] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [recommendations, setRecommendations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');
    const [activeReplay, setActiveReplay] = useState(null); // { sessionName, handHistory }

    // Fetch all data
    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        const headers = getAuthHeaders();

        try {
            const [progressRes, sessionsRes, recsRes] = await Promise.allSettled([
                fetch('/api/training/get-progress', { headers }).then(r => r.json()),
                fetch('/api/training/get-sessions?limit=30', { headers }).then(r => r.json()),
                fetch('/api/training/recommendations', { headers }).then(r => r.json()),
            ]);

            if (progressRes.status === 'fulfilled' && progressRes.value.success) {
                setStats(progressRes.value.stats || null);
                setProgress(progressRes.value.progress || []);
            }
            if (sessionsRes.status === 'fulfilled' && sessionsRes.value.success) {
                setSessions(sessionsRes.value.sessions || []);
            }
            if (recsRes.status === 'fulfilled' && recsRes.value.success) {
                setRecommendations(recsRes.value.recommendations || []);
            }

            // If all failed with auth
            if (progressRes.status === 'rejected' || (progressRes.value && !progressRes.value.success)) {
                setError(progressRes.value?.error || 'Failed to load data');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Bus listeners — auto-refresh when training events fire
    useEffect(() => {
        const refresh = () => fetchData();
        const events = ['training:session-complete', 'training:drill-complete', 'training:progress-updated'];
        events.forEach(e => window.addEventListener(e, refresh));
        return () => events.forEach(e => window.removeEventListener(e, refresh));
    }, [fetchData]);

    // Compute trend data from sessions
    const accuracyTrend = sessions
        .filter(s => typeof s.accuracy === 'number' || typeof s.gtow_score === 'number')
        .slice(0, 20)
        .reverse()
        .map(s => s.accuracy || s.gtow_score || 0);

    // Identify weak spots from progress
    const weakSpots = progress
        .filter(p => p.total_questions_answered > 0)
        .sort((a, b) => {
            const accA = a.total_correct / a.total_questions_answered;
            const accB = b.total_correct / b.total_questions_answered;
            return accA - accB;
        })
        .slice(0, 5);

    return (
        <>
            <Head>
                <title>Session Dashboard | Smarter.Poker GTO Training</title>
                <meta name="description" content="Review your GTO training sessions, track accuracy trends, and identify weak spots in your game." />
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
                            background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                            fontFamily: "'Orbitron', monospace",
                        }}>
                            Session Dashboard
                        </h1>
                        <span style={{
                            fontSize: 10, color: '#06b6d4', background: 'rgba(6,182,212,0.1)',
                            padding: '3px 8px', borderRadius: 12, fontWeight: 700,
                            border: '1px solid rgba(6,182,212,0.2)',
                            fontFamily: "'Orbitron', monospace",
                        }}>
                            PHASE 22
                        </span>
                    </div>
                </div>

                <div style={{ padding: '16px 24px', maxWidth: 700, margin: '0 auto' }}>

                    {/* Tabs */}
                    <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
                        {['overview', 'sessions', 'weak spots'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                style={{
                                    padding: '6px 14px', borderRadius: 6, fontSize: 11,
                                    fontWeight: 700, cursor: 'pointer', border: 'none',
                                    textTransform: 'capitalize', transition: 'all 0.15s',
                                    background: activeTab === tab
                                        ? 'linear-gradient(135deg, #06b6d4, #3b82f6)'
                                        : 'rgba(255,255,255,0.06)',
                                    color: activeTab === tab ? '#fff' : '#94a3b8',
                                }}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    {/* Error */}
                    {error && (
                        <div style={{
                            padding: '10px 14px', background: 'rgba(239,68,68,0.1)',
                            border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8,
                            color: '#ef4444', fontSize: 12, fontWeight: 600, marginBottom: 14,
                        }}>
                            {error}
                            <button onClick={fetchData} style={{
                                marginLeft: 12, background: 'rgba(6,182,212,0.2)',
                                border: '1px solid rgba(6,182,212,0.4)', borderRadius: 6,
                                padding: '4px 12px', color: '#06b6d4', cursor: 'pointer',
                                fontSize: 11, fontWeight: 700,
                            }}>Retry</button>
                        </div>
                    )}

                    {/* Loading */}
                    {loading && (
                        <div style={{
                            textAlign: 'center', padding: 40, color: '#64748b',
                            fontFamily: "'Orbitron', monospace", fontSize: 12, fontWeight: 700,
                        }}>
                            LOADING TRAINING DATA...
                        </div>
                    )}

                    {/* OVERVIEW TAB */}
                    {!loading && activeTab === 'overview' && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                            {/* Summary Cards */}
                            <div style={{
                                display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
                                gap: 8, marginBottom: 14,
                            }}>
                                {[
                                    { label: 'Games Played', value: stats?.totalGamesPlayed || 0, color: '#06b6d4' },
                                    { label: 'Mastered', value: stats?.totalGamesMastered || 0, color: '#22c55e' },
                                    { label: 'Accuracy', value: `${stats?.overallAccuracy || 0}%`, color: stats?.overallAccuracy >= 70 ? '#22c55e' : '#f97316' },
                                    { label: 'Best Streak', value: stats?.bestStreak || 0, color: '#a855f7' },
                                    { label: 'Questions', value: (stats?.totalQuestionsAnswered || 0).toLocaleString(), color: '#3b82f6' },
                                    { label: 'Correct', value: (stats?.totalCorrect || 0).toLocaleString(), color: '#22c55e' },
                                ].map(card => (
                                    <div key={card.label} style={{
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                        borderRadius: 10, padding: '12px 14px', textAlign: 'center',
                                    }}>
                                        <div style={{
                                            fontSize: 22, fontWeight: 900, color: card.color,
                                            fontFamily: "'Orbitron', monospace",
                                        }}>
                                            {card.value}
                                        </div>
                                        <div style={{
                                            fontSize: 9, color: '#64748b', fontWeight: 700,
                                            textTransform: 'uppercase', letterSpacing: 1,
                                        }}>
                                            {card.label}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Accuracy Trend */}
                            <div style={{
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.06)',
                                borderRadius: 12, padding: '14px 16px', marginBottom: 14,
                            }}>
                                <div style={{
                                    fontSize: 10, fontWeight: 700, color: '#64748b',
                                    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8,
                                    fontFamily: "'Orbitron', monospace",
                                }}>
                                    Accuracy Trend (Last {accuracyTrend.length} Sessions)
                                </div>
                                <TrendChart data={accuracyTrend} color="#22c55e" />
                                {accuracyTrend.length >= 2 && (
                                    <div style={{
                                        display: 'flex', justifyContent: 'space-between',
                                        fontSize: 10, color: '#64748b', marginTop: 4,
                                    }}>
                                        <span>Oldest</span>
                                        <span style={{
                                            color: accuracyTrend[accuracyTrend.length - 1] >= accuracyTrend[0]
                                                ? '#22c55e' : '#ef4444',
                                            fontWeight: 700,
                                        }}>
                                            {accuracyTrend[accuracyTrend.length - 1] >= accuracyTrend[0] ? 'Improving' : 'Declining'}
                                        </span>
                                        <span>Latest</span>
                                    </div>
                                )}
                            </div>

                            {/* Recommendations */}
                            {recommendations.length > 0 && (
                                <div style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.06)',
                                    borderRadius: 12, padding: '14px 16px',
                                }}>
                                    <div style={{
                                        fontSize: 10, fontWeight: 700, color: '#64748b',
                                        textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8,
                                        fontFamily: "'Orbitron', monospace",
                                    }}>
                                        Recommended Focus
                                    </div>
                                    {recommendations.slice(0, 4).map((rec, i) => (
                                        <div key={i} style={{
                                            padding: '8px 10px', marginBottom: 4,
                                            background: 'rgba(6,182,212,0.05)',
                                            borderRadius: 6, borderLeft: '3px solid #06b6d4',
                                        }}>
                                            <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>
                                                {rec.name || rec.game_name || `Focus Area ${i + 1}`}
                                            </div>
                                            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                                                {rec.reason || rec.description || 'Improve accuracy in this area'}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* SESSIONS TAB */}
                    {!loading && activeTab === 'sessions' && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                            {sessions.length === 0 ? (
                                <div style={{
                                    textAlign: 'center', padding: 40, color: '#475569',
                                    fontSize: 12, fontWeight: 600,
                                }}>
                                    No training sessions found. Start a drill to begin tracking.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {sessions.map((s, i) => {
                                        const acc = s.accuracy || s.gtow_score || 0;
                                        const date = s.created_at ? new Date(s.created_at).toLocaleDateString('en-US', {
                                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                                        }) : 'Unknown';

                                        return (
                                            <div key={s.id || i} style={{
                                                background: 'rgba(255,255,255,0.03)',
                                                border: '1px solid rgba(255,255,255,0.06)',
                                                borderRadius: 10, padding: '10px 14px',
                                                display: 'flex', justifyContent: 'space-between',
                                                alignItems: 'center', gap: 8, flexWrap: 'wrap',
                                            }}>
                                                <div>
                                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>
                                                        {s.game_id || 'Training Session'}
                                                    </div>
                                                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                                                        {date} · {s.hands_played || 0} hands
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                    {s.best_streak > 0 && (
                                                        <span style={{
                                                            fontSize: 10, fontWeight: 700, color: '#a855f7',
                                                            background: 'rgba(168,85,247,0.1)',
                                                            padding: '2px 6px', borderRadius: 4,
                                                        }}>
                                                            {s.best_streak} streak
                                                        </span>
                                                    )}
                                                    <span style={{
                                                        fontSize: 14, fontWeight: 900,
                                                        fontFamily: "'Orbitron', monospace",
                                                        color: acc >= 70 ? '#22c55e' : acc >= 50 ? '#f97316' : '#ef4444',
                                                        marginRight: 8
                                                    }}>
                                                        {Math.round(acc)}%
                                                    </span>

                                                    {s.hand_history && s.hand_history.length > 0 && (
                                                        <button
                                                            onClick={() => setActiveReplay({ sessionName: s.game_id || 'Session', handHistory: s.hand_history })}
                                                            style={{
                                                                background: 'rgba(0, 212, 255, 0.1)',
                                                                border: '1px solid rgba(0, 212, 255, 0.3)',
                                                                color: '#00d4ff', borderRadius: 6,
                                                                padding: '4px 10px', fontSize: 10, fontWeight: 700,
                                                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                                                            }}>
                                                            ▶ REPLAY
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* WEAK SPOTS TAB */}
                    {!loading && activeTab === 'weak spots' && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                            {/* Phase 24: Actionable Leak Identification */}
                            <MistakeCluster progressData={progress} />

                            {weakSpots.length === 0 ? (
                                <div style={{
                                    textAlign: 'center', padding: 40, color: '#475569',
                                    fontSize: 12, fontWeight: 600,
                                }}>
                                    No weak spots detected yet. Complete more sessions to generate analysis.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {weakSpots.map((spot, i) => {
                                        const acc = spot.total_questions_answered > 0
                                            ? Math.round((spot.total_correct / spot.total_questions_answered) * 100) : 0;
                                        const barWidth = Math.min(acc, 100);

                                        return (
                                            <div key={spot.game_id || i} style={{
                                                background: 'rgba(255,255,255,0.03)',
                                                border: '1px solid rgba(255,255,255,0.06)',
                                                borderRadius: 10, padding: '12px 14px',
                                            }}>
                                                <div style={{
                                                    display: 'flex', justifyContent: 'space-between',
                                                    marginBottom: 6,
                                                }}>
                                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>
                                                        {spot.game_id || `Scenario ${i + 1}`}
                                                    </span>
                                                    <span style={{
                                                        fontSize: 12, fontWeight: 900,
                                                        fontFamily: "'Orbitron', monospace",
                                                        color: acc >= 70 ? '#22c55e' : acc >= 50 ? '#f97316' : '#ef4444',
                                                    }}>
                                                        {acc}%
                                                    </span>
                                                </div>
                                                {/* Progress bar */}
                                                <div style={{
                                                    height: 6, borderRadius: 3,
                                                    background: 'rgba(255,255,255,0.06)',
                                                    overflow: 'hidden',
                                                }}>
                                                    <motion.div
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${barWidth}%` }}
                                                        transition={{ duration: 0.6, delay: i * 0.1 }}
                                                        style={{
                                                            height: '100%', borderRadius: 3,
                                                            background: acc >= 70 ? '#22c55e' : acc >= 50 ? '#f97316' : '#ef4444',
                                                        }}
                                                    />
                                                </div>
                                                <div style={{
                                                    fontSize: 10, color: '#64748b', marginTop: 4,
                                                }}>
                                                    {spot.total_correct}/{spot.total_questions_answered} correct · Mastery: {spot.mastery_percentage || 0}%
                                                </div>
                                            </div>
                                        );
                                    })}

                                    <div style={{
                                        padding: '10px 14px', background: 'rgba(239,68,68,0.05)',
                                        border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8,
                                        fontSize: 11, color: '#94a3b8', lineHeight: 1.5,
                                        marginTop: 4,
                                    }}>
                                        These are your lowest-accuracy areas. Focus your training sessions
                                        here to improve your overall GTO accuracy.
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}

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
                            About Session Dashboard
                        </div>
                        <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>
                            Track your GTO training progress over time. The Overview tab shows
                            overall stats and accuracy trends. Sessions shows your complete
                            training history. Weak Spots highlights areas where your accuracy
                            is lowest so you can focus your practice.
                        </p>
                    </div>
                </div>
            </div>
            {/* Phase 25: Ghost Replay Engine Overlay */}
            {activeReplay && (
                <GhostReplayEngine
                    sessionName={activeReplay.sessionName}
                    handHistory={activeReplay.handHistory}
                    onClose={() => setActiveReplay(null)}
                />
            )}
        </>
    );
}

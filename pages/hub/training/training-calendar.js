/**
 * TRAINING CALENDAR — Activity Heatmap
 * ═══════════════════════════════════════════════════════════════════════════
 * GitHub-style contribution heatmap showing daily training activity.
 * Clickable days, streak counter, monthly stats.
 *
 * Route: /hub/training/training-calendar
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, getAccessToken } from '../../../src/lib/authUtils';


function buildHeatmap(sessions) {
    const dayMap = {};
    if (!sessions) return dayMap;
    sessions.forEach(s => {
        const day = new Date(s.created_at).toISOString().slice(0, 10);
        if (!dayMap[day]) dayMap[day] = { hands: 0, sessions: 0, correct: 0 };
        dayMap[day].hands += (s.hands_played || s.total_questions || 0);
        dayMap[day].correct += (s.correct_count || s.correct_answers || 0);
        dayMap[day].sessions += 1;
    });
    return dayMap;
}

function getIntensity(hands) {
    if (!hands || hands === 0) return 0;
    if (hands < 10) return 1;
    if (hands < 30) return 2;
    if (hands < 60) return 3;
    return 4;
}

const INTENSITY_COLORS = [
    'rgba(255,255,255,0.02)', // 0 - none
    'rgba(0,212,255,0.15)',   // 1 - light
    'rgba(0,212,255,0.30)',   // 2 - medium
    'rgba(0,212,255,0.50)',   // 3 - heavy
    'rgba(0,212,255,0.75)',   // 4 - extreme
];

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function computeStreak(dayMap) {
    let streak = 0;
    const today = new Date();
    let d = new Date(today);
    while (true) {
        const key = d.toISOString().slice(0, 10);
        if (dayMap[key]) {
            streak++;
            d.setDate(d.getDate() - 1);
        } else if (streak === 0 && d.toDateString() === today.toDateString()) {
            // Today hasn't had a session yet, check yesterday
            d.setDate(d.getDate() - 1);
        } else {
            break;
        }
    }
    return streak;
}

function computeWeeklyStats(dayMap) {
    const today = new Date();
    let hands = 0, correct = 0, sessions = 0;
    for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const data = dayMap[d.toISOString().slice(0, 10)];
        if (data) {
            hands += data.hands;
            correct += data.correct;
            sessions += data.sessions;
        }
    }
    return {
        hands, sessions,
        accuracy: hands > 0 ? Math.round((correct / hands) * 100) : 0
    };
}

export default function TrainingCalendarPage() {
    const router = useRouter();
    useTrainingBus('training-calendar');
    const [loading, setLoading] = useState(true);
    const [dayMap, setDayMap] = useState({});
    const [selectedDay, setSelectedDay] = useState(null);

    const fetchData = useCallback(async () => {
        const user = getAuthUser();
        if (!user?.id) { setLoading(false); return; }
        try {
            const token = getAccessToken();
            const res = await fetch('/api/training/get-sessions?limit=500', {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            const data = await res.json();
            if (data.success && data.sessions) setDayMap(buildHeatmap(data.sessions));
        } catch (e) { console.error('[Calendar]', e); }
        setLoading(false);
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);
    useEffect(() => {
        const h = () => fetchData();
        window.addEventListener('training:session-complete', h);
        return () => window.removeEventListener('training:session-complete', h);
    }, [fetchData]);

    // Generate calendar grid (last 16 weeks)
    const weeks = [];
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - (16 * 7) + (6 - today.getDay()));

    for (let w = 0; w < 16; w++) {
        const week = [];
        for (let d = 0; d < 7; d++) {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + (w * 7) + d);
            const key = date.toISOString().slice(0, 10);
            const dayData = dayMap[key] || null;
            const isToday = date.toDateString() === today.toDateString();
            const isFuture = date > today;
            week.push({ key, date: new Date(date), data: dayData, isToday, isFuture });
        }
        weeks.push(week);
    }

    const streak = computeStreak(dayMap);
    const weeklyStats = computeWeeklyStats(dayMap);
    const todayHands = dayMap[today.toISOString().slice(0, 10)]?.hands || 0;
    const totalDays = Object.keys(dayMap).length;
    const totalHands = Object.values(dayMap).reduce((s, d) => s + d.hands, 0);
    const selectedData = selectedDay ? dayMap[selectedDay] : null;

    return (
        <>
            <Head><title>Training Calendar | Smarter.Poker GTO Training</title></Head>
            <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)', color: '#e2e8f0', fontFamily: "'Inter', -apple-system, sans-serif" }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => router.push('/hub/training')} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer', width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>Training Calendar</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>Your activity heatmap</div>
                    </div>
                </div>
                <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
                    {loading && (
                        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} style={{ width: 32, height: 32, margin: '0 auto 12px', border: '2px solid rgba(255,255,255,0.05)', borderTopColor: '#00d4ff', borderRadius: '50%' }} />
                            Loading calendar...
                        </div>
                    )}

                    {!loading && (
                        <>
                            {/* Stats Row */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 20 }}>
                                <div style={{ padding: '14px', borderRadius: 12, background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.1)', textAlign: 'center' }}>
                                    <div style={{ fontSize: 22, fontWeight: 800, color: '#00d4ff' }}>{streak}</div>
                                    <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase' }}>DAY STREAK</div>
                                </div>
                                <div style={{ padding: '14px', borderRadius: 12, background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.1)', textAlign: 'center' }}>
                                    <div style={{ fontSize: 22, fontWeight: 800, color: '#a855f7' }}>{totalDays}</div>
                                    <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase' }}>ACTIVE DAYS</div>
                                </div>
                                <div style={{ padding: '14px', borderRadius: 12, background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.1)', textAlign: 'center' }}>
                                    <div style={{ fontSize: 22, fontWeight: 800, color: '#4ade80' }}>{totalHands}</div>
                                    <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase' }}>TOTAL HANDS</div>
                                </div>
                            </div>

                            {/* Heatmap Grid */}
                            <div style={{ marginBottom: 20 }}>
                                <div style={{ display: 'flex', gap: 2, marginBottom: 4, paddingLeft: 18 }}>
                                    {DAYS.map((d, i) => <div key={i} style={{ width: 16, textAlign: 'center', fontSize: 8, color: '#334155' }}>{d}</div>)}
                                </div>
                                <div style={{ display: 'flex', gap: 2, overflow: 'hidden' }}>
                                    {weeks.map((week, wIdx) => (
                                        <div key={wIdx} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                            {week.map(cell => (
                                                <motion.button
                                                    key={cell.key}
                                                    whileTap={!cell.isFuture ? { scale: 0.8 } : {}}
                                                    onClick={() => !cell.isFuture && setSelectedDay(cell.key === selectedDay ? null : cell.key)}
                                                    style={{
                                                        width: 16, height: 16, borderRadius: 3, border: 'none',
                                                        background: cell.isFuture ? 'transparent'
                                                            : cell.isToday ? 'rgba(251,191,36,0.4)'
                                                                : INTENSITY_COLORS[getIntensity(cell.data?.hands || 0)],
                                                        cursor: cell.isFuture ? 'default' : 'pointer',
                                                        outline: selectedDay === cell.key ? '1px solid #00d4ff' : 'none',
                                                        padding: 0,
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    ))}
                                </div>
                                {/* Legend */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, justifyContent: 'flex-end' }}>
                                    <span style={{ fontSize: 8, color: '#334155' }}>Less</span>
                                    {INTENSITY_COLORS.map((c, i) => <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: c }} />)}
                                    <span style={{ fontSize: 8, color: '#334155' }}>More</span>
                                </div>
                            </div>

                            {/* Selected Day Detail */}
                            {selectedDay && (
                                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                                    style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(0,212,255,0.1)', marginBottom: 16 }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>{new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
                                    {selectedData ? (
                                        <div style={{ display: 'flex', gap: 16 }}>
                                            <div><span style={{ fontSize: 16, fontWeight: 800, color: '#00d4ff' }}>{selectedData.hands}</span> <span style={{ fontSize: 10, color: '#64748b' }}>hands</span></div>
                                            <div><span style={{ fontSize: 16, fontWeight: 800, color: '#a855f7' }}>{selectedData.sessions}</span> <span style={{ fontSize: 10, color: '#64748b' }}>sessions</span></div>
                                            <div><span style={{ fontSize: 16, fontWeight: 800, color: selectedData.hands > 0 ? (Math.round((selectedData.correct / selectedData.hands) * 100) >= 75 ? '#4ade80' : '#fbbf24') : '#64748b' }}>{selectedData.hands > 0 ? Math.round((selectedData.correct / selectedData.hands) * 100) : 0}%</span> <span style={{ fontSize: 10, color: '#64748b' }}>accuracy</span></div>
                                        </div>
                                    ) : (
                                        <div style={{ fontSize: 11, color: '#475569' }}>No training on this day</div>
                                    )}
                                </motion.div>
                            )}

                            {/* Daily Goal & Weekly Summary */}
                            <div style={{ marginTop: 24, display: 'flex', gap: 16, flexDirection: 'column' }}>
                                {/* Daily Goal */}
                                <div style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>Daily Training Goal</div>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: '#00d4ff' }}>{todayHands} / 50 Hands</div>
                                    </div>
                                    <div style={{ height: 8, background: 'rgba(0,0,0,0.3)', borderRadius: 4, overflow: 'hidden' }}>
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${Math.min(100, (todayHands / 50) * 100)}%` }}
                                            style={{ height: '100%', background: 'linear-gradient(90deg, #00d4ff, #3b82f6)' }}
                                        />
                                    </div>
                                    {todayHands >= 50 && <div style={{ fontSize: 11, color: '#4ade80', marginTop: 8, fontWeight: 600 }}>🌟 Goal Met! +1 to Streak</div>}
                                </div>

                                {/* Weekly Summary */}
                                <div style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 12 }}>Last 7 Days Summary</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <div>
                                            <div style={{ fontSize: 11, color: '#64748b' }}>Sessions</div>
                                            <div style={{ fontSize: 16, fontWeight: 800, color: '#a855f7' }}>{weeklyStats.sessions}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 11, color: '#64748b' }}>Hands Played</div>
                                            <div style={{ fontSize: 16, fontWeight: 800, color: '#4ade80' }}>{weeklyStats.hands}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 11, color: '#64748b' }}>Avg Accuracy</div>
                                            <div style={{ fontSize: 16, fontWeight: 800, color: weeklyStats.accuracy >= 75 ? '#4ade80' : '#fbbf24' }}>{weeklyStats.accuracy}%</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}

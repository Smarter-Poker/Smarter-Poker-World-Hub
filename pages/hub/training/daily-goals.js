/**
 * DAILY GOALS — Micro-Challenge System
 * ═══════════════════════════════════════════════════════════════════════════
 * Auto-generated daily challenges (volume, accuracy, streaks)
 *
 * Route: /hub/training/daily-goals
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, getAccessToken } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';

function generateGoals(sessionsParams) {
    const today = new Date().toISOString().slice(0, 10);
    const sessions = sessionsParams || [];
    const todaySessions = sessions.filter(s => s.created_at && s.created_at.startsWith(today));

    let todayHands = 0;
    let todayCorrect = 0;
    todaySessions.forEach(s => {
        todayHands += (s.hands_played || s.total_questions || 0);
        todayCorrect += (s.correct_count || s.correct_answers || 0);
    });

    const goals = [
        { id: 'vol', label: 'Play 50 Hands', target: 50, current: todayHands, type: 'count', color: '#3b82f6', icon: '🎯' },
        { id: 'acc', label: '75%+ Accuracy Today', target: 75, current: todayHands >= 10 ? Math.round((todayCorrect / todayHands) * 100) : 0, type: 'percent', color: '#4ade80', icon: '📈' },
        { id: 'sesh', label: 'Complete 3 Sessions', target: 3, current: todaySessions.length, type: 'count', color: '#fbbf24', icon: '⚡' },
    ];

    return { goals, completeCount: goals.filter(g => g.current >= g.target).length };
}

export default function DailyGoalsPage() {
    const router = useRouter();
    useTrainingBus('daily-goals');
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState({ goals: [], completeCount: 0 });

    const fetchData = useCallback(async () => {
        const user = getAuthUser();
        if (!user?.id) { setLoading(false); return; }
        try {
            const token = getAccessToken();
            const res = await fetch(`/api/training/get-sessions?limit=50`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
            const d = await res.json();
            if (d.success && d.sessions) setData(generateGoals(d.sessions));
        } catch (e) { console.error('[DailyGoals]', e); }
        setLoading(false);
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);
    useEffect(() => {
        const h = () => fetchData();
        eventBus.on(EventType?.SESSION_END || 'training:session-complete', h);
        return () => eventBus.off(EventType?.SESSION_END || 'training:session-complete', h);
    }, [fetchData]);

    return (
        <>
            <Head><title>Daily Goals | Smarter.Poker Training</title></Head>
            <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)', color: '#e2e8f0', fontFamily: "'Inter', -apple-system, sans-serif" }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => router.push('/hub/training')} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer', width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
                    <div><div style={{ fontSize: 16, fontWeight: 700 }}>Daily Goals</div><div style={{ fontSize: 11, color: '#64748b' }}>Resets at midnight</div></div>
                </div>

                <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
                    {loading && (
                        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} style={{ width: 32, height: 32, margin: '0 auto 12px', border: '2px solid rgba(255,255,255,0.05)', borderTopColor: '#3b82f6', borderRadius: '50%' }} />
                            Loading goals...
                        </div>
                    )}

                    {!loading && (
                        <>
                            {/* Header Summary */}
                            <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
                                <div style={{ flex: 1, padding: '20px', borderRadius: 16, background: data.completeCount === 3 ? 'linear-gradient(135deg, rgba(34,197,94,0.1), rgba(0,0,0,0.2))' : 'rgba(0,0,0,0.2)', border: `1px solid ${data.completeCount === 3 ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.05)'}`, textAlign: 'center' }}>
                                    <div style={{ fontSize: 48, marginBottom: 8 }}>{data.completeCount === 3 ? '👑' : '🎯'}</div>
                                    <div style={{ fontSize: 24, fontWeight: 900, color: data.completeCount === 3 ? '#4ade80' : '#e2e8f0' }}>{data.completeCount}/3</div>
                                    <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 }}>Goals Completed</div>
                                </div>
                            </div>

                            {/* Goals List */}
                            <AnimatePresence>
                                {data.goals.map((g, i) => {
                                    const isComplete = g.current >= g.target;
                                    const percent = Math.min(100, (g.current / g.target) * 100);
                                    return (
                                        <motion.div key={g.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.1 }}
                                            style={{ padding: '16px', borderRadius: 16, marginBottom: 12, background: isComplete ? `${g.color}15` : 'rgba(0,0,0,0.2)', border: `1px solid ${isComplete ? `${g.color}30` : 'rgba(255,255,255,0.05)'}` }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <div style={{ fontSize: 20 }}>{g.icon}</div>
                                                    <div style={{ fontSize: 14, fontWeight: 700, color: isComplete ? '#fff' : '#e2e8f0' }}>{g.label}</div>
                                                </div>
                                                <div style={{ fontSize: 14, fontWeight: 800, color: isComplete ? g.color : '#94a3b8' }}>
                                                    {g.current} <span style={{ fontSize: 10, fontWeight: 600, color: '#64748b' }}>/ {g.target}{g.type === 'percent' ? '%' : ''}</span>
                                                </div>
                                            </div>
                                            {/* Progress Bar */}
                                            <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                                                <motion.div initial={{ width: 0 }} animate={{ width: `${percent}%` }} transition={{ duration: 1, ease: 'easeOut' }}
                                                    style={{ height: '100%', background: isComplete ? g.color : `linear-gradient(90deg, ${g.color}66, ${g.color})`, borderRadius: 3 }} />
                                            </div>
                                            {isComplete && (
                                                <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} style={{ fontSize: 10, fontWeight: 700, color: g.color, marginTop: 8, textAlign: 'right', textTransform: 'uppercase', letterSpacing: 1 }}>
                                                    ✓ COMPLETED
                                                </motion.div>
                                            )}
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>

                            <motion.button whileTap={{ scale: 0.97 }} onClick={() => router.push('/hub/training')}
                                style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 12 }}>
                                Back to Training
                            </motion.button>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}

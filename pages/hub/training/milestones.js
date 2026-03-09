/**
 * TRAINING MILESTONES — Achievement Timeline
 * ═══════════════════════════════════════════════════════════════════════════
 * Visual timeline of career milestones auto-detected from session history.
 *
 * Route: /hub/training/milestones
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, getAccessToken } from '../../../src/lib/authUtils';


const MILESTONE_DEFS = [
    { id: 'first-session', name: 'First Steps', desc: 'Complete your first training session', icon: '🎯', check: s => s.totalSessions >= 1 },
    { id: 'ten-sessions', name: 'Getting Serious', desc: 'Complete 10 training sessions', icon: '📈', check: s => s.totalSessions >= 10 },
    { id: 'hundred-hands', name: 'Century Club', desc: 'Train on 100 hands', icon: '💯', check: s => s.totalHands >= 100 },
    { id: 'five-hundred-hands', name: 'Grinder', desc: 'Train on 500 hands', icon: '⚡', check: s => s.totalHands >= 500 },
    { id: 'thousand-hands', name: 'Iron Will', desc: 'Train on 1,000 hands', icon: '🏋️', check: s => s.totalHands >= 1000 },
    { id: 'seventy-acc', name: 'Above Average', desc: 'Achieve 70% overall accuracy', icon: '📊', check: s => s.avgAccuracy >= 70 },
    { id: 'eighty-acc', name: 'Sharp Shooter', desc: 'Achieve 80% overall accuracy', icon: '🎯', check: s => s.avgAccuracy >= 80 },
    { id: 'ninety-acc', name: 'GTO Machine', desc: 'Achieve 90% overall accuracy', icon: '🤖', check: s => s.avgAccuracy >= 90 },
    { id: 'perfect-session', name: 'Perfect Round', desc: 'Score 100% in a single session', icon: '👑', check: s => s.hadPerfect },
    { id: 'streak-3', name: 'On a Roll', desc: '3 consecutive training days', icon: '🔥', check: s => s.maxStreak >= 3 },
    { id: 'streak-7', name: 'Week Warrior', desc: '7 consecutive training days', icon: '🗓️', check: s => s.maxStreak >= 7 },
    { id: 'streak-30', name: 'Monthly Legend', desc: '30 consecutive training days', icon: '🏆', check: s => s.maxStreak >= 30 },
    { id: 'five-games', name: 'Variety Pack', desc: 'Train on 5 different game types', icon: '🎲', check: s => s.uniqueGames >= 5 },
    { id: 'ten-games', name: 'Well Rounded', desc: 'Train on 10 different game types', icon: '🌟', check: s => s.uniqueGames >= 10 },
    { id: 'fifty-sessions', name: 'Dedicated Pro', desc: 'Complete 50 training sessions', icon: '💎', check: s => s.totalSessions >= 50 },
];

function computeStats(sessions) {
    if (!sessions || sessions.length === 0) return null;
    let totalHands = 0, totalCorrect = 0, hadPerfect = false;
    const gameSet = new Set();
    const daySet = new Set();

    sessions.forEach(s => {
        const h = s.hands_played || s.total_questions || 0;
        const c = s.correct_count || s.correct_answers || 0;
        totalHands += h;
        totalCorrect += c;
        if (h > 0 && c === h) hadPerfect = true;
        if (s.game_id) gameSet.add(s.game_id);
        if (s.created_at) daySet.add(new Date(s.created_at).toISOString().slice(0, 10));
    });

    // Streak calculation
    const sortedDays = Array.from(daySet).sort();
    let maxStreak = 1, currentStreak = 1;
    for (let i = 1; i < sortedDays.length; i++) {
        const prev = new Date(sortedDays[i - 1]);
        const curr = new Date(sortedDays[i]);
        const diff = (curr - prev) / 86400000;
        if (diff === 1) { currentStreak++; maxStreak = Math.max(maxStreak, currentStreak); }
        else currentStreak = 1;
    }

    return {
        totalSessions: sessions.length,
        totalHands,
        avgAccuracy: totalHands > 0 ? Math.round((totalCorrect / totalHands) * 100) : 0,
        hadPerfect,
        maxStreak: sortedDays.length > 0 ? maxStreak : 0,
        uniqueGames: gameSet.size,
    };
}

export default function MilestonesPage() {
    const router = useRouter();
    useTrainingBus('milestones');
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);

    const fetchData = useCallback(async () => {
        const user = getAuthUser();
        if (!user?.id) { setLoading(false); return; }
        try {
            const token = getAccessToken();
            const res = await fetch(`/api/training/get-sessions?limit=500`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            const data = await res.json();
            if (data.success && data.sessions) setStats(computeStats(data.sessions));
        } catch (e) { console.error('[Milestones] Error:', e); }
        setLoading(false);
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);
    useEffect(() => {
        const h = () => fetchData();
        window.addEventListener('training:session-complete', h);
        return () => window.removeEventListener('training:session-complete', h);
    }, [fetchData]);

    const earned = stats ? MILESTONE_DEFS.filter(m => m.check(stats)) : [];
    const locked = stats ? MILESTONE_DEFS.filter(m => !m.check(stats)) : MILESTONE_DEFS;

    return (
        <>
            <Head><title>Milestones | Smarter.Poker GTO Training</title></Head>
            <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)', color: '#e2e8f0', fontFamily: "'Inter', -apple-system, sans-serif" }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => router.push('/hub/training')} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer', width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>Milestones</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>Your training achievements</div>
                    </div>
                    <div style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 6, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#fbbf24' }}>{earned.length}</span>
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>/{MILESTONE_DEFS.length}</span>
                    </div>
                </div>
                <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
                    {loading && (
                        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} style={{ width: 32, height: 32, margin: '0 auto 12px', border: '2px solid rgba(255,255,255,0.05)', borderTopColor: '#fbbf24', borderRadius: '50%' }} />
                            Loading milestones...
                        </div>
                    )}
                    {!loading && earned.length > 0 && (
                        <div style={{ marginBottom: 24 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>EARNED</div>
                            {earned.map((m, i) => (
                                <motion.div key={m.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                                    style={{ padding: '14px 16px', borderRadius: 12, marginBottom: 6, background: 'linear-gradient(135deg, rgba(251,191,36,0.06),rgba(251,191,36,0.02))', border: '1px solid rgba(251,191,36,0.12)', display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(251,191,36,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{m.icon}</div>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24' }}>{m.name}</div>
                                        <div style={{ fontSize: 10, color: '#94a3b8' }}>{m.desc}</div>
                                    </div>
                                    <div style={{ marginLeft: 'auto', fontSize: 14 }}>✅</div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                    {!loading && locked.length > 0 && (
                        <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>LOCKED</div>
                            {locked.map((m, i) => (
                                <div key={m.id} style={{ padding: '12px 16px', borderRadius: 12, marginBottom: 4, background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', gap: 12, opacity: 0.5 }}>
                                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🔒</div>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>{m.name}</div>
                                        <div style={{ fontSize: 10, color: '#334155' }}>{m.desc}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

/**
 * STUDY PLAN GENERATOR — Personalized Weekly Training Schedule
 * ═══════════════════════════════════════════════════════════════════════════
 * Analyzes user session data to identify weak spots and generates a 7-day
 * training plan with recommended games and daily goals.
 *
 * Route: /hub/training/study-plan
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, getAccessToken } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';

// ═══════════════════════════════════════════════════════════════════════════
// TRAINING LIBRARY REFERENCE
// ═══════════════════════════════════════════════════════════════════════════

const FOCUS_AREAS = [
    { id: 'bb-defense', name: 'BB Defense', positions: ['BB'], streets: ['preflop'], color: '#3b82f6', icon: '🛡️' },
    { id: 'btn-play', name: 'BTN Play', positions: ['BTN'], streets: ['preflop', 'flop'], color: '#22c55e', icon: '🎯' },
    { id: 'cbet-decisions', name: 'C-Bet Decisions', positions: [], streets: ['flop'], color: '#f97316', icon: '💥' },
    { id: 'turn-play', name: 'Turn Play', positions: [], streets: ['turn'], color: '#a855f7', icon: '🔄' },
    { id: 'river-decisions', name: 'River Decisions', positions: [], streets: ['river'], color: '#ef4444', icon: '🏁' },
    { id: '3bet-pots', name: '3-Bet Pots', positions: [], streets: ['preflop', 'flop'], color: '#ec4899', icon: '⚡' },
    { id: 'mtt-push-fold', name: 'MTT Push/Fold', positions: [], streets: ['preflop'], color: '#fbbf24', icon: '🏆' },
    { id: 'position-awareness', name: 'Position Play', positions: ['CO', 'HJ', 'MP'], streets: ['preflop'], color: '#06b6d4', icon: '🧭' },
    { id: 'sb-play', name: 'SB Strategy', positions: ['SB'], streets: ['preflop', 'flop'], color: '#8b5cf6', icon: '♠️' },
    { id: 'bluffing', name: 'Bluffing Spots', positions: [], streets: ['turn', 'river'], color: '#f43f5e', icon: '🃏' },
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const DIFFICULTY_LABELS = { easy: 'Foundation', medium: 'Tactical', hard: 'Advanced' };

// ═══════════════════════════════════════════════════════════════════════════
// PLAN GENERATOR ENGINE
// ═══════════════════════════════════════════════════════════════════════════

function generateStudyPlan(sessions) {
    const plan = [];
    const weakAreas = analyzeWeaknesses(sessions);

    // Build 7-day schedule
    for (let i = 0; i < 7; i++) {
        const dayAreas = [];
        const isRestDay = i === 6; // Sunday: lighter load

        if (isRestDay) {
            // Light review day
            dayAreas.push({
                ...FOCUS_AREAS[i % FOCUS_AREAS.length],
                difficulty: 'easy',
                goal: 85,
                questionCount: 15,
                reason: 'Review day — keep sharp without burnout',
            });
        } else {
            // Main weak area focus
            const primaryWeakness = weakAreas[i % weakAreas.length] || FOCUS_AREAS[i % FOCUS_AREAS.length];
            dayAreas.push({
                ...primaryWeakness,
                difficulty: 'medium',
                goal: 80,
                questionCount: 25,
                reason: primaryWeakness.weakness
                    ? `You\'re at ${primaryWeakness.accuracy}% here — needs work`
                    : 'Balanced training to fill gaps',
            });

            // Secondary area (different from primary)
            const secondaryIdx = (i + 3) % FOCUS_AREAS.length;
            const secondary = FOCUS_AREAS[secondaryIdx];
            if (secondary.id !== primaryWeakness.id) {
                dayAreas.push({
                    ...secondary,
                    difficulty: i < 3 ? 'easy' : 'medium',
                    goal: 75,
                    questionCount: 15,
                    reason: 'Diversify your training',
                });
            }

            // Every other day: add a challenge drill
            if (i % 2 === 0) {
                dayAreas.push({
                    id: 'challenge',
                    name: 'Daily Challenge',
                    color: '#fbbf24',
                    icon: '⭐',
                    difficulty: 'hard',
                    goal: 70,
                    questionCount: 10,
                    reason: 'Push your limits with harder spots',
                });
            }
        }

        plan.push({
            day: DAYS[i],
            dayIndex: i,
            areas: dayAreas,
            totalQuestions: dayAreas.reduce((sum, a) => sum + a.questionCount, 0),
            completed: false,
        });
    }

    return plan;
}

function analyzeWeaknesses(sessions) {
    if (!sessions || sessions.length === 0) {
        // No data — return default rotation
        return FOCUS_AREAS.slice(0, 5);
    }

    // Group sessions by game_id prefix to identify weak categories
    const categoryStats = {};
    sessions.forEach(s => {
        const category = (s.game_id || '').split('-')[0] || 'unknown';
        if (!categoryStats[category]) {
            categoryStats[category] = { total: 0, correct: 0, sessions: 0, evLoss: 0 };
        }
        categoryStats[category].total += (s.hands_played || s.total_questions || 0);
        categoryStats[category].correct += (s.correct_count || s.correct_answers || 0);
        categoryStats[category].sessions += 1;
        categoryStats[category].evLoss += (s.total_ev_loss || 0);
    });

    // Compute accuracy per category and rank by weakness
    const ranked = Object.entries(categoryStats).map(([cat, stats]) => ({
        category: cat,
        accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
        evLoss: stats.evLoss,
        sessions: stats.sessions,
    })).sort((a, b) => a.accuracy - b.accuracy);

    // Map weakest categories to focus areas
    const weakFocusAreas = ranked.slice(0, 5).map((r, idx) => {
        const matchedArea = FOCUS_AREAS.find(f =>
            f.id.includes(r.category) || r.category.includes(f.id.split('-')[0])
        ) || FOCUS_AREAS[idx % FOCUS_AREAS.length];

        return {
            ...matchedArea,
            weakness: true,
            accuracy: r.accuracy,
            evLoss: r.evLoss,
        };
    });

    return weakFocusAreas.length > 0 ? weakFocusAreas : FOCUS_AREAS.slice(0, 5);
}

// ═══════════════════════════════════════════════════════════════════════════
// DAY CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function DayCard({ dayPlan, isToday, onStartArea, completedAreas }) {
    const [expanded, setExpanded] = useState(isToday);
    const allDone = dayPlan.areas.every((_, i) => completedAreas.includes(`${dayPlan.dayIndex}-${i}`));

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
                background: isToday
                    ? 'linear-gradient(135deg, rgba(0,212,255,0.06) 0%, rgba(0,212,255,0.02) 100%)'
                    : 'rgba(0,0,0,0.2)',
                border: `1px solid ${isToday ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.05)'}`,
                borderRadius: 14, overflow: 'hidden', marginBottom: 10,
            }}
        >
            {/* Header */}
            <motion.button
                onClick={() => setExpanded(!expanded)}
                whileTap={{ scale: 0.99 }}
                style={{
                    width: '100%', padding: '14px 16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'none', border: 'none', cursor: 'pointer',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {allDone ? (
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(34,197,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>✅</div>
                    ) : isToday ? (
                        <motion.div
                            animate={{ boxShadow: ['0 0 8px rgba(0,212,255,0.3)', '0 0 16px rgba(0,212,255,0.6)', '0 0 8px rgba(0,212,255,0.3)'] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,212,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#00d4ff', fontWeight: 800 }}
                        >
                            ▶
                        </motion.div>
                    ) : (
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#475569', fontWeight: 700 }}>
                            {dayPlan.dayIndex + 1}
                        </div>
                    )}
                    <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: isToday ? '#00d4ff' : '#e2e8f0' }}>
                            {dayPlan.day} {isToday && <span style={{ fontSize: 10, color: '#00d4ff', fontWeight: 600 }}>— TODAY</span>}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                            {dayPlan.areas.length} focus {dayPlan.areas.length === 1 ? 'area' : 'areas'} · {dayPlan.totalQuestions} questions
                        </div>
                    </div>
                </div>
                <motion.span
                    animate={{ rotate: expanded ? 180 : 0 }}
                    style={{ color: '#475569', fontSize: 14 }}
                >
                    ▼
                </motion.span>
            </motion.button>

            {/* Expanded Content */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        style={{ overflow: 'hidden' }}
                    >
                        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {dayPlan.areas.map((area, areaIdx) => {
                                const areaKey = `${dayPlan.dayIndex}-${areaIdx}`;
                                const isDone = completedAreas.includes(areaKey);

                                return (
                                    <motion.div
                                        key={areaIdx}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={() => !isDone && onStartArea(area, areaKey)}
                                        style={{
                                            padding: '12px 14px', borderRadius: 10,
                                            background: isDone ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.02)',
                                            border: `1px solid ${isDone ? 'rgba(34,197,94,0.15)' : `${area.color}18`}`,
                                            cursor: isDone ? 'default' : 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            opacity: isDone ? 0.6 : 1,
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <span style={{ fontSize: 18 }}>{area.icon}</span>
                                            <div>
                                                <div style={{ fontSize: 13, fontWeight: 700, color: isDone ? '#22c55e' : area.color }}>
                                                    {area.name}
                                                    {isDone && <span style={{ marginLeft: 6, fontSize: 10, color: '#22c55e' }}>✓ Done</span>}
                                                </div>
                                                <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>
                                                    {area.reason}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: 11, fontWeight: 700, color: area.color }}>{area.questionCount}Q</div>
                                            <div style={{ fontSize: 9, color: '#475569' }}>Goal: {area.goal}%</div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function StudyPlanPage() {
    const router = useRouter();
    useTrainingBus('study-plan');
    const [plan, setPlan] = useState(null);
    const [loading, setLoading] = useState(true);
    const [sessions, setSessions] = useState([]);
    const [completedAreas, setCompletedAreas] = useState([]);

    // Get current day of week (0 = Monday)
    const today = new Date();
    const todayIdx = (today.getDay() + 6) % 7; // JS Sunday=0 → shift so Monday=0

    const fetchSessions = useCallback(async () => {
        const user = getAuthUser();
        if (!user?.id) { setLoading(false); return; }
        try {
            const token = getAccessToken();
            const res = await fetch(`/api/training/get-sessions?limit=100`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            const data = await res.json();
            if (data.success && data.sessions) {
                setSessions(data.sessions);
            }
        } catch (e) {
            console.error('[StudyPlan] Fetch error:', e);
        }
        setLoading(false);
    }, []);

    // Generate plan from sessions
    useEffect(() => {
        if (!loading && sessions !== null) {
            const newPlan = generateStudyPlan(sessions);
            setPlan(newPlan);

            // Restore completed areas from localStorage
            try {
                const saved = localStorage.getItem('study-plan-completed');
                const savedWeek = localStorage.getItem('study-plan-week');
                const currentWeek = getWeekNumber();
                if (saved && savedWeek === String(currentWeek)) {
                    setCompletedAreas(JSON.parse(saved));
                }
            } catch { }
        }
    }, [loading, sessions]);

    // Fetch on mount
    useEffect(() => {
        fetchSessions();
    }, [fetchSessions]);

    // Bus listener — refresh when session completes
    useEffect(() => {
        const unsub = eventBus.on(EventType.SESSION_END, () => fetchSessions());
        return unsub;
    }, [fetchSessions]);

    const handleStartArea = (area, areaKey) => {
        // Navigate to arena with focus params
        const params = new URLSearchParams({
            format: 'cash',
            positions: (area.positions || []).join(','),
            streets: (area.streets || []).join(','),
            stackMin: '80',
            stackMax: '200',
        });
        router.push(`/hub/training/arena/spot-trainer?${params.toString()}`);

        // Mark as completed (optimistic)
        const newCompleted = [...completedAreas, areaKey];
        setCompletedAreas(newCompleted);
        try {
            localStorage.setItem('study-plan-completed', JSON.stringify(newCompleted));
            localStorage.setItem('study-plan-week', String(getWeekNumber()));
        } catch { }
    };

    const regeneratePlan = () => {
        const newPlan = generateStudyPlan(sessions);
        setPlan(newPlan);
        setCompletedAreas([]);
        try {
            localStorage.removeItem('study-plan-completed');
        } catch { }
    };

    // Week number helper
    function getWeekNumber() {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
        const week1 = new Date(d.getFullYear(), 0, 4);
        return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
    }

    const totalCompleted = completedAreas.length;
    const totalAreas = plan ? plan.reduce((sum, d) => sum + d.areas.length, 0) : 0;
    const progress = totalAreas > 0 ? Math.round((totalCompleted / totalAreas) * 100) : 0;

    return (
        <>
            <Head>
                <title>Study Plan | Smarter.Poker GTO Training</title>
            </Head>
            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)',
                color: '#e2e8f0',
                fontFamily: "'Inter', -apple-system, sans-serif",
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button
                            onClick={() => router.push('/hub/training')}
                            style={{
                                background: 'rgba(255,255,255,0.05)', border: 'none',
                                color: '#94a3b8', fontSize: 18, cursor: 'pointer',
                                width: 36, height: 36, borderRadius: 8,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            ←
                        </button>
                        <div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>
                                Weekly Study Plan
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                                Personalized training schedule
                            </div>
                        </div>
                    </div>
                    <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={regeneratePlan}
                        style={{
                            padding: '8px 14px', borderRadius: 8,
                            border: '1px solid rgba(255,255,255,0.1)',
                            background: 'rgba(255,255,255,0.03)',
                            color: '#94a3b8', fontSize: 11, fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        New Plan
                    </motion.button>
                </div>

                <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>

                    {/* Progress Overview */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{
                            padding: '18px 16px', borderRadius: 14, marginBottom: 20,
                            background: 'linear-gradient(135deg, rgba(0,212,255,0.06) 0%, rgba(139,92,246,0.04) 100%)',
                            border: '1px solid rgba(0,212,255,0.12)',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>
                                    WEEK PROGRESS
                                </div>
                                <div style={{ fontSize: 28, fontWeight: 800, color: '#e2e8f0', marginTop: 2 }}>
                                    {progress}%
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 22, fontWeight: 800, color: '#00d4ff' }}>
                                    {totalCompleted}/{totalAreas}
                                </div>
                                <div style={{ fontSize: 10, color: '#64748b' }}>drills completed</div>
                            </div>
                        </div>
                        {/* Progress bar */}
                        <div style={{
                            height: 6, borderRadius: 3,
                            background: 'rgba(255,255,255,0.06)',
                            overflow: 'hidden',
                        }}>
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${progress}%` }}
                                transition={{ duration: 0.8, ease: 'easeOut' }}
                                style={{
                                    height: '100%', borderRadius: 3,
                                    background: progress >= 80
                                        ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                                        : progress >= 40
                                            ? 'linear-gradient(90deg, #fbbf24, #f97316)'
                                            : 'linear-gradient(90deg, #00d4ff, #3b82f6)',
                                }}
                            />
                        </div>
                    </motion.div>

                    {/* Loading State */}
                    {loading && (
                        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                style={{
                                    width: 32, height: 32, margin: '0 auto 12px',
                                    border: '2px solid rgba(255,255,255,0.05)',
                                    borderTopColor: '#00d4ff', borderRadius: '50%',
                                }}
                            />
                            Analyzing your training data...
                        </div>
                    )}

                    {/* Day Cards */}
                    {plan && plan.map((dayPlan, idx) => (
                        <DayCard
                            key={idx}
                            dayPlan={dayPlan}
                            isToday={idx === todayIdx}
                            onStartArea={handleStartArea}
                            completedAreas={completedAreas}
                        />
                    ))}

                    {/* Footer tip */}
                    {plan && (
                        <div style={{
                            textAlign: 'center', padding: '20px 16px',
                            fontSize: 11, color: '#475569', lineHeight: 1.5,
                        }}>
                            Plan regenerates each week based on your latest performance.
                            <br />
                            Complete at least 4 days to maintain your streak bonus.
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

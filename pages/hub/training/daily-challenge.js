/**
 * Daily GTO Challenge — Hand of the Day
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 24: Daily solver-verified GTO spot with leaderboard and streak
 * tracking. One challenge per day, changes at midnight UTC.
 *
 * Route: /hub/training/daily-challenge
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType, busEmit } from '../../../src/engine/EventBus';
import Card from '../../../src/components/training/Card';



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
// COUNTDOWN TIMER
// ═══════════════════════════════════════════════════════════════════════════

function CountdownTimer({ expiresAt }) {
    const [remaining, setRemaining] = useState('');

    useEffect(() => {
        if (!expiresAt) return;
        const tick = () => {
            const now = Date.now();
            const expires = new Date(expiresAt).getTime();
            const diff = Math.max(0, expires - now);
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            setRemaining(`${h}h ${m}m ${s}s`);
        };
        tick();
        const iv = setInterval(tick, 1000);
        return () => clearInterval(iv);
    }, [expiresAt]);

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 11, fontWeight: 700, color: '#64748b',
        }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#64748b">
                <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z" />
            </svg>
            <span>Next challenge in {remaining}</span>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STREAK CALENDAR (30 days)
// ═══════════════════════════════════════════════════════════════════════════

function StreakCalendar({ completedDays }) {
    const days = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        const isCompleted = completedDays.includes(key);
        const isToday = i === 0;
        days.push({ key, isCompleted, isToday, day: d.getDate() });
    }

    return (
        <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)',
            gap: 3,
        }}>
            {days.map(d => (
                <div key={d.key} style={{
                    aspectRatio: '1', borderRadius: 4,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 8, fontWeight: 700,
                    background: d.isCompleted
                        ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                        : d.isToday
                            ? 'rgba(234,179,8,0.15)'
                            : 'rgba(255,255,255,0.03)',
                    border: d.isToday
                        ? '1px solid rgba(234,179,8,0.4)'
                        : d.isCompleted
                            ? '1px solid rgba(34,197,94,0.3)'
                            : '1px solid rgba(255,255,255,0.04)',
                    color: d.isCompleted ? '#fff' : d.isToday ? '#eab308' : '#475569',
                }}>
                    {d.day}
                </div>
            ))}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function DailyChallengePage() {
    const router = useRouter();
    useTrainingBus('daily-challenge');

    const [challenge, setChallenge] = useState(null);
    const [expiresAt, setExpiresAt] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selected, setSelected] = useState(null);
    const [showResult, setShowResult] = useState(false);
    const [alreadyCompleted, setAlreadyCompleted] = useState(false);
    const [completedDays, setCompletedDays] = useState([]);
    const [currentStreak, setCurrentStreak] = useState(0);
    const answered = useRef(false);

    // Fetch daily challenge
    const fetchChallenge = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/training/hand-of-the-day', {
                headers: getAuthHeaders(),
            });
            const data = await res.json();
            if (data.success) {
                setChallenge(data.question);
                setExpiresAt(data.expiresAt);

                // Check local storage for prior completion today
                const today = new Date().toISOString().split('T')[0];
                const todayKey = `daily-challenge-${today}`;
                const prior = localStorage.getItem(todayKey);
                if (prior) {
                    const parsed = JSON.parse(prior);
                    setAlreadyCompleted(true);
                    setSelected(parsed.selected);
                    setShowResult(true);
                    answered.current = true;
                }

                // Load streak data from local storage
                const streakData = JSON.parse(localStorage.getItem('daily-challenge-streak') || '[]');
                setCompletedDays(streakData);

                // Calculate current streak
                let streak = 0;
                const d = new Date();
                for (let i = 0; i < 365; i++) {
                    const key = d.toISOString().split('T')[0];
                    if (streakData.includes(key) || (i === 0 && prior)) {
                        streak++;
                    } else if (i > 0) {
                        break;
                    }
                    d.setDate(d.getDate() - 1);
                }
                setCurrentStreak(streak);
            } else {
                setError(data.error || 'Failed to load daily challenge');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchChallenge(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Bus listener
    useEffect(() => {
        const unsub = eventBus.on(EventType.SESSION_END, () => fetchChallenge());
        return unsub;
    }, [fetchChallenge]);

    // Handle answer
    const handleAnswer = useCallback((action) => {
        if (answered.current || !challenge) return;
        answered.current = true;
        setSelected(action);
        setShowResult(true);

        const correctAction = challenge.correct_answer || challenge.gto_action;
        const isCorrect = action === correctAction;

        // Save to local storage
        const today = new Date().toISOString().split('T')[0];
        localStorage.setItem(`daily-challenge-${today}`, JSON.stringify({
            selected: action, isCorrect, timestamp: Date.now(),
        }));

        // Update streak
        const streakData = JSON.parse(localStorage.getItem('daily-challenge-streak') || '[]');
        if (!streakData.includes(today)) {
            streakData.push(today);
            localStorage.setItem('daily-challenge-streak', JSON.stringify(streakData));
            setCompletedDays([...streakData]);
        }

        // Record on server (fire and forget)
        try {
            const userId = JSON.parse(localStorage.getItem('sb-auth-token') || '{}')?.user?.id;
            if (userId) {
                fetch('/api/training/hand-of-the-day', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                    body: JSON.stringify({
                        userId,
                        dailyId: `daily-${today}`,
                        score: isCorrect ? 100 : 0,
                        evLoss: isCorrect ? 0 : 1,
                    }),
                });
            }
        } catch (_) { /* ignore */ }

        // Emit bus events
        try {
            eventBus.emit('training:daily-challenge-completed', { accuracy: isCorrect ? 100 : 0 }, 'DailyChallenge');
            busEmit.sessionEnd('DailyChallenge');
        } catch (_) { /* SSG guard */ }
    }, [challenge]);

    // Derive question data
    const options = challenge?.options
        || challenge?.choices
        || ['Fold', 'Call', 'Raise', 'All-In'];
    const correctAnswer = challenge?.correct_answer || challenge?.gto_action || options[0];
    const board = challenge?.board_cards || challenge?.board || [];
    const heroHand = challenge?.hero_hand || challenge?.hand || '';
    const scenario = challenge?.scenario_text || challenge?.question || 'What is the GTO play?';
    const explanation = challenge?.explanation || challenge?.gto_explanation || '';
    const frequencies = challenge?.action_breakdown || challenge?.gto_frequencies || null;
    const position = challenge?.hero_position || challenge?.position || '';
    const street = challenge?.street || '';

    return (
        <>
            <Head>
                <title>Daily GTO Challenge | Smarter.Poker</title>
                <meta name="description" content="Daily solver-verified GTO spot. Test your skills, track your streak, and compete on the leaderboard." />
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
                            background: 'linear-gradient(135deg, #eab308, #f97316)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                            fontFamily: "'Orbitron', monospace",
                        }}>
                            Daily Challenge
                        </h1>
                        <span style={{
                            fontSize: 10, color: '#eab308', background: 'rgba(234,179,8,0.1)',
                            padding: '3px 8px', borderRadius: 12, fontWeight: 700,
                            border: '1px solid rgba(234,179,8,0.2)',
                            fontFamily: "'Orbitron', monospace",
                        }}>
                            PHASE 24
                        </span>
                    </div>
                    {expiresAt && (
                        <div style={{ marginTop: 6 }}>
                            <CountdownTimer expiresAt={expiresAt} />
                        </div>
                    )}
                </div>

                <div style={{ padding: '16px 24px', maxWidth: 600, margin: '0 auto' }}>

                    {/* Streak + Stats Bar */}
                    <div style={{
                        display: 'flex', gap: 8, marginBottom: 14,
                    }}>
                        <div style={{
                            flex: 1, textAlign: 'center',
                            background: 'rgba(234,179,8,0.06)',
                            border: '1px solid rgba(234,179,8,0.15)',
                            borderRadius: 10, padding: '10px 8px',
                        }}>
                            <div style={{
                                fontSize: 24, fontWeight: 900, color: '#eab308',
                                fontFamily: "'Orbitron', monospace",
                            }}>
                                {currentStreak}
                            </div>
                            <div style={{
                                fontSize: 9, color: '#64748b', fontWeight: 700,
                                textTransform: 'uppercase', letterSpacing: 1,
                            }}>
                                Day Streak
                            </div>
                        </div>
                        <div style={{
                            flex: 1, textAlign: 'center',
                            background: 'rgba(34,197,94,0.06)',
                            border: '1px solid rgba(34,197,94,0.15)',
                            borderRadius: 10, padding: '10px 8px',
                        }}>
                            <div style={{
                                fontSize: 24, fontWeight: 900, color: '#22c55e',
                                fontFamily: "'Orbitron', monospace",
                            }}>
                                {completedDays.length}
                            </div>
                            <div style={{
                                fontSize: 9, color: '#64748b', fontWeight: 700,
                                textTransform: 'uppercase', letterSpacing: 1,
                            }}>
                                Days Done
                            </div>
                        </div>
                        <div style={{
                            flex: 1, textAlign: 'center',
                            background: 'rgba(168,85,247,0.06)',
                            border: '1px solid rgba(168,85,247,0.15)',
                            borderRadius: 10, padding: '10px 8px',
                        }}>
                            <div style={{
                                fontSize: 24, fontWeight: 900, color: '#a855f7',
                                fontFamily: "'Orbitron', monospace",
                            }}>
                                25
                            </div>
                            <div style={{
                                fontSize: 9, color: '#64748b', fontWeight: 700,
                                textTransform: 'uppercase', letterSpacing: 1,
                            }}>
                                Diamonds
                            </div>
                        </div>
                    </div>

                    {/* Error */}
                    {error && (
                        <div style={{
                            padding: '10px 14px', background: 'rgba(239,68,68,0.1)',
                            border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8,
                            color: '#ef4444', fontSize: 12, fontWeight: 600, marginBottom: 14,
                        }}>
                            {error}
                            <button onClick={fetchChallenge} style={{
                                marginLeft: 12, background: 'rgba(234,179,8,0.2)',
                                border: '1px solid rgba(234,179,8,0.4)', borderRadius: 6,
                                padding: '4px 12px', color: '#eab308', cursor: 'pointer',
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
                            LOADING TODAY'S CHALLENGE...
                        </div>
                    )}

                    {/* Challenge Display */}
                    {!loading && challenge && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>

                            {/* Already completed banner */}
                            {alreadyCompleted && (
                                <div style={{
                                    padding: '8px 12px', marginBottom: 12,
                                    background: 'rgba(34,197,94,0.08)',
                                    border: '1px solid rgba(34,197,94,0.2)',
                                    borderRadius: 8, fontSize: 11, fontWeight: 700,
                                    color: '#22c55e', textAlign: 'center',
                                }}>
                                    You already completed today's challenge
                                </div>
                            )}

                            {/* Spot Info */}
                            <div style={{
                                display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap',
                            }}>
                                {position && (
                                    <span style={{
                                        fontSize: 10, fontWeight: 800, color: '#eab308',
                                        background: 'rgba(234,179,8,0.1)', padding: '3px 8px',
                                        borderRadius: 6, fontFamily: "'Orbitron', monospace",
                                    }}>
                                        {position}
                                    </span>
                                )}
                                {street && (
                                    <span style={{
                                        fontSize: 10, fontWeight: 700, color: '#94a3b8',
                                        background: 'rgba(255,255,255,0.04)', padding: '3px 8px',
                                        borderRadius: 6,
                                    }}>
                                        {street}
                                    </span>
                                )}
                            </div>

                            {/* Board + Hand */}
                            <div style={{
                                background: 'linear-gradient(145deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
                                border: '1px solid rgba(234,179,8,0.12)',
                                borderRadius: 14, padding: '20px 24px',
                                marginBottom: 14, textAlign: 'center',
                            }}>
                                {Array.isArray(board) && board.length > 0 && (
                                    <>
                                        <div style={{
                                            fontSize: 9, fontWeight: 700, color: '#64748b',
                                            textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10,
                                            fontFamily: "'Orbitron', monospace",
                                        }}>
                                            BOARD
                                        </div>
                                        <div style={{
                                            display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16,
                                        }}>
                                            {board.map((card, i) => (
                                                <Card key={i} rank={card[0]?.toUpperCase()} suit={card[1]?.toLowerCase()} size="small" />
                                            ))}
                                        </div>
                                    </>
                                )}
                                {heroHand && (
                                    <>
                                        <div style={{
                                            fontSize: 9, fontWeight: 700, color: '#64748b',
                                            textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8,
                                            fontFamily: "'Orbitron', monospace",
                                        }}>
                                            YOUR HAND
                                        </div>
                                        <span style={{
                                            fontSize: 22, fontWeight: 900,
                                            fontFamily: "'Orbitron', monospace",
                                            background: 'linear-gradient(135deg, #eab308, #f97316)',
                                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                                        }}>
                                            {heroHand}
                                        </span>
                                    </>
                                )}
                            </div>

                            {/* Scenario */}
                            <div style={{
                                fontSize: 14, fontWeight: 700, color: '#e2e8f0',
                                textAlign: 'center', marginBottom: 14,
                            }}>
                                {scenario}
                            </div>

                            {/* Action Buttons */}
                            <div style={{
                                display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
                                gap: 8, marginBottom: 16,
                            }}>
                                {options.map((action) => {
                                    const isSelected = selected === action;
                                    const isCorrect = action === correctAnswer;
                                    let bg = 'rgba(255,255,255,0.06)';
                                    let borderColor = 'rgba(255,255,255,0.1)';
                                    let textColor = '#e2e8f0';

                                    if (showResult) {
                                        if (isCorrect) {
                                            bg = 'rgba(34,197,94,0.15)';
                                            borderColor = '#22c55e';
                                            textColor = '#22c55e';
                                        } else if (isSelected && !isCorrect) {
                                            bg = 'rgba(239,68,68,0.15)';
                                            borderColor = '#ef4444';
                                            textColor = '#ef4444';
                                        } else {
                                            textColor = '#475569';
                                        }
                                    }

                                    return (
                                        <motion.button
                                            key={action}
                                            whileTap={!showResult ? { scale: 0.96 } : {}}
                                            onClick={() => handleAnswer(action)}
                                            disabled={showResult}
                                            aria-label={`Choose ${action}`}
                                            style={{
                                                padding: '14px 12px', borderRadius: 10,
                                                fontSize: 13, fontWeight: 800,
                                                cursor: showResult ? 'default' : 'pointer',
                                                background: bg,
                                                border: `2px solid ${borderColor}`,
                                                color: textColor, transition: 'all 0.2s',
                                                fontFamily: "'Inter', sans-serif",
                                            }}
                                        >
                                            {action}
                                        </motion.button>
                                    );
                                })}
                            </div>

                            {/* Result Feedback */}
                            <AnimatePresence>
                                {showResult && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        style={{
                                            background: selected === correctAnswer
                                                ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                            border: `1px solid ${selected === correctAnswer ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                                            borderRadius: 10, padding: '12px 16px', marginBottom: 14,
                                        }}
                                    >
                                        <div style={{
                                            fontSize: 14, fontWeight: 800, marginBottom: 6,
                                            color: selected === correctAnswer ? '#22c55e' : '#ef4444',
                                            fontFamily: "'Orbitron', monospace",
                                        }}>
                                            {selected === correctAnswer ? 'CORRECT' : 'INCORRECT'}
                                        </div>
                                        <div style={{
                                            fontSize: 12, fontWeight: 700, color: '#e2e8f0', marginBottom: 4,
                                        }}>
                                            GTO Answer: {correctAnswer}
                                        </div>

                                        {/* GTO Frequency Breakdown */}
                                        {frequencies && (
                                            <>
                                                <div style={{
                                                    fontSize: 10, fontWeight: 700, color: '#64748b',
                                                    marginTop: 6, marginBottom: 4,
                                                    textTransform: 'uppercase', letterSpacing: 1,
                                                }}>
                                                    GTO Frequencies
                                                </div>
                                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                    {Object.entries(frequencies)
                                                        .sort(([, a], [, b]) => b - a)
                                                        .map(([act, freq]) => (
                                                            <span key={act} style={{
                                                                fontSize: 11, fontWeight: 600,
                                                                color: act === correctAnswer ? '#22c55e' : '#94a3b8',
                                                                background: act === correctAnswer
                                                                    ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.04)',
                                                                padding: '3px 8px', borderRadius: 6,
                                                            }}>
                                                                {act}: {freq}%
                                                            </span>
                                                        ))}
                                                </div>
                                            </>
                                        )}

                                        {/* Explanation */}
                                        {explanation && (
                                            <div style={{
                                                marginTop: 8, fontSize: 11, color: '#94a3b8',
                                                lineHeight: 1.5, borderTop: '1px solid rgba(255,255,255,0.06)',
                                                paddingTop: 8,
                                            }}>
                                                {explanation}
                                            </div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Streak Calendar */}
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
                                    30-Day Streak
                                </div>
                                <StreakCalendar completedDays={completedDays} />
                                <div style={{
                                    display: 'flex', gap: 12, marginTop: 8, fontSize: 9,
                                    color: '#64748b', fontWeight: 600,
                                }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <div style={{ width: 8, height: 8, borderRadius: 2, background: '#22c55e' }} />
                                        Completed
                                    </span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <div style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(234,179,8,0.3)', border: '1px solid rgba(234,179,8,0.4)' }} />
                                        Today
                                    </span>
                                </div>
                            </div>

                            {/* About */}
                            <div style={{
                                padding: '14px 18px',
                                background: 'rgba(255,255,255,0.02)',
                                borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)',
                            }}>
                                <div style={{
                                    fontSize: 10, fontWeight: 700, color: '#64748b',
                                    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
                                    fontFamily: "'Orbitron', monospace",
                                }}>
                                    About Daily Challenge
                                </div>
                                <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>
                                    A new solver-verified GTO spot every day at midnight UTC. Answer correctly to
                                    extend your streak and earn 25 diamonds. Compete with players worldwide for the
                                    fastest correct answer on the daily leaderboard.
                                </p>
                            </div>
                        </motion.div>
                    )}

                    {/* No challenge available */}
                    {!loading && !challenge && !error && (
                        <div style={{
                            textAlign: 'center', padding: 40, color: '#475569',
                            fontSize: 12, fontWeight: 600,
                        }}>
                            No daily challenge available right now. Check back soon.
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

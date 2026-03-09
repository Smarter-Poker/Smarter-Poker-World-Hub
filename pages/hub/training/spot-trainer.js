/**
 * Spot Trainer — Postflop GTO Decision Drills
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 20: Rapid-fire quiz for postflop GTO decisions. Users are shown a
 * solver-verified spot and must choose the correct action.
 *
 * Route: /hub/training/spot-trainer
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';

// ── Save-session helper (SSR-safe) ──────────────────────────────
function getAuthToken() {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem('sb-auth-token') || localStorage.getItem('supabase.auth.token');
        if (raw) {
            const parsed = JSON.parse(raw);
            return parsed?.access_token || parsed?.currentSession?.access_token || null;
        }
    } catch (e) { /* ignore */ }
    return null;
}

function saveSession(payload) {
    const token = getAuthToken();
    if (!token) return;
    fetch('/api/training/save-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
    }).catch(() => { });
}


// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const SUITS = {
    h: { symbol: '\u2665', color: '#ef4444' },
    d: { symbol: '\u2666', color: '#3b82f6' },
    c: { symbol: '\u2663', color: '#22c55e' },
    s: { symbol: '\u2660', color: '#94a3b8' },
};

const FORMAT_OPTIONS = [
    { value: '', label: 'All' },
    { value: 'cash', label: 'Cash' },
    { value: 'mtt', label: 'MTT' },
];

const POSITION_OPTIONS = [
    { value: '', label: 'Any Pos' },
    { value: 'BTN', label: 'BTN' },
    { value: 'CO', label: 'CO' },
    { value: 'HJ', label: 'HJ' },
    { value: 'MP', label: 'MP' },
    { value: 'SB', label: 'SB' },
    { value: 'BB', label: 'BB' },
];

// Auth helper
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
// CARD DISPLAY COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function CardDisplay({ card, size = 'large' }) {
    if (!card || card.length < 2) return null;
    const rank = card[0].toUpperCase();
    const suitChar = card[1].toLowerCase();
    const suit = SUITS[suitChar] || { symbol: suitChar, color: '#fff' };
    const isLarge = size === 'large';

    return (
        <div style={{
            width: isLarge ? 48 : 36,
            height: isLarge ? 68 : 50,
            borderRadius: 6,
            background: 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))',
            border: '1px solid rgba(255,255,255,0.15)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
            <span style={{
                fontSize: isLarge ? 18 : 14, fontWeight: 900,
                color: suit.color, fontFamily: "'Inter', sans-serif",
                lineHeight: 1,
            }}>
                {rank}
            </span>
            <span style={{
                fontSize: isLarge ? 16 : 12, color: suit.color, lineHeight: 1,
            }}>
                {suit.symbol}
            </span>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// HAND DISPLAY — hero hand notation like "AKs"
// ═══════════════════════════════════════════════════════════════════════════

function HandBadge({ hand }) {
    if (!hand) return null;
    return (
        <span style={{
            fontSize: 22, fontWeight: 900,
            fontFamily: "'Orbitron', monospace",
            background: 'linear-gradient(135deg, #f97316, #ef4444)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
            {hand}
        </span>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function SpotTrainerPage() {
    const router = useRouter();
    const bus = useTrainingBus('spot-trainer');

    // State
    const [spot, setSpot] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selected, setSelected] = useState(null);
    const [showResult, setShowResult] = useState(false);

    // Filters
    const [format, setFormat] = useState('');
    const [position, setPosition] = useState('');

    // Stats
    const [streak, setStreak] = useState(0);
    const [bestStreak, setBestStreak] = useState(0);
    const [totalDrills, setTotalDrills] = useState(0);
    const [correctDrills, setCorrectDrills] = useState(0);
    const [sessionStart] = useState(Date.now());

    const autoNextTimer = useRef(null);

    // Fetch a random spot
    const fetchSpot = useCallback(async () => {
        setLoading(true);
        setError(null);
        setSelected(null);
        setShowResult(false);
        if (autoNextTimer.current) clearTimeout(autoNextTimer.current);

        try {
            const params = new URLSearchParams();
            if (format) params.set('format', format);
            if (position) params.set('position', position);

            const res = await fetch(`/api/training/spot-drill?${params.toString()}`, {
                headers: { ...getAuthHeaders() },
            });
            const data = await res.json();

            if (data.success) {
                setSpot(data.spot);
            } else if (data.retry) {
                // Spot had no data, retry
                setTimeout(fetchSpot, 200);
            } else {
                setError(data.error || 'Failed to load spot');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [format, position]);

    // Load first spot on mount
    useEffect(() => {
        fetchSpot();
    }, []);  // eslint-disable-line react-hooks/exhaustive-deps

    // Handle answer selection
    const handleAnswer = useCallback((action) => {
        if (showResult || !spot) return;

        setSelected(action);
        setShowResult(true);
        setTotalDrills(prev => prev + 1);

        const isCorrect = action === spot.gtoAction;

        if (isCorrect) {
            setCorrectDrills(prev => prev + 1);
            setStreak(prev => {
                const newStreak = prev + 1;
                setBestStreak(best => Math.max(best, newStreak));
                return newStreak;
            });
            if (bus?.emitDecisionCorrect) bus.emitDecisionCorrect();
        } else {
            setStreak(0);
            if (bus?.emitDecisionIncorrect) bus.emitDecisionIncorrect();
            // Persist to Supabase
            saveSession({
                game_id: 'spot-trainer',
                hands_played: 1,
                accuracy: isCorrect ? 100 : 0,
                correct_answers: isCorrect ? 1 : 0,
                total_questions: 1,
            });
        }

        // Emit bus event for cross-page sync (session-dashboard, position-mastery)
        try {
            window.dispatchEvent(new CustomEvent('training:spot-drilled', {
                detail: { action, isCorrect, position: spot?.heroPosition, format: spot?.gameType },
            }));
            window.dispatchEvent(new CustomEvent('training:drill-complete'));
        } catch (_) { /* SSG guard */ }

        // Auto-next after 2 seconds
        autoNextTimer.current = setTimeout(fetchSpot, 2000);
    }, [showResult, spot, bus, fetchSpot]);

    // Clean up timer
    useEffect(() => {
        return () => {
            if (autoNextTimer.current) clearTimeout(autoNextTimer.current);
        };
    }, []);

    const accuracy = totalDrills > 0 ? Math.round((correctDrills / totalDrills) * 100) : 0;
    const elapsed = Math.floor((Date.now() - sessionStart) / 60000);

    return (
        <>
            <Head>
                <title>Spot Trainer | Smarter.Poker GTO Training</title>
                <meta name="description" content="Drill postflop GTO decisions with solver-verified spots. Test your skills with rapid-fire action selection." />
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
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        flexWrap: 'wrap',
                    }}>
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
                            background: 'linear-gradient(135deg, #f97316, #ef4444)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                            fontFamily: "'Orbitron', monospace",
                        }}>
                            Spot Trainer
                        </h1>
                        <span style={{
                            fontSize: 10, color: '#f97316', background: 'rgba(249,115,22,0.1)',
                            padding: '3px 8px', borderRadius: 12, fontWeight: 700,
                            border: '1px solid rgba(249,115,22,0.2)',
                            fontFamily: "'Orbitron', monospace",
                        }}>
                            PHASE 20
                        </span>
                    </div>
                </div>

                {/* Main Content */}
                <div style={{ padding: '16px 24px', maxWidth: 600, margin: '0 auto' }}>

                    {/* Stats Bar */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-between',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 10, padding: '10px 14px', marginBottom: 14,
                        flexWrap: 'wrap', gap: 8,
                    }}>
                        {[
                            { label: 'Streak', value: streak, color: streak >= 5 ? '#22c55e' : '#f97316' },
                            { label: 'Best', value: bestStreak, color: '#a855f7' },
                            { label: 'Accuracy', value: `${accuracy}%`, color: accuracy >= 70 ? '#22c55e' : '#ef4444' },
                            { label: 'Drills', value: totalDrills, color: '#00d4ff' },
                        ].map(stat => (
                            <div key={stat.label} style={{ textAlign: 'center', flex: '1 1 60px' }}>
                                <div style={{
                                    fontSize: 20, fontWeight: 900, color: stat.color,
                                    fontFamily: "'Orbitron', monospace",
                                }}>
                                    {stat.value}
                                </div>
                                <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                                    {stat.label}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Filter Controls */}
                    <div style={{
                        display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap',
                    }}>
                        {/* Format */}
                        <div style={{ display: 'flex', gap: 3 }}>
                            {FORMAT_OPTIONS.map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => { setFormat(opt.value); }}
                                    style={{
                                        padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                                        cursor: 'pointer', border: 'none', transition: 'all 0.15s',
                                        background: format === opt.value ? 'linear-gradient(135deg, #f97316, #ef4444)' : 'rgba(255,255,255,0.06)',
                                        color: format === opt.value ? '#fff' : '#94a3b8',
                                    }}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                        {/* Position */}
                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                            {POSITION_OPTIONS.map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => { setPosition(opt.value); }}
                                    style={{
                                        padding: '5px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                                        cursor: 'pointer', border: 'none', transition: 'all 0.15s',
                                        background: position === opt.value ? 'linear-gradient(135deg, #f97316, #ef4444)' : 'rgba(255,255,255,0.06)',
                                        color: position === opt.value ? '#fff' : '#94a3b8',
                                    }}
                                >
                                    {opt.label}
                                </button>
                            ))}
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
                            <button
                                onClick={fetchSpot}
                                style={{
                                    marginLeft: 12, background: 'rgba(249,115,22,0.2)',
                                    border: '1px solid rgba(249,115,22,0.4)', borderRadius: 6,
                                    padding: '4px 12px', color: '#f97316', cursor: 'pointer',
                                    fontSize: 11, fontWeight: 700,
                                }}
                            >
                                Retry
                            </button>
                        </div>
                    )}

                    {/* Loading */}
                    {loading && !spot && (
                        <div style={{
                            textAlign: 'center', padding: 40,
                            color: '#64748b', fontFamily: "'Orbitron', monospace",
                            fontSize: 12, fontWeight: 700,
                        }}>
                            LOADING SPOT...
                        </div>
                    )}

                    {/* Spot Display */}
                    <AnimatePresence mode="wait">
                        {spot && (
                            <motion.div
                                key={spot.id + spot.heroHand}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                            >
                                {/* Spot Info Bar */}
                                <div style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    marginBottom: 12,
                                }}>
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                        <span style={{
                                            fontSize: 10, fontWeight: 800, color: '#f97316',
                                            background: 'rgba(249,115,22,0.1)', padding: '3px 8px',
                                            borderRadius: 6, fontFamily: "'Orbitron', monospace",
                                        }}>
                                            {spot.heroPosition}
                                        </span>
                                        <span style={{
                                            fontSize: 10, fontWeight: 700, color: '#94a3b8',
                                            background: 'rgba(255,255,255,0.04)', padding: '3px 8px',
                                            borderRadius: 6,
                                        }}>
                                            {spot.street}
                                        </span>
                                        <span style={{
                                            fontSize: 10, fontWeight: 700, color: '#64748b',
                                        }}>
                                            {spot.stackDepth}BB {spot.gameType?.replace('_', ' ')}
                                        </span>
                                    </div>
                                    <button
                                        onClick={fetchSpot}
                                        style={{
                                            background: 'rgba(255,255,255,0.06)',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: 6, padding: '5px 10px', color: '#94a3b8',
                                            cursor: 'pointer', fontSize: 10, fontWeight: 700,
                                        }}
                                    >
                                        Skip
                                    </button>
                                </div>

                                {/* Board Cards */}
                                <div style={{
                                    background: 'linear-gradient(145deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: 14, padding: '20px 24px',
                                    marginBottom: 14, textAlign: 'center',
                                }}>
                                    <div style={{
                                        fontSize: 9, fontWeight: 700, color: '#64748b',
                                        textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10,
                                        fontFamily: "'Orbitron', monospace",
                                    }}>
                                        BOARD
                                    </div>
                                    <div style={{
                                        display: 'flex', gap: 8, justifyContent: 'center',
                                        marginBottom: 16,
                                    }}>
                                        {spot.board.map((card, i) => (
                                            <CardDisplay key={i} card={card} size="large" />
                                        ))}
                                    </div>

                                    <div style={{
                                        fontSize: 9, fontWeight: 700, color: '#64748b',
                                        textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8,
                                        fontFamily: "'Orbitron', monospace",
                                    }}>
                                        YOUR HAND
                                    </div>
                                    <HandBadge hand={spot.heroHand} />
                                </div>

                                {/* Question */}
                                <div style={{
                                    fontSize: 14, fontWeight: 700, color: '#e2e8f0',
                                    textAlign: 'center', marginBottom: 14,
                                }}>
                                    What is the GTO play?
                                </div>

                                {/* Action Buttons */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(2, 1fr)',
                                    gap: 8, marginBottom: 16,
                                }}>
                                    {spot.options.map((action, i) => {
                                        const isSelected = selected === action;
                                        const isCorrect = action === spot.gtoAction;
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
                                                style={{
                                                    padding: '14px 12px', borderRadius: 10,
                                                    fontSize: 13, fontWeight: 800, cursor: showResult ? 'default' : 'pointer',
                                                    background: bg,
                                                    border: `2px solid ${borderColor}`,
                                                    color: textColor,
                                                    transition: 'all 0.2s',
                                                    fontFamily: "'Inter', sans-serif",
                                                }}
                                            >
                                                {action}
                                                {showResult && isCorrect && (
                                                    <span style={{ marginLeft: 6, fontSize: 11 }}>
                                                        ({spot.gtoFrequency}%)
                                                    </span>
                                                )}
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
                                            exit={{ opacity: 0 }}
                                            style={{
                                                background: selected === spot.gtoAction
                                                    ? 'rgba(34,197,94,0.1)'
                                                    : 'rgba(239,68,68,0.1)',
                                                border: `1px solid ${selected === spot.gtoAction ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                                                borderRadius: 10, padding: '12px 16px',
                                                marginBottom: 14,
                                            }}
                                        >
                                            <div style={{
                                                fontSize: 14, fontWeight: 800, marginBottom: 6,
                                                color: selected === spot.gtoAction ? '#22c55e' : '#ef4444',
                                                fontFamily: "'Orbitron', monospace",
                                            }}>
                                                {selected === spot.gtoAction ? 'CORRECT' : 'INCORRECT'}
                                            </div>

                                            {/* Action Breakdown */}
                                            <div style={{
                                                fontSize: 10, fontWeight: 700, color: '#64748b',
                                                marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1,
                                            }}>
                                                GTO Frequencies
                                            </div>
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                {Object.entries(spot.actionBreakdown || {})
                                                    .sort(([, a], [, b]) => b - a)
                                                    .map(([action, freq]) => (
                                                        <span key={action} style={{
                                                            fontSize: 11, fontWeight: 600,
                                                            color: action === spot.gtoAction ? '#22c55e' : '#94a3b8',
                                                            background: action === spot.gtoAction
                                                                ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.04)',
                                                            padding: '3px 8px', borderRadius: 6,
                                                        }}>
                                                            {action}: {freq}%
                                                        </span>
                                                    ))}
                                            </div>

                                            <div style={{
                                                fontSize: 10, color: '#64748b', marginTop: 6,
                                            }}>
                                                Next spot in 2s...
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Next Button (manual override) */}
                                {showResult && (
                                    <button
                                        onClick={fetchSpot}
                                        style={{
                                            width: '100%', padding: '12px 0',
                                            background: 'linear-gradient(135deg, #f97316, #ef4444)',
                                            border: 'none', borderRadius: 10,
                                            color: '#fff', fontSize: 13, fontWeight: 800,
                                            cursor: 'pointer',
                                            fontFamily: "'Orbitron', monospace",
                                        }}
                                    >
                                        Next Spot
                                    </button>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* About Section */}
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
                            About Spot Trainer
                        </div>
                        <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>
                            Rapid-fire postflop GTO drills using solver-verified spots. Each spot shows you
                            a board texture, your hand, and 4 action options. Choose the highest-frequency
                            GTO play to build your streak. Filter by format and position to target specific
                            leaks. The GTO frequency breakdown is shown after each answer.
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
}

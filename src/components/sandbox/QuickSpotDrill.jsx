/**
 * QUICK-SPOT DRILL — Rapid-Fire GTO Quiz
 * 15-second rapid-fire GTO scenarios from the training_questions pool.
 * Tracks streaks and saves results to sandbox_coach_results.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

const M = {
    bg: '#1a1d21', card: '#242526', border: '#3a3b3c',
    cyan: '#4599FF', green: '#00E676', red: '#EF5350',
    gold: '#F5A623', text: '#E4E6EB', sub: '#B0B3B8',
    dim: 'rgba(255,255,255,0.4)',
};

function pctColor(pct) {
    if (pct >= 70) return M.green;
    if (pct >= 50) return M.gold;
    return M.red;
}

export default function QuickSpotDrill({ onClose }) {
    const [questions, setQuestions] = useState([]);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [answer, setAnswer] = useState(null);       // user's pick
    const [revealed, setRevealed] = useState(false);
    const [score, setScore] = useState({ correct: 0, total: 0 });
    const [streak, setStreak] = useState(0);
    const [timer, setTimer] = useState(15);
    const [loading, setLoading] = useState(true);
    const [finished, setFinished] = useState(false);

    // W5-4: Drill Progression
    const [level, setLevel] = useState(1);
    const timerRef = useRef(null);

    // Load questions and level
    useEffect(() => {
        async function load() {
            try {
                const savedLevel = localStorage.getItem('sandbox-drill-level');
                const startLevel = savedLevel ? parseInt(savedLevel, 10) : 1;
                setLevel(startLevel);

                // In a real scenario, you'd pass ?level=startLevel to the API
                const res = await fetch('/api/training/hand-of-the-day');
                const json = await res.json();
                // If we get pool data, use it — otherwise generate mock scenarios
                if (json.pool && json.pool.length > 0) {
                    // Shuffle and take 10
                    const shuffled = [...json.pool].sort(() => Math.random() - 0.5).slice(0, 10);
                    setQuestions(shuffled);
                } else if (json.question) {
                    setQuestions([json.question]);
                }
            } catch (e) {
                console.warn('[QuickSpotDrill] Load error:', e);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    // Timer countdown
    useEffect(() => {
        if (loading || revealed || finished || questions.length === 0) return;
        setTimer(15);
        timerRef.current = setInterval(() => {
            setTimer(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    handleTimeout();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timerRef.current);
    }, [currentIdx, loading, questions.length]);

    const handleTimeout = useCallback(() => {
        setRevealed(true);
        setStreak(0);
        setScore(prev => ({ ...prev, total: prev.total + 1 }));
        try { navigator.vibrate?.(30); } catch (e) { }
    }, []);

    const handlePick = useCallback((option) => {
        if (revealed) return;
        clearInterval(timerRef.current);
        const q = questions[currentIdx];
        const isCorrect = option === q?.correct_answer;

        setAnswer(option);
        setRevealed(true);
        setScore(prev => ({
            correct: prev.correct + (isCorrect ? 1 : 0),
            total: prev.total + 1,
        }));
        setStreak(prev => isCorrect ? prev + 1 : 0);

        // Haptic feedback
        try { navigator.vibrate?.(isCorrect ? 10 : 30); } catch (e) { }

        // Save result to coach results via bus event
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('sandbox-coach-result-saved', {
                detail: {
                    isCorrect,
                    evDelta: isCorrect ? 0 : -0.1,
                    source: 'quick-drill',
                },
            }));
        }
    }, [questions, currentIdx, revealed]);

    const handleNext = useCallback(() => {
        if (currentIdx + 1 >= questions.length) {
            setFinished(true);

            const finalCorrect = score.correct + (answer === questions[currentIdx]?.correct_answer ? 1 : 0);
            const finalTotal = score.total;
            const finalAccuracy = finalTotal > 0 ? (finalCorrect / finalTotal) * 100 : 0;

            // Level progression logic
            let newLevel = level;
            if (level === 1 && finalAccuracy >= 60) newLevel = 2;
            else if (level === 2 && finalAccuracy >= 65) newLevel = 3;
            else if (level > 1 && finalAccuracy < 40) newLevel = Math.max(1, level - 1); // demotion

            if (newLevel !== level) {
                setLevel(newLevel);
                if (typeof window !== 'undefined') {
                    localStorage.setItem('sandbox-drill-level', newLevel);
                    if (newLevel > level) {
                        try { navigator.vibrate?.([20, 20, 20]); } catch (e) { }
                        window.dispatchEvent(new CustomEvent('sandbox-drill-level-up', { detail: { level: newLevel } }));
                    }
                }
            }

            // Dispatch drill complete
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('sandbox-drill-complete', {
                    detail: { correct: finalCorrect, total: finalTotal, newLevel, oldLevel: level },
                }));
            }
            return;
        }
        setCurrentIdx(prev => prev + 1);
        setAnswer(null);
        setRevealed(false);
    }, [currentIdx, questions.length, score, answer]);

    const q = questions[currentIdx];
    const accuracy = score.total > 0 ? Math.round(100 * score.correct / score.total) : 0;

    if (loading) {
        return (
            <div style={s.overlay} onClick={onClose}>
                <div style={s.modal} onClick={e => e.stopPropagation()}>
                    <div style={{ padding: 40, textAlign: 'center', color: M.sub }}>Loading drills...</div>
                </div>
            </div>
        );
    }

    if (questions.length === 0) {
        return (
            <div style={s.overlay} onClick={onClose}>
                <div style={s.modal} onClick={e => e.stopPropagation()}>
                    <div style={{ padding: 30, textAlign: 'center' }}>
                        <p style={{ color: M.sub, fontSize: 12 }}>No drill scenarios available yet.</p>
                        <button onClick={onClose} style={s.closeBtn}>Close</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={s.overlay} onClick={onClose}>
            <div style={s.modal} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={s.header}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: M.text }}>⚡ Quick Drill</span>
                        <span style={{ padding: '2px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: 4, fontSize: 9, color: M.sub, fontWeight: 700 }}>LVL {level}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {streak > 0 && <span style={{ fontSize: 12, color: M.gold }}>🔥{streak}</span>}
                        <span style={{ fontSize: 10, color: M.sub }}>{currentIdx + 1}/{questions.length}</span>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', color: M.sub, fontSize: 16, cursor: 'pointer' }}>✕</button>
                    </div>
                </div>

                {finished ? (
                    /* ── Finished Screen ─────────────────────────── */
                    <div style={{ padding: 20, textAlign: 'center' }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>🎯</div>
                        <div style={{ fontSize: 24, fontWeight: 900, color: pctColor(accuracy), fontFamily: '"Orbitron", monospace' }}>
                            {accuracy}%
                        </div>
                        <div style={{ fontSize: 11, color: M.sub, marginTop: 4 }}>
                            {score.correct}/{score.total} correct
                        </div>
                        <button onClick={onClose} style={{ ...s.actionBtn, marginTop: 16 }}>Done</button>
                    </div>
                ) : (
                    <>
                        {/* Timer Bar */}
                        <div style={{ padding: '0 12px', marginBottom: 6 }}>
                            <div style={{ height: 4, borderRadius: 2, background: M.border, overflow: 'hidden' }}>
                                <div style={{
                                    height: '100%', borderRadius: 2,
                                    background: timer <= 5 ? M.red : M.cyan,
                                    width: `${(timer / 15) * 100}%`,
                                    transition: 'width 1s linear, background 0.3s',
                                }} />
                            </div>
                            <div style={{ textAlign: 'right', fontSize: 10, color: timer <= 5 ? M.red : M.dim, marginTop: 2 }}>
                                {timer}s
                            </div>
                        </div>

                        {/* Scenario Text */}
                        <div style={{ padding: '0 12px 10px', fontSize: 12, color: M.text, lineHeight: 1.5 }}>
                            {q?.scenario_text}
                        </div>

                        {/* Hand Info */}
                        {q?.hero_hand && (
                            <div style={{ padding: '0 12px 8px', display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span style={{ fontSize: 10, color: M.dim }}>Hero:</span>
                                <span style={{ fontSize: 13, fontWeight: 800, color: M.gold, fontFamily: '"Orbitron", monospace' }}>{q.hero_hand}</span>
                                {q.hero_position && <span style={{ fontSize: 9, color: M.cyan, fontWeight: 700 }}>{q.hero_position}</span>}
                            </div>
                        )}

                        {/* Options */}
                        <div style={{ padding: '0 12px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                            {(q?.options || ['Fold', 'Call', 'Raise', 'All-In']).map(opt => {
                                const isCorrectOpt = opt === q?.correct_answer;
                                const isUserPick = opt === answer;
                                let bg = 'rgba(255,255,255,0.05)';
                                let border = M.border;
                                let color = M.text;

                                if (revealed) {
                                    if (isCorrectOpt) { bg = 'rgba(0,230,118,0.15)'; border = M.green + '66'; color = M.green; }
                                    else if (isUserPick) { bg = 'rgba(239,83,80,0.15)'; border = M.red + '66'; color = M.red; }
                                    else { color = M.dim; }
                                }

                                return (
                                    <button
                                        key={opt}
                                        onClick={() => handlePick(opt)}
                                        disabled={revealed}
                                        style={{
                                            padding: '12px 8px', borderRadius: 8,
                                            background: bg, border: `1px solid ${border}`,
                                            color, fontSize: 12, fontWeight: 700,
                                            cursor: revealed ? 'default' : 'pointer',
                                            outline: 'none', WebkitTapHighlightColor: 'transparent',
                                            touchAction: 'manipulation',
                                            transition: 'all 0.2s',
                                        }}
                                    >
                                        {opt}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Explanation (after reveal) */}
                        {revealed && q?.gto_explanation && (
                            <div style={{ padding: '0 12px 10px' }}>
                                <div style={{ fontSize: 10, color: M.sub, lineHeight: 1.5, background: 'rgba(255,255,255,0.03)', padding: '8px 10px', borderRadius: 8 }}>
                                    {q.gto_explanation}
                                </div>
                            </div>
                        )}

                        {/* Next Button */}
                        {revealed && (
                            <div style={{ padding: '0 12px 12px', textAlign: 'center' }}>
                                <button onClick={handleNext} style={s.actionBtn}>
                                    {currentIdx + 1 >= questions.length ? '🎯 See Results' : 'Next →'}
                                </button>
                            </div>
                        )}

                        {/* Score Bar */}
                        <div style={{ padding: '6px 12px 10px', display: 'flex', justifyContent: 'center', gap: 16, fontSize: 9, color: M.dim }}>
                            <span>✅ {score.correct}</span>
                            <span>❌ {score.total - score.correct}</span>
                            <span style={{ color: pctColor(accuracy) }}>{accuracy}%</span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

const s = {
    overlay: {
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 999, padding: 12,
    },
    modal: {
        background: M.card,
        border: `1px solid ${M.border}`,
        borderRadius: 14,
        width: '100%', maxWidth: 420,
        maxHeight: '90vh', overflow: 'auto',
    },
    header: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px',
    },
    actionBtn: {
        padding: '10px 24px', borderRadius: 8,
        background: 'rgba(35,116,225,0.15)', border: '1px solid rgba(35,116,225,0.4)',
        color: M.cyan, fontSize: 12, fontWeight: 700,
        cursor: 'pointer', outline: 'none', WebkitTapHighlightColor: 'transparent',
    },
    closeBtn: {
        marginTop: 12, padding: '8px 20px', borderRadius: 8,
        background: 'rgba(255,255,255,0.05)', border: `1px solid ${M.border}`,
        color: M.sub, fontSize: 11, fontWeight: 600, cursor: 'pointer',
    },
};

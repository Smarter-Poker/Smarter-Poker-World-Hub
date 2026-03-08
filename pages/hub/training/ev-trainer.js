/**
 * EV Calculation Trainer — Math-First GTO Drill Mode
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 26: The platform's first free-input numeric training tool. Users
 * solve real poker math problems: pot odds, MDF, EV of a call, and break-even
 * equity. Each answer is verified within a 2% tolerance, then the full formula
 * breakdown is revealed for explicit learning.
 *
 * Route: /hub/training/ev-trainer
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

// ═══════════════════════════════════════════════════════════════════════════
// QUESTION GENERATOR ENGINE
// ═══════════════════════════════════════════════════════════════════════════

const DRILL_TYPES = ['pot_odds', 'mdf', 'ev_call', 'break_even'];

function generateQuestion() {
    const type = DRILL_TYPES[Math.floor(Math.random() * DRILL_TYPES.length)];
    const pot = [50, 60, 80, 100, 120, 150, 200][Math.floor(Math.random() * 7)];
    const betFractions = [0.33, 0.5, 0.66, 0.75, 1.0, 1.25];
    const fraction = betFractions[Math.floor(Math.random() * betFractions.length)];
    const bet = Math.round(pot * fraction);
    const equity = Math.floor(Math.random() * 25) + 20; // 20-45%

    if (type === 'pot_odds') {
        // Pot odds = bet / (pot + bet)  as a %
        const answer = Math.round((bet / (pot + bet)) * 100);
        return {
            type,
            title: 'Pot Odds',
            icon: '📐',
            color: '#00d4ff',
            question: `Villain bets **${bet} chips** into a **${pot} chip** pot. What are your pot odds (as a %)?`,
            hint: 'Pot Odds % = Bet ÷ (Pot + Bet) × 100',
            formula: `${bet} ÷ (${pot} + ${bet}) = ${bet} ÷ ${pot + bet} = **${answer}%**`,
            formulas: [
                `Pot after bet: ${pot} + ${bet} = ${pot + bet}`,
                `Your cost: ${bet}`,
                `Pot Odds: ${bet} / ${pot + bet} = ${answer}%`,
                `You need at least ${answer}% equity to break even on a call.`,
            ],
            answer,
            unit: '%',
        };
    }

    if (type === 'mdf') {
        // MDF = pot / (pot + bet)  as a %
        const answer = Math.round((pot / (pot + bet)) * 100);
        return {
            type,
            title: 'Minimum Defense Frequency',
            icon: '🛡️',
            color: '#a855f7',
            question: `Villain bets **${bet} chips** into a **${pot} chip** pot. What is your Minimum Defense Frequency (MDF)?`,
            hint: 'MDF % = Pot ÷ (Pot + Bet) × 100',
            formula: `${pot} ÷ (${pot} + ${bet}) = ${pot} ÷ ${pot + bet} = **${answer}%**`,
            formulas: [
                `You must defend ${answer}% of your range to prevent villain from profitably bluffing.`,
                `MDF = Pot / (Pot + Bet) = ${pot} / ${pot + bet} = ${answer}%`,
                `Villain's bluff needs ${100 - answer}%+ fold equity to profit — defend at least ${answer}%.`,
            ],
            answer,
            unit: '%',
        };
    }

    if (type === 'ev_call') {
        // EV of call = (equity * (pot + bet)) - ((1 - equity) * bet)  in chips
        const eq = equity / 100;
        const win = Math.round(eq * (pot + bet));
        const lose = Math.round((1 - eq) * bet);
        const answer = win - lose;
        return {
            type,
            title: 'EV of a Call',
            icon: '⚡',
            color: '#22c55e',
            question: `Pot: **${pot}**, Villain bets **${bet}**. You have **${equity}% equity**. What is the EV of calling (in chips)?`,
            hint: 'EV = (Equity × Total Pot) − ((1 − Equity) × Call Amount)',
            formula: `(${equity}% × ${pot + bet}) − (${100 - equity}% × ${bet}) = ${win} − ${lose} = **${answer > 0 ? '+' : ''}${answer} chips**`,
            formulas: [
                `Win: ${equity}% × ${pot + bet} = ${win} chips`,
                `Lose: ${100 - equity}% × ${bet} = ${lose} chips`,
                `EV = ${win} − ${lose} = ${answer > 0 ? '+' : ''}${answer} chips`,
                answer > 0
                    ? `✅ This is a +EV call. You profit on average ${answer} chips per call.`
                    : `❌ This is a -EV call. You lose ${Math.abs(answer)} chips on average.`,
            ],
            answer,
            unit: ' chips',
        };
    }

    // break_even equity needed
    // Break-even equity = bet / (pot + bet)  as a %
    const answer = Math.round((bet / (pot + bet)) * 100);
    return {
        type,
        title: 'Break-Even Equity',
        icon: '⚖️',
        color: '#f97316',
        question: `Villain bets **${bet}** into a **${pot} chip** pot. What is the minimum equity you need to break even on a call?`,
        hint: 'Break-even equity % = Bet ÷ (Pot + Bet) × 100',
        formula: `${bet} ÷ (${pot} + ${bet}) = ${bet} ÷ ${pot + bet} = **${answer}%**`,
        formulas: [
            `Break-even equity = your call / (pot + bet)`,
            `${bet} / ${pot + bet} = ${answer}%`,
            `If your actual equity > ${answer}%, calling is +EV.`,
            `This is the same as pot odds — a fundamental cross-check.`,
        ],
        answer,
        unit: '%',
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function EVTrainer() {
    useTrainingBus('ev-trainer');
    const router = useRouter();

    const [question, setQuestion] = useState(null);
    const [userAnswer, setUserAnswer] = useState('');
    const [result, setResult] = useState(null); // 'correct' | 'close' | 'wrong'
    const [showBreakdown, setShowBreakdown] = useState(false);
    const [sessionStats, setSessionStats] = useState({ correct: 0, wrong: 0, total: 0 });
    const [streak, setStreak] = useState(0);
    const [bestStreak, setBestStreak] = useState(0);
    const inputRef = useRef(null);

    const TOLERANCE = 2; // ±2 is "close"

    const nextQuestion = useCallback(() => {
        setQuestion(generateQuestion());
        setUserAnswer('');
        setResult(null);
        setShowBreakdown(false);
        setTimeout(() => inputRef.current?.focus(), 100);
    }, []);

    useEffect(() => {
        nextQuestion();
    }, [nextQuestion]);

    const handleSubmit = useCallback(() => {
        if (!question || userAnswer === '') return;
        const num = parseFloat(userAnswer);
        if (isNaN(num)) return;

        const diff = Math.abs(num - question.answer);
        let res;
        if (diff === 0) res = 'correct';
        else if (diff <= TOLERANCE) res = 'close';
        else res = 'wrong';

        setResult(res);
        setShowBreakdown(true);

        const isCorrect = res !== 'wrong';
        const newStreak = isCorrect ? streak + 1 : 0;
        setStreak(newStreak);
        if (newStreak > bestStreak) setBestStreak(newStreak);

        setSessionStats(prev => ({
            correct: prev.correct + (isCorrect ? 1 : 0),
            wrong: prev.wrong + (!isCorrect ? 1 : 0),
            total: prev.total + 1,
        }));

        // Save session data
        try {
            const raw = localStorage.getItem('sb-auth-token') || localStorage.getItem('supabase.auth.token');
            if (raw) {
                const parsed = JSON.parse(raw);
                const token = parsed?.access_token || parsed?.currentSession?.access_token;
                if (token) {
                    fetch('/api/training/save-session', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({
                            game_id: 'ev-trainer',
                            accuracy: isCorrect ? 100 : 0,
                            hands_played: 1,
                            correct_answers: isCorrect ? 1 : 0,
                            total_questions: 1,
                            best_streak: newStreak,
                        }),
                    }).catch(() => { });
                }
            }
        } catch (e) { /* ignore */ }
    }, [question, userAnswer, streak, bestStreak]);

    const accuracy = sessionStats.total > 0
        ? Math.round((sessionStats.correct / sessionStats.total) * 100)
        : 0;

    const resultColors = {
        correct: { bg: 'rgba(34, 197, 94, 0.15)', border: 'rgba(34, 197, 94, 0.5)', text: '#22c55e', label: '✅ EXACT!' },
        close: { bg: 'rgba(251, 191, 36, 0.15)', border: 'rgba(251, 191, 36, 0.5)', text: '#fbbf24', label: `⚡ CLOSE! (within ${TOLERANCE}%)` },
        wrong: { bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.4)', text: '#ef4444', label: '❌ INCORRECT' },
    };

    const container = {
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0f1e 0%, #0d1629 50%, #0a0f1e 100%)',
        color: '#e2e8f0',
        fontFamily: "'Inter', sans-serif",
        padding: '20px 16px 40px',
    };

    return (
        <>
            <Head>
                <title>EV Calculation Trainer | Smarter.Poker</title>
                <meta name="description" content="Master pot odds, MDF, and EV calculations with free-input math drills." />
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&family=Orbitron:wght@700;900&display=swap" rel="stylesheet" />
            </Head>

            <div style={container}>
                {/* HEADER */}
                <div style={{ maxWidth: 640, margin: '0 auto', marginBottom: 24 }}>
                    <button
                        onClick={() => router.push('/hub/training')}
                        style={{
                            background: 'none', border: 'none', color: '#64748b',
                            fontSize: 12, cursor: 'pointer', padding: '4px 0',
                            display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16
                        }}
                    >
                        ← Training Hub
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                        <div style={{
                            width: 44, height: 44, borderRadius: 12,
                            background: 'linear-gradient(135deg, #00d4ff22, #0066ff22)',
                            border: '1px solid rgba(0, 212, 255, 0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 22,
                        }}>🧮</div>
                        <div>
                            <h1 style={{
                                margin: 0, fontSize: 22, fontWeight: 900,
                                fontFamily: "'Orbitron', monospace",
                                background: 'linear-gradient(135deg, #00d4ff, #a855f7)',
                                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                            }}>
                                EV TRAINER
                            </h1>
                            <p style={{ margin: 0, fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                                Pot Odds · MDF · EV Calculations
                            </p>
                        </div>
                    </div>

                    {/* STATS BAR */}
                    <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
                        marginTop: 16,
                    }}>
                        {[
                            { label: 'Accuracy', value: `${accuracy}%`, color: accuracy >= 70 ? '#22c55e' : accuracy >= 50 ? '#f97316' : '#ef4444' },
                            { label: 'Correct', value: sessionStats.correct, color: '#22c55e' },
                            { label: 'Streak', value: streak, color: '#a855f7' },
                            { label: 'Best', value: bestStreak, color: '#00d4ff' },
                        ].map(stat => (
                            <div key={stat.label} style={{
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.07)',
                                borderRadius: 10, padding: '10px 8px', textAlign: 'center',
                            }}>
                                <div style={{ fontSize: 18, fontWeight: 900, fontFamily: "'Orbitron', monospace", color: stat.color }}>
                                    {stat.value}
                                </div>
                                <div style={{ fontSize: 9, color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                    {stat.label}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* MAIN DRILL CARD */}
                <div style={{ maxWidth: 640, margin: '0 auto' }}>
                    <AnimatePresence mode="wait">
                        {question && (
                            <motion.div
                                key={question.type + sessionStats.total}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                transition={{ duration: 0.25 }}
                            >
                                {/* DRILL TYPE BADGE */}
                                <div style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    background: `${question.color}18`,
                                    border: `1px solid ${question.color}40`,
                                    borderRadius: 20, padding: '4px 14px', marginBottom: 16,
                                    fontSize: 11, fontWeight: 700, color: question.color,
                                    textTransform: 'uppercase', letterSpacing: 1,
                                }}>
                                    {question.icon} {question.title}
                                </div>

                                {/* QUESTION CARD */}
                                <div style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: 16, padding: '24px 20px',
                                    marginBottom: 16,
                                }}>
                                    <p style={{
                                        margin: 0, fontSize: 16, lineHeight: 1.7,
                                        color: '#e2e8f0', fontWeight: 600,
                                        // Render **bold** markdown-style text
                                    }}>
                                        {question.question.split('**').map((part, i) =>
                                            i % 2 === 0
                                                ? <span key={i}>{part}</span>
                                                : <strong key={i} style={{ color: question.color }}>{part}</strong>
                                        )}
                                    </p>

                                    <div style={{
                                        marginTop: 12, padding: '8px 12px',
                                        background: 'rgba(255,255,255,0.04)',
                                        borderRadius: 8, fontSize: 11,
                                        color: '#94a3b8', fontWeight: 600,
                                        borderLeft: `3px solid ${question.color}60`,
                                    }}>
                                        💡 Formula: {question.hint}
                                    </div>
                                </div>

                                {/* INPUT AREA */}
                                {!showBreakdown && (
                                    <div style={{ marginBottom: 16 }}>
                                        <label style={{
                                            display: 'block', fontSize: 11, fontWeight: 700,
                                            color: '#64748b', textTransform: 'uppercase',
                                            letterSpacing: 1, marginBottom: 8,
                                        }}>
                                            Your Answer ({question.unit.trim() || '%'})
                                        </label>
                                        <div style={{ display: 'flex', gap: 10 }}>
                                            <input
                                                ref={inputRef}
                                                type="number"
                                                value={userAnswer}
                                                onChange={e => setUserAnswer(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                                                placeholder={`Enter your answer${question.unit}`}
                                                style={{
                                                    flex: 1, padding: '14px 16px',
                                                    borderRadius: 12, fontSize: 18,
                                                    fontWeight: 700, fontFamily: "'Orbitron', monospace",
                                                    background: 'rgba(255,255,255,0.05)',
                                                    border: '1px solid rgba(255,255,255,0.1)',
                                                    color: '#e2e8f0', outline: 'none',
                                                }}
                                            />
                                            <button
                                                onClick={handleSubmit}
                                                style={{
                                                    padding: '14px 24px', borderRadius: 12,
                                                    background: `linear-gradient(135deg, ${question.color}, ${question.color}99)`,
                                                    border: 'none', color: '#000', fontWeight: 900,
                                                    fontSize: 14, cursor: 'pointer',
                                                    fontFamily: "'Orbitron', monospace",
                                                }}
                                            >
                                                CHECK
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* RESULT PANEL */}
                                <AnimatePresence>
                                    {showBreakdown && result && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.97 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ duration: 0.25 }}
                                        >
                                            {/* Result badge */}
                                            <div style={{
                                                padding: '12px 16px',
                                                background: resultColors[result].bg,
                                                border: `1px solid ${resultColors[result].border}`,
                                                borderRadius: 10, marginBottom: 12,
                                                fontSize: 14, fontWeight: 800,
                                                color: resultColors[result].text,
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            }}>
                                                <span>{resultColors[result].label}</span>
                                                <span style={{ fontFamily: "'Orbitron', monospace", fontSize: 16 }}>
                                                    Your answer: {userAnswer}{question.unit}  →  Correct: {question.answer}{question.unit}
                                                </span>
                                            </div>

                                            {/* Formula Breakdown */}
                                            <div style={{
                                                background: 'rgba(255,255,255,0.03)',
                                                border: '1px solid rgba(255,255,255,0.07)',
                                                borderRadius: 12, padding: '16px 18px',
                                                marginBottom: 16,
                                            }}>
                                                <div style={{
                                                    fontSize: 10, fontWeight: 700, color: '#64748b',
                                                    textTransform: 'uppercase', letterSpacing: 1,
                                                    marginBottom: 10, fontFamily: "'Orbitron', monospace",
                                                }}>
                                                    📚 Formula Breakdown
                                                </div>
                                                {question.formulas.map((line, i) => (
                                                    <div key={i} style={{
                                                        fontSize: 13, color: '#94a3b8',
                                                        lineHeight: 1.7, fontWeight: 600,
                                                        display: 'flex', gap: 8,
                                                    }}>
                                                        <span style={{ color: '#475569', minWidth: 16 }}>{i + 1}.</span>
                                                        <span>{line}</span>
                                                    </div>
                                                ))}
                                            </div>

                                            <button
                                                onClick={nextQuestion}
                                                style={{
                                                    width: '100%', padding: '14px',
                                                    borderRadius: 12,
                                                    background: 'linear-gradient(135deg, #00d4ff, #a855f7)',
                                                    border: 'none', color: '#000', fontWeight: 900,
                                                    fontSize: 14, cursor: 'pointer',
                                                    fontFamily: "'Orbitron', monospace",
                                                }}
                                            >
                                                NEXT QUESTION →
                                            </button>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* INFO FOOTER */}
                    <div style={{
                        marginTop: 24, padding: '14px 16px',
                        background: 'rgba(255,255,255,0.02)',
                        borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)',
                        fontSize: 11, color: '#475569', lineHeight: 1.7,
                    }}>
                        <strong style={{ color: '#64748b' }}>Tolerance Rule:</strong> Answers within ±{TOLERANCE} are marked as close (✅ equivalent).
                        Exact answers build maximum streaks. Four drill types rotate randomly: Pot Odds, MDF, EV of Call, and Break-Even Equity.
                    </div>
                </div>
            </div>
        </>
    );
}

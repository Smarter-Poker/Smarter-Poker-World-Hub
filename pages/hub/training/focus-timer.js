/**
 * FOCUS TIMER — Pomodoro Training
 * ═══════════════════════════════════════════════════════════════════════════
 * 25-minute focus blocks with break timers.
 *
 * Route: /hub/training/focus-timer
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

const PHASES = {
    FOCUS: { id: 'focus', label: 'Focus Block', mins: 25, color: '#3b82f6' },
    SHORT_BREAK: { id: 'short', label: 'Short Break', mins: 5, color: '#22c55e' },
    LONG_BREAK: { id: 'long', label: 'Long Break', mins: 15, color: '#fbbf24' },
};

export default function FocusTimerPage() {
    const router = useRouter();
    useTrainingBus('focus-timer');
    const [phase, setPhase] = useState(PHASES.FOCUS);
    const [timeLeft, setTimeLeft] = useState(PHASES.FOCUS.mins * 60);
    const [isActive, setIsActive] = useState(false);
    const [completedBlocks, setCompletedBlocks] = useState(0);
    const timerRef = useRef(null);

    useEffect(() => {
        try { const c = localStorage.getItem('focus-timer-completed'); if (c) setCompletedBlocks(parseInt(c, 10)); } catch { }
    }, []);

    useEffect(() => {
        const h = () => { };
        window.addEventListener('training:session-complete', h);
        return () => window.removeEventListener('training:session-complete', h);
    }, []);

    useEffect(() => {
        if (isActive && timeLeft > 0) {
            timerRef.current = setInterval(() => setTimeLeft(t => t - 1), 1000);
        } else if (timeLeft === 0) {
            clearInterval(timerRef.current);
            setIsActive(false);
            if (phase.id === 'focus') {
                const next = completedBlocks + 1;
                setCompletedBlocks(next);
                try { localStorage.setItem('focus-timer-completed', next.toString()); } catch { }
                // Suggest break
                if (next % 4 === 0) changePhase(PHASES.LONG_BREAK);
                else changePhase(PHASES.SHORT_BREAK);
            }
        }
        return () => clearInterval(timerRef.current);
    }, [isActive, timeLeft, phase, completedBlocks]);

    const changePhase = (newPhase) => {
        clearInterval(timerRef.current);
        setPhase(newPhase);
        setTimeLeft(newPhase.mins * 60);
        setIsActive(false);
    };

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const reset = () => {
        clearInterval(timerRef.current);
        setTimeLeft(phase.mins * 60);
        setIsActive(false);
    };

    const progress = 1 - (timeLeft / (phase.mins * 60));

    return (
        <>
            <Head><title>Focus Timer | Smarter.Poker Training</title></Head>
            <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)', color: '#e2e8f0', fontFamily: "'Inter', -apple-system, sans-serif" }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => router.push('/hub/training')} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer', width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
                    <div><div style={{ fontSize: 16, fontWeight: 700 }}>Focus Timer</div><div style={{ fontSize: 11, color: '#64748b' }}>Pomodoro training</div></div>
                </div>

                <div style={{ padding: '40px 16px', maxWidth: 400, margin: '0 auto', textAlign: 'center' }}>
                    {/* Phase Selectors */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 40, background: 'rgba(0,0,0,0.2)', padding: 6, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                        {Object.values(PHASES).map(p => (
                            <motion.button key={p.id} whileTap={{ scale: 0.95 }} onClick={() => changePhase(p)}
                                style={{ flex: 1, padding: '10px 4px', borderRadius: 8, border: 'none', background: phase.id === p.id ? `${p.color}15` : 'transparent', color: phase.id === p.id ? p.color : '#64748b', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                {p.label}
                            </motion.button>
                        ))}
                    </div>

                    {/* Timer Circle */}
                    <div style={{ position: 'relative', width: 280, height: 280, margin: '0 auto 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="280" height="280" style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)' }}>
                            <circle cx="140" cy="140" r="130" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="8" />
                            <motion.circle cx="140" cy="140" r="130" fill="none" stroke={phase.color} strokeWidth="8" strokeLinecap="round" strokeDasharray={130 * 2 * Math.PI} animate={{ strokeDashoffset: (1 - progress) * 130 * 2 * Math.PI }} transition={{ duration: 1, ease: 'linear' }} />
                        </svg>
                        <div style={{ zIndex: 1 }}>
                            <div style={{ fontSize: 64, fontWeight: 900, fontFamily: 'monospace', letterSpacing: -2, color: isActive ? phase.color : '#e2e8f0', textShadow: isActive ? `0 0 20px ${phase.color}40` : 'none' }}>
                                {formatTime(timeLeft)}
                            </div>
                            <div style={{ fontSize: 14, color: '#64748b', textTransform: 'uppercase', letterSpacing: 2, marginTop: 4 }}>
                                {phase.label}
                            </div>
                        </div>
                    </div>

                    {/* Controls */}
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 40 }}>
                        <motion.button whileTap={{ scale: 0.95 }} onClick={() => setIsActive(!isActive)}
                            style={{ width: 140, padding: '16px', borderRadius: 16, border: 'none', background: isActive ? 'rgba(239,68,68,0.1)' : `linear-gradient(135deg, ${phase.color}, ${phase.color}aa)`, color: isActive ? '#f87171' : '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer', boxShadow: isActive ? 'none' : `0 4px 20px ${phase.color}40` }}>
                            {isActive ? 'PAUSE' : 'START'}
                        </motion.button>
                        <motion.button whileTap={{ scale: 0.95 }} onClick={reset}
                            style={{ width: 64, padding: '16px', borderRadius: 16, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}>
                            ↺
                        </motion.button>
                    </div>

                    {/* Stats */}
                    <div style={{ padding: '20px', borderRadius: 16, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Today's Focus</div>
                        <div style={{ fontSize: 32, fontWeight: 900, color: '#e2e8f0' }}>{completedBlocks} <span style={{ fontSize: 14, color: '#64748b', fontWeight: 600 }}>blocks</span></div>
                        <div style={{ fontSize: 12, color: '#4ade80', marginTop: 4 }}>~{Math.round((completedBlocks * 25) / 60 * 10) / 10} hours of deep work</div>
                    </div>
                </div>
            </div>
        </>
    );
}

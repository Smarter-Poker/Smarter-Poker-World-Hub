/**
 * SESSION WARMUP PROTOCOL
 * ═══════════════════════════════════════════════════════════════════════════
 * Interactive checklist before starting a live/online session.
 *
 * Route: /hub/training/session-warmup
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

const PROTOCOL_STEPS = [
    { id: 'mental', title: 'Mental State Check', desc: 'Are you rested, hydrated, and emotionally neutral?', btn: 'I am ready.' },
    { id: 'focus', title: 'Distractions Cleared', desc: 'Is your phone away? Are other browser tabs closed?', btn: 'Distractions cleared.' },
    { id: 'strategy', title: 'Strategic Focus', desc: 'What is your primary leak you are working on today?', input: true, btn: 'Set Focus.' },
    { id: 'br', title: 'Bankroll Hard-Stop', desc: 'How many buy-ins lost will trigger an immediate session end?', input: true, type: 'number', btn: 'Set Stop-Loss.' }
];

export default function SessionWarmupPage() {
    const router = useRouter();
    useTrainingBus('session-warmup');

    const [step, setStep] = useState(0);
    const [answers, setAnswers] = useState({});
    const [compVal, setCompVal] = useState('');

    useEffect(() => {
        const h = () => { };
        window.addEventListener('training:session-complete', h);
        return () => window.removeEventListener('training:session-complete', h);
    }, []);

    const nextStep = () => {
        if (PROTOCOL_STEPS[step].input) {
            if (!compVal) return; // Force answer
            setAnswers(prev => ({ ...prev, [PROTOCOL_STEPS[step].id]: compVal }));
            setCompVal('');
        }
        setStep(s => s + 1);
    };

    const finishProtocol = () => {
        fetch('/api/training/save-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId: 'session-warmup', stats: { completed: true, answers } })
        }).catch(() => { });

        router.push('/hub/training');
    };

    return (
        <>
            <Head><title>Warmup Protocol | Smarter.Poker Training</title></Head>
            <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at center, #1e293b 0%, #020617 100%)', color: '#e2e8f0', fontFamily: "'Inter', sans-serif" }}>

                <div style={{ position: 'absolute', top: 20, left: 20 }}>
                    <button onClick={() => router.push('/hub/training')} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer', width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 20 }}>

                    {step < PROTOCOL_STEPS.length ? (
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={step}
                                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 1.1, y: -20 }}
                                transition={{ duration: 0.3 }}
                                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 24, padding: 48, maxWidth: 500, width: '100%', textAlign: 'center', backdropFilter: 'blur(10px)' }}
                            >
                                <div style={{ fontSize: 13, fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 24 }}>System Check {step + 1} of {PROTOCOL_STEPS.length}</div>
                                <div style={{ fontSize: 32, fontWeight: 900, color: '#fff', marginBottom: 16, letterSpacing: '-1px' }}>{PROTOCOL_STEPS[step].title}</div>
                                <div style={{ fontSize: 18, color: '#94a3b8', lineHeight: 1.6, marginBottom: 40 }}>{PROTOCOL_STEPS[step].desc}</div>

                                {PROTOCOL_STEPS[step].input && (
                                    <input
                                        type={PROTOCOL_STEPS[step].type || 'text'}
                                        value={compVal}
                                        onChange={e => setCompVal(e.target.value)}
                                        placeholder="Enter your parameter..."
                                        style={{ width: '100%', padding: 20, background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(59,130,246,0.5)', borderRadius: 12, color: '#fff', fontSize: 18, textAlign: 'center', marginBottom: 32, outline: 'none' }}
                                        autoFocus
                                    />
                                )}

                                <motion.button
                                    whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                    onClick={nextStep}
                                    style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '16px 32px', borderRadius: 12, fontSize: 16, fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 30px rgba(59,130,246,0.3)' }}
                                >
                                    {PROTOCOL_STEPS[step].btn}
                                </motion.button>
                            </motion.div>
                        </AnimatePresence>
                    ) : (
                        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: 'center' }}>
                            <div style={{ width: 100, height: 100, borderRadius: '50%', background: 'rgba(74,222,128,0.1)', border: '4px solid #4ade80', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, margin: '0 auto 32px' }}>
                                ✓
                            </div>
                            <div style={{ fontSize: 40, fontWeight: 900, color: '#fff', marginBottom: 16, letterSpacing: '-1px' }}>You are prepared.</div>
                            <div style={{ fontSize: 18, color: '#94a3b8', marginBottom: 40 }}>Protocol verified. Execute your strategy.</div>

                            <motion.button
                                whileTap={{ scale: 0.95 }} onClick={finishProtocol}
                                style={{ background: '#4ade80', color: '#000', border: 'none', padding: '20px 48px', borderRadius: 16, fontSize: 18, fontWeight: 900, cursor: 'pointer', boxShadow: '0 8px 30px rgba(74,222,128,0.4)', textTransform: 'uppercase', letterSpacing: 1 }}
                            >
                                Deploy to Tables
                            </motion.button>
                        </motion.div>
                    )}

                </div>
            </div>
        </>
    );
}

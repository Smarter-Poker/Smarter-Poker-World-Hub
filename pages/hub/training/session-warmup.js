/**
 * SESSION WARMUP PROTOCOL — Pre-Session Readiness System
 * ═══════════════════════════════════════════════════════════════════════════
 * Interactive 6-step protocol with mental check, strategy focus,
 * bankroll stop-loss, warmup timer, and Supabase completion logging.
 *
 * Route: /hub/training/session-warmup
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import { getAccessToken } from '../../../src/lib/authUtils';

const PROTOCOL_STEPS = [
  {
    id: 'mental',
    title: 'Mental State Check',
    desc: 'Are you rested, hydrated, and emotionally neutral? Rate your current readiness.',
    options: ['Locked In', 'Good Enough', 'Slightly Off', 'Tilted'],
    icon: '🧠',
  },
  {
    id: 'focus',
    title: 'Distractions Cleared',
    desc: 'Is your phone away? Are other browser tabs closed? Have you set your environment for peak focus?',
    options: ['100% Cleared', 'Mostly Clear', 'Still Distracted'],
    icon: '🎯',
  },
  {
    id: 'review',
    title: 'Last Session Review',
    desc: 'Think about your last session. What was your biggest mistake? What would you do differently?',
    input: true,
    placeholder: 'My biggest mistake last session was...',
    icon: '📝',
  },
  {
    id: 'strategy',
    title: 'Strategic Focus',
    desc: 'What is the ONE leak you are actively working on today? Be specific.',
    input: true,
    placeholder: 'Today I am focusing on...',
    icon: '♟️',
  },
  {
    id: 'br',
    title: 'Bankroll Hard-Stop',
    desc: 'Set your stop-loss. How many buy-ins lost triggers an immediate session end? A hard stop prevents tilt cascades.',
    input: true,
    type: 'number',
    placeholder: 'Buy-ins (e.g., 3)',
    icon: '🛑',
  },
  {
    id: 'timer',
    title: 'Session Duration',
    desc: 'Set your planned session length. Quality drops after 60 minutes for most players. Shorter focused sessions beat long unfocused grinds.',
    options: ['30 min', '45 min', '60 min', '90 min', '120 min'],
    icon: '⏱️',
  },
];

// Warmup Tips
const WARMUP_TIPS = [
  'Review 3 hands from your last session before playing.',
  'Drink a full glass of water before sitting down.',
  'Do 5 deep breaths to center your focus.',
  'Set a hard stop-loss BEFORE you start.',
  'Close all unnecessary browser tabs and apps.',
  'Remind yourself: every decision is independent.',
  'Focus on process, not results.',
  'If you lost your last session, that has ZERO impact on today.',
];

export default function SessionWarmupPage() {
  const router = useRouter();
  useTrainingBus('session-warmup');

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [inputVal, setInputVal] = useState('');
  const [completed, setCompleted] = useState(false);
  const [completionCount, setCompletionCount] = useState(0);
  const savedRef = useRef(false);

  // Load completion count
  useEffect(() => {
    try {
      const count = parseInt(localStorage.getItem('warmup-count') || '0', 10);
      setCompletionCount(count);
    } catch {}
  }, []);

  // EventBus listener
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', (e) => {
      if (e?.source === 'SessionWarmup') return;
    });
    return unsub;
  }, []);

  const currentStep = PROTOCOL_STEPS[step];
  const progress = ((step + 1) / PROTOCOL_STEPS.length) * 100;

  const selectOption = useCallback(
    (option) => {
      setAnswers((prev) => ({ ...prev, [currentStep.id]: option }));
      if (step < PROTOCOL_STEPS.length - 1) {
        setStep((s) => s + 1);
      } else {
        setCompleted(true);
      }
    },
    [step, currentStep]
  );

  const submitInput = useCallback(() => {
    if (!inputVal.trim()) return;
    setAnswers((prev) => ({ ...prev, [currentStep.id]: inputVal.trim() }));
    setInputVal('');
    if (step < PROTOCOL_STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      setCompleted(true);
    }
  }, [inputVal, step, currentStep]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') submitInput();
    },
    [submitInput]
  );

  // Save completion to Supabase
  useEffect(() => {
    if (completed && !savedRef.current) {
      savedRef.current = true;
      const newCount = completionCount + 1;
      setCompletionCount(newCount);
      try {
        localStorage.setItem('warmup-count', String(newCount));
      } catch {}

      const save = async () => {
        try {
          const token = typeof getAccessToken === 'function' ? getAccessToken() : null;
          if (!token) return;
          await fetch('/api/training/save-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              gameId: 'session-warmup',
              gameName: `Session Warmup #${newCount}`,
              gtowScore: 100,
              totalEVLoss: 0,
              handsPlayed: PROTOCOL_STEPS.length,
              mistakeCount: 0,
              accuracy: 100,
              correctCount: PROTOCOL_STEPS.length,
              bestStreak: 0,
              levelPassed: true,
              level: 1,
              handHistory: [{ type: 'warmup', answers, timestamp: new Date().toISOString() }],
            }),
          });
          eventBus?.emit?.(
            EventType?.SESSION_END || 'session:end',
            {
              gameId: 'session-warmup',
              completed: true,
              focus: answers.strategy || 'general',
              stopLoss: answers.br || '3',
            },
            'SessionWarmup'
          );
        } catch (err) {
          console.warn('[Warmup] Save error:', err.message);
        }
      };
      save();
    }
  }, [completed]);

  // Random tip
  const tip = WARMUP_TIPS[Math.floor(Math.random() * WARMUP_TIPS.length)];

  return (
    <>
      <Head>
        <title>Session Warmup | Smarter.Poker Training</title>
        <meta
          name="description"
          content="Prepare for your poker session with our interactive warmup protocol. Set goals and stop-losses before playing."
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Orbitron:wght@500;700;900&display=swap"
          rel="stylesheet"
        />
      </Head>
      <div
        style={{
          minHeight: '100vh',
          background: 'radial-gradient(circle at center, #1e293b 0%, #020617 100%)',
          color: '#e2e8f0',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        {/* Back Button */}
        <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 10 }}>
          <button
            onClick={() => router.push('/hub/training')}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: 'none',
              color: '#94a3b8',
              fontSize: 18,
              cursor: 'pointer',
              width: 36,
              height: 36,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ←
          </button>
        </div>

        {/* Completion Counter */}
        <div
          style={{
            position: 'absolute',
            top: 20,
            right: 20,
            zIndex: 10,
            fontSize: 10,
            color: '#334155',
          }}
        >
          Warmups completed: {completionCount}
        </div>

        {/* Progress Bar */}
        {!completed && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 3,
              background: 'rgba(255,255,255,0.03)',
              zIndex: 10,
            }}
          >
            <motion.div
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
              style={{
                height: '100%',
                background: 'linear-gradient(90deg, #3b82f6, #a855f7)',
                borderRadius: '0 2px 2px 0',
              }}
            />
          </div>
        )}

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: 20,
          }}
        >
          {!completed ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, scale: 0.92, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 1.05, y: -20 }}
                transition={{ duration: 0.3 }}
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 24,
                  padding: '48px 40px',
                  maxWidth: 520,
                  width: '100%',
                  textAlign: 'center',
                  backdropFilter: 'blur(10px)',
                }}
              >
                <div style={{ fontSize: 40, marginBottom: 16 }}>{currentStep.icon}</div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: '#3b82f6',
                    textTransform: 'uppercase',
                    letterSpacing: 2,
                    marginBottom: 16,
                  }}
                >
                  System Check {step + 1} of {PROTOCOL_STEPS.length}
                </div>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 900,
                    color: '#fff',
                    marginBottom: 12,
                    letterSpacing: '-0.5px',
                  }}
                >
                  {currentStep.title}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: '#94a3b8',
                    lineHeight: 1.6,
                    marginBottom: 32,
                    padding: '0 8px',
                  }}
                >
                  {currentStep.desc}
                </div>

                {/* Options */}
                {currentStep.options && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      maxWidth: 320,
                      margin: '0 auto',
                    }}
                  >
                    {currentStep.options.map((opt, i) => {
                      const colors = ['#22c55e', '#3b82f6', '#fbbf24', '#ef4444', '#64748b'];
                      const color = colors[i] || '#94a3b8';
                      return (
                        <motion.button
                          key={opt}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => selectOption(opt)}
                          style={{
                            padding: '14px 16px',
                            borderRadius: 10,
                            background: `${color}10`,
                            border: `1px solid ${color}30`,
                            color: color,
                            fontSize: 14,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {opt}
                        </motion.button>
                      );
                    })}
                  </div>
                )}

                {/* Text Input */}
                {currentStep.input && (
                  <div style={{ maxWidth: 400, margin: '0 auto' }}>
                    <input
                      type={currentStep.type || 'text'}
                      value={inputVal}
                      onChange={(e) => setInputVal(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={currentStep.placeholder}
                      autoFocus
                      style={{
                        width: '100%',
                        padding: '16px 20px',
                        background: 'rgba(0,0,0,0.4)',
                        border: '1px solid rgba(59,130,246,0.4)',
                        borderRadius: 12,
                        color: '#fff',
                        fontSize: 16,
                        textAlign: 'center',
                        outline: 'none',
                        marginBottom: 16,
                        boxSizing: 'border-box',
                      }}
                    />
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={submitInput}
                      disabled={!inputVal.trim()}
                      style={{
                        background: inputVal.trim() ? '#3b82f6' : 'rgba(59,130,246,0.3)',
                        color: '#fff',
                        border: 'none',
                        padding: '14px 32px',
                        borderRadius: 10,
                        fontSize: 14,
                        fontWeight: 800,
                        cursor: inputVal.trim() ? 'pointer' : 'not-allowed',
                        boxShadow: inputVal.trim() ? '0 6px 24px rgba(59,130,246,0.3)' : 'none',
                      }}
                    >
                      Continue →
                    </motion.button>
                  </div>
                )}

                {/* Step indicator dots */}
                <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 24 }}>
                  {PROTOCOL_STEPS.map((_, i) => (
                    <div
                      key={i}
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: i <= step ? '#3b82f6' : 'rgba(255,255,255,0.1)',
                      }}
                    />
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>
          ) : (
            /* ═══ COMPLETION SCREEN ═══ */
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 200 }}
              style={{ textAlign: 'center', maxWidth: 480, width: '100%' }}
            >
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  background: 'rgba(74,222,128,0.1)',
                  border: '3px solid #4ade80',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 36,
                  margin: '0 auto 24px',
                }}
              >
                ✓
              </div>
              <div
                style={{
                  fontSize: 32,
                  fontWeight: 900,
                  color: '#fff',
                  marginBottom: 8,
                  letterSpacing: '-1px',
                }}
              >
                You are prepared.
              </div>
              <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 32 }}>
                Protocol verified. Execute your strategy.
              </div>

              {/* Summary */}
              <div
                style={{
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 24,
                  textAlign: 'left',
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#64748b',
                    textTransform: 'uppercase',
                    marginBottom: 8,
                    letterSpacing: 1,
                  }}
                >
                  Session Plan
                </div>
                {Object.entries(answers).map(([key, val]) => {
                  const label = PROTOCOL_STEPS.find((s) => s.id === key)?.title || key;
                  return (
                    <div
                      key={key}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '6px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                      }}
                    >
                      <span style={{ fontSize: 11, color: '#64748b' }}>{label}</span>
                      <span
                        style={{
                          fontSize: 11,
                          color: '#e2e8f0',
                          fontWeight: 600,
                          maxWidth: 200,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {val}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Tip */}
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'rgba(0,212,255,0.04)',
                  border: '1px solid rgba(0,212,255,0.1)',
                  marginBottom: 24,
                }}
              >
                <span style={{ fontSize: 10, fontWeight: 700, color: '#00d4ff' }}>TIP: </span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{tip}</span>
              </div>

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => router.push('/hub/training')}
                style={{
                  background: '#4ade80',
                  color: '#000',
                  border: 'none',
                  padding: '16px 40px',
                  borderRadius: 12,
                  fontSize: 16,
                  fontWeight: 900,
                  cursor: 'pointer',
                  boxShadow: '0 8px 30px rgba(74,222,128,0.3)',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
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

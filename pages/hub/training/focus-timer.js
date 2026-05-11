/**
 * FOCUS TIMER — Pomodoro Training
 * ═══════════════════════════════════════════════════════════════════════════
 * 25-minute focus blocks with break timers, session logging,
 * and Supabase persistence.
 *
 * Route: /hub/training/focus-timer
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import { getAccessToken, authedFetch } from '../../../src/lib/authUtils';

const PHASES = {
  FOCUS: { id: 'focus', label: 'Focus Block', mins: 25, color: '#3b82f6' },
  SHORT_BREAK: { id: 'short', label: 'Short Break', mins: 5, color: '#22c55e' },
  LONG_BREAK: { id: 'long', label: 'Long Break', mins: 15, color: '#fbbf24' },
};

// BUG FIX (TRAIN-FOCUS-A11Y-1): SVG icons replacing back arrow, bell toggle,
// and ✓ check. Strict build-safety rules from PR #362/#365/#369 — no JSX
// comments inside conditional expressions, no emoji chars in fallback
// strings. Same surface-specific a11y pattern as PR #320/#322/#324/
// #327-#361/#373.
const ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};
function _Svg({ size = 14, vb = '0 0 24 24', children }) {
  return <svg {...ICON_PROPS} width={size} height={size} viewBox={vb}>{children}</svg>;
}
function FtBackArrowIcon({ size = 18 }) {
  return (
    <_Svg size={size}>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </_Svg>
  );
}
function BellIcon({ size = 20 }) {
  return (
    <_Svg size={size}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </_Svg>
  );
}
function BellOffIcon({ size = 20 }) {
  return (
    <_Svg size={size}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </_Svg>
  );
}
function FtCheckIcon({ size = 12 }) {
  return (
    <_Svg size={size}>
      <polyline points="20 6 9 17 4 12" />
    </_Svg>
  );
}


export default function FocusTimerPage() {
  const router = useRouter();
  useTrainingBus('focus-timer');
  const [phase, setPhase] = useState(PHASES.FOCUS);
  const [timeLeft, setTimeLeft] = useState(PHASES.FOCUS.mins * 60);
  const [isActive, setIsActive] = useState(false);
  const [completedBlocks, setCompletedBlocks] = useState(0);
  const [sessionLog, setSessionLog] = useState([]);
  const [notify, setNotify] = useState(true);
  const timerRef = useRef(null);
  const savedRef = useRef(false);

  useEffect(() => {
    try {
      const c = localStorage.getItem('focus-timer-completed');
      if (c) setCompletedBlocks(parseInt(c, 10));
      const log = localStorage.getItem('focus-timer-log');
      if (log) setSessionLog(JSON.parse(log));
    } catch (e) { console.warn('[App] Handled exception:', e); }
  }, []);

  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', (e) => {
      if (e?.source === 'FocusTimer') return;
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (isActive && timeLeft > 0) {
      timerRef.current = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    } else if (timeLeft === 0) {
      clearInterval(timerRef.current);
      setIsActive(false);
      if (phase.id === 'focus' && !savedRef.current) {
        savedRef.current = true;
        const next = completedBlocks + 1;
        setCompletedBlocks(next);
        try {
          localStorage.setItem('focus-timer-completed', next.toString());
        } catch (e) { console.warn('[App] Handled exception:', e); }
        // Log the session
        const entry = {
          id: Date.now(),
          time: new Date().toLocaleTimeString(),
          duration: phase.mins,
        };
        const newLog = [entry, ...sessionLog].slice(0, 20);
        setSessionLog(newLog);
        try {
          localStorage.setItem('focus-timer-log', JSON.stringify(newLog));
        } catch (e) { console.warn('[App] Handled exception:', e); }
        // Save to Supabase
        const token = typeof getAccessToken === 'function' ? getAccessToken() : null;
        if (token) {
          authedFetch('/api/training/save-session', {
            method: 'POST',
            body: JSON.stringify({
              gameId: 'focus-timer',
              gameName: `Focus Block #${next} (${phase.mins}min)`,
              gtowScore: 100,
              totalEVLoss: 0,
              handsPlayed: next,
              mistakeCount: 0,
              accuracy: 100,
              correctCount: next,
              bestStreak: next,
              levelPassed: true,
              level: 1,
              handHistory: [],
            }),
          }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
          eventBus?.emit?.(
            EventType?.SESSION_END || 'session:end',
            { gameId: 'focus-timer', blocks: next, totalMinutes: next * phase.mins },
            'FocusTimer'
          );
        }
        setTimeout(() => {
          savedRef.current = false;
        }, 1000);
        // Suggest break
        if (next % 4 === 0) changePhase(PHASES.LONG_BREAK);
        else changePhase(PHASES.SHORT_BREAK);
      }
    }
    return () => clearInterval(timerRef.current);
  }, [isActive, timeLeft, phase, completedBlocks, sessionLog]);

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

  const progress = 1 - timeLeft / (phase.mins * 60);

  return (
    <>
      <Head>
        <title>Focus Timer | Smarter.Poker Training</title>
      </Head>
      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)',
          color: '#e2e8f0',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <button
            type="button"
            aria-label="Back to training"
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
            <FtBackArrowIcon size={18} />
          </button>
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Focus Timer</h1>
            <div style={{ fontSize: 11, color: '#64748b' }}>Pomodoro training</div>
          </div>
        </div>

        <div style={{ padding: '40px 16px', maxWidth: 400, margin: '0 auto', textAlign: 'center' }}>
          {/* Phase Selectors */}
          <div
            style={{
              display: 'flex',
              gap: 6,
              marginBottom: 40,
              background: 'rgba(0,0,0,0.2)',
              padding: 6,
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            {Object.values(PHASES || {}).map((p) => (
              <motion.button
                key={p.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => changePhase(p)}
                style={{
                  flex: 1,
                  padding: '10px 4px',
                  borderRadius: 8,
                  border: 'none',
                  background: phase.id === p.id ? `${p.color}15` : 'transparent',
                  color: phase.id === p.id ? p.color : '#64748b',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {p.label}
              </motion.button>
            ))}
          </div>

          {/* Timer Circle */}
          <div
            style={{
              position: 'relative',
              width: 280,
              height: 280,
              margin: '0 auto 40px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width="280"
              height="280"
              style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)' }}
            >
              <circle
                cx="140"
                cy="140"
                r="130"
                fill="none"
                stroke="rgba(255,255,255,0.03)"
                strokeWidth="8"
              />
              <motion.circle
                cx="140"
                cy="140"
                r="130"
                fill="none"
                stroke={phase.color}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={130 * 2 * Math.PI}
                animate={{ strokeDashoffset: (1 - progress) * 130 * 2 * Math.PI }}
                transition={{ duration: 1, ease: 'linear' }}
              />
            </svg>
            <div style={{ zIndex: 1 }}>
              <div
                style={{
                  fontSize: 64,
                  fontWeight: 900,
                  fontFamily: 'monospace',
                  letterSpacing: -2,
                  color: isActive ? phase.color : '#e2e8f0',
                  textShadow: isActive ? `0 0 20px ${phase.color}40` : 'none',
                }}
              >
                {formatTime(timeLeft)}
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: 2,
                  marginTop: 4,
                }}
              >
                {phase.label}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 40 }}>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsActive(!isActive)}
              style={{
                width: 140,
                padding: '16px',
                borderRadius: 16,
                border: 'none',
                background: isActive
                  ? 'rgba(239,68,68,0.1)'
                  : `linear-gradient(135deg, ${phase.color}, ${phase.color}aa)`,
                color: isActive ? '#f87171' : '#fff',
                fontSize: 16,
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: isActive ? 'none' : `0 4px 20px ${phase.color}40`,
              }}
            >
              {isActive ? 'PAUSE' : 'START'}
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={reset}
              style={{
                width: 64,
                padding: '16px',
                borderRadius: 16,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(0,0,0,0.2)',
                color: '#94a3b8',
                fontSize: 20,
                cursor: 'pointer',
              }}
            >
              ↺
            </motion.button>
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div
              style={{
                flex: 1,
                padding: '16px',
                borderRadius: 12,
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid rgba(255,255,255,0.05)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 28, fontWeight: 900, color: '#e2e8f0' }}>
                {completedBlocks}
              </div>
              <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>
                blocks
              </div>
            </div>
            <div
              style={{
                flex: 1,
                padding: '16px',
                borderRadius: 12,
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid rgba(255,255,255,0.05)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 28, fontWeight: 900, color: '#4ade80' }}>
                {Math.round(((completedBlocks * 25) / 60) * 10) / 10}
              </div>
              <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>
                hours
              </div>
            </div>
            <div
              style={{
                flex: 1,
                padding: '16px',
                borderRadius: 12,
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid rgba(255,255,255,0.05)',
                textAlign: 'center',
              }}
            >
              <button
                type="button"
                aria-label={notify ? 'Disable notifications' : 'Enable notifications'}
                aria-pressed={notify}
                onClick={() => setNotify(!notify)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: notify ? '#4ade80' : '#94a3b8' }}
              >
                {notify ? <BellIcon size={20} /> : <BellOffIcon size={20} />}
              </button>
              <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>
                {notify ? 'on' : 'off'}
              </div>
            </div>
          </div>

          {/* Session Log */}
          {sessionLog.length > 0 && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 12,
                background: 'rgba(0,0,0,0.15)',
                border: '1px solid rgba(255,255,255,0.03)',
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: '#475569',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  marginBottom: 8,
                }}
              >
                Recent Sessions
              </div>
              {sessionLog.slice(0, 5).map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '4px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.02)',
                  }}
                >
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{s.time}</span>
                  <span style={{ fontSize: 11, color: '#4ade80', fontWeight: 600 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{s.duration}min focus <FtCheckIcon size={12} /></span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

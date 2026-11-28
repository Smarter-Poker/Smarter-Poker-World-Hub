/**
 * FOCUS TIMER — Pomodoro Training
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * 25-minute focus blocks with break timers, session logging,
 * and device-local persistence.
 *
 * Route: /hub/training/focus-timer
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-16 — hex sweep batch 5: literals routed to --sp-* tokens
import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { authedFetch } from '../../../src/lib/authUtils';

import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import st from '../../../src/styles/training/study-tools.module.css';
const PHASES = {
  FOCUS: { id: 'focus', label: 'Focus Block', mins: 25, color: '#49c6ff' },
  SHORT_BREAK: { id: 'short', label: 'Short Break', mins: 5, color: '#86daff' },
  LONG_BREAK: { id: 'long', label: 'Long Break', mins: 15, color: '#86daff' },
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
    authedFetch('/api/training/tool-records?tool_id=focus-timer&limit=25')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        const records = Array.isArray(json?.records) ? json.records : [];
        if (records.length > 0) {
          const maxCompleted = records.reduce((max, rec) => {
            const val = Number(rec?.payload?.completedBlocks);
            return Number.isFinite(val) && val > max ? val : max;
          }, records.length);
          setCompletedBlocks((prev) => {
            const next = Math.max(prev, maxCompleted);
            try { localStorage.setItem('focus-timer-completed', String(next)); } catch (_) {}
            return next;
          });
          const entries = records
            .map((rec) => rec?.payload?.entry)
            .filter((entry) => entry && entry.time);
          if (entries.length > 0) {
            setSessionLog((prev) => {
              const byId = new Map();
              [...entries, ...prev].forEach((e) => {
                if (e && e.id && !byId.has(e.id)) byId.set(e.id, e);
              });
              const merged = Array.from(byId.values())
                .sort((a, b) => Number(b.id) - Number(a.id))
                .slice(0, 20);
              try { localStorage.setItem('focus-timer-log', JSON.stringify(merged)); } catch (_) {}
              return merged;
            });
          }
        }
      })
      .catch(() => {});
  }, []);

  const recordCompletedFocusBlock = () => {
    const next = completedBlocks + 1;
    setCompletedBlocks(next);
    try {
      localStorage.setItem('focus-timer-completed', next.toString());
    } catch (e) { console.warn('[App] Handled exception:', e); }
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
    authedFetch('/api/training/tool-records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_id: 'focus-timer',
        record_key: `focus_block_${next}`,
        record_type: 'focus_block',
        title: `Focus Block #${next}`,
        summary: `${phase.mins}m completed at ${entry.time}`,
        payload: {
          completedBlocks: next,
          entry,
        },
      }),
    }).catch(() => {});
    return next;
  };

  useEffect(() => {
    if (isActive && timeLeft > 0) {
      timerRef.current = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    } else if (timeLeft === 0) {
      clearInterval(timerRef.current);
      setIsActive(false);
      if (phase.id === 'focus' && !savedRef.current) {
        savedRef.current = true;
        const next = recordCompletedFocusBlock();
        // A focus block is productivity history, not a graded poker decision.
        // Keep it out of training sessions, streaks, accuracy, and leaderboards.
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
      <SEOHead
        title="Poker Session Pomodoro Focus Timer"
        description="Structure Poker Study Blocks And Multi-Table Grinding Sessions Into Timed High-Concentration Intervals And Mental Reset Breaks On Smarter.Poker."
        canonical="/hub/training/focus-timer"
      />
      <div className={st.shell}>
        <TrainingPageHead slug="training-focus-timer" note="Pomodoro Training" />

        <div className={st.page}>
          {/* Phase Selectors */}
          <div className={`sd-tabs ${st.grid3}`} role="group" aria-label="Timer Phase">
            {Object.values(PHASES || {}).map((p) => (
              <motion.button
                key={p.id}
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => changePhase(p)}
                aria-pressed={phase.id === p.id}
                className="sd-button"
              >
                {p.label}
              </motion.button>
            ))}
          </div>

          {/* Timer Circle */}
          <section className={`sd-panel ${st.panel} ${st.timerPanel}`} aria-label={`${phase.label} Timer`}>
            <div className={st.timerDial}>
              <svg viewBox="0 0 280 280" className={st.timerRing} aria-hidden>
                <circle cx="140" cy="140" r="130" fill="none" stroke="#11263a" strokeWidth="10" />
                <circle cx="140" cy="140" r="118" fill="none" stroke="rgba(124,158,187,0.25)" strokeWidth="1" />
                <motion.circle
                  cx="140"
                  cy="140"
                  r="130"
                  fill="none"
                  stroke={phase.color}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={130 * 2 * Math.PI}
                  animate={{ strokeDashoffset: (1 - progress) * 130 * 2 * Math.PI }}
                  transition={{ duration: 1, ease: 'linear' }}
                />
              </svg>
              <div className={st.timerReadout}>
                <div className={st.timerTime} data-active={isActive ? 'true' : undefined} role="timer" aria-live="off">
                  {formatTime(timeLeft)}
                </div>
                <div className={st.timerPhase}>
                  {isActive ? 'Running' : 'Ready'} · {phase.label}
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className={st.timerControls}>
              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsActive(!isActive)}
                className={`sd-button ${isActive ? '' : 'sd-primary'}`}
              >
                {isActive ? 'Pause' : 'Start'}
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={reset}
                aria-label="Reset Timer"
                className="sd-button"
              >
                ↺ Reset
              </motion.button>
            </div>
            <motion.button
              type="button"
              data-complete-focus-block-btn="true"
              whileTap={{ scale: 0.95 }}
              onClick={recordCompletedFocusBlock}
              className={`sd-button ${st.block}`}
            >
              Log Completed Block
            </motion.button>
          </section>

          {/* Stats */}
          <section className={st.metrics} style={{ '--cols': 3 }} aria-label="Focus Summary">
            <div data-focus-completed-count={completedBlocks} className={`sd-metric ${st.metric}`}>
              <strong className={st.metricValue}>{completedBlocks}</strong>
              <span className={st.metricLabel}>Blocks</span>
            </div>
            <div className={`sd-metric ${st.metric}`}>
              <strong className={st.metricValue} data-tone="ice">
                {Math.round(((completedBlocks * 25) / 60) * 10) / 10}
              </strong>
              <span className={st.metricLabel}>Hours</span>
            </div>
            <div className={`sd-metric ${st.metric}`}>
              <button
                type="button"
                aria-label={notify ? 'Disable notifications' : 'Enable notifications'}
                aria-pressed={notify}
                onClick={() => setNotify(!notify)}
                className={`sd-button ${st.close}`}
              >
                {notify ? <BellIcon size={20} /> : <BellOffIcon size={20} />}
              </button>
              <span className={st.metricLabel}>Alerts {notify ? 'On' : 'Off'}</span>
            </div>
          </section>

          {/* Session Log */}
          {sessionLog.length > 0 && (
            <section className={`sd-panel ${st.panel}`} aria-labelledby="focus-log-title">
              <h2 id="focus-log-title" className={st.title}>Recent Sessions</h2>
              <div className={st.list}>
                {sessionLog.slice(0, 5).map((s) => (
                  <div key={s.id} className={`${st.item} ${st.rowItem}`}>
                    <span className={st.small}>{s.time}</span>
                    <span className={st.ice} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 650, fontSize: '0.86rem' }}>
                      {s.duration}min Focus <FtCheckIcon size={12} />
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

        </div>
      </div>
      <HubPageSummary page="training-focus-timer" />
    </>
  );
}

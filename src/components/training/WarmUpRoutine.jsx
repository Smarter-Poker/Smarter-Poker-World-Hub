/**
 * WarmUpRoutine — Pre-Session Warm-Up Routine
 * Structured warm-up process for peak performance
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const ROUTINE_STEPS = [
  { step: 'Review Previous Session', time: '5 min', icon: '□', color: '#3b82f6',
    detail: 'Look at your last session\'s key hands. Remind yourself of mistakes you made and goals you set.',
    actions: ['Open last session notes', 'Review 3-5 key hands', 'Identify one leak to focus on today', 'Set a specific goal (e.g., "fold more to river raises")'],
    benefit: 'Primes your brain for pattern recognition. You\'re less likely to repeat yesterday\'s mistakes.' },
  { step: 'Range Review', time: '5 min', icon: '■', color: '#22c55e',
    detail: 'Quiz yourself on opening ranges for each position. Use flashcards or a range trainer.',
    actions: ['Test UTG opening range', 'Test CO opening range', 'Test BTN opening range', 'Review 3-bet ranges vs each position'],
    benefit: 'Preflop decisions become automatic, freeing mental energy for tough postflop spots.' },
  { step: 'Solver Spot Review', time: '5 min', icon: '◇', color: '#f59e0b',
    detail: 'Study one specific solver spot. Pick a common scenario you struggled with recently.',
    actions: ['Choose one spot (e.g., "c-bet OOP in 3-bet pots")', 'Run it through GTO Wizard', 'Note the solver\'s frequency and sizing', 'Practice applying it mentally'],
    benefit: 'Keeps your GTO knowledge fresh and builds up your solver database of known spots.' },
  { step: 'Mental Game Check-In', time: '3 min', icon: '◇', color: '#8b5cf6',
    detail: 'Assess your mental state. Are you tired? Stressed? Tilted from something off the table?',
    actions: ['Rate your energy level 1-10', 'Rate your focus level 1-10', 'Rate your emotional state 1-10', 'If any score < 6, consider shorter session or skipping'],
    benefit: 'Prevents you from playing when you\'re not at your best. Saves buy-ins from tilt sessions.' },
  { step: 'Set Session Parameters', time: '2 min', icon: '●', color: '#ef4444',
    detail: 'Define your session before you start: duration, stakes, number of tables, and stop-loss.',
    actions: ['Set session duration (e.g., 90 minutes)', 'Set stop-loss (e.g., -3 buy-ins)', 'Set number of tables', 'Commit to your plan in writing'],
    benefit: 'Having predefined rules prevents emotional decisions mid-session. You already decided when to quit.' },
];

export default function WarmUpRoutine() {
  const [idx, setIdx] = useState(0);
  const s = ROUTINE_STEPS[idx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #22c55e, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Pre-Session Warm-Up
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>20-minute routine for peak poker performance.</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {ROUTINE_STEPS.map((step, i) => (
          <button key={i} onClick={() => setIdx(i)}
            style={{ padding: '6px 12px', borderRadius: 8, border: idx === i ? `2px solid ${step.color}` : '1px solid rgba(255,255,255,0.06)',
              background: idx === i ? `${step.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer',
              fontSize: 11, fontWeight: 700, color: idx === i ? step.color : '#64748b' }}>
            {step.icon} {step.time}
          </button>
        ))}
      </div>

      <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.icon} {s.step}</span>
          <span style={{ padding: '3px 8px', borderRadius: 12, background: `${s.color}20`, fontSize: 11, fontWeight: 700, color: s.color }}>{s.time}</span>
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 12 }}>{s.detail}</p>
        <div style={{ background: `${s.color}06`, borderRadius: 8, padding: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: s.color, marginBottom: 6 }}>CHECKLIST</div>
          {s.actions.map((a, i) => (
            <div key={i} style={{ fontSize: 12, color: '#94a3b8', padding: '3px 0', display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ color: s.color }}>□</span> {a}
            </div>
          ))}
        </div>
        <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#22c55e' }}>WHY IT WORKS</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{s.benefit}</div>
        </div>
      </motion.div>
    </div>
  );
}

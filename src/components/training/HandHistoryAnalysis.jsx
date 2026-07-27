/**
 * HandHistoryAnalysis — Hand History Review Guide
 * How to analyze your own hands for maximum improvement
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const ANALYSIS_STEPS = [
  { step: '1. Filter for Big Pots', icon: '○', color: '#ef4444',
    detail: 'Start your review by filtering for the biggest pots you played. These are where the most money was won or lost.',
    howto: 'Sort by pot size descending. Review your top 10 biggest winning and losing pots from the session.',
    why: 'Big pots have the biggest impact on your win rate. A single mistake in a big pot can erase hours of good play.',
    tool: 'Use your tracking software (PT4, HM3, Hand2Note) to filter by pot size > 50bb.' },
  { step: '2. Check Your Preflop Ranges', icon: '□', color: '#22c55e',
    detail: 'Compare your actual preflop opens/calls/3-bets to GTO charts. Look for systematic deviations.',
    howto: 'Filter by position and action (open, 3-bet, cold call). Compare your frequencies to solver recommendations.',
    why: 'Preflop leaks compound over every hand. Opening 5% too wide from UTG affects hundreds of hands per session.',
    tool: 'Use Equilab or Flopzilla to compare your actual ranges vs recommended ranges by position.' },
  { step: '3. Review Street-by-Street', icon: '◆', color: '#3b82f6',
    detail: 'For each key hand, walk through every street. At each decision point, ask: "What\'s my plan for the whole hand?"',
    howto: 'Pause at each action. Consider your range, opponent\'s range, board texture, and stack depth. What does a solver do here?',
    why: 'Many mistakes happen because players don\'t plan ahead. A flop bet without a turn/river plan is often a mistake.',
    tool: 'Run key spots through GTO Wizard or PioSOLVER. Compare your play to the solver\'s recommendation.' },
  { step: '4. Identify Patterns', icon: '■', color: '#f59e0b',
    detail: 'After reviewing 20+ hands, look for repeating mistakes. Do you always overplay top pair? Always give up on the turn?',
    howto: 'Categorize mistakes: sizing errors, range errors, timing errors, tilt-related errors. Track which category is most common.',
    why: 'Fixing one systematic leak (like always calling river bets) can improve your win rate by 2-3bb/100 instantly.',
    tool: 'Create a spreadsheet of mistakes by category. Review it weekly to track improvement.' },
  { step: '5. Study Sessions, Not Hands', icon: '▲', color: '#8b5cf6',
    detail: 'Don\'t just review individual hands — look at your session as a whole. How did your play change over time? Did you tilt?',
    howto: 'Plot your session graph. Look for slope changes. Did your play deteriorate after a bad beat? After hour 3?',
    why: 'Session-level analysis reveals mental game leaks that hand-level analysis misses. Maybe you always tilt after losing a flip.',
    tool: 'Use your tracker\'s session review. Look at win rate by hour played. Most players deteriorate after 2-3 hours.' },
];

export default function HandHistoryAnalysis() {
  const [idx, setIdx] = useState(0);
  const s = ANALYSIS_STEPS[idx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #f59e0b, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Hand History Analysis
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>The ultimate guide to reviewing your own play.</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {ANALYSIS_STEPS.map((step, i) => (
          <button key={i} onClick={() => setIdx(i)}
            style={{ padding: '6px 12px', borderRadius: 8, border: idx === i ? `2px solid ${step.color}` : '1px solid rgba(255,255,255,0.06)',
              background: idx === i ? `${step.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer',
              fontSize: 11, fontWeight: 700, color: idx === i ? step.color : '#64748b' }}>
            {step.icon} Step {i + 1}
          </button>
        ))}
      </div>

      <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: s.color, marginBottom: 8 }}>{s.icon} {s.step}</div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 12 }}>{s.detail}</p>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: `${s.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${s.color}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: s.color }}>HOW TO DO IT</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{s.howto}</div>
          </div>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#22c55e' }}>WHY IT MATTERS</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{s.why}</div>
          </div>
          <div style={{ background: 'rgba(59,130,246,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #3b82f6' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6' }}>RECOMMENDED TOOL</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{s.tool}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

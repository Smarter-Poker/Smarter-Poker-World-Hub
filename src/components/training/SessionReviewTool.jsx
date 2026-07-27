/**
 * SessionReviewTool — Post-Session Review Framework
 * Structured approach to reviewing your poker sessions
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const REVIEW_STEPS = [
  { step: '1. Biggest Pots Review', icon: '', color: '#22c55e',
    what: 'Pull up your 5-10 biggest pots (won and lost). These have the highest EV impact.',
    questions: 'Did I play correctly? Was this a cooler or did I make a mistake? Would I play it the same again?',
    tool: 'Use your tracker\'s hand replayer. Sort by pot size. Focus on decision quality, not results.',
    time: '10-15 minutes' },
  { step: '2. Leak Identification', icon: '', color: '#ef4444',
    what: 'Look at your stats vs population averages. Identify outliers in your frequencies.',
    questions: 'Am I c-betting too much? Folding to 3-bets too often? Missing value on rivers?',
    tool: 'Check: VPIP, PFR, 3-Bet%, Fold to 3-Bet, C-Bet%, WTSD, W$SD, AF.',
    time: '5-10 minutes' },
  { step: '3. Tough Spots Analysis', icon: '', color: '#3b82f6',
    what: 'Review 3-5 hands where you felt uncertain. These are your biggest learning opportunities.',
    questions: 'What was my thought process? Was there a better line? What range did villain likely have?',
    tool: 'Use a solver (GTO Wizard, PioSolver) to check your close decisions.',
    time: '15-20 minutes' },
  { step: '4. Emotional Assessment', icon: '', color: '#f59e0b',
    what: 'Evaluate your mental state during the session. Were there tilt moments?',
    questions: 'Did I play differently after bad beats? Was I making revenge calls? Did I lose focus?',
    tool: 'Keep a simple emotional journal. Rate your tilt level 1-10 for each session.',
    time: '5 minutes' },
  { step: '5. Action Items', icon: '✓', color: '#8b5cf6',
    what: 'Create 1-3 specific, actionable improvement goals based on your review.',
    questions: 'What\'s the ONE thing I can improve next session? Is it a preflop range issue or postflop?',
    tool: 'Write down your focus areas. Review them before your next session.',
    time: '5 minutes' },
];

export default function SessionReviewTool() {
  const [stepIdx, setStepIdx] = useState(0);
  const step = REVIEW_STEPS[stepIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #22c55e, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
         Session Review Tool
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Structured post-session review for maximum improvement.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {REVIEW_STEPS.map((s, i) => (
          <button key={i} onClick={() => setStepIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: stepIdx === i ? `2px solid ${s.color}` : '1px solid rgba(255,255,255,0.06)',
              background: stepIdx === i ? `${s.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{s.icon}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: stepIdx === i ? s.color : '#64748b' }}>Step {i + 1}</div>
          </button>
        ))}
      </div>

      <motion.div key={stepIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 24 }}>{step.icon}</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: step.color }}>{step.step}</span>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '3px 10px' }}>
            <span style={{ fontSize: 10, color: '#94a3b8' }}>{step.time}</span>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: `${step.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${step.color}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: step.color }}>What to Do</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{step.what}</div>
          </div>
          <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>Key Questions</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{step.questions}</div>
          </div>
          <div style={{ background: 'rgba(59,130,246,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #3b82f6' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6' }}>Recommended Tool</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{step.tool}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

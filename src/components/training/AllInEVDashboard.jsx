/**
 * AllInEVDashboard — All-In Expected Value Dashboard
 * Track your all-in EV to separate skill from luck
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const AIEV_CONCEPTS = [
  { concept: 'What is All-In EV?', icon: '■', color: '#3b82f6',
    detail: 'All-In EV shows what you SHOULD have won based on equity at the time of the all-in. If you\'re 80% to win a $100 pot, your EV is $80 — regardless of the actual outcome.',
    example: 'You get it in with AA vs KK (80/20). You win $0 when they hit a K. But your All-In EV is +$80. Over time, results converge to EV.',
    tip: 'Track All-In EV in your poker tracker. The gap between actual results and EV = your "luck" factor.' },
  { concept: 'Running Above EV', icon: '▲', color: '#22c55e',
    detail: 'When your actual winnings exceed your All-In EV, you\'re running hot. This is unsustainable and will correct over time.',
    example: 'You\'re up $5,000 but your All-In EV shows +$3,200. You\'re running $1,800 above expectation.',
    tip: 'Don\'t assume you\'re better than you are. Running hot masks leaks. Keep studying.' },
  { concept: 'Running Below EV', icon: '▼', color: '#ef4444',
    detail: 'When actual results are below All-In EV, you\'re running cold. This is the most tilting experience in poker.',
    example: 'You\'re down $2,000 but EV shows -$500. You\'ve been unlucky for $1,500. It WILL even out.',
    tip: 'Focus on decisions, not results. If your EV line is positive, you\'re playing well.' },
  { concept: 'EV Graph Reading', icon: '▲', color: '#f59e0b',
    detail: 'The EV line is your "true" winrate stripped of variance. A rising EV line means you\'re making good decisions even when results are bad.',
    example: 'Red line (actual) is choppy. Green line (EV) steadily climbs. You\'re a winning player running normally.',
    tip: 'Over 50,000+ hands, actual results should closely track EV. Shorter samples = more variance.' },
  { concept: 'Non-All-In Decisions', icon: '◇', color: '#8b5cf6',
    detail: 'All-In EV only measures all-in spots. Your non-all-in play (postflop decisions, fold equity, thin value) is where most edge comes from.',
    example: 'Two players with identical All-In EV can have vastly different winrates based on non-showdown winnings.',
    tip: 'All-In EV is just one piece. W$SD (Won $ at Showdown) and WWSF (Won When Saw Flop) matter too.' },
];

export default function AllInEVDashboard() {
  const [conceptIdx, setConceptIdx] = useState(0);
  const concept = AIEV_CONCEPTS[conceptIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #3b82f6, #22c55e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        All-In EV Dashboard
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Separate skill from luck. Track your true winrate.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {AIEV_CONCEPTS.map((c, i) => (
          <button key={i} onClick={() => setConceptIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: conceptIdx === i ? `2px solid ${c.color}` : '1px solid rgba(255,255,255,0.06)',
              background: conceptIdx === i ? `${c.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{c.icon}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: conceptIdx === i ? c.color : '#64748b' }}>{c.concept.substring(0, 10)}</div>
          </button>
        ))}
      </div>

      <motion.div key={conceptIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 24 }}>{concept.icon}</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: concept.color }}>{concept.concept}</span>
        </div>

        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 12 }}>{concept.detail}</p>

        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: `${concept.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${concept.color}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: concept.color }}>Example</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{concept.example}</div>
          </div>
          <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>Pro Tip</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{concept.tip}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

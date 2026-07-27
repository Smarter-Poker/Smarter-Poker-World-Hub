/**
 * ProgressDashboard — Training Progress Tracker
 * Track your poker study and improvement journey
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const PROGRESS_AREAS = [
  { area: 'Preflop Fundamentals', icon: '◇', color: '#22c55e',
    skills: ['Open-raise ranges by position', '3-bet/4-bet ranges', 'Blind defense frequencies', 'Squeeze play spots'],
    metrics: 'VPIP: 22-28% | PFR: 18-24% | 3-Bet: 7-10%',
    checkpoints: '[ ] Can recite UTG range from memory | [ ] Know 3-bet ranges vs each position | [ ] Understand SB 3-bet or fold',
    mastery: 'When you auto-pilot correct preflop decisions without thinking, you\'ve mastered this.' },
  { area: 'Postflop Play', icon: '◆', color: '#3b82f6',
    skills: ['C-bet frequency by texture', 'Check-raise construction', 'Multi-street planning', 'River decision-making'],
    metrics: 'C-Bet: 55-65% IP | Turn Barrel: 45-55% | River Bet: 35-45%',
    checkpoints: '[ ] Can identify wet vs dry boards | [ ] Plan all three streets before acting | [ ] Comfortable with check-raises',
    mastery: 'When you can articulate your range on every street and your opponent\'s range too.' },
  { area: 'Hand Reading', icon: '○', color: '#f59e0b',
    skills: ['Range narrowing per street', 'Combo counting on boards', 'Blocker awareness', 'Behavioral tells (live)'],
    metrics: 'Accuracy improves with volume — track your predictions vs actual holdings.',
    checkpoints: '[ ] Can count combos quickly | [ ] Understand how board texture filters ranges | [ ] Use blockers in bluff decisions',
    mastery: 'When you regularly predict villain\'s holding within a 5-combo range on the river.' },
  { area: 'Mental Game', icon: '◇', color: '#8b5cf6',
    skills: ['Tilt recognition and control', 'Session management', 'Emotional regulation', 'Focus and attention span'],
    metrics: 'Tilt sessions per month < 2 | Average session rating > 7/10',
    checkpoints: '[ ] Can identify when tilting | [ ] Have a stop-loss rule | [ ] Meditate or warm up before sessions',
    mastery: 'When bad beats don\'t change your play quality for more than one hand.' },
  { area: 'GTO Understanding', icon: '■', color: '#ef4444',
    skills: ['Solver output interpretation', 'Frequency understanding', 'Node locking', 'Equilibrium concepts'],
    metrics: 'Can explain why solver prefers action X in most common spots.',
    checkpoints: '[ ] Can use GTO Wizard/Pio | [ ] Understand mixed strategies | [ ] Know when to deviate from GTO',
    mastery: 'When you can look at a spot and predict solver output before running the sim.' },
];

export default function ProgressDashboard() {
  const [areaIdx, setAreaIdx] = useState(0);
  const area = PROGRESS_AREAS[areaIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #3b82f6, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Progress Dashboard
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Track your poker skills across all areas.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {PROGRESS_AREAS.map((a, i) => (
          <button key={i} onClick={() => setAreaIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: areaIdx === i ? `2px solid ${a.color}` : '1px solid rgba(255,255,255,0.06)',
              background: areaIdx === i ? `${a.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{a.icon}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: areaIdx === i ? a.color : '#64748b' }}>{a.area.substring(0, 10)}</div>
          </button>
        ))}
      </div>

      <motion.div key={areaIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 24 }}>{area.icon}</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: area.color }}>{area.area}</span>
        </div>
        <div style={{ background: `${area.color}08`, borderRadius: 8, padding: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: area.color, marginBottom: 4 }}>Skills to Develop</div>
          {area.skills.map((s, i) => (
            <div key={i} style={{ fontSize: 12, color: '#94a3b8', padding: '2px 0' }}>• {s}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(59,130,246,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #3b82f6' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6' }}>Key Metrics</div>
            <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>{area.metrics}</div>
          </div>
          <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>Checkpoints</div>
            <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{area.checkpoints}</div>
          </div>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>Mastery Signal</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{area.mastery}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * StudyPlanCreator — Poker Study Plan Builder
 * Structured study plans by skill level
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const STUDY_PLANS = [
  { level: 'Beginner (NL2-NL10)', icon: '◇', color: '#22c55e',
    weeklyHours: '5-8 hours',
    focus: ['Preflop ranges — memorize open/3-bet/defend charts', 'Position awareness — track win rate by position', 'Basic pot odds — call/fold decisions', 'C-bet fundamentals — when and how much to bet'],
    ratio: '60% play : 40% study',
    milestone: 'Profitable at NL10 over 50K hands' },
  { level: 'Low Stakes (NL25-NL50)', icon: '▲', color: '#3b82f6',
    weeklyHours: '8-12 hours',
    focus: ['Postflop hand reading — narrowing ranges street by street', 'Bet sizing theory — geometric sizing, pot geometry', 'Turn and river play — barreling and river decisions', 'Exploitative adjustments vs regular opponents'],
    ratio: '55% play : 45% study',
    milestone: 'Positive winrate at NL50 over 100K hands' },
  { level: 'Mid Stakes (NL100-NL200)', icon: '▲', color: '#f59e0b',
    weeklyHours: '10-15 hours',
    focus: ['GTO solver work — study key spots in PioSolver/GTO Wizard', 'Range construction — build balanced betting and checking ranges', 'Multi-street planning — plan all streets before acting', 'Database review — filter and analyze specific spot types'],
    ratio: '50% play : 50% study',
    milestone: 'Sustain positive winrate at NL200 over 200K hands' },
  { level: 'High Stakes (NL500+)', icon: '◆', color: '#8b5cf6',
    weeklyHours: '12-20 hours',
    focus: ['Deep solver analysis — run custom sims for complex spots', 'Mixed strategy implementation — practice randomization', 'Advanced exploitation — dynamic opponent modeling', 'Mental game mastery — peak performance psychology'],
    ratio: '45% play : 55% study',
    milestone: 'Consistent winner at NL500+ with positive All-In EV' },
  { level: 'Tournament Specialist', icon: '★', color: '#ef4444',
    weeklyHours: '10-15 hours',
    focus: ['ICM study — final table and bubble decisions', 'Push/fold mastery — short stack play optimization', 'Multi-table strategy — volume and attention management', 'Satellite and SNG theory — unique tournament formats'],
    ratio: '60% play : 40% study',
    milestone: 'Positive ROI over 500+ tournament sample' },
];

export default function StudyPlanCreator() {
  const [planIdx, setPlanIdx] = useState(0);
  const plan = STUDY_PLANS[planIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #22c55e, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Study Plan Creator
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Structured study plans by skill level.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {STUDY_PLANS.map((p, i) => (
          <button key={i} onClick={() => setPlanIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: planIdx === i ? `2px solid ${p.color}` : '1px solid rgba(255,255,255,0.06)',
              background: planIdx === i ? `${p.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{p.icon}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: planIdx === i ? p.color : '#64748b' }}>{p.level.substring(0, 10)}</div>
          </button>
        ))}
      </div>

      <motion.div key={planIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 24 }}>{plan.icon}</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: plan.color }}>{plan.level}</span>
          </div>
          <div style={{ background: `${plan.color}20`, borderRadius: 6, padding: '3px 10px' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: plan.color }}>{plan.weeklyHours}/wk</span>
          </div>
        </div>
        <div style={{ background: `${plan.color}08`, borderRadius: 8, padding: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: plan.color, marginBottom: 4 }}>Focus Areas</div>
          {plan.focus.map((f, i) => (
            <div key={i} style={{ fontSize: 12, color: '#94a3b8', padding: '2px 0', borderBottom: i < plan.focus.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
              {i + 1}. {f}
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ background: 'rgba(59,130,246,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #3b82f6' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6' }}>Play:Study Ratio</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{plan.ratio}</div>
          </div>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>Milestone</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{plan.milestone}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

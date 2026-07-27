/**
 * MultiTableStrategy — Multi-Tabling Optimization
 * How to play multiple tables effectively without quality loss
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const TABLE_TIERS = [
  { tables: '1-2', label: 'Beginner', color: '#22c55e', icon: '◇',
    focus: 'Maximum attention per hand. Study every spot. Take notes.',
    advice: 'Perfect for learning. Focus on decision quality over volume. Review every session.',
    hourlyBB: '8-12 bb/100', volume: 'Low' },
  { tables: '3-4', label: 'Standard', color: '#3b82f6', icon: '■',
    focus: 'Good balance of quality and volume. Most profitable for many players.',
    advice: 'Use HUD stats. Pre-program bet sizes. Have opening ranges memorized.',
    hourlyBB: '5-8 bb/100', volume: 'Medium' },
  { tables: '6-8', label: 'Grinder', color: '#f59e0b', icon: '⌁',
    focus: 'Volume-focused. ABC strategy with exploitative adjustments.',
    advice: 'Simplify decisions. Use preset actions. Accept some EV loss per table for total hourly rate.',
    hourlyBB: '3-5 bb/100', volume: 'High' },
  { tables: '10+', label: 'Mass Multi', color: '#ef4444', icon: '▲',
    focus: 'Pure volume play. Robotic, solver-based strategy.',
    advice: 'Only for experts. Requires perfect fundamentals and fast decision-making. Rake back matters.',
    hourlyBB: '1-3 bb/100', volume: 'Very High' },
];

const TIPS = [
  'Use a tiling layout — never overlap tables',
  'Color-code table positions (hero seat always same spot)',
  'Hotkey bet sizes: 33%, 50%, 66%, 75%, pot',
  'Timer: if you need more than 15s, you\'re playing too many tables',
  'Start sessions with fewer tables, add as you warm up',
  'Close tables when tilted rather than playing badly at all of them',
];

export default function MultiTableStrategy() {
  const [tierIdx, setTierIdx] = useState(1);
  const tier = TABLE_TIERS[tierIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #f59e0b, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        ■ Multi-Table Strategy
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Find your optimal table count for maximum hourly profit.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16 }}>
        {TABLE_TIERS.map((t, i) => (
          <button key={i} onClick={() => setTierIdx(i)}
            style={{ padding: '10px 6px', borderRadius: 10, border: tierIdx === i ? `2px solid ${t.color}` : '1px solid rgba(255,255,255,0.06)',
              background: tierIdx === i ? `${t.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 20 }}>{t.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: t.color }}>{t.tables}</div>
            <div style={{ fontSize: 9, color: '#64748b' }}>{t.label}</div>
          </button>
        ))}
      </div>

      <motion.div key={tierIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: `${tier.color}08`, border: `1px solid ${tier.color}25`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>Win Rate</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: tier.color }}>{tier.hourlyBB}</div>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>Volume</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: tier.color }}>{tier.volume}</div>
          </div>
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 8 }}>{tier.focus}</p>
        <div style={{ background: `${tier.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${tier.color}` }}>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{tier.advice}</div>
        </div>
      </motion.div>

      <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', marginBottom: 6 }}>Multi-Tabling Tips</div>
        {TIPS.map((t, i) => (
          <div key={i} style={{ fontSize: 12, color: '#94a3b8', padding: '3px 0', display: 'flex', gap: 6 }}>
            <span style={{ color: '#f59e0b' }}>{i + 1}.</span> {t}
          </div>
        ))}
      </div>
    </div>
  );
}

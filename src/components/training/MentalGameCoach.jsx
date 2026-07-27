/**
 * MentalGameCoach — Poker Mental Game Framework
 * Mindset tools for tilt control, focus, and peak performance
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const MODULES = [
  { title: 'Tilt Recognition', icon: '○', color: '#ef4444',
    content: [
      { q: 'Am I playing to win or playing to get even?', flag: 'Revenge tilt — stop playing to recover losses' },
      { q: 'Am I calling lighter than usual?', flag: 'Frustration tilt — tightening up is the fix' },
      { q: 'Am I opening too wide because I\'m bored?', flag: 'Boredom tilt — take a break or switch stakes' },
      { q: 'Did a bad beat change my mood?', flag: 'Injustice tilt — remember: variance is math, not personal' },
    ]},
  { title: 'Focus Protocol', icon: '◆', color: '#3b82f6',
    content: [
      { q: 'Pre-session: Set specific goals', flag: 'e.g., "Focus on 3-bet sizing" not "Win money"' },
      { q: 'Every 30 min: Check your mental state', flag: 'Rate focus 1-10. Below 6? Take a 5-min break.' },
      { q: 'After each big pot: Breathe', flag: '3 deep breaths. Win or lose, reset before the next hand.' },
      { q: 'Post-session: Review 5 hands', flag: 'Focus on decisions, not results. Process over outcome.' },
    ]},
  { title: 'Bankroll Mindset', icon: '●', color: '#22c55e',
    content: [
      { q: 'Am I playing at the right stakes?', flag: 'You need 30+ buy-ins for cash, 100+ for MTTs' },
      { q: 'Does losing a buy-in change my play?', flag: 'If yes, you\'re playing too high. Move down.' },
      { q: 'Am I chasing losses by moving up?', flag: 'NEVER move up to recover. Move DOWN to rebuild.' },
      { q: 'Do I separate poker money from life money?', flag: 'Dedicated bankroll = better decisions at the table' },
    ]},
  { title: 'Peak Performance', icon: '⌁', color: '#f59e0b',
    content: [
      { q: 'Sleep: 7-8 hours before big sessions', flag: 'Tired brains make -EV decisions. Non-negotiable.' },
      { q: 'Exercise: Move your body daily', flag: 'Physical health → mental clarity → better poker' },
      { q: 'Nutrition: Eat before you play', flag: 'Low blood sugar = tilt city. Snack on protein, not sugar.' },
      { q: 'Environment: Minimize distractions', flag: 'Close social media. Mute phone. Poker only.' },
    ]},
];

export default function MentalGameCoach() {
  const [moduleIdx, setModuleIdx] = useState(0);
  const [checkedItems, setCheckedItems] = useState({});
  const mod = MODULES[moduleIdx];

  const toggleCheck = (key) => {
    setCheckedItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #f59e0b, #22c55e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Mental Game Coach
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Your edge isn't just strategy — it's your mental game.</p>

      {/* Module selector */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16 }}>
        {MODULES.map((m, i) => (
          <button key={i} onClick={() => setModuleIdx(i)}
            style={{ padding: '10px 6px', borderRadius: 10, border: moduleIdx === i ? `2px solid ${m.color}` : '1px solid rgba(255,255,255,0.06)',
              background: moduleIdx === i ? `${m.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 20 }}>{m.icon}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: moduleIdx === i ? m.color : '#64748b' }}>{m.title}</div>
          </button>
        ))}
      </div>

      {/* Module content */}
      <motion.div key={moduleIdx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{ display: 'grid', gap: 8 }}>
        {mod.content.map((item, i) => {
          const key = `${moduleIdx}-${i}`;
          const checked = checkedItems[key];
          return (
            <div key={i} onClick={() => toggleCheck(key)}
              style={{ background: checked ? `${mod.color}10` : 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 12, cursor: 'pointer',
                border: checked ? `1px solid ${mod.color}30` : '1px solid transparent', transition: 'all 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${checked ? mod.color : '#475569'}`,
                  background: checked ? mod.color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, marginTop: 1 }}>
                  {checked && <span style={{ color: '#fff', fontSize: 12 }}>✓</span>}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 2, textDecoration: checked ? 'line-through' : 'none' }}>
                    {item.q}
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>{item.flag}</div>
                </div>
              </div>
            </div>
          );
        })}
      </motion.div>

      {/* Quick reminder */}
      <div style={{ marginTop: 16, background: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(34,197,94,0.08))', borderRadius: 10, padding: 12, textAlign: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#f59e0b', marginBottom: 4 }}>Remember</div>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>The best poker players in the world aren't the smartest — they're the most disciplined.</div>
      </div>
    </div>
  );
}

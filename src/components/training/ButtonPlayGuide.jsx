/**
 * ButtonPlayGuide — Button Position Mastery
 * The most profitable seat at the table — maximize it
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const BTN_SECTIONS = [
  { title: 'Open Range', color: '#22c55e', icon: '●',
    desc: 'BTN should open 40-50% of hands. You have guaranteed position postflop.',
    hands: '22+, A2s+, K2s+, Q2s+, J4s+, T6s+, 96s+, 85s+, 75s+, 64s+, 54s, A2o+, K5o+, Q8o+, J9o+, T9o',
    sizing: 'Open to 2-2.5x. Smaller sizing because fewer players to act behind you.' },
  { title: 'vs 3-Bet from Blinds', color: '#ef4444', icon: '■',
    desc: 'Blinds will 3-bet you frequently. Have a solid defense strategy.',
    hands: '4-bet: AA-QQ, AKs | Call: TT-JJ, AQs, AJs, KQs, 99, 88, suited connectors',
    sizing: '4-bet to 2.5x their 3-bet. In position, flatting is very profitable.' },
  { title: 'Stealing Blinds', color: '#f59e0b', icon: '□‍▼',
    desc: 'Every steal attempt wins you ~1.5 BB. Even folding 60% of the time is hugely profitable.',
    hands: 'Open any two cards if blinds are tight. Standard: top 45-50% of hands.',
    sizing: 'Min-raise or 2.2x. Small sizing keeps risk low while maintaining fold equity.' },
  { title: 'Postflop IP Edge', color: '#8b5cf6', icon: '◇',
    desc: 'Position is the biggest edge in poker. Use it ruthlessly from the BTN.',
    hands: 'Float light, stab at checked pots, control pot size with medium hands.',
    sizing: 'C-bet 60%+ of flops. Use delayed c-bets on turn. Exploit information from acting last.' },
];

export default function ButtonPlayGuide() {
  const [sectionIdx, setSectionIdx] = useState(0);
  const section = BTN_SECTIONS[sectionIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #22c55e, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Button Play Guide
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>The BTN prints money — here's how to maximize every orbit.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16 }}>
        {BTN_SECTIONS.map((s, i) => (
          <button key={i} onClick={() => setSectionIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: sectionIdx === i ? `2px solid ${s.color}` : '1px solid rgba(255,255,255,0.06)',
              background: sectionIdx === i ? `${s.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 16 }}>{s.icon}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: sectionIdx === i ? s.color : '#64748b' }}>{s.title}</div>
          </button>
        ))}
      </div>

      <motion.div key={sectionIdx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 28 }}>{section.icon}</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: section.color }}>{section.title}</span>
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 12 }}>{section.desc}</p>

        <div style={{ background: `${section.color}08`, borderRadius: 8, padding: 10, marginBottom: 8, borderLeft: `3px solid ${section.color}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: section.color }}>HANDS</div>
          <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>{section.hands}</div>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>SIZING</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{section.sizing}</div>
        </div>
      </motion.div>

      {/* Win rate by position */}
      <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 10, padding: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#22c55e', marginBottom: 8 }}>Expected Win Rate by Position</div>
        {[
          { pos: 'BTN', rate: '+25 bb/100', width: '100%', color: '#22c55e' },
          { pos: 'CO', rate: '+15 bb/100', width: '60%', color: '#3b82f6' },
          { pos: 'HJ', rate: '+5 bb/100', width: '30%', color: '#f59e0b' },
          { pos: 'UTG', rate: '-5 bb/100', width: '10%', color: '#ef4444' },
          { pos: 'BB', rate: '-35 bb/100', width: '0%', color: '#ef4444' },
        ].map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', minWidth: 30 }}>{p.pos}</span>
            <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4 }}>
              <div style={{ height: '100%', width: p.width, background: p.color, borderRadius: 4 }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: p.color, minWidth: 70, textAlign: 'right' }}>{p.rate}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

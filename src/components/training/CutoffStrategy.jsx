/**
 * CutoffStrategy — Cutoff Position Mastery
 * Complete guide to playing from the CO position
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const SECTIONS = [
  { title: 'Opening Range', icon: '■', color: '#3b82f6',
    content: 'CO should open ~28-32% of hands. This includes all pairs, suited broadways, suited connectors (54s+), offsuit broadways (KTo+, QJo), suited aces.',
    range: { open: '22+, A2s+, K2s+, Q6s+, J7s+, T7s+, 97s+, 87s, 76s, 65s, ATo+, KJo+, QJo' } },
  { title: 'Facing 3-Bets', icon: '■', color: '#ef4444',
    content: 'When 3-bet from BTN/blinds, 4-bet with QQ+/AKs for value. Call with TT-JJ, AQs, suited connectors with position. Fold the bottom of your range.',
    range: { '4bet': 'QQ+, AKs', call: 'TT-JJ, AQs, AJs, KQs, 98s-JTs', fold: 'Weak Ax, low SCs, offsuit trash' } },
  { title: 'vs BTN 3-Bet', icon: 'VS', color: '#f59e0b',
    content: 'BTN 3-bets wider than blinds. Defend more hands. Add some 4-bet bluffs (A5s, A4s). Call wider with hands that play well postflop.',
    range: { defend: 'All value hands + TT, 99, AQo, AJs, KQs, some SCs' } },
  { title: 'Postflop IP', icon: '◆', color: '#22c55e',
    content: 'CO has position over UTG/HJ/blinds but not BTN. Play aggressively when heads-up. C-bet 55-65% of flops. Barrel turns with equity.',
    range: { cbet: '55-65% of flops, small sizing on dry, larger on wet' } },
];

export default function CutoffStrategy() {
  const [sectionIdx, setSectionIdx] = useState(0);
  const section = SECTIONS[sectionIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #3b82f6, #6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Cutoff Strategy Guide
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>The CO is the second-most profitable seat — master it.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16 }}>
        {SECTIONS.map((s, i) => (
          <button key={i} onClick={() => setSectionIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: sectionIdx === i ? `2px solid ${s.color}` : '1px solid rgba(255,255,255,0.06)',
              background: sectionIdx === i ? `${s.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 16 }}>{s.icon}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: sectionIdx === i ? s.color : '#64748b' }}>{s.title}</div>
          </button>
        ))}
      </div>

      <motion.div key={sectionIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 24 }}>{section.icon}</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: section.color }}>{section.title}</span>
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 12 }}>{section.content}</p>

        {Object.entries(section.range || {}).map(([key, val]) => (
          <div key={key} style={{ background: `${section.color}08`, borderRadius: 8, padding: 10, marginBottom: 6, borderLeft: `3px solid ${section.color}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: section.color, textTransform: 'uppercase' }}>{key}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>{val}</div>
          </div>
        ))}
      </motion.div>

      <div style={{ background: 'rgba(59,130,246,0.06)', borderRadius: 10, padding: 12, textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#3b82f6', marginBottom: 4 }}>CO vs Other Positions</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, fontSize: 11 }}>
          <div><span style={{ color: '#64748b' }}>vs UTG open</span><br/><span style={{ fontWeight: 700, color: '#ef4444' }}>Tight 3-bet</span></div>
          <div><span style={{ color: '#64748b' }}>vs HJ open</span><br/><span style={{ fontWeight: 700, color: '#f59e0b' }}>Mixed</span></div>
          <div><span style={{ color: '#64748b' }}>Steal blinds</span><br/><span style={{ fontWeight: 700, color: '#22c55e' }}>Open wide</span></div>
        </div>
      </div>
    </div>
  );
}

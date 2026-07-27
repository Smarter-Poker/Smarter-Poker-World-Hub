/**
 * UTGRangeGuide — Under the Gun Strategy
 * Tight is right from UTG — master the tightest opening range
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const FORMATS = [
  { name: '6-Max Cash', open: '~17%', color: '#3b82f6',
    hands: [
      { tier: 'Always Open', cards: 'AA-77, AKo-AJo, AKs-ATs, KQs, KJs, QJs, JTs', color: '#22c55e' },
      { tier: 'Mixed/Optional', cards: '66, ATo, KQo, KTs, QTs, T9s, 98s, 87s', color: '#f59e0b' },
      { tier: 'Never Open', cards: 'Low suited connectors, weak offsuit broadways, random suited', color: '#ef4444' },
    ],
    tips: ['Sizing: 2.5-3x (slightly larger from early position)', 'Expect to get 3-bet ~12-15% of the time', 'Fold to 3-bets with the bottom of your range'] },
  { name: '9-Max Cash', open: '~12%', color: '#8b5cf6',
    hands: [
      { tier: 'Always Open', cards: 'AA-88, AKo-AQo, AKs-AJs, KQs', color: '#22c55e' },
      { tier: 'Mixed/Optional', cards: '77, AJo, KJs, QJs, JTs, ATs', color: '#f59e0b' },
      { tier: 'Never Open', cards: 'Anything else — too many players behind', color: '#ef4444' },
    ],
    tips: ['Much tighter range — 5 players left to act behind', 'Size to 3x. Bigger sizing to thin the field.', '4-bet only with AA, KK, AKs vs 3-bets'] },
  { name: 'MTT 40 BB', open: '~15%', color: '#22c55e',
    hands: [
      { tier: 'Always Open', cards: 'AA-88, AKo, AQo, AKs-ATs, KQs, KJs, QJs', color: '#22c55e' },
      { tier: 'Mixed/Optional', cards: '77-66, AJo, KQo, JTs, T9s', color: '#f59e0b' },
      { tier: 'Never Open', cards: 'Weak suited, offsuit connectors', color: '#ef4444' },
    ],
    tips: ['Open to 2.2x with antes', 'ICM may tighten you further near bubble', 'Consider stack sizes of 3-bettors behind'] },
];

export default function UTGRangeGuide() {
  const [formatIdx, setFormatIdx] = useState(0);
  const format = FORMATS[formatIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #ef4444, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        ▲ UTG Range Guide
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Tight is right — the tightest position demands discipline.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 16 }}>
        {FORMATS.map((f, i) => (
          <button key={i} onClick={() => setFormatIdx(i)}
            style={{ padding: '10px 8px', borderRadius: 8, border: formatIdx === i ? `2px solid ${f.color}` : '1px solid rgba(255,255,255,0.06)',
              background: formatIdx === i ? `${f.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: formatIdx === i ? f.color : '#64748b' }}>{f.name}</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Open: {f.open}</div>
          </button>
        ))}
      </div>

      <motion.div key={formatIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        {format.hands.map((tier, i) => (
          <div key={i} style={{ background: `${tier.color}08`, borderLeft: `3px solid ${tier.color}`, borderRadius: 8, padding: 10, marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: tier.color }}>{tier.tier}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>{tier.cards}</div>
          </div>
        ))}

        <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 12, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: format.color, marginBottom: 6 }}>Tips for {format.name}</div>
          {format.tips.map((t, i) => (
            <div key={i} style={{ fontSize: 12, color: '#94a3b8', padding: '2px 0', display: 'flex', gap: 6 }}>
              <span style={{ color: format.color }}>•</span> {t}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

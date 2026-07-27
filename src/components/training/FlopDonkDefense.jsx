/**
 * FlopDonkDefense — Defending vs Donk Bets
 * How to respond when OOP opponent leads into you
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const DONK_TYPES = [
  { type: 'Small Donk (25-33%)', color: '#22c55e', icon: '●',
    meaning: 'Usually a weak hand trying to "see where they\'re at" or a weak draw.',
    response: [
      { action: 'Raise 3x', hands: 'Strong hands (sets, two pair) — punish the small bet' },
      { action: 'Call', hands: 'Medium hands (top pair, decent draws) — keep their range wide' },
      { action: 'Fold', hands: 'Air with no equity — not worth continuing even at a good price' },
    ]},
  { type: 'Medium Donk (50-66%)', color: '#f59e0b', icon: '●',
    meaning: 'More polarized. Could be a strong hand trying to build the pot or a draw wanting to set their own price.',
    response: [
      { action: 'Raise 2.5x', hands: 'Nutted hands — they\'ve built the pot for you' },
      { action: 'Call', hands: 'Strong top pair+ — evaluate turn' },
      { action: 'Fold', hands: 'Weak draws and air — they\'re not giving you a good price' },
    ]},
  { type: 'Large Donk (75-100%)', color: '#ef4444', icon: '●',
    meaning: 'Very polarized. Either the nuts or a big draw. Recreational players often overbet with vulnerable strong hands.',
    response: [
      { action: 'Raise all-in', hands: 'If they\'re fish with strong hands, jam sets+ for max value' },
      { action: 'Call', hands: 'Top pair in position — re-evaluate turn, they may shut down' },
      { action: 'Fold', hands: 'Medium/weak hands — respect the sizing from most players' },
    ]},
  { type: 'Min Donk', color: '#8b5cf6', icon: '●',
    meaning: 'Almost always a weak player "blocking" to see cheap cards. This is a terrible play by them.',
    response: [
      { action: 'Raise 4-5x', hands: 'Almost anything — punish this sizing mercilessly' },
      { action: 'Call (rarely)', hands: 'Only if you want to trap with a monster' },
      { action: 'Never fold', hands: 'The price is too good to fold anything' },
    ]},
];

export default function FlopDonkDefense() {
  const [typeIdx, setTypeIdx] = useState(0);
  const donk = DONK_TYPES[typeIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #f59e0b, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        ■ Donk Bet Defense
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>When they lead into you — don't panic, exploit their sizing.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16 }}>
        {DONK_TYPES.map((d, i) => (
          <button key={i} onClick={() => setTypeIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: typeIdx === i ? `2px solid ${d.color}` : '1px solid rgba(255,255,255,0.06)',
              background: typeIdx === i ? `${d.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 18 }}>{d.icon}</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: typeIdx === i ? d.color : '#64748b' }}>{d.type}</div>
          </button>
        ))}
      </div>

      <motion.div key={typeIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div style={{ background: `${donk.color}08`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: donk.color, marginBottom: 4 }}>What It Usually Means</div>
          <div style={{ fontSize: 13, color: '#cbd5e1' }}>{donk.meaning}</div>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          {donk.response.map((r, i) => {
            const actionColor = r.action.includes('Raise') || r.action.includes('all-in') ? '#22c55e' : r.action.includes('Call') ? '#f59e0b' : '#ef4444';
            return (
              <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 12, borderLeft: `3px solid ${actionColor}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: actionColor, marginBottom: 2 }}>{r.action}</div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>{r.hands}</div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}

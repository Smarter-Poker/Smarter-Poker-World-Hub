/**
 * SingleRaisedPotGuide — Playing Single-Raised Pots (SRP)
 * The most common pot type — master the fundamentals
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const SRP_SPOTS = [
  { title: 'IP as PFR', icon: '◆', color: '#22c55e',
    situations: [
      { board: 'Dry (K72r)', cbet: '70-80%', size: '25-33%', note: 'Range bet small. You have massive range advantage.' },
      { board: 'Wet (JT8ss)', cbet: '40-50%', size: '55-75%', note: 'Selective + larger. Need to charge draws.' },
      { board: 'Paired (QQ4)', cbet: '75-85%', size: '25-33%', note: 'Paired = your advantage. Bet small, bet often.' },
      { board: 'Ace-high (A95)', cbet: '65-75%', size: '33%', note: 'A-high favors PFR. Small c-bet prints money.' },
    ]},
  { title: 'OOP as PFR', icon: '■', color: '#3b82f6',
    situations: [
      { board: 'Dry (K83r)', cbet: '50-60%', size: '33-50%', note: 'Still bet often on dry boards but slightly less than IP.' },
      { board: 'Wet (T9x)', cbet: '30-40%', size: '66-75%', note: 'Check more OOP on wet boards. Caller has advantage.' },
      { board: 'Low (762)', cbet: '35-45%', size: '50%', note: 'Low boards connect with caller\'s range. Check with air more.' },
      { board: 'Monotone (K♠8♠3♠)', cbet: '25-35%', size: '33%', note: 'Very dangerous. Only bet with flush draws or strong hands.' },
    ]},
  { title: 'IP as Caller', icon: '○', color: '#f59e0b',
    situations: [
      { board: 'Vs C-bet', cbet: 'Call 55-65%', size: 'Raise 10%', note: 'Call with any piece. Raise sets, two pair, strong draws.' },
      { board: 'Vs Check', cbet: 'Bet 45-55%', size: '55-66%', note: 'When PFR checks, stab with a wide range.' },
      { board: 'Turn barrel', cbet: 'Call 40-50%', size: 'Raise 5-8%', note: 'Tighten up on turn. Only continue with strong hands.' },
      { board: 'River decision', cbet: 'Call 30-40%', size: 'Bluff-raise 5%', note: 'MDF-based defense. Don\'t over-fold rivers.' },
    ]},
];

export default function SingleRaisedPotGuide() {
  const [spotIdx, setSpotIdx] = useState(0);
  const spot = SRP_SPOTS[spotIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #22c55e, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Single Raised Pot Guide
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>SRPs are 70%+ of all pots. Master these and you master poker.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 16 }}>
        {SRP_SPOTS.map((s, i) => (
          <button key={i} onClick={() => setSpotIdx(i)}
            style={{ padding: '10px 6px', borderRadius: 10, border: spotIdx === i ? `2px solid ${s.color}` : '1px solid rgba(255,255,255,0.06)',
              background: spotIdx === i ? `${s.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 18 }}>{s.icon}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: spotIdx === i ? s.color : '#64748b' }}>{s.title}</div>
          </button>
        ))}
      </div>

      <motion.div key={spotIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ display: 'grid', gap: 8 }}>
        {spot.situations.map((s, i) => (
          <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 12, borderLeft: `3px solid ${spot.color}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{s.board}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: spot.color, background: `${spot.color}15`, padding: '2px 8px', borderRadius: 4 }}>{s.cbet}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '2px 8px', borderRadius: 4 }}>{s.size}</span>
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{s.note}</div>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

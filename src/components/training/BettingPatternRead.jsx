/**
 * BettingPatternRead — Reading Betting Patterns
 * Deduce hand strength from betting lines across streets
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const PATTERNS = [
  { pattern: 'Bet-Bet-Bet (Triple Barrel)', icon: '▲', color: '#ef4444',
    meaning: 'Very polarized. Either the nuts or a bluff. Almost never medium strength.',
    vsStrong: 'If they triple barrel, they want a call (value) or a fold (bluff). Decide based on blocker.',
    frequency: 'Only ~15-25% of hands warrant a triple barrel. If villain does it often, they\'re overbluffing.',
    adjust: 'Call more with bluff-catchers vs aggressive players. Fold more vs tight/passive players.' },
  { pattern: 'Bet-Check-Bet (Sandwich)', icon: '●', color: '#f59e0b',
    meaning: 'Bet flop, checked turn for pot control or deception, then bet river. Often thin value or delayed bluff.',
    vsStrong: 'Turn check caps their range somewhat. River bet is either thin value or a bluff with a missed draw.',
    frequency: 'Common line with overpairs on wet boards. Check turn for safety, value bet river when draw misses.',
    adjust: 'This line is harder to read. Weight toward thin value. Call with medium pairs.' },
  { pattern: 'Check-Bet-Bet (Slow Play Line)', icon: '·', color: '#22c55e',
    meaning: 'Checked flop (trapping or drawing), then bet turn and river. Often indicates a strong hand that slowplayed.',
    vsStrong: 'They let you catch up on the flop, then started extracting value. Respect this line.',
    frequency: 'Classic trap line. Sets, two pair, and straights love this sequence.',
    adjust: 'Be cautious when facing check-bet-bet. This line is much more weighted toward value than bluffs.' },
  { pattern: 'Bet-Bet-Check (Give Up)', icon: '□', color: '#3b82f6',
    meaning: 'Barreled flop and turn but gave up on the river. Usually a missed draw or a hand that lost confidence.',
    vsStrong: 'River check = they don\'t think they can get value or they gave up bluffing. Thin value bet the river.',
    frequency: 'Very common with missed flush/straight draws. They bluffed two streets and gave up.',
    adjust: 'Value bet thin on the river when villain checks after double-barreling. They\'re usually weak here.' },
  { pattern: 'Check-Check-Overbet (Bomb)', icon: '▲', color: '#8b5cf6',
    meaning: 'Passive on early streets, then a massive river overbet. Very polarized — monster or nothing.',
    vsStrong: 'This is the ultimate polar line. They either have the nuts or complete air. Use MDF to decide.',
    frequency: 'Rare but impactful. At low stakes, this is almost always the nuts. Fold one pair.',
    adjust: 'At high stakes, this line includes more bluffs. At low stakes, respect the overbet heavily.' },
];

export default function BettingPatternRead() {
  const [patIdx, setPatIdx] = useState(0);
  const pat = PATTERNS[patIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #ef4444, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Betting Pattern Reader
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Decode hand strength from multi-street betting lines.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {PATTERNS.map((p, i) => (
          <button key={i} onClick={() => setPatIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: patIdx === i ? `2px solid ${p.color}` : '1px solid rgba(255,255,255,0.06)',
              background: patIdx === i ? `${p.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{p.icon}</div>
            <div style={{ fontSize: 7, fontWeight: 700, color: patIdx === i ? p.color : '#64748b' }}>{p.pattern.substring(0, 10)}</div>
          </button>
        ))}
      </div>

      <motion.div key={patIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 24 }}>{pat.icon}</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: pat.color }}>{pat.pattern}</span>
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 10 }}>{pat.meaning}</p>
        <div style={{ display: 'grid', gap: 8 }}>
          {[
            { label: 'vs Strong Players', text: pat.vsStrong, color: '#3b82f6' },
            { label: 'Typical Frequency', text: pat.frequency, color: '#22c55e' },
            { label: 'Your Adjustment', text: pat.adjust, color: '#f59e0b' },
          ].map((s, i) => (
            <div key={i} style={{ background: `${s.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${s.color}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{s.label}</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>{s.text}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

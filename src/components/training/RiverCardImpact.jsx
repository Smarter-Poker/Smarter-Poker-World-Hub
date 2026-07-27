/**
 * RiverCardImpact — River Card Impact Analysis
 * How river cards change value vs bluff decisions
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const RIVER_IMPACTS = [
  { card: 'Ace on River', icon: 'A♠', color: '#ef4444',
    whoItHelps: 'Preflop raiser (has more Ax combos)',
    valueLine: 'Bet big with AA, AK, AQ. Your range is credibly strong.',
    bluffLine: 'Great bluff card if you were the PFR. Represent AK/AQ that improved.',
    trapAlert: 'If villain check-called flop+turn and now leads river ace — they likely have it.' },
  { card: 'Flush Completing River', icon: '♥♥♥', color: '#3b82f6',
    whoItHelps: 'Player with more flush draw combos in range',
    valueLine: 'Overbet with made flushes. Villain is polarized between flush and nothing.',
    bluffLine: 'If you have the blocker (A♥ without flush), bluff representing the flush.',
    trapAlert: 'Small bets on flush rivers are suspicious — often thin value, not bluffs.' },
  { card: 'Board Pairing River', icon: '8♠8♣', color: '#22c55e',
    whoItHelps: 'Player who bet flop (more sets that become full houses)',
    valueLine: 'Value bet full houses. Villain\'s flushes and straights just got devalued.',
    bluffLine: 'Excellent bluff card — represent the full house. Flushes and straights will fold.',
    trapAlert: 'If villain suddenly bets big on paired river, respect it. They have the boat.' },
  { card: 'Brick River (2♦ on K♠9♥7♣4♠)', icon: '2♦', color: '#64748b',
    whoItHelps: 'Player with the lead / range advantage from earlier streets',
    valueLine: 'Continue your story. If you barreled flop+turn, bet river for thin value.',
    bluffLine: 'Missed draws need to bluff now or give up. Choose combos with no showdown value.',
    trapAlert: 'Brick rivers = straightforward spots. Trust your read from earlier streets.' },
  { card: 'Straight Completing River', icon: '5→9', color: '#f59e0b',
    whoItHelps: 'Player in position (wider calling range on earlier streets)',
    valueLine: 'Bet for value with made straights. Size up if board is not flush-possible.',
    bluffLine: 'If you can credibly represent the straight, overbet as a bluff.',
    trapAlert: 'Multiple straight possibilities = hard to bluff. Villain might have one.' },
];

export default function RiverCardImpact() {
  const [cardIdx, setCardIdx] = useState(0);
  const card = RIVER_IMPACTS[cardIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #ef4444, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        River Card Impact
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>How each river card type changes your decision tree.</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {RIVER_IMPACTS.map((r, i) => (
          <button key={i} onClick={() => setCardIdx(i)}
            style={{ padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer',
              background: cardIdx === i ? `linear-gradient(135deg, ${r.color}, ${r.color}cc)` : 'rgba(255,255,255,0.06)',
              color: cardIdx === i ? '#fff' : '#94a3b8' }}>
            {r.icon}
          </button>
        ))}
      </div>

      <motion.div key={cardIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: card.color, marginBottom: 4 }}>{card.card}</div>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Favors: {card.whoItHelps}</div>

        <div style={{ display: 'grid', gap: 8 }}>
          {[
            { label: 'Value Line', text: card.valueLine, color: '#22c55e' },
            { label: 'Bluff Line', text: card.bluffLine, color: '#f59e0b' },
            { label: 'Trap Alert', text: card.trapAlert, color: '#ef4444' },
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

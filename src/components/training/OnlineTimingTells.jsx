/**
 * OnlineTimingTells — Online Timing Tell Guide
 * Reading bet timing patterns in online poker
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const TIMING_TELLS = [
  { tell: 'Instant Check', icon: '⌁', color: '#ef4444',
    meaning: 'Used the auto-check/fold button. Almost always means a weak hand with no intention to play.',
    exploit: 'Bet into instant-checkers with any two cards. They\'ve given up.',
    reliability: 'Very high — auto-check/fold is the strongest online tell.',
    caveat: 'Some players auto-check trap with monsters. Rare, but be aware vs tricky regs.' },
  { tell: 'Instant Call', icon: '●', color: '#3b82f6',
    meaning: 'Pre-selected the call button. Usually a draw or mediocre made hand. They don\'t want to raise.',
    exploit: 'Barrel again on the turn if their draw doesn\'t complete. They\'re chasing.',
    reliability: 'High — instant callers rarely have the nuts (they\'d raise) or total air (they\'d fold).',
    caveat: 'Some players instant-call with strong hands to disguise. Look for patterns over many hands.' },
  { tell: 'Long Tank Then Bet', icon: '○', color: '#f59e0b',
    meaning: 'Genuinely thinking about their decision. Could go either way — but often leans toward bluffing.',
    exploit: 'Long tank → bet is slightly more likely to be a bluff. They\'re deciding whether to take the risk.',
    reliability: 'Medium — many players genuinely tank with strong hands too, deciding on sizing.',
    caveat: 'At higher stakes, tanking is more balanced. At micro/low stakes, it leans bluff.' },
  { tell: 'Long Tank Then Check', icon: '·', color: '#22c55e',
    meaning: 'Thought about betting but decided not to. Usually a medium-strength hand or a missed draw.',
    exploit: 'Attack this weakness. They\'re unsure about their hand — put pressure on them.',
    reliability: 'Medium-high — the hesitation reveals they considered aggression but chickened out.',
    caveat: 'Could be a trap. Some players tank-check with the nuts to induce a bet.' },
  { tell: 'Instant Raise', icon: '▲', color: '#8b5cf6',
    meaning: 'Pre-selected raise or immediately clicked raise. Very strong hand — they knew they were raising.',
    exploit: 'Fold everything except the nuts. Instant raises are almost never bluffs at low/mid stakes.',
    reliability: 'Very high — the speed indicates confidence and a pre-planned action.',
    caveat: 'At higher stakes, good players vary their timing. This tell degrades with skill level.' },
];

export default function OnlineTimingTells() {
  const [tellIdx, setTellIdx] = useState(0);
  const tell = TIMING_TELLS[tellIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #3b82f6, #22c55e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        ○ Online Timing Tells
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Speed of action reveals hand strength online.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {TIMING_TELLS.map((t, i) => (
          <button key={i} onClick={() => setTellIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: tellIdx === i ? `2px solid ${t.color}` : '1px solid rgba(255,255,255,0.06)',
              background: tellIdx === i ? `${t.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{t.icon}</div>
            <div style={{ fontSize: 7, fontWeight: 700, color: tellIdx === i ? t.color : '#64748b' }}>{t.tell.substring(0, 10)}</div>
          </button>
        ))}
      </div>

      <motion.div key={tellIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 24 }}>{tell.icon}</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: tell.color }}>{tell.tell}</span>
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 10 }}>{tell.meaning}</p>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>Exploit</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{tell.exploit}</div>
          </div>
          <div style={{ background: `${tell.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${tell.color}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: tell.color }}>Reliability: {tell.reliability}</div>
          </div>
          <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>Caveat</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{tell.caveat}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

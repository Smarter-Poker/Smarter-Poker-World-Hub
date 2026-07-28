/**
 * CheckCallStrategy — The Art of Check-Calling
 * When checking and calling is the optimal line
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const CC_SCENARIOS = [
  { street: 'Flop', hand: 'Top pair medium kicker', board: 'K♠ 9♦ 3♣',
    why: 'Your hand has showdown value but can\'t handle a raise. Check-call keeps villain\'s bluffs in and avoids bloating the pot.',
    vs: 'Against aggressive players who bluff c-bets frequently', color: '#3b82f6' },
  { street: 'Turn', hand: 'Overpair on draw-completing board', board: 'J♥ 8♥ 5♣ 7♥',
    why: 'Flush completed. Your overpair may still be best but betting into a scary board is risky. Check-call to control pot.',
    vs: 'Against players who bet draws aggressively', color: '#f59e0b' },
  { street: 'River', hand: 'Second pair', board: 'A♠ T♦ 6♣ 2♥ 8♠',
    why: 'Second pair can beat bluffs but loses to Ax. Checking lets villain bluff with missed draws.',
    vs: 'Against players who bluff rivers at high frequency', color: '#22c55e' },
  { street: 'Flop', hand: 'Disguised monster (set)', board: 'Q♠ 8♦ 3♣',
    why: 'Check-call to trap. On dry boards, villain will keep barreling thinking you\'re weak. Let them hang themselves.',
    vs: 'Against aggressive barrelors who interpret checks as weakness', color: '#8b5cf6' },
  { street: 'Turn', hand: 'Nut flush draw', board: 'K♣ 9♣ 5♦ 2♠',
    why: 'You have 9 clean outs. Check-calling is cheaper than check-raising. If you hit the river, you can raise for value.',
    vs: 'When you\'re OOP and don\'t have fold equity for a check-raise', color: '#ec4899' },
];

const CC_RULES = [
  'You have showdown value but can\'t withstand a raise',
  'Villain is likely to bluff if you show weakness',
  'The pot is already large enough relative to your hand strength',
  'Raising would only get called by better hands',
  'You\'re trapping with a hidden monster',
];

export default function CheckCallStrategy() {
  const [spotIdx, setSpotIdx] = useState(0);
  const spot = CC_SCENARIOS[spotIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #3b82f6, #22c55e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
         Check-Call Strategy
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Sometimes the best play is simply... call.</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {CC_SCENARIOS.map((s, i) => (
          <button key={i} onClick={() => setSpotIdx(i)}
            style={{ padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: spotIdx === i ? `linear-gradient(135deg, ${s.color}, ${s.color}cc)` : 'rgba(255,255,255,0.06)',
              color: spotIdx === i ? '#fff' : '#94a3b8' }}>
            {s.street}: {s.hand.substring(0, 12)}
          </button>
        ))}
      </div>

      <motion.div key={spotIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 4, background: `${spot.color}15`, color: spot.color }}>{spot.street}</span>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: 2 }}>{spot.board}</span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>{spot.hand}</div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 8 }}>{spot.why}</p>
        <div style={{ background: `${spot.color}08`, borderRadius: 8, padding: 8, borderLeft: `3px solid ${spot.color}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: spot.color }}>Best Against</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{spot.vs}</div>
        </div>
      </motion.div>

      <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6', marginBottom: 6 }}>Check-Call When:</div>
        {CC_RULES.map((r, i) => (
          <div key={i} style={{ fontSize: 12, color: '#94a3b8', padding: '3px 0', display: 'flex', gap: 6 }}>
            <span style={{ color: '#3b82f6' }}>✓</span> {r}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * DelayedCBetGuide — Delayed Continuation Bet Strategy
 * Check flop, bet turn — the delayed c-bet
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const DELAYED_SPOTS = [
  { flop: 'T♥ 9♥ 6♣', turn: '2♠', hand: 'AA', verdict: 'DELAYED C-BET ✓',
    reason: 'Checked flop on wet board for pot control. Brick turn = safe to bet now. Villain\'s draws missed.',
    sizing: '66-75% pot', color: '#22c55e' },
  { flop: 'K♠ 7♦ 2♣', turn: 'Q♥', hand: 'AJ', verdict: 'DELAYED C-BET ✓',
    reason: 'Checked back flop with AJ (no pair). Queen on turn gives you a straight draw + two overs. Semi-bluff now.',
    sizing: '55-66% pot', color: '#22c55e' },
  { flop: 'A♣ 8♦ 3♠', turn: 'K♥', hand: 'QQ', verdict: 'CHECK AGAIN ✕',
    reason: 'Two overcards on board now. Your QQ is struggling. Checking flop was right, and nothing improved for you on turn.',
    sizing: 'N/A', color: '#ef4444' },
  { flop: 'J♣ T♠ 4♦', turn: '2♣', hand: 'AK', verdict: 'DELAYED C-BET ✓',
    reason: 'Checked flop with AK on coordinated board. Brick turn = villain\'s floating range is weak. Stab now.',
    sizing: '50-60% pot', color: '#22c55e' },
  { flop: 'Q♠ 8♠ 5♦', turn: 'A♠', hand: 'KK', verdict: 'CHECK ✕',
    reason: 'Flush completing and an ace. Two bad cards for KK. Checking is the disciplined play.',
    sizing: 'N/A', color: '#ef4444' },
];

const WHEN_TO_DELAY = [
  { when: 'Wet flop + you have showdown value', desc: 'Check flop for pot control, then bet a brick turn' },
  { when: 'You want to disguise hand strength', desc: 'Checking a strong hand on flop, then betting turn looks like delayed bluff' },
  { when: 'Flop was too dangerous to c-bet', desc: 'Connected/suited flops where villain calls wide — delay and reassess' },
  { when: 'You want to induce a float', desc: 'Some opponents auto-float flop bets. Check, let them bluff turn, then raise' },
];

export default function DelayedCBetGuide() {
  const [spotIdx, setSpotIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const spot = DELAYED_SPOTS[spotIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #8b5cf6, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        ⏱ Delayed C-Bet Guide
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Check flop, attack turn — the sneaky delayed continuation bet.</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {DELAYED_SPOTS.map((s, i) => (
          <button key={i} onClick={() => { setSpotIdx(i); setRevealed(false); }}
            style={{ padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: spotIdx === i ? 'linear-gradient(135deg, #8b5cf6, #a855f7)' : 'rgba(255,255,255,0.06)',
              color: spotIdx === i ? '#fff' : '#94a3b8' }}>
            {s.hand} on {s.flop.split(' ').slice(0,2).join('')}
          </button>
        ))}
      </div>

      <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Your Hand: <span style={{ fontWeight: 800, color: '#8b5cf6' }}>{spot.hand}</span></div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: '#64748b' }}>FLOP (checked)</div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 2, opacity: 0.7 }}>{spot.flop}</div>
          </div>
          <span style={{ fontSize: 20, color: '#64748b' }}>→</span>
          <div>
            <div style={{ fontSize: 10, color: '#f59e0b' }}>TURN</div>
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
              style={{ fontSize: 24, fontWeight: 800, color: '#f59e0b' }}>{spot.turn}</motion.div>
          </div>
        </div>

        {!revealed ? (
          <button onClick={() => setRevealed(true)}
            style={{ padding: '8px 24px', borderRadius: 8, border: 'none', fontWeight: 700, cursor: 'pointer',
              background: 'linear-gradient(135deg, #8b5cf6, #a855f7)', color: '#fff', fontSize: 14 }}>
            Bet or Check?
          </button>
        ) : (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: spot.color, marginBottom: 6 }}>{spot.verdict}</div>
            {spot.sizing !== 'N/A' && <div style={{ fontSize: 13, color: '#f59e0b', marginBottom: 6 }}>Size: {spot.sizing}</div>}
            <p style={{ fontSize: 13, color: '#cbd5e1', textAlign: 'left' }}>{spot.reason}</p>
          </motion.div>
        )}
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        {WHEN_TO_DELAY.map((w, i) => (
          <div key={i} style={{ background: 'rgba(139,92,246,0.06)', borderRadius: 8, padding: '8px 12px', borderLeft: '3px solid #8b5cf6' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#8b5cf6' }}>{w.when}</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{w.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

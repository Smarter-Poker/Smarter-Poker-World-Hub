/**
 * ReverseImpliedOdds — Reverse Implied Odds Guide
 * When making your hand actually COSTS you money
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const RIO_SPOTS = [
  { spot: 'Weak Flush on 4-Flush Board', icon: '·', color: '#3b82f6',
    hand: '8♥5♥ on K♥Q♥3♣ 7♠ → 2♥',
    problem: 'You made a flush, but it\'s the 5th nut. Anyone with a higher heart CRUSHES you.',
    rio: 'When you bet and get raised, you lose a huge pot. When villain bets big, you can\'t fold your flush.',
    solution: 'Check-call small bets. Fold to big raises. Your flush is a bluff-catcher, not a value hand.' },
  { spot: 'Dominated Kicker', icon: '▲', color: '#f59e0b',
    hand: 'A3o on A♠K♦8♣ 5♥ → 2♦',
    problem: 'You have top pair but the weakest kicker. Every Ax with a better kicker dominates you.',
    rio: 'When you bet and get called, villain usually has AK, AQ, AJ, AT. You\'re crushed.',
    solution: 'Check-call at most. Don\'t build pots with weak aces. Showdown cheaply.' },
  { spot: 'Small Set vs Possible Straight/Flush', icon: '●', color: '#ef4444',
    hand: '44 on 6♥5♥4♣ 3♠ → A♥',
    problem: 'Bottom set but board has straight AND flush possible. Your set may already be behind.',
    rio: 'Betting big only gets called by hands that beat you (78, flush, A2). Worse hands fold.',
    solution: 'Check-call medium bets. Don\'t raise into the completed draws. Control the pot.' },
  { spot: 'Second Nut Straight', icon: '·', color: '#8b5cf6',
    hand: 'JT on Q♠9♦8♣ 2♥ → 5♦',
    problem: 'You have a straight (J-high), but KT makes a higher straight. Board also pairs for boats.',
    rio: 'If villain raises your bet, they always have KT or a set-turned-boat. You lose the maximum.',
    solution: 'Value bet, but don\'t re-raise. If raised, seriously consider folding. Second nuts = danger.' },
  { spot: 'Top Pair in Multi-Way Pot', icon: '●', color: '#22c55e',
    hand: 'AQ on A♠J♦7♣ (4 players)',
    problem: 'TPTK is great heads-up but dangerous multi-way. Someone likely has AK, AJ, sets, or two pair.',
    rio: 'Building a big pot 4-way means you\'re often paying off better hands.',
    solution: 'Bet smaller. Don\'t raise. Check-call if facing aggression from multiple players.' },
];

export default function ReverseImpliedOdds() {
  const [spotIdx, setSpotIdx] = useState(0);
  const spot = RIO_SPOTS[spotIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #f59e0b, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        ▲ Reverse Implied Odds
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>When making your hand actually costs you money.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {RIO_SPOTS.map((s, i) => (
          <button key={i} onClick={() => setSpotIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: spotIdx === i ? `2px solid ${s.color}` : '1px solid rgba(255,255,255,0.06)',
              background: spotIdx === i ? `${s.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{s.icon}</div>
            <div style={{ fontSize: 7, fontWeight: 700, color: spotIdx === i ? s.color : '#64748b' }}>{s.spot.substring(0, 12)}</div>
          </button>
        ))}
      </div>

      <motion.div key={spotIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 24 }}>{spot.icon}</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: spot.color }}>{spot.spot}</span>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8, marginBottom: 10, fontFamily: 'monospace' }}>
          <div style={{ fontSize: 10, color: '#64748b' }}>Hand & Board</div>
          <div style={{ fontSize: 11, color: '#e2e8f0' }}>{spot.hand}</div>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #ef4444' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>The Problem</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{spot.problem}</div>
          </div>
          <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>Reverse Implied Odds</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{spot.rio}</div>
          </div>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>Solution</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{spot.solution}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

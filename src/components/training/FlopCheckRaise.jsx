/**
 * FlopCheckRaise — Flop Check-Raise Strategy
 * When, why, and how to check-raise on the flop
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const XRAISE_SPOTS = [
  { spot: 'Check-Raise for Value (Sets)', board: 'Q♠7♦3♣', hand: '7♠7♥', color: '#22c55e', icon: '●',
    freq: '85-100%',
    why: 'Bottom set on a dry board. You need to build the pot NOW — if you just call, the pot stays small.',
    sizing: 'Raise to 3x the c-bet. On a dry board, you want to look like a bluff to get called.',
    followUp: 'Bet turn 66-75% pot. Bet river for value. Don\'t slow down — your hand is disguised.' },
  { spot: 'Check-Raise Semi-Bluff (Draws)', board: 'K♥9♥4♣', hand: 'J♥T♥', color: '#3b82f6', icon: '·',
    freq: '40-60%',
    why: 'Flush draw + gutshot = 12 outs. Check-raising puts maximum pressure while having great equity.',
    sizing: 'Raise to 3-3.5x. Big enough to fold out Ax, small pairs. If called, you still have outs.',
    followUp: 'If turn completes your draw, bet big for value. If brick, you can barrel or check-give up.' },
  { spot: 'Check-Raise Bluff (Air)', board: 'A♠8♦5♣', hand: '6♠4♠', color: '#ef4444', icon: '◇',
    freq: '15-25%',
    why: 'Pure bluff on an ace-high board. Represents AK/AQ. Many c-bets fold to aggression here.',
    sizing: 'Raise to 3x. Don\'t overcommit with air. If called, you\'re done unless you pick up equity.',
    followUp: 'Give up if called unless turn gives a draw. Don\'t triple barrel with nothing.' },
  { spot: 'Check-Raise Two Pair', board: 'J♦T♣6♠', hand: 'J♣T♠', color: '#f59e0b', icon: '⌁',
    freq: '70-90%',
    why: 'Two pair on a connected board is vulnerable. Many turn cards kill your hand. Get money in now.',
    sizing: 'Raise to 3.5x. Larger sizing because the board is wet — you want to deny equity aggressively.',
    followUp: 'Shove turns that don\'t complete straights or bring a flush. Check scary cards.' },
  { spot: 'Check-Raise Top Pair (Occasionally)', board: '9♠6♦2♣', hand: 'A♠9♦', color: '#8b5cf6', icon: '◆',
    freq: '10-20%',
    why: 'Mixing in top pair as a check-raise keeps your range balanced. Villain can\'t just fold to every X/R.',
    sizing: 'Raise to 2.5-3x. Smaller since you don\'t want to bloat the pot with one pair.',
    followUp: 'Check-call turn. You\'ve built the pot enough. Control the pot size from here.' },
];

export default function FlopCheckRaise() {
  const [spotIdx, setSpotIdx] = useState(0);
  const spot = XRAISE_SPOTS[spotIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #22c55e, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        ● Flop Check-Raise
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>The most powerful OOP weapon — master the check-raise.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {XRAISE_SPOTS.map((s, i) => (
          <button key={i} onClick={() => setSpotIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: spotIdx === i ? `2px solid ${s.color}` : '1px solid rgba(255,255,255,0.06)',
              background: spotIdx === i ? `${s.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{s.icon}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: spotIdx === i ? s.color : '#64748b' }}>{s.spot.substring(0, 12)}</div>
          </button>
        ))}
      </div>

      <motion.div key={spotIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: spot.color }}>{spot.spot}</div>
          <div style={{ background: `${spot.color}20`, borderRadius: 6, padding: '3px 10px' }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: spot.color }}>{spot.freq}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8, textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>Board</div>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: '#e2e8f0' }}>{spot.board}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8, textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>Your Hand</div>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: spot.color }}>{spot.hand}</div>
          </div>
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 10 }}>{spot.why}</p>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>Sizing</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{spot.sizing}</div>
          </div>
          <div style={{ background: 'rgba(59,130,246,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #3b82f6' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6' }}>Follow-Up Plan</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{spot.followUp}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * TurnProbeGuide — Turn Probe Bet Strategy
 * When to bet the turn after checking the flop
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const PROBE_SPOTS = [
  { spot: 'IP After Both Check Flop', board: 'K♠8♦3♣ → 2♥', color: '#22c55e', icon: '◆',
    freq: '55-65%',
    why: 'Both players showed weakness on flop. The turn check gives you a chance to steal with any two cards.',
    sizing: '50% pot — standard probe. Don\'t need to go big when both ranges are weak.',
    bestHands: 'Any pair, any draw, any Kx. Even complete air works since villain\'s range is capped.',
    avoid: 'Don\'t probe into sticky opponents who check-call flop and turn with any pair.' },
  { spot: 'OOP After PFR Checks Back', board: 'A♠J♦7♣ → 4♠', color: '#3b82f6', icon: '·',
    freq: '35-45%',
    why: 'PFR checked back the flop, capping their range. They likely have mid-pairs or draws, not strong aces.',
    sizing: '66% pot — go bigger OOP since you need fold equity. Small bets don\'t accomplish enough.',
    bestHands: 'Ax for value, flush draws turned into semi-bluffs, complete air with blockers.',
    avoid: 'Don\'t lead into PFRs who only check back nutted hands for deception.' },
  { spot: 'Scare Card Turn Probe', board: 'Q♥9♦6♣ → A♠', color: '#f59e0b', icon: '⌁',
    freq: '45-55%',
    why: 'The ace is a great scare card to probe. If PFR checked flop, they likely don\'t have an ace.',
    sizing: '50-66% pot — represent the ace. Your bet tells a believable story.',
    bestHands: 'Any ace (obviously), but also total air. The ace gives you a great bluffing card.',
    avoid: 'Don\'t overbluff. If villain check-called flop, they might have called with Ax.' },
  { spot: 'Flush Draw Completing Turn', board: 'T♥7♥3♦ → 2♥', color: '#8b5cf6', icon: '·',
    freq: '40-50%',
    why: 'Third heart arrives. If you have any heart, you can represent the flush. PFR fears this card.',
    sizing: '75% pot — go big to represent the flush. Small bets are suspicious on flush-completing turns.',
    bestHands: 'Made flushes for value. A♥x as a blocker bluff. Any single heart as a semi-bluff.',
    avoid: 'Don\'t bluff without a heart blocker. Villain will call with their own flush draws.' },
  { spot: 'Paired Board Turn Probe', board: 'J♠8♦4♣ → 4♠', color: '#ef4444', icon: '●',
    freq: '50-60%',
    why: 'Board pairs are great bluff cards. Very few combos have a 4. You can represent trips easily.',
    sizing: '50% pot — medium sizing since trips would want calls. Overbetting looks like a bluff.',
    bestHands: 'Any 4x (rare but value). Jx for thin value. Complete air to take the pot.',
    avoid: 'If villain check-raised flop, they might have a 4 or set. Don\'t probe into aggression.' },
];

export default function TurnProbeGuide() {
  const [spotIdx, setSpotIdx] = useState(0);
  const spot = PROBE_SPOTS[spotIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #f59e0b, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Turn Probe Bet Guide
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Exploit weakness when the flop goes check-check.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {PROBE_SPOTS.map((s, i) => (
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
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8, textAlign: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: '#64748b' }}>Board</div>
          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'monospace', color: '#e2e8f0' }}>{spot.board}</div>
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 10 }}>{spot.why}</p>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>Sizing</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{spot.sizing}</div>
          </div>
          <div style={{ background: `${spot.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${spot.color}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: spot.color }}>Best Hands to Probe</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{spot.bestHands}</div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #ef4444' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>Avoid When</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{spot.avoid}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

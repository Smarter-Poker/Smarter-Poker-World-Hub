/**
 * PostFlopAggression — Postflop Aggression Frequency Guide
 * When to be aggressive vs passive post-flop
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const AGGRESSION_SPOTS = [
  { spot: 'IP as PFR on Dry Flop', aggFreq: '70-80%', color: '#22c55e', icon: '▲',
    board: 'K♠7♦2♣',
    why: 'Dry boards favor the raiser. Few draws possible. Your range has all the overpairs and big kings.',
    sizing: '33% pot — small c-bet. You want to deny equity cheaply with your entire range.',
    mistake: 'Checking back too much. On K72r, you should be c-betting nearly everything.' },
  { spot: 'OOP as PFR on Wet Flop', aggFreq: '35-45%', color: '#f59e0b', icon: '⌁',
    board: 'J♥T♥8♣',
    why: 'Connected wet boards hit both ranges. Being OOP makes aggression riskier — you face raises.',
    sizing: '50-66% pot — you need to charge draws. Small bets don\'t accomplish enough.',
    mistake: 'C-betting your whole range. On JT8hh, check most air and check-raise your monsters.' },
  { spot: 'IP as Caller on Checked Flop', aggFreq: '50-60%', color: '#3b82f6', icon: '▲',
    board: '9♦6♣3♠',
    why: 'When PFR checks, their range is capped. Stab with any piece of equity. Dead money is free.',
    sizing: '50% pot — standard delayed stab. Big enough to push out weak hands.',
    mistake: 'Checking back marginal hands. When they check to you, bet with 66+ and any draw.' },
  { spot: 'Turn After Check-Calling Flop', aggFreq: '20-30%', color: '#8b5cf6', icon: '◆',
    board: 'A♠9♥4♣ → 2♦',
    why: 'After check-calling, your range is defined as medium strength. Lead selectively for balance.',
    sizing: '66-75% pot — probe bets should be meaningful. Small probes don\'t accomplish anything.',
    mistake: 'Being too passive. A well-timed donk lead on the turn can win pots the PFR gives up on.' },
  { spot: 'River After Two Streets of Checking', aggFreq: '15-25%', color: '#ef4444', icon: '◇',
    board: 'Q♠J♦7♣ 5♥ → 3♠',
    why: 'Both players showed weakness. River aggression picks up dead money but beware of traps.',
    sizing: '50-66% pot — don\'t overbet when both ranges are weak. Medium sizing folds out air.',
    mistake: 'Never betting. If both sides checked twice, someone has to take the pot. Be that person.' },
];

export default function PostFlopAggression() {
  const [spotIdx, setSpotIdx] = useState(0);
  const spot = AGGRESSION_SPOTS[spotIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #22c55e, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Postflop Aggression Guide
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Know when to fire and when to slow down.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {AGGRESSION_SPOTS.map((s, i) => (
          <button key={i} onClick={() => setSpotIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: spotIdx === i ? `2px solid ${s.color}` : '1px solid rgba(255,255,255,0.06)',
              background: spotIdx === i ? `${s.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{s.icon}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: spotIdx === i ? s.color : '#64748b' }}>{s.spot.substring(0, 10)}</div>
          </button>
        ))}
      </div>

      <motion.div key={spotIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: spot.color }}>{spot.spot}</div>
          <div style={{ background: `${spot.color}20`, borderRadius: 8, padding: '4px 12px' }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: spot.color }}>{spot.aggFreq}</span>
          </div>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8, marginBottom: 10, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#64748b' }}>Board</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', fontFamily: 'monospace' }}>{spot.board}</div>
        </div>

        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 10 }}>{spot.why}</p>

        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>Sizing</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{spot.sizing}</div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #ef4444' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>Common Mistake</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{spot.mistake}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

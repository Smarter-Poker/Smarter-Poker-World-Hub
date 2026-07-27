/**
 * TrapPlayGuide — When and How to Slow Play
 * Identify spots where trapping maximizes value
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const TRAP_SPOTS = [
  { hand: 'AA', board: 'A♠ 7♦ 2♣', action: 'TRAP ✓', reason: 'Dry board, you block Ax. Checking lets villain catch up with middle pairs or try to bluff.',
    conditions: ['Dry/static board', 'You block key cards', 'Villain is aggressive', 'Heads-up pot'] },
  { hand: 'KK', board: 'K♥ Q♣ J♦', action: 'BET ✕', reason: 'Connected board with straight potential. Betting protects against draws. Never slow play on wet boards.',
    conditions: ['Wet/dynamic board', 'Many draws possible', 'Multiway pot', 'Need to charge draws'] },
  { hand: 'Set of 8s', board: '8♠ 7♠ 6♣', action: 'BET ✕', reason: 'Extremely wet board. Straight and flush draws everywhere. Bet large to charge and protect.',
    conditions: ['Coordinated board', 'Flush/straight draws', 'Bottom/middle set', 'Multiway'] },
  { hand: 'Flopped flush', board: 'T♥ 6♥ 2♥', action: 'TRAP ✓', reason: 'You have the nuts and there\'s no realistic draw that beats you. Let villain bet into you.',
    conditions: ['Nut hand on safe board', 'Single raised pot', 'Aggressive villain', 'Not too many redraws'] },
  { hand: 'AA', board: '9♣ 9♦ 3♠', action: 'TRAP ✓', reason: 'Paired dry board. Very unlikely villain has a 9. Check to induce bluffs and let them catch up.',
    conditions: ['Paired board', 'Dry texture', 'Few draws', 'Position advantage'] },
  { hand: 'QQ', board: 'Q♠ 8♣ 4♦ T♠', action: 'BET ✕', reason: 'Turn brought flush draw and straight draws. Time to bet for value and protection.',
    conditions: ['Draw arrives on turn', 'Board gets wetter', 'Multiple opponents', 'Vulnerable hand'] },
];

export default function TrapPlayGuide() {
  const [spotIdx, setSpotIdx] = useState(0);
  const [guessed, setGuessed] = useState(null);
  const spot = TRAP_SPOTS[spotIdx];
  const isTrap = spot.action.includes('TRAP');

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Trap Play Guide
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Know when slow playing wins big and when it costs you the pot.</p>

      {/* Spot navigation */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {TRAP_SPOTS.map((s, i) => (
          <button key={i} onClick={() => { setSpotIdx(i); setGuessed(null); }}
            style={{ padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: spotIdx === i ? 'linear-gradient(135deg, #8b5cf6, #6366f1)' : 'rgba(255,255,255,0.06)',
              color: spotIdx === i ? '#fff' : '#94a3b8' }}>
            {s.hand} on {s.board.split(' ').slice(0,2).join('')}
          </button>
        ))}
      </div>

      {/* Hand display */}
      <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#8b5cf6', marginBottom: 8 }}>Your Hand: {spot.hand}</div>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 4, marginBottom: 16 }}>{spot.board}</div>

        {guessed === null ? (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button onClick={() => setGuessed('trap')}
              style={{ padding: '10px 24px', borderRadius: 8, border: 'none', fontWeight: 700, cursor: 'pointer',
                background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: '#fff', fontSize: 14 }}>
              Trap
            </button>
            <button onClick={() => setGuessed('bet')}
              style={{ padding: '10px 24px', borderRadius: 8, border: 'none', fontWeight: 700, cursor: 'pointer',
                background: 'linear-gradient(135deg, #f59e0b, #ef4444)', color: '#fff', fontSize: 14 }}>
              Bet
            </button>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4,
              color: (guessed === 'trap' && isTrap) || (guessed === 'bet' && !isTrap) ? '#22c55e' : '#ef4444' }}>
              {(guessed === 'trap' && isTrap) || (guessed === 'bet' && !isTrap) ? '✓ Correct!' : '✕ Not Quite'}
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: isTrap ? '#8b5cf6' : '#f59e0b', marginBottom: 6 }}>{spot.action}</div>
            <p style={{ fontSize: 13, color: '#cbd5e1', textAlign: 'left' }}>{spot.reason}</p>
          </motion.div>
        )}
      </div>

      {/* Conditions */}
      {guessed !== null && (
        <div style={{ background: 'rgba(139,92,246,0.06)', borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#8b5cf6', marginBottom: 6 }}>
            {isTrap ? 'Trap When...' : 'Bet When...'}
          </div>
          {spot.conditions.map((c, i) => (
            <div key={i} style={{ fontSize: 12, color: '#94a3b8', padding: '2px 0', display: 'flex', gap: 6 }}>
              <span style={{ color: isTrap ? '#8b5cf6' : '#f59e0b' }}>✓</span> {c}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

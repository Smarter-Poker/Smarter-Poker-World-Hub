/**
 * FloatingStrategy — The Art of Floating
 * Calling flop bets in position to take away the pot later
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const FLOAT_SPOTS = [
  { board: 'K♠ 8♦ 3♣', villain: 'CO c-bets 50%', you: 'BTN with Q♠J♠', action: 'FLOAT ✓',
    plan: 'Call flop. If checked to on turn, bet 66%. If villain bets again, fold unless you improve.',
    why: 'Dry board, villain c-bets wide. You have 2 overcards + backdoor flush. Take it away on turn.' },
  { board: 'T♥ 9♥ 6♣', villain: 'HJ c-bets 66%', you: 'CO with A♣K♣', action: 'FOLD ✕',
    plan: 'Too wet to float. Villain likely has equity. Your AK has minimal backdoor potential here.',
    why: 'Coordinated board = villain c-bets with real equity. Floating into strength is burning money.' },
  { board: 'A♠ 5♦ 2♣', villain: 'UTG c-bets 33%', you: 'BTN with 8♠7♠', action: 'FLOAT ✓',
    plan: 'Call the small c-bet. Bet turn if villain checks (they will 60%+ of the time).',
    why: 'UTG c-bets small on A-high = range bet. They\'ll check turn with most non-Ax hands. Free pot.' },
  { board: 'J♣ T♠ 4♦', villain: 'BTN c-bets 75%', you: 'BB with A♥5♥', action: 'FOLD ✕',
    plan: 'OOP with no draw, no plan. Don\'t float out of position without a clear plan.',
    why: 'Floating OOP is a major leak. You need position to execute the float play.' },
  { board: 'Q♦ 7♣ 2♠', villain: 'CO c-bets 50%', you: 'BTN with T♠9♠', action: 'FLOAT ✓',
    plan: 'Call. Bet 60% on any turn that\'s a scare card (K, A, 8, J). Check back safe turns.',
    why: 'Dry Q-high board, villain c-bets wide. Your backdoors + position = profitable float.' },
];

const FLOAT_CHECKLIST = [
  { check: 'You have position', critical: true },
  { check: 'Board is dry/static', critical: true },
  { check: 'Villain c-bets at high frequency', critical: true },
  { check: 'You have some equity (backdoors, overcards)', critical: false },
  { check: 'Villain is likely to check turn after being called', critical: false },
  { check: 'Your hand is too weak to raise but too good to fold', critical: false },
];

export default function FloatingStrategy() {
  const [spotIdx, setSpotIdx] = useState(0);
  const [showPlan, setShowPlan] = useState(false);
  const spot = FLOAT_SPOTS[spotIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #06b6d4, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Floating Strategy
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Call in position to steal the pot on later streets.</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {FLOAT_SPOTS.map((s, i) => (
          <button key={i} onClick={() => { setSpotIdx(i); setShowPlan(false); }}
            style={{ padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: spotIdx === i ? 'linear-gradient(135deg, #06b6d4, #3b82f6)' : 'rgba(255,255,255,0.06)',
              color: spotIdx === i ? '#fff' : '#94a3b8' }}>
            {s.board.split(' ').slice(0,2).join('')}...
          </button>
        ))}
      </div>

      <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 3, textAlign: 'center', marginBottom: 8 }}>{spot.board}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>Villain</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444' }}>{spot.villain}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>Your Hand</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6' }}>{spot.you}</div>
          </div>
        </div>

        {!showPlan ? (
          <div style={{ textAlign: 'center' }}>
            <button onClick={() => setShowPlan(true)}
              style={{ padding: '8px 24px', borderRadius: 8, border: 'none', fontWeight: 700, cursor: 'pointer',
                background: 'linear-gradient(135deg, #06b6d4, #3b82f6)', color: '#fff', fontSize: 14 }}>
              Reveal Plan
            </button>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, textAlign: 'center', marginBottom: 8,
              color: spot.action.includes('✓') ? '#22c55e' : '#ef4444' }}>{spot.action}</div>
            <div style={{ background: 'rgba(6,182,212,0.08)', borderRadius: 8, padding: 10, marginBottom: 8, borderLeft: '3px solid #06b6d4' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#06b6d4' }}>Game Plan</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>{spot.plan}</div>
            </div>
            <p style={{ fontSize: 12, color: '#cbd5e1' }}>{spot.why}</p>
          </motion.div>
        )}
      </div>

      <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#06b6d4', marginBottom: 6 }}>Float Checklist</div>
        {FLOAT_CHECKLIST.map((c, i) => (
          <div key={i} style={{ fontSize: 12, color: '#94a3b8', padding: '2px 0', display: 'flex', gap: 6 }}>
            <span style={{ color: c.critical ? '#ef4444' : '#06b6d4' }}>{c.critical ? '★' : '○'}</span> {c.check}
          </div>
        ))}
      </div>
    </div>
  );
}

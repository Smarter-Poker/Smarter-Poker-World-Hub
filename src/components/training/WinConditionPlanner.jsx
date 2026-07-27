/**
 * WinConditionPlanner — Planning Your Win Condition Each Hand
 * Think about HOW you'll win the pot before you play it
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const WIN_CONDITIONS = [
  { condition: 'Win at Showdown (Value)', icon: '◆', color: '#22c55e',
    hands: 'AA, KK, sets, two pair, strong top pair',
    plan: 'Your plan is simple: build the pot across streets. Bet-bet-bet for value. Size up on later streets.',
    streets: 'Flop: 33-50% pot → Turn: 66-75% pot → River: 75-100% pot',
    keyQ: 'Am I getting called by worse? If yes, keep betting. If only better calls, slow down.' },
  { condition: 'Win by Folding Opponent (Bluff)', icon: '◇', color: '#ef4444',
    hands: 'Missed draws, air, blockers without showdown value',
    plan: 'You have no showdown value, so you need villain to fold. Pick spots where their range is weak.',
    streets: 'Target: river bluffs after missed draws. Or flop c-bets on dry boards. Triple barrel only rarely.',
    keyQ: 'Can villain\'s range fold here? If their range is bluff-catchers, apply max pressure.' },
  { condition: 'Win with Equity Realization (Draws)', icon: '●', color: '#3b82f6',
    hands: 'Flush draws, OESDs, combo draws, gutshots with overcards',
    plan: 'See cheap cards to realize your equity. Call or raise to set your price. Don\'t overpay for draws.',
    streets: 'Flop: call or raise (semi-bluff) → Turn: re-evaluate pot odds → River: value bet if hit, give up if miss',
    keyQ: 'Am I getting the right price? Count outs × 2 (turn only) or × 4 (both cards) for rough equity.' },
  { condition: 'Win by Pot Control (Medium Hands)', icon: '■', color: '#f59e0b',
    hands: 'Second pair, weak top pair, pocket pairs below top pair',
    plan: 'Keep the pot small. Check-call or check-check. Don\'t bloat pots with mediocre holdings.',
    streets: 'Flop: check-call → Turn: check-check or small bet → River: showdown cheaply',
    keyQ: 'Do I beat their bluffs and some value? If yes, call. If I only beat bluffs, consider folding.' },
  { condition: 'Win by Set Mining (Implied Odds)', icon: '◇', color: '#8b5cf6',
    hands: '22-99 preflop, speculative suited connectors',
    plan: 'Call small raises preflop. If you hit your set, win a big pot. If you miss, fold cheaply on the flop.',
    streets: 'Pre: call 2-3x opens → Flop: hit set = fast-play, miss = fold → Stack opponent\'s overpair',
    keyQ: 'Are effective stacks 15x+ the call? You need ~15:1 implied odds to profitably set mine.' },
];

export default function WinConditionPlanner() {
  const [condIdx, setCondIdx] = useState(0);
  const cond = WIN_CONDITIONS[condIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #22c55e, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        · Win Condition Planner
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Plan HOW you'll win each hand before you play it.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {WIN_CONDITIONS.map((w, i) => (
          <button key={i} onClick={() => setCondIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: condIdx === i ? `2px solid ${w.color}` : '1px solid rgba(255,255,255,0.06)',
              background: condIdx === i ? `${w.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{w.icon}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: condIdx === i ? w.color : '#64748b' }}>{w.condition.substring(0, 10)}</div>
          </button>
        ))}
      </div>

      <motion.div key={condIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 24 }}>{cond.icon}</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: cond.color }}>{cond.condition}</span>
        </div>

        <div style={{ background: `${cond.color}08`, borderRadius: 8, padding: 8, marginBottom: 10, fontFamily: 'monospace' }}>
          <div style={{ fontSize: 10, color: '#64748b' }}>Typical Hands</div>
          <div style={{ fontSize: 12, color: cond.color }}>{cond.hands}</div>
        </div>

        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 10 }}>{cond.plan}</p>

        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(59,130,246,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #3b82f6' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6' }}>Street Plan</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{cond.streets}</div>
          </div>
          <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>Key Question</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{cond.keyQ}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * EquityDistribution — Equity Distribution Across Ranges
 * Understand how equity spreads across your range on different boards
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const EQUITY_BOARDS = [
  { board: 'A♠K♦7♣ (Dry, High)', type: 'Static', color: '#22c55e', icon: '·',
    distribution: 'PFR has polar equity: many hands with 70%+ (AK, AQ) and many with <30% (small pairs).',
    strategy: 'Range bet small (33%). Your equity advantage is large and consistent across your range.',
    imbalance: 'Caller\'s range is squeezed in the middle — many hands with 30-50% equity.',
    sizing: 'Small sizing works because your range is so far ahead on average.' },
  { board: 'J♥T♥8♣ (Wet, Connected)', type: 'Dynamic', color: '#ef4444', icon: '·',
    distribution: 'Equity is distributed evenly. Both players have straights, sets, draws, and pair+draw combos.',
    strategy: 'Use multiple sizings. Big bets with nutted hands and draws, checks with middling hands.',
    imbalance: 'Caller actually has MORE sets here (JJ, TT, 88 they flatted preflop).',
    sizing: 'Need larger sizings to deny equity. 66-75% pot is appropriate.' },
  { board: 'Q♠Q♦4♣ (Paired)', type: 'Static', color: '#3b82f6', icon: '●',
    distribution: 'PFR has most Qx combos (AQ, KQ, QJs). Caller rarely has a queen.',
    strategy: 'High-frequency small bets. Villain almost never has trips, so they fold a lot.',
    imbalance: 'Massive range advantage for PFR. Caller must fold most of their range.',
    sizing: '25-33% pot. Range bet the whole board — your Qx crushes and your air gets folds.' },
  { board: '6♠5♦4♣ (Low, Connected)', type: 'Dynamic', color: '#f59e0b', icon: '·',
    distribution: 'Caller has MORE equity here! Low connected boards favor the BB/caller\'s range.',
    strategy: 'PFR should check frequently. Caller has 67s, 78s, 54s, sets of low pairs.',
    imbalance: 'PFR\'s overpairs (AA-TT) have equity but are vulnerable. BB has the range advantage.',
    sizing: 'When PFR does bet, go large (66%+) to protect overpairs and deny equity.' },
  { board: 'K♠9♥3♦ (Rainbow, Mid)', type: 'Static', color: '#8b5cf6', icon: '◇',
    distribution: 'PFR has clear range advantage (all Kx). Caller has some Kx but mostly mid-pairs.',
    strategy: 'Standard c-bet frequency (55-65%). Value bet Kx, bluff with overcards and backdoors.',
    imbalance: 'Caller has 99, 33 for sets. PFR has KK, K9s rarely. Respect check-raises.',
    sizing: '50% pot — standard sizing for a slightly favorable but not dominant board.' },
];

export default function EquityDistribution() {
  const [boardIdx, setBoardIdx] = useState(0);
  const board = EQUITY_BOARDS[boardIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #22c55e, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Equity Distribution
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>How equity spreads across your range by board type.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {EQUITY_BOARDS.map((b, i) => (
          <button key={i} onClick={() => setBoardIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: boardIdx === i ? `2px solid ${b.color}` : '1px solid rgba(255,255,255,0.06)',
              background: boardIdx === i ? `${b.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{b.icon}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: boardIdx === i ? b.color : '#64748b' }}>{b.type}</div>
          </button>
        ))}
      </div>

      <motion.div key={boardIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: board.color }}>{board.board}</div>
          <div style={{ background: `${board.color}20`, borderRadius: 6, padding: '3px 10px' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: board.color }}>{board.type}</span>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: `${board.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${board.color}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: board.color }}>Equity Spread</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{board.distribution}</div>
          </div>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>Strategy</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{board.strategy}</div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #ef4444' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>Range Imbalance</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{board.imbalance}</div>
          </div>
          <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>Sizing</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{board.sizing}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

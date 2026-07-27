/**
 * BoardPairingStrategy — Strategy on Paired Boards
 * How to adjust your play when the flop/turn pairs
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const PAIRED_BOARDS = [
  { board: 'K♠ K♦ 7♣', type: 'Top Card Paired', pfr_adv: 95,
    strategy: 'PFR has massive advantage. C-bet ~80% with small sizing (25-33%). Villain almost never has Kx.',
    key: 'Bet small, bet often. Your range has KK, AK, KQ — they have almost none of these.' },
  { board: 'Q♥ 8♣ 8♦', type: 'Bottom Card Paired', pfr_adv: 70,
    strategy: 'PFR still has advantage but less extreme. C-bet ~60% with small sizing.',
    key: 'BB can have 87s, 89s type hands. Still bet frequently but slightly less than top-paired.' },
  { board: 'T♠ T♦ 6♣', type: 'Middle Paired', pfr_adv: 75,
    strategy: 'PFR has more TT, AT, KT. C-bet at high frequency. Villain has some Tx suited but not many.',
    key: 'Your overpairs are very strong on paired boards. JJ+ can bet three streets for value.' },
  { board: 'A♣ A♠ 5♦', type: 'Ace Paired', pfr_adv: 85,
    strategy: 'You have AA, AK, AQ — but so might villain with AK/AQ at lower frequency. Bet for thin value.',
    key: 'When the board pairs the ace, both players\' Ax range is reduced. Medium pairs gain value.' },
  { board: '3♥ 3♠ 9♦', type: 'Low Paired', pfr_adv: 60,
    strategy: 'BB has more 3x combos (32s-36s). PFR still has range advantage but nut advantage is less clear.',
    key: 'Check more with air, bet with overpairs and Ax. BB can check-raise with trips.' },
];

export default function BoardPairingStrategy() {
  const [boardIdx, setBoardIdx] = useState(0);
  const board = PAIRED_BOARDS[boardIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #f59e0b, #d97706)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Board Pairing Strategy
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Paired boards are gold for the PFR — learn to exploit them.</p>

      {/* Board selector */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {PAIRED_BOARDS.map((b, i) => (
          <button key={i} onClick={() => setBoardIdx(i)}
            style={{ padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: boardIdx === i ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'rgba(255,255,255,0.06)',
              color: boardIdx === i ? '#000' : '#94a3b8' }}>
            {b.type}
          </button>
        ))}
      </div>

      {/* Board display */}
      <motion.div key={boardIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 4 }}>{board.board}</div>
          <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600, marginTop: 4 }}>{board.type}</div>
        </div>

        {/* PFR advantage bar */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginBottom: 4 }}>
            <span>BB</span><span>PFR Advantage: {board.pfr_adv}%</span><span>PFR</span>
          </div>
          <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4 }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${board.pfr_adv}%` }}
              transition={{ duration: 0.8 }}
              style={{ height: '100%', background: 'linear-gradient(90deg, #64748b, #f59e0b)', borderRadius: 4 }} />
          </div>
        </div>

        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 8 }}>{board.strategy}</p>
        <div style={{ background: 'rgba(245,158,11,0.08)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>Key Insight</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{board.key}</div>
        </div>
      </motion.div>

      {/* General rules */}
      <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', marginBottom: 8 }}>Paired Board Rules</div>
        {[
          'Higher the pair = more PFR advantage',
          'Small sizing (25-33%) works best on paired boards',
          'Overpairs are stronger than usual on paired flops',
          'When villain raises on paired boards, they usually have trips+',
          'Paired boards reduce the total number of possible combinations',
        ].map((r, i) => (
          <div key={i} style={{ fontSize: 12, color: '#94a3b8', padding: '3px 0', display: 'flex', gap: 6 }}>
            <span style={{ color: '#f59e0b' }}>{i + 1}.</span> {r}
          </div>
        ))}
      </div>
    </div>
  );
}

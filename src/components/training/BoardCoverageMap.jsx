/**
 * BoardCoverageMap — Range Board Coverage Analysis
 * How well your range covers different board textures
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const COVERAGE_SPOTS = [
  { board: 'A♠K♦Q♣ (Broadway Heavy)', type: 'PFR Dominated', color: '#22c55e', icon: '★',
    pfrCoverage: '95% — PFR has AK, AQ, KQ, AA, KK, QQ, AJ, KJ, QJ. Nearly every combo.',
    callerCoverage: '45% — Caller has some of these but not AA, KK. Mostly medium pairs and suited connectors.',
    strategy: 'PFR should range-bet small (33%). Massive range advantage on this texture.',
    adjustment: 'As caller: don\'t fight for this board. Check-fold most hands without two pair+.' },
  { board: '7♥6♥5♣ (Low Connected)', type: 'Caller Favored', color: '#ef4444', icon: '·',
    pfrCoverage: '30% — PFR has overpairs but misses most 2-pair, sets, and straight combos.',
    callerCoverage: '75% — Caller has 67s, 56s, 78s, 55, 66, 77, 89s, 98s. Tons of made hands.',
    strategy: 'PFR should check entire range. Caller has range advantage here.',
    adjustment: 'As PFR: check overpairs for pot control. Don\'t c-bet into a range that crushes you.' },
  { board: 'K♠9♦4♣ (Dry, Mid)', type: 'PFR Advantage', color: '#3b82f6', icon: '·',
    pfrCoverage: '70% — PFR has KK, K9s, 99, 44, AK, KQ, KJ, KTs. Good coverage.',
    callerCoverage: '50% — Caller has K9s, 99, 44, some Kx. But PFR has more combos of strong Kx.',
    strategy: 'PFR should c-bet 55-65% at 50% pot. Standard favorable texture.',
    adjustment: 'As caller: defend Kx, 99, 44, some backdoor draws. Fold most air.' },
  { board: 'J♣J♦8♠ (Paired)', type: 'PFR Strong', color: '#f59e0b', icon: '●',
    pfrCoverage: '80% — PFR has JJ, AJ, KJ, QJ, 88. Very strong coverage on paired boards.',
    callerCoverage: '35% — Caller rarely has Jx (would have 3-bet KJ+). Mostly 88, small pairs.',
    strategy: 'PFR should range-bet small (25-33%). Almost no one in caller\'s range has a J.',
    adjustment: 'As caller: fold immediately with most hands. Only continue with 88, strong 8x, or Jx.' },
  { board: 'T♥9♥8♣ (Wet Dynamic)', type: 'Shared', color: '#8b5cf6', icon: '·',
    pfrCoverage: '55% — PFR has JT, QJ, overpairs, some sets. Good but vulnerable.',
    callerCoverage: '60% — Caller has J7s, 76s, 89s, TT-88 sets, many 2-pair combos.',
    strategy: 'Use multiple sizings. Big bets with nutted hands, checks with medium hands.',
    adjustment: 'Both players should be cautious. Many hands have equity. Avoid bloating with one pair.' },
];

export default function BoardCoverageMap() {
  const [boardIdx, setBoardIdx] = useState(0);
  const board = COVERAGE_SPOTS[boardIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #3b82f6, #22c55e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        · Board Coverage Map
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>How well does your range hit each board type?</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {COVERAGE_SPOTS.map((b, i) => (
          <button key={i} onClick={() => setBoardIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: boardIdx === i ? `2px solid ${b.color}` : '1px solid rgba(255,255,255,0.06)',
              background: boardIdx === i ? `${b.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{b.icon}</div>
            <div style={{ fontSize: 7, fontWeight: 700, color: boardIdx === i ? b.color : '#64748b' }}>{b.type.substring(0, 10)}</div>
          </button>
        ))}
      </div>

      <motion.div key={boardIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: board.color, fontFamily: 'monospace' }}>{board.board}</div>
          <div style={{ background: `${board.color}20`, borderRadius: 6, padding: '3px 10px' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: board.color }}>{board.type}</span>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>PFR Coverage</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{board.pfrCoverage}</div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #ef4444' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>Caller Coverage</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{board.callerCoverage}</div>
          </div>
          <div style={{ background: `${board.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${board.color}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: board.color }}>Strategy</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{board.strategy}</div>
          </div>
          <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>Adjustment</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{board.adjustment}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * RangeAdvantageGuide — Understanding Range vs Nut Advantage
 * Teaches when you have range advantage vs nut advantage and how to adjust
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const BOARDS = [
  { flop: 'A♠ K♦ 7♣', pfr: 'BTN open', caller: 'BB call',
    rangeAdv: 'PFR', nutAdv: 'PFR',
    explain: 'BTN has all Ax, Kx broadways, 77. BB has fewer AK/AA. PFR dominates both range AND nut advantage.',
    strategy: 'C-bet frequently (70%+) with small sizing (33%). Your range crushes this board.' },
  { flop: '8♥ 7♥ 6♣', pfr: 'CO open', caller: 'BB call',
    rangeAdv: 'Neither', nutAdv: 'Caller',
    explain: 'BB has more 98s, 56s, 65s, T9s. CO has overpairs but fewer straights/sets.',
    strategy: 'Check frequently. When betting, use large sizing (75%+) with overpairs and draws.' },
  { flop: 'Q♠ Q♦ 4♣', pfr: 'UTG open', caller: 'BTN call',
    rangeAdv: 'PFR', nutAdv: 'PFR',
    explain: 'UTG has QQ, AQ, KQ more often. Paired boards favor the PFR heavily.',
    strategy: 'C-bet nearly always (80%+) with small sizing. Villain can barely have Qx.' },
  { flop: 'T♣ 9♣ 8♠', pfr: 'BTN open', caller: 'SB call',
    rangeAdv: 'Neither', nutAdv: 'Caller',
    explain: 'SB has JTs, 97s, 87s. Very connected board where caller has more two-pair/straight combos.',
    strategy: 'Check more often. When c-betting, choose hands with equity (JJ+, JTs, flush draws).' },
  { flop: 'K♠ 5♦ 2♣', pfr: 'HJ open', caller: 'CO call',
    rangeAdv: 'PFR', nutAdv: 'PFR',
    explain: 'Dry K-high board. PFR has all Kx broadways, AA, KK. CO has fewer premium Kx combos.',
    strategy: 'High frequency c-bet (75%+) with small sizing (25-33%). Your range dominates.' },
];

export default function RangeAdvantageGuide() {
  const [boardIdx, setBoardIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const board = BOARDS[boardIdx];

  const AdvBadge = ({ label, who }) => {
    const color = who === 'PFR' ? '#3b82f6' : who === 'Caller' ? '#ef4444' : '#64748b';
    return (
      <div style={{ background: `${color}15`, border: `1px solid ${color}40`, borderRadius: 8, padding: '8px 12px', flex: 1 }}>
        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 15, fontWeight: 800, color }}>{who}</div>
      </div>
    );
  };

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
         Range Advantage Guide
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Understand who has range advantage vs nut advantage on every flop.</p>

      {/* Board selector */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {BOARDS.map((b, i) => (
          <button key={i} onClick={() => { setBoardIdx(i); setRevealed(false); }}
            style={{ padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: boardIdx === i ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)' : 'rgba(255,255,255,0.06)', color: boardIdx === i ? '#fff' : '#94a3b8' }}>
            {b.flop}
          </button>
        ))}
      </div>

      {/* Board display */}
      <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 4, marginBottom: 8 }}>{board.flop}</div>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>{board.pfr} vs {board.caller}</div>

        {!revealed ? (
          <button onClick={() => setRevealed(true)}
            style={{ marginTop: 12, padding: '8px 24px', borderRadius: 8, border: 'none', fontWeight: 700, cursor: 'pointer',
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', fontSize: 14 }}>
            Reveal Analysis
          </button>
        ) : (
          <AnimatePresence>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <AdvBadge label="Range Advantage" who={board.rangeAdv} />
                <AdvBadge label="Nut Advantage" who={board.nutAdv} />
              </div>
              <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 8, textAlign: 'left' }}>{board.explain}</p>
              <div style={{ background: 'rgba(34,197,94,0.1)', borderRadius: 8, padding: 10, textAlign: 'left' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#22c55e', marginBottom: 2 }}>✓ Optimal Strategy</div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>{board.strategy}</div>
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* Key concepts */}
      <div style={{ display: 'grid', gap: 8 }}>
        {[
          { title: 'Range Advantage', desc: 'You have more hands that connect with the board overall. Enables high-frequency, small c-bets.', color: '#3b82f6' },
          { title: 'Nut Advantage', desc: 'You have more of the strongest possible hands (sets, straights, flushes). Enables polar, large bets.', color: '#8b5cf6' },
          { title: 'When Both Align', desc: 'C-bet at high frequency with small sizing. This is your ideal scenario as PFR.', color: '#22c55e' },
        ].map((c, i) => (
          <div key={i} style={{ background: `${c.color}08`, borderLeft: `3px solid ${c.color}`, borderRadius: 8, padding: '8px 12px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: c.color }}>{c.title}</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{c.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

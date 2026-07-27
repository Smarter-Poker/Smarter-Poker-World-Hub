/**
 * StraddleAnteSolver — Live Poker Straddle & Ante Structure Solutions
 * CRITICAL GAP CLOSER: GTO Wizard supports straddle/ante formats
 * Strategy adjustments for live poker with straddles, antes, and bomb pots
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const STRUCTURES = [
  { name: 'Standard (No Ante)', ante: 0, straddle: false, blinds: '1/2', icon: '■', color: '#22c55e',
    adjustments: [
      { spot: 'Preflop Opens', change: 'Baseline. Standard 2.5-3x opens. No adjustments needed.' },
      { spot: 'Steal Ranges', change: 'Standard steal frequencies. CO/BTN open their normal ranges.' },
      { spot: 'Pot Odds', change: 'Standard pot odds. 1.5bb dead money in the pot from blinds.' },
    ],
    impact: 'Baseline — all other formats compared against this.' },
  { name: 'Button Straddle ($4)', ante: 0, straddle: true, blinds: '1/2/4', icon: '▲', color: '#f59e0b',
    adjustments: [
      { spot: 'Open Sizing', change: '3x straddle = 12 from EP. Smaller opens (2.5x) work from late position.' },
      { spot: 'Position Value', change: 'BTN straddler acts last preflop but first postflop. Mixed blessing — play tighter from straddle.' },
      { spot: '3-Bet Ranges', change: 'Widen 3-bet range vs straddle opens — there\'s more dead money. 3-bet to 3-3.5x the open.' },
    ],
    impact: '+2bb dead money. Increases action and open ranges by ~5%. Play tighter from straddle position.' },
  { name: 'UTG Straddle ($4)', ante: 0, straddle: true, blinds: '1/2/4', icon: '⌁', color: '#ef4444',
    adjustments: [
      { spot: 'Open Sizing', change: '2.5-3x straddle from all positions. UTG straddler has worst position postflop.' },
      { spot: 'UTG Straddle Defense', change: 'Play very tight from straddle position. You\'re OOP with a forced bet — fold 70%+ of hands.' },
      { spot: 'Stealing', change: 'BTN and CO can steal wider — UTG straddle folds most hands. Attack relentlessly.' },
    ],
    impact: '+2bb dead money but from worst position. UTG straddle is -EV for the straddler — exploit it.' },
  { name: 'Big Blind Ante (1bb)', ante: 1, straddle: false, blinds: '1/2 + 1bb ante', icon: '●', color: '#3b82f6',
    adjustments: [
      { spot: 'Open Ranges', change: 'Open 8-10% wider from all positions. The extra ante adds ~0.5bb per player to the pot.' },
      { spot: 'Short Stack Play', change: 'Shove wider. The antes increase your pot equity. At 10bb, shove 60%+ from BTN.' },
      { spot: 'BB Defense', change: 'BB pays the ante + blind. Defend wider since you\'re already invested 3bb. Call with almost any two.' },
    ],
    impact: '+6bb dead money (6-handed). Dramatically increases open ranges and short-stack shove ranges.' },
  { name: 'Bomb Pot ($10 each)', ante: 10, straddle: false, blinds: 'Bomb', icon: '▲', color: '#dc2626',
    adjustments: [
      { spot: 'Preflop', change: 'No preflop action — everyone puts in a fixed amount and sees the flop. Ranges are 100% of hands.' },
      { spot: 'Flop Strategy', change: 'Bet very tight. Everyone has a random hand — only bet strong made hands and huge draws.' },
      { spot: 'Bluffing', change: 'Almost never bluff. Opponents all have random hands — someone always has a piece. Value bet thin.' },
    ],
    impact: 'Every hand is a bomb pot. Huge pots with random ranges. Play tight, value bet, never bluff multiway.' },
];

const STRADDLE_MATH = [
  { structure: 'No Straddle', deadMoney: '1.5bb', openSize: '2.5x (5bb)', potPreflop: '~8.5bb', adjust: 'Baseline' },
  { structure: 'BTN Straddle', deadMoney: '3.5bb', openSize: '3x (12bb)', potPreflop: '~18bb', adjust: '+5% opens' },
  { structure: 'UTG Straddle', deadMoney: '3.5bb', openSize: '3x (12bb)', potPreflop: '~18bb', adjust: '+5% opens' },
  { structure: 'BB Ante (1bb)', deadMoney: '7.5bb', openSize: '2.5x (5bb)', potPreflop: '~14.5bb', adjust: '+10% opens' },
  { structure: 'Bomb Pot ($10)', deadMoney: '60bb', openSize: 'N/A', potPreflop: '~60bb', adjust: '100% see flop' },
];

export default function StraddleAnteSolver() {
  const [structIdx, setStructIdx] = useState(0);
  const struct = STRUCTURES[structIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4, background: 'linear-gradient(135deg, #f59e0b, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Straddle & Ante Solver
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 16 }}>Strategy solutions for live poker straddles, antes, and bomb pots.</p>

      {/* Structure Selector */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
        {STRUCTURES.map((s, i) => (
          <button key={i} onClick={() => setStructIdx(i)}
            style={{ padding: '6px 10px', borderRadius: 8, border: structIdx === i ? `2px solid ${s.color}` : '1px solid rgba(255,255,255,0.06)',
              background: structIdx === i ? `${s.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer',
              fontSize: 10, fontWeight: 700, color: structIdx === i ? s.color : '#64748b' }}>
            {s.icon} {s.name}
          </button>
        ))}
      </div>

      <motion.div key={structIdx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        {/* Impact Badge */}
        <div style={{ background: `${struct.color}08`, borderRadius: 10, padding: 12, marginBottom: 14, borderLeft: `3px solid ${struct.color}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: struct.color }}>IMPACT</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{struct.impact}</div>
        </div>

        {/* Adjustments */}
        <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: struct.color, marginBottom: 10 }}>STRATEGY ADJUSTMENTS</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {struct.adjustments.map((a, i) => (
              <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 10, borderLeft: `3px solid ${struct.color}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: struct.color }}>{a.spot}</div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>{a.change}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Math Table */}
        <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>
            STRADDLE / ANTE MATH COMPARISON
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1.2fr 1fr 1fr', padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {['Structure', 'Dead $', 'Open Size', 'Pot Pre', 'Adjust'].map(h => (
              <div key={h} style={{ fontSize: 8, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{h}</div>
            ))}
          </div>
          {STRADDLE_MATH.map((row, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1.2fr 1fr 1fr', padding: '6px 12px',
              borderBottom: '1px solid rgba(255,255,255,0.03)', background: structIdx === i ? `${STRUCTURES[i].color}08` : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
              <span style={{ fontSize: 10, color: '#e2e8f0' }}>{row.structure}</span>
              <span style={{ fontSize: 10, color: '#f59e0b', fontFamily: 'monospace' }}>{row.deadMoney}</span>
              <span style={{ fontSize: 10, color: '#3b82f6', fontFamily: 'monospace' }}>{row.openSize}</span>
              <span style={{ fontSize: 10, color: '#22c55e', fontFamily: 'monospace' }}>{row.potPreflop}</span>
              <span style={{ fontSize: 10, color: '#8b5cf6', fontFamily: 'monospace', fontWeight: 700 }}>{row.adjust}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

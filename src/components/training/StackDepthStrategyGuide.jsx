/**
 * StackDepthStrategyGuide — Strategy by Stack Depth
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * How poker strategy changes at different effective stack depths.
 * Covers short, medium, deep, and ultra-deep stack play.
 */
import React, { useState } from 'react';

const DEPTHS = [
  {
    label: 'Short Stack', range: '10-25 bb', bb: 20, color: '#ef4444',
    overview: 'Push/fold territory. Preflop decisions dominate. Minimal postflop play.',
    preflop: [
      'Open-shove or fold from most positions',
      'Reshove range widens significantly',
      '3-bet jamming replaces standard 3-betting',
      'Limp-shove can be effective from SB',
    ],
    postflop: [
      'Rarely see a flop — most pots are all-in preflop',
      'When you do see a flop, SPR is <2 = commit with top pair+',
      'No multi-street planning needed',
      'Check-shove replaces check-raise',
    ],
    keyHands: 'Any pair, any Ax, any two broadways, suited connectors 56s+',
    tip: 'Use ICM Nash charts for tournament short stacks. In cash, rebuy before reaching this depth.',
  },
  {
    label: 'Medium Stack', range: '25-50 bb', bb: 40, color: '#f59e0b',
    overview: 'Most common tournament depth. Flop decisions are critical. Limited turn/river play.',
    preflop: [
      'Standard open sizes (2-2.5x)',
      '3-bet to ~7-8x or jam',
      'Flatting 3-bets is marginal — prefer 4-bet jam or fold',
      'Wider stealing ranges but careful of reshoves',
    ],
    postflop: [
      'SPR of 3-5 on flop = commit with overpairs+',
      'C-bet smaller (25-33%) to preserve fold equity',
      'One street of betting often commits you',
      'Check-raising is powerful — puts opponent all-in by turn',
    ],
    keyHands: 'Overpairs are gold. Top pair + good kicker is often a stack-off hand.',
    tip: 'This is where tournament poker lives. Master 25-50bb play for MTT success.',
  },
  {
    label: 'Deep Stack', range: '50-150 bb', bb: 100, color: '#10b981',
    overview: 'Standard cash game depth. Full multi-street play. All bet sizes available.',
    preflop: [
      'Standard opening (2.5-3x)',
      '3-bet sizing matters (3-3.5x IP, 4x OOP)',
      'Speculative hands gain value (suited connectors, small pairs)',
      'Position becomes extremely important',
    ],
    postflop: [
      'SPR of 6-10+ = need strong hands to stack off',
      'Multi-street planning essential',
      'Geometric sizing to get stacks in by river',
      'Slow playing strong hands is viable on dry boards',
    ],
    keyHands: 'Sets, straights, flushes become stack-off hands. Top pair is a one-street value hand.',
    tip: 'This is "real" poker. All concepts apply: ranges, blockers, mixed strategies, board coverage.',
  },
  {
    label: 'Ultra-Deep', range: '150-500+ bb', bb: 300, color: '#8b5cf6',
    overview: 'Rare but high-leverage. Implied odds are massive. Speculative hands skyrocket in value.',
    preflop: [
      'Small pairs and suited connectors are premium holdings',
      '3-bet pots create SPRs where top pair is a bluff catcher',
      'Position is worth more than hand strength',
      'Cold 4-bet ranges tighten significantly',
    ],
    postflop: [
      'SPR >15 = even overpairs are just bluff catchers',
      'Set mining is extremely profitable',
      'Pot control is essential with marginal hands',
      'River decisions involve massive portions of stack',
    ],
    keyHands: 'Suited connectors > big cards. 22-55 become monsters for set mining. Position > cards.',
    tip: 'Deep stack play is where the best players separate themselves. Study implied odds extensively.',
  },
];

function StackDepthStrategyGuide() {
  const [selected, setSelected] = useState(2);
  const depth = DEPTHS[selected];

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#14b8a6' }}>Stack Depth Strategy</h3>

        {/* Depth selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {DEPTHS.map((d, i) => (
            <button key={d.label} onClick={() => setSelected(i)} style={{
              flex: 1, padding: '10px 4px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: selected === i ? d.color : 'rgba(255,255,255,0.06)',
              color: selected === i ? '#fff' : 'rgba(255,255,255,0.5)',
              fontSize: 11, fontWeight: 700, textAlign: 'center',
            }}>
              <div>{d.label}</div>
              <div style={{ fontSize: 9, opacity: 0.8, marginTop: 2 }}>{d.range}</div>
            </button>
          ))}
        </div>

        {/* Stack depth visual */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, background: `${depth.color}11`, borderRadius: 10, border: `1px solid ${depth.color}33`, marginBottom: 16 }}>
          <div style={{ width: 50, height: 50, borderRadius: '50%', background: `${depth.color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 16, fontWeight: 900, color: depth.color }}>{depth.bb}</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: depth.color }}>{depth.label}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{depth.overview}</div>
          </div>
        </div>

        {/* Strategy sections */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6', marginBottom: 6 }}>Preflop</div>
            {depth.preflop.map((p, i) => (
              <div key={i} style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, paddingLeft: 8, borderLeft: '2px solid rgba(59,130,246,0.2)', marginBottom: 4 }}>{p}</div>
            ))}
          </div>
          <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#10b981', marginBottom: 6 }}>Postflop</div>
            {depth.postflop.map((p, i) => (
              <div key={i} style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, paddingLeft: 8, borderLeft: '2px solid rgba(16,185,129,0.2)', marginBottom: 4 }}>{p}</div>
            ))}
          </div>
        </div>

        {/* Key hands & tip */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, padding: 10, background: `${depth.color}09`, borderRadius: 8, border: `1px solid ${depth.color}22` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: depth.color, marginBottom: 4 }}>Key Hands</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>{depth.keyHands}</div>
          </div>
          <div style={{ flex: 1, padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', marginBottom: 4 }}>Pro Tip</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>{depth.tip}</div>
          </div>
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Stack Depth Guide failed to load: {err.message}</div>;
  }
}

export default StackDepthStrategyGuide;

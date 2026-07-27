/**
 * StackToRatioCalc — GTO Wizard-Style SPR Calculator & Strategy Guide
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Calculate stack-to-pot ratios and understand how SPR affects postflop
 * strategy. Shows commitment thresholds and hand strength requirements.
 */
import React, { useState, useMemo } from 'react';

const SPR_ZONES = [
  { max: 1, label: 'Ultra Low', color: '#ef4444', strategy: 'Commit with any pair or draw. Pot is laying huge odds. Shove or fold mentality.', hands: 'Any pair, any draw, Ace-high' },
  { max: 3, label: 'Low', color: '#f59e0b', strategy: 'Top pair is a strong commit hand. Sets are the nuts. Draws can get it in with fold equity.', hands: 'Top pair+, strong draws, overpairs' },
  { max: 6, label: 'Medium-Low', color: '#eab308', strategy: 'Need top pair good kicker+ to stack off. Sets and two pair are premium. Draws need implied odds.', hands: 'TPGK+, sets, two pair, nut draws' },
  { max: 10, label: 'Medium', color: '#22c55e', strategy: 'Multi-street planning matters. Can bluff multiple streets. Sets and two pair preferred for stacking.', hands: 'Two pair+, sets, nut draws with backup equity' },
  { max: 16, label: 'Medium-High', color: '#3b82f6', strategy: 'Deep play. Position and skill edge maximized. Implied odds for speculative hands are excellent.', hands: 'Sets+, nut straights/flushes for full stacks' },
  { max: Infinity, label: 'Deep', color: '#8b5cf6', strategy: 'Ultra-deep play. Speculative hands gain massive value. Avoid one-pair stacking. Implied odds dominate.', hands: 'Nut hands only for full stacks. Spec hands for implied odds.' },
];

const PREFLOP_SCENARIOS = [
  { name: 'Single Raised (2.5bb open, BB call)', pot: 5.5, stack: 97.5, spr: 17.7 },
  { name: '3-Bet Pot (8bb 3bet, call)', pot: 16.5, stack: 92, spr: 5.6 },
  { name: '4-Bet Pot (22bb 4bet, call)', pot: 44.5, stack: 78, spr: 1.8 },
  { name: 'Limped Pot (SB/BB)', pot: 2, stack: 99, spr: 49.5 },
  { name: 'Squeeze Pot (12bb squeeze, call)', pot: 28, stack: 88, spr: 3.1 },
  { name: 'Min-Raise + Call (2bb + 2bb)', pot: 4.5, stack: 98, spr: 21.8 },
];

function StackToRatioCalc() {
  const [stack, setStack] = useState(100);
  const [pot, setPot] = useState(10);

  const calc = useMemo(() => {
    const spr = pot > 0 ? Math.round((stack / pot) * 10) / 10 : 0;
    const zone = SPR_ZONES.find(z => spr <= z.max) || SPR_ZONES[SPR_ZONES.length - 1];
    const commitThreshold = pot > 0 ? Math.round((stack / (stack + pot)) * 100) : 0;
    const potCommitBet = Math.round(stack / 3 * 10) / 10;

    return { spr, zone, commitThreshold, potCommitBet };
  }, [stack, pot]);

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#06b6d4' }}>Stack-to-Pot Ratio Calculator</h3>

        {/* Inputs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Effective Stack (bb)</div>
            <input type="range" min={5} max={300} step={5} value={stack} onChange={e => setStack(parseInt(e.target.value))} style={{ width: '100%', accentColor: '#06b6d4' }} />
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', textAlign: 'center' }}>{stack} bb</div>
          </div>
          <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Pot Size (bb)</div>
            <input type="range" min={1} max={100} step={1} value={pot} onChange={e => setPot(parseInt(e.target.value))} style={{ width: '100%', accentColor: '#06b6d4' }} />
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', textAlign: 'center' }}>{pot} bb</div>
          </div>
        </div>

        {/* SPR Display */}
        <div style={{ textAlign: 'center', padding: 16, background: `${calc.zone.color}15`, borderRadius: 10, border: `1px solid ${calc.zone.color}30`, marginBottom: 16 }}>
          <div style={{ fontSize: 42, fontWeight: 900, color: calc.zone.color }}>{calc.spr}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: calc.zone.color, marginBottom: 4 }}>{calc.zone.label} SPR</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Equity needed to commit: ~{calc.commitThreshold}%</div>
        </div>

        {/* Strategy Guide */}
        <div style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 16, borderLeft: `4px solid ${calc.zone.color}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: calc.zone.color, marginBottom: 6 }}>Strategy at {calc.zone.label} SPR</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, marginBottom: 6 }}>{calc.zone.strategy}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Stack-off hands: {calc.zone.hands}</div>
        </div>

        {/* SPR Zone Visualization */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 6 }}>SPR Zones</div>
          <div style={{ display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
            {SPR_ZONES.filter(z => z.max !== Infinity).map((z, i) => (
              <div key={i} style={{
                flex: z.max - (i > 0 ? SPR_ZONES[i - 1].max : 0),
                background: z.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 700, color: '#fff',
                borderRight: '1px solid rgba(0,0,0,0.3)',
              }}>{z.label}</div>
            ))}
            <div style={{ flex: 4, background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff' }}>Deep</div>
          </div>
          {calc.spr <= 20 && (
            <div style={{ position: 'relative', height: 12 }}>
              <div style={{
                position: 'absolute',
                left: `${Math.min((calc.spr / 20) * 100, 100)}%`,
                transform: 'translateX(-50%)',
                fontSize: 14, color: '#fff',
              }}>●</div>
            </div>
          )}
        </div>

        {/* Common Scenarios */}
        <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 6 }}>Common Preflop Scenarios (100bb deep)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {PREFLOP_SCENARIOS.map((s, i) => {
            const zone = SPR_ZONES.find(z => s.spr <= z.max);
            return (
              <div key={i} onClick={() => { setPot(Math.round(s.pot)); setStack(Math.round(s.stack)); }} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 6,
                cursor: 'pointer', borderLeft: `3px solid ${zone?.color || '#666'}`,
              }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>{s.name}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: zone?.color || '#fff' }}>SPR {s.spr}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>SPR Calculator failed to load: {err.message}</div>;
  }
}

export default StackToRatioCalc;

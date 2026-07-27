/**
 * POT ODDS CALCULATOR
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Calculate pot odds, implied odds, and required equity:
 * - Interactive pot/bet size inputs
 * - Pot odds percentage calculation
 * - Implied odds with future street projections
 * - Common draw outs and equity
 * - Break-even analysis
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useMemo } from 'react';

// ●●● COMMON DRAWS ●●●
const DRAWS = [
  { name: 'Flush Draw', outs: 9, flop: 35, turn: 19.6, desc: '9 suited cards remaining' },
  { name: 'Open-Ended Straight', outs: 8, flop: 31.5, turn: 17.4, desc: '8 cards to complete' },
  { name: 'Gutshot Straight', outs: 4, flop: 16.5, turn: 8.7, desc: '4 cards to complete' },
  { name: 'Flush + Gutshot', outs: 12, flop: 45, turn: 26.1, desc: '12 combined outs' },
  { name: 'Flush + OESD', outs: 15, flop: 54.1, turn: 32.6, desc: '15 combined outs' },
  { name: 'Overcards (2)', outs: 6, flop: 24.1, turn: 13, desc: '6 cards to pair' },
  { name: 'Set to Full House', outs: 7, flop: 27.8, turn: 15.2, desc: '7 cards improve' },
  { name: 'Two Pair to Full House', outs: 4, flop: 16.5, turn: 8.7, desc: '4 cards improve' },
  { name: 'One Overcard', outs: 3, flop: 12.5, turn: 6.5, desc: '3 cards to pair' },
  { name: 'Runner-Runner Flush', outs: 0, flop: 4.2, turn: 0, desc: 'Backdoor flush' },
];

// ●●● PRESET SCENARIOS ●●●
const PRESETS = [
  { name: 'Half Pot Bet', pot: 100, bet: 50, label: '½ pot' },
  { name: '2/3 Pot Bet', pot: 100, bet: 67, label: '⅔ pot' },
  { name: 'Pot-Size Bet', pot: 100, bet: 100, label: 'Pot' },
  { name: '1.5x Overbet', pot: 100, bet: 150, label: '1.5x' },
  { name: '2x Overbet', pot: 100, bet: 200, label: '2x pot' },
  { name: 'Min-Bet', pot: 100, bet: 25, label: '¼ pot' },
];

// ●●● MAIN COMPONENT ●●●
export default function PotOddsCalculator() {
  const [potSize, setPotSize] = useState(100);
  const [betSize, setBetSize] = useState(50);
  const [impliedExtra, setImpliedExtra] = useState(0);
  const [selectedDraw, setSelectedDraw] = useState(null);
  const [street, setStreet] = useState('flop'); // flop | turn

  const calculations = useMemo(() => {
    const totalPot = potSize + betSize;
    const potOdds = totalPot > 0 ? (betSize / (totalPot + betSize)) * 100 : 0;
    const potOddsRatio = betSize > 0 ? ((totalPot) / betSize).toFixed(1) : '∞';
    const breakEven = potOdds;

    // Implied odds
    const impliedPot = totalPot + impliedExtra;
    const impliedOdds = impliedPot > 0 ? (betSize / (impliedPot + betSize)) * 100 : 0;

    // Bet as percentage of pot
    const betPctOfPot = potSize > 0 ? ((betSize / potSize) * 100).toFixed(0) : 0;

    return { totalPot, potOdds, potOddsRatio, breakEven, impliedOdds, betPctOfPot };
  }, [potSize, betSize, impliedExtra]);

  try {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>Pot Odds Calculator</h3>
          <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>Calculate pot odds, implied odds, and required equity to call</div>
        </div>

        {/* Presets */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto' }}>
          {PRESETS.map(p => (
            <button key={p.name} onClick={() => { setPotSize(p.pot); setBetSize(p.bet); }} style={{
              padding: '5px 10px', borderRadius: 5, cursor: 'pointer',
              background: potSize === p.pot && betSize === p.bet ? 'rgba(59,130,246,0.15)' : 'rgba(0,0,0,0.15)',
              border: potSize === p.pot && betSize === p.bet ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
              color: potSize === p.pot && betSize === p.bet ? '#3b82f6' : '#94a3b8', fontSize: 10, fontWeight: 600,
            }}>{p.label}</button>
          ))}
        </div>

        {/* Input sliders */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: '#64748b', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>Pot Size</span>
              <span style={{ color: '#f59e0b', fontSize: 12, fontWeight: 800 }}>{potSize}</span>
            </div>
            <input type="range" min={10} max={500} value={potSize} onChange={e => setPotSize(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#f59e0b', height: 4, cursor: 'pointer' }} />
          </div>
          <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: '#64748b', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>Bet to Call</span>
              <span style={{ color: '#ef4444', fontSize: 12, fontWeight: 800 }}>{betSize}</span>
            </div>
            <input type="range" min={1} max={500} value={betSize} onChange={e => setBetSize(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#ef4444', height: 4, cursor: 'pointer' }} />
          </div>
        </div>

        {/* Implied odds slider */}
        <div style={{ background: 'rgba(0,0,0,0.1)', borderRadius: 8, padding: 10, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: '#64748b', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>Implied Odds (Extra Value on Future Streets)</span>
            <span style={{ color: '#a78bfa', fontSize: 12, fontWeight: 800 }}>+{impliedExtra}</span>
          </div>
          <input type="range" min={0} max={500} value={impliedExtra} onChange={e => setImpliedExtra(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#a78bfa', height: 4, cursor: 'pointer' }} />
        </div>

        {/* Results */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16 }}>
          {[
            { label: 'Pot Odds', value: `${calculations.potOdds.toFixed(1)}%`, color: '#22c55e' },
            { label: 'Ratio', value: `${calculations.potOddsRatio}:1`, color: '#3b82f6' },
            { label: 'Break-Even Eq', value: `${calculations.breakEven.toFixed(1)}%`, color: '#f59e0b' },
            { label: 'Implied Odds', value: `${calculations.impliedOdds.toFixed(1)}%`, color: '#a78bfa' },
          ].map((r, i) => (
            <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: 10, textAlign: 'center' }}>
              <div style={{ color: '#64748b', fontSize: 7, fontWeight: 600, textTransform: 'uppercase' }}>{r.label}</div>
              <div style={{ color: r.color, fontSize: 20, fontWeight: 800 }}>{r.value}</div>
            </div>
          ))}
        </div>

        {/* Visual pot breakdown */}
        <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 10, marginBottom: 16 }}>
          <div style={{ color: '#64748b', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Pot Breakdown</div>
          <div style={{ display: 'flex', gap: 2, height: 24, borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ width: `${(potSize / (calculations.totalPot + betSize)) * 100}%`, background: '#22c55e', opacity: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#fff', fontSize: 7, fontWeight: 700 }}>Pot: {potSize}</span>
            </div>
            <div style={{ width: `${(betSize / (calculations.totalPot + betSize)) * 100}%`, background: '#ef4444', opacity: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#fff', fontSize: 7, fontWeight: 700 }}>Bet: {betSize}</span>
            </div>
            <div style={{ width: `${(betSize / (calculations.totalPot + betSize)) * 100}%`, background: '#3b82f6', opacity: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#fff', fontSize: 7, fontWeight: 700 }}>Call: {betSize}</span>
            </div>
          </div>
          <div style={{ color: '#94a3b8', fontSize: 9, marginTop: 4, textAlign: 'center' }}>
            Bet is {calculations.betPctOfPot}% of pot — you need {calculations.breakEven.toFixed(1)}% equity to call
          </div>
        </div>

        {/* Street toggle */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          {['flop', 'turn'].map(s => (
            <button key={s} onClick={() => setStreet(s)} style={{
              padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
              background: street === s ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
              border: street === s ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
              color: street === s ? '#3b82f6' : '#64748b', fontSize: 10, fontWeight: 600,
            }}>{s === 'flop' ? 'Flop (2 cards)' : 'Turn (1 card)'}</button>
          ))}
        </div>

        {/* Common draws table */}
        <div style={{ background: 'rgba(0,0,0,0.1)', borderRadius: 8, padding: 10 }}>
          <div style={{ color: '#64748b', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Common Draws — Equity vs Required {calculations.breakEven.toFixed(1)}%</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {DRAWS.map(draw => {
              const equity = street === 'flop' ? draw.flop : draw.turn;
              const profitable = equity >= calculations.breakEven;
              const withImplied = equity >= calculations.impliedOdds;
              return (
                <div key={draw.name} onClick={() => setSelectedDraw(selectedDraw === draw.name ? null : draw.name)} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 4, cursor: 'pointer',
                  background: selectedDraw === draw.name ? 'rgba(59,130,246,0.08)' : 'transparent',
                }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: profitable ? '#22c55e' : withImplied ? '#f59e0b' : '#ef4444',
                    flexShrink: 0,
                  }} />
                  <span style={{ color: '#f1f5f9', fontSize: 10, fontWeight: 600, flex: 1 }}>{draw.name}</span>
                  <span style={{ color: '#64748b', fontSize: 9 }}>{draw.outs > 0 ? `${draw.outs} outs` : ''}</span>
                  <span style={{ color: profitable ? '#22c55e' : '#ef4444', fontSize: 11, fontWeight: 800, width: 40, textAlign: 'right' }}>
                    {equity.toFixed(1)}%
                  </span>
                  <span style={{
                    padding: '1px 5px', borderRadius: 3, fontSize: 7, fontWeight: 700,
                    background: profitable ? 'rgba(34,197,94,0.1)' : withImplied ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                    color: profitable ? '#22c55e' : withImplied ? '#f59e0b' : '#ef4444',
                  }}>
                    {profitable ? 'CALL' : withImplied ? 'IMPLIED' : 'FOLD'}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8, justifyContent: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
              <span style={{ color: '#94a3b8', fontSize: 8 }}>Profitable call</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b' }} />
              <span style={{ color: '#94a3b8', fontSize: 8 }}>Needs implied odds</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
              <span style={{ color: '#94a3b8', fontSize: 8 }}>Not enough equity</span>
            </span>
          </div>
        </div>
      </div>
    );
  } catch (err) {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, margin: 0 }}>Pot Odds Calculator</h3>
        <p style={{ color: '#64748b', fontSize: 13 }}>Component loading... Please refresh if this persists.</p>
      </div>
    );
  }
}

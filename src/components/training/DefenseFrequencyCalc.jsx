/**
 * DefenseFrequencyCalc — GTO Wizard-Style MDF & Defense Frequency Calculator
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Calculate minimum defense frequencies, alpha values, and optimal
 * defend/fold ratios for any bet sizing. Interactive with visual breakdowns.
 */
import React, { useState, useMemo } from 'react';

const COMMON_SIZINGS = [
  { label: '¼ Pot', pct: 25 },
  { label: '⅓ Pot', pct: 33 },
  { label: '½ Pot', pct: 50 },
  { label: '⅔ Pot', pct: 67 },
  { label: '¾ Pot', pct: 75 },
  { label: 'Pot', pct: 100 },
  { label: '1.5x Pot', pct: 150 },
  { label: '2x Pot', pct: 200 },
];

const STREET_SCENARIOS = [
  { name: 'Flop vs 33% C-Bet', street: 'Flop', betPct: 33, potSize: 6, villainRange: 'Wide (65%)', heroDefense: 'Call with all pairs, draws, overcards. Fold bottom of range.' },
  { name: 'Turn vs 67% Barrel', street: 'Turn', betPct: 67, potSize: 14, villainRange: 'Polarizing (45%)', heroDefense: 'Call with top pair+, strong draws. Fold weak pairs, missed draws.' },
  { name: 'River vs Pot Overbet', street: 'River', betPct: 150, potSize: 32, villainRange: 'Very Polarized (25%)', heroDefense: 'Call with two pair+, strong blockers. Fold most one pair.' },
  { name: 'River vs 33% Thin Value', street: 'River', betPct: 33, potSize: 20, villainRange: 'Merged (60%)', heroDefense: 'Call very wide — villain bets thin. Only fold pure air.' },
];

function DefenseFrequencyCalc() {
  const [betPct, setBetPct] = useState(67);
  const [potSize, setPotSize] = useState(10);
  const [showScenarios, setShowScenarios] = useState(false);

  const calc = useMemo(() => {
    const betSize = potSize * betPct / 100;
    const totalPot = potSize + betSize;
    const potOdds = betSize / (totalPot + betSize);
    const potOddsPct = Math.round(potOdds * 100 * 10) / 10;
    const alpha = betSize / (potSize + betSize);
    const alphaPct = Math.round(alpha * 100 * 10) / 10;
    const mdf = 1 - alpha;
    const mdfPct = Math.round(mdf * 100 * 10) / 10;
    const breakEvenEquity = Math.round(potOdds * 100 * 10) / 10;
    const ratio = `${(potSize + betSize).toFixed(1)} : ${betSize.toFixed(1)}`;
    const foldPct = Math.round((1 - mdf) * 100 * 10) / 10;

    // How much villain needs to win to profit from bluff
    const bluffProfit = potSize * alpha - betSize * mdf;
    const bluffProfitable = bluffProfit > 0;

    return { betSize, totalPot, potOddsPct, alphaPct, mdfPct, breakEvenEquity, ratio, foldPct, bluffProfit: bluffProfit.toFixed(2), bluffProfitable };
  }, [betPct, potSize]);

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#2dd4bf' }}>Defense Frequency Calculator</h3>
          <button onClick={() => setShowScenarios(!showScenarios)} style={{
            padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: showScenarios ? '#2dd4bf' : 'rgba(255,255,255,0.08)',
            color: showScenarios ? '#000' : 'rgba(255,255,255,0.7)',
          }}>Scenarios</button>
        </div>

        {/* Quick Sizing Buttons */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {COMMON_SIZINGS.map(s => (
            <button key={s.label} onClick={() => setBetPct(s.pct)} style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: betPct === s.pct ? '#2dd4bf' : 'rgba(255,255,255,0.06)',
              color: betPct === s.pct ? '#000' : 'rgba(255,255,255,0.6)', border: 'none',
            }}>{s.label}</button>
          ))}
        </div>

        {/* Sliders */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Bet Size (% of pot)</div>
            <input type="range" min={10} max={300} step={5} value={betPct} onChange={e => setBetPct(parseInt(e.target.value))} style={{ width: '100%', accentColor: '#2dd4bf' }} />
            <div style={{ fontSize: 20, fontWeight: 800, color: '#2dd4bf', textAlign: 'center' }}>{betPct}%</div>
          </div>
          <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Pot Size (bb)</div>
            <input type="range" min={2} max={100} step={1} value={potSize} onChange={e => setPotSize(parseInt(e.target.value))} style={{ width: '100%', accentColor: '#2dd4bf' }} />
            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', textAlign: 'center' }}>{potSize} bb</div>
          </div>
        </div>

        {/* MDF Visual Bar */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#2dd4bf' }}>Minimum Defense Frequency</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: '#2dd4bf' }}>{calc.mdfPct}%</span>
          </div>
          <div style={{ height: 24, borderRadius: 6, overflow: 'hidden', display: 'flex' }}>
            <div style={{ width: `${calc.mdfPct}%`, background: 'linear-gradient(90deg, #2dd4bf, #14b8a6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#000' }}>
              Defend {calc.mdfPct}%
            </div>
            <div style={{ width: `${calc.foldPct}%`, background: 'linear-gradient(90deg, #ef4444, #dc2626)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>
              Fold {calc.foldPct}%
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Bet Size', value: `${calc.betSize.toFixed(1)} bb`, color: '#fff' },
            { label: 'Pot Odds', value: `${calc.potOddsPct}%`, color: '#3b82f6' },
            { label: 'Break-Even Eq', value: `${calc.breakEvenEquity}%`, color: '#f59e0b' },
            { label: 'Alpha (Fold%)', value: `${calc.alphaPct}%`, color: '#ef4444' },
            { label: 'Pot Odds Ratio', value: calc.ratio, color: '#8b5cf6' },
            { label: 'Bluff Profit', value: `${calc.bluffProfit} bb`, color: calc.bluffProfitable ? '#10b981' : '#ef4444' },
          ].map(s => (
            <div key={s.label} style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Scenarios */}
        {showScenarios && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#2dd4bf', marginBottom: 4 }}>Common Scenarios</div>
            {STREET_SCENARIOS.map((s, i) => {
              const bet = s.potSize * s.betPct / 100;
              const alpha = bet / (s.potSize + bet);
              const mdf = Math.round((1 - alpha) * 100);
              return (
                <div key={i} onClick={() => { setBetPct(s.betPct); setPotSize(s.potSize); }} style={{
                  padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, cursor: 'pointer',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{s.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#2dd4bf' }}>MDF: {mdf}%</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>Villain range: {s.villainRange}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{s.heroDefense}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Defense Frequency Calculator failed to load: {err.message}</div>;
  }
}

export default DefenseFrequencyCalc;

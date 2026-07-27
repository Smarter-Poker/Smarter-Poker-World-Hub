/**
 * FoldEquityCalc — GTO Wizard-Style Fold Equity Calculator
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Calculate how much fold equity you need for bluffs to be profitable.
 * Shows breakeven fold %, EV of bluffing, and semi-bluff analysis.
 */
import React, { useState, useMemo } from 'react';

const BLUFF_SCENARIOS = [
  { name: 'C-Bet Bluff (Flop)', betPct: 33, foldPct: 55, equity: 15, description: 'Flop c-bet with air. High fold frequency expected on many textures.' },
  { name: 'Double Barrel (Turn)', betPct: 67, foldPct: 45, equity: 12, description: 'Turn barrel with missed draw. Villain folded weak hands on flop already.' },
  { name: 'River Bluff (Missed Draw)', betPct: 75, foldPct: 35, equity: 0, description: 'River bluff with no equity. Pure bluff — need high fold rate.' },
  { name: 'Semi-Bluff (Flush Draw)', betPct: 67, foldPct: 40, equity: 35, description: 'Turn bet with flush draw. Even if called, 35% equity to improve.' },
  { name: 'Overbet Bluff (River)', betPct: 150, foldPct: 50, equity: 0, description: 'Large overbet on river. Polarizing — villain must defend less.' },
  { name: 'Squeeze Bluff (Preflop)', betPct: 300, foldPct: 60, equity: 25, description: '3-bet squeeze preflop. Fold equity from multiple players.' },
];

function FoldEquityCalc() {
  const [betPct, setBetPct] = useState(67);
  const [potSize, setPotSize] = useState(10);
  const [equityWhenCalled, setEquityWhenCalled] = useState(15);
  const [villainFoldPct, setVillainFoldPct] = useState(45);

  const calc = useMemo(() => {
    const bet = potSize * betPct / 100;
    const risk = bet;
    const reward = potSize;

    // Breakeven fold % with no equity
    const breakEvenPure = risk / (risk + reward);
    const breakEvenPurePct = Math.round(breakEvenPure * 1000) / 10;

    // Adjusted breakeven with equity when called
    const eqDecimal = equityWhenCalled / 100;
    const evWhenCalled = eqDecimal * (reward + bet) - (1 - eqDecimal) * bet;
    const breakEvenAdj = evWhenCalled >= 0 ? 0 : (-evWhenCalled) / (reward - evWhenCalled);
    const breakEvenAdjPct = Math.max(0, Math.round(breakEvenAdj * 1000) / 10);

    // EV of bluffing
    const fold = villainFoldPct / 100;
    const evFold = fold * reward;
    const evCall = (1 - fold) * evWhenCalled;
    const totalEV = evFold + evCall;
    const totalEVRounded = Math.round(totalEV * 100) / 100;

    // Fold equity contribution
    const foldEquityBB = Math.round(fold * reward * 100) / 100;
    const equityContrib = Math.round((1 - fold) * eqDecimal * (reward + bet) * 100) / 100;

    return { breakEvenPurePct, breakEvenAdjPct, totalEV: totalEVRounded, foldEquityBB, equityContrib, bet: Math.round(bet * 10) / 10, profitable: totalEV > 0 };
  }, [betPct, potSize, equityWhenCalled, villainFoldPct]);

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#c084fc' }}>Fold Equity Calculator</h3>

        {/* Quick Scenarios */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
          {BLUFF_SCENARIOS.map(s => (
            <button key={s.name} onClick={() => { setBetPct(s.betPct); setVillainFoldPct(s.foldPct); setEquityWhenCalled(s.equity); }} style={{
              padding: '4px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
              background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: 'none',
            }}>{s.name}</button>
          ))}
        </div>

        {/* Sliders */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Bet Size (% pot)', value: betPct, set: setBetPct, min: 10, max: 300, step: 5, color: '#c084fc', display: `${betPct}%` },
            { label: 'Pot Size (bb)', value: potSize, set: setPotSize, min: 2, max: 100, step: 1, color: '#fff', display: `${potSize} bb` },
            { label: 'Equity When Called', value: equityWhenCalled, set: setEquityWhenCalled, min: 0, max: 50, step: 1, color: '#3b82f6', display: `${equityWhenCalled}%` },
            { label: 'Villain Fold %', value: villainFoldPct, set: setVillainFoldPct, min: 0, max: 100, step: 1, color: '#f59e0b', display: `${villainFoldPct}%` },
          ].map(s => (
            <div key={s.label} style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>{s.label}</div>
              <input type="range" min={s.min} max={s.max} step={s.step} value={s.value} onChange={e => s.set(parseInt(e.target.value))} style={{ width: '100%', accentColor: s.color }} />
              <div style={{ fontSize: 14, fontWeight: 800, color: s.color, textAlign: 'center' }}>{s.display}</div>
            </div>
          ))}
        </div>

        {/* EV Result */}
        <div style={{
          textAlign: 'center', padding: 16, borderRadius: 10, marginBottom: 16,
          background: calc.profitable ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${calc.profitable ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
        }}>
          <div style={{ fontSize: 32, fontWeight: 900, color: calc.profitable ? '#10b981' : '#ef4444' }}>
            {calc.totalEV > 0 ? '+' : ''}{calc.totalEV} bb
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: calc.profitable ? '#10b981' : '#ef4444' }}>
            {calc.profitable ? 'Profitable Bluff' : 'Unprofitable Bluff'}
          </div>
        </div>

        {/* Breakdowns */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Bet Size', value: `${calc.bet} bb`, color: '#c084fc' },
            { label: 'BE Fold% (Pure)', value: `${calc.breakEvenPurePct}%`, color: '#ef4444' },
            { label: 'BE Fold% (w/ Eq)', value: `${calc.breakEvenAdjPct}%`, color: '#f59e0b' },
            { label: 'Fold Equity', value: `+${calc.foldEquityBB} bb`, color: '#10b981' },
            { label: 'Equity Contrib', value: `+${calc.equityContrib} bb`, color: '#3b82f6' },
          ].map(s => (
            <div key={s.label} style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Fold % vs EV Visual */}
        <div style={{ padding: 10, background: 'rgba(192,132,252,0.06)', borderRadius: 8, border: '1px solid rgba(192,132,252,0.12)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#c084fc', marginBottom: 6 }}>How It Works</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>
            When villain folds ({villainFoldPct}%), you win the {potSize}bb pot.
            When called ({100 - villainFoldPct}%), you have {equityWhenCalled}% equity in a {potSize + calc.bet * 2}bb pot.
            {equityWhenCalled > 0
              ? ` Semi-bluff breakeven: villain needs to fold only ${calc.breakEvenAdjPct}% (vs ${calc.breakEvenPurePct}% for pure bluff).`
              : ` Pure bluff: villain must fold ≥${calc.breakEvenPurePct}% for profit.`}
          </div>
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Fold Equity Calculator failed to load: {err.message}</div>;
  }
}

export default FoldEquityCalc;
